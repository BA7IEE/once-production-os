import { mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { run } from './resource-lifecycle.mjs';

// One private journal per run. Never infer ownership from historical names.
export class ResourceRun {
  constructor({ simulation = false } = {}) {
    this.id = randomBytes(12).toString('hex');
    this.directory = resolve('data/local-resource-runs', this.id);
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    this.controller = new AbortController();
    this.interrupt = () => this.controller.abort();
    process.on('SIGINT', this.interrupt); process.on('SIGTERM', this.interrupt);
    this.record = { simulation, id: this.id, pid: process.pid, started: new Date().toISOString(), containers: [], networks: [], temporaryVolumes: [], status: 'REGISTERED' };
    this.save();
  }
  save() { writeFileSync(join(this.directory, 'run.json'), JSON.stringify(this.record, null, 2)+'\n', { mode: 0o600 }); }
  check() { this.controller.signal.throwIfAborted(); }
  async command(command, args, options = {}) {
    this.check();
    return run(command, args, { ...options, signal: this.controller.signal, env: { ...(options.env ?? process.env), ONCE_RESOURCE_RUN_DIR: this.directory } });
  }
  registerContainer(name, label) { this.record.containers.push({ name, label, creation:'ATTEMPTED' }); this.save(); }
  confirmContainer(name) { this.record.containers.find(c=>c.name===name).creation='CONFIRMED';this.save(); }
  async cleanup(command = run) {
    try { return await this.cleanupRegistered(command); }
    catch(error) {
      this.record.status='CLEANUP_FAILED';
      this.record.remaining ??= {containers:'UNKNOWN',processes:'UNKNOWN',networks:0,temporaryVolumes:0};
      try{this.save();}catch{}
      throw error;
    } finally { process.off('SIGINT',this.interrupt);process.off('SIGTERM',this.interrupt); }
  }
  async cleanupRegistered(command) {
    let failed = false;
    try {
      // Cleanup deliberately does not inherit cancellation.
      for (const { name, label, creation } of this.record.containers) {
        const filters = ['--filter', `name=^/${name}$`, '--filter', `label=${label}`];
        const ids = await command('docker', ['ps', '-aq', ...filters], { capture: true, timeout: 10000 });
        if (!ids && creation==='ATTEMPTED') throw new Error('RESOURCE_UNKNOWN: creation response unknown; retain lock rather than assume absence.');
        if (ids) {
          // --rm removal may complete after stop returns, or before its reply.
          // A failed stop reply is resolved only by readback of this observed resource.
          try { await command('docker', ['stop', '--time', '5', ...ids.split(/\s+/)], { capture: true, timeout: 15000 }); }
          catch { /* absence below must still be proven; cancellation is not inherited */ }
          const deadline=Date.now()+5000;
          let remaining;
          do {
            remaining=await command('docker', ['ps', '-aq', ...filters], { capture: true, timeout: 10000 });
            if(!remaining)break;
            await new Promise(resolve=>setTimeout(resolve,100));
          } while(Date.now()<deadline);
          if(remaining)throw new Error('RESOURCE_LEAK: container remains');
        }
      }
    } catch { failed = true; }
    // Nested supervisors publish process groups into this same journal.
    const records = readdirSync(this.directory).filter(n => /^process-\d+\.json$/.test(n)).map(n => JSON.parse(readFileSync(join(this.directory,n),'utf8')));
    const groups = records.map(record => record.pgid);
    for (const {pgid,status} of records) {
      if(status==='KILL_SENT') continue;
      try { process.kill(-pgid, 'SIGKILL'); } catch (error) { if (!['ESRCH','EPERM'].includes(error.code)) failed = true; }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    let live;
    try { live = groups.length ? execFileSync('ps', ['-axo', 'pid=,pgid=,stat='], { encoding:'utf8', timeout:5000 }).split('\n').filter(line => {
      const [, group, state] = line.trim().split(/\s+/); return groups.includes(Number(group)) && state && !state.startsWith('Z');
    }).length : 0; } catch { failed=true; live='UNKNOWN'; }
    if (live) failed = true;
    const browserRecords=readdirSync(this.directory).filter(n=>/^browser-[a-f0-9-]+\.json$/.test(n));
    const unresolvedBrowserLaunches=browserRecords.filter(name=>JSON.parse(readFileSync(join(this.directory,name),'utf8')).status!=='CLOSED').length;
    // Launch can fail before Playwright exposes a PID. An unresolved intent cannot prove absence.
    if(unresolvedBrowserLaunches)failed=true;
    let directories=0;const temporaryRecords=readdirSync(this.directory).filter(n=>/^temporary-[a-f0-9-]+\.json$/.test(n));
    for(const name of temporaryRecords){
      const item=JSON.parse(readFileSync(join(this.directory,name),'utf8'));
      if(typeof item.path!=='string'||!item.path.startsWith(this.directory+'/temp-')||resolve(item.path)!==item.path){failed=true;continue;}
      try{rmSync(item.path,{recursive:true,force:true});if(existsSync(item.path)){directories++;failed=true;}else writeFileSync(join(this.directory,name),JSON.stringify({...item,status:'REMOVED'}),{mode:0o600});}catch{directories++;failed=true;}
    }
    this.record.status = failed ? 'CLEANUP_FAILED' : 'ZERO_RESIDUE';
    if(failed)this.record.outcome='CLEANUP_FAILED';
    this.record.remaining = { containers: failed ? 'UNKNOWN' : 0, processes: live, networks: 0, temporaryVolumes: 0, ...(temporaryRecords.length?{temporaryDirectories:directories}:{}), ...(browserRecords.length?{unresolvedBrowserLaunches}:{}) };
    this.record.finished = new Date().toISOString(); this.save();
    process.off('SIGINT', this.interrupt); process.off('SIGTERM', this.interrupt);
    if (failed) throw new Error('RESOURCE_LEAK: cleanup could not verify zero residue; retain lock and journal.');
    return this.record;
  }
}

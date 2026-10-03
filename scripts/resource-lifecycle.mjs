import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, unlinkSync, rmdirSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Shared across checkouts; stale locks require human investigation, never automatic removal.
export function acquireLock() {
  const dir = join(tmpdir(), 'once-os-heavy.lock');
  mkdirSync(dir, { mode: 0o700 });
  try { writeFileSync(join(dir, 'owner.json'), JSON.stringify({ pid: process.pid, cwd: process.cwd(), started: new Date().toISOString() }), { flag: 'wx', mode: 0o600 }); }
  catch (error) { rmdirSync(dir); throw error; }
  return () => { unlinkSync(join(dir, 'owner.json')); rmdirSync(dir); };
}
export function hostedActionsRunner(platform = process.platform, env = process.env) {
  return platform === 'linux' && env.CI === 'true' && env.GITHUB_ACTIONS === 'true';
}
export function preflight({ platform = process.platform, env = process.env, exec = execFileSync } = {}) {
  if (env.DOCKER_HOST && env.DOCKER_CONTEXT) throw new Error('Ambiguous Docker target.');
  const endpoint = env.DOCKER_HOST || exec('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], { encoding: 'utf8', timeout: 5000 }).trim();
  if (!endpoint.startsWith('unix://')) throw new Error('Only local Unix-socket Docker is permitted.');
  // A disposable Actions runner has its own memory; never bypass the shared-Mac gate.
  if (hostedActionsRunner(platform, env)) return;
  if (platform !== 'darwin') throw new Error('Use macOS or an isolated GitHub Actions runner.');
  const swap = exec('sysctl', ['vm.swapusage'], { encoding: 'utf8', timeout: 5000 });
  const used = Number(/used = ([\d.]+)M/.exec(swap)?.[1]);
  const pressure = exec('sysctl', ['-n', 'kern.memorystatus_vm_pressure_level'], { encoding: 'utf8', timeout: 5000 }).trim();
  if (!Number.isFinite(used) || used > 4096 || pressure !== '1') throw new Error('Heavy task refused: memory pressure or Swap exceeds 4GiB; wait for other tasks to finish.');

}
export async function run(command, args, { env = process.env, timeout = 180000, capture = false, allowFailure = false, signal } = {}) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, detached: true, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    let output='', stopped=false, escalation, cleanupError, killSent=false, finished=false;
    const recordPath=child.pid && env.ONCE_RESOURCE_RUN_DIR ? join(env.ONCE_RESOURCE_RUN_DIR, `process-${child.pid}.json`) : undefined;
    const record={ pgid:child.pid, supervisorPid:process.pid, started:new Date().toISOString(), status:'ACTIVE' };
    const save=()=>{ if(recordPath) writeFileSync(recordPath,JSON.stringify(record),{mode:0o600}); };
    const kill = action => {
      if (!child.pid || killSent) return;
      try { process.kill(-child.pid, action); if(action==='SIGKILL') killSent=true; }
      catch(error) { if(error.code==='ESRCH') killSent=true; else cleanupError=error; }
    };
    const stop=()=>{ if(stopped) return; stopped=true; kill('SIGTERM'); escalation=setTimeout(()=>kill('SIGKILL'),3000); };
    const timer=setTimeout(stop,timeout);
    process.on('SIGINT',stop);process.on('SIGTERM',stop);
    signal?.addEventListener('abort',stop,{once:true});
    const collect=chunk=>{output+=chunk;if(output.length>8*1024*1024)stop();};
    child.stdout?.on('data',collect);child.stderr?.on('data',collect);
    const finish=(error,code)=>{
      if(finished)return;finished=true;
      clearTimeout(timer);clearTimeout(escalation);
      process.off('SIGINT',stop);process.off('SIGTERM',stop);signal?.removeEventListener('abort',stop);
      kill('SIGKILL');
      record.status=killSent?'KILL_SENT':'CLEANUP_FAILED';
      try{save();}catch(e){cleanupError=e;}
      if(cleanupError || stopped || (error&&!allowFailure)) reject(new Error('Child failed, interrupted, timed out or cleanup failed; credentials omitted.'));
      else resolve(allowFailure?{output,code:code??1}:output.trim());
    };
    // Exit happens before close; inherited pipes must not postpone descendant cleanup.
    child.once('exit',()=>{
      kill('SIGKILL');
      // Nested detached groups may still own our output pipes. Kill registered active
      // groups before waiting for close; the outer finally will verify them again.
      if(env.ONCE_RESOURCE_RUN_DIR) {
        try {
          const entries=readdirSync(env.ONCE_RESOURCE_RUN_DIR).filter(n=>/^process-\d+\.json$/.test(n)).map(file=>{const path=join(env.ONCE_RESOURCE_RUN_DIR,file);return {path,item:JSON.parse(readFileSync(path,'utf8'))};});
          const descendants=new Set([child.pid]);
          let changed=true;while(changed){changed=false;for(const {item} of entries){if(descendants.has(item.supervisorPid)&&!descendants.has(item.pgid)){descendants.add(item.pgid);changed=true;}}}
          for(const {path,item} of entries) {
            if(!descendants.has(item.pgid)||item.pgid===child.pid || item.status==='KILL_SENT')continue;
            try{process.kill(-item.pgid,'SIGKILL');item.status='KILL_SENT';writeFileSync(path,JSON.stringify(item),{mode:0o600});}
            catch(error){if(!['ESRCH','EPERM'].includes(error.code))cleanupError=error;}
          }
        }catch(error){cleanupError=error;}
      }
    });
    child.once('error',error=>finish(error));
    child.once('close',code=>finish(code!==0?new Error('Child failed'):undefined,code));
    try{save();}catch(e){cleanupError=e;stop();}
    if(signal?.aborted)stop();
  });
}

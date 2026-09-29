import {spawn} from 'node:child_process';
const commands={
 'migrate':['node_modules/prisma/build/index.js','migrate','deploy'],
 'migration-status':['node_modules/prisma/build/index.js','migrate','status'],
 'bootstrap':['dist/apps/api/src/bootstrap.js'],
 'backup':['--experimental-strip-types','scripts/recovery-backup.ts'],
 'prepare':['--experimental-strip-types','scripts/recovery-prepare.ts'],
 'check':['--experimental-strip-types','scripts/recovery-check.ts'],
 'approve':['--experimental-strip-types','scripts/recovery-approve.ts'],
 'restore-media':['--experimental-strip-types','scripts/recovery-restore-media.ts'],
 'rebuild':['--experimental-strip-types','scripts/rebuild-export.ts']
};
const [name='help',...args]=process.argv.slice(2);
if(name==='help'){console.log('ONCE ops: '+Object.keys(commands).join(', '));console.log('Commands keep existing argument, environment and approval guards. See docs/release/STAGING_EXECUTION.md.');}
else if(!Object.hasOwn(commands,name)){console.error('Unknown maintenance command');process.exitCode=2;}
else{
 const child=spawn(process.execPath,[...commands[name],...args],{stdio:'inherit'});
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
 child.once('error',()=>{console.error('Maintenance command could not start');process.exitCode=1;});
 child.once('exit',(code)=>{process.exitCode=code??1;});
}

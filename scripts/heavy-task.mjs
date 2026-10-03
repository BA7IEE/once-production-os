import { acquireLock, preflight, hostedActionsRunner } from './resource-lifecycle.mjs';
import { ResourceRun } from './resource-run.mjs';
const scope = new ResourceRun();
let release;
try {
  // Hosted Actions jobs own isolated Linux runners; the shared-Mac gate stays mandatory locally.
  if(process.platform==='darwin'){release = acquireLock(); preflight();}
  else if(!hostedActionsRunner())throw new Error('Use a supported owned runner.');
  scope.check();
  const [command, ...args] = process.argv.slice(2);
  if (!command) throw new Error('Supply command and arguments.');
  await scope.command(command, args, { timeout:900000 });
  scope.record.outcome='VERIFIED_PENDING_CLEANUP';
} catch { scope.record.outcome='FAIL'; console.error('Heavy task refused, failed or interrupted; inspect private resource journal.'); process.exitCode=1; }
finally {
  try { await scope.cleanup(); release?.();if(scope.record.outcome==='VERIFIED_PENDING_CLEANUP'){scope.record.outcome='PASS';scope.save();} }
  catch { console.error('RESOURCE_LEAK: retain lock and inspect journal.'); process.exitCode=1; }
}

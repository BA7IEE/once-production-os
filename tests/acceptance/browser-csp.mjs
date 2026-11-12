/** Track directives across navigation. Optional diagnostics contain CSS names only, no URLs or values. */
export async function monitorCsp(context,violations) {
 await context.exposeBinding('__onceReportCsp',async({page},directive)=>{
  violations.push(directive);
  if(process.env.ONCE_ACCEPTANCE_CSP_DIAGNOSTICS==='1'){
   const styles=await page.evaluate(()=>[...document.querySelectorAll('style')].map(style=>({
    selectors:[...new Set([...style.textContent.matchAll(/\.([A-Za-z_-][A-Za-z0-9_-]*)/g)].map(m=>m[1]))].slice(0,20),
    properties:[...new Set([...style.textContent.matchAll(/([a-z-]+)\s*:/g)].map(m=>m[1]))].slice(0,20),
   }))).catch(()=>[]);
   console.info(JSON.stringify({cspDirective:directive,styleDiagnostics:styles}));
  }
 });
 await context.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>{
  void window.__onceReportCsp(event.effectiveDirective);
 }));
}

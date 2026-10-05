import ts from 'typescript';
/** Dedicated pending markers only; never business values, credentials or request bodies. */
export function forbiddenBrowserGlobals(file,text){
 const tree=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS),forbidden=[];
 const literal=(node,value)=>!!node&&ts.isStringLiteral(node)&&node.text===value;
 function allowed(node){
  const portal=file==='apps/admin-web/src/portal-pending-marker.ts';
  if(!portal&&file!=='apps/admin-web/src/pending-marker.ts'||node.text!=='sessionStorage')return false;
  const property=node.parent,call=property?.parent;
  if(!ts.isPropertyAccessExpression(property)||property.expression!==node||!ts.isCallExpression(call)||call.expression!==property||property.questionDotToken||call.questionDotToken)return false;
  const method=property.name.text,args=call.arguments;
  if(portal)return literal(args[0],'once-portal-pending')&&(['getItem','removeItem'].includes(method)&&args.length===1||method==='setItem'&&args.length===2&&ts.isCallExpression(args[1])&&ts.isIdentifier(args[1].expression)&&args[1].expression.text==='encodePortalMarker'&&args[1].arguments.length===1);
  return literal(args[0],'once-pending-command')&&(
   method==='setItem'&&args.length===2&&literal(args[1],'1')||
   ['getItem','removeItem'].includes(method)&&args.length===1);
 }
 function visit(node){if(ts.isIdentifier(node)&&['localStorage','sessionStorage','dangerouslySetInnerHTML','eval'].includes(node.text)&&!allowed(node))forbidden.push({file,name:node.text});ts.forEachChild(node,visit);}
 visit(tree);return forbidden;
}

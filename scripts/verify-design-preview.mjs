/** Cloud-only static review smoke check; not business acceptance. No screenshots. */
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
const server=spawn('python3',['-m','http.server','4319','--bind','127.0.0.1','--directory','dist/web'],{stdio:'ignore'});
let browser;
try{
 for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:4319/preview-provenance.json')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4319/design-review/');
 await page.getByRole('heading',{name:'人才库',exact:true}).waitFor();
 if(!await page.getByText('虚构界面预览 · 不连接后端',{exact:true}).isVisible())throw Error('Missing fictional review boundary');
 if(await page.locator('.ant-menu').evaluate(e=>getComputedStyle(e).listStyleType)!=='none')throw Error('Missing baked styles');
 for(const name of ['作品库','项目','审核','人才库']){await page.getByRole('menuitem',{name,exact:true}).click();await page.getByRole('heading',{name,exact:true}).waitFor();}
 await page.getByLabel('搜索示例',{exact:true}).fill('上海');await page.getByRole('button',{name:'应用筛选',exact:true}).click();
 await page.getByRole('button',{name:'查看详情',exact:true}).first().click();await page.getByRole('heading',{name:'资料概览'}).waitFor();await page.getByRole('button',{name:'返回列表'}).click();
 await page.getByRole('button',{name:'新增示例'}).click();await page.getByLabel('显示名',{exact:true}).fill('虚构界面检查');await page.getByRole('button',{name:'保存示例'}).click();await page.getByText('示例已保存到当前界面；未发送请求，刷新即清除。',{exact:true}).waitFor();
 await page.getByRole('button',{name:'折叠导航'}).click();if(!await page.getByRole('img',{name:'ONCE 品牌图标'}).isVisible())throw Error('Missing collapsed brand');
 if(errors.length)throw Error(errors.join('\n'));
 mkdirSync('artifacts/design-review',{recursive:true});writeFileSync('artifacts/design-review/browser.json',JSON.stringify({head:process.env.ONCE_ACCEPTANCE_SHA,status:'STATIC_REVIEW_VISIBLE',data:'FICTIONAL_NO_BACKEND',checks:['same-origin baked styles','actual shared Shell/Menu/Pro patterns visible','people/work/project/review navigation','in-memory filter/detail/form','collapsed brand'],errors},null,2));
}finally{await browser?.close();server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve));}

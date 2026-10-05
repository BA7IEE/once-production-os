import assert from 'node:assert/strict';
export async function verifyAiPagination({page,owner,t}) {
 for(let i=0;i<104;i++) {const r=await owner.cmd('POST','/ai-grants',{sourceId:t.source,expectedRevision:1,validUntil:'2026-12-01T00:00:00.000Z',evidenceNote:'Synthetic pagination approval',confirmTextOnly:true});assert.equal(r.status,201);}
 const all=(await owner.raw('GET','/ai-grants?page=1&pageSize=20')).body;
 assert.ok(all.total>=105);assert.equal(all.items.some(g=>g.id===t.grant),false);
 await page.getByRole('button',{name:'新建 AI 任务',exact:true}).click();
 const form=page.getByRole('dialog',{name:'确认本次 AI 输入',exact:true}),picker=form.getByRole('group',{name:'已批准的文字来源选择器',exact:true});
 for(let n=2;n<=6;n++)await nextGrantPage(page,picker,n);
 await form.getByLabel('已批准的文字来源',{exact:true}).selectOption(t.grant);
 await picker.getByRole('button',{name:'上一页',exact:true}).click();await picker.getByText('第 5 页',{exact:false}).waitFor();
 assert.equal(await form.getByLabel('已批准的文字来源',{exact:true}).inputValue(),t.grant,'paging must keep chosen grant');
 await form.getByRole('button',{name:'返回',exact:true}).click();
 await page.getByRole('button',{name:'管理文字外送许可',exact:true}).click();
 const grants=page.getByRole('dialog',{name:'文字外送许可',exact:true}).getByRole('region',{name:'已有文字许可',exact:true});
 for(let n=2;n<=6;n++)await nextGrantPage(page,grants,n);
 assert.ok(await grants.getByRole('button',{name:'撤销许可',exact:true}).count()>0);
 await page.getByRole('dialog',{name:'文字外送许可',exact:true}).getByRole('button',{name:'返回',exact:true}).click();
 console.log('PASS AI 105 grants: final page reachable in input and management; selection survives page change');
}

async function nextGrantPage(page,root,n){
 const received=page.waitForResponse(r=>{const url=new URL(r.url());return r.request().method()==='GET'&&url.pathname==='/api/v1/ai-grants'&&url.searchParams.get('page')===String(n);});
 await root.getByRole('button',{name:'下一页',exact:true}).click();const response=await received;assert.equal(response.status(),200);const data=await response.json();assert.equal(data.page,n);assert.ok(data.items.length>0);
 await root.getByText('第 '+n+' 页',{exact:false}).waitFor();
}

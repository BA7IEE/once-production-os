import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {encryptDraftPayload,decryptDraftPayload} from '../../dist/packages/core/src/private-draft-payload.js';
import {validateDocumentProposal,DOCUMENT_PROPOSAL_VERSION} from '../../dist/packages/core/src/document-schema.js';

/** Seed controlled model suggestions into actual native-PDF results. No network
 * route is mocked. Browser commands, images and persistence use the real server. */
export async function browserWorkGrouping({page,prisma,sid,evidence,contactKeyFile}){
 const key=Buffer.from(readFileSync(contactKeyFile,'utf8').trim(),'hex');
 const jobs=(await prisma.talentSubmissionItem.findMany({where:{submissionId:sid,kind:'DOCUMENT_PARSE'}})).filter(j=>j.values.documentMode!=='ALL');
 for(const job of jobs){
  const context=`supplier-document:${job.workspaceId}:${sid}:${job.id}`,payload=JSON.parse(decryptDraftPayload(job.values.ciphertext,key,context)),p=payload.manifest.pages[0];
  payload.proposal=validateDocumentProposal({schemaVersion:DOCUMENT_PROPOSAL_VERSION,documentKind:'PERSON_PROFILE',subjectAssociation:'EXPLICIT_AUTHOR',fields:[],images:[],works:[{key:'case_'+p.page,title:'合成跨页短片 · 第'+p.page+'页',description:'这一页属于同一部品牌短片',roleCode:'director',brandDisplayName:'合成品牌',dateText:'2026',imageKeys:[p.images[0].key],evidence:[{page:p.page,bbox:null,kind:'TEXT',quote:'Lin He'}]}],unknowns:[]},payload.manifest,payload.dictionary);
  await prisma.talentSubmissionItem.update({where:{id:job.id},data:{revision:{increment:1},values:{...job.values,ciphertext:encryptDraftPayload(JSON.stringify(payload),key,context)}}});
 }
 await page.reload({waitUntil:'networkidle'});
 for(const pages of ['5、6、7、8','9、10']){
  const material=page.locator('.supplier-document-result').filter({has:page.getByRole('heading',{name:'long-portfolio.pdf · 第 '+pages+' 页',exact:true})});
  const imported=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/documents/images'));
  await material.getByRole('button',{name:'把提取图片加入草稿',exact:true}).click();assert.equal((await imported).status(),200);
  await material.getByText('已加入 '+(pages==='9、10'?2:4)+' 张图片，可在材料区查看。',{exact:true}).waitFor();
  await material.getByText('正在把提取图片加入草稿…',{exact:true}).waitFor({state:'hidden'});
 }
 const region=page.getByRole('region',{name:'整理识别到的作品',exact:true});
 await region.getByRole('checkbox',{name:'选择作品候选：合成跨页短片 · 第1页',exact:true}).check();
 await region.getByRole('checkbox',{name:'选择作品候选：合成跨页短片 · 第5页',exact:true}).check();
 for(const width of [360,390,430]){
  await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'grouping has no horizontal overflow at '+width);
  await region.screenshot({path:join(evidence,'work-grouping-'+width+'.png')});
 }
 const saveResponse=()=>page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/documents/work-group'));
 let response=saveResponse();await region.getByRole('button',{name:'合成一个案例草稿',exact:true}).click();assert.equal((await response).status(),200);
 await page.getByLabel('案例标题',{exact:true}).fill('合成品牌短片');await page.getByLabel('案例简介',{exact:true}).fill('本人校正的完整案例说明');
 const editor=page.getByRole('region',{name:'编辑作品案例',exact:true});
 await editor.getByLabel('案例封面',{exact:true}).selectOption({label:'材料第5页-p5_i1.png'});
 await page.getByRole('button',{name:'保存案例草稿',exact:true}).click();await page.getByText('案例草稿已保存在服务器',{exact:true}).waitFor();
 await region.getByRole('checkbox',{name:'选择作品候选：合成跨页短片 · 第9页',exact:true}).check();
 const item=await prisma.talentSubmissionItem.findFirstOrThrow({where:{submissionId:sid,kind:'WORK'}});
 await region.getByLabel('归入哪个案例',{exact:true}).selectOption(item.clientItemKey);
 response=saveResponse();await region.getByRole('button',{name:'补充到所选案例草稿',exact:true}).click();assert.equal((await response).status(),200);
 await region.getByText('共 3 个作品候选，3 个已整理。同一项目分散在多页或多个文件时，可勾选后归到同一个案例。',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('案例标题',{exact:true}).inputValue(),'合成品牌短片');assert.equal(await page.getByLabel('案例简介',{exact:true}).inputValue(),'本人校正的完整案例说明');
 await region.getByLabel('显示已整理的候选',{exact:true}).check();assert.equal(await region.getByRole('checkbox',{name:'选择作品候选：合成跨页短片 · 第1页',exact:true}).isDisabled(),true);
 const final=await prisma.talentSubmissionItem.findFirstOrThrow({where:{submissionId:sid,kind:'WORK'}});assert.equal(final.values.items.length,3);assert.equal(final.baseline.originDocuments.length,3);assert.equal(final.values.coverAssetId,item.values.coverAssetId);
 assert.equal(await prisma.talentSubmissionItem.count({where:{submissionId:sid,kind:'WORK'}}),1);
 await region.screenshot({path:join(evidence,'work-grouped.png')});
}

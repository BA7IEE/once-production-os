import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
/** Fresh real source-owned original for ONE Person's collection. Never reuse another
 * Person's bound original as a fixture shortcut under the PR03C ownership contract. */
export async function independentCollectionImage({owner,prisma,cmd,binary,queue,until,mediaBytes},templateId){
 const template=await prisma.mediaAsset.findUniqueOrThrow({where:{id:templateId}}),source=await prisma.sourceRecord.findUniqueOrThrow({where:{id:template.sourceId}});
 const id=(await cmd(owner,'POST','/uploads',{sourceId:source.id,expectedSourceRevision:source.revision,fileName:'collection-'+randomUUID().slice(0,8)+'.png',mime:'image/png',expectedBytes:mediaBytes.length,sha256:createHash('sha256').update(mediaBytes).digest('hex')},201)).resourceId;
 assert.equal((await binary(owner,id,mediaBytes)).status(),200);await queue(owner,id);await until(async()=>await prisma.mediaAsset.count({where:{id,state:'READY'}})===1);return id;
}

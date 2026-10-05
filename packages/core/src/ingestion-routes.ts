import type {RouteDefinition} from './routes.ts';
import {IngestionSchemas as S} from './ingestion-schema.ts';
import {AgentMediaSchemas as M} from './agent-media.ts';
import {MediaSchemas} from './media-validation.ts';
export const INGESTION_ROUTES:RouteDefinition[]=[
 {method:'POST',path:'/ingestion/uploads',operation:'ingestion.upload.create',mode:'COMMAND',permission:'ingestion.media.upload',schema:M.create},
 {method:'POST',path:'/ingestion/uploads/{id}/receive-authorizations',operation:'ingestion.upload.authorize',mode:'SECRET',permission:'ingestion.media.upload',schema:M.authorization},
 {method:'PUT',path:'/ingestion/uploads/{id}/content',operation:'ingestion.upload.content',mode:'BINARY',permission:'ingestion.media.upload'},
 {method:'POST',path:'/ingestion/uploads/{id}/complete',operation:'ingestion.upload.complete',mode:'COMMAND',permission:'ingestion.media.upload',schema:MediaSchemas.revision},
 {method:'POST',path:'/ingestion/uploads/{id}/cancel',operation:'ingestion.upload.cancel',mode:'COMMAND',permission:'ingestion.media.upload',schema:MediaSchemas.revision},
 {method:'GET',path:'/ingestion/uploads/{id}/status',operation:'ingestion.upload.status',mode:'READ',permission:'ingestion.read.own'},
 {method:'GET',path:'/ingestion/submissions/{id}/assets/{asset}/preview',operation:'ingestion.asset.preview',mode:'BINARY',permission:'ingestion.read.own'},
 {method:'GET',path:'/ingestion/submissions/{id}/assets/{asset}/playback',operation:'ingestion.asset.playback',mode:'BINARY',permission:'ingestion.read.own'},
 {method:'GET',path:'/ingestion/submissions/{id}/assets/{asset}/attachment',operation:'ingestion.asset.attachment',mode:'BINARY',permission:'ingestion.read.own'},
 {method:'GET',path:'/ingestion/schema',operation:'ingestion.schema',mode:'READ',permission:'ingestion.schema.read'},
 {method:'GET',path:'/ingestion/dictionaries',operation:'ingestion.dictionaries',mode:'READ',permission:'ingestion.schema.read'},
 {method:'POST',path:'/ingestion/submissions',operation:'ingestion.create',mode:'COMMAND',permission:'ingestion.submit',schema:S.create},
 {method:'GET',path:'/ingestion/submissions/{id}',operation:'ingestion.get',mode:'READ',permission:'ingestion.read.own'},
 {method:'POST',path:'/ingestion/submissions/{id}/items',operation:'ingestion.items',mode:'COMMAND',permission:'ingestion.submit',schema:S.items},
 {method:'POST',path:'/ingestion/submissions/{id}/validate',operation:'ingestion.validate',mode:'READ',permission:'ingestion.submit',schema:S.revision},
 {method:'POST',path:'/ingestion/submissions/{id}/submit',operation:'ingestion.submit',mode:'COMMAND',permission:'ingestion.submit',schema:S.revision},
 {method:'POST',path:'/ingestion/submissions/{id}/withdraw',operation:'ingestion.withdraw',mode:'COMMAND',permission:'ingestion.withdraw.own',schema:S.revision},
 {method:'POST',path:'/ingestion/submissions/{id}/fork',operation:'ingestion.fork',mode:'COMMAND',permission:'ingestion.submit',schema:S.fork},
 {method:'GET',path:'/ingestion-review/submissions',operation:'ingestionReview.list',mode:'READ',permission:'talent.review'},
 {method:'GET',path:'/ingestion-review/submissions/{id}',operation:'ingestionReview.get',mode:'READ',permission:'talent.review'},
 {method:'POST',path:'/ingestion-review/submissions/{id}/review',operation:'ingestionReview.review',mode:'COMMAND',permission:'talent.review',schema:S.review}
];

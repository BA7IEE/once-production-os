import type {RouteDefinition} from './routes.ts';
import {IngestionSchemas as S} from './ingestion-schema.ts';
export const INGESTION_ROUTES:RouteDefinition[]=[
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

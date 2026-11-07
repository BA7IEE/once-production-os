import type {RouteDefinition} from './routes.ts';
import {SupplierInboxSchemas as S} from './supplier-inbox-schema.ts';
export const SUPPLIER_INBOX_ROUTES:RouteDefinition[]=[
 {method:'GET',path:'/supplier-inbox',operation:'supplier.inbox.list',mode:'READ',permission:'records.read'},
 {method:'POST',path:'/supplier-inbox',operation:'supplier.inbox.create',mode:'COMMAND',permission:'records.write',schema:S.create},
 {method:'GET',path:'/supplier-inbox/{id}',operation:'supplier.inbox.get',mode:'READ',permission:'records.read'},
 {method:'POST',path:'/supplier-inbox/{id}/materials',operation:'supplier.inbox.add',mode:'COMMAND',permission:'records.write',schema:S.add},
 {method:'POST',path:'/supplier-inbox/{id}/parse',operation:'supplier.inbox.start',mode:'COMMAND',permission:'records.write',schema:S.start},
 {method:'POST',path:'/supplier-inbox/{id}/review',operation:'supplier.inbox.save',mode:'COMMAND',permission:'records.write',schema:S.save},
 {method:'POST',path:'/supplier-inbox/{id}/adopt',operation:'supplier.inbox.apply',mode:'COMMAND',permission:'records.write',schema:S.apply},
 {method:'POST',path:'/supplier-inbox/{id}/control',operation:'supplier.inbox.control',mode:'COMMAND',permission:'records.write',schema:S.control},
 {method:'POST',path:'/supplier-inbox/{id}/images',operation:'supplier.inbox.images',mode:'COMMAND',permission:'records.write',schema:S.images},
 {method:'POST',path:'/supplier-inbox/{id}/close',operation:'supplier.inbox.close',mode:'COMMAND',permission:'records.write',schema:S.close},
];

import type {RouteDefinition} from './routes.ts';
import {SupplierCatalogSchemas as S} from './supplier-field-validation.ts';
import {ProfessionalWriteSchema} from './supplier-professional.ts';
export const SUPPLIER_FIELD_ROUTES:RouteDefinition[]=[
 {method:'GET',path:'/supplier-field-schema',operation:'supplier.fields.schema',mode:'READ',permission:'records.read'},
 {method:'GET',path:'/supplier-field-catalog',operation:'supplier.catalog.list',mode:'READ',permission:'catalog.manage'},
 {method:'POST',path:'/supplier-field-catalog',operation:'supplier.catalog.create',mode:'COMMAND',permission:'catalog.manage',schema:S.create},
 {method:'PATCH',path:'/supplier-field-catalog/{id}',operation:'supplier.catalog.save',mode:'COMMAND',permission:'catalog.manage',schema:S.save},
 {method:'POST',path:'/supplier-field-catalog/{id}/publish',operation:'supplier.catalog.publish',mode:'COMMAND',permission:'catalog.manage',schema:S.publish},
 {method:'GET',path:'/people/{id}/professional',operation:'supplier.professional.get',mode:'READ',permission:'records.read'},
 {method:'POST',path:'/people/{id}/professional',operation:'supplier.professional.update',mode:'COMMAND',permission:'records.write',schema:ProfessionalWriteSchema},
];

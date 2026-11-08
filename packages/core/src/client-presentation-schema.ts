import {v,uuid,revision,dateIso} from './validation.ts';
export const ClientPresentationSchemas={
 publish:v.object({expectedRevision:revision,versionId:uuid,title:v.string(160,1),expiresAt:dateIso,approvalSourceId:uuid,approvalSourceRevision:revision,purpose:v.enum(['CLIENT_PRESENTATION']),approvalNote:v.string(2000,10),mediaContentReviewed:v.enum(['SELECTED_MEDIA_CHECKED_FOR_PRIVATE_CONTENT']),
  entries:v.array(v.object({shortlistItemId:uuid,publicName:v.string(120,1),intro:v.string(1500),recommendation:v.string(1500),conditions:v.string(1500),includeWork:v.boolean(),assetIds:v.array(uuid,12)}),20,1)}),
 issue:v.object({versionId:uuid,recipientId:uuid,label:v.string(120,1),expiresAt:dateIso,rotate:v.boolean(),expectedRecipientRevision:v.optional(revision),acknowledge:v.enum(['NAMED_RECIPIENT_LINK'])}),
 revoke:v.object({expectedRevision:revision,versionId:v.optional(uuid),recipientId:v.optional(uuid)}),
 exchange:v.object({recipientId:uuid,token:v.string(43,43,/^[A-Za-z0-9_-]+$/)}),
 inspect:v.object({versionId:uuid,commandKey:v.string(128,8,/^[A-Za-z0-9_-]+$/)}),
 feedbackList:v.object({versionId:uuid,page:v.optional(v.number(1,100000)),pageSize:v.optional(v.number(1,100))}),
 feedback:v.object({versionId:uuid,entryId:uuid,choice:v.enum(['INTERESTED','PENDING','PASS']),note:v.string(2000)}),
 empty:v.object({})
};

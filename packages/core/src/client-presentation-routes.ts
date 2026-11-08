import type {RouteDefinition} from './routes.ts';
import {ClientPresentationSchemas as S} from './client-presentation-schema.ts';
export const CLIENT_PRESENTATION_ROUTES:RouteDefinition[]=[
 {method:'GET',path:'/shortlists/{id}/presentations',operation:'client.presentation.list',mode:'READ',permission:'data.export'},
 {method:'POST',path:'/shortlists/{id}/presentations',operation:'client.presentation.publish',mode:'COMMAND',permission:'data.export',schema:S.publish},
 {method:'POST',path:'/shortlists/{id}/presentations/recipients/issue',operation:'client.recipient.issue',mode:'SECRET',permission:'data.export',schema:S.issue},
 {method:'POST',path:'/shortlists/{id}/presentations/feedback',operation:'client.presentation.feedback',mode:'READ',permission:'data.export',schema:S.feedbackList},
 {method:'POST',path:'/shortlists/{id}/presentations/revoke',operation:'client.presentation.revoke',mode:'COMMAND',permission:'data.export',schema:S.revoke},
 {method:'POST',path:'/client/exchange',operation:'client.exchange',mode:'AUTH',schema:S.exchange},
 {method:'GET',path:'/client/me',operation:'client.me',mode:'READ'},
 {method:'GET',path:'/client/presentations/{id}',operation:'client.view',mode:'READ'},
 {method:'POST',path:'/client/feedback/inspect',operation:'client.feedback.inspect',mode:'READ',schema:S.inspect},
 {method:'POST',path:'/client/feedback',operation:'client.feedback',mode:'COMMAND',schema:S.feedback},
 {method:'POST',path:'/client/logout',operation:'client.logout',mode:'AUTH',schema:S.empty},
 {method:'GET',path:'/client/presentations/{id}/media/{asset}/preview',operation:'client.media.preview',mode:'BINARY'},
 {method:'GET',path:'/client/presentations/{id}/media/{asset}/attachment',operation:'client.media.attachment',mode:'BINARY'},
 {method:'GET',path:'/client/presentations/{id}/media/{asset}/playback',operation:'client.media.playback',mode:'BINARY'}
];

import type {Receipt} from './dto.ts';
/** The original input stays frozen through unknown writes and failed readbacks. */
export class ImportCommandState<T>{
 input:T|null=null;batchId:string|null=null;receipt:Receipt|null=null;unknown=false;
 get locked(){return this.input!==null&&(this.unknown||this.receipt!==null);}
 async submit(input:T,batchId:string|null,send:(input:T,batchId:string|null)=>Promise<Receipt>,definiteRejection:(error:unknown)=>boolean){
  if(!this.input){this.input=structuredClone(input);this.batchId=batchId;}
  if(this.receipt)return this.receipt;
  try{this.receipt=await send(this.input,this.batchId);this.unknown=false;return this.receipt;}
  catch(error){if(!this.unknown&&definiteRejection(error))this.reset();else this.unknown=true;throw error;}
 }
 reset(){this.input=null;this.batchId=null;this.receipt=null;this.unknown=false;}
}

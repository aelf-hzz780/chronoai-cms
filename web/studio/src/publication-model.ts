import type {PublicationAction} from './types.js';
export class OperationIntent {
 private signature='';private key='';private create:()=>string;
 constructor(create:()=>string=()=>crypto.randomUUID()){this.create=create;}
 keyFor(body:Record<string,unknown>):string {const signature=JSON.stringify(body);if(signature!==this.signature){this.signature=signature;this.key=this.create();}return this.key;}
}
export function publicationOptions(revisionId:string,live:null|{revisionId:string;releaseId:string},releases:Array<{id:string;state:string}>){
 const pending=releases.find(release=>['queued','publishing','verifying','uncertain'].includes(release.state))??null;
 const actions:PublicationAction[]=pending?[]:!live?['publish']:live.revisionId===revisionId?['update','unpublish']:['update'];
 return {actions,pending,removalRevision:live&&live.revisionId!==revisionId?live.revisionId:null};
}

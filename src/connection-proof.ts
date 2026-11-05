import {digest} from './content.ts';
// Include routing as well as provider account identity; a changed binding must be reconfirmed.
export function connectionFingerprint(connection:any) {
  return digest(JSON.stringify({id:connection.id,slug:connection.slug,remoteBaseUrl:connection.remoteBaseUrl,accountId:connection.accountId,organizationId:connection.organizationId,publicationId:connection.publicationId,generation:connection.generation,executionApproval:connection.executionApproval}));
}
export type ExecutionApproval = 'exact'|'native';
export function requiresExactApproval(ownerKind:string,connection:{executionApproval?:ExecutionApproval}) {
  // Organization external distribution still requires content-bound Admin
  // approval. Selecting personal native policy cannot lower that requirement.
  return ownerKind==='organization'||connection.executionApproval==='exact';
}

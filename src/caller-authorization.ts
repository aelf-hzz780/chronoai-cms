import {createRemoteJWKSet,jwtVerify,type JWTPayload} from 'jose';
import type {Config} from './config.ts';
import {safeUrl} from './config.ts';
import {requireValue} from './errors.ts';
import {remoteJson} from './http-client.ts';
import type {Actor,CallerBinding} from './policy.ts';

// Shared by initial authentication and online revalidation of encrypted snapshots.
export class CallerAuthorization {
  config:Config;
  discovery:any;
  keys:ReturnType<typeof createRemoteJWKSet>|undefined;
  constructor(config:Config){this.config=config;}
  async discover(){
    if(this.discovery)return this.discovery;
    const discovery=await remoteJson(this.config.discoveryUrl??`${this.config.issuer}/.well-known/openid-configuration`);
    requireValue(discovery.issuer===this.config.issuer,502,'OIDC_ISSUER','Discovery issuer mismatch');
    for(const key of ['authorization_endpoint','token_endpoint','jwks_uri'])safeUrl(discovery[key],this.config.allowLoopback);
    requireValue(discovery.code_challenge_methods_supported?.includes('S256'),502,'OIDC_PKCE','Issuer must support PKCE S256');
    this.keys=createRemoteJWKSet(new URL(discovery.jwks_uri),{timeoutDuration:8000,cooldownDuration:1000});this.discovery=discovery;return discovery;
  }
  capabilities(entry:'cms'|'service',sourceScopes:string[]){
    const mapping=(entry==='cms'?this.config.cmsOperationScopes:this.config.serviceOperationScopes)??this.config.operationScopes;
    return mapping?Object.entries(mapping).filter(([,required])=>required.every(scope=>sourceScopes.includes(scope))).map(([capability])=>capability):sourceScopes;
  }
  async access(token:string,audience:string){
    await this.discover();
    const {payload}=await jwtVerify(token,this.keys!,{issuer:this.config.issuer,audience,algorithms:['RS256','ES256'],requiredClaims:['sub','exp','iat']});
    requireValue(payload.token_type==='access'&&payload.sa!==true&&payload.relay!==true&&typeof payload.scope==='string',401,'INVALID_TOKEN','Human access token required');
    return payload;
  }
  actor(payload:JWTPayload,credential:string,binding:CallerBinding):Actor{
    requireValue(payload.iss===this.config.issuer&&typeof payload.sub==='string'&&typeof payload.exp==='number'&&payload.exp*1000>Date.now()&&typeof payload.scope==='string',401,'INVALID_TOKEN','Invalid caller token');
    const entry=binding.kind==='cms'?'cms':'service',sourceScopes=payload.scope.split(' ').filter(Boolean);
    return {issuer:payload.iss,subject:payload.sub,scopes:this.capabilities(entry,sourceScopes),sourceScopes,credential,entry,binding};
  }
  directBinding(payload:JWTPayload,entry:'cms'|'service',audience:string):CallerBinding{
    requireValue(typeof payload.client_id==='string'&&payload.delegated!==true,401,'INVALID_TOKEN','Direct caller client binding required');
    if(entry==='cms')requireValue(payload.client_id===this.config.clientId,401,'INVALID_TOKEN','CMS client binding required');
    else requireValue(this.config.serviceClientIds?.includes(payload.client_id),401,'INVALID_TOKEN','Explicit service caller client required; use signed propagation for proxy calls');
    return {kind:entry==='cms'?'cms':'direct-service',clientId:payload.client_id,audience};
  }
  async restore(actor:Actor){
    const b=actor.binding;
    requireValue(b&&actor.issuer===this.config.issuer,401,'REVOKED','Saved caller provenance required; authenticate and confirm again');
    let audience:string;
    if(b.kind==='cms'||b.kind==='direct-service'){
      const cms=b.kind==='cms';audience=cms?this.config.cmsAudience:this.config.serviceAudience;
      requireValue(actor.entry===(cms?'cms':'service')&&b.audience===audience&&(cms?b.clientId===this.config.clientId:this.config.serviceClientIds?.includes(b.clientId)),401,'REVOKED','Current client or audience binding changed');
    }else{
      requireValue(b.kind==='propagated'&&actor.entry==='service'&&!!this.config.serviceId&&!!this.config.serviceSlug&&!!this.config.nyxAudience&&b.serviceId===this.config.serviceId&&b.serviceSlug===this.config.serviceSlug&&b.identityAudience===this.config.serviceAudience&&b.delegationAudience===this.config.nyxAudience,401,'REVOKED','Current propagated service binding changed');
      audience=this.config.nyxAudience;
    }
    // The short identity assertion was verified at ingress. Persist its verified
    // binding, then verify the still-valid delegation; do not extend either token.
    const payload=await this.access(actor.credential,audience);
    requireValue(payload.sub===actor.subject,401,'REVOKED','Saved caller subject changed');
    if(b.kind==='propagated')requireValue(payload.delegated===true&&(payload.act as {sub?:string})?.sub===b.serviceSlug,401,'REVOKED','Delegation actor binding changed');
    else {const current=this.directBinding(payload,b.kind==='cms'?'cms':'service',audience);requireValue(current.kind!=='propagated'&&current.clientId===b.clientId,401,'REVOKED','Saved client differs from signed client');}
    const current=this.actor(payload,actor.credential,b);
    requireValue(actor.scopes.every(scope=>current.scopes.includes(scope)),401,'REVOKED','Current configuration no longer authorizes the saved action');
    return current;
  }
}

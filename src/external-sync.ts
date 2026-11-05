import {randomUUID} from 'node:crypto';
import {setTimeout} from 'node:timers/promises';
import {AppError,requireValue} from './errors.ts';

export interface ExternalSyncConfig {intervalMs:number;pollMs:number;batchSize:number;}
export function externalSyncConfig(env:NodeJS.ProcessEnv=process.env):ExternalSyncConfig {
  const value=(key:string,fallback:number,min:number,max:number)=>{
    const parsed=env[key]===undefined?fallback:Number(env[key]);
    requireValue(Number.isSafeInteger(parsed)&&parsed>=min&&parsed<=max,500,'EXTERNAL_SYNC_CONFIGURATION',`External sync ${key} must be an integer between ${min} and ${max}`);
    return parsed;
  };
  return {intervalMs:value('EXTERNAL_SYNC_INTERVAL_MS',900_000,60_000,86_400_000),pollMs:value('EXTERNAL_SYNC_POLL_MS',30_000,1000,60_000),batchSize:value('EXTERNAL_SYNC_BATCH_SIZE',20,1,100)};
}

/** A separate read-only process: never constructs or drains the publication queue. */
export async function runExternalSync(
  service:{syncDue(limit:number):Promise<unknown>},signal:AbortSignal,config:ExternalSyncConfig,
  log:(event:Record<string,string>)=>void=event=>process.stderr.write(JSON.stringify(event)+'\n'),
  pause:(milliseconds:number,signal:AbortSignal)=>Promise<unknown>=(milliseconds,signal)=>setTimeout(milliseconds,undefined,{signal}),
) {
  while(!signal.aborted){
    try{await service.syncDue(config.batchSize);}
    catch(error){log({event:'external-sync.failed',traceId:randomUUID(),code:error instanceof AppError?error.code:'INTERNAL'});}
    if(signal.aborted)break;
    try{await pause(config.pollMs,signal);}
    catch(error){if(!signal.aborted)throw error;}
  }
}

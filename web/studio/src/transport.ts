export class ApiError extends Error {
  status:number;code:string;traceId:string;
  constructor(status:number,code:string,message:string,traceId=''){super(message);this.name='ApiError';this.status=status;this.code=code;this.traceId=traceId;}
}
type RequestOptions={method?:string;data?:unknown;body?:BodyInit;signal?:AbortSignal;contentType?:string};
export class Transport {
  csrf?:string;
  fetcher:typeof fetch;
  constructor(fetcher:typeof fetch=globalThis.fetch.bind(globalThis)){this.fetcher=fetcher;}
  async json<T>(path:string,options:RequestOptions={}):Promise<T>{
    const pathname=path.split('?')[0];
    if(!/^\/[a-zA-Z0-9]/.test(path)||path.includes('://')||path.includes('\\')||path.includes('#')||pathname.split('/').some(segment=>/^(?:\.|%2e){1,2}$/i.test(segment)))throw new Error('Invalid API path');
    const method=options.method??'GET'; const headers=new Headers({'accept':'application/json'});
    if(method!=='GET') {if(!this.csrf)throw new ApiError(401,'CSRF_MISSING','CSRF session is unavailable');headers.set('x-csrf-token',this.csrf);}
    if(options.data!==undefined||options.contentType) headers.set('content-type',options.contentType??'application/json');
    const response=await this.fetcher(`/api/cms${path}`,{method,headers,credentials:'same-origin',cache:'no-store',signal:options.signal,body:options.data!==undefined?JSON.stringify(options.data):options.body});
    if(!response.ok){let error:{code?:string;message?:string;traceId?:string}={};try{error=await response.json();}catch{/* A proxy may return non-JSON; retain the response trace below. */}
      throw new ApiError(response.status,error.code??'REQUEST_FAILED',error.message??`Request failed (${response.status})`,error.traceId??response.headers.get('x-trace-id')??'');}
    return response.json() as Promise<T>;
  }
}

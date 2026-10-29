import {chromium} from 'playwright-core';
import {access} from 'node:fs/promises';
import {AppError} from './errors.ts';
export interface RenderProof {verify(url:string,html:string,marker?:string):Promise<boolean>;}
export class BrowserRenderProof implements RenderProof {
  environment:NodeJS.ProcessEnv;ignoredScripts:string[];
  constructor(environment:NodeJS.ProcessEnv=process.env,ignoredScripts:string[]=[]){this.environment=environment;this.ignoredScripts=ignoredScripts;}
  async executable() {
    const paths=this.environment.RENDER_BROWSER_EXECUTABLE?[this.environment.RENDER_BROWSER_EXECUTABLE]:process.platform==='darwin'?['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']:['/usr/bin/chromium','/usr/bin/chromium-browser'];
    for(const path of paths){try{await access(path);return path;}catch{}}
    throw new AppError(503,'RENDERER_REQUIRED','Install a Chromium renderer and configure RENDER_BROWSER_EXECUTABLE before public verification');
  }
  async verify(url:string,html:string,marker?:string) {
    const origin=new URL(url).origin,allowed=new Set([origin,...(this.environment.RENDER_ASSET_ORIGINS??'').split(',').filter(Boolean).map(value=>new URL(value.trim()).origin)]);
    const browser=await chromium.launch({executablePath:await this.executable(),headless:true,chromiumSandbox:this.environment.RENDER_BROWSER_SANDBOX!=='false',timeout:15000});
    try {
      const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block',acceptDownloads:false});
      const page=await context.newPage();let unavailable=false;
      await page.route('**/*',async route=>{
        const request=route.request(),resource=request.resourceType(),address=request.url();
        if(resource==='document' && address===url && request.isNavigationRequest())return route.fulfill({status:200,contentType:'text/html',body:html});
        if(this.ignoredScripts.includes(address))return route.abort();
        // The renderer has no cookies, credentials or write capability. Unsupported
        // scripts/styles make the rendering contract unverifiable, never a pass.
        if(request.method()!=='GET'||!allowed.has(new URL(address).origin)||['fetch','xhr','websocket','eventsource','document'].includes(resource)){
          if(['stylesheet','script'].includes(resource))unavailable=true;
          return route.abort();
        }
        return route.continue();
      });
      page.on('response',response=>{if(['stylesheet','script'].includes(response.request().resourceType())&&!response.ok())unavailable=true;});
      page.on('requestfailed',request=>{if(['stylesheet','script'].includes(request.resourceType())&&!this.ignoredScripts.includes(request.url()))unavailable=true;});
      await page.goto(url,{waitUntil:'networkidle',timeout:20000});
      if(unavailable)return false;
      return await page.evaluate(({marker,html})=>{
        const selector=marker?'[data-chrono-revision]':'article';
        const matches=[...document.querySelectorAll(selector)].filter(node=>!marker||node.getAttribute('data-chrono-revision')===marker);
        if(matches.length!==1)return false;const wrapper=matches[0]!;
        const original=new DOMParser().parseFromString(html,'text/html');
        const captured=[...original.querySelectorAll(selector)].find(node=>!marker||node.getAttribute('data-chrono-revision')===marker);
        if(!captured||captured.outerHTML!==wrapper.outerHTML)return false;
        function shown(element:Element) {
          for(let node:Element|null=element;node;node=node.parentElement){const style=getComputedStyle(node);if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||Number(style.opacity)===0||style.contentVisibility==='hidden'||node.hasAttribute('hidden')||node.hasAttribute('inert'))return false;}
          return true;
        }
        const elements=[wrapper,...wrapper.querySelectorAll('*')];
        for(const element of elements){
          if(!shown(element))return false;
          if(element.tagName==='IMG'){
            const rect=element.getBoundingClientRect(),style=getComputedStyle(element);
            if(rect.width<1||rect.height<1||style.clipPath!=='none'||(element as HTMLImageElement).srcset)return false;
          }
          for(const node of element.childNodes){if(node.nodeType!==Node.TEXT_NODE||!node.textContent?.trim())continue;
            const range=document.createRange();range.selectNodeContents(node);const rect=[...range.getClientRects()].find(rect=>rect.width>0&&rect.height>0);if(!rect)return false;
            element.scrollIntoView({block:'center',inline:'center'});const visibleRect=[...range.getClientRects()].find(rect=>rect.width>0&&rect.height>0);if(!visibleRect)return false;
            const x=Math.max(0,Math.min(innerWidth-1,visibleRect.left+Math.min(visibleRect.width/2,10))),y=Math.max(0,Math.min(innerHeight-1,visibleRect.top+visibleRect.height/2));
            const hit=document.elementFromPoint(x,y);if(!hit||!(hit===element||element.contains(hit)))return false;
          }
        }
        return true;
      },{marker,html});
    }finally{await browser.close();}
  }
}

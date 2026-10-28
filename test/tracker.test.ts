import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
const source=await readFile(new URL('../web/tracker.js',import.meta.url),'utf8');
function browser(options:{choice?:string;required?:boolean;gpc?:boolean;dnt?:string}={}) {
  const sent:string[]=[], elements:any[]=[];
  function element(tag:string) { const e:any={tag,children:[],textContent:'',append(...items:any[]){this.children.push(...items);},setAttribute(){},addEventListener(_name:string,handler:()=>void){this.click=handler;}};elements.push(e);return e; }
  const root=element('footer'); const storage=new Map(options.choice?[['chrono-analytics-consent',options.choice]]:[]);
  runInNewContext(source,{URL,document:{currentScript:{dataset:{endpoint:'https://cms.example/track/signed.gif',requireConsent:String(options.required!==false)}},documentElement:{lang:'en'},referrer:'https://dev.to/private/path?secret=omit',querySelector(){return root;},createElement:element},navigator:{globalPrivacyControl:options.gpc,doNotTrack:options.dnt},localStorage:{getItem:(k:string)=>storage.get(k),setItem:(k:string,v:string)=>storage.set(k,v)},location:{href:'https://blog.example/post?utm_source=dev'},Image:class{set src(value:string){sent.push(value);}}});
  return {sent,elements,storage};
}
test('readership UI makes a consent choice possible, honors withdrawal and strips referral paths',()=>{
  const b=browser();assert.equal(b.sent.length,0);
  const buttons=b.elements.filter(e=>e.tag==='button'); assert.equal(buttons.length,2);
  buttons[0].click(); assert.equal(b.sent.length,1);const url=new URL(b.sent[0]);assert.equal(url.searchParams.get('referrer'),'https://dev.to');assert.equal(url.searchParams.get('consent'),'1');assert.equal(url.searchParams.get('campaign'),'dev');
  buttons[1].click();assert.equal(b.storage.get('chrono-analytics-consent'),'no');assert.equal(b.sent.length,1);
  assert.equal(browser({choice:'no',required:false}).sent.length,0);
  assert.equal(browser({gpc:true,choice:'yes'}).sent.length,0);assert.equal(browser({dnt:'1',required:false}).sent.length,0);
});

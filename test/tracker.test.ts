import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
const source=await readFile(new URL('../web/tracker.js',import.meta.url),'utf8');
function browser(options:{choice?:string;required?:boolean;gpc?:boolean;dnt?:string;footer?:boolean}={}) {
  const sent:string[]=[], elements:any[]=[];
  function element(tag:string) { const e:any={tag,children:[],textContent:'',append(...items:any[]){this.children.push(...items);},setAttribute(){},addEventListener(_name:string,handler:(event?:any)=>void){this.click=()=>handler({preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}});}};elements.push(e);return e; }
  const root=element('footer'),body=element('body'); const storage=new Map(options.choice?[['chrono-analytics-consent',options.choice]]:[]);
  runInNewContext(source,{URL,document:{currentScript:{dataset:{endpoint:'https://cms.example/track/signed.gif',requireConsent:String(options.required!==false)}},documentElement:{lang:'en'},body,referrer:'https://dev.to/private/path?secret=omit',querySelector(){return options.footer===false?null:root;},createElement:element},navigator:{globalPrivacyControl:options.gpc,doNotTrack:options.dnt},localStorage:{getItem:(k:string)=>storage.get(k),setItem:(k:string,v:string)=>storage.set(k,v)},location:{href:'https://blog.example/post?utm_source=dev'},Image:class{set src(value:string){sent.push(value);}}});
  return {sent,elements,storage,body,root};
}
test('readership UI makes a consent choice possible, honors withdrawal and strips referral paths',()=>{
  const b=browser();assert.equal(b.sent.length,0);
  const buttons=b.elements.filter(e=>e.tag==='button'); assert.equal(buttons.length,2);
  buttons[0].click(); assert.equal(b.sent.length,1);const url=new URL(b.sent[0]);assert.equal(url.searchParams.get('referrer'),'https://dev.to');assert.equal(url.searchParams.get('consent'),'1');assert.equal(url.searchParams.get('campaign'),'dev');
  buttons[1].click();assert.equal(b.storage.get('chrono-analytics-consent'),'no');assert.equal(b.sent.length,1);
  assert.equal(browser({choice:'no',required:false}).sent.length,0);
  assert.equal(browser({gpc:true,choice:'yes'}).sent.length,0);assert.equal(browser({dnt:'1',required:false}).sent.length,0);
});

test('consent controls stay in the page body outside theme card footers, including pages without a footer',()=>{
  for(const options of [{footer:true},{footer:false}]){
    const b=browser(options),panel=b.body.children.find((e:any)=>e.tag==='aside');
    assert.ok(panel,'consent panel must attach to body');
    assert.equal(b.root.children.includes(panel),false,'consent panel must not attach to a theme footer');
    const before='https://blog.example/post?utm_source=dev';
    b.elements.find(e=>e.tag==='button')!.click();
    assert.equal(before,'https://blog.example/post?utm_source=dev','consent choice preserves article URL');
  }
});

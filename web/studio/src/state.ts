import type {Article,EditorDraft,Language} from './types.js';
export interface Stamp {version:number;signal:AbortSignal}
export class ContextGate {
  private version=0;private controller=new AbortController();
  current():Stamp{return {version:this.version,signal:this.controller.signal};}
  advance():Stamp{this.controller.abort();this.controller=new AbortController();this.version++;return this.current();}
  accepts(stamp:Stamp):boolean{return stamp.version===this.version&&!stamp.signal.aborted;}
}
export function safeReturnPath(path:string):string {
 const match=/^\/studio(?:#\/(content|onboarding|settings|article\/[a-zA-Z0-9-]+|new(?:\/(?:en|zh))?)(?:\?([^#]*))?)?$/.exec(path);
 if(!match)return '/studio';if(!match[2])return path;
 const query=new URLSearchParams(match[2]);const keys=[...query.keys()];
 const expected=match[1].startsWith('article/')?['revision']:match[1].startsWith('new/')?['source','revision']:[];
 if(keys.length!==expected.length||!expected.every(key=>keys.includes(key)&&/^[a-zA-Z0-9-]+$/.test(query.get(key)??'')))return '/studio';
 return path;
}
export function draftFrom(article:Article|null,language:Language='en',historical=false):EditorDraft {return {article,language:article?.language??language,title:article?.revision.title??'',author:article?.revision.creditedAuthor??'',markdown:article?.revision.markdown??'',originalMarkdown:article?.revision.markdown??'',markdownChanged:false,dirty:false,conflict:false,historyRevision:historical,imported:false};}

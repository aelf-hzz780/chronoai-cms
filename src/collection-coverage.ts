import {randomUUID} from 'node:crypto';
import {mkdirSync,openSync,writeFileSync,fsyncSync,closeSync,readdirSync,readFileSync,unlinkSync} from 'node:fs';
import {join,dirname} from 'node:path';
import type {Store,Row} from './store.ts';
interface Attempt {id:string;article_id:string;occurred_at:string;}
// The SQLite write-ahead attempt survives process recreation and is included in
// database snapshots. If SQLite cannot accept that first write, use a separately
// fsynced sidecar on the operator's persistent data directory.
export class CollectionCoverage {
  store:Store;
  constructor(store:Store){this.store=store;}
  directory(){return `${this.store.path}.collection-pending`;}
  syncDirectory(){const fd=openSync(this.directory(),'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
  begin(articleId:string,now:string):Attempt & {sidecar:boolean} {
    const attempt={id:randomUUID(),article_id:articleId,occurred_at:now};
    try{this.store.run('INSERT INTO collection_attempts VALUES (?,?,?)',attempt.id,articleId,now);return {...attempt,sidecar:false};}
    catch(error){
      if(this.store.path===':memory:')throw error;
      mkdirSync(this.directory(),{recursive:true,mode:0o700});
      const parent=openSync(dirname(this.directory()),'r');try{fsyncSync(parent);}finally{closeSync(parent);}
      const fd=openSync(join(this.directory(),`${attempt.id}.json`),'wx',0o600);
      try{writeFileSync(fd,JSON.stringify(attempt));fsyncSync(fd);}finally{closeSync(fd);}
      this.syncDirectory();return {...attempt,sidecar:true};
    }
  }
  complete(attempt:Attempt & {sidecar:boolean}) {
    if(attempt.sidecar){unlinkSync(join(this.directory(),`${attempt.id}.json`));this.syncDirectory();}
    else this.store.run('DELETE FROM collection_attempts WHERE id=?',attempt.id);
  }
  sidecars():Attempt[] {
    if(this.store.path===':memory:')return [];
    let names:string[];try{names=readdirSync(this.directory());}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;}
    return names.map(name=>{
      const item=JSON.parse(readFileSync(join(this.directory(),name),'utf8')) as Attempt;
      if(name!==`${item.id}.json`||typeof item.article_id!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(item.occurred_at))throw Error('Invalid durable collection coverage journal');
      return item;
    });
  }
  gaps():Row[] {
    const recorded=this.store.all('SELECT c.*,a.owner_id,a.language FROM collection_attempts c JOIN articles a ON a.id=c.article_id');
    const known=new Set(recorded.map(item=>item.id));
    return [...recorded,...this.sidecars().filter(item=>!known.has(item.id)).flatMap(item=>{
      const article=this.store.get('SELECT owner_id,language FROM articles WHERE id=?',item.article_id);
      return article?[{...item,...article}]:[];
    })];
  }
  checkpoint() {
    for(const item of this.sidecars())this.store.run('INSERT OR IGNORE INTO collection_attempts VALUES (?,?,?)',item.id,item.article_id,item.occurred_at);
  }
}

/** Hash reviewable source only; runtime data and credentials are never included. */
import {readdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function sourceFingerprint(root=process.cwd()) {
  const paths=['package.json','package-lock.json','tsconfig.json','.env.example'];
  async function walk(directory: string) {
    for(const entry of await readdir(join(root,directory),{withFileTypes:true})) {
      if(entry.name.startsWith('.') || entry.name==='__pycache__' || entry.name.endsWith('.pyc'))continue;
      const path=`${directory}/${entry.name}`;
      if(entry.isDirectory())await walk(path);else if(entry.isFile())paths.push(path);
    }
  }
  for(const directory of ['src','web','scripts','test','infra'])await walk(directory);
  const files: Array<{path:string;sha256:string}>=[];for(const path of paths.sort())files.push({path,sha256:createHash('sha256').update(await readFile(join(root,path))).digest('hex')});
  return {algorithm:'sha256',manifestDigest:createHash('sha256').update(JSON.stringify(files)).digest('hex'),files};
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href)process.stdout.write(JSON.stringify(await sourceFingerprint(),null,2)+'\n');

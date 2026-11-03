import {readFile, realpath} from 'node:fs/promises';
import {join, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import type {FastifyInstance} from 'fastify';
import {AppError} from './errors.ts';

const studioDirectory=fileURLToPath(new URL('../web/studio',import.meta.url));
function assetType(path:string){
  if(path==='styles.css'||path==='studio.css')return 'text/css; charset=utf-8';
  if(path==='vendor/markdown-it.js'||/^dist\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.js$/.test(path))return 'text/javascript; charset=utf-8';
  return null;
}
async function publishedFile(root:string,path:string){
  try{
    const base=await realpath(root),file=await realpath(join(base,path)),location=relative(base,file);
    if(!location||location.startsWith(`..${sep}`)||location==='..'||location.startsWith(sep))throw new AppError(404,'NOT_FOUND','Studio resource not found');
    return await readFile(file);
  }catch(error){
    if(error instanceof AppError)throw error;
    if(['ENOENT','ENOTDIR','EISDIR','ELOOP'].includes((error as NodeJS.ErrnoException).code??''))throw new AppError(404,'NOT_FOUND','Studio resource not found');
    throw error;
  }
}
/** Only deployable browser assets are public; source and project files stay private. */
export function installStudioAssets(app:FastifyInstance,root=studioDirectory){
  for(const path of ['/studio','/studio/'])app.get(path,async(_request,reply)=>reply.type('text/html; charset=utf-8').send(await publishedFile(root,'index.html')));
  app.get('/studio/assets/*',async(request,reply)=>{
    const path=(request.params as {'*':string})['*'],mime=assetType(path);
    if(!mime)throw new AppError(404,'NOT_FOUND','Studio resource not found');
    return reply.type(mime).send(await publishedFile(root,path));
  });
}

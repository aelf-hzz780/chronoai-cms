/** Runs only in the explicit local integration helper, using official cached Ghost's Node runtime. */
import {createServer,connect} from 'node:net';
import {mkdir,symlink,readFile,readlink} from 'node:fs/promises';
const servers=[];
for(const [owner,language,port] of [['personal','en',2568],['personal','zh',2569],['organization','en',2578],['organization','zh',2579]]) {
  const directory=`/mounted/${owner}-${language}/images/chrono`;
  await mkdir(directory,{recursive:true});await mkdir('/app/.runtime/shared-media',{recursive:true});
  const link=`/app/.runtime/shared-media/${owner}-${language}`;
  try{await symlink(directory,link);}catch(error){if(error.code!=='EEXIST'||await readlink(link)!==directory)throw error;}
  const server=createServer(socket=>{
    const upstream=connect(2368,`blogsystem-dev-${owner}-ghost-${language}-1`);
    socket.pipe(upstream);upstream.pipe(socket);
    socket.on('error',()=>upstream.destroy());upstream.on('error',()=>socket.destroy());
    socket.on('close',()=>upstream.destroy());upstream.on('close',()=>socket.destroy());
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});servers.push(server);
}
const build=JSON.parse(await readFile('/app/build.json','utf8'));
process.env.INTEGRATION_BUILD_REVISION=build.revision;
process.env.INTEGRATION_WORKTREE_DIRTY=String(build.dirty);
process.env.RENDER_BROWSER_EXECUTABLE='/usr/bin/chromium';
process.env.RENDER_BROWSER_SANDBOX='false'; // Only this isolated synthetic helper runs as root.
process.env.RENDER_ASSET_ORIGINS='https://cdn.jsdelivr.net';
process.env.INTEGRATION_MEDIA_ROOT='/app/.runtime/shared-media';
try {await import('./four-ghost.integration.ts');} finally {for(const server of servers) server.closeAllConnections?.();for(const server of servers)server.close();}

/** Runs only in the explicit local integration helper, using official cached Ghost's Node runtime. */
import {createServer,connect} from 'node:net';
import {mkdir,symlink} from 'node:fs/promises';
const servers=[];
for(const [owner,language,port] of [['personal','en',2568],['personal','zh',2569],['organization','en',2578],['organization','zh',2579]]) {
  const directory=`/mounted/${owner}-${language}/images/chrono`;
  await mkdir(directory,{recursive:true});await mkdir('/app/.runtime/shared-media',{recursive:true});
  await symlink(directory,`/app/.runtime/shared-media/${owner}-${language}`);
  const server=createServer(socket=>{
    const upstream=connect(2368,`blogsystem-dev-${owner}-ghost-${language}-1`);
    socket.pipe(upstream);upstream.pipe(socket);
    socket.on('error',()=>upstream.destroy());upstream.on('error',()=>socket.destroy());
    socket.on('close',()=>upstream.destroy());upstream.on('close',()=>socket.destroy());
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});servers.push(server);
}
process.env.INTEGRATION_MEDIA_ROOT='/app/.runtime/shared-media';
try {await import('./four-ghost.integration.ts');} finally {for(const server of servers) server.closeAllConnections?.();for(const server of servers)server.close();}

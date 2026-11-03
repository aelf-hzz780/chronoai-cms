#!/usr/bin/env node
import {copyFile,cp,mkdtemp,readFile,rm} from 'node:fs/promises';
import {constants} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const usage='node themes/chronoai-b/pack.mjs --author-email <real-maintainer-email> --output <new-file.zip> [--fixture]';
const args=process.argv.slice(2);
let email='',output='',fixture=false;
try{
 if(args.includes('--help')){process.stdout.write(usage+'\n');process.exit(0);}
 for(let index=0;index<args.length;index++){
  const key=args[index];
  if(key==='--fixture')fixture=true;
  else if(key==='--author-email')email=args[++index]??'';
  else if(key==='--output')output=args[++index]??'';
  else throw new Error('Unknown packaging argument: '+key);
 }
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('A real author email is required. Source metadata is intentionally incomplete.');
 if(!output.endsWith('.zip'))throw new Error('Choose an explicit new .zip output path.');
 const reserved=email.toLowerCase().endsWith('.invalid');
 if(reserved&&!fixture)throw new Error('A reserved .invalid email is allowed only with --fixture.');
 if(fixture&&(!reserved||!basename(output).endsWith('.fixture.zip')))throw new Error('Fixture validation requires a reserved .invalid email and a .fixture.zip filename.');
 const theme=fileURLToPath(new URL('.',import.meta.url));
 const staging=await mkdtemp(join(tmpdir(),'chronoai-b-theme-'));
 try{
  const entries=['default.hbs','index.hbs','post.hbs','page.hbs','tag.hbs','author.hbs','partials','assets','locales','LICENSE'];
  for(const entry of entries)await cp(join(theme,entry),join(staging,entry),{recursive:true});
  const metadata=JSON.parse(await readFile(join(theme,'package.json'),'utf8'));
  metadata.author={...metadata.author,email};
  const {writeFile}=await import('node:fs/promises');await writeFile(join(staging,'package.json'),JSON.stringify(metadata,null,2)+'\n');
  const archive=join(staging,'theme.zip');
  execFileSync('zip',['-r','-q',archive,'package.json',...entries],{cwd:staging,stdio:'pipe'});
  const target=resolve(output);
  await copyFile(archive,target,constants.COPYFILE_EXCL);
  const sha256=createHash('sha256').update(await readFile(target)).digest('hex');
  process.stdout.write(JSON.stringify({output:target,sha256,fixtureOnly:fixture,ghost:metadata.engines.ghost})+'\n');
 }finally{await rm(staging,{recursive:true,force:true});}
}catch(error){process.stderr.write((error instanceof Error?error.message:'Theme packaging failed')+'\n'+usage+'\n');process.exitCode=1;}

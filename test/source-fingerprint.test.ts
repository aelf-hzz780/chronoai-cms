import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {sourceFingerprint,studioAssetsFingerprint} from '../scripts/source-fingerprint.ts';
import {integrationPackageInputs} from '../scripts/integration-package.ts';

async function sourceFixture(t:any){
  const root=await mkdtemp(join(tmpdir(),'cms-source-hash-'));t.after(()=>rm(root,{recursive:true,force:true}));
  for(const directory of ['src','web/studio/src','scripts','test','infra','themes/sample'])await mkdir(join(root,directory),{recursive:true});
  for(const name of ['package.json','package-lock.json','tsconfig.json'])await writeFile(join(root,name),'{}\n');await writeFile(join(root,'.env.example'),'PUBLIC_URL=\n');
  await writeFile(join(root,'web/studio/src/main.ts'),'export const title: string = "Studio";\n');await writeFile(join(root,'themes/sample/index.hbs'),'<h1>{{title}}</h1>\n');
  await writeFile(join(root,'web/studio/index.html'),'<script type="module" src="/studio/assets/dist/main.js"></script>\n');
  await writeFile(join(root,'tsconfig.studio.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'ES2022',types:[],rootDir:'web/studio/src',outDir:'web/studio/dist'},include:['web/studio/src/**/*.ts']}));return root;
}
test('C10: a real Studio build never changes reviewable source hash; theme and Studio config edits do',async t=>{
  const root=await sourceFixture(t),before=await sourceFingerprint(root),beforeAssets=await studioAssetsFingerprint(root);
  assert.ok(before.files.some(file=>file.path==='tsconfig.studio.json'));assert.ok(before.files.some(file=>file.path==='themes/sample/index.hbs'));
  execFileSync(process.execPath,[resolve('node_modules/typescript/bin/tsc'),'-p',join(root,'tsconfig.studio.json')],{stdio:'pipe'});
  assert.match(await readFile(join(root,'web/studio/dist/main.js'),'utf8'),/Studio/);assert.equal((await sourceFingerprint(root)).manifestDigest,before.manifestDigest);
  const assets=await studioAssetsFingerprint(root);assert.notEqual(assets.manifestDigest,beforeAssets.manifestDigest);assert.deepEqual(assets.files.map(file=>file.path),['web/studio/dist/main.js','web/studio/index.html']);
  await writeFile(join(root,'themes/sample/index.hbs'),'<article>{{title}}</article>\n');const theme=await sourceFingerprint(root);assert.notEqual(theme.manifestDigest,before.manifestDigest);
  await writeFile(join(root,'tsconfig.studio.json'),(await readFile(join(root,'tsconfig.studio.json'),'utf8'))+'\n');assert.notEqual((await sourceFingerprint(root)).manifestDigest,theme.manifestDigest);
});
test('C10: the explicit integration package carries clean Studio/theme sources and can build without a pre-existing dist',async t=>{
  const root=await sourceFixture(t),directory=await mkdtemp(join(tmpdir(),'cms-package-hash-'));t.after(()=>rm(directory,{recursive:true,force:true}));await mkdir(join(root,'node_modules'));await writeFile(join(root,'.env'),'PRIVATE_ENV=not-packaged');
  await writeFile(join(root,'scripts/source-fingerprint.ts'),await readFile(resolve('scripts/source-fingerprint.ts')));
  const archive=join(directory,'package.tgz'),extracted=join(directory,'extracted');await mkdir(extracted);
  execFileSync('tar',['-czf',archive,...integrationPackageInputs],{cwd:root,stdio:'pipe'});execFileSync('tar',['-xzf',archive,'-C',extracted],{stdio:'pipe'});
  const names=execFileSync('tar',['-tzf',archive],{encoding:'utf8'});assert.match(names,/tsconfig\.studio\.json/);assert.match(names,/themes\/sample\/index\.hbs/);assert.match(names,/web\/studio\/src\/main\.ts/);assert.match(names,/scripts\/source-fingerprint\.ts/);assert.match(await readFile(join(extracted,'scripts/source-fingerprint.ts'),'utf8'),/export async function sourceFingerprint/);assert.ok(!names.includes('.env'));
  execFileSync(process.execPath,[resolve('node_modules/typescript/bin/tsc'),'-p',join(extracted,'tsconfig.studio.json')],{stdio:'pipe'});assert.match(await readFile(join(extracted,'web/studio/dist/main.js'),'utf8'),/Studio/);
});
test('C10: source hashes exclude generated dependencies, fixture archives and private runtime/key material',async t=>{
  const root=await sourceFixture(t),before=await sourceFingerprint(root);
  for(const directory of ['web/studio/dist','web/node_modules/transitive','themes/sample/dist','web/.runtime'])await mkdir(join(root,directory),{recursive:true});
  for(const [path,value] of [['web/studio/dist/main.js','generated'],['web/node_modules/transitive/index.js','dependency'],['themes/sample/dist/theme.zip','zip'],['web/fixture.zip','zip'],['web/runtime.sqlite','sqlite'],['web/key.pem','PRIVATE KEY'],['web/.env','SECRET=value'],['web/.runtime/credentials.json','secret']])await writeFile(join(root,path),value!);
  const after=await sourceFingerprint(root);assert.equal(after.manifestDigest,before.manifestDigest);assert.ok(!after.files.some(file=>/dist|node_modules|\.zip|\.sqlite|\.pem|\.env$|\.runtime/.test(file.path)));
});

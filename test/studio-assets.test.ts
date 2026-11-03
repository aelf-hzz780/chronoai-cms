import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, symlink, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import Fastify from 'fastify';
import {fixture} from './helpers.ts';
import {createApp} from '../src/app.ts';
import {Vault} from '../src/vault.ts';

test('WP01: Studio and its explicit compiled assets are served under unchanged CSP while the legacy entry remains available',async t=>{
  const f=fixture(),app=await createApp({...f,vault:new Vault('ab'.repeat(32)),publicUrl:'https://cms.example',authenticate:async()=>null});
  t.after(async()=>{await app.close();f.store.close();});
  for(const path of ['/studio','/studio/']){
    const response=await app.inject({url:path});assert.equal(response.statusCode,200,response.body);assert.match(String(response.headers['content-type']),/text\/html/);assert.match(response.body,/\/studio\/assets\/dist\/main\.js/);
    const csp=String(response.headers['content-security-policy']);assert.match(csp,/script-src 'self'/);assert.ok(!csp.includes('unsafe-inline'));
  }
  for(const [path,mime] of [['styles.css','text/css'],['studio.css','text/css'],['dist/main.js','text/javascript'],['vendor/markdown-it.js','text/javascript']]){
    const response=await app.inject({url:`/studio/assets/${path}`});assert.equal(response.statusCode,200,response.body);assert.match(String(response.headers['content-type']),new RegExp(mime!));
  }
  for(const path of ['/','/app.js','/style.css'])assert.equal((await app.inject({url:path})).statusCode,200);
});

test('WP01: Studio refuses project source, maps, dotfiles, traversal and unpublished assets',async t=>{
  const f=fixture(),app=await createApp({...f,vault:new Vault('ab'.repeat(32)),publicUrl:'https://cms.example',authenticate:async()=>null});
  t.after(async()=>{await app.close();f.store.close();});
  for(const path of ['src/main.ts','dist/main.js.map','.env','dist/.secret.js','dist/nested/.secret.js','vendor/markdown-it.LICENSE','package.json','../src/auth.ts','%2e%2e/src/auth.ts','dist/%2e%2e/%2e%2e/src/auth.ts','dist/main.js%00','dist%5cmain.js']){
    const response=await app.inject({url:`/studio/assets/${path}`});assert.ok([400,404].includes(response.statusCode),`${path}: ${response.statusCode}`);assert.ok(!response.body.includes('AuthManager'));
  }
});

test('WP01: an allowlisted filename cannot escape the Studio root through a symlink',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'cms-studio-assets-')),root=join(directory,'studio');await mkdir(join(root,'dist'),{recursive:true});
  await writeFile(join(root,'index.html'),'<p>Studio fixture</p>');await writeFile(join(directory,'secret.js'),'DO_NOT_SERVE');await symlink(join(directory,'secret.js'),join(root,'dist','escape.js'));
  const app=Fastify();t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});
  const {installStudioAssets}=await import('../src/studio-assets.ts');installStudioAssets(app,root);
  const response=await app.inject({url:'/studio/assets/dist/escape.js'});assert.equal(response.statusCode,404);assert.ok(!response.body.includes('DO_NOT_SERVE'));
  await mkdir(join(root,'nested'));await symlink(join(directory,'secret.js'),join(root,'index.html.link'));
  assert.equal((await app.inject({url:'/studio/assets/index.html.link'})).statusCode,404);
});

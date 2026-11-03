import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const theme=new URL('../themes/chronoai-b/',import.meta.url);
const read=(path:string)=>readFile(new URL(path,theme),'utf8');
test('Ghost theme preserves native rendering, injection hooks and canonical routing without private CMS dependencies',async()=>{
 const layout=await read('default.hbs');
 assert.match(layout,/<html lang="\{\{@site.locale\}\}"/);
 for(const helper of ['ghost_head','ghost_foot','body_class'])assert.equal((layout.match(new RegExp('\\{\\{'+helper+'\\}\\}','g'))??[]).length,1);
 assert.match(layout,/\{\{\{body\}\}\}/);
 assert.ok(layout.indexOf('{{ghost_head}}')<layout.indexOf('</head>'));
 assert.ok(layout.indexOf('{{ghost_foot}}')>layout.indexOf('{{{body}}}'));
 for(const name of ['post.hbs','page.hbs']){const template=await read(name);assert.equal((template.match(/<h1>\{\{title\}\}<\/h1>/g)??[]).length,1);assert.equal((template.match(/\{\{content\}\}/g)??[]).length,1);assert.match(template,/\{\{post_class\}\}/);}
 for(const path of ['index.hbs','tag.hbs','author.hbs'])assert.match(await read(path),/\{\{> "feed"\}\}/);
 const feed=await read('partials/feed.hbs');assert.match(feed,/\{\{#foreach posts\}\}/);assert.match(feed,/\{\{pagination\}\}/);
 const pagination=await read('partials/pagination.hbs');assert.match(pagination,/page_url prev/);assert.match(pagination,/page_url next/);
 const all=(await Promise.all(['default.hbs','index.hbs','post.hbs','page.hbs','tag.hbs','author.hbs','partials/feed.hbs','partials/post-card.hbs','assets/css/screen.css'].map(read))).join('\n');
 assert.doesNotMatch(all,/\/api\/cms|\/api\/service|tracker\.js|fetch\(|localStorage|sessionStorage|hreflang=|rel="canonical"|fonts\.google|cdn\./i);
 assert.match(await read('partials/byline.hbs'),/\{\{authors\}\}/);
 assert.match(await read('partials/byline.hbs'),/datetime="\{\{date format="YYYY-MM-DD"\}\}"/);
 assert.match(await read('partials/header.hbs'),/\{\{navigation\}\}/);
 assert.match(await read('partials/footer.hbs'),/\{\{navigation type="secondary"\}\}/);
});
test('Ghost theme packaging requires a supplied maintainer address and labels fixture-only packages',()=>{
 const script=fileURLToPath(new URL('pack.mjs',theme));
 const missing=spawnSync(process.execPath,[script],{encoding:'utf8'});assert.equal(missing.status,1);assert.match(missing.stderr,/real author email is required/);
 const reserved=spawnSync(process.execPath,[script,'--author-email','theme-validation@example.invalid','--output','/tmp/rejected-theme.zip'],{encoding:'utf8'});assert.equal(reserved.status,1);assert.match(reserved.stderr,/only with --fixture/);
 const mislabelled=spawnSync(process.execPath,[script,'--author-email','theme-validation@example.invalid','--fixture','--output','/tmp/rejected-theme.zip'],{encoding:'utf8'});assert.equal(mislabelled.status,1);assert.match(mislabelled.stderr,/\.fixture\.zip/);
});
test('Ghost theme localizes every t helper key and packages native cards with bounded compatibility',async()=>{
 const metadata=JSON.parse(await read('package.json'));
 assert.equal(metadata.name,'chronoai-b');assert.match(metadata.engines.ghost,/>=6/);assert.equal(metadata.config.card_assets,true);assert.ok(metadata.config.posts_per_page>0&&metadata.config.posts_per_page<=24);
 const paths:string[]=[];
 async function templates(directory=''){for(const file of await readdir(new URL(directory||'.',theme),{withFileTypes:true})){const path=directory+file.name;if(file.isDirectory()&&file.name==='partials')await templates(path+'/');else if(file.isFile()&&path.endsWith('.hbs'))paths.push(path);}}
 await templates();const source=(await Promise.all(paths.map(read))).join('\n');
 const keys=[...source.matchAll(/\bt "([^"]+)"/g)].map(match=>match[1]);
 for(const locale of ['en','zh','zh-CN']){const dictionary=JSON.parse(await read(`locales/${locale}.json`));for(const key of keys)assert.ok(typeof dictionary[key]==='string'&&dictionary[key].length>0,`${locale}: ${key}`);}
 assert.ok(keys.length>5);assert.doesNotMatch(source,/<script\b|data-portal|data-members-form/);
});

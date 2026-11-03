import type {Language,Workspace,TaskKind} from './types.js';
import {taskAssetBase} from './task-model.js';
import {translator} from './i18n.js';
export function escape(value:unknown):string{return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
export function button(label:string,action:string,classes='',disabled=false):string{return `<button type="button" class="btn ${classes}" data-action="${escape(action)}" ${disabled?'disabled':''}>${escape(label)}</button>`;}
export function badge(label:string,color='neutral'):string{return `<span class="badge ${color}">${escape(label)}</span>`;}
export function short(value:string):string{return value.slice(0,8);}
export function date(value:string,locale:Language):string {const parsed=new Date(value);return Number.isNaN(parsed.valueOf())?'—':new Intl.DateTimeFormat(locale==='en'?'en-GB':'zh-CN',{dateStyle:'medium',timeStyle:'short'}).format(parsed);}
export function shell(content:string,workspaces:Workspace[],owner:Workspace,subject:string,locale:Language,route:string):string {
 const t=translator(locale);
 const routeLabel=route==='connections'?t('connections'):route==='distribution'?t('distribution'):route==='analytics'?t('analytics'):route==='members'?t('members'):route==='guide'?t('guide'):route==='tasks'||route==='task'?t('tasks'):route==='publish'?t('publicationReview'):route==='article'||route==='new'?t('studio'):t(route==='settings'?'settings':route==='onboarding'?'guide':'content');
 return `<div class="shell"><aside class="sidebar"><a class="wordmark" href="/studio"><span class="brand-symbol">◈</span><span>ChronoAI<small>PUBLISHING STUDIO</small></span></a><label class="workspace-switch"><span class="workspace-avatar">${escape(owner.name.slice(0,2).toUpperCase())}</span><span><small>${t('workspace')}</small><select id="workspace" aria-label="${t('selectWorkspace')}">${workspaces.map(w=>`<option value="${escape(w.id)}" ${w.id===owner.id?'selected':''}>${escape(w.name)} · ${escape(w.role)}</option>`).join('')}</select></span></label><div class="nav-label">WORKSPACE</div><nav class="nav" aria-label="${t('workspace')}"><a href="#/content" class="nav-item ${route==='content'?'active':''}"><span>▤</span>${t('content')}</a><a href="#/tasks" class="nav-item ${route==='tasks'||route==='task'?'active':''}"><span>↗</span>${t('tasks')}</a>${owner.capabilities.canReadConnections?`<a href="#/connections" class="nav-item ${route==='connections'?'active':''}"><span>⇄</span>${t('connections')}</a>`:''}${owner.capabilities.canReadMetrics?`<a href="#/analytics" class="nav-item ${route==='analytics'?'active':''}"><span>↝</span>${t('analytics')}</a>`:''}${owner.capabilities.canManagePublishers?`<a href="#/members" class="nav-item ${route==='members'?'active':''}"><span>♙</span>${t('members')}</a>`:''}<a href="#/settings" class="nav-item ${route==='settings'?'active':''}"><span>◫</span>${t('settings')}</a><a href="#/guide" class="nav-item ${route==='guide'||route==='onboarding'?'active':''}"><span>◇</span>${t('guide')}</a></nav><div class="sidebar-foot"><div class="connection-note">${t('session')}</div><div class="profile"><span class="avatar purple">${escape(subject.slice(0,2).toUpperCase())}</span><div class="identity-label"><strong>${escape(subject)}</strong><small>${escape(owner.role)} · ${t(owner.kind)}</small></div></div></div></aside><div class="app-body"><header class="topbar"><div class="breadcrumb">${escape(owner.name)}<span>/</span><span>${routeLabel}</span></div><div class="top-actions"><select id="locale" aria-label="${t('interface')}"><option value="en" ${locale==='en'?'selected':''}>EN</option><option value="zh" ${locale==='zh'?'selected':''}>简中</option></select><a href="/" class="text-link">${t('legacy')}</a>${button(t('logout'),'logout','quiet')}</div></header><main id="main-content" class="main" tabindex="-1"><div id="notice" aria-live="polite"></div>${content}</main></div></div>`;
}
export function siteCards(sites:import('./types.js').Site[],locale:Language):string {const t=translator(locale);return `<div class="studio-sites">${sites.map(site=>`<section class="panel aside-panel"><div class="site-heading"><h2>${site.language==='en'?'English':'简体中文'}</h2>${badge(t(site.configured?'configured':'unconfigured'),site.configured?'green':'amber')}</div><p class="secondary">${escape(site.publicUrl??'—')}</p><p>${badge(t(site.verification.status==='verified'?'verified':'unknown'),site.verification.status==='verified'?'green':'neutral')}</p>${site.verification.checkedAt?`<p class="aside-note">${date(site.verification.checkedAt,locale)}</p>`:''}${site.blockers.map(blocker=>`<p class="aside-note">${escape(blocker)}</p>`).join('')}</section>`).join('')}</div>`;}
export interface PreviewScope {ownerId:string;kind:TaskKind;id:string}
export function renderPreview(source:string,scope?:PreviewScope):string {
 const runtime=(globalThis as unknown as {markdownit?: (options:object)=>{render(source:string):string}}).markdownit;
 if(!runtime)return `<pre>${escape(source)}</pre>`;
 const base=scope?taskAssetBase(scope):'/api/cms/assets/';
 return sanitizePreview(runtime({html:false,linkify:false,typographer:false}).render(source.replace(/^\uFEFF/,'').replace(/asset:([a-f0-9-]{36})/g,(_match,id:string)=>base+id)),scope);
}
export function sanitizePreview(html:string,scope?:PreviewScope):string {
 const template=document.createElement('template');template.innerHTML=html;
 const tags=new Set(['P','BR','H1','H2','H3','H4','H5','H6','BLOCKQUOTE','UL','OL','LI','PRE','CODE','EM','STRONG','HR','A','IMG','TABLE','THEAD','TBODY','TR','TH','TD','S','DEL']);
 for(const element of Array.from(template.content.querySelectorAll('*'))){
  if(!tags.has(element.tagName)){element.replaceWith(...Array.from(element.childNodes));continue;}
  for(const attribute of Array.from(element.attributes))if(!['href','src','alt','title'].includes(attribute.name))element.removeAttribute(attribute.name);
  if(element.tagName==='A'){const href=element.getAttribute('href')??'';if(!/^https?:\/\//i.test(href)&&!/^#[a-zA-Z0-9_-]+$/.test(href))element.removeAttribute('href');element.setAttribute('rel','noopener noreferrer');}
  if(element.tagName==='IMG'){
   const src=element.getAttribute('src')??'',base=scope?taskAssetBase(scope):'/api/cms/assets/';
   if(!src.startsWith(base)||!/^[a-f0-9-]{36}$/.test(src.slice(base.length)))element.replaceWith(document.createTextNode('[Image omitted: outside authorized preview context]'));
  }
 }
 return template.innerHTML;
}

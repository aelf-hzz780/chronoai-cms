'use strict';
// Load after localization so dynamic UI copy is translated without touching drafts.
const legacyGuide=guidePage;
pageRenderers.guide=()=>legacyGuide()+`<section class="panel workflow-task"><h2>${txt('本轮交互已补齐','Workflow updates in this prototype')}</h2><p>${txt('按语言跟进提交；原文任务跨页面继续；私有图片与实际 Markdown 预览；确定修订查看与下载；全文或摘要分发；已知副本纠错与移除；人工投稿结果记录。','Language-specific submissions; original jobs continue across pages; private images and exact Markdown previews; immutable revision viewing and downloads; full or excerpt distribution; updates and removal for known copies; assisted submission follow-up.')}</p><p>${txt('延迟任务在到期后由人继续，不代表已经交付自动调度。连接绑定、权限能力、媒体转存与统计数据在原型中为本地模拟，仍需真实接口集成与验收。','Delayed tasks need human action when due; no automatic scheduler is implied. Connection binding, management capability, media transfer and metrics are local simulations and still require real integration and acceptance.')}</p></section>`;
articleTaskCounts=()=>{const jobs=copyTasks();return {pending:jobs.filter(j=>!['published','removed','cancelled'].includes(j.status)).length,published:jobs.filter(j=>j.status==='published').length};};
const publicBlogRenderer=pageRenderers.blog,publicStoryRenderer=pageRenderers.story;
function unavailablePublicSite(){return `<div class="reader-not-found">${emptyState(txt('站点不可用','Site unavailable'),txt('这个公开站点不存在，未替换为其他工作区。','This public site does not exist. No other workspace has been substituted.'),routeButton('返回工作台','content','primary'))}</div>`;}
pageRenderers.blog=()=>workspaces[site.publicOwner]?publicBlogRenderer():unavailablePublicSite();
pageRenderers.story=()=>workspaces[site.publicOwner]?publicStoryRenderer():unavailablePublicSite();
syncPublicRoute();render();

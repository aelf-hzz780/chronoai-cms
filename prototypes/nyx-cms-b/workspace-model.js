'use strict';
// Prototype contracts. No credentials, API requests, or real permission changes.
const workspaces={org:{id:'org',kind:'organization',name:'ChronoAI',slug:'chronoai',role:'publisher',member:true,management:true},personal:{id:'personal',kind:'personal',name:'Jing’s workspace',slug:'jing',role:'owner',member:true,management:false},lab:{id:'lab',kind:'organization',name:'Research Lab',slug:'research',role:'member',member:true,management:true}};
let membershipScenario='standard';
function workspaceKind(id=state.workspace){return workspaces[id]?.kind;}
function workspaceLabel(id=state.workspace){return workspaces[id]?.name||'Workspace unavailable';}
function accessibleWorkspace(id){return !!workspaces[id]?.member&&(id==='personal'||!['personal-only','unavailable'].includes(membershipScenario))&&(id!=='lab'||membershipScenario==='multiple');}
function availableWorkspaces(){return Object.values(workspaces).filter(w=>accessibleWorkspace(w.id));}
function canPublishOwner(id){const w=workspaces[id];return site.signedIn&&accessibleWorkspace(id)&&(w.kind==='personal'||['publisher','admin'].includes(w.role));}
function canManagePublishers(id=state.workspace){const w=workspaces[id];return site.signedIn&&accessibleWorkspace(id)&&w?.kind==='organization'&&w.role==='admin'&&w.management;}
function defaultArticle(id){return articles.find(a=>a.owner===id&&a.creator==='self')?.id||'';}

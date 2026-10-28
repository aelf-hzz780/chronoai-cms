const $ = id => document.getElementById(id);
let csrf, current, me;
function notice(message) { $('notice').textContent = message; }
async function api(path, method = 'GET', body) {
  const response = await fetch(`/api/cms${path}`, { method, headers: { 'content-type': 'application/json', ...(csrf ? { 'x-csrf-token': csrf } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (!response.ok) { const error = await response.json(); throw new Error(`${error.message} · ${error.code} · Trace ${error.traceId}`); }
  return response.json();
}
function act(id, handler) { $(id).addEventListener('click', () => Promise.resolve().then(handler).catch(error => notice(error.message))); }
async function list() {
  const rows = await api(`/articles?ownerId=${encodeURIComponent($('owner').value)}&q=${encodeURIComponent($('search').value)}`);
  $('articles').replaceChildren(...rows.map(article => { const button = document.createElement('button'); button.className = 'article'; button.textContent = `${article.language.toUpperCase()} · ${article.revision.title}`; button.onclick = () => openArticle(article).catch(e => notice(e.message)); return button; }));
}
function reset() { current = null; for (const id of ['title', 'markdown', 'revision']) $(id).value = ''; $('author').value = me.subject; $('editor-heading').textContent = '新建草稿'; $('language').disabled = false; $('revision').textContent = ''; $('history').replaceChildren(); $('releases').replaceChildren(); $('preview-frame').hidden = true; }
async function openArticle(article) {
  current = article; $('title').value = article.revision.title; $('markdown').value = article.revision.markdown; $('author').value = article.revision.creditedAuthor; $('language').value = article.language; $('language').disabled = true;
  $('editor-heading').textContent = article.revision.title; $('revision').textContent = `Revision ${article.revision.id} · SHA-256 ${article.revision.digest}${article.translation?.outdated ? ' · 译文已过期' : ''}`;
  const revisions = await api(`/articles/${article.id}/revisions`);
  $('history').replaceChildren(...revisions.map(r => { const p = document.createElement('p'); p.textContent = `${r.created_at} · ${r.title} · ${r.id}`; return p; }));
}
act('new', reset); act('refresh', list); $('owner').addEventListener('change', () => { reset(); list().catch(e => notice(e.message)); });
act('save', async () => {
  const data = { title: $('title').value, markdown: $('markdown').value, creditedAuthor: $('author').value };
  const article = current ? await api(`/articles/${current.id}`, 'PATCH', { ...data, expectedRevision: current.revision.id }) : await api('/articles', 'POST', { ...data, ownerId: $('owner').value, language: $('language').value });
  await openArticle(article); await list(); notice('已保存不可变修订。');
});
function selected() { if (!current) throw new Error('请先保存文章。'); return current; }
act('submit', async () => { const a = selected(); await api(`/articles/${a.id}/submit`, 'POST', { revisionId: a.revision.id }); notice('已提交此确定版本；后续编辑不会改变提交内容。'); });
act('preview', async () => { const a = selected(); const p = await api(`/articles/${a.id}/preview`); $('preview-frame').hidden = false; $('preview-frame').srcdoc = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'none'">${p.html}`; notice('预览已保存版本；不采集阅读指标。'); });
act('export', () => { const a = selected(); window.location.assign(`/api/cms/articles/${a.id}/markdown?revision=${encodeURIComponent(a.revision.id)}`); });
$('import').addEventListener('change', async event => { try { const file = event.target.files[0]; if (file.size > 2_000_000) throw new Error('Markdown 最大 2 MB'); $('markdown').value = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer()); notice('原文已导入编辑区，请保存。'); } catch (e) { notice(e.message); } });
$('image').addEventListener('change', async event => { try { const a = selected(), file = event.target.files[0]; if (file.size > 5_000_000) throw new Error('图片最大 5 MB'); const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); const asset = await api(`/articles/${a.id}/assets`, 'POST', { mime: file.type, base64: btoa(binary) }); $('markdown').value += `\n${asset.markdown}\n`; notice('图片已私有保存；请保存文章修订。'); } catch (e) { notice(e.message); } });
act('link-translation', async () => { const a = selected(); await openArticle(await api(`/articles/${a.id}/translation`, 'POST', { sourceArticleId: $('source-article').value, sourceRevisionId: $('source-revision').value })); });
act('logout', async () => { const response = await fetch('/auth/logout', { method: 'POST', headers: { 'x-csrf-token': csrf } }); if (!response.ok) throw new Error('退出失败，请重试。'); location.reload(); });
for (const action of ['publish', 'unpublish']) act(action, async () => { const a = selected(); if (!$('rights').checked) throw new Error('请先确认文字与图片权利。'); const release = await api(`/articles/${a.id}/releases`, 'POST', { revisionId: a.revision.id, action, rightsConfirmed: true, creditedAuthor: a.revision.creditedAuthor, ownerId: a.ownerId, idempotencyKey: crypto.randomUUID() }); notice(`发布任务 ${release.id} · ${release.state}`); });
act('metrics', async () => { const q = new URLSearchParams({ ownerId: $('owner').value }); if ($('metric-from').value) q.set('from', $('metric-from').value); if ($('metric-to').value) q.set('to', $('metric-to').value); $('metric-result').textContent = JSON.stringify(await api(`/metrics?${q}`), null, 2); });
try { me = await api('/me'); csrf = me.csrf; $('welcome').hidden = true; $('workspace').hidden = false; $('login').hidden = true; $('logout').hidden = false; $('owner').replaceChildren(...me.workspaces.map(w => { const option = document.createElement('option'); option.value = w.id; option.textContent = w.kind === 'personal' ? 'Publish as myself' : `Publish as ${w.name}`; return option; })); reset(); await list(); }
catch (error) { notice(error.message); }

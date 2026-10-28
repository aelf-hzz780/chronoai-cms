(() => {
  const script = document.currentScript;
  if (!script || navigator.globalPrivacyControl || navigator.doNotTrack === '1') return;
  const key = 'chrono-analytics-consent';
  const required = script.dataset.requireConsent === 'true';
  const zh = document.documentElement.lang.startsWith('zh');
  let choice = null, sent = false;
  try { choice = localStorage.getItem(key); } catch { /* Consent stays unset when storage is unavailable. */ }
  function collect() {
    if (sent || choice === 'no' || (required && choice !== 'yes')) return;
    try {
      const url = new URL(script.dataset.endpoint);
      url.searchParams.set('consent', choice === 'yes' ? '1' : '0');
      // Transmit just the referral origin; page paths and query strings stay private.
      if (document.referrer) url.searchParams.set('referrer', new URL(document.referrer).origin);
      const campaign = new URL(location.href).searchParams.get('utm_source') || '';
      if (/^[a-zA-Z0-9_-]{1,64}$/.test(campaign)) url.searchParams.set('campaign', campaign);
      new Image().src = url.href; sent = true;
    } catch { /* Readership is optional and cannot interrupt the public page. */ }
  }
  const panel = document.createElement('aside');
  panel.setAttribute('aria-label', zh ? '访问统计偏好' : 'Readership privacy preferences');
  const description = document.createElement('p');
  description.textContent = zh ? '是否允许本站记录阅读统计？统计使用每日匿名估算，不保存原始 IP 或来源页面路径。可随时更改选择。' : 'Allow readership analytics for this site? Daily visitor estimates retain neither raw IP addresses nor referral page paths. This choice can be changed at any time.';
  panel.append(description);
  const status = document.createElement('span'); status.setAttribute('aria-live','polite');
  function update(value) {
    choice = value;
    try { localStorage.setItem(key,value); } catch { /* This page honors the choice even without persistent storage. */ }
    status.textContent = value === 'yes' ? (zh ? ' 已允许' : ' Allowed') : (zh ? ' 已拒绝' : ' Declined');
    collect();
  }
  for (const [value,label] of [['yes',zh ? '允许统计' : 'Allow analytics'],['no',zh ? '拒绝统计' : 'Decline analytics']]) {
    const button=document.createElement('button'); button.type='button';button.textContent=label;
    button.addEventListener('click',()=>update(value)); panel.append(button);
  }
  panel.append(status);
  (document.querySelector('footer') || document.body).append(panel);
  if (choice) status.textContent = choice === 'yes' ? (zh ? ' 已允许' : ' Allowed') : (zh ? ' 已拒绝' : ' Declined');
  collect();
})();

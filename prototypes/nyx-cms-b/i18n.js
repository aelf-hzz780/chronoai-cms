'use strict';

// Presentation-only locale. Article language, public site language and domain state
// never change here. Updating existing text nodes preserves unsaved form values,
// textarea selection, file inputs, modal context and in-flight publication state.
let uiLocale = 'en';
try {
  const savedLocale = localStorage.getItem('chronoai-prototype-ui-locale');
  if (['en', 'zh'].includes(savedLocale)) uiLocale = savedLocale;
} catch (error) {
  console.info('[prototype-locale] Preference storage unavailable; using English.', error.name);
}
const effectiveLocale = () => ['blog', 'story'].includes(state.route) ? site.publicLang : uiLocale;
const localizedNodes = new WeakMap();
const localizedAttributes = new WeakMap();
const contentSelector = '[data-i18n-preserve],.language-tab,[data-public-locale],[data-story-locale],textarea,script,style,pre,code,.saved-preview,.article-excerpt,.package-preview,.reading-body,[data-section],#analytics-article option:not([value="all"]),[data-ui-locale] option';
const escapePattern = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let phrasePattern;
function translateUi(text, locale = effectiveLocale()) {
  const original = String(text), trimmed = original.trim();
  if (!trimmed) return original;
  let translated;
  if (locale === 'zh') translated = (uiEnglishToChinese[trimmed] || trimmed).replace(/\bENGLISH\b/g, '英文');
  else if (Object.hasOwn(uiMessages, trimmed)) translated = uiMessages[trimmed];
  else if (uiDynamicMessages.some(([pattern]) => pattern.test(trimmed))) {
    const [pattern, replacement] = uiDynamicMessages.find(([pattern]) => pattern.test(trimmed));
    translated = trimmed.replace(pattern, replacement);
  } else {
    if (!phrasePattern) phrasePattern = new RegExp(Object.keys(uiMessages).filter(k => k.trim().length > 1 && /[\u3400-\u9fff]/.test(k) && !k.includes('{')).sort((a,b) => b.length-a.length).map(escapePattern).join('|'), 'g');
    translated = trimmed.replace(phrasePattern, key => uiMessages[key]);
    for (const [pattern, replacement] of uiPatterns) translated = translated.replace(pattern, replacement);
  }
  return original.slice(0, original.indexOf(trimmed)) + translated + original.slice(original.indexOf(trimmed) + trimmed.length);
}
function canonicalValue(cache, key, current) {
  const prior = cache.get(key);
  return prior && current === prior.rendered ? prior.source : current;
}
function localizeTextNode(node) {
  if (!node.parentElement || node.parentElement.closest(contentSelector)) return;
  const source = canonicalValue(localizedNodes, node, node.nodeValue);
  const rendered = translateUi(source);
  localizedNodes.set(node, {source, rendered});
  if (node.nodeValue !== rendered) node.nodeValue = rendered;
}
function localizeAttributes(element) {
  if (element.closest('[data-i18n-preserve]')) return;
  let cache = localizedAttributes.get(element);
  if (!cache) { cache = new Map(); localizedAttributes.set(element, cache); }
  for (const attribute of ['aria-label', 'placeholder', 'title']) {
    if (!element.hasAttribute(attribute)) continue;
    const source = canonicalValue(cache, attribute, element.getAttribute(attribute));
    const rendered = attribute === 'aria-label' && element.dataset.i18nLabelContent !== undefined
      ? translateUi(element.dataset.i18nLabelPrefix) + element.dataset.i18nLabelContent
      : translateUi(source);
    cache.set(attribute, {source, rendered});
    if (element.getAttribute(attribute) !== rendered) element.setAttribute(attribute, rendered);
  }
}
let localeObserver;
function applyInterfaceLocale() {
  if (!document.createTreeWalker) return; // Small non-browser domain test harness.
  localeObserver?.disconnect();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) localizeTextNode(walker.currentNode);
  document.querySelectorAll('[aria-label],[placeholder],[title]').forEach(localizeAttributes);
  document.querySelectorAll('[data-ui-locale]').forEach(select => { select.value = uiLocale; });
  document.querySelectorAll('.saved-preview,.article-excerpt,#article-title,#markdown').forEach(el => { el.lang = state.lang === 'zh' ? 'zh-CN' : 'en'; });
  document.querySelectorAll('.reading-body,.story-heading h1').forEach(el => { el.lang = site.publicLang === 'zh' ? 'zh-CN' : 'en'; });
  document.documentElement.lang = effectiveLocale() === 'zh' ? 'zh-CN' : 'en';
  document.title = translateUi(routeTitles[state.route] || 'Publishing Studio') + ' · ChronoAI';
  localeObserver?.observe(document.body, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['aria-label','placeholder','title']});
}
function setUiLocale(locale) {
  if (!['en','zh'].includes(locale)) return;
  uiLocale = locale;
  try { localStorage.setItem('chronoai-prototype-ui-locale', locale); }
  catch (error) { console.info('[prototype-locale] Preference retained for this session only.', error.name); }
  applyInterfaceLocale();
}
const renderWithCanonicalCopy = render;
render = function() { renderWithCanonicalCopy(); applyInterfaceLocale(); };
const modalWithCanonicalCopy = modal;
modal = function(...args) { modalWithCanonicalCopy(...args); applyInterfaceLocale(); };
const toastWithCanonicalCopy = toast;
toast = function(...args) { toastWithCanonicalCopy(...args); applyInterfaceLocale(); };
document.addEventListener('change', event => {
  if (event.target.matches('[data-ui-locale]')) setUiLocale(event.target.value);
});
if (typeof MutationObserver !== 'undefined') localeObserver = new MutationObserver(applyInterfaceLocale);
window.addEventListener('pagehide', () => localeObserver?.disconnect());
window.addEventListener('pageshow', applyInterfaceLocale);
applyInterfaceLocale();

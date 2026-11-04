import {badge,escape} from './components.js';
import type {Language} from './types.js';

/** Studio rollout policy, independent of stored connections and historical reports. */
const manualChannels:Record<string,{name:string;source:string;reason:Record<Language,string>}>= {
 medium:{name:'Medium',source:'https://help.medium.com/hc/en-us/articles/213480228-API-Importing',reason:{
  en:'Medium no longer issues new integration tokens or accepts new API integrations. Existing tokens may still work, but require separate validation. For now, import the article and confirm publication on Medium yourself.',
  zh:'Medium 不再签发新的 integration token，也不接受新 API 集成。已有旧 token 可能仍可用，但需另行验证。目前需自行到 Medium 导入文章并确认发布。'}},
 hackernoon:{name:'HackerNoon',source:'https://help.hackernoon.com/import-your-content-to-hackernoon',reason:{
  en:'A public official API for third-party submission or publishing has not been confirmed. The documented workflow is to import the article on HackerNoon and submit it for editorial review; publication depends on the platform.',
  zh:'尚未确认可供第三方接入的官方公开投稿或发布 API。官方流程是到 HackerNoon 网页导入文章，再提交编辑审核；是否发布由平台决定。'}}
};
const names:Record<string,string>={dev:'DEV',hashnode:'Hashnode'};
export function channelPaused(target:string|undefined):boolean{return Boolean(target&&Object.hasOwn(manualChannels,target));}
export function manualChannelLabel(locale:Language){return locale==='zh'?'需手动处理':'Manual handling required';}
export function channelOption(target:string,selected:string,locale:Language):string {
 const policy=manualChannels[target],name=policy?.name??names[target]??target;
 return `<option value="${escape(target)}" ${target===selected?'selected':''} ${policy?`disabled data-primary="${escape(name)}" data-detail="${manualChannelLabel(locale)}" data-reason="${escape(policy.reason[locale])}"`:''}>${escape(name)}${policy?' · '+manualChannelLabel(locale):''}</option>`;
}
export function channelNotices(locale:Language,targets=Object.keys(manualChannels)):string {
 return targets.filter(channelPaused).map(target=>{const policy=manualChannels[target];return `<details class="studio-channel-notice" data-channel="${escape(target)}"><summary><strong>${policy.name}</strong>${badge(manualChannelLabel(locale),'neutral')}<span aria-hidden="true">ⓘ</span></summary><p>${policy.reason[locale]}</p><a href="${policy.source}" target="_blank" rel="noopener noreferrer">${locale==='zh'?'官方说明':'Official guidance'} ↗</a></details>`;}).join('');
}

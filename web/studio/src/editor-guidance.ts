import {escape} from './components.js';
import {linkButton,notice} from './ui.js';
import {translator} from './i18n.js';
import type {Language,Site,Summary} from './types.js';

export function reviewGuidance(summary:Summary|null,locale:Language,dirty=false,currentRevision=summary?.revision.id):string {
 if(summary?.submission?.status!=='pending')return '';
 const t=translator(locale),changed=dirty||summary.submission.revisionId!==currentRevision;
 return `${t(summary.capabilities.canPublish?'reviewNext':'reviewWaiting')}${summary.live?' '+t('reviewLiveUnchanged'):''}${changed?' '+t('reviewNewChanges'):''}`;
}

export function siteGuidance(sites:Site[],loaded:boolean,language:Language,locale:Language):string {
 const t=translator(locale),site=sites.find(site=>site.language===language);
 if(loaded&&site?.configured)return '';
 return notice(`<p><strong>${language==='en'?'English':'简体中文'} · Ghost</strong> — ${escape(t(loaded?'siteDraftMissing':'siteDraftUnknown'))}</p>${linkButton(t('siteDetails'),{class:'btn sm',href:'#/settings'})}`,{tone:'warning',className:'editor-site-guidance'});
}

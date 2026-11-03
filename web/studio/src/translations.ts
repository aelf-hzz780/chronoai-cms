import type {Language,Translation} from './types.js';
export interface TranslationPeer {articleId:string;language:Language;outdated:boolean}
export function translationWorkspace(articleId:string,language:Language,relations:Translation[]){
 const candidates=new Map<string,TranslationPeer>();
 const sources:Array<{articleId:string;revisionId:string;outdated:boolean}>=[];
 for(const relation of relations){
  if(relation.articleId!==articleId&&relation.sourceArticleId!==articleId)continue;
  const peerId=relation.articleId===articleId?relation.sourceArticleId:relation.articleId;
  if(peerId===articleId)continue;
  const previous=candidates.get(peerId);
  candidates.set(peerId,{articleId:peerId,language:language==='en'?'zh':'en',outdated:Boolean(previous?.outdated||relation.outdated)});
  if(relation.articleId===articleId)sources.push({articleId:relation.sourceArticleId,revisionId:relation.sourceRevisionId,outdated:relation.outdated});
 }
 const peers=[...candidates.values()];
 return {peers,sources,selectedPeer:peers.length===1?peers[0]:null};
}

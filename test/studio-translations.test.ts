import {test} from 'node:test';
import assert from 'node:assert/strict';
import {translationWorkspace} from '../web/studio/src/translations.ts';
const edge={articleId:'zh-one',language:'zh' as const,sourceArticleId:'en-source',sourceRevisionId:'public-r1',outdated:false};
test('translation workspace switches symmetrically from both ends of directed edges',()=>{
 assert.deepEqual(translationWorkspace('en-source','en',[edge]).peers.map(p=>[p.articleId,p.language]),[['zh-one','zh']]);
 assert.deepEqual(translationWorkspace('zh-one','zh',[edge]).peers.map(p=>[p.articleId,p.language]),[['en-source','en']]);
 assert.deepEqual(translationWorkspace('zh-one','zh',[edge]).sources,[{articleId:'en-source',revisionId:'public-r1',outdated:false}]);
});
test('multiple translation candidates require a choice and deduplicate their peer identities',()=>{
 const model=translationWorkspace('en-source','en',[edge,{...edge,articleId:'zh-two'},edge]);
 assert.equal(model.peers.length,2);assert.equal(model.selectedPeer,null);
 assert.equal(translationWorkspace('en-source','en',[edge]).selectedPeer?.articleId,'zh-one');
});
test('only authorized summary relationships enter the model; no hidden legacy fallback',()=>{
 const hiddenLegacy={sourceArticle:'en-hidden',sourceRevision:'private-r2',outdated:true};
 const legacyArticle={id:'zh-one',translation:hiddenLegacy};
 const model=translationWorkspace(legacyArticle.id,'zh',[]);
 assert.deepEqual(model.peers,[]);assert.deepEqual(model.sources,[]);assert.equal(model.selectedPeer,null);
 assert.deepEqual(translationWorkspace('unrelated','en',[edge]).peers,[]);
});

export type Language='en'|'zh';
export type Status='all'|'draft'|'submitted'|'published'|'outdated';
export interface Capabilities {canWrite:boolean;canPublish:boolean;canManagePublishers:boolean;canReadConnections:boolean;canReadMetrics:boolean}
export interface Workspace {id:string;kind:'personal'|'organization';name:string;role:'owner'|'admin'|'publisher'|'member';capabilities:Capabilities}
export interface Identity {subject:string;csrf?:string;workspaces:Workspace[];organizationDirectory:{status:'available'|'unavailable';code?:string}}
export interface Revision {id:string;title:string;markdown:string;digest:string;creditedAuthor:string;createdAt:string}
export interface Article {id:string;ownerId:string;language:Language;creator:string;revision:Revision;translation:null|{sourceArticle:string;sourceRevision:string;outdated:boolean}}
export interface Translation {articleId:string;language:Language;sourceArticleId:string;sourceRevisionId:string;outdated:boolean}
export interface Summary {id:string;ownerId:string;language:Language;creator:string;revision:Omit<Revision,'markdown'>;states:Exclude<Status,'all'>[];draft:null|{revisionId:string};submission:null|{revisionId:string;submittedAt:string;status:'pending'|'fulfilled';fulfilledByReleaseId:string|null};live:null|{releaseId:string;revisionId:string;url:string};translations:Translation[];capabilities:{canEdit:boolean;canSubmit:boolean;canPublish:boolean};updatedAt:string}
export interface ContentPage {items:Summary[];total:number;limit:number;offset:number;counts:Record<Status,number>}
export interface Site {language:Language;configured:boolean;publicUrl:string|null;verification:{status:'unknown'|'verified';checkedAt:string|null};blockers:string[]}
export interface History {id:string;title:string;digest:string;credited_author:string;created_at:string}
export interface EditorDraft {article:Article|null;language:Language;title:string;author:string;markdown:string;originalMarkdown:string;markdownChanged:boolean;dirty:boolean;conflict:boolean;historyRevision:boolean;imported:boolean}

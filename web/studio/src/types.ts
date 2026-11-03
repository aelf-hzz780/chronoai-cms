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
export type TaskKind='release'|'delivery'|'media'|'projection'|'plan';
export interface TaskItem {id:string;kind:TaskKind;ownerId:string;articleId:string;language:Language;title:string;revisionId:string|null;action:string;state:string;createdAt:string;updatedAt:string;traceId:string;errorCode:string|null;url:string|null;allowedActions:string[]}
export interface TaskPage {items:TaskItem[];total:number;limit:number;offset:number}
export interface TaskHistory {state:string;code:string|null;traceId:string;createdAt:string;note?:string;actor?:string}
export interface TaskMedia {id:string;state:string;publicFiles:number;errorCode:string|null;traceId:string;createdAt:string;updatedAt:string}
export interface TaskDetail extends TaskItem {snapshot:null|{revisionId:string;title:string;markdown:string;creditedAuthor:string;digest:string};confirmationDigest:string|null;history:TaskHistory[];copy:null|{target:string;connectionId:string|null;remoteId:string|null;url:string|null};mediaHistory?:TaskMedia[]}
export type PublicationAction='publish'|'update'|'unpublish';
export interface Release {id:string;article_id:string;revision_id:string;owner_id:string;action:PublicationAction;state:string;url:string|null;remote_id:string|null;created_at:string;updated_at:string;error_code:string|null;trace_id:string}
export interface LinkStatus {id:string;state:string;error_code:string|null;trace_id:string;attempts:number|null;next_attempt_at:string|null}

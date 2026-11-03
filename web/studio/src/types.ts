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
export type MetricDestination='ghost'|'dev'|'hashnode'|'medium'|'hackernoon';
export interface MetricFilters {from:string;to:string;article:string;language:Language|'';destination:MetricDestination}
export interface Metric {value:number|null;availability:'Available'|'Unavailable';source:string;updated_at:string|null;coverage:Record<string,string|number|null|undefined>;reason:string|null;definition?:string}
export interface MetricTrend {date:string;pageViews:number;estimatedDailyVisitors:number}
export interface Metrics {ownerId:string;filters:Record<string,string|undefined>;readership:{pageViews:Metric;estimatedDailyVisitors:Metric};topArticles:Array<{article_id:string;pageViews:number;estimatedDailyVisitors:number}>;trends:MetricTrend[];referrals:Array<{referral:string;campaign:string|null;pageViews:number}>;distribution:{value:Array<{state:string;count:number}>;source:string;dateBasis:string;updated_at:string};externalEngagement:{views:number|null;reactions:number|null;comments:number|null;availability:'Available'|'Unavailable';source:string;updated_at:string|null;metrics:{views:Metric;reactions:Metric;comments:Metric};reason:string|null}}
export interface Member {identity:string;displayName:string;role:'admin'|'member'|'viewer';active:boolean;publisherAssigned:boolean;publisher:boolean}
export interface MemberDirectory {ownerId:string;status:'available'|'unavailable';members:Member[];code?:string}
export interface MemberIntent {identity:string;displayName:string;enabled:boolean}

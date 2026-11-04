/** Presentation primitives. Callers retain IDs, form semantics and business event bindings. */
export type ControlAttributes=Record<string,string|number|boolean|null|undefined>;
export function escape(value:unknown):string{return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
function attributes(values:ControlAttributes):string{return Object.entries(values).filter(([,value])=>value!==undefined&&value!==null&&value!==false).map(([name,value])=>value===true?name:`${name}="${escape(value)}"`).join(' ');}
/** Content is authored view markup, with dynamic text escaped by the caller. */
export function controlButton(content:string,attrs:ControlAttributes={}):string{return `<button ${attributes({type:'button',...attrs,class:`ui-button ${attrs.class??'btn'}`})}>${content}</button>`;}
export function linkButton(content:string,attrs:ControlAttributes):string{return `<a ${attributes({...attrs,class:`ui-button ${attrs.class??'btn'}`})}>${content}</a>`;}
export function button(label:string,action:string,classes='',disabled=false):string{return controlButton(escape(label),{class:`btn ${classes}`,'data-action':action,disabled});}
export function input(attrs:ControlAttributes):string{const variant=attrs.type==='checkbox'?'ui-checkbox':attrs.type==='file'?'ui-file':'ui-input';return `<input ${attributes({...attrs,class:`${variant} ${attrs.class??''}`})}>`;}
export function textarea(value:string,attrs:ControlAttributes={}):string{return `<textarea ${attributes({...attrs,class:`ui-textarea ${attrs.class??''}`})}>${escape(value)}</textarea>`;}
export interface NoticeOptions {tone?:'info'|'warning'|'error'|'success';className?:string;live?:boolean;details?:string;}
/** Inline guidance stays static; only current operation results use live announcements. */
export function notice(content:string,{tone='info',className='',live=false,details}:NoticeOptions={}):string{return `<div class="ui-notice ui-notice-${tone} ${escape(className)}" ${live?`role="${tone==='error'?'alert':'status'}"`:''}>${content}${details?`<code class="ui-notice-details">${escape(details)}</code>`:''}</div>`;}
export function confirmationPanel(content:string,attrs:ControlAttributes={}):string{return `<section ${attributes({...attrs,class:`panel ui-confirmation ${attrs.class??''}`})}>${content}</section>`;}

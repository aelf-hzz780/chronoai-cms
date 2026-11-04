/** Presentation only. The native select and its existing change handler own the value. */
export class StudioPickers {
 private root:HTMLElement;
 private lifetime=new AbortController();
 private opened:{select:HTMLSelectElement;trigger:HTMLButtonElement;menu:HTMLElement}|null=null;
 private active=0;
 private query='';
 private typedAt=0;
 private menus:HTMLElement[]=[];
 private pendingFocus:string|null=null;

 constructor(root:HTMLElement){
  this.root=root;
  const options={signal:this.lifetime.signal};
  document.addEventListener('click',event=>this.click(event),options);
  root.addEventListener('keydown',event=>this.key(event),options);
  document.addEventListener('pointerdown',event=>{this.pendingFocus=null;if(this.opened&&!this.inside(event.target as Node))this.close();},options);
  document.addEventListener('focusin',event=>{this.pendingFocus=null;if(this.opened&&!this.inside(event.target as Node))this.close();},options);
  document.addEventListener('pointerover',event=>{const row=event.target instanceof Element?event.target.closest<HTMLElement>('.studio-picker-option'):null;if(row&&this.opened?.menu.contains(row)&&Number(row.dataset.index)!==this.active)this.highlight(Number(row.dataset.index));},options);
  window.addEventListener('resize',()=>this.position(),options);
  document.addEventListener('scroll',()=>this.position(),{...options,capture:true});
 }
 private inside(node:Node){return this.opened?.trigger.parentElement?.contains(node)||this.opened?.menu.contains(node);}

 beforeRender():string|null {
  const focused=document.activeElement;
  const id=focused instanceof HTMLElement&&this.root.contains(focused)?focused.dataset.pickerTrigger??null:focused===document.body?this.pendingFocus:null;
  this.close();for(const menu of this.menus)menu.remove();this.menus=[];return id;
 }

 afterRender(focusId:string|null){
  for(const select of this.root.querySelectorAll<HTMLSelectElement>('select:not([multiple])'))this.enhance(select);
  const trigger=focusId?document.getElementById(`${focusId}-trigger`) as HTMLButtonElement|null:null;
  this.pendingFocus=trigger?.disabled?focusId:null;
  if(trigger&&!trigger.disabled)trigger.focus({preventScroll:true});
 }

 close(restoreFocus=false){
  if(!this.opened)return;
  const {trigger,menu}=this.opened;
  menu.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.removeAttribute('aria-activedescendant');trigger.parentElement?.classList.remove('is-open');
  this.opened=null;this.query='';this.typedAt=0;
  if(restoreFocus&&trigger.isConnected)trigger.focus({preventScroll:true});
 }

 dispose(){this.close();for(const menu of this.menus)menu.remove();this.menus=[];this.lifetime.abort();}

 private span(className:string,text=''){
  const node=document.createElement('span');node.className=className;node.textContent=text;return node;
 }

 private enhance(select:HTMLSelectElement){
  if(select.hidden)return;
  const workspace=select.dataset.studioPicker==='workspace',kind=select.dataset.studioPicker??'field';
  const labels=Array.from(select.labels??[]);
  const label=select.getAttribute('aria-label')??labels.map(label=>{const copy=label.cloneNode(true) as HTMLElement;copy.querySelectorAll('select,input,button').forEach(node=>node.remove());return copy.textContent?.trim()??'';}).join(' ');
  select.dataset.pickerLabel=label;
  for(const label of labels)label.htmlFor=`${select.id}-trigger`;
  const wrapper=document.createElement('div');wrapper.className=`studio-picker studio-picker-${kind}`;
  select.replaceWith(wrapper);wrapper.append(select);select.hidden=true;select.tabIndex=-1;
  const trigger=document.createElement('button');trigger.type='button';trigger.id=`${select.id}-trigger`;trigger.dataset.pickerTrigger=select.id;
  trigger.className=`studio-picker-trigger${workspace?' workspace-switch':''}`;trigger.disabled=select.disabled;
  trigger.setAttribute('role','combobox');trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls',`${select.id}-listbox`);
  const menu=document.createElement('div');menu.id=`${select.id}-listbox`;menu.className=`studio-picker-menu studio-picker-menu-${kind}`;menu.hidden=true;menu.setAttribute('role','listbox');menu.setAttribute('aria-label',label);
  for(const [index,option] of Array.from(select.options).entries()){
   const row=document.createElement('div');row.id=`${select.id}-option-${index}`;row.className='studio-picker-option';row.setAttribute('role','option');row.dataset.value=option.value;row.dataset.index=String(index);row.setAttribute('aria-selected',String(option.selected));
   const copy=this.span('studio-picker-copy');copy.append(this.span('studio-picker-option-label',option.dataset.primary??option.text));
   if(option.dataset.detail)copy.append(this.span('studio-picker-detail',option.dataset.detail));
   if(option.disabled)row.setAttribute('aria-disabled','true');
   if(option.dataset.reason){const reason=this.span('studio-picker-reason',option.dataset.reason);reason.id=`${row.id}-reason`;row.setAttribute('aria-describedby',reason.id);copy.append(reason);}
   const check=this.span('studio-picker-check','✓');check.setAttribute('aria-hidden','true');row.append(copy,check);menu.append(row);
  }
  wrapper.append(trigger);document.body.append(menu);this.menus.push(menu);this.sync(select,trigger,menu);
 }

 private sync(select:HTMLSelectElement,trigger:HTMLButtonElement,menu:HTMLElement){
  const option=select.selectedOptions[0];if(!option)return;
  const primary=option.dataset.primary??option.text;
  const workspace=select.dataset.studioPicker==='workspace';
  trigger.replaceChildren();trigger.title=[primary,option.dataset.detail].filter(Boolean).join(' · ');
  trigger.setAttribute('aria-label',`${select.dataset.pickerLabel}: ${primary}${option.dataset.detail?', '+option.dataset.detail:''}`);
  if(workspace){const avatar=this.span('workspace-avatar',primary.slice(0,2).toUpperCase());avatar.setAttribute('aria-hidden','true');trigger.append(avatar);}
  const copy=this.span('studio-picker-copy');
  if(workspace)copy.append(this.span('studio-picker-caption',select.dataset.caption??''));
  copy.append(this.span('studio-picker-value',primary));
  const caret=this.span('studio-picker-caret');caret.setAttribute('aria-hidden','true');trigger.append(copy,caret);
  for(const row of menu.children)row.setAttribute('aria-selected',String((row as HTMLElement).dataset.value===select.value));
 }

 private open(trigger:HTMLButtonElement){
  this.close();
  const select=document.getElementById(trigger.dataset.pickerTrigger!) as HTMLSelectElement|null;
  const menu=document.getElementById(trigger.getAttribute('aria-controls')!);
  if(!select||!menu||select.disabled||!select.options.length)return;
  this.opened={select,trigger,menu};menu.hidden=false;trigger.setAttribute('aria-expanded','true');trigger.parentElement?.classList.add('is-open');
  trigger.focus({preventScroll:true});this.position();this.highlight(Math.max(0,select.selectedIndex));
 }

 private position(){
  if(!this.opened)return;const {trigger,menu,select}=this.opened,rect=trigger.getBoundingClientRect();
  const kind=select.dataset.studioPicker??'field',width=Math.min(innerWidth-24,Math.max(rect.width,kind==='workspace'?290:kind==='locale'?128:0));
  const below=innerHeight-rect.bottom-12,above=rect.top-12,up=below<180&&above>below;
  menu.style.width=`${width}px`;menu.style.maxHeight=`${Math.max(60,Math.min(340,up?above:below)-7)}px`;
  const right=kind==='locale'&&!trigger.closest('.studio-auth-tools')||kind==='workspace'&&innerWidth<=960;
  menu.style.left=`${Math.max(12,Math.min(innerWidth-width-12,right?rect.right-width:rect.left))}px`;
  menu.style.top=`${Math.max(12,up?rect.top-menu.getBoundingClientRect().height-7:rect.bottom+7)}px`;
 }

 private highlight(index:number){
  if(!this.opened)return;
  const {trigger,menu}=this.opened;
  this.active=Math.max(0,Math.min(index,menu.children.length-1));
  for(const [i,element] of Array.from(menu.children).entries())(element as HTMLElement).dataset.active=String(i===this.active);
  const row=menu.children[this.active] as HTMLElement;
  trigger.setAttribute('aria-activedescendant',row.id);
  this.position();
  if(row.offsetTop<menu.scrollTop)menu.scrollTop=row.offsetTop;
  else if(row.offsetTop+row.offsetHeight>menu.scrollTop+menu.clientHeight)menu.scrollTop=row.offsetTop+row.offsetHeight-menu.clientHeight;
 }

 private choose(index:number){
  if(!this.opened)return;
  const {select,trigger,menu}=this.opened;const option=select.options[index];if(!option||select.disabled)return;if(option.disabled){this.highlight(index);trigger.focus({preventScroll:true});return;}
  const previous=select.value;select.selectedIndex=index;this.close(true);
  if(select.value!==previous)select.dispatchEvent(new Event('change',{bubbles:true}));
  // The application may reject an unsaved-workspace switch and restore select.value.
  if(select.isConnected)this.sync(select,trigger,menu);
 }

 private click(event:MouseEvent){
  if(!(event.target instanceof Element))return;
  const trigger=event.target.closest<HTMLButtonElement>('[data-picker-trigger]');
  if(trigger&&this.root.contains(trigger)){event.preventDefault();if(this.opened?.trigger===trigger)this.close();else this.open(trigger);return;}
  const option=event.target.closest<HTMLElement>('.studio-picker-option');
  if(option&&this.opened?.menu.contains(option)){event.preventDefault();this.choose(Number(option.dataset.index));}
 }

 private key(event:KeyboardEvent){
  const trigger=event.target;if(!(trigger instanceof HTMLButtonElement)||!trigger.dataset.pickerTrigger)return;
  const key=event.key;
  if(key==='Tab'){this.close();return;}
  if(key==='Escape'){if(this.opened){event.preventDefault();this.close(true);}return;}
  if(['Enter',' ','ArrowDown','ArrowUp','Home','End'].includes(key)){
   event.preventDefault();
   if(!this.opened){this.open(trigger);if(key==='Home')this.highlight(0);if(key==='End')this.highlight(Number.MAX_SAFE_INTEGER);return;}
   if(key==='Enter'||key===' ')this.choose(this.active);
   else this.highlight(key==='Home'?0:key==='End'?Number.MAX_SAFE_INTEGER:this.active+(key==='ArrowDown'?1:-1));
   return;
  }
  if(key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
   event.preventDefault();if(!this.opened)this.open(trigger);if(!this.opened)return;
   const now=Date.now();this.query=(now-this.typedAt<700?this.query:'')+key.toLocaleLowerCase();this.typedAt=now;
   const search=Array.from(this.query).every(char=>char===this.query[0])?this.query[0]!:this.query;
   const options=Array.from(this.opened.select.options);
   for(let step=1;step<=options.length;step++){const index=(this.active+step)%options.length;const option=options[index]!;if((option.dataset.primary??option.text).toLocaleLowerCase().startsWith(search)){this.highlight(index);break;}}
  }
 }
}

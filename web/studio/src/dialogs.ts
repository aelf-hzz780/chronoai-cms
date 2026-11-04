import {controlButton,escape} from './ui.js';
import type {Language} from './types.js';

/** Keep a stable return target when an action replaces its own DOM while pending. */
export function captureFocus(){
 const origin=document.activeElement instanceof HTMLElement?document.activeElement:null;
 const id=origin?.id,action=origin?.dataset.action,identity=origin?.dataset.identity;
 return ()=>{
  const restored=origin?.isConnected?origin:id?document.getElementById(id):action?Array.from(document.querySelectorAll<HTMLElement>('[data-action]')).find(node=>node.dataset.action===action&&node.dataset.identity===identity):null;
  restored?.focus({preventScroll:true});
 };
}

/** A single presentation-only confirmation; a second caller never shares an answer. */
export class StudioDialog {
 private finish:((accepted:boolean)=>void)|null=null;
 cancel(){this.finish?.(false);}
 confirm(message:string,locale:Language,signal:AbortSignal):Promise<boolean>{
  if(this.finish||signal.aborted)return Promise.resolve(false);
  const restoreFocus=captureFocus();
  const dialog=document.createElement('dialog');dialog.className='ui-dialog ui-confirmation';dialog.setAttribute('role','alertdialog');dialog.setAttribute('aria-labelledby','studio-dialog-title');dialog.setAttribute('aria-describedby','studio-dialog-message');
  dialog.innerHTML=`<div class="ui-dialog-heading"><span class="ui-dialog-icon" aria-hidden="true">◇</span><h2 id="studio-dialog-title">${locale==='zh'?'确认操作':'Confirm action'}</h2></div><p id="studio-dialog-message">${escape(message)}</p><div class="ui-dialog-actions">${controlButton(locale==='zh'?'取消':'Cancel',{'data-dialog-choice':'cancel',autofocus:true})}${controlButton(locale==='zh'?'确认':'Confirm',{'data-dialog-choice':'confirm',class:'btn primary'})}</div>`;
  const lifetime=new AbortController();
  return new Promise(resolve=>{
   const abort=()=>this.finish?.(false);
   this.finish=accepted=>{
    if(!this.finish)return;this.finish=null;signal.removeEventListener('abort',abort);lifetime.abort();dialog.close();dialog.remove();
    restoreFocus();resolve(accepted&&!signal.aborted);
   };
   dialog.addEventListener('cancel',event=>{event.preventDefault();this.finish?.(false);},{signal:lifetime.signal});
   dialog.addEventListener('click',event=>{const target=event.target as HTMLElement;const choice=target.closest<HTMLElement>('[data-dialog-choice]')?.dataset.dialogChoice;if(choice)this.finish?.(choice==='confirm');else if(target===dialog){const r=dialog.getBoundingClientRect(),pointer=event as MouseEvent;if(pointer.clientX<r.left||pointer.clientX>r.right||pointer.clientY<r.top||pointer.clientY>r.bottom)this.finish?.(false);}},{signal:lifetime.signal});
   dialog.addEventListener('keydown',event=>{if(event.key!=='Tab')return;const buttons=Array.from(dialog.querySelectorAll<HTMLButtonElement>('button'));const first=buttons[0],last=buttons.at(-1)!;if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}},{signal:lifetime.signal});
   signal.addEventListener('abort',abort,{once:true});document.body.append(dialog);dialog.showModal();dialog.querySelector<HTMLButtonElement>('[data-dialog-choice="cancel"]')!.focus();
  });
 }
}

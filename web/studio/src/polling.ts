interface PollingOptions {schedule?:(callback:()=>void,delay:number)=>number;cancel?:(id:number)=>void;visible?:()=>boolean;onExhausted?:()=>void;onError?:(error:unknown)=>void;maxAttempts?:number}
/** Bounded read-only polling. A route/owner abort always invalidates in-flight reads. */
export class BoundedPoller {
 private options:PollingOptions;private timer:number|null=null;private signal:AbortSignal|null=null;private read:(()=>Promise<boolean>)|null=null;
 private attempts=0;private generation=0;private running=false;private inFlight=false;
 private aborted=()=>this.stop();
 constructor(options:PollingOptions={}){this.options=options;}
 start(signal:AbortSignal,read:()=>Promise<boolean>){this.stop();if(signal.aborted)return;this.signal=signal;this.read=read;this.running=true;this.attempts=0;signal.addEventListener('abort',this.aborted,{once:true});this.schedule();}
 stop(){this.generation++;this.running=false;this.inFlight=false;this.clear();this.signal?.removeEventListener('abort',this.aborted);this.signal=null;this.read=null;}
 private clear(){if(this.timer!==null){(this.options.cancel??clearTimeout)(this.timer);this.timer=null;}}
 private visible(){return this.options.visible?.()??true;}
 private schedule(){if(!this.running||this.inFlight||!this.visible()||this.signal?.aborted)return;this.clear();this.timer=(this.options.schedule??setTimeout)(()=>{void this.tick();},Math.min(10000,2000*1.5**this.attempts));}
 visibilityChanged(){if(!this.visible())this.clear();else this.schedule();}
 async tick(){
  this.clear();if(!this.running||this.inFlight||!this.visible()||this.signal?.aborted||!this.read)return;
  const generation=this.generation;this.inFlight=true;
  try{const active=await this.read();if(generation!==this.generation)return;this.inFlight=false;
   if(!active){this.stop();return;}this.attempts++;
   if(this.attempts>=(this.options.maxAttempts??15)){this.stop();this.options.onExhausted?.();return;}this.schedule();
  }catch(error){if(generation!==this.generation)return;this.stop();this.options.onError?.(error);}
 }
}

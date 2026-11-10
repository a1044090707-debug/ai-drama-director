(function(root,factory){
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MovieGuide=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  class GuideRun{
    constructor(plan,at=0){
      this.plan=plan;this.index=0;this.phase='prepare';this.phaseAt=at;this.accepted=[];
      this.prepareMs=2500;this.neutralMs=600;this.countdownMs=2500;this.holdMs=1800;
      this.neutralSince=null;this.paused=false;
    }
    get step(){return this.plan.scenes[this.index];}
    get complete(){return this.phase==='complete';}
    update(at,{visible=true,neutral=true}={}){
      if(this.complete)return;
      if(this.phase==='hold'){
        if(at-this.phaseAt>=this.holdMs){
          if(this.index===this.plan.scenes.length-1)this.phase='complete';
          else{this.index++;this.phase='neutral';this.phaseAt=at;this.neutralSince=null;}
        }
        return;
      }
      this.paused=!visible;
      if(!visible){this.phase='neutral';this.neutralSince=null;this.phaseAt=at;return;}
      if(this.phase==='prepare'){
        if(at-this.phaseAt>=this.prepareMs){this.phase='neutral';this.neutralSince=null;}
      }else if(this.phase==='neutral'){
        if(!neutral)this.neutralSince=null;
        else{
          if(this.neutralSince===null)this.neutralSince=at;
          if(at-this.neutralSince>=this.neutralMs){this.phase='countdown';this.phaseAt=at;}
        }
      }else if(this.phase==='countdown'){
        if(!neutral){this.phase='neutral';this.neutralSince=null;this.phaseAt=at;}
        else if(at-this.phaseAt>=this.countdownMs){this.phase='action';this.phaseAt=at;}
      }
    }
    accepts(action,actorId){return !this.paused&&this.phase==='action'&&action===this.step.action&&actorId===this.step.actorId;}
    accept(event,at){
      if(!this.accepts(event.action,event.actorId))return false;
      event.guideStep=this.step.id;
      event.clipStartMs=Math.max(0,event.timeMs-250);
      event.clipEndMs=event.timeMs+this.holdMs;
      this.accepted[this.index]=event.id;this.phase='hold';this.phaseAt=at;return true;
    }
    redo(at){
      if(this.complete)return null;
      let index=this.phase==='hold'?this.index:this.index-1;
      if(index<0)return null;
      const removed=this.accepted.splice(index);this.index=index;
      this.phase='neutral';this.phaseAt=at;this.neutralSince=null;this.paused=false;
      return removed;
    }
  }
  return {GuideRun};
});

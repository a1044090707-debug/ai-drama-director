// Visual filtering only. Recognition continues to use the measured landmarks.
export class PoseStabilizer{
  constructor(){this.joints=[];this.lastTime=null;}
  update(world,screen,time){
    if(!world)return null;
    const span=Math.max(.15,Math.hypot((world[11]?.x||0)-(world[12]?.x||0),(world[11]?.y||0)-(world[12]?.y||0)));
    const dt=Math.max(.016,Math.min(.25,(time-(this.lastTime??time-100))/1000));this.lastTime=time;
    return world.map((point,i)=>{
      const state=this.joints[i]??={};
      const confidence=Math.min(point?.visibility??1,point?.presence??1,screen?.[i]?.visibility??1);
      const threshold=state.valid ? .40 : .60;
      const good=point&&[point.x,point.y,point.z].every(Number.isFinite)&&confidence>=threshold&&
        (!screen?.[i]||(screen[i].y>=-.04&&screen[i].y<=1.04&&screen[i].x>=-.04&&screen[i].x<=1.04));
      if(!good){
        if(state.point&&time-state.seen<=350)return {...state.point,visibility:.8};
        state.valid=false;return {...point,visibility:0};
      }
      state.valid=true;
      if(!state.point||time-(state.seen??-Infinity)>600){state.point={...point};state.seen=time;return {...state.point};}
      const old=state.point,delta=Math.hypot(point.x-old.x,point.y-old.y,point.z-old.z);
      // A one-frame depth inversion must not fling an elbow across the body.
      if(delta>span*1.6&&time-state.seen<200&&(state.spikes=(state.spikes||0)+1)<2)return {...old,visibility:.8};
      state.spikes=0;state.seen=time;
      const speed=delta/(span*dt),tau=speed>.9?.055:.20,alpha=1-Math.exp(-dt/tau),dead=span*.025;
      for(const axis of ['x','y','z']){
        const d=point[axis]-old[axis];if(Math.abs(d)>dead)old[axis]+=d*alpha*(axis==='z'&&speed<.9?.5:1);
      }
      old.visibility=Math.max(.6,confidence);return {...old};
    });
  }
}

// Static arm targets are retained while their measured 2D positions stay still.
// A real arm movement or a prolonged loss releases this hold.
export class ArmHold{
  constructor(){this.sides={};}
  update(side,points,targets,time,action){
    const ids=side==='Left'?[11,13,15]:[12,14,16],state=this.sides[side]??={};
    const good=ids.every(i=>points?.[i]&&Number.isFinite(points[i].x)&&Number.isFinite(points[i].y)&&(points[i].visibility??1)>.48);
    const keys=[side+'UpperArm',side+'ForeArm',side+'Hand'];
    if(!good){
      if(state.snapshot&&time-(state.seen??-Infinity)<=350)for(const key of keys)targets[key].copy(state.snapshot[key]);
      else{state.anchor=null;state.snapshot=null;}
      return;
    }
    const span=Math.max(.04,Math.hypot((points[11]?.x??.5)-(points[12]?.x??.5),(points[11]?.y??.5)-(points[12]?.y??.5)));
    const now=ids.map(i=>({x:points[i].x,y:points[i].y}));
    const change=state.anchor?Math.max(...now.map((p,i)=>Math.hypot(p.x-state.anchor[i].x,p.y-state.anchor[i].y)))/span:Infinity;
    state.seen=time;
    state.moving=change>.075?(state.moving||0)+1:0;
    if(change>.20||state.moving>=2||action==='wave'){
      state.anchor=now;state.since=time;state.snapshot=null;
    }else if(time-state.since>=450&&!state.snapshot){
      state.snapshot=Object.fromEntries(keys.map(key=>[key,targets[key].clone()]));
    }
    if(state.snapshot)for(const key of keys)targets[key].copy(state.snapshot[key]);
  }
}

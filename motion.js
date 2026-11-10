/* Shared motion rules for the browser and regression tests. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();else root.Motion=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clamp=(x,min,max)=>Math.min(max,Math.max(min,x));
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const visible=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.visibility??1)>.48&&(p.presence??1)>.45;
  const actions={
    forehead:{name:'扶额',lines:['检测到扶额。','事情开始变得不对劲。','这一扶额，让全宇宙的周一提前到来。']},
    head:{name:'双手抱头',lines:['检测到双手抱头。','系统检测到人生重大危机。','主角精神值归零，世界申请紧急重启！']},
    turn:{name:'转头',lines:['检测到转头。','他似乎发现了什么……','公元2026年，这个转头改变了人类文明。']},
    raise:{name:'单手举高',lines:['检测到单手举高。','在一片沉默中，终于有人站了出来。','这只手刚刚接管了银河系的发言权。']},
    handsup:{name:'双手举高',lines:['检测到双手举高。','他决定把这个难题交给天空。','地球已举手，申请退出本次宇宙会议！']},
    wave:{name:'挥手',lines:['检测到挥手。','这场相遇，终于等来了回应。','他挥走了烦恼，也顺便挥走了下周的作业。']},
    arms:{name:'展开双臂',lines:['检测到展开双臂。','这一刻，他准备拥抱整个世界。','注意！主角正在徒手测量宇宙的宽度。']},
    tilt:{name:'歪头',lines:['检测到歪头。','他对这个世界，产生了一点小小的疑问。','人类未解之谜，又多了一个倾斜的角度。']},
    mouth:{name:'张嘴',lines:['检测到张嘴。','这个消息，让他一时忘了合上嘴。','他刚刚吞下了一个惊天秘密，消化时间待定。']}
  };
  function headPose(points,width=1,height=1,matrix){
    const d=matrix?.data||matrix;
    // MediaPipe's face matrix is column-major, in the same right-handed basis as Three.js.
    if(d?.length===16&&Array.from(d).every(Number.isFinite))return {matrix:Array.from(d)};
    if(!points?.[33]||!points?.[263]||!points?.[10]||!points?.[152])return {yaw:0,pitch:0,roll:0};
    const v=(a,b)=>[ (a.x-b.x)*width, -(a.y-b.y)*height, -((a.z||0)-(b.z||0))*width ];
    const unit=a=>{const n=Math.hypot(...a)||1;return a.map(x=>x/n);};
    const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    const x=unit(v(points[263],points[33])),up=unit(v(points[10],points[152])),z=unit(cross(x,up));
    return {yaw:clamp(Math.atan2(z[0],z[2]),-1.4,1.4),pitch:clamp(-Math.atan2(z[1],Math.hypot(z[0],z[2])),-.9,.9),roll:clamp(Math.atan2(x[1],x[0]),-.9,.9)};
  }
  function wave(p,track,t){
    if(!track||!p||![11,12].every(i=>visible(p[i])))return false;
    const span=dist(p[11],p[12]);if(span<.06)return false;
    track.waveState??=[{},{}];const center=(p[11].x+p[12].x)/2;let eligible=false;
    [15,16].forEach((index,i)=>{
      const wrist=p[index],state=track.waveState[i];
      if(!visible(wrist)||wrist.y>Math.max(p[11].y,p[12].y)+span*.1){track.waveState[i]={};return;}
      eligible=true;
      const x=(wrist.x-center)/span;
      if(state.anchor===undefined||t-state.started>1700){Object.assign(state,{anchor:x,extreme:x,direction:0,turns:0,started:t});return;}
      const delta=x-state.extreme;
      if(!state.direction){if(Math.abs(x-state.anchor)>.18){state.direction=Math.sign(x-state.anchor);state.extreme=x;track.waveMovingUntil=t+450;}return;}
      if(delta*state.direction>0){if(Math.abs(delta)>.02)track.waveMovingUntil=t+450;state.extreme=x;return;}
      if(Math.abs(delta)>.18){track.waveMovingUntil=t+450;state.direction*=-1;state.extreme=x;state.turns++;if(state.turns>=2){track.waveUntil=t+800;state.turns=0;state.started=t;}}
    });
    if(!eligible)track.waveUntil=0;
    return eligible&&t<(track.waveUntil||0);
  }
  function faceMetrics(f,aspect=1,width=0){
    if(!f?.[33]||!f?.[263])return null;
    const left=f[33],right=f[263],dx=right.x-left.x,dy=(right.y-left.y)/aspect,eye=Math.hypot(dx,dy);
    // A fixed fraction of the whole frame discarded otherwise usable smaller faces.
    if(!(eye>Math.max(.008,width>0?8/width:.008)))return null;
    const roll=Math.atan2(dy,dx),projection=f[1]?((f[1].x-left.x)*dx+(f[1].y-left.y)/aspect*dy)/(eye*eye):.5;
    const mouth=f[13]&&f[14]?Math.hypot(f[13].x-f[14].x,(f[13].y-f[14].y)/aspect)/eye:0;
    return [roll,projection,mouth].every(Number.isFinite)?{roll,projection,mouth}:null;
  }
  function classify(p,f,track,t=0){
    const aspect=track?.observation?.aspect||1;
    if(p&&aspect!==1)p=p.map(point=>point?{...point,y:point.y/aspect}:point);
    if(wave(p,track,t))return 'wave';
    if(p&&[0,11,12].every(i=>visible(p[i]))){
      const nose=p[0],ls=p[11],rs=p[12],span=dist(ls,rs),lw=p[15],rw=p[16];
      if(span>.06){
        const high=w=>visible(w)&&w.y<nose.y-span*.42;
        const near=w=>visible(w)&&dist(w,nose)<span*.66&&w.y<Math.max(ls.y,rs.y)+span*.2;
        if(high(lw)&&high(rw))return 'handsup';
        if(near(lw)&&near(rw))return 'head';
        if(near(lw)||near(rw))return 'forehead';
        if(high(lw)||high(rw))return 'raise';
        if(visible(lw)&&visible(rw)&&Math.abs(lw.y-ls.y)<span*.48&&Math.abs(rw.y-rs.y)<span*.48&&Math.abs(lw.x-rw.x)>span*2.1)return 'arms';
      }
    }
    const metrics=faceMetrics(f,aspect,track?.observation?.frameWidth),neutral=track?.neutralFace||{roll:0,projection:.5,mouth:0};
    if(metrics){
      if(metrics.mouth>Math.max(.28,neutral.mouth+.22))return 'mouth';
      if(Math.abs(metrics.roll-neutral.roll)>.32)return 'tilt';
      if(Math.abs(metrics.projection-neutral.projection)>.25)return 'turn';
    }
    return null;
  }
  function captureSize(width,height,maxEdge=1280){
    if(!(width>0&&height>0))return {width:0,height:0};
    const scale=Math.min(1,maxEdge/Math.max(width,height));return {width:Math.round(width*scale),height:Math.round(height*scale)};
  }
  return {actions,headPose,classify,captureSize,faceMetrics};
});

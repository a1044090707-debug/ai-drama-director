
'use strict';
const $ = id => document.getElementById(id);
const APP_BUILD = 'V1.0 · 五位全身角色', AI_VERSION = '0.10.21', MAX_PLAYERS = 4;
const video = $('video'), canvas = $('canvas'), ctx = canvas.getContext('2d');
const frame = document.createElement('canvas'), frameCtx = frame.getContext('2d');
const avatars=Characters.all.map(character=>({...character}));
let avatarGroup='human';
const artwork = {heads:null,busts:null};
let previewAvatars = [6,4,5], selectedPreview = 0;
function loadArtwork() {
  for(const [key,path] of Object.entries({heads:'assets/animal-heads.png',busts:'assets/animal-busts.png'})) {
    const img=new Image();artwork[key]=img;
    img.onload=()=>{if(!stream)drawDemo(demoMode?performance.now()-demoStarted:0);};
    img.onerror=()=>{log('角色素材加载失败：'+path);status('动物素材未能读取，请保持 assets 文件夹与网页放在一起。','error');};
    img.src=path;
  }
}
function spriteStyle(element,avatar) {
  const a=avatars[avatar];element.setAttribute('data-character',String(avatar));
  if(a.group==='human'){
    element.className+=' human-portrait';const portrait=element.className.includes('player-icon')?a.bust:a.portrait;
    if(portrait)element.style.setProperty('--portrait-image','url("'+portrait+'")');else element.textContent='人';
  }else{
    const index=a.sprite;element.className+=' animal-sprite';element.style.setProperty('--sprite-x',(index%2)*100+'%');element.style.setProperty('--sprite-y',Math.floor(index/2)*100+'%');
  }
}
async function loadHumanPortraits(){
  const imageFrom=src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=src;});
  try{
    if(!stream)status('正在载入五位 3D 角色…');
    const renderer=await initAvatar3D();if(!renderer)throw new Error('3D 角色未能加载');
    for(const {a,i} of avatars.map((a,i)=>({a,i})).filter(item=>item.a.group==='human')){
      const item={id:'thumb-'+i,avatar:i,snap:true,demoPose:'stand',observation:{x:.5,y:.5,rotation:{yaw:.06,pitch:0,roll:0}}};
      a.portrait=renderer.draw([item],512,512).toDataURL('image/png');
      a.bust=renderer.draw([{...item,portrait:true}],512,512).toDataURL('image/png');
      [a.headImage,a.bustImage]=await Promise.all([imageFrom(a.portrait),imageFrom(a.bust)]);
    }
    renderAvatars();renderPlayers(true);
    if(!stream){drawDemo(demoMode?performance.now()-demoStarted:0);if(!demoMode&&!loading)status('五位人物角色已就绪。选好形象，再开启摄像头。');}
    log('五位真实 3D 人物及角色卡已就绪');
  }catch(e){log('人物预览未能生成：'+errorText(e));if(!stream)status('人物模型加载失败，请检查本地模型文件后刷新。','error');}
}
const texts=Object.fromEntries(Object.entries(Motion.actions).map(([key,value])=>[key,value.lines]));
const actionNames=Object.fromEntries(Object.entries(Motion.actions).map(([key,value])=>[key,value.name])),levels=['普通','夸张','离谱'];
let cameraFacing='user',mirror=true,avatar3D=null,avatarModule=null,avatarImport=null,expanded=false,avatarRendererPromise=null;
let previewRenderer=null,previewRaf=0,previewToken=0,orientationTimer=0;
let stream = null, face = null, pose = null, aiPromise = null;
let loading = false, performing = false, demoMode = false, session = 0, raf = 0;
let lastStageRender=0,lastSceneObservations=[],lastSceneExtras=[];
let lastVideoTime = -1, lastInference = -Infinity, lastGlobalFire = -Infinity, clearTimer = 0;
let tracks = [], nextId = 1, selectedId = null, defaultAvatar = 6, events = 0, audio = null;
let demoStarted = 0, demoStep = -1, lastRoster = '', lastDemoFrame = 0;
const lines = [];
function log(message) { lines.push(new Date().toLocaleTimeString()+' '+message); if(lines.length>50) lines.shift(); $('logs').textContent=lines.join('\n'); }
function status(message,kind='') { $('status').textContent=message; $('status').className='status '+kind; log(message); }
function errorText(error) {
  const tips={NotAllowedError:'请在地址栏和系统设置中允许摄像头。',NotFoundError:'未找到摄像头。',NotReadableError:'请检查摄像头是否被其他程序占用。',OverconstrainedError:'摄像头不支持当前参数。'};
  return (tips[error?.name] || error?.message || String(error));
}
function setButtons() {
  $('start').disabled=loading || performing && !demoMode;
  $('startLabel').textContent=loading?'正在准备片场…':performing&&!demoMode?'正在加戏':'开始加戏';
  $('cameraTest').disabled=loading || !!stream;
  $('cameraLabel').textContent=stream?'摄像头已连接':'开启摄像头';
  $('stop').disabled=!stream&&!demoMode&&!loading;
  $('demo').disabled=loading||!!stream;
  $('demo').textContent=demoMode?'退出示例':'台词示例';
  $('switchCamera').disabled=loading;
  $('switchCamera').textContent=cameraFacing==='user'?'切换到后置':'切换到前置';
}
function updateLevel() {
  const level=+$('level').value;
  $('levelName').textContent=levels[level]; $('level').setAttribute('aria-valuetext',levels[level]);
  $('levelExample').textContent=texts.turn[level];
  [...$('levelLabels').children].forEach((el,i)=>el.classList.toggle('current',i===level));
}
function currentAvatar() { return tracks.find(t=>t.id===selectedId)?.avatar ?? previewAvatars[selectedPreview]; }
function renderAvatars() {
  const selected=currentAvatar(); $('avatarOptions').replaceChildren();$('avatarOptions').setAttribute('data-group',avatarGroup);
  $('humanTab').setAttribute('aria-pressed',String(avatarGroup==='human'));$('animalTab').setAttribute('aria-pressed',String(avatarGroup==='animal'));
  avatars.forEach((a,i)=>{if(a.group!==avatarGroup)return;
    const button=document.createElement('button'); button.type='button';button.className='avatar-option';button.setAttribute('aria-pressed',String(i===selected));
    const icon=document.createElement('span');icon.className='animal';spriteStyle(icon,i);icon.setAttribute('aria-hidden','true');
    button.append(icon,document.createTextNode(a.name));button.addEventListener('click',()=>{
      const track=tracks.find(t=>t.id===selectedId);
      if(track) track.avatar=i; else {previewAvatars[selectedPreview]=i;if(selectedPreview===0)defaultAvatar=i;}
      renderAvatars();renderPlayers(true); if(!stream&&!demoMode) drawDemo(0);
    });$('avatarOptions').append(button);
  });
  $('avatarNote').textContent=selectedId===null?'正在选择示意角色 · '+avatars[previewAvatars[selectedPreview]].alias:`正在为 ${playerName(selectedId)} 更换形象`;
}
function playerName(id) { return '演员 '+String(id).padStart(2,'0'); }
function renderPlayers(force=false) {
  const signature=tracks.map(t=>[t.id,t.avatar,t.visible,t.action]).join('|')+';'+selectedId+';'+demoMode+';'+previewAvatars+';'+selectedPreview+';'+!!stream+';'+loading;
  if(!force&&signature===lastRoster)return;lastRoster=signature;
  $('players').replaceChildren();const ordered=[...tracks].sort((a,b)=>a.id-b.id),preview=!tracks.length&&!stream;
  for(let i=0;i<MAX_PLAYERS;i++) {
    const t=ordered[i],sample=preview&&i<3,avatar=t?.avatar??previewAvatars[i],selected=t?selectedId===t.id:sample&&selectedPreview===i;
    const button=document.createElement('button');button.type='button';button.className='player'+(t||sample?' active':' empty')+(selected?' selected':'');button.disabled=!t&&!sample;
    const icon=document.createElement('span');icon.className='player-icon';icon.setAttribute('aria-hidden','true');if(t||sample)spriteStyle(icon,avatar);else icon.textContent='+';
    const text=document.createElement('span');text.className='player-text';const name=document.createElement('b'),detail=document.createElement('small');
    name.textContent=t||sample?avatars[avatar].alias:'邀请好友入镜';detail.textContent=sample?'示意角色':t?(demoMode?'示意演员':!t.visible?'暂时离开':actionNames[t.action]||playerName(t.id)):'空位 '+(i+1);
    text.append(name,detail);button.append(icon,text);
    if(t||sample){button.setAttribute('aria-pressed',String(selected));button.addEventListener('click',()=>{if(t)selectedId=t.id;else{selectedId=null;selectedPreview=i;}avatarGroup=avatars[currentAvatar()].group;renderPlayers(true);renderAvatars();});}
    $('players').append(button);
  }
  const count=tracks.filter(t=>t.visible).length;
  $('playerCount').textContent=(demoMode?'示意 · ':'')+count+' / '+MAX_PLAYERS+' 人入镜';
}
function ellipse(x,y,rx,ry,fill,stroke) {
  ctx.beginPath();ctx.ellipse(x,y,Math.max(rx,.01),Math.max(ry,.01),0,0,Math.PI*2);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2.8;ctx.stroke();}
}
// Fit the same 3D head assets used by the UI to each detected face.
function drawAvatar(cx,cy,rx,ry,angle,avatar) {
  const a=avatars[avatar],image=a.group==='human'?a.headImage:artwork.heads;
  ctx.save();ctx.translate(cx,cy);ctx.rotate(angle);
  if(image?.complete&&image.naturalWidth) {
    const cell=a.group==='human'?image.naturalWidth:image.naturalWidth/2,[fx,fy,fw,fh]=a.face;
    const width=rx*2.7/fw,height=ry*2.7/fh;
    ctx.drawImage(image,a.group==='human'?0:(a.sprite%2)*cell,a.group==='human'?0:Math.floor(a.sprite/2)*cell,cell,cell,-width*fx,-height*fy,width,height);
  } else {
    const gradient=ctx.createRadialGradient(-rx*.4,-ry*.5,1,0,0,Math.max(rx,ry)*1.6);gradient.addColorStop(0,a.light);gradient.addColorStop(1,a.color);
    ellipse(0,0,rx*1.6,ry*1.6,gradient);if(a.group==='human'){ellipse(-rx*.5,-ry*.1,rx*.12,ry*.12,'#44352b');ellipse(rx*.5,-ry*.1,rx*.12,ry*.12,'#44352b');ellipse(0,ry*.5,rx*.28,ry*.07,'#bc796c');}
  }
  ctx.restore();
}
function drawStageBackground(w,h){
  ctx.clearRect(0,0,w,h);const gradient=ctx.createLinearGradient(0,0,w,h);
  gradient.addColorStop(0,'#d1ddc3');gradient.addColorStop(.6,'#edf0dc');gradient.addColorStop(1,'#f6eedb');ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
  ctx.save();ctx.filter='blur(24px)';ellipse(w*.80,h*.18,w*.24,h*.15,'#fff9dc99');ellipse(0,h*.45,w*.065,h*.25,'#92b47b66');ellipse(w,h*.63,w*.09,h*.27,'#b3c39766');ctx.restore();
  ellipse(w*.5,h*.87,w*.46,h*.13,'#c1cfad66');
}
function drawDemo(t){
  if(canvas.width!==1200||canvas.height!==660){canvas.width=1200;canvas.height=660;}
  const w=canvas.width,h=canvas.height;$('placeholder').hidden=!!avatar3D;drawStageBackground(w,h);
  const active=demoMode?tracks.map(track=>({id:track.id,avatar:track.avatar,action:track.action})):previewAvatars.map((avatar,i)=>({id:'sample-'+i,avatar}));
  const items=active.map((track,i)=>({id:track.id,avatar:track.avatar,fullBody:track.avatar>=4,slotCount:active.length,stageX:(i+.5)/active.length,
    demoPose:track.avatar>=4?(track.action==='wave'||track.action==='raise'?'wave':track.action==='arms'?'arms':'stand'):undefined,
    observation:{x:(i+.5)/active.length,y:.47,rx:.08,ry:.17,rotation:{yaw:Math.sin(t/1700+i)*.13,pitch:0,roll:0},expression:{jaw:track.action==='mouth'?.65:0}}}));
  for(const item of items)ellipse(item.observation.x*w,h*.87,Math.min(w/active.length*.30,95),13,'#788f5e25');
  if(avatar3D)ctx.drawImage(avatar3D.draw(items,w,h,performance.now()),0,0);
  else for(const item of items)drawAvatar(item.observation.x*w,h*.48,72,88,0,item.avatar);
  ctx.font='500 17px "Microsoft YaHei",sans-serif';ctx.textAlign='center';
  active.forEach((track,i)=>{const x=(i+.5)*w/active.length;ctx.fillStyle='#536a3ddd';ctx.beginPath();ctx.roundRect(x-68,h-46,136,30,15);ctx.fill();ctx.fillStyle='#fffced';ctx.fillText(avatars[track.avatar].name+' · 示意',x,h-25);});
}
function distance(a,b) { return Math.hypot(a.x-b.x,a.y-b.y); }
function faceObservation(points,matrix,blendshapes) {
  if(!points?.length) return null;
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const left=points[33],right=points[263],top=points[10],chin=points[152];
  const w=frame.width||video.videoWidth||1,h=frame.height||video.videoHeight||1,blend=Object.fromEntries((blendshapes?.categories||[]).map(c=>[c.categoryName,c.score]));
  const rotation=Motion.headPose(points,w,h,matrix),expression={jaw:blend.jawOpen||0,blinkLeft:blend.eyeBlinkLeft||0,blinkRight:blend.eyeBlinkRight||0};
  return {x:(minX+maxX)/2,y:(minY+maxY)/2,rx:Math.max((maxX-minX)/2,.015),ry:Math.max((maxY-minY)/2,.02),angle:Math.atan2((right.y-left.y)*video.videoHeight,(right.x-left.x)*video.videoWidth),points,pose:null,top,chin,rotation,expression,aspect:w/h,blendshapes:blendshapes?.categories||[]};
}
function poseHead(points) {
  if(!points?.[0]||(points[0].visibility??1)<.45) return null;
  const visible=points.slice(0,11).filter(p=>(p.visibility??1)>.45),nose=points[0];
  const spread=visible.length>1?Math.max(...visible.map(p=>p.x))-Math.min(...visible.map(p=>p.x)):0;
  const shoulder=points[11]&&points[12]?distance(points[11],points[12]):.15;
  return {x:nose.x,y:nose.y-.015,rx:Math.max(spread*.72,shoulder*.27,.04),ry:Math.max(spread*.95,shoulder*.35,.055),angle:0,points:null,pose:points};
}
// Match the two independent model outputs by head position, never by array index.
function observationsFor(faces,poses,matrices=[],blendshapes=[],worldPoses=[]) {
  const observations=faces.map((points,i)=>faceObservation(points,matrices[i],blendshapes[i])).filter(Boolean),heads=poses.map((p,i)=>({head:poseHead(p),pose:p,worldPose:worldPoses[i]})).filter(p=>p.head);
  const pairs=[];observations.forEach((o,i)=>heads.forEach((h,j)=>{const d=distance(o,h.head),gate=Math.max(o.rx*2.8,h.head.rx*2.4,.07);if(d<gate)pairs.push({i,j,d:d/gate});}));
  pairs.sort((a,b)=>a.d-b.d);const faceUsed=new Set(),poseUsed=new Set();
  for(const {i,j} of pairs)if(!faceUsed.has(i)&&!poseUsed.has(j)){observations[i].pose=heads[j].pose;observations[i].worldPose=heads[j].worldPose;faceUsed.add(i);poseUsed.add(j);}
  heads.forEach((h,j)=>{if(!poseUsed.has(j))observations.push({...h.head,worldPose:h.worldPose});});return observations;
}
function newTrack(o,t) {
  const id=nextId++,choices=avatars.map((a,i)=>({a,i})).filter(({a})=>a.group===avatars[defaultAvatar].group).map(({i})=>i);
  return {id,avatar:choices[(choices.indexOf(defaultAvatar)+id-1)%choices.length],x:o.x,y:o.y,rx:o.rx,ry:o.ry,angle:o.angle,lastSeen:t,visible:true,stable:null,stableSince:t,armed:true,lastFire:-Infinity,action:null,observation:o,lastRotation:o.rotation};
}
function updateTracks(observations,t) {
  // Disappearance expires after 1.2 s; no biometric identity recognition is used.
  tracks=tracks.filter(track=>t-track.lastSeen<1200);tracks.forEach(track=>{track.visible=false;track.observation=null;track.action=null;});
  const candidates=[];tracks.forEach((track,i)=>observations.forEach((o,j)=>{
    const gate=Math.max(.085,Math.min(.23,Math.max(track.rx,o.rx)*2.6));const d=distance(track,o);
    if(d<gate)candidates.push({i,j,cost:d/gate+Math.abs(Math.log(o.rx/track.rx))*.15});
  }));candidates.sort((a,b)=>a.cost-b.cost);
  const usedTracks=new Set(),usedObs=new Set();
  for(const {i,j} of candidates){if(usedTracks.has(i)||usedObs.has(j))continue;
    const track=tracks[i],o=observations[j];if(o.rotation)track.lastRotation=o.rotation;else o.rotation=track.lastRotation;Object.assign(track,{x:o.x,y:o.y,rx:o.rx,ry:o.ry,angle:o.angle,lastSeen:t,visible:true,observation:o});usedTracks.add(i);usedObs.add(j);
  }
  observations.forEach((o,j)=>{if(!usedObs.has(j)&&tracks.length<MAX_PLAYERS){tracks.push(newTrack(o,t));usedObs.add(j);}});
  // Unassigned detections still receive anonymous masks, even if the four player slots are full.
  if(!tracks.some(track=>track.id===selectedId)){selectedId=tracks[0]?.id??null;avatarGroup=avatars[currentAvatar()].group;renderAvatars();}
  return observations.filter((o,j)=>!usedObs.has(j));
}
function detect(p,f,track,t=0) { return Motion.classify(p,f,track,t); }
function processActions(t) {
  for(const track of tracks){
    if(!track.visible){track.stable=null;track.stableSince=t;continue;}
    const action=detect(track.observation?.pose,track.observation?.points,track,t);track.action=action;
    if(action!==track.stable){track.stable=action;track.stableSince=t;}
    if(!action&&t-track.stableSince>=300)track.armed=true;
    const holdTime=action==='raise'||action==='handsup'?650:240;
    if(performing&&action&&track.armed&&t-track.stableSince>=holdTime&&t-track.lastFire>=2200&&t-lastGlobalFire>=1700){fire(action,track,t);track.armed=false;}
  }
}
function updateCameraLayout(w,h){
  $('stage').style.setProperty('--camera-aspect','16 / 9');$('stage').classList.add('live');document.body.classList.add('camera-live');
  const portrait=h>w;
  $('cameraNotice').hidden=!portrait;
  if(portrait)$('cameraNotice').textContent='当前摄像头为竖屏（'+w+' × '+h+'）。卡通舞台保持完整显示；多人请横放手机，并让镜头拍到头部和双脚。';
}
function renderCamera(observations,extras,t=performance.now()){
  if(!frame.width||!frame.height)return;const w=1200,h=675;
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  updateCameraLayout(frame.width,frame.height);drawStageBackground(w,h);
  const visible=tracks.filter(p=>p.visible),count=Math.max(visible.length,1);
  const items=visible.map(track=>({id:track.id,avatar:track.avatar,fullBody:track.avatar>=4,observedAt:track.lastSeen,slotCount:count,stageX:Math.max(.09,Math.min(.91,track.x)),
    observation:track.avatar>=4?track.observation:{...track.observation,y:.46,rx:Math.min(.13,.27/count),ry:.17}}));
  for(const item of items)ellipse((mirror?1-item.stageX:item.stageX)*w,h*.87,Math.min(w/count*.25,95),h*.02,'#788f5e25');
  ctx.save();if(mirror){ctx.translate(w,0);ctx.scale(-1,1);}
  if(avatar3D){try{ctx.drawImage(avatar3D.draw(items,w,h,t),0,0,w,h);}catch(e){log('3D 舞台绘制失败：'+errorText(e));avatar3D.dispose();avatar3D=null;}}
  if(!avatar3D)for(const item of items)drawAvatar(item.stageX*w,h*.45,w*.07,h*.13,0,item.avatar);
  ctx.restore();
  ctx.font=`600 ${Math.max(12,w/65)}px sans-serif`;ctx.textAlign='center';
  for(const track of visible){const x=(mirror?1-Math.max(.09,Math.min(.91,track.x)):Math.max(.09,Math.min(.91,track.x)))*w,label=playerName(track.id),labelWidth=ctx.measureText(label).width+22,y=h*.95;
    ctx.fillStyle='#415837dd';ctx.beginPath();ctx.roundRect(x-labelWidth/2,y-19,labelWidth,28,10);ctx.fill();ctx.fillStyle='#fff6da';ctx.fillText(label,x,y+1);}
  $('stageHint').textContent=visible.length?(visible.some(track=>avatars[track.avatar].group==='human')?'全身卡通舞台 · 镜头未拍到的腿脚保持站姿':'动物角色舞台 · 转头、眨眼和张嘴跟随'):'等待演员入镜 · 镜头请拍到头部与双脚';
  $('mirrorLabel').textContent=mirror?'◉ 镜像跟随':'◉ 正向跟随';
}
function primeAudio() {
  if(!$('soundEnabled').checked)return;
  try{const Audio=window.AudioContext||window.webkitAudioContext;if(Audio){audio??=new Audio();audio.resume().catch(()=>{});}}catch(e){log('音频初始化：'+errorText(e));}
}
function sound(action) {
  if(!$('soundEnabled').checked||!audio||audio.state!=='running')return;
  const now=audio.currentTime,notes=action==='head'?[220,165,110]:action==='forehead'?[196,174,146]:[330,440,554];
  notes.forEach((freq,i)=>{const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.type='triangle';oscillator.frequency.value=freq;gain.gain.setValueAtTime(.0001,now+i*.13);gain.gain.exponentialRampToValueAtTime(.08,now+i*.13+.02);gain.gain.exponentialRampToValueAtTime(.0001,now+i*.13+.4);oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(now+i*.13);oscillator.stop(now+i*.13+.42);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};});
}
function fire(action,track,t) {
  track.lastFire=t;lastGlobalFire=t;events++;const level=+$('level').value,line=texts[action][level];
  $('subtitleText').textContent=playerName(track.id)+' · '+line;$('subtitle').classList.add('visible');
  $('overlay').className='overlay '+({forehead:'gray',head:'flash',handsup:'flash',turn:'warm',wave:'warm',raise:'warm',arms:'flash',tilt:'warm',mouth:'flash'}[action]||'warm');
  $('stage').classList.remove('shake');void $('stage').offsetWidth;$('stage').classList.add('shake');sound(action);
  const li=document.createElement('li');li.className='history-entry';const time=document.createElement('time'),who=document.createElement('b'),text=document.createElement('p');
  time.textContent=new Date().toLocaleTimeString('zh-CN',{hour12:false});who.textContent=(demoMode?'示意 · ':'')+playerName(track.id)+' / '+actionNames[action];if(demoMode)who.className='demo-label';text.textContent=line;li.append(time,who,text);
  if(!events||$('history').querySelector('.empty-history'))$('history').replaceChildren();$('history').prepend(li);while($('history').children.length>40)$('history').lastChild.remove();
  $('eventCount').textContent=events+' 次加戏';clearTimeout(clearTimer);clearTimer=setTimeout(clearEffect,2600);
}
function clearEffect() { $('subtitle').classList.remove('visible');$('subtitleText').textContent='';$('overlay').className='overlay';$('stage').classList.remove('shake'); }
async function makeDetector(Class,vision,path,options,label) {
  for(const delegate of ['GPU','CPU']){try{if(loading)status('正在准备'+label+'（'+delegate+'）…');const detector=await Class.createFromOptions(vision,{baseOptions:{modelAssetPath:path,delegate},runningMode:'VIDEO',...options});log(label+' '+delegate+' 已就绪');return detector;}catch(e){log(label+' '+delegate+' 失败：'+errorText(e));}}
  return null;
}
async function loadAI() {
  if(face&&pose)return;if(aiPromise)return aiPromise;
  aiPromise=(async()=>{
    const sources=['https://cdn.jsdelivr.net/npm','https://unpkg.com'];const base='https://storage.googleapis.com/mediapipe-models/';
    for(const source of sources){try{
      if(loading)status('正在下载识别模型，首次加载需要一些时间…');const root=source+'/@mediapipe/tasks-vision@'+AI_VERSION;
      const mod=await import(root+'/vision_bundle.mjs'),lib=mod.FaceLandmarker?mod:mod.default;
      const vision=await lib.FilesetResolver.forVisionTasks(root+'/wasm');
      if(!face)face=await makeDetector(lib.FaceLandmarker,vision,base+'face_landmarker/face_landmarker/float16/1/face_landmarker.task',{numFaces:8,outputFacialTransformationMatrixes:true,outputFaceBlendshapes:true,minFaceDetectionConfidence:.5,minFacePresenceConfidence:.5,minTrackingConfidence:.5},'多人脸部模型');
      if(!face)throw new Error('脸部模型加载失败，无法启动人物跟随。请检查网络能否访问模型地址。');
      if(!pose)pose=await makeDetector(lib.PoseLandmarker,vision,base+'pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',{numPoses:MAX_PLAYERS,minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5,minTrackingConfidence:.5},'多人动作模型');
      if(pose)return;
    }catch(e){log('模型来源 '+source+' 失败：'+errorText(e));}}
    if(!face)throw new Error('人物跟随模型未能加载。请展开诊断检查网络后重试。');
    log('姿态模型不可用，将只识别转头。');
  })();try{await aiPromise;}finally{aiPromise=null;}
}
function closeCamera() { if(stream)stream.getTracks().forEach(track=>track.stop());stream=null;video.pause();video.srcObject=null;$('stage').classList.remove('live');document.body?.classList.remove('camera-live');$('cameraNotice').hidden=true; }
async function openCamera(token) {
  if(stream?.active)return true;
  if(!window.isSecureContext)throw new Error('摄像头需要 HTTPS 或 localhost。请通过本地服务器或 HTTPS 网站打开。');
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('当前浏览器不支持摄像头，请使用 Chrome、Edge 或 Safari。');
  status('请允许摄像头权限。模型就绪后才会显示处理后的画面。');
  let acquired;
  try{acquired=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:cameraFacing},width:{ideal:1280},height:{ideal:720},aspectRatio:{ideal:16/9},resizeMode:{ideal:'none'}},audio:false});}
  catch(e){if(e.name!=='OverconstrainedError')throw e;acquired=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:cameraFacing}},audio:false});}
  if(token!==session){acquired.getTracks().forEach(track=>track.stop());return false;}
  stream=acquired;video.srcObject=acquired;
  const settings=acquired.getVideoTracks()[0]?.getSettings?.()||{};mirror=(settings.facingMode||cameraFacing)!=='environment';log('摄像头实际参数：'+JSON.stringify(settings));
  acquired.getVideoTracks().forEach(track=>track.addEventListener('ended',()=>{if(stream===acquired){stop();status('摄像头连接已中断，请重新开启。','error');}}));
  await video.play();if(token!==session)return false;updateCameraLayout(video.videoWidth||1280,video.videoHeight||720);return true;
}
function loop() {
  if(!stream||demoMode)return;
  try{
    const t=performance.now();
    if(video.readyState>=2&&video.videoWidth>0&&video.currentTime!==lastVideoTime&&t-lastInference>=100){
      lastInference=t;lastVideoTime=video.currentTime;
      const size=Motion.captureSize(video.videoWidth,video.videoHeight,1280);
      if(frame.width!==size.width||frame.height!==size.height){frame.width=size.width;frame.height=size.height;}
      // Snapshot once, then infer and render that SAME frame to avoid mask/frame drift.
      frameCtx.drawImage(video,0,0,frame.width,frame.height);
      const started=performance.now(),fr=face.detectForVideo(frame,t),pr=pose?.detectForVideo(frame,t);
      const observations=observationsFor(fr.faceLandmarks||[],pr?.landmarks||[],fr.facialTransformationMatrixes||[],fr.faceBlendshapes||[],pr?.worldLandmarks||[]),extras=updateTracks(observations,t);
      processActions(t);lastSceneObservations=observations;lastSceneExtras=extras;renderPlayers();
      $('performance').textContent='识别 '+Math.round(performance.now()-started)+' ms / 帧';
      $('tag').textContent=(performing?'正在加戏':'摄像头预览')+' · '+tracks.filter(p=>p.visible).length+' 人入镜';
      $('maskBadge').textContent=extras.length?'已识别更多演员 · 舞台最多显示 4 人':avatar3D?'卡通角色跟随已开启':'3D 舞台未就绪';
    }
    if(frame.width&&t-lastStageRender>=33){renderCamera(lastSceneObservations,lastSceneExtras,t);lastStageRender=t;}
  }catch(e){cancelAnimationFrame(raf);closeCamera();performing=false;ctx.clearRect(0,0,canvas.width,canvas.height);drawDemo(0);$('placeholder').hidden=false;$('tag').textContent='识别已停止';$('maskBadge').textContent='✦ 等待重新连接';tracks=[];selectedId=null;renderPlayers(true);renderAvatars();clearEffect();status('识别中断，摄像头已关闭。'+errorText(e),'error');$('diagnostic').open=true;setButtons();return;}
  raf=requestAnimationFrame(loop);
}
async function connect(perform) {
  if(loading||performing&&!demoMode)return;primeAudio();
  if(demoMode){stop();primeAudio();}
  if(stream&&face&&!loading){performing=perform;setButtons();status('正在加戏 · 试试扶额、抱头或转头。','ok');return;}
  const token=++session;loading=true;setButtons();$('tag').textContent='片场准备中';$('placeholder').querySelector('h2').textContent='正在准备片场…';
  try{
    if(!await openCamera(token))return;if(token!==session)return;
    await initAvatar3D();if(token!==session||!stream)return;
    await loadAI();if(token!==session||!stream)return;
    performing=perform;lastSceneObservations=[];lastSceneExtras=[];lastStageRender=0;lastVideoTime=-1;lastInference=-Infinity;lastGlobalFire=-Infinity;tracks=[];nextId=1;selectedId=null;
    $('placeholder').hidden=true;status((perform?'正在加戏':'预览已开启')+(pose?' · 最多 4 人，卡通全身跟随，可做举手、挥手、扶额等动作。':' · 动作模型不可用，当前仅支持转头。'),'ok');loop();
  }catch(e){if(token!==session)return;closeCamera();drawDemo(0);$('tag').textContent='连接失败 · 可重试';status('启动失败。'+errorText(e),'error');$('diagnostic').open=true;}
  finally{if(token===session){loading=false;setButtons();}}
}
function stop() {
  session++;cancelAnimationFrame(raf);clearTimeout(clearTimer);closeCamera();demoMode=false;performing=false;loading=false;tracks=[];selectedId=null;nextId=1;
  $('stage').classList.remove('live');document.body.classList.remove('camera-live');$('cameraNotice').hidden=true;setExpanded(false);
  clearEffect();$('placeholder').hidden=false;$('placeholder').querySelector('h2').textContent='开启摄像头，让大家一起入镜。';
  $('tag').textContent='效果示意';$('maskBadge').textContent='卡通身份已准备';$('stageHint').textContent='示意角色 · 摄像头未开启';$('performance').textContent='卡通角色自动跟随';
  if(audio){audio.suspend().catch(()=>{});}drawDemo(0);renderPlayers(true);renderAvatars();setButtons();status('本场已结束，摄像头已关闭。');
}
function demoLoop(t) {
  if(!demoMode)return;
  if(t-lastDemoFrame>50){drawDemo(t-demoStarted);lastDemoFrame=t;const step=Math.floor((t-demoStarted)/3400);
    if(step!==demoStep){demoStep=step;tracks.forEach(p=>p.action=null);const track=tracks[step%tracks.length],action=Object.keys(texts)[step%Object.keys(texts).length];track.action=action;fire(action,track,t);renderPlayers();}}
  raf=requestAnimationFrame(demoLoop);
}
function startDemo() {
  if(demoMode){stop();return;}stop();primeAudio();demoMode=true;performing=true;demoStarted=performance.now();demoStep=-1;lastDemoFrame=0;
  tracks=[0,1,2].map(i=>({...newTrack({x:.25+i*.25,y:.55,rx:.07,ry:.12,angle:0},demoStarted),avatar:previewAvatars[i]}));selectedId=tracks[0].id;
  $('placeholder').hidden=true;$('tag').textContent='示意模式 · 非实时识别';$('maskBadge').textContent='✦ 卡通效果演示';$('stageHint').textContent='动画示意 · 未开启摄像头';$('performance').textContent='自动轮播示例动作';
  status('正在播放示意动画，未开启摄像头。点击“开始加戏”进入真实片场。');renderPlayers(true);renderAvatars();setButtons();demoLoop(demoStarted);
}
async function loadAvatarModule(){
  if(avatarModule)return avatarModule;
  avatarImport??=import('./avatar3d.js?v=10');
  try{avatarModule=await avatarImport;return avatarModule;}catch(e){avatarImport=null;throw e;}
}
async function initAvatar3D(){
  if(avatar3D)return avatar3D;if(avatarRendererPromise)return avatarRendererPromise;
  avatarRendererPromise=(async()=>{
    try{const module=await loadAvatarModule();avatar3D=await module.createAvatarRenderer();log('五位全身人物及动物角色已就绪');return avatar3D;}
    catch(e){log('3D 初始化失败：'+errorText(e));return null;}
    finally{avatarRendererPromise=null;}
  })();return avatarRendererPromise;
}
function setExpanded(value){
  expanded=value;$('stage').classList.toggle('is-expanded',value);document.body.classList.toggle('stage-expanded',value);$('closeExpanded').hidden=!value;$('expandStage').textContent=value?'退出放大':'放大舞台';
  if(!value&&document.fullscreenElement===$('stage'))document.exitFullscreen?.().catch(()=>{});
  if(!value)screen.orientation?.unlock?.();
}
async function wideView(){
  setExpanded(true);
  try{if($('stage').requestFullscreen&&!document.fullscreenElement)await $('stage').requestFullscreen();await screen.orientation?.lock?.('landscape');}
  catch(e){log('浏览器未允许锁定横屏，可手动横放手机。');}
  status('已放大舞台。请将手机横放并适当放远，让大家进入同一画面。');
}
async function switchCamera(){
  if(loading)return;cameraFacing=cameraFacing==='user'?'environment':'user';
  if(!stream){setButtons();status('下次开启时将优先使用'+(cameraFacing==='user'?'前置':'后置')+'摄像头。');return;}
  const wasPerforming=performing;performing=false;cancelAnimationFrame(raf);closeCamera();await connect(wasPerforming);
}
function close3DPreview(){
  previewToken++;cancelAnimationFrame(previewRaf);previewRenderer?.dispose();previewRenderer=null;if($('previewDialog').open)$('previewDialog').close();
}
async function show3DPreview(){
  const dialog=$('previewDialog');if(dialog.open)return;const token=++previewToken;dialog.showModal();$('previewMessage').textContent='正在准备 3D 模型…';
  try{const module=await loadAvatarModule();if(token!==previewToken||!dialog.open)return;const created=await module.createAvatarRenderer({maxInstances:1});if(token!==previewToken||!dialog.open){created.dispose();return;}previewRenderer=created;$('previewMessage').textContent='五位人物使用与主页舞台相同的完整模型。切换全身或面部，拖动滑块检查侧面。';
    let lastPreviewPaint=-Infinity;
    const paint=t=>{
      if(!dialog.open||!previewRenderer)return;
      if(t-lastPreviewPaint<33){previewRaf=requestAnimationFrame(paint);return;}lastPreviewPaint=t;const out=$('avatarPreview'),context=out.getContext('2d'),choice=+$('previewAnimal').value,all=choice<0,types=choice===-2?[4,5,6,7,8]:choice===-1?[0,1,2,3]:[choice];
      const yaw=$('previewAuto').checked?Math.sin(t/1500)*1.05:+$('previewYaw').value*Math.PI/180,pitch=+$('previewPitch').value*Math.PI/180;
      context.fillStyle='#e6ead6';context.fillRect(0,0,out.width,out.height);
      const full=$('previewFraming').value==='full';
      const items=types.map((avatar,i)=>({id:'preview-'+avatar,avatar,snap:true,fullBody:full&&avatar>=4,slotCount:types.length,slotWidthUnits:1.85,stageX:(i+.5)/types.length,viewYaw:full?yaw:0,demoPose:avatar>=4?'stand':undefined,observation:{x:(i+.5)/types.length,y:.5,rx:all ? .22/types.length : .125,ry:all ? .13 : .18,rotation:{yaw:full&&avatar>=4?0:yaw,pitch,roll:0}}}));
      try{context.drawImage(previewRenderer.draw(items,out.width,out.height,t),0,0);}catch(e){$('previewMessage').textContent='3D 预览已中断。'+errorText(e);return;}
      context.fillStyle='#5b7044';context.textAlign='center';context.font='24px "Microsoft YaHei",sans-serif';types.forEach((a,i)=>context.fillText(avatars[a].name,all?(i+.5)*out.width/types.length:out.width/2,out.height-20));
      previewRaf=requestAnimationFrame(paint);
    };previewRaf=requestAnimationFrame(paint);
  }catch(e){$('previewMessage').textContent='当前浏览器无法开启 3D 渲染。'+errorText(e);log('3D 预览失败：'+errorText(e));}
}
function renderActionGuide(){
  const tips={forehead:'一只手放到额头附近。',head:'两只手放在头部两侧。',turn:'缓慢向左或向右转头。',raise:'单手举到头顶上方。',handsup:'两只手举过头顶。',wave:'举手后左右挥动两个来回。',arms:'两臂向左右展开，手腕接近肩高。',tilt:'向左肩或右肩歪头。',mouth:'面向镜头张大嘴。'};
  $('actionList').replaceChildren();for(const [key,item] of Object.entries(Motion.actions)){const card=document.createElement('article'),title=document.createElement('h3'),tip=document.createElement('p'),line=document.createElement('p');title.textContent=item.name;tip.textContent=tips[key];line.textContent='夸张档 · '+item.lines[1];card.append(title,tip,line);$('actionList').append(card);}
}
$('start').addEventListener('click',()=>connect(true));$('cameraTest').addEventListener('click',()=>connect(false));$('stop').addEventListener('click',stop);$('demo').addEventListener('click',startDemo);$('level').addEventListener('input',updateLevel);
$('humanTab').addEventListener('click',()=>{avatarGroup='human';renderAvatars();});$('animalTab').addEventListener('click',()=>{avatarGroup='animal';renderAvatars();});
$('preview3d').addEventListener('click',show3DPreview);$('closePreview').addEventListener('click',close3DPreview);$('previewDialog').addEventListener('cancel',e=>{e.preventDefault();close3DPreview();});
$('previewDialog').addEventListener('click',e=>{if(e.target===$('previewDialog')){const r=$('previewDialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close3DPreview();}});
for(const id of ['previewYaw','previewPitch'])$(id).addEventListener('input',()=>{$('previewAuto').checked=false;});
$('expandStage').addEventListener('click',()=>setExpanded(!expanded));$('closeExpanded').addEventListener('click',()=>setExpanded(false));$('wideMode').addEventListener('click',wideView);$('switchCamera').addEventListener('click',switchCamera);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&expanded)setExpanded(false);});document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&expanded)setExpanded(false);});
window.addEventListener('orientationchange',()=>{clearTimeout(orientationTimer);orientationTimer=setTimeout(async()=>{const track=stream?.getVideoTracks()[0];if(track)try{await track.applyConstraints({width:{ideal:1280},height:{ideal:720},aspectRatio:{ideal:16/9},resizeMode:{ideal:'none'}});}catch(e){log('横屏参数沿用浏览器设置。');}},600);});
$('soundEnabled').addEventListener('change',()=>{if($('soundEnabled').checked)primeAudio();});
$('copyLog').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('env').textContent+'\n'+lines.join('\n'));$('copyLog').textContent='已复制';}catch(e){$('copyLog').textContent='请手动选择上方日志复制';}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)close3DPreview();if(document.hidden&&(stream||loading||demoMode)){stop();status('页面已切到后台，摄像头已关闭。需要时可重新开启。');}});
window.addEventListener('pagehide',()=>{close3DPreview();session++;loading=false;performing=false;demoMode=false;cancelAnimationFrame(raf);closeCamera();});
$('env').textContent=`网页 ${APP_BUILD} · MediaPipe ${AI_VERSION}\n地址 ${location.href}\n安全上下文 ${window.isSecureContext?'是':'否'}\n浏览器 ${navigator.userAgent}`;
renderActionGuide();loadArtwork();loadHumanPortraits();renderAvatars();renderPlayers(true);updateLevel();drawDemo(0);setButtons();log('页面已就绪。最大演员数 '+MAX_PLAYERS+'；原始视频元素隐藏。');

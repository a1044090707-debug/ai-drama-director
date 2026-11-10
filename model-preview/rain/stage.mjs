import * as T from '../../vendor/three.module.js';
import {createRainAvatar} from './avatar.mjs';
import {AvatarDriver,matchActors} from '../fullbody/driver.mjs';

const el=id=>document.getElementById(id),host=el('view'),video=el('video');
const renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;host.append(renderer.domElement);renderer.domElement.setAttribute('aria-label','带有双腿和鞋子的完整卡通角色');
const scene=new T.Scene(),camera=new T.PerspectiveCamera(30,1,.1,100);camera.position.set(0,2.08,9.9);camera.lookAt(0,1.98,0);
scene.add(new T.HemisphereLight(0xfff6e8,0x9fae8b,1.75));
const key=new T.DirectionalLight(0xffedd9,2.7);key.position.set(-3.5,6,4.5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-4;key.shadow.camera.right=4;key.shadow.camera.top=5;key.shadow.camera.bottom=-3;key.shadow.bias=-.0003;key.shadow.normalBias=.025;scene.add(key);
const fill=new T.DirectionalLight(0xe3ecf4,.8);fill.position.set(4,3,3);scene.add(fill);const rim=new T.DirectionalLight(0xffd2aa,1.7);rim.position.set(1.5,4,-3);scene.add(rim);
const platform=new T.Mesh(new T.CylinderGeometry(1.35,1.45,.11,64),new T.MeshStandardMaterial({color:'#dbe4ca',roughness:1}));platform.position.y=-.058;platform.receiveShadow=true;scene.add(platform);
const ground=new T.Mesh(new T.PlaneGeometry(200,200),new T.ShadowMaterial({opacity:.11}));ground.rotation.x=-Math.PI/2;ground.position.y=-.115;ground.receiveShadow=true;scene.add(ground);
const pivot=new T.Group();scene.add(pivot);el('cameraStatus').textContent='正在加载 Rain 模型…';
const first=await createRainAvatar().catch(e=>{el('cameraStatus').textContent='模型加载失败：'+e.message;throw e;});pivot.add(first.root);first.ground();el('cameraStatus').textContent='摄像头未开启。';
const actors=new Map([['preview',{avatar:first,driver:new AvatarDriver(first)}]]);let skeleton=new T.SkeletonHelper(first.root);skeleton.visible=false;skeleton.material.depthTest=false;skeleton.renderOrder=9;scene.add(skeleton);
el('triangles').textContent=first.stats().triangles.toLocaleString();
let poseName='stand',yaw=0,pitch=0,zoom=1,closeup=false,drag=null,worker=null,stream=null,running=false,starting=false,session=0,ready=false,inFlight=false,capturePending=false,lastCapture=0,lastVideo=-1,tracks=[],lastResult=0,cancelReady=null;
const pendingActors=new Set();
const names={stand:'自然站姿',wave:'挥手',arms:'展开双臂',squat:'屈膝下蹲',step:'抬腿迈步',tiptoe:'踮起脚尖',toe:'脚前部弯曲'};
function setPose(name){if(running)return;poseName=name;el('poseName').textContent=names[name];for(const b of document.querySelectorAll('[data-pose]'))b.classList.toggle('selected',b.dataset.pose===name);}
for(const b of document.querySelectorAll('[data-pose]'))b.addEventListener('click',()=>setPose(b.dataset.pose));
el('amount').addEventListener('input',()=>el('amountValue').textContent=el('amount').value+'%');
for(const b of document.querySelectorAll('[data-yaw]'))b.addEventListener('click',()=>{yaw=Number(b.dataset.yaw)*Math.PI/180;pitch=0;for(const x of document.querySelectorAll('[data-yaw]'))x.classList.toggle('active',x===b);});
el('skeleton').addEventListener('change',()=>skeleton.visible=el('skeleton').checked);
el('wire').addEventListener('change',()=>{for(const {avatar} of actors.values())for(const m of Object.values(avatar.materials))m.wireframe=el('wire').checked;});
renderer.domElement.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,yaw,pitch};renderer.domElement.setPointerCapture(e.pointerId);});renderer.domElement.addEventListener('pointermove',e=>{if(!drag||!e.buttons)return;yaw=drag.yaw+(e.clientX-drag.x)*.006;pitch=T.MathUtils.clamp(drag.pitch+(e.clientY-drag.y)*.003,-.30,.30);});for(const name of ['pointerup','pointercancel','lostpointercapture'])renderer.domElement.addEventListener(name,()=>drag=null);
el('fit').addEventListener('click',()=>{zoom=1;closeup=false;pitch=0;resize();});
el('faceView').addEventListener('click',()=>{zoom=1;closeup=true;pitch=0;resize();});
renderer.domElement.addEventListener('wheel',e=>{if(!e.ctrlKey)return;e.preventDefault();zoom=T.MathUtils.clamp(zoom*Math.exp(-e.deltaY*.001),.65,1.75);resize();},{passive:false});
function resize(){const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.position.z=(closeup?3.2:camera.aspect<.75?12.7:9.9)/zoom;camera.position.y=closeup?3.42:2.08;camera.lookAt(0,closeup?3.42:1.98,0);camera.updateProjectionMatrix();}new ResizeObserver(resize).observe(host);resize();
function workerReady(token,players){return new Promise((resolve,reject)=>{
  worker=new Worker(new URL('../fullbody/tracking-worker.mjs',import.meta.url));
  const timer=setTimeout(()=>reject(new Error('动作模型加载超时，请检查网络后重试。')),120000);
  cancelReady=()=>{clearTimeout(timer);reject(new Error('摄像头启动已取消。'));};
  worker.onerror=e=>{clearTimeout(timer);reject(new Error(e.message||'动作识别线程无法启动'));};
  worker.onmessage=({data:d})=>{
    if(token!==session)return;
    if(d.type==='status')el('cameraStatus').textContent=d.message;
    if(d.type==='ready'){clearTimeout(timer);cancelReady=null;ready=true;resolve();}
    if(d.type==='error'){clearTimeout(timer);reject(new Error(d.message));}
    if(d.type==='frame-error'){inFlight=false;el('cameraStatus').textContent='本帧识别失败：'+d.message;}
    if(d.type==='result'){inFlight=false;lastResult=performance.now();receive(d);}
  };worker.postMessage({type:'init',players});
});}
function faceFor(d,p,used){let best=-1,dist=.24;for(let i=0;i<(d.faces?.length||0);i++){if(used.has(i))continue;const f=d.faces[i],nose=f[1]||f[0],head=p[0],v=Math.hypot(nose.x-head.x,nose.y-head.y);if(v<dist){dist=v;best=i;}}if(best>=0)used.add(best);return best;}
let subtitleUntil=0,lastActionTime=0;
function receive(d){
  const now=performance.now(),used=new Set(),observations=(d.poses||[]).map((p,i)=>{const j=faceFor(d,p,used),hips=p[23]&&p[24]?{x:(p[23].x+p[24].x)/2,y:(p[23].y+p[24].y)/2}:p[0];return{x:hips.x,y:hips.y,landmarks:p,worldLandmarks:d.world?.[i],faceMatrix:j>=0?d.matrices[j]:null,blendshapes:j>=0?d.blendshapes[j]:null,face:j>=0?d.faces[j]:null};});
  // A face still controls head/expression when the body detector misses a frame.
  (d.faces||[]).forEach((f,i)=>{if(!used.has(i))observations.push({x:f[1].x,y:f[1].y+.25,face:f,faceMatrix:d.matrices[i],blendshapes:d.blendshapes[i]});});
  tracks=matchActors(tracks,observations,now,Number(el('players').value));
  const keys=new Set();for(const track of tracks){const id='actor-'+track.id;keys.add(id);let item=actors.get(id);if(!item&&!pendingActors.has(id)){pendingActors.add(id);const token=session;createRainAvatar().then(avatar=>{if(token!==session||!tracks.some(t=>'actor-'+t.id===id)){avatar.dispose();return;}avatar.root.scale.setScalar(Number(el('players').value)>1?.78:1);pivot.add(avatar.root);actors.set(id,{avatar,driver:new AvatarDriver(avatar)});}).catch(e=>el('cameraStatus').textContent='角色加载失败：'+e.message).finally(()=>pendingActors.delete(id));}if(item){if(track.visible)item.driver.update(track,now);item.avatar.root.visible=now-track.lastSeen<1200;}}
  for(const [id,item] of actors)if(id!=='preview'&&!keys.has(id)){pivot.remove(item.avatar.root);item.avatar.dispose();actors.delete(id);}
  const visible=tracks.filter(t=>t.visible).length,total=tracks.length;
  const ordered=[...tracks].sort((a,b)=>a.id-b.id);for(let i=0;i<ordered.length;i++){const item=actors.get('actor-'+ordered[i].id);if(item)item.avatar.root.position.x=(i-(total-1)/2)*(total>2?1.30:1.65);}
  platform.scale.set(Math.max(1,total*.7),1,1);
  el('cameraStatus').textContent=visible?'正在跟随 '+visible+' 位玩家 · 识别耗时 '+Math.round(d.ms)+' ms':'未找到玩家，等待进入画面。';
  const legs=tracks.filter(t=>t.visible&&actors.get('actor-'+t.id)?.driver.legsVisible).length,feet=tracks.filter(t=>t.visible&&actors.get('actor-'+t.id)?.driver.feetVisible).length;
  el('trackingNote').textContent='腿部可见 '+legs+' 人 · 脚部可见 '+feet+' 人。未检测到的部位回到自然站姿。';
  if(now-lastActionTime>2400){for(const track of tracks.filter(t=>t.visible)){const action=window.Motion?.classify(track.landmarks,track.face,track,d.time);if(action){el('speech').textContent='演员 '+track.id+' · '+window.Motion.actions[action].lines[1];el('speech').hidden=false;subtitleUntil=now+2100;lastActionTime=now;break;}}}
}
async function start(){if(starting||running)return;const token=++session;starting=true;el('camera').disabled=true;el('stop').hidden=false;el('players').disabled=true;el('cameraStatus').textContent='请允许摄像头取景。';
  try{
    if(!isSecureContext)throw new Error('请通过 localhost 或 HTTPS 打开页面。');
    const acquired=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},facingMode:'user'},audio:false});
    if(token!==session){acquired.getTracks().forEach(t=>t.stop());return;}stream=acquired;video.srcObject=stream;await video.play();
    if(token!==session)return;await workerReady(token,Number(el('players').value));if(token!==session)return;
    running=true;starting=false;lastResult=performance.now();first.root.visible=false;tracks=[];yaw=0;pitch=0;el('stop').hidden=false;el('camera').hidden=true;el('liveBadge').classList.add('live');el('liveBadge').textContent='● CAMERA TRACKING';el('modeNote').textContent='真人驱动 · 主舞台不显示摄像头画面';el('poseName').textContent='实时动作跟随';for(const b of document.querySelectorAll('[data-pose]'))b.disabled=true;el('cameraStatus').textContent='模型就绪，等待玩家入镜。';
    stream.getVideoTracks()[0].addEventListener('ended',()=>{if(running)stop();});
  }catch(e){if(token===session){stop();el('cameraStatus').textContent=e.name==='NotAllowedError'?'摄像头权限未开启。':e.message;}}
}
function stop(){session++;cancelReady?.();cancelReady=null;pendingActors.clear();running=starting=ready=inFlight=capturePending=false;worker?.terminate();worker=null;stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;tracks=[];lastVideo=-1;lastCapture=0;for(const [id,item] of actors)if(id!=='preview'){pivot.remove(item.avatar.root);item.avatar.dispose();actors.delete(id);}first.root.visible=true;platform.scale.set(1,1,1);el('camera').disabled=false;el('camera').hidden=false;el('players').disabled=false;el('stop').hidden=true;el('cameraStatus').textContent='摄像头已关闭。';el('trackingNote').textContent='';el('liveBadge').classList.remove('live');el('liveBadge').textContent='● MODEL PREVIEW';el('modeNote').textContent='全身模型 · 动作示范 · 未开启摄像头';for(const b of document.querySelectorAll('[data-pose]'))b.disabled=false;setPose(poseName);}
el('camera').addEventListener('click',start);el('stop').addEventListener('click',stop);document.addEventListener('visibilitychange',()=>{if(document.hidden&&(running||starting))stop();});window.addEventListener('pagehide',stop);
async function capture(now){if(!running||!ready||inFlight||capturePending||video.readyState<2||video.currentTime===lastVideo||now-lastCapture<45)return;const token=session;capturePending=true;lastCapture=now;lastVideo=video.currentTime;try{const scale=Math.min(1,960/video.videoWidth),image=await createImageBitmap(video,{resizeWidth:Math.round(video.videoWidth*scale),resizeHeight:Math.round(video.videoHeight*scale)});if(token!==session){image.close();return;}inFlight=true;worker.postMessage({type:'frame',image,time:now},[image]);}catch(e){el('cameraStatus').textContent='读取摄像头画面失败：'+e.message;}finally{if(token===session)capturePending=false;}}
let previous=0,frames=0,fpsStart=0;
function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-previous)/1000||.016,.1);previous=now;const t=now/1000;
  if(running){capture(now);for(const [id,item] of actors)if(id!=='preview')item.driver.frame(dt,now);if(now-lastResult>1200)el('cameraStatus').textContent='等待新的动作识别结果…';}
  else{first.demo(poseName,t,Number(el('amount').value)/100);const phase=t%4.5,blink=el('autoBlink').checked&&phase>4.23?Math.sin((phase-4.23)/.27*Math.PI)**2:0;first.expression({jawOpen:Number(el('jaw').value)/100,eyeBlinkLeft:Math.max(blink,Number(el('blink').value)/100),eyeBlinkRight:Math.max(blink,Number(el('blink').value)/100),mouthSmile:Number(el('smile').value)/100});}
  if(el('lightMove').checked)key.position.set(Math.sin(t*.65)*4,5,Math.cos(t*.65)*4);
  else key.position.set(-3.5,6,4.5);
  pivot.rotation.set(pitch,yaw,0,'YXZ');if(now>subtitleUntil)el('speech').hidden=true;renderer.render(scene,camera);frames++;
  if(now-fpsStart>800){el('fps').textContent=String(Math.round(frames*1000/(now-fpsStart)));frames=0;fpsStart=now;el('view').dataset.ready='true';el('view').dataset.pose=poseName;el('view').dataset.mode=running?'camera':'demo';el('view').dataset.triangles=renderer.info.render.triangles;el('view').dataset.cameraZ=camera.position.z;el('view').dataset.modelScale=first.content.scale.x;}
}requestAnimationFrame(frame);




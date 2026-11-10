import * as T from '../vendor/three.module.js';
import {createOrangeGirl} from './model.js';
import {exportStaticGLB} from './export-glb.js';

const el=id=>document.getElementById(id),host=el('viewport'),status=el('status');
try{
  const renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=false;host.append(renderer.domElement);renderer.domElement.setAttribute('aria-label','可拖动旋转的橙帽女生三维模型');
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(32,1,.1,100);camera.position.set(0,-.34,8.3);camera.lookAt(0,-.54,0);
  scene.add(new T.HemisphereLight(0xfff5eb,0xc3bbb0,2.0));
  const key=new T.DirectionalLight(0xffeddc,2.1);key.position.set(-3,4.5,7);scene.add(key);
  const fill=new T.DirectionalLight(0xf5eeea,1.5);fill.position.set(4,1.8,5);scene.add(fill);const rim=new T.DirectionalLight(0xffd6b0,1.4);rim.position.set(2,3,-4);scene.add(rim);
  const girl=createOrangeGirl();scene.add(girl.root);
  const floor=new T.Mesh(new T.CircleGeometry(2.1,96),new T.MeshStandardMaterial({color:'#d5dfc8',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.set(0,-2.51,0);scene.add(floor);
  let yaw=0,pitch=0,spin=false,zoom=1,drag=null,lastTime=0,frameCount=0,fps=0,exportURL=null;
  const knobs=['yaw','pitch','blink','jaw','smile'];
  function updateLabels(){for(const id of knobs)el(id+'Value').textContent=el(id).value+(id==='yaw'||id==='pitch'?'°':'%');}
  function setView(value){yaw=value;el('yaw').value=Math.round(value);for(const b of document.querySelectorAll('[data-view]'))b.classList.toggle('active',Number(b.dataset.view)===Math.round(value));updateLabels();}
  for(const button of document.querySelectorAll('[data-view]'))button.addEventListener('click',()=>{spin=false;el('spin').setAttribute('aria-pressed','false');setView(Number(button.dataset.view));});
  el('yaw').addEventListener('input',()=>{spin=false;el('spin').setAttribute('aria-pressed','false');setView(Number(el('yaw').value));});
  el('pitch').addEventListener('input',()=>{pitch=Number(el('pitch').value);updateLabels();});for(const id of ['blink','jaw','smile'])el(id).addEventListener('input',updateLabels);
  el('spin').addEventListener('click',()=>{spin=!spin;el('spin').setAttribute('aria-pressed',String(spin));});
  el('wireframe').addEventListener('change',()=>girl.setWireframe(el('wireframe').checked));el('showHair').addEventListener('change',()=>{girl.hair.visible=el('showHair').checked;});
  el('reset').addEventListener('click',()=>{spin=false;el('spin').setAttribute('aria-pressed','false');pitch=0;zoom=1;el('pitch').value=0;el('blink').value=0;el('jaw').value=0;el('smile').value=25;el('wireframe').checked=false;girl.setWireframe(false);el('showHair').checked=true;girl.hair.visible=true;setView(0);resize();});
  const pointers=new Map();let pinchStart=0,pinchZoom=1;
  renderer.domElement.addEventListener('pointerdown',e=>{renderer.domElement.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1)drag={x:e.clientX,y:e.clientY,yaw,pitch};if(pointers.size===2){const a=[...pointers.values()];pinchStart=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);pinchZoom=zoom;}spin=false;el('spin').setAttribute('aria-pressed','false');});
  renderer.domElement.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const a=[...pointers.values()];zoom=T.MathUtils.clamp(pinchZoom*Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)/Math.max(1,pinchStart),.65,1.8);resize();}else if(drag){setView(((drag.yaw+(e.clientX-drag.x)*.3+540)%360)-180);pitch=T.MathUtils.clamp(drag.pitch+(e.clientY-drag.y)*.18,-35,35);el('pitch').value=Math.round(pitch);updateLabels();}});
  function endPointer(e){pointers.delete(e.pointerId);drag=null;}renderer.domElement.addEventListener('pointerup',endPointer);renderer.domElement.addEventListener('pointercancel',endPointer);
  renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();zoom=T.MathUtils.clamp(zoom*Math.exp(-e.deltaY*.001),.65,1.8);resize();},{passive:false});
  function resize(){const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.position.z=(camera.aspect<.8?9.6:8.3)/zoom;camera.updateProjectionMatrix();}new ResizeObserver(resize).observe(host);resize();
  el('export').addEventListener('click',()=>{try{if(exportURL)URL.revokeObjectURL(exportURL);const data=exportStaticGLB(girl.root),blob=new Blob([data],{type:'model/gltf-binary'});exportURL=URL.createObjectURL(blob);const a=el('glbDownload');a.href=exportURL;a.hidden=false;a.textContent='模型已生成 · 点击保存 GLB';a.className='download';a.click();el('export').textContent='重新导出当前姿态';status.dataset.exportBytes=String(data.byteLength);status.dataset.export='pass';}catch(e){status.dataset.export='fail';status.textContent='导出失败：'+e.message;}});
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();status.textContent='图形上下文已丢失，请刷新预览页。';});
  const clock=new T.Clock();let last=0;
  function frame(){requestAnimationFrame(frame);const t=clock.getElapsedTime(),dt=Math.min(t-last,.1);last=t;if(spin)setView(((yaw+dt*19+540)%360)-180);girl.root.rotation.y=T.MathUtils.degToRad(yaw);girl.head.rotation.x=T.MathUtils.degToRad(pitch);
    const phase=t%4.8,natural=el('autoBlink').checked&&phase>4.45?Math.sin((phase-4.45)/.35*Math.PI)**2:0,blink=Math.max(Number(el('blink').value)/100,natural);girl.expression({blinkLeft:blink,blinkRight:blink,jaw:Number(el('jaw').value)/100,smile:Number(el('smile').value)/100});renderer.render(scene,camera);frameCount++;
    if(t-lastTime>.8){fps=Math.round(frameCount/(t-lastTime));frameCount=0;lastTime=t;status.textContent=`${renderer.info.render.triangles.toLocaleString()} TRIANGLES\n${fps} FPS · WEBGL`;status.dataset.ready='true';status.dataset.triangles=String(renderer.info.render.triangles);status.dataset.yaw=String(Math.round(yaw));status.dataset.pitch=String(Math.round(pitch));status.dataset.jaw=el('jaw').value;status.dataset.blink=el('blink').value;}
  }frame();
}catch(e){status.textContent='预览加载失败';const error=document.createElement('div');error.className='error';error.textContent=e.message+'。请通过本地 HTTP 服务打开此页面，并使用支持 WebGL 的浏览器。';host.append(error);console.error(e);}

import * as T from './vendor/three.module.js';
import {createAvatarRenderer as createAnimals} from './animal-avatar3d.mjs';
import {createCharacterPool,HUMAN_MODELS} from './character-models.mjs';
import {AvatarDriver} from './model-preview/fullbody/driver.mjs';
import {actionObservation} from './action-poses.mjs';

export const MODEL_COUNT=4+HUMAN_MODELS.length;
export {HUMAN_MODELS};

/** Load real skinned models before exposing the synchronous draw operation. */
export async function createAvatarRenderer({maxInstances=4}={}){
  const pool=await createCharacterPool(maxInstances);
  let renderer;
  try{renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'default'});}
  catch(error){pool.dispose();throw error;}
  renderer.setPixelRatio(1);renderer.setClearColor(0,0);renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  const scene=new T.Scene(),camera=new T.OrthographicCamera(0,1,1,0,.1,10000);
  camera.position.z=3000;
  scene.add(new T.HemisphereLight(0xfff6e8,0x9fae8b,1.75));
  for(const [color,power,position] of [[0xffedd9,2.7,[-3.5,6,4.5]],[0xe3ecf4,.8,[4,3,3]],[0xffd2aa,1.7,[1.5,4,-3]]]){
    const light=new T.DirectionalLight(color,power);light.position.set(...position);scene.add(light);
  }
  const output=document.createElement('canvas'),context=output.getContext('2d'),cache=new Map();
  let animals=null,width=0,height=0,lost=false,disposed=false;
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;});
  function release(entry){scene.remove(entry.wrapper);pool.release(entry.avatar);}
  function entryFor(item,now){
    const id=String(item.id);let entry=cache.get(id);
    if(entry&&entry.type!==item.avatar){release(entry);cache.delete(id);entry=null;}
    if(!entry){
      const avatar=pool.acquire(item.avatar),wrapper=new T.Group();wrapper.add(avatar.root);scene.add(wrapper);
      entry={type:item.avatar,avatar,wrapper,driver:new AvatarDriver(avatar),time:now};cache.set(id,entry);
    }
    return entry;
  }
  function draw(items,w,h,now=performance.now()){
    if(disposed||lost)throw new Error('3D 渲染已停止');
    if(width!==w||height!==h){width=w;height=h;output.width=w;output.height=h;renderer.setSize(w,h,false);camera.right=w;camera.top=h;camera.updateProjectionMatrix();}
    const people=items.filter(item=>item.avatar>=4&&item.avatar<MODEL_COUNT),used=new Set(people.map(item=>String(item.id)));
    for(const [id,entry] of cache)if(!used.has(id)||people.find(p=>String(p.id)===id)?.avatar!==entry.type){release(entry);cache.delete(id);}
    for(const item of people){
      const entry=entryFor(item,now),{avatar,wrapper,driver}=entry;
      let o=item.observation||{};
      if(item.demoAction){const sample=actionObservation(item.demoAction,now/1000),r=o.rotation||{};o={...sample,...o,rotation:{yaw:sample.rotation.yaw+(r.yaw||0),pitch:sample.rotation.pitch+(r.pitch||0),roll:sample.rotation.roll+(r.roll||0)},expression:sample.expression,blendshapes:sample.blendshapes};}
      wrapper.position.set(0,0,0);wrapper.scale.setScalar(1);wrapper.rotation.set(0,0,0);wrapper.updateMatrixWorld(true);
      const dt=Math.min(.1,Math.max(.001,(now-entry.time)/1000));entry.time=now;
      for(const part of avatar.parts)part.visible=true;
      if(item.demoPose&&!item.demoAction){
        avatar.demo(item.demoPose,now/1000,item.demoAmount??1);
        const rotation=o.rotation||{};avatar.bones.Head.quaternion.multiply(new T.Quaternion().setFromEuler(new T.Euler(rotation.pitch||0,rotation.yaw||0,rotation.roll||0,'YXZ')));
        avatar.expression({jawOpen:o.expression?.jaw||0,eyeBlinkLeft:o.expression?.blinkLeft||0,eyeBlinkRight:o.expression?.blinkRight||0,mouthSmile:.14});
      }else{
        const expression=o.expression||{},blend=o.blendshapes||[
          {categoryName:'jawOpen',score:expression.jaw||0},{categoryName:'eyeBlinkLeft',score:expression.blinkLeft||0},{categoryName:'eyeBlinkRight',score:expression.blinkRight||0}
        ];
        driver.update({worldLandmarks:o.worldPose,landmarks:o.pose,faceMatrix:o.rotation?.matrix,headRotation:o.rotation,blendshapes:blend,action:item.demoAction||item.action},item.observedAt??now);
        driver.frame(item.snap ? .1 : dt,now);
      }
      if(item.fullBody){
        const count=item.slotCount||Math.max(people.length,1);
        const scale=Math.min(h*.79/4.05,w/(count*(item.slotWidthUnits||2.65)));
        wrapper.scale.setScalar(scale);wrapper.position.set((item.stageX??o.x??.5)*w,h*.13,0);
        wrapper.rotation.y=item.viewYaw||0;
      }else{
        const portrait=!!item.portrait,span=portrait?2.20:1.55,centerY=portrait?2.93:3.25;
        const scale=Math.min(w/Math.max(items.length,1),h)/span;
        wrapper.scale.setScalar(scale);wrapper.position.set((o.x??.5)*w,h*(1-(o.y??.5))-centerY*scale,0);
        if(!portrait)for(const part of avatar.parts)if(/_(body|top|jeans|shoes|scarf)$/.test(part.name))part.visible=false;
      }
      wrapper.updateMatrixWorld(true);
    }
    renderer.render(scene,camera);context.clearRect(0,0,w,h);context.drawImage(renderer.domElement,0,0);
    const animalItems=items.filter(item=>item.avatar>=0&&item.avatar<4);
    if(animalItems.length){animals??=createAnimals();context.drawImage(animals.draw(animalItems,w,h,now),0,0);}
    return output;
  }
  return {draw,get stats(){return {heads:cache.size+(animals?.stats.heads||0),meshes:renderer.info.render.calls+(animals?.stats.meshes||0),triangles:renderer.info.render.triangles+(animals?.stats.triangles||0),loadedHumanModels:HUMAN_MODELS.length,independentRigs:pool.size};},dispose(){if(disposed)return;disposed=true;cache.forEach(release);cache.clear();pool.dispose();animals?.dispose();renderer.dispose();renderer.forceContextLoss();}};
}

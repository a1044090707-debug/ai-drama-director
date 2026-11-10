import * as T from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/GLTFLoader.js';

const assets=new Map();
const loader=new GLTFLoader();
const MORPHS=['jawOpen','eyeBlinkLeft','eyeBlinkRight','mouthSmile'];
function cloneRig(source){
  const cloned=source.clone(true),lookup=new Map();
  function pairs(a,b){lookup.set(a,b);a.children.forEach((c,i)=>pairs(c,b.children[i]));}pairs(source,cloned);
  source.traverse(a=>{if(!a.isSkinnedMesh)return;const b=lookup.get(a);b.skeleton=a.skeleton.clone();b.skeleton.bones=a.skeleton.bones.map(bone=>lookup.get(bone));b.bindMatrix.copy(a.bindMatrix);b.bind(b.skeleton,b.bindMatrix);});return cloned;
}

/** Load the professionally authored Rain geometry; only rig/texture conversion is local. */
export async function createRainAvatar(options={}){
  const url=String(options.assetUrl||new URL('./assets/rain-web.glb',import.meta.url));
  if(!assets.has(url))assets.set(url,loader.loadAsync(url).catch(e=>{assets.delete(url);throw e;}));
  const source=await assets.get(url),content=cloneRig(source.scene),root=new T.Group();root.name=options.name||'Rain_RealtimeAvatar';root.add(content);root.updateMatrixWorld(true);
  const box=new T.Box3().setFromObject(content),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());
  // A fixed reference height lets a head-only edit keep the same body size.
  const normalizationHeight=Number.isFinite(options.normalizationHeight)&&options.normalizationHeight>0?options.normalizationHeight:size.y;
  const scale=3.80/normalizationHeight;
  content.scale.multiplyScalar(scale);content.position.set(-center.x*scale,-box.min.y*scale,-center.z*scale);
  root.updateMatrixWorld(true);
  const bones={},boneList=[],rest={},restWorldQuaternions={},restLocal={},meshes=[],morphMeshes=[],materials={};
  root.traverse(o=>{
    if(o.isBone){bones[o.name]=o;boneList.push(o);rest[o.name]=o.getWorldPosition(new T.Vector3());restWorldQuaternions[o.name]=o.getWorldQuaternion(new T.Quaternion());restLocal[o.name]={position:o.position.clone(),quaternion:o.quaternion.clone()};}
    if(o.isMesh){meshes.push(o);o.frustumCulled=false;o.castShadow=true;o.receiveShadow=true;for(const m of Array.isArray(o.material)?o.material:[o.material]){materials[m.name]=m;m.side=T.FrontSide;}if(o.morphTargetDictionary)morphMeshes.push(o);}
  });
  function resetPose(){for(const b of boneList){b.position.copy(restLocal[b.name].position);b.quaternion.copy(restLocal[b.name].quaternion);}root.position.y=0;root.updateMatrixWorld(true);}
  function setWorldDelta(name,axis,angle){const b=bones[name];if(!b)return;const target=new T.Quaternion().setFromAxisAngle(axis,angle).multiply(restWorldQuaternions[name]);const parent=b.parent.getWorldQuaternion(new T.Quaternion());b.quaternion.copy(parent.invert().multiply(target));b.updateMatrixWorld(true);}
  const xAxis=new T.Vector3(1,0,0),zAxis=new T.Vector3(0,0,1);
  function standing(){setWorldDelta('LeftUpperArm',zAxis,-1.22);setWorldDelta('RightUpperArm',zAxis,1.22);}
  // Sample actual sole vertices, rather than assuming an ankle height.
  const soles=[];
  for(const mesh of meshes.filter(m=>m.name.includes('shoes'))){const vertices=mesh.geometry.attributes.position,candidates=[];let min=Infinity;const p=new T.Vector3();
    for(let i=0;i<vertices.count;i++){mesh.getVertexPosition(i,p);mesh.localToWorld(p);min=Math.min(min,p.y);candidates.push(p.y);}
    const ids=candidates.map((y,i)=>y<min+.075?i:-1).filter(i=>i>=0),step=Math.max(1,Math.floor(ids.length/96));for(let i=0;i<ids.length;i+=step)soles.push({mesh,index:ids[i]});
  }
  function ground(){root.updateMatrixWorld(true);let min=Infinity;const p=new T.Vector3();for(const {mesh,index} of soles){mesh.getVertexPosition(index,p);mesh.localToWorld(p);min=Math.min(min,p.y);}if(Number.isFinite(min))root.position.y-=min;root.updateMatrixWorld(true);return min;}
  function expression(values={}){for(const mesh of morphMeshes)for(const name of MORPHS){const i=mesh.morphTargetDictionary[name];if(i!==undefined)mesh.morphTargetInfluences[i]=T.MathUtils.clamp(values[name]||0,0,1);}}
  function demo(name,time=0,amount=1){resetPose();standing();
    if(name==='arms'){setWorldDelta('LeftUpperArm',zAxis,-.05*amount);setWorldDelta('RightUpperArm',zAxis,.05*amount);}
    if(name==='wave'){setWorldDelta('LeftUpperArm',zAxis,.35);setWorldDelta('LeftForeArm',zAxis,1.25+Math.sin(time*4.2)*.23);}
    if(name==='squat'){for(const s of ['Left','Right']){setWorldDelta(s+'UpperLeg',xAxis,-.65*amount);setWorldDelta(s+'LowerLeg',xAxis,.65*amount);setWorldDelta(s+'Foot',xAxis,0);setWorldDelta(s+'Toe',xAxis,0);}setWorldDelta('Chest',xAxis,.14*amount);}
    if(name==='step'){setWorldDelta('LeftUpperLeg',xAxis,-.68*amount);setWorldDelta('LeftLowerLeg',xAxis,.35*amount);setWorldDelta('LeftFoot',xAxis,.12*amount);setWorldDelta('LeftToe',xAxis,.12*amount);}
    if(name==='tiptoe'){for(const s of ['Left','Right']){setWorldDelta(s+'Foot',xAxis,.40*amount);setWorldDelta(s+'Toe',xAxis,0);}}
    if(name==='toe')setWorldDelta('LeftToe',xAxis,-.40*amount);
    ground();
  }
  standing();const neutralWorldQuaternions=Object.fromEntries(boneList.map(b=>[b.name,b.getWorldQuaternion(new T.Quaternion())]));resetPose();
  const skeleton=bones.Hips?meshes.find(m=>m.isSkinnedMesh).skeleton:null;
  function stats(){return{triangles:meshes.reduce((n,m)=>n+(m.geometry.index?.count??m.geometry.attributes.position.count)/3,0),vertices:meshes.reduce((n,m)=>n+m.geometry.attributes.position.count,0),bones:boneList.length,morphTargets:MORPHS.slice(),drawCalls:meshes.length};}
  function dispose(){root.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.dispose();});root.removeFromParent();}
  return{root,content,bones,boneList,rest,restWorldQuaternions,neutralWorldQuaternions,materials,parts:meshes,morphMeshes,skeleton,expression,resetPose,ground,demo,stats,dispose};
}

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from '../vendor/three.module.js';
import {createSnowAvatar as createRainAvatar} from '../model-preview/snow/avatar.mjs';
import {AvatarDriver} from '../model-preview/fullbody/driver.mjs';
import {createRainAvatar as loadPreviousAvatar} from '../model-preview/rain/avatar.mjs';
// Node does not render textures. Decode-free image stubs let these tests exercise
// the actual exported skin, morph arrays, transforms, and retargeting code.
globalThis.self=globalThis;
globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});
globalThis.ProgressEvent=class{constructor(type,args){Object.assign(this,{type},args);}};
const fetchOriginal=globalThis.fetch;
globalThis.fetch=async(url,opts)=>String(url.url||url).startsWith('file:')?new Response(await fs.readFile(new URL(url.url||url))):fetchOriginal(url,opts);

const variant=process.argv[2]||'snow';
const a=await createRainAvatar({variant}),b=await createRainAvatar({variant});
console.log('stats',a.stats(),'content scale',a.content.scale.toArray());
for(const pose of ['stand','arms','wave','squat','step','tiptoe','toe']){
  a.demo(pose,0,1);const box=new T.Box3().setFromObject(a.root,true);
  console.log(pose,box.min.toArray(),box.max.toArray());
  assert.ok([...box.min.toArray(),...box.max.toArray()].every(Number.isFinite));
  assert.ok(Math.abs(box.min.y)<.05,`${pose} sole grounded`);
  assert.ok(box.max.y<4.1&&box.max.y>2,`${pose} preserves plausible scale`);
}
assert.equal(a.boneList.length,21);assert.equal(a.stats().morphTargets.length,4);
assert.notEqual(a.bones.Head,b.bones.Head);
const bQ=b.bones.LeftUpperArm.quaternion.clone();a.demo('wave');assert.ok(bQ.equals(b.bones.LeftUpperArm.quaternion),'clones independent');
const sample=a.morphMeshes.find(m=>m.name===(variant==='chinese'?'Rain_head':'Snow_head'));
assert.ok(sample,'head mesh present');
for(const key of a.stats().morphTargets){const i=sample.morphTargetDictionary[key],target=sample.geometry.morphAttributes.position[i];let max=0;for(let j=0;j<target.count;j++)max=Math.max(max,Math.abs(target.getX(j))+Math.abs(target.getY(j))+Math.abs(target.getZ(j)));assert.ok(max>1e-5,`${key} nonempty`);}
for(const mesh of a.parts){if(!mesh.isSkinnedMesh)continue;const weights=mesh.geometry.attributes.skinWeight;for(let i=0;i<weights.count;i++)assert.ok(Math.abs(weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i)-1)<1e-4,'normalized skin weights');}
const driver=new AvatarDriver(a);a.demo('stand');driver.update({headRotation:{yaw:.35,pitch:.1}},0);for(let i=0;i<50;i++)driver.frame(.016,i*8);assert.equal(driver.legsVisible,false);assert.equal(driver.feetVisible,false);
if(variant==='gentle'||variant==='chinese'){
  const hair=a.parts.find(m=>m.name===(variant==='chinese'?'CNGirl_Hair':'GentleHair_Connected'));
  assert.ok(hair?.isSkinnedMesh,'new continuous hair is skinned');
  assert.ok(a.stats().triangles<160000,'preview stays within the intended geometry budget');
  const head=a.bones.Head;
  const indices=hair.geometry.attributes.skinIndex,weights=hair.geometry.attributes.skinWeight;
  let sampleIndex=-1;
  for(let i=0;i<weights.count;i++)if(weights.getX(i)>.999&&hair.skeleton.bones[indices.getX(i)]?.name==='Head'){sampleIndex=i;break;}
  assert.ok(sampleIndex>=0,'crown has a head-bound vertex');
  function hairInHeadSpace(){const p=new T.Vector3();hair.getVertexPosition(sampleIndex,p);hair.localToWorld(p);return head.worldToLocal(p);}
  a.demo('stand');const before=hairInHeadSpace();
  head.quaternion.multiply(new T.Quaternion().setFromEuler(new T.Euler(.2,.5,-.1)));a.root.updateMatrixWorld(true);
  assert.ok(before.distanceTo(hairInHeadSpace())<1e-4,'hair remains rigidly attached while head turns');
}
if(variant==='chinese'){
  const previous=await loadPreviousAvatar({assetUrl:new URL('../model-preview/snow/assets/chinese-female-v4.glb',import.meta.url)});
  assert.ok(Math.abs(a.content.scale.x-previous.content.scale.x)<1e-8,'head reduction does not auto-enlarge the displayed body');
  a.demo('stand');previous.demo('stand');
  for(const name of ['Rain_top','Rain_jeans','Rain_shoes']){
    const now=a.parts.find(m=>m.name===name),before=previous.parts.find(m=>m.name===name);
    const size=new T.Box3().setFromObject(now,true).getSize(new T.Vector3());
    const oldSize=new T.Box3().setFromObject(before,true).getSize(new T.Vector3());
    assert.ok(size.distanceTo(oldSize)<2e-5,name+' retains its displayed dimensions');
  }
}
console.log(variant.toUpperCase()+'_AVATAR_CHECKS_PASS');




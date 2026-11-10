import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from '../vendor/three.module.js';
import {createRainAvatar} from '../model-preview/rain/avatar.mjs';
import {AvatarDriver} from '../model-preview/fullbody/driver.mjs';
// Node does not render textures. Decode-free image stubs let these tests exercise
// the actual exported skin, morph arrays, transforms, and retargeting code.
globalThis.self=globalThis;
globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});
globalThis.ProgressEvent=class{constructor(type,args){Object.assign(this,{type},args);}};
const fetchOriginal=globalThis.fetch;
globalThis.fetch=async(url,opts)=>String(url.url||url).startsWith('file:')?new Response(await fs.readFile(new URL(url.url||url))):fetchOriginal(url,opts);

const a=await createRainAvatar(),b=await createRainAvatar();
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
const sample=a.morphMeshes.find(m=>m.name==='Rain_head');
assert.ok(sample,'head mesh present');
for(const key of a.stats().morphTargets){const i=sample.morphTargetDictionary[key],target=sample.geometry.morphAttributes.position[i];let max=0;for(let j=0;j<target.count;j++)max=Math.max(max,Math.abs(target.getX(j))+Math.abs(target.getY(j))+Math.abs(target.getZ(j)));assert.ok(max>1e-5,`${key} nonempty`);}
for(const mesh of a.parts){if(!mesh.isSkinnedMesh)continue;const weights=mesh.geometry.attributes.skinWeight;for(let i=0;i<weights.count;i++)assert.ok(Math.abs(weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i)-1)<1e-4,'normalized skin weights');}
const driver=new AvatarDriver(a);a.demo('stand');driver.update({headRotation:{yaw:.35,pitch:.1}},0);for(let i=0;i<50;i++)driver.frame(.016,i*8);assert.equal(driver.legsVisible,false);assert.equal(driver.feetVisible,false);
console.log('RAIN_AVATAR_CHECKS_PASS');



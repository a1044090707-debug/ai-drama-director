import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from '../vendor/three.module.js';
import {HUMAN_MODELS,createCharacterPool} from '../character-models.mjs';
import {AvatarDriver} from '../model-preview/fullbody/driver.mjs';

globalThis.self=globalThis;
globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});
globalThis.ProgressEvent=class{constructor(type,args){Object.assign(this,{type},args);}};
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,opts)=>String(url.url||url).startsWith('file:')?new Response(await fs.readFile(new URL(url.url||url))):originalFetch(url,opts);
assert.equal(HUMAN_MODELS.length,8);assert.equal(new Set(HUMAN_MODELS.map(m=>m.asset)).size,8);
const pool=await createCharacterPool(4);
assert.equal(pool.size,0,'nothing is allocated before it is requested');
for(const model of HUMAN_MODELS){
  await pool.prepare([model.index]);
  const actor=pool.acquire(model.index);
  assert.ok(actor.boneList.length>=20);
  assert.ok(actor.bones.LeftFoot&&actor.bones.RightFoot,'both feet are present');
  actor.demo('stand');
  const box=new T.Box3().setFromObject(actor.root,true);
  assert.ok(Number.isFinite(box.min.y)&&box.max.y>3.5,'actual full-body geometry');
  const driver=new AvatarDriver(actor);driver.update({headRotation:{yaw:.3}},0);driver.frame(.1,20);
  assert.equal(driver.legsVisible,false);pool.release(actor);
  console.log(model.name,'LAZY_MODEL_PASS');
}
assert.equal(pool.size,8);
await Promise.all([pool.prepare([6,6,6,6]),pool.prepare([6,6,6,6])]);
assert.equal(pool.size,11,'concurrent preparation cannot allocate duplicate copies');
const actors=Array.from({length:4},()=>pool.acquire(6));
assert.equal(pool.acquire(6),null);
assert.equal(new Set(actors.map(a=>a.bones.Head)).size,4);
const before=actors[1].bones.Head.quaternion.clone();
actors[0].bones.Head.quaternion.setFromEuler(new T.Euler(.2,.3,.4));
actors[0].expression({jawOpen:.9});
assert.ok(before.equals(actors[1].bones.Head.quaternion),'same-role actors have independent bones');
for(const mesh of actors[1].morphMeshes)assert.ok(mesh.morphTargetInfluences.every(v=>Math.abs(v)<1e-8),'expressions are independent');
actors.forEach(a=>pool.release(a));pool.dispose();console.log('EIGHT_LAZY_CAST_MODELS_PASS');

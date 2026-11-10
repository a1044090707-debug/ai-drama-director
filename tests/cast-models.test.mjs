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
assert.equal(HUMAN_MODELS.length,5);assert.equal(new Set(HUMAN_MODELS.map(m=>m.asset)).size,5);
const pool=await createCharacterPool(4);
for(const model of HUMAN_MODELS){
  const actors=Array.from({length:4},()=>pool.acquire(model.index));
  assert.throws(()=>pool.acquire(model.index));
  for(const actor of actors){
    assert.equal(actor.boneList.length,21);
    assert.ok(actor.parts.some(p=>p.name.includes('shoes')),'feet are included');
    assert.ok(actor.stats().triangles>50000,'uses the actual preview geometry');
    actor.demo('stand');const box=new T.Box3().setFromObject(actor.root,true);
    assert.ok(Math.abs(box.min.y)<.05&&box.max.y>3.5,'whole body with grounded shoes');
    const driver=new AvatarDriver(actor);driver.update({headRotation:{yaw:.3}},0);driver.frame(.1,20);
    assert.equal(driver.legsVisible,false);
  }
  const before=actors[1].bones.Head.quaternion.clone();
  actors[0].bones.Head.quaternion.setFromEuler(new T.Euler(.2,.3,.4));
  actors[0].expression({jawOpen:.9});
  assert.ok(before.equals(actors[1].bones.Head.quaternion),'same-role actors have independent bones');
  for(const mesh of actors[1].morphMeshes)assert.ok(mesh.morphTargetInfluences.every(v=>Math.abs(v)<1e-8),'expressions are independent');
  actors.forEach(a=>pool.release(a));
  console.log(model.name,'FULL_BODY_POOL_PASS');
}
pool.dispose();console.log('FIVE_CAST_MODELS_PASS');

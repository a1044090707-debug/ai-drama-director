import {test}from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import {PoseStabilizer,ArmHold}from '../model-preview/fullbody/pose-stabilizer.mjs';

const pose=()=>Array.from({length:33},(_,i)=>({x:i===11?-.2:i===12?.2:0,y:.4,z:0,visibility:.95}));
test('a one-frame depth inversion is rejected and normal measurements recover',()=>{
 const filter=new PoseStabilizer(),p=pose();filter.update(p,null,0);
 const bad=pose();bad[15].z=2;assert.equal(filter.update(bad,null,100)[15].z,0);
 assert.equal(filter.update(p,null,200)[15].z,0);
});
test('short low-confidence losses hold the last joint, prolonged losses do not',()=>{
 const filter=new PoseStabilizer(),p=pose();filter.update(p,null,0);
 const bad=pose();bad[15].visibility=.1;
 assert.ok(filter.update(bad,null,200)[15].visibility>.55);
 assert.equal(filter.update(bad,null,800)[15].visibility,0);
});
test('static screen arms retain targets despite depth noise; measured movement releases them',()=>{
 const hold=new ArmHold(),p=pose();p[11].x=.4;p[12].x=.6;p[13]={x:.3,y:.4};p[15]={x:.1,y:.4};
 const keys=['LeftUpperArm','LeftForeArm','LeftHand'];
 const target=()=>Object.fromEntries(keys.map(k=>[k,new T.Quaternion()]));
 let snapshot;
 for(let t=0;t<=1600;t+=100){const values=target();values.LeftForeArm.setFromAxisAngle(new T.Vector3(1,0,0),Math.sin(t)*.5);hold.update('Left',p,values,t,'arms');
   if(t===600)snapshot=values.LeftForeArm.clone();if(t>600)assert.ok(values.LeftForeArm.angleTo(snapshot)<1e-6);
 }
 p[15].y=.1;const moved=target();moved.LeftForeArm.setFromAxisAngle(new T.Vector3(1,0,0),1);hold.update('Left',p,moved,1700,'raise');
 assert.ok(moved.LeftForeArm.angleTo(snapshot)>.1);
});
test('wave targets are never latched as a static arm pose',()=>{
 const hold=new ArmHold(),p=pose();const keys=['LeftUpperArm','LeftForeArm','LeftHand'];
 for(let t=0;t<1500;t+=100){const targets=Object.fromEntries(keys.map(k=>[k,new T.Quaternion()]));hold.update('Left',p,targets,t,'wave');}
 assert.equal(hold.sides.Left.snapshot,null);
});

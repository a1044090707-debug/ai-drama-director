const {test}=require('node:test'),assert=require('node:assert/strict'),Motion=require('../motion.js');
function pose(){const p=Array.from({length:33},()=>({x:.5,y:.75,visibility:1}));p[0]={x:.5,y:.35};p[11]={x:.4,y:.55};p[12]={x:.6,y:.55};p[15]={x:.42,y:.8};p[16]={x:.58,y:.8};return p;}
function face(){const f=Array.from({length:478},()=>({x:.5,y:.4,z:0}));f[33]={x:.4,y:.4,z:0};f[263]={x:.6,y:.4,z:0};f[10]={x:.5,y:.25,z:0};f[152]={x:.5,y:.65,z:0};f[1]={x:.5,y:.45,z:-.05};f[13]={x:.5,y:.51};f[14]={x:.5,y:.52};return f;}
test('all nine actions have three complete caption levels',()=>{assert.equal(Object.keys(Motion.actions).length,9);for(const action of Object.values(Motion.actions)){assert.equal(action.lines.length,3);assert.ok(action.lines.every(x=>typeof x==='string'&&x.length>4));}});
for(const [action,modify] of [
  ['forehead',p=>{p[15]={x:.47,y:.32};}],
  ['head',p=>{p[15]={x:.43,y:.31};p[16]={x:.57,y:.31};}],
  ['raise',p=>{p[15]={x:.4,y:.12};}],
  ['handsup',p=>{p[15]={x:.35,y:.12};p[16]={x:.65,y:.12};}],
  ['arms',p=>{p[15]={x:.1,y:.55};p[16]={x:.9,y:.55};}]
])test('classifies '+action,()=>{const p=pose();modify(p);assert.equal(Motion.classify(p,null),action);});
test('low confidence wrist is ignored',()=>{const p=pose();p[15]={x:.5,y:.12,visibility:.1};assert.equal(Motion.classify(p,null),null);});
test('open mouth, tilted head and turn are distinguishable',()=>{
  const f=face();assert.equal(Motion.classify(null,f),null);f[14].y=.59;assert.equal(Motion.classify(null,f),'mouth');f[14].y=.52;
  f[263].y=.5;assert.equal(Motion.classify(null,f),'tilt');f[263].y=.4;f[1].x=.57;assert.equal(Motion.classify(null,f),'turn');
});
test('wave needs back-and-forth movement; holding a raised hand is not a wave',()=>{
  const track={},p=pose();const actions=[];
  for(const [i,x] of [.25,.31,.23,.32,.24].entries()){p[15]={x,y:.2};actions.push(Motion.classify(p,null,track,i*150));}
  assert.ok(actions.includes('wave'));
  const still={};for(let i=0;i<10;i++){p[15]={x:.25,y:.2};assert.notEqual(Motion.classify(p,null,still,i*150),'wave');}
});
test('matrix data is retained on the face observation without index reassignment',()=>{
  const matrix=[1,0,0,0,0,1,0,0,0,0,1,0,2,3,4,1];assert.deepEqual(Motion.headPose(face(),1280,720,{data:matrix}).matrix,matrix);
});
test('3D landmark yaw changes when the relative eye depth changes',()=>{
  const f=face();const front=Motion.headPose(f,1280,720);f[33].z=.07;f[263].z=-.07;const turned=Motion.headPose(f,1280,720);
  assert.ok(Math.abs(front.yaw)<1e-6);assert.ok(Math.abs(turned.yaw)>.5);
});
test('portrait and landscape capture retain their real aspect ratios',()=>{
  assert.deepEqual(Motion.captureSize(720,1280),{width:720,height:1280});assert.deepEqual(Motion.captureSize(1920,1080),{width:1280,height:720});assert.deepEqual(Motion.captureSize(1080,1920),{width:720,height:1280});
});

// Run with node --test tests/tracking.test.cjs. No extra packages required.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {test}=require('node:test');
class Element {
  constructor(){this.children=[];this.style={setProperty(){}};this.classList={add(){},remove(){},toggle(){}};this.value='1';this.checked=false;this.textContent='';}
  append(...nodes){this.children.push(...nodes);}prepend(node){this.children.unshift(node);}replaceChildren(...nodes){this.children=nodes;}
  setAttribute(){}addEventListener(){}querySelector(){return new Element();}getContext(){return {};}
}
function harness(){
  const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  const sandbox={console,Math,Set,Date,Motion:require('../motion.js'),performance:{now:()=>1000},setTimeout,clearTimeout,cancelAnimationFrame(){},requestAnimationFrame(){return 1;},navigator:{},window:{isSecureContext:true},document:{getElementById:get,createElement:()=>new Element(),createTextNode:text=>text}};
  const context=vm.createContext(sandbox),source=fs.readFileSync('index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInContext(source.slice(0,source.indexOf("$('start').addEventListener")),context);
  return {run:code=>vm.runInContext(code,context),sandbox};
}
const observation=(x,y=.4)=>({x,y,rx:.05,ry:.08,angle:0,points:null,pose:null});
test('detection order changes preserve player IDs and avatar choices',()=>{
  const h=harness();h.sandbox.input=[observation(.2),observation(.8)];h.run('updateTracks(input,0);tracks[0].avatar=3;');
  h.sandbox.input=[observation(.79),observation(.21)];h.run('updateTracks(input,100);');
  assert.deepEqual(JSON.parse(h.run('JSON.stringify(tracks.map(t=>[t.id,t.avatar,t.x]))')),[[1,3,.21],[2,1,.79]]);
});
test('short loss retains ID; expiration allocates a new ID',()=>{
  const h=harness();h.sandbox.input=[observation(.2)];h.run('updateTracks(input,0);updateTracks([],300);');assert.equal(h.run('tracks[0].visible'),false);
  h.run('updateTracks(input,600)');assert.equal(h.run('tracks[0].id'),1);h.run('updateTracks([],1900);updateTracks(input,2000)');assert.equal(h.run('tracks[0].id'),2);
});
test('four player slots still return all extra heads for anonymous masking',()=>{
  const h=harness();h.sandbox.input=[.1,.25,.4,.55,.7,.85].map(x=>observation(x));
  assert.equal(h.run('updateTracks(input,0).length'),2);assert.equal(h.run('tracks.length'),4);
});
test('face and body results are paired spatially when model arrays have opposite order',()=>{
  const h=harness();
  h.run(`video.videoWidth=960;video.videoHeight=600;
    function fakeFace(x){const f=Array.from({length:478},()=>({x,y:.4}));f[33]={x:x-.025,y:.39};f[263]={x:x+.025,y:.39};f[10]={x,y:.32};f[152]={x,y:.48};return f;}
    function fakePose(x){const p=Array.from({length:33},()=>({x,y:.4,visibility:1}));p[11]={x:x-.08,y:.6};p[12]={x:x+.08,y:.6};return p;}
    var left=fakePose(.2),right=fakePose(.8);var obs=observationsFor([fakeFace(.2),fakeFace(.8)],[right,left]);`);
  assert.equal(h.run('obs[0].pose===left && obs[1].pose===right'),true);
});
test('one occluded wrist does not suppress the other wrist forehead gesture',()=>{
  const h=harness();assert.equal(h.run(`var p=Array.from({length:33},()=>({x:.5,y:.5,visibility:1}));p[11]={x:.4,y:.7};p[12]={x:.6,y:.7};p[15]={x:.5,y:.5,visibility:1};p[16]={x:.9,y:.9,visibility:0};detect(p,null)`),'forehead');
});
test('each actor debounces independently; simultaneous gestures are queued by global cooldown',()=>{
  const h=harness();h.sandbox.input=[observation(.2),observation(.8)];
  h.run(`updateTracks(input,0);performing=true;var fired=[];detect=()=> 'turn';fire=(action,track,t)=>{track.lastFire=t;lastGlobalFire=t;fired.push(track.id);};processActions(0);processActions(250);processActions(1000);processActions(2000);`);
  assert.deepEqual(JSON.parse(h.run('JSON.stringify(fired)')),[1,2]);
  h.run(`detect=()=>null;processActions(2300);processActions(2700);`);assert.equal(h.run('tracks.every(t=>t.armed)'),true);
});
test('stopping during camera permission wait closes a late stream without attaching it',async()=>{
  const h=harness();let resolve,stops=0;h.sandbox.navigator.mediaDevices={getUserMedia:()=>new Promise(r=>resolve=r)};
  const pending=h.run('openCamera(session)');h.run('session++');resolve({getTracks:()=>[{stop(){stops++;}}]});
  assert.equal(await pending,false);assert.equal(stops,1);assert.equal(h.run('stream'),null);
});
test('the start of a wave is not prematurely consumed by the raised-hand action',()=>{
  const h=harness();h.sandbox.input=[observation(.5)];
  h.run(`updateTracks(input,0);performing=true;var fired=[];fire=(action,track,t)=>{track.lastFire=t;lastGlobalFire=t;fired.push(action);};var p=Array.from({length:33},()=>({x:.5,y:.8,visibility:1}));p[0]={x:.5,y:.35};p[11]={x:.4,y:.55};p[12]={x:.6,y:.55};p[16]={x:.6,y:.8};tracks[0].observation.pose=p;`);
  for(const [i,x] of [.25,.31,.23,.32,.24,.24].entries()){h.sandbox.wristX=x;h.sandbox.stamp=i*150;h.run('p[15]={x:wristX,y:.2};processActions(stamp);');}
  assert.deepEqual(JSON.parse(h.run('JSON.stringify(fired)')),['wave']);
});

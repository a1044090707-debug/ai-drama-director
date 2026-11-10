const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function harness(){
 const elements=new Map();
 function element(){return {checked:true,disabled:false,textContent:'',value:'auto',children:[],
  classList:{toggle(){}},querySelectorAll(){return [];},replaceChildren(){this.children=[];},
  append(...children){this.children.push(...children);},setAttribute(){},addEventListener(){}};}
 const context=vm.createContext({window:{},document:{getElementById:id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);},
   createElement:element},console,Map,Set,Math,Promise,Number,String,Array,AbortController,
   performance:{now:()=>6000},clearInterval(){},cancelAnimationFrame(){}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../movie-studio.js'),'utf8'),context);
 const studio=Object.create(context.window.MovieStudio.prototype);
 const tracks=[{id:10,x:.25,visible:true,avatar:4},{id:20,x:.75,visible:true,avatar:5}];
 Object.assign(studio,{recording:true,events:[],mapping:new Map(),slots:[{name:'甲',x:.125},{name:'乙',x:.375},{name:'丙',x:.625},{name:'丁',x:.875}],
  startMs:1000,lastRoster:'',adapter:{getTracks:()=>tracks,mirrored:()=>true,refresh(){}}});
 return {studio,tracks,elements,context};
}
test('initial two players receive the first two actor slots',()=>{
 const {studio}=harness();studio.assignActors();assert.equal(studio.nameForTrack(10),'甲');assert.equal(studio.nameForTrack(20),'乙');
});
test('spatial reentry keeps the round identity when a tracking ID expires',()=>{
 const {studio,tracks}=harness();studio.assignActors();tracks[0]={id:30,x:.26,visible:true,avatar:4};studio.assignActors();
 assert.equal(studio.nameForTrack(30),'甲');assert.equal(studio.nameForTrack(20),'乙');
});
test('manual identity correction swaps current actors and fixes saved event names',()=>{
 const {studio,tracks}=harness();studio.assignActors();
 for(const track of tracks)studio.recordEvent({action:'turn',track,line:'保留原句',level:1,at:2000});
 studio.remap(10,1);assert.equal(studio.nameForTrack(10),'乙');assert.equal(studio.nameForTrack(20),'甲');
 assert.deepEqual(studio.events.map(e=>e.actorName),['乙','甲']);assert.equal(studio.events[0].originalLine,'保留原句');
});
test('events are relative to the capture start and previous events are ignored',()=>{
 const {studio,tracks}=harness();studio.assignActors();
 studio.recordEvent({action:'wave',track:tracks[0],line:'台词',level:2,at:900});assert.equal(studio.events.length,0);
 studio.recordEvent({action:'wave',track:tracks[0],line:'台词',level:2,at:3500});
 assert.equal(studio.events[0].timeMs,2500);assert.equal(studio.events[0].focusX,.75);
});
test('finishing capture locks new rounds until recorder onstop has finalized the blob',()=>{
 const {studio,elements}=harness();studio.assignActors();let stopped=0;
 studio.recorder={state:'recording',stop(){stopped++;}};studio.stopPromise=Promise.resolve();
 studio.finishCapture();assert.equal(stopped,1);assert.ok(studio.finalizing);assert.equal(studio.recording,false);
 assert.equal(elements.get('filmRecord').disabled,true);
 studio.finishCapture();assert.equal(stopped,1);
});
test('cancelling during job creation still cancels the returned server job',async()=>{
 const {studio}=harness();Object.assign(studio,{recording:false,blob:{},health:{ready:true},recordingId:'source',
  runId:0,busy:false,duration:5,previewPlan:()=>({scenes:[]}),update(){},message(){}});
 let resolve;const pending=new Promise(r=>resolve=r),requests=[];
 studio.json=async url=>{requests.push(url);return url==='/api/movie-jobs'?await pending:{};};
 const generating=studio.generate();await Promise.resolve();await studio.cancel();resolve({id:'server-job'});await generating;
 assert.ok(requests.includes('/api/movie-jobs/server-job/cancel'));assert.equal(studio.busy,false);
});
test('a round awaiting initial tool preparation generates automatically when ready',async()=>{
 const {studio,context}=harness();let generated=0;
 Object.assign(studio,{recording:false,starting:false,busy:false,blob:{},pendingAutoGenerate:true,
   update(){},generate(){generated++;},message(){}});
 context.fetch=async()=>({ok:true,json:async()=>({ready:true,state:'ready'})});
 await studio.checkHealth();assert.equal(generated,1);assert.equal(studio.pendingAutoGenerate,false);
});

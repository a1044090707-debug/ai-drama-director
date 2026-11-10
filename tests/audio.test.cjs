const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Motion=require('../motion.js');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=html.slice(html.indexOf('// Nine action IDs'),html.indexOf('function fire('));
const muteHandler=html.split('\n').find(line=>line.startsWith("$('soundEnabled').addEventListener"));
function harness(fetchImpl){
  const started=[],stopped=[],requests=[],logs=[];
  const toggle={checked:true,addEventListener(type,fn){this.change=fn;}};
  class AudioContext {
    constructor(){this.state='suspended';}
    resume(){this.state='running';return Promise.resolve();}
    suspend(){this.state='suspended';return Promise.resolve();}
    async decodeAudioData(data){return data;}
    createBufferSource(){return {connect(){},disconnect(){},start(){started.push(this);},stop(){stopped.push(this);}};}
  }
  const ctx=vm.createContext({
    Map,Object,Promise,Error,window:{AudioContext},
    $:()=>toggle,log:message=>logs.push(message),errorText:e=>e.message,
    actionNames:Object.fromEntries(Object.entries(Motion.actions).map(([k,v])=>[k,v.name])),
    fetch:url=>{requests.push(url);return fetchImpl?fetchImpl(url):Promise.resolve({ok:true,arrayBuffer:async()=>url});}
  });
  vm.runInContext('let audio=null;'+source+'\n'+muteHandler,ctx);
  return {run:code=>vm.runInContext(code,ctx),started,stopped,requests,logs,toggle};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('all nine actions load their MP3 and cached buffers can replay',async()=>{
  const h=harness();h.run('primeAudio()');await flush();
  for(const action of Object.keys(Motion.actions)){
    assert.ok(fs.existsSync(path.join(__dirname,'../assets/sounds',action+'.mp3')));
    await h.run(`sound('${action}')`);
    assert.equal(h.started.at(-1).buffer,'assets/sounds/'+action+'.mp3');
  }
  await h.run("sound('forehead')");
  assert.equal(h.requests.length,9);assert.equal(h.started.length,10);assert.equal(h.stopped.length,9);
});
test('mute stops playback immediately and enabling sound allows replay',async()=>{
  const h=harness();h.run('primeAudio()');await h.run("sound('head')");
  h.toggle.checked=false;h.toggle.change();
  assert.equal(h.stopped.length,1);await h.run("sound('wave')");assert.equal(h.started.length,1);
  h.toggle.checked=true;h.toggle.change();await h.run("sound('wave')");assert.equal(h.started.length,2);
});
test('ending a scene during loading prevents delayed playback',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve);
  const h=harness(async url=>{await gate;return {ok:true,arrayBuffer:async()=>url};});
  h.run('primeAudio()');const pending=h.run("sound('mouth')");h.run('stopSound()');
  release();await pending;assert.equal(h.started.length,0);
});
test('newest action wins when an older file finishes loading later',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve);
  const h=harness(async url=>{if(url.endsWith('head.mp3'))await gate;return {ok:true,arrayBuffer:async()=>url};});
  h.run('primeAudio()');const older=h.run("sound('head')");await h.run("sound('wave')");
  release();await older;assert.equal(h.started.length,1);assert.equal(h.started[0].buffer,'assets/sounds/wave.mp3');
});
test('missing files report the error and retry on the next trigger',async()=>{
  let failed=true;
  const h=harness(async url=>({ok:!failed,status:404,arrayBuffer:async()=>url}));
  h.run('primeAudio()');await flush();assert.equal(h.logs.length,9);
  failed=false;await h.run("sound('turn')");assert.equal(h.started.length,1);
});

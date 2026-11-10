import * as M from './vendor/mediabunny-1.65.2.mjs';
import {buildTimeline} from './movie-timeline.mjs?v=16';
export {buildTimeline};

const WIDTH=960,HEIGHT=540,FPS=24;
const check=signal=>{if(signal?.aborted)throw new DOMException('已取消生成','AbortError');};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
export async function capability(){
  if(!globalThis.VideoEncoder||!globalThis.VideoDecoder||!globalThis.AudioEncoder)
    return {ready:false,message:'当前浏览器缺少 MP4 编码能力。请用较新的 Chrome 或 Edge 打开网页，或在电脑上使用 start.cmd。'};
  const video=await M.canEncodeVideo('avc',{width:WIDTH,height:HEIGHT,frameRate:FPS,bitrate:1800000});
  const audio=await M.canEncodeAudio('aac',{numberOfChannels:1,sampleRate:48000,bitrate:128000});
  return {ready:video&&audio,message:video&&audio?'浏览器 MP4 导出已就绪，无需本地视频服务':'当前浏览器不能编码 H.264 / AAC MP4。请改用较新的 Chrome 或 Edge，或使用电脑本地模式。'};
}

// Only accepted event references may select footage; prompt/waiting time is excluded.
export function shotsFor(plan,events,duration){
  if(!plan?.scenes?.length||!Number.isFinite(duration)||duration<=0)throw new Error('缺少有效素材或分镜。');
  const selected=new Set();
  return plan.scenes.map(scene=>{
    const event=events.find(e=>e.id===scene.eventId);
    if(!event||selected.has(event.id)||event.action!==scene.action||event.actorId!==scene.actorId)
      throw new Error('分镜与本局动作不一致，请重新拍摄。');
    selected.add(event.id);
    const start=event.clipStartMs!==undefined?event.clipStartMs/1000:Math.max(0,event.timeMs/1000-1);
    const end=event.clipEndMs!==undefined?event.clipEndMs/1000:Math.min(duration,start+scene.duration);
    if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||start>=duration)
      throw new Error('动作素材时间无效，请重新拍摄。');
    return {...scene,start,end:Math.min(duration,end),focus:Math.max(0,Math.min(1,event.focusX??.5))};
  });
}

function lines(ctx,text,maxWidth){
  const result=[];let line='';
  for(const char of String(text||'')){
    if(char==='\n'||(line&&ctx.measureText(line+char).width>maxWidth)){result.push(line);line=char==='\n'?'':char;}else line+=char;
  }
  if(line)result.push(line);return result;
}
function textBlock(ctx,text,{x=480,y=270,size=30,color='#fff7e8',width=840,gap=1.45,weight=600}={}){
  ctx.font=`${weight} ${size}px "Microsoft YaHei", "PingFang SC", sans-serif`;ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';
  const rows=lines(ctx,text,width);rows.forEach((line,i)=>ctx.fillText(line,x,y+(i-(rows.length-1)/2)*size*gap));
}
function card(ctx,plan,ending=false){
  ctx.fillStyle='#293826';ctx.fillRect(0,0,WIDTH,HEIGHT);
  textBlock(ctx,ending?'本场小剧场 · 完':plan.title,{y:190,size:40,color:'#f3ddb1'});
  textBlock(ctx,ending?plan.ending:plan.opening,{y:300,size:27});
  textBlock(ctx,'AI 戏精导演',{y:465,size:18,color:'#b9c6a8',weight:400});
}
function shot(ctx,image,scene,index){
  ctx.fillStyle='#dce5c9';ctx.fillRect(0,0,WIDTH,HEIGHT);
  // Fit the WHOLE stage between the caption bands, including raised hands and feet.
  const top=43,bottom=116,space=HEIGHT-top-bottom,scale=Math.min(WIDTH/image.width,space/image.height);
  const w=image.width*scale,h=image.height*scale;ctx.drawImage(image,(WIDTH-w)/2,top+(space-h)/2,w,h);
  ctx.fillStyle='#293826';ctx.fillRect(0,0,WIDTH,top);ctx.fillRect(0,HEIGHT-bottom,WIDTH,bottom);
  textBlock(ctx,scene?`${index+1} · ${scene.actorName} / ${scene.actionName}`:'完整过程 · 保留全部录制画面',{y:22,size:21,color:'#f4dfb5'});
  textBlock(ctx,scene?.narration||'等待下一步动作 · 此段画面仍完整保留',{y:HEIGHT-82,size:23,width:880});
  textBlock(ctx,scene?'现场台词 · '+scene.originalLine:'系统动作声音会按触发顺序完整加入成片',{y:HEIGHT-28,size:18,width:890,color:'#dfd9ca',weight:400});
}

const sounds=new Map();
async function getSound(action,signal){
  if(!sounds.has(action))sounds.set(action,(async()=>{
    const response=await fetch(new URL('assets/sounds/'+action+'.mp3',import.meta.url),{signal});
    if(!response.ok)throw new Error('动作声音未能读取：'+action+'。请确认 assets/sounds 已上传。');
    const Offline=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;
    if(!Offline)throw new Error('浏览器缺少音频处理能力。');
    const decoder=new Offline(1,1,48000);return decoder.decodeAudioData(await response.arrayBuffer());
  })().catch(error=>{sounds.delete(action);throw error;}));
  const result=await sounds.get(action);check(signal);return result;
}
export async function prepareSounds(actions=['forehead','head','turn','raise','handsup','wave','arms','tilt','mouth'],signal){
  const result={};await Promise.all([...new Set(actions)].map(async action=>{result[action]=(await getSound(action,signal)).duration;}));return result;
}

async function soundtrack(timeline,{sound,music,signal}){
  const sampleRate=48000,length=timeline.duration;
  const Offline=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;
  if(!Offline)throw new Error('浏览器缺少音频处理能力，请使用较新的 Chrome 或 Edge。');
  const ctx=new Offline(1,Math.ceil(length*sampleRate),sampleRate);
  if(music){
    const notes=[261.63,329.63,392,329.63,293.66,349.23,440,349.23];
    for(let at=0,i=0;at<length;at+=.4,i++){
      const tone=ctx.createOscillator(),gain=ctx.createGain();tone.type='triangle';tone.frequency.value=notes[i%notes.length];
      gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.018,at+.025);gain.gain.exponentialRampToValueAtTime(.001,Math.min(at+.35,length));
      tone.connect(gain);gain.connect(ctx.destination);tone.start(at);tone.stop(Math.min(at+.38,length));
    }
  }
  if(sound)for(const cue of timeline.audioCues){
    check(signal);const buffer=await getSound(cue.action,signal),source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;
    gain.gain.value=.85;source.connect(gain);gain.connect(ctx.destination);source.start(cue.at);
  }
  const buffer=await ctx.startRendering();check(signal);return buffer;
}

export async function render({blob,plan,events,duration,sound=true,music=true,mode=plan.exportMode||'full',signal,onProgress=()=>{}}){
  const support=await capability();if(!support.ready)throw new Error(support.message);
  check(signal);onProgress(1,'正在准备完整动作声音…');
  const lengths=sound?await prepareSounds(events.map(e=>e.action),signal):{};
  const timeline=buildTimeline(plan,events,duration,{mode,sound,soundDurations:lengths});
  const input=new M.Input({source:new M.BlobSource(blob),formats:M.ALL_FORMATS});
  const output=new M.Output({format:new M.Mp4OutputFormat({fastStart:'in-memory'}),target:new M.BufferTarget()});
  let completed=false;
  const abort=()=>{input.dispose();void output.cancel().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
  try{
    const track=await input.getPrimaryVideoTrack();
    if(!track||!await track.canDecode())throw new Error('浏览器无法解码这份素材，请使用原录制浏览器或电脑本地模式。');
    const first=await track.getFirstTimestamp(),actual=await track.computeDuration();
    const sink=new M.CanvasSink(track,{width:WIDTH,height:HEIGHT,fit:'contain',poolSize:2});
    const canvas=document.createElement('canvas');canvas.width=WIDTH;canvas.height=HEIGHT;const ctx=canvas.getContext('2d');
    const video=new M.CanvasSource(canvas,{codec:'avc',bitrate:1800000,keyFrameInterval:2});
    const audio=new M.AudioBufferSource({codec:'aac',bitrate:128000});
    output.addVideoTrack(video,{frameRate:FPS});output.addAudioTrack(audio);await output.start();
    onProgress(3,'正在加入完整系统台词和音效…');const buffer=await soundtrack(timeline,{sound,music,signal});
    const totalFrames=timeline.segments.reduce((sum,s)=>sum+Math.round(s.duration*FPS),0);
    let frame=0,audioFrame=0;
    async function addFrame(){
      check(signal);await video.add(frame/FPS,1/FPS);frame++;
      const target=Math.min(buffer.length,Math.round(frame/FPS*buffer.sampleRate));
      if(target>audioFrame&&(target-audioFrame>=buffer.sampleRate/4||frame===totalFrames)){
        const part=new AudioBuffer({length:target-audioFrame,numberOfChannels:1,sampleRate:buffer.sampleRate});
        part.copyToChannel(buffer.getChannelData(0).subarray(audioFrame,target),0);await audio.add(part);audioFrame=target;
      }
      if(frame%12===0){onProgress(5+Math.floor(90*frame/totalFrames),'正在生成完整 MP4 · '+Math.round(frame/totalFrames*100)+'%');await tick();}
    }
    for(const segment of timeline.segments){
      const count=Math.round(segment.duration*FPS);
      if(segment.type==='opening'||segment.type==='ending'){
        card(ctx,plan,segment.type==='ending');for(let i=0;i<count;i++)await addFrame();continue;
      }
      const end=Math.min(first+actual-1/FPS,segment.end-1/FPS);
      const stamps=Array.from({length:count},(_,i)=>Math.max(first,Math.min(segment.start+i/FPS,end)));
      let last=null,j=0;
      for await(const result of sink.canvasesAtTimestamps(stamps)){
        check(signal);last=result?.canvas||last;if(!last)throw new Error('动作片段没有可解码画面，请重新录制。');
        let scene=segment,index=timeline.scenes.indexOf(segment);
        if(segment.type==='full'){
          const time=j/FPS,cue=timeline.audioCues.find(c=>c.at<=2.5+time&&2.5+time<c.at+c.duration+.25);
          index=cue?timeline.scenes.findIndex(s=>s.eventId===cue.eventId):events.reduce((found,e,i)=>e.timeMs/1000<=time&&time<e.timeMs/1000+3?i:found,-1);
          scene=timeline.scenes[index];
        }else index=timeline.scenes.findIndex(s=>s.eventId===segment.eventId);
        shot(ctx,last,scene,index);await addFrame();j++;
      }
    }
    video.close();audio.close();check(signal);onProgress(97,'正在封装并校验 MP4 画面和声音…');await output.finalize();completed=true;
    const result=new Blob([output.target.buffer],{type:'video/mp4'});await verify(result,signal,true);onProgress(100,'完整 MP4 已生成，包含 AAC 音轨。');return result;
  }finally{signal?.removeEventListener('abort',abort);input.dispose();if(!completed)await output.cancel().catch(()=>{});}
}

export async function verify(blob,signal,requireAudio=false){
  check(signal);
  const input=new M.Input({source:new M.BlobSource(blob),formats:M.ALL_FORMATS});
  try{
    const track=await input.getPrimaryVideoTrack();if(!track||!await track.canDecode())throw new Error('成片解码检查失败，未提供下载文件。');
    const duration=await track.computeDuration();if(!(duration>.1))throw new Error('成片时长无效，请重新生成。');
    if(requireAudio){const audio=await input.getPrimaryAudioTrack();if(!audio||!await audio.canDecode())throw new Error('成片缺少可解码音轨，请重新生成。');}
    const sink=new M.VideoSampleSink(track),sample=await sink.getSample(.05);if(!sample)throw new Error('成片没有可播放画面。');sample.close();check(signal);
  }finally{input.dispose();}
}

export async function convert({blob,signal,onProgress=()=>{}}){
  const support=await capability();if(!support.ready)throw new Error(support.message);check(signal);
  const input=new M.Input({source:new M.BlobSource(blob),formats:M.ALL_FORMATS});
  const output=new M.Output({format:new M.Mp4OutputFormat({fastStart:'in-memory'}),target:new M.BufferTarget()});
  let conversion;
  const abort=()=>{void conversion?.cancel();};signal?.addEventListener('abort',abort,{once:true});
  try{
    conversion=await M.Conversion.init({input,output,video:{codec:'avc',width:WIDTH,fit:'contain',frameRate:FPS,bitrate:1800000},audio:{codec:'aac',bitrate:96000}});
    if(!conversion.isValid)throw new Error('这份素材无法解码或没有有效视频，请在原浏览器重新保存。');
    conversion.onProgress=p=>onProgress(Math.round(p*95),'正在把原始素材转换为 MP4…');check(signal);await conversion.execute();check(signal);
    const result=new Blob([output.target.buffer],{type:'video/mp4'});await verify(result,signal);return result;
  }finally{signal?.removeEventListener('abort',abort);input.dispose();}
}

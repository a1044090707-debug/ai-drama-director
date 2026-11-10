(function(root){
  'use strict';
  const byId=id=>document.getElementById(id);
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const DEFAULT_NAMES=['演员甲','演员乙','演员丙','演员丁'];
  class MovieStudio {
    constructor(adapter){
      this.adapter=adapter;this.recording=false;this.busy=false;this.starting=false;
      this.events=[];this.mapping=new Map();this.slots=[];this.variant=0;this.runId=0;
      this.recordingId=null;this.blob=null;this.rawUrl=null;this.jobId=null;this.health=null;
      this.clockTimer=0;this.captureRaf=0;this.lastRoster='';
      this.capture=document.createElement('canvas');this.capture.width=960;this.capture.height=540;
      this.context=this.capture.getContext('2d');
      this.guide=null;this.bind();this.checkHealth();this.update();this.refreshGuidePreview();
    }
    bind(){
      byId('filmRecord').addEventListener('click',()=>this.startRound());
      byId('filmDemo').addEventListener('click',()=>this.startExample());
      byId('filmFinish').addEventListener('click',()=>this.endAndGenerate());
      byId('filmLiveFinish').addEventListener('click',()=>this.endAndGenerate());
      byId('filmGenerate').addEventListener('click',()=>this.generate());
      byId('filmVariant').addEventListener('click',()=>{
        if(this.guide){byId('filmStory').value=String((this.guidePlan.variant+1)%3);this.refreshGuidePreview();this.startRound();}
        else{this.variant=(+byId('filmStory').value+1)%3;byId('filmStory').value=String(this.variant);this.refreshGuidePreview();this.generate();}
      });
      byId('filmCancel').addEventListener('click',()=>this.cancel());
      byId('filmRetryTool').addEventListener('click',()=>this.checkHealth());
      byId('filmTheme').addEventListener('change',()=>{this.refreshGuidePreview();if(this.blob&&!this.busy)this.previewPlan();});
      for(const id of ['filmMode','filmStory','filmCastCount',...DEFAULT_NAMES.map((_,i)=>'filmName'+i)]){
        byId(id).addEventListener(id.startsWith('filmName')?'input':'change',()=>{this.refreshGuidePreview();this.update();});
      }
      byId('filmGuideRetry').addEventListener('click',()=>this.redoGuide());
      byId('filmVoice').addEventListener('change',()=>{if(!byId('filmVoice').checked)root.speechSynthesis?.cancel();});
    }
    message(text,error=false){
      byId('filmStatus').textContent=text;
      byId('filmStatus').classList.toggle('film-error',error);
    }
    async checkHealth(){
      try{
        const response=await fetch('/api/movie-health',{cache:'no-store'});
        if(!response.ok)throw new Error('请使用本版本的 start.cmd 启动网页。');
        this.health=await response.json();
        const state=this.health.state;
        byId('filmToolStatus').textContent=state==='ready'?'视频工具已就绪':state==='error'?'视频工具未就绪':
          '首次启动正在准备视频工具，请稍等';
        byId('filmToolStatus').title=this.health.message||'';
        byId('filmRetryTool').hidden=state!=='error';
        if(state==='error')this.message(this.health.message,true);
        else if(state!=='ready')setTimeout(()=>this.checkHealth(),2500);
      }catch(error){
        this.health={ready:false,state:'error'};
        byId('filmToolStatus').textContent='未连接到本地视频服务';byId('filmRetryTool').hidden=false;
        this.message(error.message||'请通过 start.cmd 启动本项目。',true);
      }
      this.update();
      if(this.pendingAutoGenerate&&this.health?.ready&&!this.recording&&!this.starting&&!this.busy&&this.blob){
        this.pendingAutoGenerate=false;this.generate();
      }
    }
    update(){
      const locked=this.recording||this.finalizing||this.busy||this.starting;
      byId('filmRecord').disabled=locked;
      byId('filmDemo').disabled=locked;
      byId('filmFinish').disabled=!this.recording||this.busy;
      byId('filmGenerate').disabled=locked||!this.blob||!this.events.length||!this.health?.ready;
      byId('filmVariant').disabled=byId('filmGenerate').disabled;
      if(this.guide&&!this.guide.complete)byId('filmGenerate').disabled=byId('filmVariant').disabled=true;
      byId('filmVariant').textContent=this.guide?'换个剧本重新拍':'换一版剧情';
      byId('filmCancel').hidden=!this.busy;
      byId('filmLiveControls').hidden=!this.recording;
      byId('filmCue').hidden=!this.recording||!this.guide;
      byId('filmStageCue').hidden=!this.recording||!this.guide;
      const guided=byId('filmMode').value==='guided';
      byId('filmDurationField').hidden=guided;byId('filmGuideBudget').hidden=!guided;
      byId('filmGuidePreview').hidden=!guided;
      byId('filmRecord').textContent=guided?'开始按剧本拍摄':'开始自由录制';
      byId('filmFinish').textContent=byId('filmLiveFinish').textContent=this.recording&&this.guide?'提前结束拍摄':'结束并生成短片';
      for(const id of ['filmMode','filmStory','filmCastCount','filmTheme','filmDuration','filmMusic','filmSound',...DEFAULT_NAMES.map((_,i)=>'filmName'+i)]){
        byId(id).disabled=locked;
      }
      byId('filmVoice').disabled=!root.speechSynthesis;
      this.adapter.lockLevel?.(!!this.recording&&!!this.guide);
      byId('filmRoster').querySelectorAll('select').forEach(select=>select.disabled=!this.recording);
      byId('filmBadge').textContent=this.recording?(this.isDemo?'示例录制中':'本局录制中'):this.busy?'正在生成':'短片工作台';
      byId('filmBadge').classList.toggle('is-recording',this.recording);
    }
    actorNames(){
      const used=new Set();
      return DEFAULT_NAMES.map((fallback,index)=>{
        let name=byId('filmName'+index).value.trim().slice(0,14)||fallback;
        if(used.has(name))name=name+'·'+(index+1);used.add(name);return name;
      });
    }
    selectedGuide(){
      const theme=byId('filmTheme').value==='auto'?'date':byId('filmTheme').value;
      const count=Math.max(1,Math.min(4,+byId('filmCastCount').value||1));
      const plan=root.MovieStory.createGuide({theme,variant:+byId('filmStory').value||0,actorNames:this.actorNames().slice(0,count)});
      plan.scenes.forEach(step=>step.originalLine=this.adapter.lineForAction?.(step.action)||'按当前加戏强度触发现场台词');
      return plan;
    }
    refreshGuidePreview(){
      const theme=root.MovieStory.THEMES[byId('filmTheme').value]||root.MovieStory.THEMES.date;
      const select=byId('filmStory'),previous=select.value;
      select.replaceChildren();theme.titles.forEach((title,index)=>{
        const option=document.createElement('option');option.value=index;option.textContent=title;select.append(option);
      });select.value=['0','1','2'].includes(previous)?previous:'0';
      const plan=this.selectedGuide();byId('filmGuidePlanTitle').textContent='开拍前分镜 · '+plan.title;
      const list=byId('filmGuidePlan');list.replaceChildren();
      plan.scenes.forEach((step,index)=>{
        const card=document.createElement('li'),title=document.createElement('b'),tip=document.createElement('p'),context=document.createElement('small');
        title.textContent=(index+1)+' · '+step.actorName+' · '+step.actionName;tip.textContent=step.tip;context.textContent=step.narration;
        card.append(title,tip,context);list.append(card);
      });
    }
    async waitForActors(count){
      const deadline=performance.now()+8000;
      while(this.adapter.isPerforming()&&performance.now()<deadline){
        if(this.adapter.getTracks().filter(t=>t.visible!==false).length>=count)return;
        this.message('请让 '+count+' 位演员同时入镜，并保持自然站姿。');await delay(200);
      }
      throw new Error('入镜人数不足或拍摄已停止。请检查镜头，或调整拍摄人数后重试。');
    }
    allowAction(action,track,at){
      if(!this.recording||!this.guide)return true;
      this.assignActors();const actorId='actor-'+this.mapping.get(track.id);
      const allowed=this.guide.accepts(action,actorId);
      if(!allowed&&this.guide.phase==='action'&&actorId===this.guide.step.actorId){
        this.guideFeedback={text:'刚才识别到'+root.MovieStory.ACTIONS[action]+'。请按提示做'+this.guide.step.actionName+'。',until:at+1800};
      }
      return allowed;
    }
    tickGuide(at){
      const guide=this.guide;if(!guide)return;
      const step=guide.step;
      const track=this.adapter.getTracks().find(t=>t.visible!==false&&'actor-'+this.mapping.get(t.id)===step.actorId);
      guide.update(at,{visible:!!track,neutral:!!track&&!track.action});
      const current=guide.step;
      const set=(id,text)=>{if(byId(id).textContent!==text)byId(id).textContent=text;};
      set('filmCueStep','第 '+(guide.index+1)+' / 6 幕 · '+this.guidePlan.title);
      const command=current.actorName+(guide.phase==='action'?'，现在请':guide.phase==='hold'?'，保持':'，准备')+current.actionName;
      set('filmCueAction',command);
      set('filmCueTip',current.tip);set('filmCueContext','这一幕的剧情 · '+current.narration);
      const next=this.guidePlan.scenes[guide.index+1];
      set('filmCueNext',next?'下一幕 · '+next.actorName+' · '+next.actionName:'这是最后一幕，完成后自动生成短片。');
      let text;
      if(guide.complete)text='六幕已完成，正在保存并生成短片。';
      else if(guide.paused)text='等待'+current.actorName+'回到镜头里，其他演员保持自然站姿。';
      else if(guide.phase==='prepare')text='先看提示，所有人双手放下、合上嘴、头摆正。';
      else if(guide.phase==='neutral')text='请先双手放下、合上嘴、头摆正。倒数结束后再做动作。';
      else if(guide.phase==='countdown')text='准备 '+Math.max(1,Math.ceil((guide.countdownMs-at+guide.phaseAt)/1000))+' · 先不要做动作';
      else if(guide.phase==='hold')text='识别成功，请保持动作，正在保存本幕镜头。';
      else text=this.guideFeedback?.until>at?this.guideFeedback.text:'现在开始 · '+current.actorName+'做'+current.actionName+'，其他演员放松。';
      set('filmCueState',text);byId('filmCueProgress').value=guide.accepted.length;
      set('filmStageCueAction',(guide.index+1)+'/6 · '+command);
      set('filmStageCueState',text);set('filmStageCueTip',current.tip);
      byId('filmGuideRetry').disabled=!guide.accepted.length||guide.complete;
      const spoken=current.id+':'+current.actorName;
      if(this.lastSpoken!==spoken){this.lastSpoken=spoken;this.speakGuide(current);}
      this.message(text);
      if(guide.complete)this.endAndGenerate();
    }
    speakGuide(step){
      if(!byId('filmVoice').checked||!root.speechSynthesis||!root.SpeechSynthesisUtterance)return;
      try{
        root.speechSynthesis.cancel();const utterance=new root.SpeechSynthesisUtterance('第'+(this.guide.index+1)+'幕。'+step.actorName+'，先回到自然姿势，等倒数结束后再'+step.actionName+'。');
        utterance.lang='zh-CN';utterance.rate=1.15;
        const voices=root.speechSynthesis.getVoices();
        utterance.voice=voices.find(voice=>voice.lang.startsWith('zh')&&voice.localService)||voices.find(voice=>voice.lang.startsWith('zh'))||null;
        root.speechSynthesis.speak(utterance);
      }catch{}
    }
    redoGuide(){
      if(!this.recording||!this.guide)return;
      const removed=this.guide.redo(performance.now());
      if(removed){this.events=this.events.filter(e=>!removed.includes(e.id));this.lastSpoken=null;this.guideFeedback=null;this.tick();}
    }
    driveDemo(at){
      if(!this.recording||!this.guide)return false;
      const step=this.guide.step,track=this.adapter.getTracks().find(t=>'actor-'+this.mapping.get(t.id)===step.actorId);
      const acting=['action','hold'].includes(this.guide.phase);
      const trigger=this.guide.phase==='action'&&at-this.guide.phaseAt>=(step.action==='wave'?1400:900);
      this.adapter.demoAction?.(track?.id,acting?step.action:null,trigger,at);return true;
    }
    assignActors(){
      if(!this.recording)return;
      const tracks=this.adapter.getTracks().filter(t=>t.visible!==false);
      if(!this.mapping.size){
        tracks.slice().sort((a,b)=>a.x-b.x).slice(0,4).forEach((track,index)=>{
          this.mapping.set(track.id,index);this.slots[index].x=track.x;
        });
      }
      const occupied=new Set(tracks.filter(t=>this.mapping.has(t.id)).map(t=>this.mapping.get(t.id)));
      for(const track of tracks.slice().sort((a,b)=>a.x-b.x)){
        if(!this.mapping.has(track.id)){
          const available=this.slots.map((slot,index)=>({slot,index})).filter(item=>!occupied.has(item.index));
          available.sort((a,b)=>Math.abs(a.slot.x-track.x)-Math.abs(b.slot.x-track.x));
          if(available.length){this.mapping.set(track.id,available[0].index);occupied.add(available[0].index);}
        }
        const slot=this.slots[this.mapping.get(track.id)];
        if(slot)slot.x=track.x;
      }
      const signature=tracks.map(t=>t.id+':'+this.mapping.get(t.id)).join('|');
      if(signature===this.lastRoster)return;this.lastRoster=signature;
      const roster=byId('filmRoster');roster.replaceChildren();
      for(const track of tracks){
        const row=document.createElement('label'),label=document.createElement('span'),select=document.createElement('select');
        label.textContent='入镜演员 '+String(track.id).padStart(2,'0');
        select.setAttribute('aria-label',label.textContent+'的短片身份');
        this.slots.forEach((slot,index)=>{const option=document.createElement('option');option.value=index;option.textContent=slot.name;select.append(option);});
        select.value=String(this.mapping.get(track.id)??0);
        select.addEventListener('change',()=>this.remap(track.id,+select.value));row.append(label,select);roster.append(row);
      }
    }
    remap(trackId,slot){
      const previous=this.mapping.get(trackId);
      const visible=new Set(this.adapter.getTracks().filter(t=>t.visible!==false).map(t=>t.id));
      const other=[...this.mapping].find(([id,value])=>id!==trackId&&value===slot&&visible.has(id));
      if(other)this.mapping.set(other[0],previous);
      this.mapping.set(trackId,slot);
      for(const event of this.guide?[]:this.events){
        const assigned=this.mapping.get(event.trackId);
        event.actorId='actor-'+assigned;event.actorName=this.slots[assigned].name;
      }
      this.lastRoster='';this.assignActors();this.adapter.refresh?.();
    }
    nameForTrack(id){
      if(!this.recording)return null;
      return this.slots[this.mapping.get(id)]?.name||null;
    }
    static recorderType(){
      if(typeof MediaRecorder==='undefined')throw new Error('当前浏览器不支持录制，请使用较新的 Edge 或 Chrome。');
      return ['video/webm;codecs=vp8','video/webm;codecs=vp9','video/webm','video/mp4']
        .find(type=>MediaRecorder.isTypeSupported(type))||'';
    }
    async startRound(){
      if(this.recording||this.finalizing||this.busy||this.starting)return;
      this.pendingAutoGenerate=false;this.starting=true;this.update();
      try{
        MovieStudio.recorderType();
        this.message('正在准备摄像头和卡通舞台…');
        await this.adapter.start();
        if(!this.adapter.isPerforming())throw new Error('摄像头或动作识别尚未准备好，请先完成摄像头连接。');
        if(byId('filmMode').value==='guided')await this.waitForActors(+byId('filmCastCount').value||1);
        this.beginCapture(false);
      }catch(error){this.message(error.message,true);}
      finally{this.starting=false;this.update();}
    }
    async startExample(){
      if(this.recording||this.finalizing||this.busy||this.starting)return;
      this.pendingAutoGenerate=false;this.starting=true;this.update();
      try{
        MovieStudio.recorderType();this.message('正在准备示例演出…');
        await this.adapter.prepareDemo();
        this.adapter.demo(byId('filmMode').value==='guided'?(+byId('filmCastCount').value||1):null);this.beginCapture(true);
      }catch(error){this.message(error.message,true);}
      finally{this.starting=false;this.update();}
    }
    beginCapture(demo){
      const mimeType=MovieStudio.recorderType();
      if(!this.capture.captureStream)throw new Error('当前浏览器无法录制卡通舞台，请使用 Edge 或 Chrome。');
      this.captureStream=this.capture.captureStream(24);
      this.recorder=new MediaRecorder(this.captureStream,{...(mimeType?{mimeType}:{}),videoBitsPerSecond:2200000});
      this.events=[];this.variant=0;this.recordingId=null;this.blob=null;this.mapping.clear();this.finalizing=false;
      this.isDemo=demo;this.slots=this.actorNames().map((name,i)=>({name,x:(i+.5)/4}));
      this.guidePlan=byId('filmMode').value==='guided'?this.selectedGuide():null;
      this.guide=null;this.lastSpoken=null;this.guideFeedback=null;
      this.maxSeconds=this.guidePlan?180:demo?23:Math.min(90,+byId('filmDuration').value||60);
      this.parts=[];this.totalBytes=0;this.captureError=null;this.lastRoster='';
      byId('filmRoster').replaceChildren();byId('filmStoryboard').replaceChildren();
      byId('filmProgress').value=0;byId('filmRaw').hidden=true;
      byId('filmPlanDetails').hidden=true;
      this.stopPromise=new Promise(resolve=>{
        this.recorder.ondataavailable=event=>{
          if(event.data.size){this.parts.push(event.data);this.totalBytes+=event.data.size;}
          if(this.totalBytes>75*1024*1024){this.captureError='录制素材达到大小上限，已停止。';this.finishCapture();}
        };
        this.recorder.onstop=()=>{
          this.captureStream.getTracks().forEach(track=>track.stop());
          this.blob=new Blob(this.parts,{type:this.recorder.mimeType||'video/webm'});this.parts=[];
          if(this.rawUrl)URL.revokeObjectURL(this.rawUrl);
          this.rawUrl=URL.createObjectURL(this.blob);
          const link=byId('filmRaw');link.href=this.rawUrl;link.download=(this.isDemo?'示例演出':'本局卡通素材')+'.'+(this.blob.type.includes('mp4')?'mp4':'webm');link.hidden=false;
          if(this.captureError)this.message(this.captureError,true);
          else this.message(this.guide&&!this.guide.complete?'拍摄提前结束，已保存素材。请重新完成六幕剧本后生成短片。':`本局已保存 ${this.events.length} 个动作，可以生成短片。`);
          this.finalizing=false;this.previewPlan();this.update();resolve(this.blob);
        };
        this.recorder.onerror=()=>{this.captureError='浏览器录制发生错误，请重新录制。';this.finishCapture();};
      });
      this.startMs=performance.now();this.recording=true;this.assignActors();
      if(this.guidePlan)this.guide=new root.MovieGuide.GuideRun(this.guidePlan,this.startMs);
      this.recorder.start(1000);this.drawCapture();
      this.clockTimer=setInterval(()=>this.tick(),250);this.tick();this.update();this.adapter.refresh?.();
      this.adapter.focusStage?.();
    }
    drawCapture(){
      if(!this.recording)return;
      const ctx=this.context;
      ctx.fillStyle='#dce5c9';ctx.fillRect(0,0,960,540);
      ctx.drawImage(this.adapter.canvas,0,0,960,540);
      // Stage badges can change after a tracking ID is reassigned. Keep that strip
      // clean; the exported shot gets its stable actor name from the event log.
      ctx.fillStyle='#dce5c9';ctx.fillRect(0,491,960,49);
      // The capture contains the avatar stage only; captions and effects are composed later.
      this.captureRaf=requestAnimationFrame(()=>this.drawCapture());
    }
    tick(){
      if(!this.recording)return;
      this.assignActors();const elapsed=(performance.now()-this.startMs)/1000;
      byId('filmTimer').textContent=Math.floor(elapsed)+' / '+this.maxSeconds+' 秒';
      byId('filmEventCount').textContent=this.events.length+' 个动作';
      byId('filmLiveTimer').textContent=Math.floor(elapsed)+' / '+this.maxSeconds+' 秒';
      byId('filmLiveCount').textContent=this.events.length+' 个动作';
      if(this.guide){this.tickGuide(performance.now());if(this.recording&&elapsed>=this.maxSeconds)this.endAndGenerate();return;}
      this.message(this.isDemo?'正在录制示例演出，结束后自动生成。':
        '本局录制中。每位演员做几个不同动作，回到自然姿势后再做下一个。');
      if(elapsed>=this.maxSeconds)this.endAndGenerate();
    }
    recordEvent({action,track,line,level,at}){
      if(!this.recording||at<this.startMs)return;
      this.assignActors();const slot=this.mapping.get(track.id);
      if(slot===undefined||this.events.length>=100)return;
      const event={id:'event-'+this.events.length,timeMs:Math.round(at-this.startMs),
        actorId:'actor-'+slot,actorName:this.slots[slot].name,trackId:track.id,avatarId:track.avatar,
        action,originalLine:line,level,focusX:this.adapter.mirrored()?1-track.x:track.x};
      if(this.guide&&!this.guide.accept(event,at))return;
      this.events.push(event);
      byId('filmEventCount').textContent=this.events.length+' 个动作';
    }
    finishCapture(){
      if(!this.recording)return this.stopPromise||Promise.resolve(null);
      this.missingActors=this.slots.filter((slot,index)=>[...this.mapping.values()].includes(index)&&!this.events.some(e=>e.actorId==='actor-'+index)).map(slot=>slot.name);
      this.recording=false;this.finalizing=true;this.duration=Math.max(.5,(performance.now()-this.startMs)/1000);
      clearInterval(this.clockTimer);cancelAnimationFrame(this.captureRaf);
      root.speechSynthesis?.cancel();
      byId('filmTimer').textContent=this.duration.toFixed(1)+' 秒已录制';
      if(this.recorder.state!=='inactive')this.recorder.stop();
      this.update();return this.stopPromise;
    }
    async endAndGenerate(){
      if(!this.recording)return;
      const pending=this.finishCapture();this.adapter.stop();await pending;
      byId('filmHeading').scrollIntoView?.({behavior:'smooth',block:'start'});
      if(this.guide&&!this.guide.complete){this.message('拍摄已停止，完成 '+this.guide.accepted.length+' / 6 幕。请重新拍完剧本；本局原始素材仍可下载。',true);return;}
      if(this.events.length){
        if(this.health?.ready)await this.generate();
        else if(['checking','preparing'].includes(this.health?.state)){
          this.pendingAutoGenerate=true;this.message('本局素材已保存。视频工具准备完成后会自动生成短片。');
        }else this.message('本局素材已保存。请检查视频服务，准备好后点击用本局素材生成。',true);
      }
      else this.message('本局没有触发有效动作。请重新录制，或先试一次示例短片。',true);
    }
    previewPlan(){
      if(!this.events.length)return null;
      if(this.guide&&!this.guide.complete)return null;
      const plan=this.guide?root.MovieStory.buildGuidedStory(this.guidePlan,this.events):root.MovieStory.buildStory(this.events,{theme:byId('filmTheme').value,variant:+byId('filmStory').value||0});
      const heading=byId('filmPlanTitle');heading.textContent=plan.title+' · 约 '+Math.round(plan.duration)+' 秒';
      const list=byId('filmStoryboard');list.replaceChildren();
      plan.scenes.forEach((scene,index)=>{
        const item=document.createElement('li'),name=document.createElement('b'),narration=document.createElement('p'),original=document.createElement('small');
        name.textContent=(index+1)+' · '+scene.actorName+' / '+scene.actionName;
        narration.textContent=scene.narration;original.textContent='现场原台词 · '+scene.originalLine;
        item.append(name,narration,original);list.append(item);
      });
      byId('filmPlanDetails').hidden=false;
      byId('filmShortNote').textContent=this.guide?'已按开拍前的六幕剧本完成。更换剧本需要重新拍摄对应动作。':(plan.short?'本局动作较少，将生成较短的故事。':'已兼顾演员出场和动作变化。')+(this.missingActors?.length?' '+this.missingActors.join('、')+'未触发有效动作，本片未分配单独镜头。':'');
      return plan;
    }
    async json(url,options={}){
      const response=await fetch(url,options);let data;
      try{data=await response.json();}catch{throw new Error('本地视频服务没有返回有效结果，请检查 start.cmd 窗口。');}
      if(!response.ok)throw new Error(data.error||'请求失败，请稍后重试。');
      return data;
    }
    async generate(){
      if(this.busy||this.recording||!this.blob)return;
      if(!this.health?.ready){this.message('视频工具尚未就绪，请等待准备完成后再生成。',true);return;}
      let plan;
      try{plan=this.previewPlan();if(!plan)throw new Error('本局没有有效动作。');}
      catch(error){this.message(error.message,true);return;}
      this.busy=true;const run=++this.runId;this.controller=new AbortController();this.jobId=null;this.update();
      try{
        const signal=this.controller.signal;
        if(!this.recordingId){
          this.message('正在将本局素材交给本机剪辑程序…');byId('filmProgress').value=2;
          const uploaded=await this.json('/api/movie-recordings',{method:'POST',headers:{'Content-Type':this.blob.type.split(';')[0]},body:this.blob,signal});
          if(run!==this.runId)return;this.recordingId=uploaded.recordingId;
        }
        // Let this small request return its ID even if the user cancels meanwhile,
        // then cancel that known job so it cannot become an orphan renderer.
        const job=await this.json('/api/movie-jobs',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({recordingId:this.recordingId,duration:this.duration,events:this.events,plan,
            guide:this.guidePlan,
            sound:byId('filmSound').checked,music:byId('filmMusic').checked,demo:this.isDemo})});
        if(run!==this.runId){
          await this.json('/api/movie-jobs/'+job.id+'/cancel',{method:'POST',body:'{}',headers:{'Content-Type':'application/json'}});
          return;
        }
        this.jobId=job.id;
        while(run===this.runId){
          const state=await this.json('/api/movie-jobs/'+job.id,{signal,cache:'no-store'});
          if(run!==this.runId)return;
          byId('filmProgress').value=state.progress;this.message(state.message);
          if(state.state==='done'){
            const url='/api/movie-jobs/'+job.id+'/video';
            byId('filmPlayer').src=url;byId('filmResult').hidden=false;
            byId('filmDownload').href=url;byId('filmDownload').download=plan.title+'.mp4';
            byId('filmStoryDownload').href='/api/movie-jobs/'+job.id+'/story';byId('filmStoryDownload').download=plan.title+'-分镜.json';
            byId('filmResultTitle').textContent=plan.title;
            this.message('短片已生成。可以预览、下载，或换一版剧情。');break;
          }
          if(['error','cancelled'].includes(state.state))throw new Error(state.message);
          await delay(1000);
        }
      }catch(error){
        if(run===this.runId){
          if(error.message.includes('素材不存在'))this.recordingId=null;
          this.message(error.name==='AbortError'?'已取消生成，本局素材仍保留。':error.message,true);
        }
      }finally{if(run===this.runId){this.busy=false;this.update();}}
    }
    async cancel(){
      if(!this.busy)return;
      const jobId=this.jobId;this.runId++;this.controller?.abort();this.busy=false;this.update();
      this.message('已取消生成，本局素材仍保留。');
      if(jobId)try{await this.json('/api/movie-jobs/'+jobId+'/cancel',{method:'POST',body:'{}',headers:{'Content-Type':'application/json'}});}catch{}
    }
  }
  root.MovieStudio=MovieStudio;
})(window);

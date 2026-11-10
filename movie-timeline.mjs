export function buildTimeline(plan,events,sourceDuration,{mode='full',sound=true,soundDurations={}}={}){
  if(!Number.isFinite(sourceDuration)||sourceDuration<=0||sourceDuration>185)throw new Error('录制时长必须在 185 秒以内。');
  const ordered=events.slice().sort((a,b)=>a.timeMs-b.timeMs),seen=new Set();
  if(!ordered.length)throw new Error('没有有效动作，无法生成短片。');
  for(const e of ordered){
    if(seen.has(e.id)||!Number.isFinite(e.timeMs)||e.timeMs<0||e.timeMs>sourceDuration*1000+100)throw new Error('动作时间或编号无效。');
    seen.add(e.id);
  }
  const scenes=ordered.map((event,i)=>{
    const template=plan.scenes.find(s=>s.eventId===event.id)||{};
    const start=Math.max(0,Math.min(sourceDuration,event.clipStartMs!==undefined?event.clipStartMs/1000:event.timeMs/1000-1.2));
    const end=Math.min(sourceDuration,event.clipEndMs!==undefined?event.clipEndMs/1000:
      (ordered[i+1]?ordered[i+1].timeMs/1000-.3:sourceDuration));
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw new Error('动作片段时间无效。');
    const soundLength=sound?Number(soundDurations[event.action]||0):0;
    if(sound&&!(soundLength>0&&soundLength<30))throw new Error('动作声音未准备好，请重新加载音效。');
    const soundOffset=Math.max(0,event.timeMs/1000-start);
    return {...template,eventId:event.id,actorId:event.actorId,actorName:event.actorName,action:event.action,
      actionName:template.actionName||event.actionName||event.action,originalLine:event.originalLine||'',
      narration:template.narration||event.actorName+'完成了'+(event.actionName||event.action)+'。',
      start,end,clipLength:end-start,focus:Math.max(0,Math.min(1,event.focusX??.5)),effect:'normal',
      soundLength,soundOffset,duration:Math.max(end-start,soundOffset+soundLength+.15)};
  });
  const audioCues=[];let voiceEnd=0,cursor=2.5;
  if(mode==='full'){
    for(const [i,e]of ordered.entries())if(sound){
      const at=Math.max(2.5+e.timeMs/1000,voiceEnd+.08),scene=scenes[i];
      audioCues.push({eventId:e.id,action:e.action,at,duration:scene.soundLength});voiceEnd=at+scene.soundLength;
    }
    const bodyDuration=Math.max(sourceDuration,voiceEnd-2.5+.15);
    return {mode:'full',sourceDuration,bodyDuration,duration:5+bodyDuration,scenes,audioCues,
      segments:[{type:'opening',duration:2.5},{type:'full',start:0,end:sourceDuration,duration:bodyDuration},{type:'ending',duration:2.5}]};
  }
  if(mode!=='actions')throw new Error('不支持的导出方式。');
  const segments=[{type:'opening',duration:2.5}];
  for(const scene of scenes){
    segments.push({type:'action',...scene});
    if(sound)audioCues.push({eventId:scene.eventId,action:scene.action,at:cursor+scene.soundOffset,duration:scene.soundLength});
    cursor+=scene.duration;
  }
  segments.push({type:'ending',duration:2.5});
  return {mode:'actions',sourceDuration,duration:cursor+2.5,scenes,audioCues,segments};
}

import {test}from 'node:test';import assert from 'node:assert/strict';
import {buildTimeline}from '../movie-timeline.mjs';
const events=[{id:'a',timeMs:1200,actorId:'a',actorName:'甲',action:'turn',originalLine:'原句',clipStartMs:500,clipEndMs:3000},
 {id:'b',timeMs:78500,actorId:'b',actorName:'乙',action:'head',clipStartMs:75000,clipEndMs:81500}];
const plan={scenes:events.map(e=>({eventId:e.id,actorId:e.actorId,action:e.action,narration:'剧情',actionName:'动作'}))};
const durations={turn:1.37,head:4.77};
test('an 82 second session keeps the late action and all recorded footage in full mode',()=>{
 const t=buildTimeline(plan,events,82,{soundDurations:durations});assert.equal(t.mode,'full');
 assert.equal(t.segments[1].start,0);assert.equal(t.segments[1].end,82);assert.ok(t.duration>=87);
 assert.equal(t.scenes[1].start,75);assert.ok(t.audioCues[1].at>80);
});
test('waiting can be removed without cutting off the lead-in or long system speech',()=>{
 const t=buildTimeline(plan,events,82,{mode:'actions',soundDurations:durations});
 const scene=t.scenes[1];assert.equal(scene.start,75);assert.equal(scene.end,81.5);
 assert.ok(scene.duration>=scene.soundOffset+4.77);assert.ok(t.duration<82);
});
test('every accepted event is retained even if the old story selected only six',()=>{
 const many=Array.from({length:9},(_,i)=>({...events[0],id:String(i),timeMs:1000+i*3000,clipStartMs:500+i*3000,clipEndMs:2500+i*3000}));
 const t=buildTimeline({scenes:[]},many,30,{soundDurations:durations});assert.equal(t.scenes.length,9);assert.equal(t.audioCues.length,9);
});
test('speech is not overlapped or cropped when actions arrive close together',()=>{
 const list=[{...events[0],action:'head',timeMs:1000},{...events[1],timeMs:2800,clipStartMs:2000,clipEndMs:7000}];
 const t=buildTimeline(plan,list,8,{soundDurations:durations});assert.ok(t.audioCues[1].at>=t.audioCues[0].at+4.77);
 assert.ok(t.duration>=t.audioCues[1].at+4.77+2.5);
});
test('missing sounds fail visibly instead of silently exporting a muted result',()=>{
 assert.throws(()=>buildTimeline(plan,events,82,{soundDurations:{}}),/声音/);
});

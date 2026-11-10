const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../movie-story.js');
const actions=Object.keys(Story.ACTIONS);
const event=(id,actor,action,time)=>({id,actorId:actor,actorName:actor,action,timeMs:time,originalLine:'原台词 '+id});
test('empty and unsupported events cannot fabricate a story',()=>{
 assert.throws(()=>Story.buildStory([]),/有效动作/);
 assert.throws(()=>Story.buildStory([event('a','甲','missing',100)]),/有效动作/);
});
test('all themes preserve actual event references and original captions',()=>{
 const events=actions.map((action,i)=>event('event-'+i,'演员'+i%4,action,i*2000));
 for(const theme of ['date','company','tea','auto']){
  const plan=Story.buildStory(events,{theme});assert.equal(plan.scenes.length,6);
  assert.equal(new Set(plan.scenes.map(s=>s.eventId)).size,6);
  assert.ok(plan.duration<=40);
  for(const scene of plan.scenes){
   const source=events.find(e=>e.id===scene.eventId);assert.ok(source);
   assert.equal(scene.originalLine,source.originalLine);assert.equal(scene.actorName,source.actorName);
   assert.equal(scene.action,source.action);
  }
 }
});
test('every participating actor appears, even if one dominates the event count',()=>{
 const events=Array.from({length:50},(_,i)=>event('a'+i,'甲',actions[i%9],i*1000));
 events.push(event('b','乙','turn',50100),event('c','丙','mouth',51100),event('d','丁','wave',52100));
 const plan=Story.buildStory(events);
 assert.deepEqual([...new Set(plan.scenes.map(s=>s.actorId))].sort(),['丁','丙','乙','甲'].sort());
});
test('selected shots keep their original chronological order',()=>{
 const events=Array.from({length:20},(_,i)=>event('e'+i,'甲',actions[i%9],(20-i)*1000));
 const plan=Story.buildStory(events,{theme:'company',variant:2});
 const stamps=plan.scenes.map(s=>events.find(e=>e.id===s.eventId).timeMs);
 assert.deepEqual(stamps,stamps.slice().sort((a,b)=>a-b));
});
test('one event produces a short story without inventing extra actions',()=>{
 const plan=Story.buildStory([event('one','甲','mouth',1000)]);
 assert.equal(plan.scenes.length,1);assert.ok(plan.short);assert.equal(plan.duration,9);
});
test('duplicates and invalid timestamps are filtered',()=>{
 const e=event('same','甲','wave',1000);
 const plan=Story.buildStory([e,e,event('bad','乙','turn',NaN)]);
 assert.equal(plan.scenes.length,1);
});
test('variant changes the title and can select a different shot',()=>{
 const events=Array.from({length:16},(_,i)=>event('e'+i,'甲',actions[i%9],i*1000));
 const a=Story.buildStory(events,{theme:'tea',variant:0}),b=Story.buildStory(events,{theme:'tea',variant:1});
 assert.notEqual(a.title,b.title);assert.notDeepEqual(a.scenes.map(s=>s.eventId),b.scenes.map(s=>s.eventId));
 assert.notEqual(a.ending,b.ending);assert.notEqual(a.scenes[0].narration,b.scenes[0].narration);
});
test('more than four actors is reported instead of silently omitting participants',()=>{
 assert.throws(()=>Story.buildStory(Array.from({length:5},(_,i)=>event('e'+i,'演员'+i,'turn',i*1000))),/四位演员/);
});

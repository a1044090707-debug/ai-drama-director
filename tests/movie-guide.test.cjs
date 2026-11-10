const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../movie-story.js'),{GuideRun}=require('../movie-guide.js');
function ready(run,at=0){run.phase='neutral';run.neutralSince=at;run.update(at+600);run.update(at+3100);return at+3100;}
test('every one of nine short films has six announced actions for one to four actors',()=>{
 for(const theme of Object.keys(Story.THEMES))for(let variant=0;variant<3;variant++)for(let count=1;count<=4;count++){
  const names=Array.from({length:count},(_,i)=>'演员'+i),plan=Story.createGuide({theme,variant,actorNames:names});
  assert.equal(plan.scenes.length,6);assert.equal(plan.title,Story.THEMES[theme].titles[variant]);
  assert.deepEqual([...new Set(plan.scenes.map(s=>s.actorName))].sort(),names.slice().sort());
  for(const step of plan.scenes){assert.ok(Story.ACTIONS[step.action]);assert.ok(step.tip.length>10);assert.ok(step.narration.includes(step.actorName));}
 }
});
test('the three films in a theme announce different action sequences',()=>{
 for(const theme of Object.keys(Story.THEMES)){
  const sequences=[0,1,2].map(variant=>Story.createGuide({theme,variant}).scenes.map(s=>s.action).join(','));
  assert.equal(new Set(sequences).size,3);
 }
});
test('countdown requires a stable neutral pose; moving early resets preparation',()=>{
 const run=new GuideRun(Story.createGuide(),0);run.update(2500);run.update(2600);run.update(3200);
 assert.equal(run.phase,'countdown');run.update(4000,{neutral:false});assert.equal(run.phase,'neutral');
 assert.equal(run.accepts('turn','actor-0'),false);
});
test('only the named actor doing the announced action can advance the story',()=>{
 const run=new GuideRun(Story.createGuide({actorNames:['甲','乙']}));const at=ready(run);
 assert.equal(run.phase,'action');
 assert.equal(run.accept({id:'bad',timeMs:at,action:'mouth',actorId:'actor-0'},at),false);
 assert.equal(run.accept({id:'bad',timeMs:at,action:'turn',actorId:'actor-1'},at),false);
 assert.equal(run.index,0);assert.equal(run.accepted.length,0);
 const event={id:'correct',timeMs:at,action:'turn',actorId:'actor-0'};
 assert.equal(run.accept(event,at),true);assert.equal(run.phase,'hold');
 assert.equal(event.clipStartMs,at-250);assert.equal(event.clipEndMs,at+1800);
 run.update(at+1799);assert.equal(run.index,0);run.update(at+1800);assert.equal(run.index,1);
});
test('lost actors pause the cue and cannot trigger an action',()=>{
 const run=new GuideRun(Story.createGuide());const at=ready(run);run.update(at+100,{visible:false});
 assert.ok(run.paused);assert.equal(run.phase,'neutral');assert.equal(run.accepts('turn','actor-0'),false);
});
test('retaking removes accepted material and returns to the correct prompt',()=>{
 const run=new GuideRun(Story.createGuide());const at=ready(run);
 run.accept({id:'one',timeMs:at,action:'turn',actorId:'actor-0'},at);run.update(at+1800);
 assert.deepEqual(run.redo(at+1900),['one']);assert.equal(run.index,0);assert.equal(run.phase,'neutral');assert.equal(run.accepted.length,0);
});
test('a completed film preserves all six planned beats without post-hoc reselection',()=>{
 const plan=Story.createGuide({theme:'tea',variant:2,actorNames:['甲','乙']}),run=new GuideRun(plan),events=[];let now=0;
 for(const step of plan.scenes){
  now=ready(run,now);const e={id:'event-'+events.length,timeMs:now,action:step.action,actorId:step.actorId,actorName:step.actorName,originalLine:'原句'+events.length};
  assert.ok(run.accept(e,now));events.push(e);now+=1800;run.update(now);
 }
 assert.ok(run.complete);const story=Story.buildGuidedStory(plan,events.concat({id:'extra',timeMs:1,actorId:'actor-0',actorName:'甲',action:'head'}));
 assert.deepEqual(story.scenes.map(s=>s.action),plan.scenes.map(s=>s.action));
 assert.deepEqual(story.scenes.map(s=>s.narration),plan.scenes.map(s=>s.narration));
 assert.deepEqual(story.scenes.map(s=>s.originalLine),events.map(e=>e.originalLine));
 assert.throws(()=>Story.buildGuidedStory(plan,events.slice(0,5)),/六个分镜/);
});

test('the full prompted movement and complete system sound are covered',()=>{
 const run=new GuideRun(Story.createGuide());const at=ready(run);
 const event={id:'a',timeMs:at+2500,cueStartMs:at-350,soundDurationMs:5130,action:'turn',actorId:'actor-0'};
 assert.ok(run.accept(event,at+2500));assert.equal(event.clipStartMs,at-350);
 assert.ok(event.clipEndMs>=event.timeMs+5130);run.update(at+2500+1800);assert.equal(run.phase,'hold');
 run.update(at+2500+5310);assert.equal(run.index,1);
});

test('a stale frame captured before the cue cannot advance a later action phase',()=>{
 const run=new GuideRun(Story.createGuide());const at=ready(run);
 assert.equal(run.accept({id:'old',timeMs:at-200,action:'turn',actorId:'actor-0'},at-200),false);
 assert.equal(run.accepted.length,0);
});

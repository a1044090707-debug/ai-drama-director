import {test}from 'node:test';
import assert from 'node:assert/strict';
import {shotsFor,capability}from '../browser-movie-export.mjs';

const event={id:'a',action:'turn',actorId:'actor-0',timeMs:11000,clipStartMs:10750,clipEndMs:12800,focusX:.75};
const plan={scenes:[{eventId:'a',action:'turn',actorId:'actor-0',duration:4}]};
test('guided export selects the accepted footage window and excludes preparation time',()=>{
 const [shot]=shotsFor(plan,[event],30);assert.equal(shot.start,10.75);assert.equal(shot.end,12.8);assert.equal(shot.focus,.75);
});
test('final capture boundary clamps a late hold window',()=>{
 assert.equal(shotsFor(plan,[event],12)[0].end,12);
});
test('missing, duplicate, wrong-action and wrong-actor references cannot become footage',()=>{
 for(const events of [[],[{...event,action:'mouth'}],[{...event,actorId:'actor-1'}]])assert.throws(()=>shotsFor(plan,events,30));
 assert.throws(()=>shotsFor({scenes:[...plan.scenes,...plan.scenes]},[event],30));
});
test('invalid footage times are rejected',()=>{
 for(const e of [{...event,clipStartMs:NaN},{...event,clipStartMs:40000},{...event,clipEndMs:1000}])assert.throws(()=>shotsFor(plan,[e],30));
});
test('free recording selects footage around the actual event',()=>{
 const e={...event};delete e.clipStartMs;delete e.clipEndMs;
 const [shot]=shotsFor(plan,[e],30);assert.equal(shot.start,10);assert.equal(shot.end,14);
});
test('missing browser codecs report an explicit unsupported state',async()=>{
 assert.equal((await capability()).ready,false);
});

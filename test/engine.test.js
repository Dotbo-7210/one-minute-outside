import test from 'node:test';import assert from 'node:assert/strict';
import {QUESTS} from '../src/quests.js';import {cosine,eligible,rank,validateFilters} from '../src/engine.js';
const filters={minutes:10,place:'any',weather:'any',access:'any'};
test('catalog has unique ids and complete safe prompts',()=>{
  assert.ok(QUESTS.length>=10);assert.equal(new Set(QUESTS.map(x=>x.id)).size,QUESTS.length);
  for(const q of QUESTS){assert.ok(q.title&&q.description&&q.semantic&&q.question);assert.equal(q.steps.length,3);assert.ok(q.minutes>=5);assert.ok(q.places.length);assert.ok(q.weather.length);}
});
test('cosine is normalized and dimensions checked',()=>{assert.equal(cosine([1,0],[1,0]),1);assert.equal(cosine([1,0],[0,1]),0);assert.equal(cosine([0,0],[0,1]),0);assert.throws(()=>cosine([1],[1,2]));assert.throws(()=>cosine([NaN],[1]));});
test('seated constraint filters out walking cards',()=>{assert.equal(eligible(QUESTS.find(q=>q.id==='light-hunter'),{...filters,access:'seated'}),false);assert.equal(eligible(QUESTS.find(q=>q.id==='bench-voyage'),{...filters,access:'seated'}),true);});
test('time constraint excludes longer cards',()=>{assert.equal(eligible(QUESTS.find(q=>q.id==='evening-edge'),filters),false);});
test('water-only card cannot appear in city',()=>{assert.equal(eligible(QUESTS.find(q=>q.id==='water-clock'),{...filters,place:'city'}),false);});
test('rain-only card excluded on dry or unknown day',()=>{assert.equal(eligible(QUESTS.find(q=>q.id==='rain-orchestra'),{...filters,weather:'clear'}),false);assert.equal(eligible(QUESTS.find(q=>q.id==='rain-orchestra'),filters),false);});
test('sunlight-only card excluded on rainy or unknown day',()=>{assert.equal(eligible(QUESTS.find(q=>q.id==='light-hunter'),{...filters,weather:'rain'}),false);assert.equal(eligible(QUESTS.find(q=>q.id==='light-hunter'),filters),false);});
test('model similarity drives ranking within hard constraints',()=>{const qs=QUESTS.slice(0,3);const r=rank(qs,[[1,0],[0,1],[.6,.8]],[0,1],filters);assert.equal(r[0].quest.id,qs[1].id);assert.ok(r[0].similarity>r[1].similarity);});
test('ties are stable',()=>{const qs=[QUESTS[1],QUESTS[0]];const r=rank(qs,[[1,0],[1,0]],[1,0],filters);assert.equal(r[0].quest.id,'sky-shapes');});
test('invalid filters and vectors fail closed',()=>{assert.throws(()=>validateFilters({...filters,minutes:0}));assert.throws(()=>validateFilters({...filters,access:'unknown'}));assert.throws(()=>rank(QUESTS,[],[1,0],filters));});
test('at least one seated short mission available in each setting',()=>{for(const place of ['city','park','water','home'])assert.ok(QUESTS.some(q=>eligible(q,{minutes:5,place,weather:'rain',access:'seated'})));});

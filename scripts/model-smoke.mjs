import {pipeline} from '@huggingface/transformers';
import {QUESTS} from '../src/quests.js';
import {rank} from '../src/engine.js';
const model=await pipeline('feature-extraction','Xenova/all-MiniLM-L6-v2',{dtype:'q8'});
const catalog=(await model(QUESTS.map(q=>q.semantic),{pooling:'mean',normalize:true})).tolist();
const prompt=(await model('I feel exhausted and want to sit quietly outside and listen to birds',{pooling:'mean',normalize:true})).tolist()[0];
const ranked=rank(QUESTS,catalog,prompt,{minutes:10,place:'park',weather:'clear',access:'seated'});
if(!ranked.length||!Number.isFinite(ranked[0].similarity))throw Error('Embedding smoke test failed');
console.log(JSON.stringify({model:'Xenova/all-MiniLM-L6-v2',dims:prompt.length,top:ranked.slice(0,3).map(x=>({id:x.quest.id,similarity:Number(x.similarity.toFixed(4))}))},null,2));

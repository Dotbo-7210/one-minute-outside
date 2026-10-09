import { pipeline } from '@huggingface/transformers';
import { QUESTS } from './quests.js';
import { rank,validateFilters } from './engine.js';
const MODEL='Xenova/all-MiniLM-L6-v2'; // Apache-2.0 open weights; local WASM inference.
let extractorPromise=null;
let catalogVectorsPromise=null;
async function extractor() {
  if(!extractorPromise) extractorPromise=pipeline('feature-extraction',MODEL,{dtype:'q8',progress_callback:(p)=>{
    if(p.status==='progress' && Number.isFinite(p.progress)) postMessage({type:'progress',progress:Math.round(p.progress)});
  }}).catch(e=>{extractorPromise=null;throw e;});
  return extractorPromise;
}
async function vectors() {
  if(!catalogVectorsPromise) catalogVectorsPromise=(async()=>{
    const model=await extractor();
    const tensor=await model(QUESTS.map(q=>q.semantic),{pooling:'mean',normalize:true});
    return tensor.tolist();
  })().catch(e=>{catalogVectorsPromise=null;throw e;});
  return catalogVectorsPromise;
}
self.onmessage=async({data})=>{
  if(data?.type!=='rank')return;
  const id=data.id;
  try {
    const filters=validateFilters(data.filters);
    const mood=String(data.mood||'').trim().slice(0,500);
    if(!mood) throw new Error("Tell me a little about your day first.");
    postMessage({type:'loading',id});
    const model=await extractor();
    const catalog=await vectors();
    const tensor=await model(mood,{pooling:'mean',normalize:true});
    const result=rank(QUESTS,catalog,tensor.tolist()[0],filters);
    if(!result.length) throw new Error("No field card fits those constraints. Try another place or more time.");
    postMessage({type:'result',id,quest:result[0].quest,similarity:result[0].similarity});
  } catch(error) {
    postMessage({type:'error',id,message:String(error?.message||error).slice(0,300)});
  }
};

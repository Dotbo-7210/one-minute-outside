import './style.css';
const $=(id)=>document.getElementById(id);
const worker=new Worker(new URL('./model-worker.js',import.meta.url),{type:'module'});
let requestId=0,activeQuest=null;
const NOTES_KEY='one-minute-outside:field-notes:v1';
const MAX_NOTES=30;
function loadNotes(){try{const data=JSON.parse(localStorage.getItem(NOTES_KEY)||'[]');return Array.isArray(data)?data.filter(x=>x&&typeof x.text==='string'&&typeof x.title==='string').slice(0,MAX_NOTES):[];}catch{return [];}}
function saveNotes(notes){try{localStorage.setItem(NOTES_KEY,JSON.stringify(notes.slice(0,MAX_NOTES)));return true;}catch{return false;}}
function showStatus(text){$('model-status').textContent=text;}
function renderNotes(){
  const notes=loadNotes();$('entry-count').textContent=`${notes.length} FIELD NOTE${notes.length===1?'':'S'}`;
  const root=$('journal-list');root.replaceChildren();
  if(!notes.length){const p=document.createElement('p');p.className='journal-empty';p.textContent='The collection starts with your first walk.';root.append(p);return;}
  notes.forEach(note=>{const card=document.createElement('article');card.className='note';
    const date=document.createElement('small');date.textContent=new Date(note.at).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
    const title=document.createElement('strong');title.textContent=note.title;
    const p=document.createElement('p');p.textContent=note.text;
    card.append(date,title,p);root.append(card);
  });
}
$('quest-form').addEventListener('submit',e=>{
  e.preventDefault();
  const mood=$('mood').value.trim();
  if(!mood)return;
  const filters={place:$('place').value,minutes:Number($('minutes').value),weather:$('weather').value,access:$('access').value};
  const id=++requestId;
  $('go').disabled=true;
  showStatus('Preparing the local model. Your words are not sent to a server.');
  worker.postMessage({type:'rank',id,mood,filters});
});
worker.onmessage=({data})=>{
  if(data.type==='progress'){showStatus(`Downloading open weights (first use only): ${data.progress}%`);return;}
  if(data.id!==requestId)return;
  if(data.type==='loading'){showStatus('Reading the mood of your day with a local open-weight model…');return;}
  $('go').disabled=false;
  if(data.type==='error'){showStatus('Could not prepare your field card: '+data.message);return;}
  if(data.type==='result'){
    activeQuest=data.quest;
    $('empty-state').hidden=true;$('result').hidden=false;
    $('quest-time').textContent=`${activeQuest.minutes} MINUTES · OUTSIDE`;
    $('quest-number').textContent=`CARD / ${activeQuest.id.toUpperCase()}`;
    $('quest-title').textContent=activeQuest.title;
    $('quest-desc').textContent=activeQuest.description;
    $('quest-steps').replaceChildren();
    activeQuest.steps.forEach(step=>{const li=document.createElement('li');li.textContent=step;$('quest-steps').append(li);});
    $('quest-question').textContent=activeQuest.question;
    showStatus('Ready. The AI ran locally; your note has not left your device.');
    $('result').scrollIntoView({behavior:'smooth',block:'nearest'});
  }
};
$('journal-open').addEventListener('click',()=>{$('journal-form').hidden=false;$('observation').focus();});
$('cancel-note').addEventListener('click',()=>{$('journal-form').hidden=true;});
$('journal-form').addEventListener('submit',e=>{
  e.preventDefault();if(!activeQuest)return;
  const text=$('observation').value.trim().slice(0,600);if(!text)return;
  const notes=loadNotes();
  notes.unshift({title:activeQuest.title,text,at:new Date().toISOString()});
  if(!saveNotes(notes)){showStatus('Browser storage is unavailable; copy your observation before leaving.');return;}
  $('observation').value='';$('journal-form').hidden=true;renderNotes();
  $('journal-title').scrollIntoView({behavior:'smooth'});
});
renderNotes();

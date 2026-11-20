'use strict';
// The original canvas and microphone UI remain in app.js; this replaces its demo transport.
let synthesisTail=Promise.resolve();
let voiceTurn=null,events=null,voiceAbort=null,voiceQueue=[],playing=false,finished=false,lastEvent=0,phrase='',spokenItems=new Map(),approval=null;
const originalStop=stop;
stop=async function(){
  const id=voiceTurn;voiceTurn=null;events?.close();events=null;voiceAbort?.abort();voiceQueue=[];phrase='';playing=false;finished=true;approval=null;$('#approval-dialog').close();localStorage.removeItem('jarvis-turn');
  await originalStop();if(id)api('/api/voice/cancel',{id}).catch(e=>toast('Playback stopped. '+e.message));
};
function cleanSpeech(s){return s.replace(/```[\s\S]*?```/g,' Code is available in the saved chat. ').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/https?:\/\/\S+/g,' link in the saved chat ').replace(/[*_#`]/g,'').trim();}
function enqueueSpeech(text){
  text=cleanSpeech(text);if(!text||!$('#speak-replies').checked||!config.fish.configured)return;
  // Start synthesis as soon as a phrase is ready, while previous audio plays.
  const signal=voiceAbort.signal;
  const job=synthesisTail.then(()=>api('/api/speak',{text:text.slice(0,2400)},signal,true)).then(blob=>({blob}),error=>({error}));
  synthesisTail=job.then(()=>{});
  voiceQueue.push(job);pumpAudio();
}
async function pumpAudio(){
  if(playing)return;playing=true;const token=sequence;
  try{while(voiceQueue.length&&voiceTurn&&token===sequence){const result=await voiceQueue.shift();if(token!==sequence||!voiceTurn)return;if(result.error)throw result.error;setPhase('speaking');audioUrl=URL.createObjectURL(result.blob);currentAudio=new Audio(audioUrl);await new Promise((resolve,reject)=>{const audio=currentAudio;audio.onended=resolve;audio.onerror=()=>reject(new Error('Voice playback failed.'));voiceAbort.signal.addEventListener('abort',resolve,{once:true});audio.play().catch(reject);});releaseAudio();}}
  catch(e){if(e.name!=='AbortError'){toast(e.message);$('#jarvis-line').textContent+='\nVoice: '+e.message;}}
  finally{if(token===sequence){playing=false;if(finished)completeVoice();else if(!approval)setPhase('thinking');}}
}
function flushPhrase(force=false){
  // Keep code fences intact; never voice raw tool arguments or reasoning events.
  if((phrase.match(/```/g)||[]).length%2&&!force)return;
  let match;while((match=phrase.match(/^([\s\S]{20,}?[.!?](?:\s|$)|[\s\S]{100,}?[;:,]\s)/))){enqueueSpeech(match[1]);phrase=phrase.slice(match[1].length);}
  if(phrase.length>350&&!phrase.includes('```')){const cut=phrase.lastIndexOf(' ',300);if(cut>0){enqueueSpeech(phrase.slice(0,cut));phrase=phrase.slice(cut);}}
  if(force&&phrase.trim()){enqueueSpeech(phrase);phrase='';}
}
function completeVoice(){if(!finished||playing||voiceQueue.length)return;voiceTurn=null;localStorage.removeItem('jarvis-turn');setPhase('idle');}
function attachEvents(id,after=0){events?.close();lastEvent=after;events=new EventSource(`/api/voice/events?id=${encodeURIComponent(id)}&token=${encodeURIComponent(config.csrf)}&after=${after}`);
  events.onmessage=e=>{const v=JSON.parse(e.data);if(v.type==='snapshot'){for(const a of v.pending||[])showApproval(a);if(v.done){finished=true;events?.close();events=null;if(v.error)toast(v.error);completeVoice();}return;}if(v.seq<=lastEvent)return;lastEvent=v.seq;localStorage.setItem('jarvis-turn',JSON.stringify({id,after:lastEvent}));
    if(v.type==='delta'){const prior=spokenItems.get(v.itemId)||'';spokenItems.set(v.itemId,prior+v.text);$('#jarvis-line').textContent+=v.text;phrase+=v.text;flushPhrase();}
    if(v.type==='message'){if(!spokenItems.has(v.itemId)){phrase+=v.text;$('#jarvis-line').textContent+=v.text;}flushPhrase(true);}
    if(v.type==='approval')showApproval(v);
    if(v.type==='notice')toast(v.text);
    if(v.type==='done'||v.type==='error'){events.close();events=null;finished=true;flushPhrase(true);if(v.error){toast(v.error);$('#jarvis-line').textContent+='\n'+v.error;}completeVoice();}
  };events.onerror=()=>{if(voiceTurn)toast('Connection interrupted. Reconnecting to the same voice turn.');};
}
send=async function(text){
  text=text.trim();if(!text)return;
  if(approval){await answerVoice(text);return;}
  await stop();const token=++sequence;voiceAbort=new AbortController();voiceTurn=crypto.randomUUID();const id=voiceTurn;finished=false;phrase='';spokenItems=new Map();$('#user-line').textContent=text;$('#jarvis-line').textContent='';setPhase('thinking');localStorage.setItem('jarvis-turn',JSON.stringify({id,after:0}));
  try{await api('/api/voice/start',{id,text});if(token!==sequence){api('/api/voice/cancel',{id}).catch(()=>{});return;}attachEvents(id);}
  catch(e){if(token!==sequence)return;setPhase('error');if(!e.status){toast('Connection lost. Reload to reconnect to this same utterance before repeating an action.');return;}toast(e.message);voiceTurn=null;localStorage.removeItem('jarvis-turn');}
};
function showApproval(v){approval=v;const box=$('#approval-content');box.replaceChildren();const p=document.createElement('p');p.textContent=v.params.reason||v.params.command||v.params.questions?.map(q=>q.question).join('\n')||'Codex requests permission for this action.';box.append(p);
  const detail=document.createElement('pre');detail.textContent=JSON.stringify(v.params,null,2);box.append(detail);
  $('#allow-once').hidden=v.method==='item/tool/requestUserInput';$('#deny-once').hidden=v.method==='item/tool/requestUserInput';
  if(v.method==='item/tool/requestUserInput')for(const q of v.params.questions){const label=document.createElement('label');label.textContent=q.question;const input=document.createElement('input');input.dataset.question=q.id;input.placeholder='Answer, or use the microphone';box.append(label,input);for(const o of q.options||[]){const b=document.createElement('button');b.textContent=o.label;b.onclick=()=>{input.value=o.label;};box.append(b);}}
  $('#submit-answer').hidden=v.method!=='item/tool/requestUserInput';$('#approval-dialog').showModal();setPhase('idle');enqueueSpeech(p.textContent+' Please review the request.');
}
async function submitApproval(body){if(!approval)return;await api('/api/voice/answer',{id:approval.id,...body});approval=null;$('#approval-dialog').close();setPhase('thinking');}
async function answerVoice(text){try{if(approval.method==='item/tool/requestUserInput'){const questions=approval.params.questions;if(questions.length===1)await submitApproval({answers:{[questions[0].id]:{answers:[text]}}});else toast('Use the request window to answer each question.');}else if(/^(allow once|approve|yes)[.!]?$/i.test(text))await submitApproval({decision:'accept'});else if(/^(deny|no|decline)[.!]?$/i.test(text))await submitApproval({decision:'decline'});else toast('Say allow once or deny.');}catch(e){toast(e.message);}}
$('#allow-once').onclick=()=>submitApproval({decision:'accept'}).catch(e=>toast(e.message));$('#deny-once').onclick=()=>submitApproval({decision:'decline'}).catch(e=>toast(e.message));
$('#submit-answer').onclick=()=>{const answers={};$('#approval-content').querySelectorAll('input').forEach(i=>{answers[i.dataset.question]={answers:[i.value]};});submitApproval({answers}).catch(e=>toast(e.message));};
$('#answer-mic').onclick=()=>{if(!Recognition)return toast('Speech recognition unavailable. Use the request controls.');releaseAudio();browserListen();};
$('#approval-dialog').addEventListener('cancel',()=>stop());
$('#brain').onchange=()=>{};
updateStatus=function(){provider='codex';$('#brain-status').textContent='CODEX · SIGNED-IN ACCOUNT';$('#brain-detail').textContent='Persistent Jarvis chat. Do not run a desktop turn in this chat while the orb is working. Live desktop refresh is not verified.';$('#voice-status').textContent=config.fish.configured?'FISH AUDIO':'VOICE NOT CONFIGURED';$('#test-voice').disabled=!config.fish.configured;};
const resumeTimer=setInterval(()=>{if(!config)return;clearInterval(resumeTimer);const saved=JSON.parse(localStorage.getItem('jarvis-turn')||'null');if(saved){voiceTurn=saved.id;voiceAbort=new AbortController();finished=false;setPhase('thinking');attachEvents(saved.id,saved.after);}},200);

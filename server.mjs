import http from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { AppError, textField, validateEvent, validateReminder, validateMessages, makeICS, demoReply } from './core.mjs';
import { providerConfig, chat, checkedFetch } from './providers.mjs';
import { CodexBridge } from './codex-bridge.mjs';
import { stackRoute } from './stack-runtime.mjs';

const root = dirname(fileURLToPath(import.meta.url));
if (existsSync(join(root,'.env'))) process.loadEnvFile(join(root,'.env'));
const port = Number(process.env.PORT || 4320);
const csrf = randomBytes(32).toString('hex');
const dataDir = process.env.JARVIS_DATA_DIR || join(root,'.data');
export const bridge = new CodexBridge(dataDir,{ephemeral:process.env.JARVIS_TEST_EPHEMERAL==='1'});
const dbPath = join(dataDir,'local.json');
let state = {events:[], reminders:[], activity:[]};
if (existsSync(dbPath)) {
  state = JSON.parse(readFileSync(dbPath,'utf8'));
  if (!Array.isArray(state.events) || !Array.isArray(state.reminders) || !Array.isArray(state.activity)) throw new Error('Invalid local data file; restore it from backup before starting.');
}
function persist() {
  mkdirSync(dataDir,{recursive:true,mode:0o700});
  writeFileSync(`${dbPath}.tmp`,JSON.stringify(state,null,2),{mode:0o600});
  renameSync(`${dbPath}.tmp`,dbPath);
}
function log(text) { state.activity.unshift({text,at:new Date().toISOString()}); state.activity = state.activity.slice(0,100); }
function send(res,code,data,type='application/json') { res.writeHead(code,{'Content-Type':type}); res.end(type==='application/json'?JSON.stringify(data):data); }
async function readBody(req,limit=100000) {
  let size=0; const chunks=[];
  for await (const part of req) { size+=part.length; if(size>limit) throw new AppError('Request too large.',413); chunks.push(part); }
  return Buffer.concat(chunks);
}
async function json(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new AppError('JSON required.',415);
  try { return JSON.parse((await readBody(req)).toString()); } catch(e) { if(e instanceof AppError) throw e; throw new AppError('Invalid JSON.'); }
}
const active = new Set(); let paused = false;
function assertActive() { if(paused) throw new AppError('Jarvis is paused. Resume to continue.',409); }
async function withRequest(req,res,fn) {
  assertActive(); if(active.size>=2) throw new AppError('Two requests are already running. Please wait.',429);
  const controller=new AbortController(); active.add(controller);
  const close=()=>controller.abort(); res.on('close',close);
  try { return await fn(controller.signal); } finally { active.delete(controller); res.off('close',close); }
}
const staticFiles = {'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/voice.js':['voice.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
export const server = http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const host=req.headers.host;
  if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(host)) return send(res,403,{error:'Localhost only.'});
  if(req.headers.origin && req.headers.origin !== `http://${host}`) return send(res,403,{error:'Cross-origin request blocked.'});
  if(req.headers['sec-fetch-site'] === 'cross-site') return send(res,403,{error:'Cross-site request blocked.'});
  const url=new URL(req.url,`http://${host}`);
  try {
    if(stackRoute(root,req,res,url))return;
    if(req.method==='GET' && staticFiles[url.pathname]) {
      const [file,type]=staticFiles[url.pathname]; return send(res,200,readFileSync(join(root,'public',file)),type);
    }
    if(req.method==='GET' && url.pathname==='/api/status') {
      const tools=bridge.toolNames||[];
      const has=prefix=>tools.some(name=>name.startsWith(prefix+'.'));
      return send(res,200,{
        csrf,paused,providers:Object.fromEntries(Object.entries(providerConfig()).map(([name,p])=>[name,{configured:!!(p.key&&p.model),model:p.model||null}])),
        fish:{configured:!!process.env.FISH_API_KEY,model:process.env.FISH_TTS_MODEL||'s2.1-pro-free'},
        codex:bridge.status(),googleConnected:has('google_calendar')||has('google_drive')||has('google_sheets'),
        googleCalendarConnected:has('google_calendar'),googleDriveConnected:has('google_drive'),
        googleSheetsConnected:has('google_sheets'),gmailConnected:has('gmail'),macConnected:false,...state
      });
    }
    if(req.method==='GET' && url.pathname==='/api/voice/events') {
      if(url.searchParams.get('token')!==csrf) return send(res,403,{error:'Session expired.'});
      const record=bridge.records[url.searchParams.get('id')];if(!record)return send(res,404,{error:'Unknown utterance.'});
      res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive'});
      const write=e=>{res.write(`id: ${e.seq}\ndata: ${JSON.stringify(e)}\n\n`);if(e.type==='done'||e.type==='error')res.end();};
      const after=Number(req.headers['last-event-id']||url.searchParams.get('after')||0);
      if(after>0)res.write(`data: ${JSON.stringify({type:'snapshot',done:record.done&&after>=record.events.length,error:record.error,pending:[...bridge.approvals.values()].filter(a=>a.recordId===record.id).map(a=>a.public)})}\n\n`);
      for(const e of record.events)if(e.seq>after)write(e);
      if(record.done){res.end();return;}
      bridge.on(record.id,write);const timer=setInterval(()=>res.write(': keepalive\n\n'),15000);
      res.on('close',()=>{clearInterval(timer);bridge.off(record.id,write);});return;
    }
    if(req.method!=='POST') return send(res,404,{error:'Not found.'});
    if(req.headers['x-jarvis-token']!==csrf) return send(res,403,{error:'Session expired. Reload Jarvis.'});
    if(url.pathname==='/api/pause') {
      const body=await json(req); if(typeof body.paused!=='boolean') throw new AppError('Invalid pause state.');
      paused=body.paused; if(paused) {for(const controller of active) controller.abort();if(bridge.active)await bridge.interrupt(bridge.active);}
      log(paused?'Session paused; active requests cancelled.':'Session resumed.'); persist(); return send(res,200,{paused});
    }
    assertActive();
    if(url.pathname==='/api/voice/command') {const body=await json(req);return send(res,200,await bridge.command(textField(body.command,'Command',200)));}
    if(url.pathname==='/api/voice/start') {const body=await json(req);return send(res,200,await bridge.start(body.id,textField(body.text,'Voice request',6000)));}
    if(url.pathname==='/api/voice/cancel') {const body=await json(req);return send(res,200,await bridge.interrupt(body.id));}
    if(url.pathname==='/api/voice/answer') {const body=await json(req);return send(res,200,bridge.answer(body.id,body));}
    if(url.pathname==='/api/chat') {
      throw new AppError('Use the persistent Codex voice endpoint. Demo replies are disabled.',410);
    }
    if(url.pathname==='/api/speak') {
      const body=await json(req), text=textField(body.text,'Speech',2500);
      if(!process.env.FISH_API_KEY) throw new AppError('Add FISH_API_KEY in .env and restart to enable voice.',409);
      return await withRequest(req,res,async signal=>{
        const payload={text,format:'mp3'}; if(process.env.FISH_VOICE_ID) payload.reference_id=process.env.FISH_VOICE_ID;
        const upstream=await checkedFetch('https://api.fish.audio/v1/tts',{method:'POST',headers:{Authorization:`Bearer ${process.env.FISH_API_KEY}`,'Content-Type':'application/json',model:process.env.FISH_TTS_MODEL||'s2.1-pro-free'},body:JSON.stringify(payload)},signal);
        const audio=Buffer.from(await upstream.arrayBuffer());
        send(res,200,audio,'audio/mpeg');
      });
    }
    if(url.pathname==='/api/transcribe') {
      if(!process.env.FISH_API_KEY) throw new AppError('Add FISH_API_KEY in .env and restart to enable voice.',409);
      const audio=await readBody(req,10*1024*1024);
      if(audio.length<44 || audio.toString('ascii',0,4)!=='RIFF' || audio.toString('ascii',8,12)!=='WAVE') throw new AppError('A WAV recording is required.');
      return await withRequest(req,res,async signal=>{
        const form=new FormData(); form.append('audio',new Blob([audio],{type:'audio/wav'}),'voice.wav'); form.append('ignore_timestamps','true');
        const upstream=await checkedFetch('https://api.fish.audio/v1/asr',{method:'POST',headers:{Authorization:`Bearer ${process.env.FISH_API_KEY}`,model:process.env.FISH_ASR_MODEL||'transcribe-1-pro'},body:form},signal);
        const result=await upstream.json(); send(res,200,{text:typeof result.text==='string'?result.text:''});
      });
    }
    if(url.pathname==='/api/events') {
      if(state.events.length>=200) throw new AppError('Draft limit reached.');
      const event=validateEvent(await json(req)); state.events.unshift(event); log('Event draft saved locally.'); persist(); return send(res,201,event);
    }
    if(url.pathname==='/api/export') {
      const {id}=await json(req); const event=state.events.find(e=>e.id===id); if(!event) throw new AppError('Draft not found.',404);
      log('Calendar file exported. No invitation sent.'); persist(); res.setHeader('Content-Disposition','attachment; filename="jarvis-event.ics"'); return send(res,200,makeICS(event),'text/calendar; charset=utf-8');
    }
    if(url.pathname==='/api/reminders') {
      if(state.reminders.length>=200) throw new AppError('Reminder limit reached.');
      const reminder=validateReminder(await json(req)); state.reminders.unshift(reminder); log('Local reminder saved. Dashboard must remain open.'); persist(); return send(res,201,reminder);
    }
    if(url.pathname==='/api/reminders/done') {
      const {id}=await json(req); const reminder=state.reminders.find(r=>r.id===id); if(!reminder) throw new AppError('Reminder not found.',404);
      reminder.done=true; log('Reminder marked done.'); persist(); return send(res,200,{ok:true});
    }
    return send(res,404,{error:'Not found.'});
  } catch(e) { if(!res.headersSent && !res.destroyed) send(res,e.status||500,{error:e instanceof AppError?e.message:'Request failed. No action was completed.'}); }
});
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  server.listen(port,'127.0.0.1',()=>{console.log(`Jarvis local preview: http://127.0.0.1:${port}`);bridge.connect().catch(()=>{});});
}

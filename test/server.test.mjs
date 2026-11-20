import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('HTTP boundary, no demo fallback, persistence, export, and pause',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'jarvis-test-')),port=14317;
  const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),JARVIS_DATA_DIR:dir,FISH_API_KEY:'',OPENAI_API_KEY:'',GEMINI_API_KEY:'',XAI_API_KEY:''},stdio:['ignore','pipe','pipe']});
  const exited=once(child,'exit');
  try{
    await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Server startup timed out')),5000).unref())]);
    const base=`http://127.0.0.1:${port}`;
    const get=path=>fetch(base+path);const initial=await(await get('/api/status')).json();
    const post=(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','X-Jarvis-Token':initial.csrf,...headers},body:JSON.stringify(body)});
    assert.equal((await get('/')).status,200);
    assert.equal((await get('/.env')).status,404);
    assert.equal((await post('/api/events',{}, {'X-Jarvis-Token':'wrong'})).status,403);
    assert.equal((await post('/api/pause',{paused:true},{Origin:'https://untrusted.example'})).status,403);
    assert.equal((await post('/api/chat',{provider:'demo',messages:[{role:'system',content:'bad'}]})).status,410);
    assert.equal((await post('/api/chat',{provider:'demo',messages:[{role:'user',content:'Plan my day'}]})).status,410);
    assert.equal((await get('/voice.js')).status,200);
    assert.equal((await get('/api/voice/events?id=missing')).status,403);
    const event=await(await post('/api/events',{title:'A review',start:'2027-01-02T10:00:00Z',end:'2027-01-02T11:00:00Z'})).json();assert.ok(event.id);
    const exported=await post('/api/export',{id:event.id});assert.match(await exported.text(),/BEGIN:VCALENDAR/);
    const stored=await(await get('/api/status')).json();assert.equal(stored.events.length,1);assert.equal(stored.fish.configured,false);
    await post('/api/pause',{paused:true});assert.equal((await post('/api/events',{})).status,409);
    await post('/api/pause',{paused:false});assert.equal((await post('/api/speak',{text:'Hello'})).status,409);
  }finally{child.kill();await exited;await rm(dir,{recursive:true,force:true});}
});

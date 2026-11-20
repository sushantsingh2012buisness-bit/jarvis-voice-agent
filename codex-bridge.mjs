import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AppError } from './core.mjs';
import { MemoryVault } from './memory.mjs';

export function findCodex() {
  if (process.env.CODEX_BINARY) return process.env.CODEX_BINARY;
  const dir=join(process.env.LOCALAPPDATA||'', 'OpenAI','Codex','bin');
  if(existsSync(dir)) for(const v of readdirSync(dir).reverse()){const p=join(dir,v,'codex.exe');if(existsSync(p))return p;}
  return 'codex';
}
export class Rpc extends EventEmitter {
  constructor(args=['app-server','--listen','stdio://']) {
    super();this.pending=new Map();this.next=0;this.closed=false;
    const env={...process.env};for(const key of ['FISH_API_KEY','GEMINI_API_KEY','XAI_API_KEY','OPENAI_API_KEY'])delete env[key];
    this.child=spawn(findCodex(),args,{env,windowsHide:true,stdio:['pipe','pipe','pipe']});
    // Never forward process stderr: it can contain provider or configuration details.
    this.child.stderr.resume();
    createInterface({input:this.child.stdout}).on('line',line=>{try{this.receive(JSON.parse(line));}catch{}});
    const closed=()=>{this.closed=true;for(const {reject,timer} of this.pending.values()){clearTimeout(timer);reject(new Error('Codex connection closed. Reconnect before continuing.'));}this.pending.clear();this.emit('closed');};
    this.child.once('error',closed);this.child.once('exit',closed);
  }
  receive(m){if(m.method){this.emit(m.id===undefined?'notification':'request',m);return;}const p=this.pending.get(m.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}
  send(m){if(this.closed)throw new Error('Codex is disconnected.');this.child.stdin.write(JSON.stringify(m)+'\n');}
  call(method,params={},timeout=60000){return new Promise((resolve,reject)=>{const id=++this.next;const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Codex request timed out; its outcome may be unknown.'));},timeout);this.pending.set(id,{resolve,reject,timer});try{this.send({id,method,params});}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}});}
  async initialize(){await this.call('initialize',{clientInfo:{name:'jarvis_voice',version:'1.0.0'},capabilities:{experimentalApi:true}});this.send({method:'initialized'});return this;}
  close(){this.child.kill();}
}

export class CodexBridge extends EventEmitter {
  constructor(dataDir,{ephemeral=false}={}) {
    super();this.dir=dataDir;this.file=join(dataDir,'voice-turns.json');this.threadFile=join(dataDir,'codex-thread.json');this.memory=new MemoryVault(process.env.JARVIS_VAULT_DIR||join(dataDir,'vault'));this.ephemeral=ephemeral;this.records=existsSync(this.file)?JSON.parse(readFileSync(this.file,'utf8')):{};this.approvals=new Map();this.active=null;this.turnOptions={};
    const saved=this.readThreadId();const configured=process.env.JARVIS_CODEX_THREAD_ID;
    this.threadId=ephemeral?null:(configured||saved||null);
    if(this.threadId)this.persistThreadId();
    for(const r of Object.values(this.records))if(!r.done){r.done=true;r.error='Server restarted. This request will not be submitted twice. Check the saved chat before repeating an action.';}
  }
  readThreadId(){try{const value=JSON.parse(readFileSync(this.threadFile,'utf8')).threadId;return typeof value==='string'&&/^[a-zA-Z0-9-]{8,80}$/.test(value)?value:null;}catch{return null;}}
  persistThreadId(){if(!this.threadId||this.ephemeral)return;mkdirSync(this.dir,{recursive:true});writeFileSync(this.threadFile+'.tmp',JSON.stringify({threadId:this.threadId}),{mode:0o600});renameSync(this.threadFile+'.tmp',this.threadFile);}
  persist(){mkdirSync(this.dir,{recursive:true});writeFileSync(this.file+'.tmp',JSON.stringify(this.records));renameSync(this.file+'.tmp',this.file);}
  status(){return {threadId:this.threadId,connected:!!this.rpc&&!this.rpc.closed,transport:'stdio',desktopLiveSync:false,active:this.active,tools:this.toolNames||[],pending:[...this.approvals.values()].map(a=>a.public)};}
  async connect(){
    if(this.rpc&&!this.rpc.closed&&this.ready)return;
    if(this.connecting)return this.connecting;
    this.connecting=(async()=>{
      this.rpc=await new Rpc().initialize();this.rpc.on('notification',m=>this.event(m));this.rpc.on('request',m=>this.request(m));
      // The ChatGPT account's desktop model selection may not be available to
      // the Codex App Server. Pin voice turns to a model the signed-in account
      // explicitly advertises instead of inheriting an unsupported selection.
      const catalog=await this.rpc.call('model/list',{});
      const models=catalog.data||[];
      const selected=models.find(m=>m.isDefault&&m.id)||models.find(m=>m.id);
      if(!selected)throw new AppError('Codex did not return an available model for this account.');
      this.turnOptions.model=selected.id;
      this.rpc.on('closed',()=>{this.ready=false;if(this.active)this.finish(this.records[this.active],'Codex disconnected. This turn will not be resubmitted automatically.');});
      if(this.ephemeral){const r=await this.rpc.call('thread/start',{ephemeral:true,cwd:this.dir,approvalPolicy:'on-request',approvalsReviewer:'user',sandbox:'workspace-write',developerInstructions:'You are a voice assistant. Reply briefly. Never claim an action succeeded without a tool result.'});this.threadId=r.thread.id;}
      else if(!this.threadId){
        const r=await this.rpc.call('thread/start',{cwd:this.dir,approvalPolicy:'on-request',approvalsReviewer:'user',sandbox:'workspace-write',developerInstructions:'You are a voice assistant. Reply briefly. Never claim an action succeeded without a tool result.'});
        this.threadId=r.thread.id;this.persistThreadId();
      } else {
        // Do not attach a second writer while a desktop turn is still running.
        const read=await this.rpc.call('thread/read',{threadId:this.threadId,includeTurns:true});
        if(read.thread.turns?.some(t=>t.status==='inProgress'))throw new AppError('This chat is still working in Codex. Wait for it to finish before using the orb.',409);
        await this.rpc.call('thread/resume',{threadId:this.threadId,excludeTurns:true,approvalPolicy:'on-request',approvalsReviewer:'user'});
      }
      this.ready=true;
      this.rpc.call('mcpServerStatus/list',{threadId:this.threadId}).then(r=>{this.toolNames=(r.data||[]).flatMap(s=>Object.keys(s.tools||{}));}).catch(()=>{});
    })().catch(e=>{this.rpc?.close();throw e;}).finally(()=>{this.connecting=null;});return this.connecting;
  }
  publish(r,type,data={}){const event={seq:r.events.length+1,type,...data};r.events.push(event);this.emit(r.id,event);}
  async start(id,text){
    if(!/^[a-zA-Z0-9-]{8,80}$/.test(id))throw new AppError('Invalid utterance ID.');
    if(this.records[id]){if(this.records[id].text!==text)throw new AppError('Utterance ID already used.',409);return this.records[id];}
    if(this.active||this.starting)throw new AppError('A voice turn is already running.',409);
    this.starting=true;
    try{
      await this.connect();
      const r={id,text,threadId:this.threadId,turnId:null,events:[],done:false,created:Date.now()};this.records[id]=r;this.active=id;this.persist();
      // Persist before dispatch. Unknown outcomes are never blindly retried.
      try{const result=await this.rpc.call('turn/start',{threadId:this.threadId,...this.turnOptions,clientUserMessageId:id,input:[{type:'text',text}],additionalContext:{jarvis_voice:{kind:'application',value:'This is a transcribed voice request. Reply naturally and briefly. Use available tools for requested actions, verify results, and never narrate success before a result. Do not read secrets aloud. The user owns a Markdown memory vault at '+this.memory.root+'. Read or update relevant durable notes with filesystem tools when requested or when recording verified project progress. The barehands board is at http://127.0.0.1:8794. GET /state reads it; POST /cmd with application/json and {"a":"present","title":"Title","body":"Markdown"} presents a note. When asked to show something on the board, use this real endpoint, verify its response, and do not pretend a queued command is visibly rendered until the board state confirms it.'},jarvis_memory:{kind:'untrusted',name:'local_memory',value:this.memory.context(text)}}});r.turnId=result.turn.id;this.persist();if(r.cancelled)await this.interrupt(id);}
      catch(e){this.finish(r,e.message);}
      return r;
    }finally{this.starting=false;}
  }
  event(m){const p=m.params||{},r=this.records[this.active];if(!r||p.threadId!==this.threadId)return;if(p.turnId&&r.turnId&&p.turnId!==r.turnId)return;
    if(m.method==='turn/started'){r.turnId=p.turn.id;this.persist();}
    if(m.method==='item/agentMessage/delta')this.publish(r,'delta',{text:p.delta,itemId:p.itemId});
    if(m.method==='item/completed'&&p.item?.type==='agentMessage')this.publish(r,'message',{text:p.item.text,itemId:p.item.id});
    if(m.method==='turn/completed'){r.turnId=p.turn.id;this.finish(r,p.turn.error?.message|| (p.turn.status==='failed'?'Codex turn failed.':null),p.turn.status);}
  }
  finish(r,error=null,status='completed'){if(!r||r.done)return;r.done=true;r.error=error;this.publish(r,error?'error':'done',{error,status,turnId:r.turnId});for(const [id,a] of this.approvals)if(a.recordId===r.id)this.approvals.delete(id);this.active=null;this.persist();try{this.memory.record(r);}catch{}}
  async command(cmd){if(this.active)throw new AppError('Stop the active turn first.',409);await this.connect();if(cmd==='/compact'){await this.rpc.call('thread/compact/start',{threadId:this.threadId});return {text:'Compaction requested. The saved conversation stays the same.'};}if(cmd.startsWith('/effort ')){const effort=cmd.slice(8);if(!['low','medium','high','xhigh'].includes(effort))throw new AppError('Unsupported effort.');this.turnOptions.effort=effort;return {text:'Effort updated.'};}if(cmd.startsWith('/model ')){const model=cmd.slice(7);const r=await this.rpc.call('model/list',{});if(!r.data?.some(m=>m.id===model||m.model===model))throw new AppError('That model is not available to this account.');this.turnOptions.model=model;return {text:'Model updated.'};}throw new AppError('This command is unavailable. The persistent chat has been preserved.');}
  request(m){const r=this.records[this.active];if(!r){this.rpc.send({id:m.id,error:{code:-32601,message:'No active voice turn to handle this request.'}});return;}
    const supported=['item/commandExecution/requestApproval','item/fileChange/requestApproval','item/tool/requestUserInput','item/permissions/requestApproval'];
    if(!supported.includes(m.method)){this.rpc.send({id:m.id,error:{code:-32601,message:'This approval or tool requires the Codex desktop client. Not auto-approved.'}});this.publish(r,'notice',{text:'This action needs an interaction supported by the Codex desktop app.'});return;}
    const key=String(m.id),pub={id:key,method:m.method,params:m.params};this.approvals.set(key,{rpcId:m.id,recordId:r.id,public:pub});this.publish(r,'approval',pub);
  }
  answer(id,answer){const a=this.approvals.get(String(id));if(!a)throw new AppError('This request is no longer pending.',409);let result;
    if(a.public.method==='item/tool/requestUserInput'){if(!answer.answers||typeof answer.answers!=='object')throw new AppError('Answer the question.');result={answers:answer.answers};}
    else if(a.public.method==='item/permissions/requestApproval'){if(!['accept','decline'].includes(answer.decision))throw new AppError('Choose allow once or deny.');result={permissions:answer.decision==='accept'?a.public.params.permissions:{},scope:'turn'};}
    else{if(!['accept','decline'].includes(answer.decision))throw new AppError('Choose allow once or deny.');result={decision:answer.decision};}
    this.rpc.send({id:a.rpcId,result});this.approvals.delete(String(id));return {ok:true};
  }
  async interrupt(id){const r=this.records[id];if(!r||r.done)return {ok:true};r.cancelled=true;for(const [key,a] of this.approvals)if(a.recordId===id){if(a.public.method==='item/tool/requestUserInput')this.answer(key,{answers:{}});else this.answer(key,{decision:'decline'});}if(r.turnId)await this.rpc.call('turn/interrupt',{threadId:this.threadId,turnId:r.turnId});return {ok:true};}
}

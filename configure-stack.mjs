import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
const root=dirname(fileURLToPath(import.meta.url));
for(const dir of ['.data/signals','.data/vault','.runtime/temp'])mkdirSync(join(root,dir),{recursive:true});
const save=(path,value)=>{const full=join(root,path);if(!existsSync(full))writeFileSync(full,JSON.stringify(value,null,2));};
save('stack/backtalk/backtalk.json',{agent_dir:root,name:'Jarvis',bridge_url:'http://127.0.0.1:4320',model:'',deep_model:'',ptt_key:'home',mic_mode:'wake',wake_word_enabled:true,permission_mode:'ask',resume_last_session:true,voice:'bm_lewis',stt_model:'small.en',stt_device:'cpu',stt_compute:'int8',signals_dir:join(root,'.data/signals'),barehands_state_dir:join(root,'stack/barehands/state'),thinking_sound:'',greeting:'Jarvis is ready. Say Hey Jarvis, followed by your request.',greeting_open_mic:'Jarvis is ready. Hands-free listening is on.',tts_engine:'fish',extra_dirs:[join(root,'.data/vault')]});
save('stack/barehands/barehands.json',{name:'Jarvis',port:8794,orbs:[{title:'Memory',path:join(root,'.data/vault'),kind:'notes'},{title:'Getting Started',path:'sample-notes',kind:'notes'},{title:'Props',path:'media',kind:'media'}]});
save('stack/ai-visualizer/ai-visualizer.json',{name:'Jarvis',face:'board',bus_dir:join(root,'.data/signals'),thinking_sound:true});

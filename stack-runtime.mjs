// Original upstream visual assets are served unchanged. SPDX-License-Identifier: AGPL-3.0-or-later
import {readFileSync,existsSync,statSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
const mime={'.js':'text/javascript','.html':'text/html','.png':'image/png','.wav':'audio/wav','.ttf':'font/ttf','.json':'application/json','.txt':'text/plain'};
export function stackRoute(root,req,res,url){if(req.method!=='GET')return false;const visual=join(root,'stack','ai-visualizer'),bus=join(root,'.data','signals');
 const send=(body,type='application/json')=>{res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(type==='application/json'?JSON.stringify(body):body);};
 if(url.pathname==='/'){res.writeHead(302,{Location:'/faces/board/'});res.end();return true;}
 if(url.pathname==='/config'){send({name:'Jarvis',face:'board',thinking_sound:true,badge:'',faces:['board','radial','rain','neural'].map(id=>({id,...JSON.parse(readFileSync(join(visual,'faces',id,'face.json'),'utf8'))}))});return true;}
 if(url.pathname==='/state'){
   let state='idle',samples=Array(64).fill(0),level=0,loading=false;
   try{const file=join(bus,'.voice_state');if(Date.now()-statSync(file).mtimeMs<600000)state=readFileSync(file,'utf8').trim();}catch{}
   if(!['idle','listening','thinking','speaking'].includes(state))state='idle';
   try{const wave=JSON.parse(readFileSync(join(bus,'.voice_waveform'),'utf8'));if(Date.now()/1000-wave.ts<.8){samples=wave.samples.slice(0,64).map(x=>Number(x)||0);level=Math.min(1,samples.reduce((s,v)=>s+Math.abs(v),0)/Math.max(1,samples.length)/3000);if(level>0)state='speaking';}}catch{}
   loading=existsSync(join(bus,'.voice_loading_pid'));send({state,samples,level,loading,alert:false});return true;
 }
 let rel=url.pathname==='/gallery'?'index.html':url.pathname.slice(1);if(!(rel==='index.html'||rel==='core.js'||/^faces\/(board|radial|rain|neural)\/(index.html)?$/.test(rel)||/^assets\/[\w.-]+$/.test(rel)))return false;
 if(rel.endsWith('/'))rel+='index.html';const path=resolve(visual,rel);if(!path.startsWith(resolve(visual)+sep)||!existsSync(path)||!statSync(path).isFile())return false;
 const ext=path.slice(path.lastIndexOf('.'));if(!mime[ext])return false;
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; media-src 'self' blob:; font-src 'self'; frame-ancestors 'none'; base-uri 'self'");send(readFileSync(path),mime[ext]);return true;
}

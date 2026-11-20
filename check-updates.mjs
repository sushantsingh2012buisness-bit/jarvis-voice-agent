import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const lock=JSON.parse(readFileSync(new URL('./stack/upstream-lock.json',import.meta.url),'utf8'));
for(const [name,item] of Object.entries(lock)){const r=spawnSync('git',['ls-remote',item.url,'HEAD'],{encoding:'utf8',windowsHide:true});const sha=r.stdout.trim().split(/\s/)[0];console.log(name,r.status===0?(sha===item.commit?'up to date':`update available: ${item.commit.slice(0,8)} -> ${sha.slice(0,8)}`):'could not check');}
console.log('Updates are not applied automatically. The Codex adapter and your memory stay intact.');

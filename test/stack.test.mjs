import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MemoryVault} from '../memory.mjs';
test('memory persists daily turns once and retrieves relevant project notes',t=>{const dir=mkdtempSync(join(tmpdir(),'jarvis-vault-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const vault=new MemoryVault(dir);writeFileSync(join(dir,'02 - Jarvis','Test.md'),'The calibration code is amber-seven.');assert.match(vault.context('What is the calibration code?'),/amber-seven/);const r={id:'unique-turn',text:'Test request',created:Date.now(),events:[{type:'message',text:'Test reply'}]};vault.record(r);vault.record(r);const again=new MemoryVault(dir);assert.match(again.context('calibration'),/amber-seven/);});
test('original visualizer scenes and shared core are present with upstream attribution',()=>{for(const name of ['board','radial','rain','neural']){const html=readFileSync(new URL(`../stack/ai-visualizer/faces/${name}/index.html`,import.meta.url),'utf8');assert.match(html,/Jared Rhodenizer/);assert.match(html,/AGPL-3.0-or-later/);assert.match(html,/AV\./);}assert.ok(JSON.parse(readFileSync(new URL('../stack/upstream-lock.json',import.meta.url),'utf8'))['ai-visualizer'].commit);});

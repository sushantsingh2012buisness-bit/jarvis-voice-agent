"""Codex adapter for backtalk. SPDX-License-Identifier: AGPL-3.0-or-later.

Uses Jarvis's authenticated local bridge; never reads or copies auth tokens.
The local server owns the one saved conversation and its approval policy.
"""
import asyncio
import json
import re
import uuid
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace
import httpx
from backtalk.config import CFG

SESSION_FILE = str(Path(CFG['signals_dir']) / '.backtalk_session')

@dataclass
class PermissionResultAllow:
    behavior: str = 'allow'
    message: str = ''

@dataclass
class PermissionResultDeny:
    behavior: str = 'deny'
    message: str = ''
    interrupt: bool = False

class WarmBrain:
    def __init__(self, model=None, can_use_tool=None, resume_id=None):
        self.model=model or 'Codex account default'
        self.gate=can_use_tool
        self.client=None
        self.csrf=None
        self.active=None
        self.session={'turns':0,'out_tokens':0,'in_tokens':0,'cost':0.0}
        self.base=CFG.get('bridge_url','http://127.0.0.1:4317')
        if not re.fullmatch(r'http://127\.0\.0\.1:\d+',self.base):
            raise ValueError('The Codex bridge must be on local loopback.')

    async def start(self):
        self.client=httpx.AsyncClient(base_url=self.base,timeout=httpx.Timeout(120,read=120),trust_env=False)
        r=await self.client.get('/api/status');r.raise_for_status();self.csrf=r.json()['csrf']
        Path(SESSION_FILE).write_text(r.json()['codex']['threadId'])

    async def post(self,path,body):
        r=await self.client.post(path,json=body,headers={'X-Jarvis-Token':self.csrf})
        if r.status_code==403:
            status=await self.client.get('/api/status');status.raise_for_status();self.csrf=status.json()['csrf']
            r=await self.client.post(path,json=body,headers={'X-Jarvis-Token':self.csrf})
        if r.is_error:raise RuntimeError(r.json().get('error','Local bridge request failed.'))
        return r.json()

    async def set_permission_mode(self,mode):
        if mode!='ask':raise ValueError('Codex permissions stay enabled.')

    async def context_usage(self):return None

    async def command(self,cmd):
        try:return (await self.post('/api/voice/command',{'command':cmd}))['text']
        except Exception as e:return 'error: '+str(e)

    async def interrupt(self):
        if self.active:await self.post('/api/voice/cancel',{'id':self.active})

    async def reset_turn(self,timeout=8):
        if self.active:await self.interrupt()
        for _ in range(int(timeout*4)):
            r=await self.client.get('/api/status');r.raise_for_status()
            if not r.json()['codex']['active']:self.active=None;return
            await asyncio.sleep(.25)
        raise RuntimeError('The previous turn is still stopping; it was not resubmitted.')

    async def stop(self):
        try:await self.interrupt()
        finally:
            if self.client:await self.client.aclose()

    async def _approval(self,event):
        p=event.get('params',{});method=event['method']
        if method=='item/tool/requestUserInput':
            answers={}
            for q in p.get('questions',[]):
                if self.gate:
                    result=await self.gate('CodexQuestion',{'question':q['question'],'options':q.get('options')},SimpleNamespace(description=q['question']))
                    answers[q['id']]={'answers':[getattr(result,'message','')]}
            await self.post('/api/voice/answer',{'id':event['id'],'answers':answers});return
        tool='Bash' if 'commandExecution' in method else 'Write' if 'fileChange' in method else 'Codex permission'
        detail={'command':p.get('command') or json.dumps(p,ensure_ascii=False),'file_path':p.get('grantRoot','requested files')}
        result=await self.gate(tool,detail,SimpleNamespace(description=p.get('reason','Review this requested action.'))) if self.gate else PermissionResultDeny()
        await self.post('/api/voice/answer',{'id':event['id'],'decision':'accept' if result.behavior=='allow' else 'decline'})

    async def ask_stream(self,utterance):
        request_id=str(uuid.uuid4());self.active=request_id
        # Preserve the request identity before sending. Never retry with a new ID.
        pending=Path(CFG['signals_dir'])/'.codex_pending.json'
        pending.write_text(json.dumps({'id':request_id,'text':utterance}),encoding='utf-8')
        await self.post('/api/voice/start',{'id':request_id,'text':utterance})
        after=0;buf='';seen=set();retries=0
        while True:
            try:
                async with self.client.stream('GET','/api/voice/events',params={'id':request_id,'token':self.csrf,'after':after}) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line.startswith('data: '):continue
                        e=json.loads(line[6:]);kind=e['type']
                        if kind=='snapshot':
                            for item in e.get('pending',[]):await self._approval(item)
                            if e.get('done'):
                                self.active=None;pending.unlink(missing_ok=True)
                                if e.get('error'):raise RuntimeError(e['error'])
                                return
                            continue
                        if e['seq']<=after:continue
                        after=e['seq']
                        if kind=='delta':
                            seen.add(e.get('itemId'));buf+=e['text']
                            while True:
                                m=re.search(r'(?<=[.!?])\s',buf)
                                if not m:break
                                phrase,buf=buf[:m.end()],buf[m.end():]
                                if phrase.strip():yield phrase.strip()
                        elif kind=='message':
                            if e.get('itemId') not in seen:buf+=e['text']
                            if buf.strip():yield buf.strip()
                            buf=''
                        elif kind=='approval':await self._approval(e)
                        elif kind in ('done','error'):
                            self.active=None;pending.unlink(missing_ok=True)
                            if kind=='error':raise RuntimeError(e['error'])
                            if buf.strip():yield buf.strip()
                            self.session['turns']+=1
                            return
                raise httpx.ReadError('Event stream ended before completion.')
            except (httpx.TransportError,httpx.HTTPStatusError):
                retries+=1
                if retries>3:raise RuntimeError('Connection lost. Check the saved chat before repeating this request.')
                await asyncio.sleep(min(retries,3))

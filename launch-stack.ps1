param([ValidateSet('browser','voice','hands','chat','stop')][string]$Mode='browser')
$ErrorActionPreference='Stop'
$jarvisRoot=$PSScriptRoot
& node (Join-Path $jarvisRoot 'configure-stack.mjs')
$jarvisData=Join-Path $jarvisRoot '.data'
$jarvisPython=Join-Path $jarvisRoot '.runtime/voice/Scripts/python.exe'
$jarvisRegistry=Join-Path $jarvisData 'processes.json'
New-Item -ItemType Directory -Force $jarvisData | Out-Null
$jarvisProcesses=@{}
if(Test-Path $jarvisRegistry){$saved=Get-Content -Raw $jarvisRegistry|ConvertFrom-Json;foreach($prop in $saved.PSObject.Properties){$jarvisProcesses[$prop.Name]=$prop.Value}}
function Test-OwnedProcess($entry){
 if(-not $entry){return $false}
 $process=Get-CimInstance Win32_Process -Filter "ProcessId = $($entry.pid)"
 if(-not $process -or -not $process.CreationDate -or -not $process.CommandLine){return $false}
 return ([string]$process.CreationDate.ToUniversalTime().Ticks -eq [string]$entry.createdTicks -and $process.CommandLine.Contains($entry.marker))
}
if($Mode -eq 'stop'){
 try{$status=Invoke-RestMethod -Uri 'http://127.0.0.1:4320/api/status' -TimeoutSec 2;if($status.codex.active){Invoke-RestMethod -Uri 'http://127.0.0.1:4320/api/voice/cancel' -Method Post -ContentType 'application/json' -Headers @{'X-Jarvis-Token'=$status.csrf} -Body (@{id=$status.codex.active}|ConvertTo-Json) -TimeoutSec 5|Out-Null}}catch{}
 foreach($entry in $jarvisProcesses.Values){
  foreach($child in @($entry.children)){if(Test-OwnedProcess $child){Stop-Process -Id $child.pid -ErrorAction SilentlyContinue}}
  if(Test-OwnedProcess $entry){Stop-Process -Id $entry.pid -ErrorAction SilentlyContinue}
 }
 '{}'|Set-Content $jarvisRegistry
 exit
}
if($Mode -eq 'browser' -and $jarvisProcesses.ContainsKey('voice')){
 foreach($child in @($jarvisProcesses['voice'].children)){if(Test-OwnedProcess $child){Stop-Process -Id $child.pid -ErrorAction SilentlyContinue}}
 if(Test-OwnedProcess $jarvisProcesses['voice']){Stop-Process -Id $jarvisProcesses['voice'].pid -ErrorAction SilentlyContinue}
 $jarvisProcesses.Remove('voice')
 $jarvisProcesses|ConvertTo-Json -Depth 5|Set-Content $jarvisRegistry
}
if(-not(Test-Path $jarvisPython) -and $Mode -in @('voice','hands')){throw 'Run Install Local Voice.cmd once to install the local speech runtime.'}
$env:HF_HOME=Join-Path $jarvisRoot '.runtime/models'
$env:HF_HUB_DISABLE_SYMLINKS_WARNING='1'
$env:PYTHONUTF8='1'
$env:PYTHONUNBUFFERED='1'
$env:TEMP=Join-Path $jarvisRoot '.runtime/temp'
$env:TMP=$env:TEMP
New-Item -ItemType Directory -Force $env:TEMP | Out-Null
function Start-Owned($name,$exe,$arguments,$cwd,$marker){
 if(Test-OwnedProcess $jarvisProcesses[$name]){return}
 $p=Start-Process -FilePath $exe -ArgumentList $arguments -WorkingDirectory $cwd -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $jarvisData "$name.log") -RedirectStandardError (Join-Path $jarvisData "$name-error.log")
 $info=Get-CimInstance Win32_Process -Filter "ProcessId = $($p.Id)"
 Start-Sleep -Milliseconds 500
 $children=@(Get-CimInstance Win32_Process -Filter "ParentProcessId = $($p.Id)" | Where-Object {$_.CommandLine -and $_.CommandLine.Contains($marker)} | ForEach-Object {@{pid=$_.ProcessId;createdTicks=[string]$_.CreationDate.ToUniversalTime().Ticks;marker=$marker}})
 $jarvisProcesses[$name]=@{pid=$p.Id;createdTicks=[string]$info.CreationDate.ToUniversalTime().Ticks;marker=$marker;children=$children}
 $jarvisProcesses|ConvertTo-Json -Depth 5|Set-Content $jarvisRegistry
}
$running=$false
try{$s=Invoke-RestMethod -Uri 'http://127.0.0.1:4320/api/status' -TimeoutSec 2;$running=($null -ne $s.csrf -and $null -ne $s.codex)}catch{}
if(-not $running){Start-Owned 'server' (Get-Command node).Source ('"'+(Join-Path $jarvisRoot 'server.mjs')+'"') $jarvisRoot 'server.mjs';Start-Sleep -Seconds 1}
$boardRunning=$false
try{$b=Invoke-RestMethod -Uri 'http://127.0.0.1:8794/config' -TimeoutSec 2;$boardRunning=($b.name -eq 'Jarvis')}catch{}
if((Test-Path $jarvisPython) -and -not $boardRunning){Start-Owned 'barehands' $jarvisPython ('"'+(Join-Path $jarvisRoot 'stack/barehands/server.py')+'"') (Join-Path $jarvisRoot 'stack/barehands') 'barehands'}
if($Mode -eq 'chat'){
 $codex=Get-ChildItem (Join-Path $env:LOCALAPPDATA 'OpenAI/Codex/bin') -Filter codex.exe -Recurse|Sort-Object LastWriteTime -Descending|Select-Object -First 1
 if(-not $codex){throw 'Sign in to Codex first.'}
 $threadFile=Join-Path $jarvisData 'codex-thread.json'
 if(-not(Test-Path $threadFile)){throw 'The dedicated Jarvis chat has not been created yet. Start voice mode and say Hey Jarvis once first.'}
 $threadId=(Get-Content -Raw $threadFile|ConvertFrom-Json).threadId
 if(-not $threadId){throw 'Jarvis has no saved Codex chat ID yet. Start voice mode and say Hey Jarvis once first.'}
 & $codex.FullName resume $threadId
 exit
}
if($Mode -eq 'voice'){Start-Owned 'voice' $jarvisPython '-m backtalk.main' (Join-Path $jarvisRoot 'stack/backtalk') 'backtalk.main'}
$url=switch($Mode){'hands'{'http://127.0.0.1:8794/stage.html'} 'voice'{'http://127.0.0.1:4320/faces/board/'} default{'http://127.0.0.1:4320/'}}
Write-Output "Jarvis is running. Open $url. In the browser, click the core once to enable microphone access, then say Hey Jarvis."

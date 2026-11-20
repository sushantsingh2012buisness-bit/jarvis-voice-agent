$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
node configure-stack.mjs
$env:UV_PYTHON_INSTALL_DIR=Join-Path $PSScriptRoot '.runtime/python'
$env:UV_CACHE_DIR=Join-Path $PSScriptRoot '.runtime/cache'
$env:HF_HOME=Join-Path $PSScriptRoot '.runtime/models'
$env:HF_HUB_DISABLE_SYMLINKS_WARNING='1'
python -m pip install --target .runtime/uv uv==0.13.7
if($LASTEXITCODE -ne 0){throw 'Could not install the isolated runtime manager.'}
$jarvisUv=Join-Path $PSScriptRoot '.runtime/uv/bin/uv.exe'
& $jarvisUv venv --python 3.12 .runtime/voice
if($LASTEXITCODE -ne 0){throw 'Could not create the Python runtime.'}
& $jarvisUv pip install --python .runtime/voice/Scripts/python.exe -r requirements-voice.lock
if($LASTEXITCODE -ne 0){throw 'Could not install speech dependencies.'}
Write-Output 'Local speech runtime installed. Talk to Jarvis.cmd starts the stack. Models download on first use.'

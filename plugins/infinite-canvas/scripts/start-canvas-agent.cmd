@echo off
setlocal

set "CANVAS_AGENT_BUNDLE=%~dp0..\mcp\server.bundle.mjs"
set "CODEX_RUNTIME_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%CODEX_RUNTIME_NODE%" (
  "%CODEX_RUNTIME_NODE%" "%CANVAS_AGENT_BUNDLE%"
  exit /b %ERRORLEVEL%
)

where node.exe >nul 2>nul
if not errorlevel 1 (
  node.exe "%CANVAS_AGENT_BUNDLE%"
  exit /b %ERRORLEVEL%
)

echo Infinite Canvas could not find the Codex runtime node.exe or a system node.exe. 1>&2
exit /b 127

@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install
)
start "" http://localhost:5386
call npm run dev -- --port 5386

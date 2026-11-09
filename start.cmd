@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo Thieu .venv\Scripts\python.exe
  exit /b 1
)

for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8765" ^| findstr "LISTENING"') do (
  echo Dung server cu PID %%p tren cong 8765...
  taskkill /PID %%p /F >nul 2>&1
)

echo TTS  http://127.0.0.1:8765
start "Speech TTS :8765" "%cd%\.venv\Scripts\python.exe" app.py serve

cd FrontEnd
if not exist "node_modules" (
  echo Dang npm install...
  call npm install
)

echo UI   http://localhost:5173
call npm run dev

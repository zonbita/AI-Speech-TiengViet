@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo Thieu .venv\Scripts\python.exe
  pause
  exit /b 1
)

rem Dung server cu tren cong 8765 va 5173
for %%P in (8765 5173) do (
  for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%%P " ^| findstr "LISTENING"') do (
    taskkill /PID %%p /F >nul 2>&1
  )
)

echo Khoi dong TTS server  http://127.0.0.1:8765
start "Speech TTS :8765" "%cd%\.venv\Scripts\python.exe" app.py serve

cd FrontEnd
if not exist "node_modules" (
  echo Dang npm install...
  call npm install
)

echo Khoi dong giao dien  http://localhost:5173
start "Speech UI :5173" cmd /c "npm run dev"

echo Doi giao dien san sang...
:wait
timeout /t 1 /nobreak >nul
netstat -ano | findstr ":5173 " | findstr "LISTENING" >nul || goto wait

start "" "http://localhost:5173"
echo Da mo trinh duyet. Co the dong cua so nay.
timeout /t 3 >nul

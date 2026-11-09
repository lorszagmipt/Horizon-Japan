@echo off
cd /d "%~dp0"
where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
if not exist node_modules\peerjs (
  echo Installing libraries: Vite and PeerJS for online play...
  call npm install
)
rem If the game server is already running (port 5173 busy), just open the game in the browser.
netstat -ano | findstr /r /c:":5173 .*LISTENING" >nul
if not errorlevel 1 (
  echo The game is already running. Opening http://localhost:5173 ...
  start "" http://localhost:5173
  timeout /t 3 >nul
  exit /b 0
)
call npm run dev -- --open
pause

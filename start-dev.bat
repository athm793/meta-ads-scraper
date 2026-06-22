@echo off
REM Launch the Meta Ads Scraper locally. Portable — runs from wherever this file lives.
cd /d "%~dp0"
if not exist "node_modules" (
  echo Installing dependencies for first run...
  call npm install
)
start cmd /k "npm run dev"
timeout /t 6 /nobreak >nul
start "" "http://localhost:3000"

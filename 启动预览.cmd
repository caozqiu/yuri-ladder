@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo 请先安装 Node.js 22.22.3，然后重新打开。
  pause
  exit /b 1
)
echo 预览地址：http://127.0.0.1:5188/
echo 按 Ctrl+C 停止预览。
node scripts/preview.mjs
pause

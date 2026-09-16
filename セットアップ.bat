@echo off
chcp 65001 >nul
REM Windows用: ダブルクリックでコマンドプロンプトが開き、セットアップが始まります。
REM ⚠ 「WindowsによってPCが保護されました」と出たら、「詳細情報」→「実行」。
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js が入っていません。
  echo https://nodejs.org/ja を開いて「推奨版」を入れてから、もう一度ダブルクリックしてください。
  echo.
  pause
  exit /b 1
)
node tools\setup.mjs %*
echo.
pause

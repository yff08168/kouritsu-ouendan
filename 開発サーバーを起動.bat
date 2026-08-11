@echo off
rem 公立応援団 開発サーバー起動
rem Node.js はポータブル版を使うため、このバッチの中だけで PATH を通す。
rem （システムの環境変数は変更していない）

set "NODE_DIR=C:\Users\81809\tools\node-v24.19.0-win-x64"

if not exist "%NODE_DIR%\node.exe" (
  echo [エラー] Node.js が見つかりません: %NODE_DIR%
  pause
  exit /b 1
)

set "PATH=%NODE_DIR%;%PATH%"
cd /d "%~dp0"

echo 開発サーバーを起動します。ブラウザで http://localhost:3000 を開いてください。
echo 停止するには Ctrl+C を押してください。
echo.

call npm run dev
pause

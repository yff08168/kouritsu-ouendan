@echo off
chcp 65001 >nul
setlocal

:menu
cls
echo ============================================
echo  Supabase SQL Editor に貼り付ける SQL を
echo  クリップボードにコピーします
echo ============================================
echo.
echo  この順番で実行してください
echo.
echo   [1] 0001_init.sql   ... テーブル作成
echo   [2] 0002_rls.sql    ... セキュリティ設定
echo   [3] seed.sql        ... サンプルデータ
echo.
echo   [Q] 終了
echo.
set "choice="
set /p choice="番号を入力して Enter: "

if /i "%choice%"=="1" set "target=%~dp0supabase\migrations\0001_init.sql" & goto copy
if /i "%choice%"=="2" set "target=%~dp0supabase\migrations\0002_rls.sql" & goto copy
if /i "%choice%"=="3" set "target=%~dp0supabase\seed.sql" & goto copy
if /i "%choice%"=="Q" exit /b 0
goto menu

:copy
if not exist "%target%" (
  echo.
  echo [エラー] ファイルが見つかりません: %target%
  echo.
  pause
  goto menu
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content -Raw -Encoding UTF8 '%target%' | Set-Clipboard"

echo.
echo  コピーしました。
echo.
echo  Supabase の SQL Editor で Ctrl+V を押して貼り付け、
echo  右下の RUN ボタン（または Ctrl+Enter）で実行してください。
echo.
pause
goto menu

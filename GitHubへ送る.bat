@echo off
setlocal
rem ------------------------------------------------------------------
rem 公立応援団 いまの作業を GitHub に送る（2026-08-26 用・1回きり）
rem
rem このファイルは Shift_JIS + CRLF で保存すること。
rem UTF-8 で保存すると cmd が文字化けして、コメント行までコマンドとして
rem 実行しようとする（実際にそうなった）。
rem
rem 送り終わったら、このファイルは削除して構わない。
rem ------------------------------------------------------------------

cd /d "%~dp0"

set "GIT=git"
where git >nul 2>&1
if errorlevel 1 set "GIT=C:\Program Files\Git\cmd\git.exe"

echo ============================================================
echo  GitHub の main を、この PC の内容で置き換えます
echo ============================================================
echo.
echo  送るもの   : 8月14日以降の作業
echo               （地方大会の遡り・甲子園の大会ページ・直接対決・
echo                 自動更新のワークフロー）
echo  消えるもの : GitHub 側の自動更新 13 件
echo               backup-auto-updates-20260826 に保存済みなので戻せます
echo.

set "ANSWER="
set /p ANSWER="実行しますか？ (Y = 実行 / それ以外 = 中止): "
if /i not "%ANSWER%"=="Y" goto :cancel

echo.
echo GitHub の最新の状態を確認しています...
"%GIT%" fetch origin
if errorlevel 1 goto :nonet

echo.
echo 送っています...
"%GIT%" push --force-with-lease origin main
if errorlevel 1 goto :failed

echo.
echo ============================================================
echo  送信できました
echo ============================================================
echo.
echo  このあと自動で動くもの
echo    結果速報 ............ 3時間おき
echo    地方大会 ............ 1日2回（19時・22時）
echo    甲子園の大会記録 .... 毎月1日の朝5時（今回追加）
echo.
echo  すぐ試すには GitHub の Actions タブ から Run workflow
echo.
pause
exit /b 0

:cancel
echo.
echo 中止しました。何も変更していません。
pause
exit /b 0

:nonet
echo.
echo [失敗] GitHub に接続できませんでした。
echo        ネットにつながっているか確認して、もう一度実行してください。
pause
exit /b 1

:failed
echo.
echo [失敗] 送れませんでした。
echo.
echo   よくある原因
echo     ・送る直前に自動更新が走った
echo         → もう一度このファイルを実行すれば大抵通ります
echo     ・GitHub のログインを求められた
echo         → 開いた画面でサインインしてから、もう一度実行
echo.
pause
exit /b 1

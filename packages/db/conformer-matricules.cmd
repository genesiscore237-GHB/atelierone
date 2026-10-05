@echo off
rem === Conformite des matricules GPJ-YYYY-NNNN (idempotent) ===
chcp 65001 >nul
setlocal
set "HERE=%~dp0"
set "OUT=%HERE%matricules-resultat.txt"
cd /d "%HERE%"

echo Conformite des matricules...
call pnpm --filter "@atelierone/db" migrate:matricules > "%OUT%" 2>&1
set "CODE=%ERRORLEVEL%"
echo.
echo ------------------------------------------------------------
type "%OUT%"
echo ------------------------------------------------------------
if not "%CODE%"=="0" (
  echo Echec partiel - details : %OUT%
) else (
  echo OK - matriEcules conformes. Resultat : %OUT%
)
echo.
pause
endlocal

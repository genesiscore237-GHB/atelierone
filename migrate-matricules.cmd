@echo off
rem ============================================================
rem  Migration des matricules -> GPJ-YYYY-NNNN (idempotent)
rem  Double-clic : pas de console corrompue, encodage UTF-8 force.
rem ============================================================
chcp 65001 >nul
setlocal EnableExtensions
set "ROOT=%~dp0"
set "LOG=%TEMP%\migrate-matricules-gpj.log"
cd /d "%ROOT%"

echo [OK] Lancement de la conformite des matricules GPJ-YYYY-NNNN...
echo.
echo Chemin racine : %ROOT%
echo.

rem Verrouille le codepage pour que pnpm affiche bien l'UTF-8
call pnpm --filter "@atelierone/db" migrate:matricules 1> "%LOG%" 2>&1
set "CODE=%ERRORLEVEL%"

echo.
echo ============================================================
if "%CODE%"=="0" (
  echo  RAPPORT (voir aussi %LOG%)
  echo ============================================================
  type "%LOG%"
  echo.
  echo  Succes : matricules conformes. Aucun seed a relancer apres.
) else (
  echo  ERREUR (code %CODE%). Voir le log complet^:
  echo  %LOG%
  echo ============================================================
  type "%LOG%"
)
echo.
pause
endlocal

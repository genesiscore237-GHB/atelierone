$ErrorActionPreference='Continue'
$out=Join-Path $env:TEMP 'finalboot.out'
$log=Join-Path $env:TEMP 'finalboot.err'
Remove-Item $out,$log -Force -ErrorAction SilentlyContinue
$tok=Join-Path $env:TEMP 'finalboot.tok'
$dev=Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev' -RedirectStandardOutput $out -RedirectStandardError $log -PassThru -WindowStyle Hidden
$deadline=(Get-Date).AddSeconds(170)
$verdict='TIMEOUT-170'
$scanlines = @('✓ Ready','Ready in','Local:','Attempted import error','Module not found','not exported','SyntaxError','Error: listen','error','Error:','Module build failed','Failed to compile')
while((Get-Date) -lt $deadline){
  Start-Sleep -Seconds 3
  $t=''; if(Test-Path $out){$t=Get-Content -Raw -LiteralPath $out}
  $e=''; if(Test-Path $log){$e=Get-Content -Raw -LiteralPath $log}
  $m=[regex]::Matches($t + "`n" + $e, '(?im)^.*(?:(?:✓ Ready|Ready in|Local:)|\b(?:Attempted import error|Module not found|not exported|SyntaxError|Error:|Failed to compile|Module build failed)).*$')
  if($m.Count -gt 0){ $verdict=($m | ForEach-Object { $_.Value } | Select-Object -Last 14) -join "`n"; break }
}
"=== spreadheet lines ($($verdict.Count) matches) ==="
"$verdict"
"--- alive=$(-not $dev.HasExited) pid=$($dev.Id) ---"
"STDERR fin:"
if(Test-Path $log){ Get-Content -LiteralPath $log -Tail 8 }
"--- nettoyage ---"
Stop-Process -Id $dev.Id -Force -ErrorAction SilentlyContinue
Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -match 'nodejs' } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 1200
$left=Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if($left){ $left.OwningProcess|Select-Object -Unique|ForEach-Object{ Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }; Start-Sleep -Milliseconds 800 }
"[port3000 aprés nettoiement: " + $(if(Get-NetTCPConnection -LocalPort 3000 -State Listen -EA SilentlyContinue){'occupé'}else{'libre'}) + ']'
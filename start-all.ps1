# Arranca os dois servidores do Dashboard Opticalia em background (sem janelas):
#   1) WAHA/Baileys (WhatsApp + agendador de alertas) na porta 3001
#   2) App Next.js na porta 3000
# Logs em logs\. Idempotente: nao duplica se a porta ja estiver ocupada.

$ErrorActionPreference = "SilentlyContinue"
$root = $PSScriptRoot
$logs = Join-Path $root "logs"
if (-not (Test-Path $logs)) { New-Item -ItemType Directory -Path $logs | Out-Null }

function Port-Busy([int]$p) {
  return [bool](Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue)
}

# 1) WAHA / Baileys (porta 3001)
if (Port-Busy 3001) {
  Write-Host "WAHA ja a correr (porta 3001)."
} else {
  Start-Process -FilePath "node" -ArgumentList "baileys-server.mjs" `
    -WorkingDirectory (Join-Path $root "waha") -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logs "waha.out.log") `
    -RedirectStandardError  (Join-Path $logs "waha.err.log")
  Write-Host "WAHA iniciado."
}

# 2) App Next.js (porta 3000)
if (Port-Busy 3000) {
  Write-Host "App ja a correr (porta 3000)."
} else {
  $npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
  if (-not $npm) { $npm = "npm.cmd" }
  Start-Process -FilePath $npm -ArgumentList "run","dev" `
    -WorkingDirectory (Join-Path $root "app") -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logs "app.out.log") `
    -RedirectStandardError  (Join-Path $logs "app.err.log")
  Write-Host "App iniciada."
}

Write-Host "Pronto. App: http://localhost:3000  |  WAHA/QR: http://localhost:3001"

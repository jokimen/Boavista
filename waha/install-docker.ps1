# Instalacao do Docker Desktop + WSL2 para correr o WAHA.
# CORRER COMO ADMINISTRADOR. Pode pedir reinicio a meio.
#
# Atalho para lancar elevado (numa PowerShell normal):
#   Start-Process powershell -Verb RunAs -ArgumentList '-ExecutionPolicy Bypass -File "F:\Claude\claude_code\Dashboard OpticaliaBoavista\waha\install-docker.ps1"'

$ErrorActionPreference = "Stop"

function Assert-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Host "ERRO: corre este script como ADMINISTRADOR." -ForegroundColor Red
        exit 1
    }
}

Assert-Admin

Write-Host "==> 1/3 A instalar/ativar WSL2..." -ForegroundColor Cyan
# Em Win10 recente, 'wsl --install' ativa as features e instala o kernel.
wsl --install --no-distribution
# Se a linha acima pedir reinicio, REINICIA e volta a correr este script.

Write-Host "==> 2/3 A instalar o Docker Desktop (winget)..." -ForegroundColor Cyan
winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements

Write-Host "==> 3/3 Concluido." -ForegroundColor Green
Write-Host ""
Write-Host "PROXIMOS PASSOS:" -ForegroundColor Yellow
Write-Host "  1. Se foi pedido reinicio, reinicia o PC."
Write-Host "  2. Abre o Docker Desktop uma vez e espera por 'Engine running'."
Write-Host "  3. Diz ao Claude para continuar - ele faz 'docker compose up -d' e o resto."

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend = Join-Path $root "backend"
$py = Join-Path $backend "venv\Scripts\python.exe"

$cf = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
if (-not (Test-Path $cf)) {
    $found = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
    if ($found) { $cf = $found }
}

if (-not (Test-Path $py)) { Write-Host "can't find the venv python at $py" -ForegroundColor Red; Read-Host "enter to exit"; exit 1 }
if (-not (Test-Path $cf)) { Write-Host "cloudflared not found. install it: winget install Cloudflare.cloudflared" -ForegroundColor Red; Read-Host "enter to exit"; exit 1 }

Write-Host "starting backend on 127.0.0.1:8000 ..." -ForegroundColor Cyan
$api = Start-Process -FilePath $py -ArgumentList "-m","uvicorn","main:app","--host","127.0.0.1","--port","8000" -WorkingDirectory $backend -PassThru -WindowStyle Hidden

$ok = $false
for ($i = 0; $i -lt 25; $i++) {
    Start-Sleep -Seconds 1
    try { if ((Invoke-RestMethod "http://127.0.0.1:8000/health" -TimeoutSec 2).status -eq "ok") { $ok = $true; break } } catch {}
}
if (-not $ok) { Write-Host "backend didn't come up. check that deps are installed." -ForegroundColor Red; Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue; Read-Host "enter to exit"; exit 1 }
Write-Host "backend live." -ForegroundColor Green

$log = Join-Path $env:TEMP "reelrag_tunnel.log"
if (Test-Path $log) { Remove-Item $log -Force }
Write-Host "opening cloudflare tunnel ..." -ForegroundColor Cyan
$tun = Start-Process -FilePath $cf -ArgumentList "tunnel","--url","http://127.0.0.1:8000","--logfile",$log -PassThru -WindowStyle Hidden

$url = $null
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $log) {
        $m = Select-String -Path $log -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($m) { $url = $m.Matches[0].Value; break }
    }
}

if (-not $url) {
    Write-Host "couldn't read the tunnel url from the log. check $log" -ForegroundColor Red
    Stop-Process -Id $tun.Id -Force -ErrorAction SilentlyContinue
    Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue
    Read-Host "enter to exit"; exit 1
}

try { Set-Clipboard -Value $url } catch {}

Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Yellow
Write-Host "  TUNNEL URL (copied to clipboard):" -ForegroundColor Yellow
Write-Host "  $url" -ForegroundColor White
Write-Host "=====================================================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "  if this url is different from last run, update render:" -ForegroundColor Gray
Write-Host "    reelrag-web  ->  Environment  ->  VITE_API_BASE = the url above" -ForegroundColor Gray
Write-Host "    then  Manual Deploy  ->  Clear build cache & deploy" -ForegroundColor Gray
Write-Host ""
Write-Host "  leave this window open during your demo. press Ctrl+C to stop both." -ForegroundColor Gray
Write-Host ""

try {
    Wait-Process -Id $tun.Id
} finally {
    Write-Host "shutting down backend + tunnel ..." -ForegroundColor Cyan
    Stop-Process -Id $tun.Id -Force -ErrorAction SilentlyContinue
    Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue
}

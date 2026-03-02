$ports = @(4096, 56369, 56497, 59537, 63568)

foreach ($p in $ports) {
    Write-Host "`n=== PORT $p ===" -ForegroundColor Cyan

    # /app
    Write-Host "--- /app ---"
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:$p/app" -TimeoutSec 2 -ErrorAction Stop
        Write-Host $r.Content
    } catch { Write-Host "ERROR: $($_.Exception.Message)" }

    # /path
    Write-Host "--- /path ---"
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:$p/path" -TimeoutSec 2 -ErrorAction Stop
        Write-Host $r.Content
    } catch { Write-Host "ERROR: $($_.Exception.Message)" }

    # /session/status
    Write-Host "--- /session/status ---"
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:$p/session/status" -TimeoutSec 2 -ErrorAction Stop
        Write-Host $r.Content
    } catch { Write-Host "ERROR: $($_.Exception.Message)" }

    # /session (just titles + IDs, truncated)
    Write-Host "--- /session (titles only) ---"
    try {
        $r = Invoke-RestMethod -Uri "http://127.0.0.1:$p/session" -TimeoutSec 2 -ErrorAction Stop
        foreach ($s in $r) {
            Write-Host "  id=$($s.id) title=$($s.title)"
        }
    } catch { Write-Host "ERROR: $($_.Exception.Message)" }

    # /global/health
    Write-Host "--- /global/health ---"
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:$p/global/health" -TimeoutSec 2 -ErrorAction Stop
        Write-Host $r.Content
    } catch { Write-Host "ERROR: $($_.Exception.Message)" }
}

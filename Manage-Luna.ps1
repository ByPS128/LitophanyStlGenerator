param(
    [ValidateSet('Start', 'Stop')][string]$Action = 'Start',
    [switch]$Install, [switch]$Empty, [switch]$NoBrowser,
    [ValidateRange(1024, 65515)][int]$Port = 8765
)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$stateDirectory = Join-Path $PSScriptRoot 'temp'
$statePath = Join-Path $stateDirectory 'luna-process.json'
$serverPath = Join-Path $PSScriptRoot 'spherical\server.py'
$pythonPath = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
# Serialize starts/stops for this checkout, not for other projects.
$hash = [System.Security.Cryptography.SHA256]::Create()
try { $key = [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($PSScriptRoot.ToLowerInvariant()))).Replace('-', '') }
finally { $hash.Dispose() }
$mutex = New-Object System.Threading.Mutex($false, "Local\Luna-$key")
$locked = $false
function Get-OwnedProcess($record) {
    if (!$record) { return $null }
    $candidate = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$record.process_id)"
    if (!$candidate) { return $null }
    # PID alone is insufficient: Windows can reuse it for an unrelated process.
    if ($candidate.CreationDate.ToUniversalTime().Ticks.ToString() -ne [string]$record.created_ticks -or
        $candidate.ExecutablePath -ne $pythonPath -or
        !$candidate.CommandLine.Contains('"' + $serverPath + '"')) {
        throw 'Process identity does not match Luna. Nothing was stopped. Check temp/luna-process.json.'
    }
    return $candidate
}
try {
    try { $locked = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $locked = $true }
    if (!$locked) { throw 'Luna is already starting or stopping. Wait for that operation to finish.' }
    $record = $null
    if (Test-Path -LiteralPath $statePath) { $record = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json }
    $running = Get-OwnedProcess $record
    if ($Action -eq 'Stop') {
        if (!$running) { Write-Host 'Luna started by Start-Luna.cmd is not running.'; return }
        # Include the venv child Python and any running .NET/Blender calculation.
        & taskkill.exe /PID $running.ProcessId /T /F
        if ($LASTEXITCODE -ne 0) { throw 'Could not stop Luna. The process record was retained.' }
        Remove-Item -LiteralPath $statePath
        Write-Host 'Luna stopped. Saved project files were preserved.'
        return
    }
    if ($running) {
        $url = "http://127.0.0.1:$([int]$record.port)/"
        Write-Host "Luna is already running: $url"
        if (!$NoBrowser) { Start-Process $url }
        return
    }
    # Reuse the existing installation/build recipe; .NET is invoked on demand by Python.
    & (Join-Path $PSScriptRoot 'Start-Luna.ps1') -Install:$Install -PrepareOnly
    New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
    $selectedPort = $null
    foreach ($candidatePort in $Port..($Port + 20)) {
        $probe = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $candidatePort)
        try { $probe.Start(); $selectedPort = $candidatePort; break }
        catch [System.Net.Sockets.SocketException] { }
        finally { $probe.Stop() }
    }
    if (!$selectedPort) { throw 'No available local port. Existing services were left running.' }
    $arguments = @('-X', 'utf8', ('"' + $serverPath + '"'), '--port', "$selectedPort", '--no-browser')
    if (!$Empty) { $arguments += '--demo-if-available' }
    $process = Start-Process -FilePath $pythonPath -ArgumentList $arguments -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $stateDirectory 'luna-stdout.log') -RedirectStandardError (Join-Path $stateDirectory 'luna-stderr.log') -PassThru
    $identity = Get-CimInstance Win32_Process -Filter "ProcessId = $($process.Id)"
    if (!$identity) { throw 'Luna exited during startup. See temp/luna-stderr.log.' }
    @{process_id=$process.Id; created_ticks=$identity.CreationDate.ToUniversalTime().Ticks.ToString(); port=$selectedPort} | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
    $url = "http://127.0.0.1:$selectedPort/"
    $ready = $false
    $deadline = [DateTime]::UtcNow.AddMinutes(3)
    while ([DateTime]::UtcNow -lt $deadline -and !$process.HasExited) {
        try {
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) { $ready = $true; break }
        } catch { }
        Start-Sleep -Milliseconds 500
        $process.Refresh()
    }
    if (!$ready) { throw 'Luna is not ready. See temp/luna-stderr.log; Stop-Luna.cmd can stop this instance.' }
    Write-Host "Luna is ready: $url"
    Write-Host 'Use Stop-Luna.cmd to stop it after saving your projects.'
    if (!$NoBrowser) { Start-Process $url }
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}

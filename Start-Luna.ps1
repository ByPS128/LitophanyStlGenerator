param([switch]$Install, [switch]$Empty, [int]$Port = 8765, [switch]$PrepareOnly)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$pythonPath = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (!(Test-Path -LiteralPath $pythonPath)) {
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Nepodařilo se vytvořit prostředí Pythonu.' }
    $Install = $true
}
if ($Install) {
    & $pythonPath -m pip install -r spherical/requirements-dev.txt
    if ($LASTEXITCODE -ne 0) { throw 'Instalace Python závislostí selhala.' }
}
dotnet build FlatLithophaneBridge/FlatLithophaneBridge.csproj -c Release --verbosity minimal
if ($LASTEXITCODE -ne 0) { throw 'Sestavení původního .NET jádra a adaptéru selhalo.' }
Push-Location spherical/web
try {
    if ($Install -or !(Test-Path -LiteralPath node_modules)) {
        npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'Instalace rozhraní selhala.' }
    }
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Sestavení rozhraní selhalo.' }
} finally { Pop-Location }
if ($PrepareOnly) { return }
$serverArgs = @('-X', 'utf8', (Join-Path $PSScriptRoot 'spherical/server.py'), '--port', "$Port")
if (!$Empty) { $serverArgs += '--demo-if-available' }
& $pythonPath @serverArgs

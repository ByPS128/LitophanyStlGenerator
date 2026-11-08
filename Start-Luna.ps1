param([switch]$Install, [switch]$Empty, [int]$Port = 8765)
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
Push-Location spherical/web
try {
    if ($Install -or !(Test-Path -LiteralPath node_modules)) {
        npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'Instalace rozhraní selhala.' }
    }
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Sestavení rozhraní selhalo.' }
} finally { Pop-Location }
$serverArgs = @('-X', 'utf8', 'spherical/server.py', '--port', "$Port")
if (!$Empty -and (Test-Path -LiteralPath 'LithophaneStlGenerator/Sources/moon-globe-mk2.stl') -and
    (Test-Path -LiteralPath 'LithophaneStlGenerator/Sources/dragon.png')) { $serverArgs += '--demo' }
& $pythonPath @serverArgs

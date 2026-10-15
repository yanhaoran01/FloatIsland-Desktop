param(
  [string]$CargoTargetDir = (Join-Path $env:TEMP 'FusionIsland-EchoIsland-target')
)

$ErrorActionPreference = 'Stop'
$fusionRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$echoRoot = Join-Path $fusionRoot 'vendor\EchoIsland'
$manifest = Join-Path $echoRoot 'Cargo.toml'
$cargoCommand = Get-Command cargo -ErrorAction SilentlyContinue
if (-not $cargoCommand) {
  throw 'Rust stable and Cargo are required. Install them with rustup, then rerun this script.'
}

$previousTargetDir = $env:CARGO_TARGET_DIR
try {
  $env:CARGO_TARGET_DIR = $CargoTargetDir
  Push-Location $echoRoot
  try {
    & $cargoCommand.Source build --release --locked --manifest-path $manifest -p desktop-host
    if ($LASTEXITCODE -ne 0) { throw "EchoIsland sidecar build failed with exit code $LASTEXITCODE" }
  }
  finally {
    Pop-Location
  }

  $builtBinary = Join-Path $CargoTargetDir 'release\desktop-host.exe'
  if (-not (Test-Path -LiteralPath $builtBinary)) { throw "Expected binary was not produced: $builtBinary" }
  $destination = Join-Path $fusionRoot 'app\resources\echoisland'
  New-Item -ItemType Directory -Path $destination -Force | Out-Null
  Copy-Item -LiteralPath $builtBinary -Destination (Join-Path $destination 'desktop-host.exe') -Force
  $fusionManifest = Join-Path $fusionRoot 'app\native\fusion-host\Cargo.toml'
  & $cargoCommand.Source build --release --locked --manifest-path $fusionManifest
  if ($LASTEXITCODE -ne 0) { throw "FloatIsland host build failed with exit code $LASTEXITCODE" }
  foreach ($hostName in @('fusion-host.exe', 'fusion-hook.exe')) {
    Copy-Item -LiteralPath (Join-Path $CargoTargetDir "release\$hostName") -Destination (Join-Path $destination $hostName) -Force
  }
  Write-Output "Built EchoIsland sidecar at app\resources\echoisland\desktop-host.exe"
}
finally {
  $env:CARGO_TARGET_DIR = $previousTargetDir
}

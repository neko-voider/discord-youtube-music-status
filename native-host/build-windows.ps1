# Builds a standalone Windows executable with Node.js SEA (Node 25.5+).
# The script refuses to overwrite an executable already at the output path.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectDir = $PSScriptRoot
$nodeScript = Join-Path $projectDir 'native-host.js'
$outputExe = Join-Path $projectDir 'ytmusic-discord-presence-host-v3.exe'
$configPath = Join-Path $env:TEMP ("ytmusic-sea-{0}.json" -f [guid]::NewGuid().ToString('N'))

try {
    if (-not (Test-Path -LiteralPath $nodeScript -PathType Leaf)) {
        throw "Required source file not found: $nodeScript"
    }
    if (Test-Path -LiteralPath $outputExe) {
        throw "Output already exists; refusing to overwrite it: $outputExe`nRename or move that file, then run the build again."
    }

    Get-Command node -ErrorAction Stop | Out-Null
    $nodeVersionText = (& node --version 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $nodeVersionText -notmatch '^v(\d+)\.(\d+)\.(\d+)') {
        throw "Could not read a valid Node.js version. Output: $nodeVersionText"
    }
    $version = [version]::Parse("$($Matches[1]).$($Matches[2]).$($Matches[3])")
    if ($version -lt [version]'25.5.0') {
        throw "Node.js $nodeVersionText is too old for built-in SEA generation. Install Node.js 25.5 or newer (the reported v26.11.1 is supported)."
    }

    $config = @{
        main = (Resolve-Path -LiteralPath $nodeScript).Path
        output = $outputExe
        disableExperimentalSEAWarning = $true
    } | ConvertTo-Json -Depth 4
    [System.IO.File]::WriteAllText($configPath, $config, [System.Text.UTF8Encoding]::new($false))

    Write-Host "Building with Node.js $nodeVersionText..."
    & node --build-sea $configPath
    if ($LASTEXITCODE -ne 0) {
        throw "Node.js SEA build failed with exit code $LASTEXITCODE."
    }
    if (-not (Test-Path -LiteralPath $outputExe -PathType Leaf)) {
        throw "Build command completed but the expected executable was not created: $outputExe"
    }
    $exe = Get-Item -LiteralPath $outputExe
    if ($exe.Length -lt 1MB) {
        throw "The output exists but is unexpectedly small ($($exe.Length) bytes); refusing to report a successful build."
    }

    Write-Host "Build succeeded: $($exe.FullName) ($([math]::Round($exe.Length / 1MB, 1)) MB)"
    Write-Host 'No existing executable was overwritten.'
}
finally {
    Remove-Item -LiteralPath $configPath -Force -ErrorAction SilentlyContinue
}






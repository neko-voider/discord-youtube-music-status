# Run as the user who uses Chrome, after placing the packaged EXE and manifest at the paths below.
# The final installer should create this registry key automatically.
$ErrorActionPreference = 'Stop'
$hostName = 'com.ytmusic.discord_presence'
$manifestPath = Join-Path $env:LOCALAPPDATA 'YTM Discord Presence\com.ytmusic.discord_presence.json'
$installDir = Split-Path $manifestPath
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
Write-Host "Copy the final native-host manifest to: $manifestPath"
Write-Host "Then register it with Chrome:"
New-Item -Path 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.ytmusic.discord_presence' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.ytmusic.discord_presence' -Name '(default)' -Value $manifestPath
Write-Host "Native Messaging host registered. Ensure the manifest's path points to the installed EXE."

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$batPath = Join-Path $scriptDir "faceit_ping_host.bat"
$escapedBatPath = $batPath.Replace('\', '\\')
$jsonPath = Join-Path $scriptDir "com.faceit.ping.inspector.json"

$manifest = @"
{
  "name": "com.faceit.ping.inspector",
  "description": "FACEIT Server Ping Inspector Native Host",
  "path": "$escapedBatPath",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://kdhmjiinfceafbkbinohpcefneedhjjo/"
  ]
}
"@

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($jsonPath, $manifest, $utf8NoBom)

$regPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.faceit.ping.inspector"
if (-not (Test-Path $regPath)) {
    New-Item -Path $regPath -Force | Out-Null
}
Set-ItemProperty -Path $regPath -Name "(default)" -Value $jsonPath

Write-Output "Хост зарегистрирован: $jsonPath"

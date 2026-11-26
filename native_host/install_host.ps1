$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pyExe = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $pyExe) {
    $pyExe = Join-Path $env:LOCALAPPDATA "Python\bin\python.exe"
}

$batPath = Join-Path $scriptDir "faceit_ping_host.bat"
$batContent = "@echo off`r`n`"$pyExe`" -u `"%~dp0faceit_ping_host.py`"`r`n"
[System.IO.File]::WriteAllText($batPath, $batContent, [System.Text.Encoding]::ASCII)

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
Write-Output "Python: $pyExe"

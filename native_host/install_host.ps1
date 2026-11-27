$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$csPath = Join-Path $scriptDir "faceit_ping_host.cs"
$exePath = Join-Path $scriptDir "faceit_ping_host.exe"
$cscPath = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"

if ((Test-Path $cscPath) -and (Test-Path $csPath)) {
    & $cscPath /target:exe /optimize+ /out:"$exePath" /nologo "$csPath"
}

$escapedExePath = $exePath.Replace('\', '\\')
$jsonPath = Join-Path $scriptDir "com.faceit.ping.inspector.json"

$manifest = @"
{
  "name": "com.faceit.ping.inspector",
  "description": "FACEIT Server Ping Inspector Native Host",
  "path": "$escapedExePath",
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

Write-Output "Host registered successfully"

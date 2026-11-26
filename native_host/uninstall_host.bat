@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Remove-Item -Path 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.faceit.ping.inspector' -Recurse -ErrorAction SilentlyContinue; Write-Output 'Хост удален'"

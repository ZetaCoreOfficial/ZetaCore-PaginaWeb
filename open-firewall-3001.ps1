# Abre el puerto 3001 al Wi-Fi local (entrada TCP).
# Clic derecho en este archivo > "Ejecutar con PowerShell" como administrador.

$ErrorActionPreference = "Stop"
$ruleName = "ZetaCore Metodos Pago 3001"

$show = netsh advfirewall firewall show rule name="$ruleName" 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Host "La regla de firewall '$ruleName' ya existe."
  exit 0
}

netsh advfirewall firewall add rule name="$ruleName" dir=in action=allow protocol=TCP localport=3001 profile=private,public
Write-Host "Regla creada. En la carpeta del proyecto ejecuta: npm start"
Write-Host "En el movil: http://TU_IPv4:3001/ (TU_IPv4 la ves con ipconfig, adaptador Wi-Fi)."

param(
  [Parameter(Mandatory = $true)]
  [string]$Domain,
  [Parameter(Mandatory = $true)]
  [string]$Email,
  [string]$WebRoot = "C:\certbot-www"
)

# Windows 部署示例。Linux 服务器可使用同等 certbot 命令，并在续期后 reload nginx。
certbot certonly --webroot `
  -w $WebRoot `
  -d $Domain `
  --email $Email `
  --agree-tos `
  --no-eff-email `
  --rsa-key-size 2048

certbot renew --deploy-hook "nginx -s reload"

Write-Host "证书签发/续期流程已完成。建议运行：node scripts/check-tls-config.mjs $Domain"

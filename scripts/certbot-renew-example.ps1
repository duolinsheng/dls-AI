param(
  [Parameter(Mandatory = $true)]
  [string]$Domain,
  [Parameter(Mandatory = $true)]
  [string]$Email
)

# Windows 部署示例。Linux 服务器可使用同等 certbot 命令并在续期后 reload nginx。
certbot certonly --webroot `
  -w "C:\certbot-www" `
  -d $Domain `
  --email $Email `
  --agree-tos `
  --no-eff-email

certbot renew --deploy-hook "nginx -s reload"

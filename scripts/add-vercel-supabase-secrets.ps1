param(
  [string]$Scope = "selinas-projects-d6525c85",
  [string]$Environment = "production"
)

$ErrorActionPreference = "Stop"

function ConvertFrom-SecureInput {
  param([System.Security.SecureString]$SecureValue)

  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Read-SecretText {
  param([string]$Prompt)

  $secureValue = Read-Host -Prompt $Prompt -AsSecureString
  $plainValue = ConvertFrom-SecureInput -SecureValue $secureValue

  if ([string]::IsNullOrWhiteSpace($plainValue)) {
    throw "$Prompt cannot be empty."
  }

  $plainValue.Trim()
}

function Add-VercelSecret {
  param(
    [string]$Name,
    [string]$Value
  )

  Write-Host "Adding $Name to Vercel $Environment..." -ForegroundColor Cyan
  $Value | npx vercel@54.14.2 env add $Name $Environment --scope $Scope
}

Write-Host "AI Content Factory Supabase secret setup" -ForegroundColor Green
Write-Host "Values are read locally and piped to Vercel. They are not printed or written to files."
Write-Host ""

$databaseUrl = Read-SecretText -Prompt "Paste DATABASE_URL"
if ($databaseUrl -notmatch "^postgres(ql)?://") {
  throw "DATABASE_URL must start with postgresql:// or postgres://."
}

$serviceRoleKey = Read-SecretText -Prompt "Paste SUPABASE_SERVICE_ROLE_KEY"

Add-VercelSecret -Name "DATABASE_URL" -Value $databaseUrl
Add-VercelSecret -Name "SUPABASE_SERVICE_ROLE_KEY" -Value $serviceRoleKey

Write-Host ""
Write-Host "Secrets submitted to Vercel. Redeploy production next:" -ForegroundColor Green
Write-Host "npx vercel@54.14.2 deploy --prod --yes --scope $Scope"
Write-Host ""
Write-Host "After redeploy, verify:"
Write-Host "npm run cloud:doctor"

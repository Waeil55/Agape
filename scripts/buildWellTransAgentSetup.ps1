$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $repositoryRoot 'automation\welltrans-worker\installer\AgapeWellTransAgentSetup.cs'
$outputRoot = Join-Path $repositoryRoot 'public\welltrans-agent'
$setupPath = Join-Path $outputRoot 'AgapeWellTransAgentSetup.exe'
$compiler = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) {
  $compiler = 'C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe'
}
if (-not (Test-Path -LiteralPath $compiler)) {
  throw 'The Windows .NET Framework C# compiler is unavailable.'
}

New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
& $compiler /nologo /target:winexe /optimize+ /platform:anycpu /out:$setupPath `
  /reference:System.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll `
  /reference:System.Web.Extensions.dll /reference:System.IO.Compression.dll `
  /reference:System.IO.Compression.FileSystem.dll $sourcePath
if ($LASTEXITCODE -ne 0) {
  throw "Windows setup compilation failed with code $LASTEXITCODE."
}

$signingThumbprint = [Environment]::GetEnvironmentVariable('AGAPE_CODE_SIGN_CERT_THUMBPRINT', 'Process')
$requireSignedRelease = [Environment]::GetEnvironmentVariable('AGAPE_REQUIRE_SIGNED_AGENT', 'Process') -eq 'true'
$signatureStatus = 'Unsigned'
if ($signingThumbprint) {
  $certificate = Get-ChildItem -LiteralPath "Cert:\CurrentUser\My\$signingThumbprint" -ErrorAction SilentlyContinue
  if (-not $certificate) {
    throw 'AGAPE_CODE_SIGN_CERT_THUMBPRINT does not identify a CurrentUser code-signing certificate.'
  }
  $signature = Set-AuthenticodeSignature -LiteralPath $setupPath -Certificate $certificate `
    -TimestampServer 'http://timestamp.digicert.com' -HashAlgorithm SHA256
  if ($signature.Status -ne 'Valid') {
    throw "Windows setup signing failed: $($signature.StatusMessage)"
  }
  $signatureStatus = 'Valid'
}
if ($requireSignedRelease -and $signatureStatus -ne 'Valid') {
  throw 'A signed Agent release is required, but AGAPE_CODE_SIGN_CERT_THUMBPRINT was not configured.'
}

$manifestPath = Join-Path $outputRoot 'version.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$manifest | Add-Member -NotePropertyName setupFile -NotePropertyValue 'AgapeWellTransAgentSetup.exe' -Force
$manifest | Add-Member -NotePropertyName setupSha256 `
  -NotePropertyValue (Get-FileHash -LiteralPath $setupPath -Algorithm SHA256).Hash.ToLowerInvariant() -Force
$manifest | Add-Member -NotePropertyName setupSignatureStatus -NotePropertyValue $signatureStatus -Force
$manifest | Add-Member -NotePropertyName signed -NotePropertyValue ($signatureStatus -eq 'Valid') -Force
$manifestJson = $manifest | ConvertTo-Json
$utf8WithoutBom = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText($manifestPath, $manifestJson, $utf8WithoutBom)
Write-Output $setupPath

param(
  [int]$Port = 4195,
  [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"
$resolvedRoot = [System.IO.Path]::GetFullPath($Root)
$listener = [System.Net.Sockets.TcpListener]::new(
  [System.Net.IPAddress]::Loopback,
  $Port
)

$mime = @{
  ".html"="text/html; charset=utf-8"; ".htm"="text/html; charset=utf-8"; ".css"="text/css; charset=utf-8";
  ".js"="text/javascript; charset=utf-8"; ".mjs"="text/javascript; charset=utf-8"; ".json"="application/json; charset=utf-8";
  ".png"="image/png"; ".jpg"="image/jpeg"; ".jpeg"="image/jpeg"; ".gif"="image/gif"; ".svg"="image/svg+xml";
  ".webp"="image/webp"; ".ico"="image/x-icon"; ".avif"="image/avif"; ".webmanifest"="application/manifest+json";
  ".txt"="text/plain; charset=utf-8"; ".xml"="application/xml; charset=utf-8"; ".woff"="font/woff"; ".woff2"="font/woff2"
}

function Send-Response {
  param(
    [System.Net.Sockets.NetworkStream]$Stream,
    [int]$StatusCode,
    [string]$StatusText,
    [string]$ContentType,
    [byte[]]$Body,
    [bool]$HeadOnly = $false
  )

  $header = "HTTP/1.1 $StatusCode $StatusText`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  if (-not $HeadOnly -and $Body.Length) {
    $Stream.Write($Body, 0, $Body.Length)
  }
}

$listener.Start()
Write-Host "Serving $resolvedRoot on http://127.0.0.1:$Port/"

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = [System.IO.StreamReader]::new(
        $stream,
        [System.Text.Encoding]::ASCII,
        $false,
        1024,
        $true
      )
      $requestLine = $reader.ReadLine()
      while ($reader.ReadLine()) {}

      if (-not $requestLine -or $requestLine -notmatch "^(GET|HEAD)\s+(\S+)\s+HTTP/") {
        $body = [System.Text.Encoding]::UTF8.GetBytes("400 Bad Request")
        Send-Response $stream 400 "Bad Request" "text/plain; charset=utf-8" $body
        continue
      }

      $method = $Matches[1]
      $requestTarget = $Matches[2]
      $path = [System.Uri]::UnescapeDataString(($requestTarget -split "\?", 2)[0])
      if ($path -eq "/") { $path = "/index.html" }

      $relativePath = $path.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
      $fullPath = [System.IO.Path]::GetFullPath((Join-Path $resolvedRoot $relativePath))
      $insideRoot = $fullPath.StartsWith(
        $resolvedRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar,
        [System.StringComparison]::OrdinalIgnoreCase
      )

      if (-not $insideRoot) {
        $body = [System.Text.Encoding]::UTF8.GetBytes("403 Forbidden")
        Send-Response $stream 403 "Forbidden" "text/plain; charset=utf-8" $body ($method -eq "HEAD")
      } elseif (Test-Path -LiteralPath $fullPath -PathType Leaf) {
        $extension = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
        $contentType = $mime[$extension]
        if (-not $contentType) { $contentType = "application/octet-stream" }
        $body = [System.IO.File]::ReadAllBytes($fullPath)
        Send-Response $stream 200 "OK" $contentType $body ($method -eq "HEAD")
      } else {
        $body = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
        Send-Response $stream 404 "Not Found" "text/plain; charset=utf-8" $body ($method -eq "HEAD")
      }
    } catch {
      try {
        $body = [System.Text.Encoding]::UTF8.GetBytes("500 Internal Server Error")
        Send-Response $stream 500 "Internal Server Error" "text/plain; charset=utf-8" $body
      } catch {}
    } finally {
      if ($reader) { $reader.Dispose() }
      if ($stream) { $stream.Dispose() }
      $client.Dispose()
    }
  }
} finally {
  $listener.Stop()
}

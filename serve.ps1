# Simple HTTP server for local development on Windows.
# Serves this folder on http://localhost:8000
# Uses the web server built into Windows, so Python is not required.
# ES modules and JSON imports need the right file types, which this sets.

param(
    [Parameter(Position = 0)]
    [int]$Port = 8000
)

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

$sep = [string][System.IO.Path]::DirectorySeparatorChar
$root = [System.IO.Path]::GetFullPath($PSScriptRoot)
if (-not $root.EndsWith($sep)) {
    $root += $sep
}

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".js"   = "text/javascript; charset=utf-8"
    ".mjs"  = "text/javascript; charset=utf-8"
    ".cjs"  = "text/javascript; charset=utf-8"
    ".json" = "application/json"
    ".css"  = "text/css; charset=utf-8"
    ".svg"  = "image/svg+xml"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".webp" = "image/webp"
    ".ico"  = "image/x-icon"
    ".txt"  = "text/plain; charset=utf-8"
    ".map"  = "application/json"
    ".xml"  = "application/xml"
}

function Get-ContentType([string]$path) {
    $ext = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
    if ($mimeTypes.ContainsKey($ext)) {
        return $mimeTypes[$ext]
    }
    return "application/octet-stream"
}

function Send-Bytes($response, [int]$status, [byte[]]$body, [string]$contentType, [bool]$includeBody) {
    $response.StatusCode = $status
    $response.ContentType = $contentType
    $response.Headers.Add("X-Content-Type-Options", "nosniff")
    if ($null -eq $body) {
        $body = New-Object byte[] 0
    }
    $response.ContentLength64 = $body.Length
    if ($includeBody -and $body.Length -gt 0) {
        $response.OutputStream.Write($body, 0, $body.Length)
    }
    $response.Close()
}

function Send-Text($response, [int]$status, [string]$text, [bool]$includeBody) {
    $body = [System.Text.Encoding]::UTF8.GetBytes($text)
    Send-Bytes $response $status $body "text/plain; charset=utf-8" $includeBody
}

# http://+:port/ is every network address, same as Python's http.server.
# Windows often reserves that for an administrator, so fall back to this PC only.
$listener = $null
$shared = $false
$prefixes = @(
    @{ Prefix = "http://+:$Port/"; Shared = $true },
    @{ Prefix = "http://localhost:$Port/"; Shared = $false }
)
$lastError = $null
foreach ($candidate in $prefixes) {
    $tryListener = New-Object System.Net.HttpListener
    $tryListener.Prefixes.Add($candidate.Prefix)
    try {
        $tryListener.Start()
        $listener = $tryListener
        $listener.IgnoreWriteExceptions = $true
        $shared = $candidate.Shared
        break
    } catch {
        $lastError = $_.Exception.Message
        $tryListener.Close()
    }
}

if ($null -eq $listener) {
    Write-Host "Could not start a server on port $Port."
    Write-Host $lastError
    Write-Host ""
    Write-Host "Something else may already be using that port. Try another:"
    Write-Host "  .\serve.cmd 8080"
    exit 1
}

Write-Host "Starting server on http://localhost:$Port"
if ($shared) {
    $serverName = $env:COMPUTERNAME
    if ([string]::IsNullOrWhiteSpace($serverName)) {
        $serverName = [System.Net.Dns]::GetHostName()
    }
    Write-Host "Other devices on your network can use http://${serverName}:$Port"
} else {
    Write-Host "This computer only. Windows did not allow a network address."
}
Write-Host "Press Ctrl+C to stop"

try {
    while ($listener.IsListening) {
        # Wait in short slices so Ctrl+C is noticed. GetContext() blocks
        # inside .NET, and Windows PowerShell will not interrupt it.
        $asyncResult = $listener.BeginGetContext($null, $null)
        while ($listener.IsListening -and -not $asyncResult.IsCompleted) {
            if ($asyncResult.AsyncWaitHandle.WaitOne(250)) { break }
        }
        if (-not $listener.IsListening) { break }
        try {
            $context = $listener.EndGetContext($asyncResult)
        } catch {
            break
        }
        try {
            $request = $context.Request
            $response = $context.Response
            $includeBody = $request.HttpMethod -eq "GET"

            if ($request.HttpMethod -ne "GET" -and $request.HttpMethod -ne "HEAD") {
                $response.Headers.Add("Allow", "GET, HEAD")
                Send-Text $response 405 "Method not allowed" $includeBody
                continue
            }

            $relative = [Uri]::UnescapeDataString($request.Url.LocalPath)
            $relative = $relative.Replace("/", $sep).Replace("\", $sep)
            $relative = $relative.TrimStart($sep)
            if ([string]::IsNullOrEmpty($relative)) {
                $relative = "index.html"
            }

            $full = [System.IO.Path]::GetFullPath((Join-Path $root $relative))
            if (-not $full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
                Send-Text $response 403 "Forbidden" $includeBody
                continue
            }

            if (Test-Path -LiteralPath $full -PathType Container) {
                $full = Join-Path $full "index.html"
            }

            if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
                Send-Text $response 404 "Not found" $includeBody
                continue
            }

            $bytes = [System.IO.File]::ReadAllBytes($full)
            Send-Bytes $response 200 $bytes (Get-ContentType $full) $includeBody
        } catch {
            try { $context.Response.Abort() } catch {}
        }
    }
} finally {
    if ($listener.IsListening) {
        $listener.Stop()
    }
    $listener.Close()
}

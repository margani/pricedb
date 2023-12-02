$PSDefaultParameterValues['*:Encoding'] = 'utf8'
$data = Invoke-WebRequest https://call1.tgju.org/ajax.json | ConvertFrom-Json

$index = 0
$count = 2

$dataRootPath = Join-Path "./" "tgju" "current"
$data.current.PSObject.Properties | ForEach-Object {
    $key = $_.Name
    $latest = $_.Value
    $path = Join-Path $dataRootPath $key

    Write-Host "Processing key: $key"
    Write-Host "t: $($latest.t)"

    if (!(Test-Path $path)) {
        New-Item -ItemType Directory -Force -Path $path | Out-Null
    }

    $latestJsonFilePath = Join-Path $path "latest.json"
    $latestJson = $latest | ConvertTo-Json -Depth 100
    Set-Content -Path $latestJsonFilePath -Value $latestJson -Encoding Unicode

    $historyJsonFilePath = Join-Path $path "history.json"
    $history = @()
    if (Test-Path $historyJsonFilePath) {
        $history = Get-Content -Path $historyJsonFilePath -Raw | ConvertFrom-Json -Depth 100
        if ($history -is [PSCustomObject]) {
            $history = @($history)
        }
    }

    $latestExistsInHistory = $history | Where-Object { $_.ts -eq $latest.ts }
    if (!$latestExistsInHistory) {
        $history += $latest
        $historyJson = $history | ConvertTo-Json -Depth 100 -AsArray
        Set-Content -Path $historyJsonFilePath -Value $historyJson
    }

    $index++
    if ($index -ge $count) {
        break
    }
}

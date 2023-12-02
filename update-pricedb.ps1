$response = Invoke-WebRequest https://call1.tgju.org/ajax.json
$data = $response.Content | ConvertFrom-Json

$dataRootPath = Join-Path "./" "tgju" "current"
$data.current.PSObject.Properties | ForEach-Object {
    $key = $_.Name
    $latest = $_.Value
    $path = Join-Path $dataRootPath $key

    Write-Host "Processing key: $key"

    if (!(Test-Path $path)) {
        New-Item -ItemType Directory -Force -Path $path | Out-Null
    }

    $latestJsonFilePath = Join-Path $path "latest.json"
    $latestJson = $latest | ConvertTo-Json -Depth 100
    Set-Content -Path $latestJsonFilePath -Value $latestJson

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
}

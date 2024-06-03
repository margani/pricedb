Import-Module ./src/modules/persian-lib.psm1 -Force

Function Update-PriceDB($DataRootPath, $Mode = "daily") {
    $response = Invoke-WebRequest https://call1.tgju.org/ajax.json
    $data = $response.Content | ConvertFrom-Json

    $data.current.PSObject.Properties | ForEach-Object {
        $key = $_.Name
        $latest = $_.Value
        $path = Join-Path $DataRootPath $key

        Write-Host "Processing key: $key"

        if (!(Test-Path $path)) {
            New-Item -ItemType Directory -Force -Path $path | Out-Null
        }

        $price = 0
        if ($latest) {
            $price = [double]$latest.p.Trim()
        }

        if ($price -le 0) {
            Write-Host "Price is zero. No update will be made."
            Write-Host $latest
            return
        }

        $latestJsonFilePath = Join-Path $path "latest.json"
        $latestJson = $latest | ConvertTo-Json -Depth 100
        Set-Content -Path $latestJsonFilePath -Value $latestJson

        if ($Mode -eq "daily") {
            $dailyHistoryFilePath = Join-Path $path "history.json"
            Add-PriceToHistory -HistoryFilePath $dailyHistoryFilePath -Record $latest
        }
        elseif ($Mode -eq "hourly") {
            $hourlyHistoryFilePath = Join-Path $path "hourly-history.json"
            Add-PriceToHistory -HistoryFilePath $hourlyHistoryFilePath -Record $latest
        }
    }
}

Function Add-PriceToHistory($HistoryFilePath, $Record) {
    $history = @()
    if (Test-Path $HistoryFilePath) {
        $history = Get-Content -Path $HistoryFilePath -Raw | ConvertFrom-Json -Depth 100
        if ($history -is [PSCustomObject]) {
            $history = @($history)
        }
    }

    $latestExistsInHistory = $history | Where-Object { $_.ts -eq $Record.ts }
    if (!$latestExistsInHistory) {
        $history += $Record
        $historyJson = $history | ConvertTo-Json -Depth 100 -AsArray
        Set-Content -Path $HistoryFilePath -Value $historyJson
    }
}

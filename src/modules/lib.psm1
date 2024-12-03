Import-Module ./src/modules/persian-lib.psm1 -Force

Function Update-PriceDB($DataRootPath, $Mode = "daily") {
    $response = Invoke-WebRequest https://call1.tgju.org/ajax.json
    $data = $response.Content | ConvertFrom-Json

    $data.current.PSObject.Properties | ForEach-Object {
        $key = $_.Name
        $latest = Remove-UnneededAttributes -Record $_.Value

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

        Save-Record -Record $latest -FilePath (Join-Path $path "latest.json")

        switch ($Mode) {
            "daily" {
                Add-PriceToHistory -HistoryFilePath (Join-Path $path "history.json") -Record $latest
            }
            "hourly" {
                Add-PriceToHistory -HistoryFilePath (Join-Path $path "hourly-history.json") -Record $latest
            }
            Default {
                Write-Host "Invalid mode: $Mode"
            }
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

    $shouldTrimData = $history | Where-Object { $_.dp }
    if ($shouldTrimData) {
        Write-Host "Trimming data..."
        $history = $history | ForEach-Object {
            Remove-UnneededAttributes -Record $_
        }

        Save-Records -Records $history -FilePath $HistoryFilePath
    }

    $latestExistsInHistory = $history | Where-Object { $_.ts -eq $Record.ts }
    if (!$latestExistsInHistory) {
        $history += $Record
        Save-Records -Records $history -FilePath $HistoryFilePath
    }
}

Function Save-Records($Records, $FilePath) {
    $recordsJson = $Records | ConvertTo-Json -Depth 100 -AsArray
    $compactJson = Get-CompactJson -JsonString $recordsJson
    Set-Content -Path $FilePath -Value $compactJson
}

Function Save-Record($Record, $FilePath) {
    $recordJson = $Record | ConvertTo-Json -Depth 100
    $compactJson = Get-CompactJson -JsonString $recordJson
    Set-Content -Path $FilePath -Value $compactJson
}

Function Get-CompactJson($JsonString) {
    $compactJson = ($JsonString | Out-String) -replace "(\r\n|\n)    ", " "
    $compactJson = $compactJson -replace "(\r\n|\n)  }", " }"
    return $compactJson.Trim()
}

Function Remove-UnneededAttributes($Record) {
    if (!$Record -or $Record -isnot [PSCustomObject]) {
        return $Record
    }

    $Record.PSObject.Properties.Remove('d')
    $Record.PSObject.Properties.Remove('dp')
    $Record.PSObject.Properties.Remove('dt')
    $Record.PSObject.Properties.Remove('t')
    $Record.PSObject.Properties.Remove('t_en')
    $Record.PSObject.Properties.Remove('t-g')

    return $Record
}

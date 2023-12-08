Import-Module ./persian-lib.psm1 -Force

$PersianCalendar = New-Object System.Globalization.PersianCalendar
$Colors = @('#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#666666')
$ChartsPlaceHolderStart = "[//]: # (START_CHARTS)"
$ChartsPlaceHolderEnd = "[//]: # (END_CHARTS)"

Function Update-PriceDB($DataRootPath) {
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
}

Function Add-Charts($Keys) {
    $chartsMarkDown = ""
    $Keys | ForEach-Object {
        $key = $_
        $keyHistoryPath = Join-Path "./tgju" "current" $key "history.json"
        $history = Get-Content -Path $keyHistoryPath -Raw | ConvertFrom-Json -Depth 100 | Sort-Object -Property ts | Select-Object -First 30

        $xAxisRaw = $history | ForEach-Object { return $_.ts }
        $yAxis = $history | ForEach-Object { return $_.p.ToString().Replace(",", "") }

        $yAxisLabels = $yAxis | ForEach-Object {
            return Get-PersianNumber($_)
        }

        $xAxis = $xAxisRaw | ForEach-Object {
            $date = [datetime]::ParseExact($_.ToString(), "yyyy-MM-dd HH:mm:ss", [Globalization.CultureInfo]::CreateSpecificCulture('en-GB'))
            return $date.Date
        }

        $xAxisLabels = $xAxisRaw | ForEach-Object {
            $date = [datetime]::ParseExact($_.ToString(), "yyyy-MM-dd HH:mm:ss", [Globalization.CultureInfo]::CreateSpecificCulture('en-GB'))
            $day = $PersianCalendar.GetDayOfMonth($date)
            $month = $PersianCalendar.GetMonth($date)
            return "$(Get-PersianNumber($day)) $(Get-PersianMonthName($month))"
        }

        $url = Get-ChartImageUrl -Title "$key" -XAxis $xAxis -XAxisLabels $xAxisLabels -YAxis $yAxis -YAxisLabels $yAxisLabels -Color $Colors[5]

        $chartsMarkDown += "`r`n`r`n<img src='$url' />"
    }

    $chartsMarkDown = $chartsMarkDown + "`r`n`r`n"

    $readmeContents = Get-Content -Path "./README.md" -Raw
    $indexOfStart = $readmeContents.IndexOf($ChartsPlaceHolderStart)
    if ($indexOfStart -ge 0) {
        $indexOfStart += $ChartsPlaceHolderStart.Length
        $indexOfEnd = $readmeContents.IndexOf($ChartsPlaceHolderEnd)
        if ($indexOfEnd -ge $indexOfStart) {
            $readmeContents = $readmeContents.Remove($indexOfStart, $indexOfEnd - $indexOfStart).Insert($indexOfStart, $chartsMarkDown)
        }
    }
    Set-Content -Path "./README.md" -Value $readmeContents -NoNewline
}

Function Get-ChartImageUrl($Title, $XAxis, $XAxisLabels, $YAxis, $YAxisLabels, $Color) {
    $data = @{
        type    = "bar"
        data    = @{
            datasets = @(
                @{
                    type                 = "line"
                    fill                 = $false
                    borderWidth          = 1
                    borderColor          = $Color
                    pointBackgroundColor = $Color
                    data                 = $YAxis
                    datalabels           = @{
                        align     = 'top'
                        anchor    = 'end'
                        formatter = 'function(value, context) { return value; }'
                    }
                }
            )
            labels   = $XAxis
        }
        options = @{
            layout = @{
                padding = @{
                    left   = 50
                    right  = 50
                    top    = 0
                    bottom = 0
                }
            }
            legend = @{
                display = $false
            }
            title  = @{
                display = $true
                text    = $Title
            }
            scales = @{
                xAxes = @(@{
                        type = 'time'
                        time = @{
                            unit           = 'day'
                        }
                    },
                    @{
                        type   = 'category'
                        labels = $XAxisLabels
                    })
                yAxes = @(
                    @{
                        ticks = @{
                            beginAtZero = $false
                        }
                    }
                )
            }
        }
    }
    $dataJson = $data | ConvertTo-Json -Depth 100

    $dataJsonEscaped = [uri]::EscapeDataString($dataJson)

    $backgroundColor = "g"
    $bkg = "white"
    return "https://image-charts.com/chart.js/2.8.0?width=600&height=400&backgroundcolor=$backgroundColor&bkg=$bkg&c=$dataJsonEscaped"
}

Import-Module ./src/modules/persian-lib.psm1 -Force

$PersianCalendar = New-Object System.Globalization.PersianCalendar
$Colors = @('#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#666666')
$ChartsPlaceHolderStart = "[//]: # (START_CHARTS)"
$ChartsPlaceHolderEnd = "[//]: # (END_CHARTS)"
$DefaultChartFontSize = 8

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

Function Add-AllCharts() {
    $chartsMarkDown = ""

    $chartsMarkDown += Add-Charts -Title "دلار به تومان" -Keys @('price_dollar_rl') -ZeroesToRemove 1
    $chartsMarkDown += Add-Charts -Title "پوند به تومان" -Keys @('price_gbp') -ZeroesToRemove 1
    $chartsMarkDown += Add-Charts -Title "یورو به تومان" -Keys @('price_eur') -ZeroesToRemove 1
    $chartsMarkDown += Add-Charts -Title "مثقال طلا به هزار تومان" -Keys @('mesghal') -ZeroesToRemove 4
    $chartsMarkDown += Add-Charts -Title "سکه امامی به هزار تومان" -Keys @('retail_sekee') -ZeroesToRemove 4
    $chartsMarkDown += Add-Charts -Title "سکه بهار آزادی به هزار تومان" -Keys @('retail_sekeb') -ZeroesToRemove 4
    $chartsMarkDown += Add-Charts -Title "نیم سکه بهار آزادی به هزار تومان" -Keys @('retail_nim') -ZeroesToRemove 4
    $chartsMarkDown += Add-Charts -Title "ربع سکه بهار آزادی به هزار تومان" -Keys @('retail_rob') -ZeroesToRemove 4
    $chartsMarkDown += Add-Charts -Title "سکه گرمی به هزار تومان" -Keys @('retail_gerami') -ZeroesToRemove 4

    Set-ChartSection -ChartsMarkDown $chartsMarkDown
}

Function Add-Charts($Title, $Keys, $ZeroesToRemove = 0) {
    $chartsMarkDown = ""
    $Keys | ForEach-Object {
        $key = $_
        $chartColor = $Colors[$Keys.IndexOf($key) % $Colors.Count]
        $keyHistoryPath = Join-Path "./tgju" "current" $key "history.json"
        $history = Get-Content -Path $keyHistoryPath -Raw | ConvertFrom-Json -Depth 100 | Sort-Object -Property ts | Select-Object -First 30

        $xAxisRaw = $history | ForEach-Object { return $_.ts }
        $yAxis = $history | ForEach-Object {
            $numberStr = $_.p.ToString().Replace(",", "")
            $numberStr = $numberStr.Remove($numberStr.Length - $ZeroesToRemove, $ZeroesToRemove)
            return [int]$numberStr
        }
        $yAxisLabels = $yAxis | ForEach-Object { return Get-PersianNumber($_) }

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

        $url = Get-ChartImageUrl -Title $Title -XAxis $xAxis -XAxisLabels $xAxisLabels -YAxis $yAxis -YAxisLabels $yAxisLabels -Color $chartColor

        $chartsMarkDown += "`r`n`r`n<img src='$url' />"
    }

    return $chartsMarkDown
}

Function Set-ChartSection($ChartsMarkDown) {
    $markDown = $ChartsMarkDown.Trim()
    $chartsFilePath = "./charts.md"
    $chartsContents = Get-Content -Path $chartsFilePath -Raw
    $indexOfStart = $chartsContents.IndexOf($ChartsPlaceHolderStart)
    if ($indexOfStart -ge 0) {
        $indexOfStart += $ChartsPlaceHolderStart.Length
        $indexOfEnd = $chartsContents.IndexOf($ChartsPlaceHolderEnd)
        if ($indexOfEnd -ge $indexOfStart) {
            $chartsContents = $chartsContents.
                Remove($indexOfStart, $indexOfEnd - $indexOfStart).
                Insert($indexOfStart, "`r`n`r`n$markDown`r`n`r`n")
        }
    }

    Set-Content -Path $chartsFilePath -Value $chartsContents -NoNewline
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
                        font      = @{
                            size = $DefaultChartFontSize
                        }
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
                xAxes = @(
                    @{
                        type  = 'time'
                        time  = @{
                            unit = 'day'
                        }
                        ticks = @{
                            fontSize = $DefaultChartFontSize
                        }
                    },
                    @{
                        type   = 'category'
                        labels = $XAxisLabels
                        ticks  = @{
                            fontSize = $DefaultChartFontSize
                        }
                    }
                )
                yAxes = @(
                    @{
                        ticks = @{
                            fontSize    = $DefaultChartFontSize
                            beginAtZero = $false
                        }
                    }
                )
            }
        }
    }
    $dataJson = $data | ConvertTo-Json -Depth 100 -Compress

    $dataJsonEscaped = [uri]::EscapeDataString($dataJson)

    $backgroundColor = "g"
    $bkg = "white"
    return "https://image-charts.com/chart.js/2.8.0?width=600&height=400&backgroundcolor=$backgroundColor&bkg=$bkg&c=$dataJsonEscaped"
}

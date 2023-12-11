Import-Module ./src/modules/lib.psm1 -Force

$dataRootPath = Join-Path "./" "tgju" "current"
Update-PriceDB -DataRootPath $dataRootPath -Mode "daily"
Add-AllCharts

Import-Module ./lib.psm1 -Force
Import-Module ./persian-lib.psm1 -Force

$dataRootPath = Join-Path "./" "tgju" "current"

Update-PriceDB -DataRootPath $dataRootPath
Add-Charts -Keys @('price_dollar_rl', 'price_gbp', 'price_eur', 'mesghal', 'retail_sekee', 'retail_sekeb', 'retail_nim', 'retail_rob', 'retail_gerami')

Import-Module ./src/modules/lib.psm1 -Force

Add-Charts -Keys @(
    'price_dollar_rl', 'price_gbp', 'price_eur', 'mesghal',
    'retail_sekee', 'retail_sekeb', 'retail_nim', 'retail_rob', 'retail_gerami'
)

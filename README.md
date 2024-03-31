# PriceDB

PriceDB is a repository that is getting updated every day with the prices of currencies, gold, etc in IRR (Iranian Rial).

## Usage

Documentation for the API can be found on [prices.readme.io](https://prices.readme.io/). For example to get the price of USD in IRR you can use the following curl command:

Using Curl:

```bash
curl --request GET \
     --url https://api.priceto.day/v1/latest/irr/usd \
     --header 'accept: application/json'
```

Or in PowerShell:

```pwsh
$headers=@{}
$headers.Add("accept", "application/json")
$response = Invoke-WebRequest -Uri 'https://api.priceto.day/v1/latest/irr/usd' -Method GET -Headers $headers
```

There are also charts for some prices in [here](charts.md).

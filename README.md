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

## Charts

* [USD to Toman Chart](https://api.priceto.day/v1/chart/irr/usd?title=%D9%86%D9%85%D9%88%D8%AF%D8%A7%D8%B1%20%D9%82%DB%8C%D9%85%D8%AA%20%D8%AF%D9%84%D8%A7%D8%B1%20%D8%A8%D9%87%20%D9%87%D8%B2%D8%A7%D8%B1%20%D8%AA%D9%88%D9%85%D8%A7%D9%86&rounding=4&precision=1 "نمودار قیمت دلار به هزار تومان")
* [GBP to Toman Chart](https://api.priceto.day/v1/chart/irr/gbp?title=%D9%86%D9%85%D9%88%D8%AF%D8%A7%D8%B1%20%D9%82%DB%8C%D9%85%D8%AA%20%D9%BE%D9%88%D9%86%D8%AF%20%D8%A8%D9%87%20%D9%87%D8%B2%D8%A7%D8%B1%20%D8%AA%D9%88%D9%85%D8%A7%D9%86&rounding=4&precision=1 "نمودار قیمت پوند به هزار تومان")
* [EUR to Toman Chart](https://api.priceto.day/v1/chart/irr/euro?title=%D9%86%D9%85%D9%88%D8%AF%D8%A7%D8%B1%20%D9%82%DB%8C%D9%85%D8%AA%20%DB%8C%D9%88%D8%B1%D9%88%20%D8%A8%D9%87%20%D9%87%D8%B2%D8%A7%D8%B1%20%D8%AA%D9%88%D9%85%D8%A7%D9%86&rounding=4&precision=1 "نمودار قیمت یورو به هزار تومان")
* [Gold Miskal to 1000 Tomans Chart](https://api.priceto.day/v1/chart/irr/gold-miskal?title=%D9%86%D9%85%D9%88%D8%AF%D8%A7%D8%B1%20%D9%82%DB%8C%D9%85%D8%AA%20%D9%85%D8%AB%D9%82%D8%A7%D9%84%20%D8%B7%D9%84%D8%A7%20%D8%A8%D9%87%20%D9%85%DB%8C%D9%84%DB%8C%D9%88%D9%86%20%D8%AA%D9%88%D9%85%D8%A7%D9%86&rounding=7&precision=1 "نمودار قیمت مثقال طلا به میلیون تومان")
* [Sekke Emami to 1000 Tomans Chart](https://api.priceto.day/v1/chart/irr/coin-emami?title=%D9%86%D9%85%D9%88%D8%AF%D8%A7%D8%B1%20%D9%82%DB%8C%D9%85%D8%AA%20%D8%B3%DA%A9%D9%87%20%D8%A7%D9%85%D8%A7%D9%85%DB%8C%20%D8%A8%D9%87%20%D9%85%DB%8C%D9%84%DB%8C%D9%88%D9%86%20%D8%AA%D9%88%D9%85%D8%A7%D9%86&rounding=7&precision=1 "نمودار قیمت سکه امامی به میلیون تومان")
* [Sekke Bahar Azadi to 1000 Tomans Chart](https://api.priceto.day/v1/chart/irr/coin-baharazadi?title=%D9%86%D9%85%D9%88%D8%AF%D8%A7%D8%B1%20%D9%82%DB%8C%D9%85%D8%AA%20%D8%B3%DA%A9%D9%87%20%D8%A8%D9%87%D8%A7%D8%B1%20%D8%A2%D8%B2%D8%A7%D8%AF%DB%8C%20%D8%A8%D9%87%20%D9%85%DB%8C%D9%84%DB%8C%D9%88%D9%86%20%D8%AA%D9%88%D9%85%D8%A7%D9%86&rounding=7&precision=1 "نمودار قیمت سکه بهار آزادی به میلیون تومان")
* [Nim Sekke Bahar Azadi to 1000 Tomans Chart](https://api.priceto.day/v1/chart/irr/coin-baharazadi-nim?title=%D9%86%D9%85%D9%88%D8%AF%D8%A7%D8%B1%20%D9%82%DB%8C%D9%85%D8%AA%20%D9%86%DB%8C%D9%85%20%D8%B3%DA%A9%D9%87%20%D8%A8%D9%87%D8%A7%D8%B1%20%D8%A2%D8%B2%D8%A7%D8%AF%DB%8C%20%D8%A8%D9%87%20%D9%85%DB%8C%D9%84%DB%8C%D9%88%D9%86%20%D8%AA%D9%88%D9%85%D8%A7%D9%86&rounding=7&precision=1 "نمودار قیمت نیم سکه بهار آزادی به میلیون تومان")
* [Rob Sekke Bahar Azadi to 1000 Tomans Chart](https://api.priceto.day/v1/chart/irr/coin-baharazadi-rob?title=%D9%86%D9%85%D9%88%D8%AF%D8%A7%D8%B1%20%D9%82%DB%8C%D9%85%D8%AA%20%D8%B1%D8%A8%D8%B9%20%D8%B3%DA%A9%D9%87%20%D8%A8%D9%87%D8%A7%D8%B1%20%D8%A2%D8%B2%D8%A7%D8%AF%DB%8C%20%D8%A8%D9%87%20%D9%85%DB%8C%D9%84%DB%8C%D9%88%D9%86%20%D8%AA%D9%88%D9%85%D8%A7%D9%86&rounding=7&precision=1 "نمودار قیمت ربع سکه بهار آزادی به میلیون تومان")
* [Sekke 1 Grami to 1000 Tomans Chart](https://api.priceto.day/v1/chart/irr/coin-gerami?title=%D9%86%D9%85%D9%88%D8%AF%D8%A7%D8%B1%20%D9%82%DB%8C%D9%85%D8%AA%20%D8%B3%DA%A9%D9%87%20%DA%AF%D8%B1%D9%85%DB%8C%20%D8%A8%D9%87%20%D9%85%DB%8C%D9%84%DB%8C%D9%88%D9%86%20%D8%AA%D9%88%D9%85%D8%A7%D9%86&rounding=7&precision=1 "نمودار قیمت سکه گرمی به میلیون تومان")

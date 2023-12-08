# PriceDB

PriceDB is a repository that is getting updated every day with the prices of currencies, gold, etc in IRR (Iranian Rial).

Currently the data is fetched from tgju.org website, using <https://call1.tgju.org/ajax.json> URL.

The data is updated every day using its github action.

## Usage

By running the following command you can get the latest price of EUR in IRR:

Using bash:

```bash
curl https://raw.githubusercontent.com/margani/pricedb/main/tgju/current/price_dollar_rl/latest.json
```

Using PowerShell:

```powershell
(iwr https://raw.githubusercontent.com/margani/pricedb/main/tgju/current/price_dollar_rl/latest.json).Content
```

## Data Structure

The data is stored in two files for each item in the response from tgju.org website:

- `latest.json`: Contains the latest price of the item, which will be updated every time by the response from tgju.org website.
- `history.json`: Contains the history of the item, the latest price is appended to the end of the file only if history doesn't have that price already, the comparison is done using the `ts` field.

All you need to find out, is the key name of the item in the response from tgju.org website, and then you can use that key name to get the latest price and history of that item.

Some of the interesting key names you can use:

| Key Name          | Description        | Latest Price                                                                                                   |
| ----------------- | ------------------ | -------------------------------------------------------------------------------------------------------------- |
| `price_dollar_rl` | USD in IRR         | [latest.json](https://raw.githubusercontent.com/margani/pricedb/main/tgju/current/price_dollar_rl/latest.json) |
| `price_gbp`       | GBP in IRR         | [latest.json](https://raw.githubusercontent.com/margani/pricedb/main/tgju/current/price_gbp/latest.json)       |
| `price_eur`       | EUR in IRR         | [latest.json](https://raw.githubusercontent.com/margani/pricedb/main/tgju/current/price_eur/latest.json)       |
| `mesghal`         | مثقال طلا           | [latest.json](https://raw.githubusercontent.com/margani/pricedb/main/tgju/current/mesghal/latest.json)         |
| `retail_sekee`    | سکه امامی          | [latest.json](https://raw.githubusercontent.com/margani/pricedb/main/tgju/current/retail_sekee/latest.json)    |
| `retail_sekeb`    | سکه بهار آزادی     | [latest.json](https://raw.githubusercontent.com/margani/pricedb/main/tgju/current/retail_sekeb/latest.json)    |
| `retail_nim`      | نیم سکه بهار آزادی | [latest.json](https://raw.githubusercontent.com/margani/pricedb/main/tgju/current/retail_nim/latest.json)      |
| `retail_rob`      | ربع سکه بهار آزادی | [latest.json](https://raw.githubusercontent.com/margani/pricedb/main/tgju/current/retail_rob/latest.json)      |
| `retail_gerami`   | سکه گرمی           | [latest.json](https://raw.githubusercontent.com/margani/pricedb/main/tgju/current/retail_gerami/latest.json)   |

The URL for history is the same as the latest price, except that you need to replace `latest.json` with `history.json` in the URL.
You can find the full list of key names in the response from tgju.org website, [here](https://github.com/margani/pricedb/tree/main/tgju/current).

## Charts

[//]: # (START_CHARTS)

Hi!

[//]: # (END_CHARTS)

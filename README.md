# PriceDB

PriceDB is a repository that is getting updated every day with the prices of currencies, gold, etc in IRR (Iranian Rial).

Currently the data is fetched from tgju.org website, using <https://call1.tgju.org/ajax.json> URL.

The data is updated every day using the github action for this purpose.

## Usage

By running the following command you can get the latest price of EUR in IRR:

Using bash:

```bash
curl https://raw.githubusercontent.com/margani/pricedb/master/EUR/latest.json)
```

Using PowerShell:

```powershell
(iwr https://raw.githubusercontent.com/margani/pricedb/master/EUR/latest.json).Content
```

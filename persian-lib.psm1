Function Get-PersianNumber($number) {
    $persianDigits = @("۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹")
    $persianNumber = ""
    $number.ToString().ToCharArray() | ForEach-Object {
        $persianNumber += $persianDigits[[int]$_ - 48]
    }
    return $persianNumber
}

Function Get-PersianMonthName($Month) {
    $MonthName = @{
        1  = "فروردین"
        2  = "اردیبهشت"
        3  = "خرداد"
        4  = "تیر"
        5  = "مرداد"
        6  = "شهریور"
        7  = "مهر"
        8  = "آبان"
        9  = "آذر"
        10 = "دی"
        11 = "بهمن"
        12 = "اسفند"
    }
    return $MonthName[$Month]
}

# PixelHub 0.3 — raport roboczy balansu

| Runda | Przyjęcia | Wysyłki | Stan końcowy |
|---:|---:|---:|---:|
| 1 | 4 | 0 | 4 |
| 2 | 6 | 2 | 8 |
| 3 | 20 | 8 | 20 |
| 4 | 12 | 10 | 22 |
| 5 | 14 | 12 | 24 |
| 6 | 17 | 16 | 25 |
| 7 | 18 | 18 | 25 |
| 8 | 20 | 19 | 26 |
| 9 | 22 | 20 | 28 |
| 10 | 24 | 24 | 28 |
| 11 | 24 | 22 | 30 |
| 12 | 26 | 24 | 32 |
| 13 | 28 | 27 | 33 |
| 14 | 30 | 28 | 35 |
| 15 | 32 | 31 | 36 |
| 16 | 34 | 33 | 37 |
| 17 | 35 | 33 | 39 |
| 18 | 38 | 37 | 40 |
| 19 | 39 | 39 | 40 |
| 20 | 42 | 40 | 42 |
| 21 | 43 | 41 | 44 |
| 22 | 45 | 44 | 45 |
| 23 | 47 | 45 | 47 |
| 24 | 50 | 48 | 49 |
| 25 | 51 | 50 | 50 |
| 26 | 53 | 61 | 42 |
| 27 | 55 | 63 | 34 |
| 28 | 57 | 65 | 26 |
| 29 | 60 | 70 | 16 |
| 30 | 64 | 80 | 0 |
| Razem | 1010 | 1010 | 0 |

## Ekonomia

| Stawka | Przed | Projekt aktualizacji |
|---|---:|---:|
| Rozładunek | 10 | 5 |
| Przechowanie | 5 | 1 |
| Dostawa | 20 | 14 |
| Pracownik | 120 | 180 |
| MIX | 160 | 300 |
| Chłodnia | 120 | 140 |
| Piesek | 180 | 450 |
| Rozbudowa auta | 50 | 150 |
| Dodatkowe auto | 200 | 600 |

## Weryfikacja

Kampania ma 1010 przyjęć i 1010 wysyłek według manifestów. Raport z fizycznego przejścia zapisuje rzeczywiste przyjęcia, wysyłki, koszty operacyjne, inwestycje i saldo każdej ukończonej rundy. Zaczyna z 585 USD i kupuje Magazyn LV2 przed rundą 5 i LV3 przed rundą 7. Ładunki o wspólnym adresacie jadą razem. Zakup LV4 zostaje odłożony, żeby zabezpieczyć obowiązkowe wyposażenie w rundzie 22.

Chrome potwierdził podstawienie CMR jednym kliknięciem, zaplanowanie trzech ruchów za aktywnym zleceniem, przejście do odprawy i odrzucenie kontraktu. Zrzuty: kolejki.png, kontrakty.png.
Pełny przebieg bez kontraktów zakończył się zwycięstwem po 30 rundach: 1010 przyjęć, 1010 wysyłek, pusty magazyn, 19 542 USD przychodów, 17 223 USD kosztów operacyjnych, 1610 USD inwestycji i 1294 USD salda. Szczegóły rund zawierają pliki przebieg-kampanii.csv i saldo.svg.

| Strategia / saldo USD | R5 | R10 | R15 | R20 | R25 | R30 |
|---|---:|---:|---:|---:|---:|---:|
| Bez kontraktów | 613 | 487 | 612 | 804 | 701 | 1294 |
| Aktywne kontrakty | 752 | 904 | 443 | 1086 | 1571 | 2796 |

Próba aktywnych kontraktów została wznowiona z fizycznego zapisu w rundzie 21 i ukończyła kampanię z 27 zrealizowanymi kontraktami. Próba wczesnego LV4 zostawiła 54 USD po R21 i zatrzymała się przed obowiązkowym zakupem wyposażenia za 140 USD w R22.

Produkcja: https://pixelhub-03-marcin.marcintrendziuk.chatgpt.site

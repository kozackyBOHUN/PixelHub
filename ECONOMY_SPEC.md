# Ekonomia 0.3

„Ostatni magazyn” startuje od 0 USD. Wcześniejsza kampania zachowuje swój start 585 USD. Rozładunek 5 USD za paletę, przechowanie 1 USD za paletę w rozliczonej rundzie, dostarczenie 14 USD. Premia za kwalifikowaną paletę priorytetową wynosi 8 USD. Pensja wynosi 20 USD na pracownika za ukończoną rundę. Rampa kosztuje 10 USD na rundę. Transport to 15 USD za 15 s naliczanego czasu kursu, zależnego od liczby kolorów ładunku. Rozliczenie pokazuje przychody, koszty i kursy.

Moduły każdej strefy kosztują 200, 400, 800, 1600 USD i dalej podwajają cenę. Pracownik 180, MIX 300, chłodnia (4 pola) 140, serwis 100, mroźnia 190, rozszerzenie temperatur 140, Piesek 450, nowe auto 600, zwiększenie pojemności o dwa sloty 150 USD. Dostępność zakupów zależy od funkcji, układu i odprawy. Katalog w src/campaign.ts zawiera także identyfikatory starszych inwestycji. Koszty utrzymania sprzętu rozlicza kod rundy w src/campaign-game.ts.

[Aktualny audyt stabilności i ekonomii](docs/STABILITY-AUDIT.md) · [Historyczny raport i porównanie stawek](docs/RAPORT-BALANS.md) · [Wyniki rund](docs/przebieg-kampanii.csv) · [Saldo](docs/saldo.svg)

Utrzymanie za rundę w USD: dodatkowy moduł 8, mikser 12, pakiet chłodni 6, mroźnia 18 lub 36 po rozszerzeniu, Piesek 7, dodatkowe auto 10.

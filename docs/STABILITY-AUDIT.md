# Audyt stabilności i ekonomii — 2026-11-17

Punkt wyjścia: najnowszy `main` 37695ba, zawierający aktualne portrety Mai i Leny. Zachowano moduły, fizyczny transport i wszystkie ceny. Nie dodano kapitału ani premii zastępującej 520 USD.

## Przyczyny i poprawki

- Cztery atlasy pracownika były pobierane przy pierwszym użyciu. Start czeka teraz na manifest i wszystkie wymagane atlasy. Błędy zasobów nadal trafiają do diagnostyki i kontrolowanego placeholdera.
- Podnoszenie i odkładanie po pchaniu wybierało spoczynkowy kierunek ciągnięcia, obracając postać o 180°. Teraz stan stacjonarny zachowuje kierunek i właściwą klatkę push/pull. Nie przemalowano PNG. Porównano wszystkie 112 klatek, osiem kierunków, kotwice i uchwyty. Zmiany widoku twarzy/pleców i położenia rąk wynikają z kierunku, nie z podmiany postaci.
- Bezpośredni rozładunek do własnego auta pomijał wynagrodzenie +5 USD. Każda prawidłowo odłożona paleta dostaje je raz, niezależnie od odłożenia na podłogę lub do auta.
- Rampa wysyłkowa w fabule jest opłacana od R1, ponieważ własne auto jest dostępne od początku. Usunięto premię 520 USD oraz zapowiedź w samouczku. Nie zmieniono obowiązkowych manifestów i terminów sezonu.
- Wysyłka nie pozwala wykonać kursu, którego rzeczywisty przychód wraz z gotówką nie pokrywa kosztu. Nie blokuje prawidłowego startu z zerem. Księgowanie i istniejące zabezpieczenia rozliczają każdą operację tylko raz.
- Sprzątanie wymaga dojścia obok przeszkody i dwóch sekund pracy. Kartony, połamane palety, opony i złom mają oddzielne pixelartowe kształty. Koszt 5 USD następuje przy usunięciu; anulowanie, zapis w trakcie i zajęta droga nie duplikują kosztu. Kolejka nie przejmuje sprzątającego pracownika.
- Dopasowanie kamery uwzględnia cały aktualny magazyn i rampy. Zmniejszono udział paneli w wysokości okna. Rozliczenie poprzedniej rundy można rozwinąć na odprawie.
- Starsza kampania nie jest automatycznie importowana. Jawny przycisk zachowuje oryginalny zapis. Starsze aktywne kontrakty otrzymują brakujące pola stawek i klienta, zapobiegając saldu NaN.
- Pokazana odprawa rundy swobodnej jest zapisywana przed zakupami. Generator miesza kolory i używa usług wyłącznie przy posiadanym wyposażeniu; nie zwiększa manifestów bez końca.

## Rzeczywista ekonomia

Pierwsza runda: 40 USD rozładunku + 112 USD dostaw − 60 USD kursów − 20 USD pensji − 20 USD dwóch ramp = **52 USD**. Dwa kursy mieszane kosztują 90 USD: wynik **22 USD**. Oba warianty przeszły fizyczny transport ośmiu palet.

Wariant ostrożny, bez dodatkowych kontraktów (saldo uwzględnia inwestycje):

| Runda | Przychody | Koszty operacyjne | Inwestycje | Saldo końcowe USD |
|---|---:|---:|---:|---:|
| 1 | 152 | 100 | 0 | 52 |
| 2 | 86 | 95 | 0 | 43 |
| 3 | 232 | 130 | 0 | 145 |
| 4 | 222 | 145 | 0 | 222 |
| 5 | 262 | 153 | 200 | 131 |

W R2 uwzględniono sprzątnięcie dwóch pól za 10 USD. Pierwsza rozbudowa następuje w R5. Stałe koszty rosną wraz z rzeczywistymi rampami i pracownikami. Nie można od razu kupić wszystkiego; rezerwa na obowiązkowe wyposażenie ma znaczenie.

Wariant z dobrowolnymi standardowymi zleceniami: salda R1–5 **52, 97, 239, 385, 364 USD**; pierwsza rozbudowa także R5. Standardowe oferty fabuły są dostępne od R2 zamiast R4; zachowują istniejące stawki, liczbę palet i fizyczne CMR. To świadoma zmiana dostępności dobrowolnego zarobku, nie dotacja ani zmiana obowiązkowego sezonu. Operator testowy rezerwuje pieniądze na wyposażenie zamiast automatycznie kupować LV4.

Fizyczny sezon z 59 standardowymi zleceniami: **1221 przyjętych i 1221 wysłanych palet**, w tym niezmieniona baza **1018** oraz 203 dodatkowe. Runda 30 kończy się saldem **7374 USD**, bez dofinansowania. Odtwarzano również rzeczywiste zapisy pomiędzy rundami. Rundy 31–35 ukończone fizycznie: salda **7356, 7315, 7305, 7256, 7238 USD**. Same niewielkie dostawy po sezonie nie gwarantują zysku przy utrzymywaniu rozwiniętej infrastruktury; dodatkowe kontrakty pozostają dostępne.

## Klienci i relacje

Podłączono rzeczywiste osiem plików Mai i Leny z najnowszego repozytorium. Henryk — Piekarnia pod Młynem, Maja — Fundacja Dobre Jutro, Lena — Most Pomocy zachowują historie. Anna, Robert, Kasia, Marek i Wiktor reprezentują standardowe kontrakty, z deterministycznym przypisaniem i historią wykonania. Przyjęcie nie ustawia happy; zadowolenie wymaga wykonania albo powrotu po wcześniejszym sukcesie. Po sezonie powracają regularne zamówienia, bez ponownego odgrywania jednorazowego problemu.

## Testy i dowody wizualne

155 testów mechaniki poza długim przebiegiem sezonu: zaliczone, 0 błędów. Pełny dotychczasowy zestaw 151 testów, obejmujący fizyczną starą kampanię 30 rund, przeszedł przed końcowymi pięcioma regresjami. Końcowy zestaw liczy 156 testów i jest obowiązkowy w publikacji Pages.

Wszystkie 11 zestawów przeglądarkowych zaliczone: gra, grafika, CMR, czytelność, HUD, sorter, flota, sprite’y, stabilność, ekonomia i klienci. Obejmują rzeczywiste kliknięcia i transport, dziesięć wariantów okna/skalowania HUD, zapis w trakcie przewozu i sprzątania, 32 grafiki klientów, dialogi i obsługę klawiaturą. Kontrola typów i build produkcyjny zaliczone.

[112 klatek](screenshots/stability/worker-all-frames.png) · [Magazyn](screenshots/stability/warehouse.png) · [Finanse R1](screenshots/stability/round1-finances.png) · [Sprzątanie](screenshots/stability/cleaning-progress.png)

[Stanie](screenshots/stability/worker-standing.png) · [Chód](screenshots/stability/worker-walk.png) · [Pchanie](screenshots/stability/worker-push.png) · [Ciągnięcie](screenshots/stability/worker-pull.png) · [Cofanie](screenshots/stability/worker-reversing.png) · [Skręt](screenshots/stability/worker-turning.png) · [Podnoszenie](screenshots/stability/worker-lifting.png) · [Odkładanie](screenshots/stability/worker-lowering.png)

[Maja](screenshots/clients/maja-dialog.png) · [Lena](screenshots/clients/lena-dialog.png) · [Osiem postaci ×2](screenshots/clients/osiem-postaci-x2.png)

## Publikacja

Workflow Pages na `main` uruchamia cały zestaw mechaniki, kontrolę typów, build i wdrożenie. Publiczny nagłówek pokazuje pełny identyfikator commita. Po wdrożeniu należy sprawdzić go na [publicznej grze](https://kozackybohun.github.io/PixelHub/) oraz ponownie zweryfikować zasoby, zapis i sterowanie.

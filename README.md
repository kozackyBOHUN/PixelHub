# PixelHub 0.2

Przeglądarkowa gra logistyczna: 30 rund, trwały magazyn, pracownicy z ręcznymi paleciakami, A*/planowanie pełnych manewrów, CMR i rozwój firmy. Rozwinięcie wersji 0.1 w TypeScript + PixiJS 8.

## Kontrakt graficzny

Nowy renderer używa centralnego katalogu zasobów, dokładnej skali 24 px ×2, kamery, kierunkowych klatek i socketów dłoni. Obecnie rysuje placeholdery; po dodaniu PNG pod zadeklarowaną ścieżką używa bitmap bez zmiany symulacji. Diagnostyka: `?dev=1&graphics=1`, klawisz G i panel zasobów.

Instrukcja dla grafika i opis modułów: [GRAPHICS_CONTRACT.md](GRAPHICS_CONTRACT.md). `npm run assets:manifest` eksportuje pełny kontrakt do `public/assets/catalog.json`; `npm run test:graphics` wykonuje techniczny test przeglądarkowy PNG i geometrii. Zestaw `npm run test:browser` obejmuje teraz również ten test, więc istniejące CI uruchamia obie weryfikacje.

## Uruchomienie

Node.js 24 lub nowszy:

```sh
npm ci
npm run dev
```

`npm run build` tworzy produkcyjne `dist/`, `npm run preview` udostępnia build. GitHub Pages publikuje `dist/` przez istniejący workflow po zmianie `main`. Zasoby używają względnych ścieżek.

## Sterowanie i kampania

1. Wybierz kartę CMR i kliknij „Podstaw”. Kolejność dostaw należy do gracza. Dokument wydania również trzeba podstawić.
2. Kliknij pracownika, dostępną paletę, następnie cel: wolne pole albo slot samochodu. Ładuj głębsze miejsca przed tylnymi. Rozładunek odbywa się od tyłu.
3. Po załadowaniu całego manifestu kliknij „Wyślij załadowany samochód”. CMR wymaga konkretnych identyfikatorów; inny kolor ani paleta na późniejszą rundę go nie zastąpią.
4. Zachowuj szerokie przejazdy oraz przestrzeń na osiowe wsunięcie i wycofanie wideł. Zestaw fizycznie wykonuje całą trasę. `Anuluj` / Escape bezpiecznie przerywa manewr; przewożona paleta pozostaje na paleciaku.
5. Rozwój kupujesz w dolnym panelu. Pierwsza rozbudowa dodaje 120 pól na północ (20×12), druga kolejne 120 (20×18). Istniejące palety, rampy i wyśrodkowane pomieszczenia 12×3 zachowują współrzędne.
6. Zatrudnionych pracowników wybierasz na mapie albo w pasku pracowników. Każdy ma własną pozycję, paleciak i zadanie. Rezerwacja pełnej trasy zapobiega konfliktom; zbyt bliskie zadania należy wykonać kolejno.

Paleta: lewy górny róg to liczba rund do wysyłki; prawy górny to priorytet; lewy dolny to temperatura; prawy dolny to uszkodzenie `!` lub zwrot `R`. Szary oznacza zatrzymanie do przyszłej rundy; mały kolorowy znacznik CMR wskazuje przyszłego odbiorcę. W rundzie wysyłki paleta automatycznie przyjmuje kolor docelowy, a licznik znika. Kliknięcie palety pokazuje jej ID i cechy w pasku pod mapą.

Stoper zaczyna się przy podstawieniu dostawy. Pierwsza połowa czasu daje ×2, następne 25% ×1, pozostały czas i przekroczenie terminu ×0,5 przychodu za obsługę. Nie powoduje utraty towaru i nie resetuje się przy zapisie. Pensje wynoszą zawsze **20 USD na pracownika za ukończoną rundę**, pobierane dokładnie raz. Kapitał startowy: 50 USD.

MIX: kup sorter, odstaw kolejno obie palety receptury na pole `(5,−2)`. Towar oczekuje w buforze; komplet dwóch MIX / ośmiu kartonów daje dwie palety po cztery kartony w polach `(9,−5)` i `(10,−5)`. Wynik czeka na wolne miejsca i nie może się powielić. Usuń wyniki przed następną recepturą. Uszkodzenia i zwroty wymagają stanowiska `(12,−2)`. Chłodnia obejmuje osiem pól `(1…8,−4)`, mroźnia osiem `(11…18,−4)`; rozbudowa stref dodaje takie same pola w rzędzie `−7`. Towar o wymaganej temperaturze musi odwiedzić właściwą strefę przed wydaniem i pozostawać w niej, jeśli zostaje na kolejną rundę.

Runda kończy się po obsłużeniu wszystkich dokumentów i procesów. Palety nie znikają przy przejściu dalej. Finał wymaga fizycznego wydania 58 palet, w tym zapasów z poprzednich rund.

## Zapis

Automatycznie co 5 sekund oraz przy opuszczeniu strony; dodatkowo przyciski „Zapisz” / „Wczytaj”. Wersjonowany zapis 0.2 zawiera pozycje, trasy w toku, bufor sortera, CMR, priorytety, zakupy i rozliczenia. Uszkodzony zapis zgłasza błąd i nie jest automatycznie nadpisywany. Nową kampanię można rozpocząć z podsumowania. Zapis v3 automatycznie migruje dotychczasowe zapisy v2: zachowuje pozycje, zadania i fizyczny ładunek, rozdziela kolor docelowy od terminu oraz zamienia wyjazdowe listy ID na zamówienia kolorów. Stara wersja 0.1 nie miała formatu zapisu do migracji.

## Laboratorium rund

Dodaj `?dev=1` do adresu gry. Laboratorium nie pojawia się w normalnej kampanii i używa osobnego klucza zapisu. Wybierz rundę i kliknij „Odtwórz historię do rundy”. Stan wejściowy pochodzi z deterministycznego przejścia wszystkich poprzednich rund przez tego samego pracownika i planer, a nie z samej zmiany numeru.

Dołączony skompresowany pakiet pozwala otworzyć każdą rundę natychmiast. To zapis rzeczywistego, sprawdzonego przejścia wcześniejszych rund. Po zmianie manifestów niezgodny pakiet jest pomijany i historia odtwarzana od początku. Pakiet można odtworzyć poleceniem `node --experimental-strip-types scripts/campaign-playthrough.ts --fixtures`.

Przycisk „Wykonaj fizycznie rundę” przyspiesza wykonywanie prawidłowych poleceń `choose/order/step`. Nie teleportuje ładunków, nie dopisuje pieniędzy i nie pomija procesów. „Sprawdź bilans” pokazuje stan, dokumenty i bufor sortowania. Skoki oraz operator testowy nie modyfikują zwykłego zapisu.

## Weryfikacja

```sh
npm test
npm run build
node --experimental-strip-types scripts/campaign-playthrough.ts
```

Test przeglądarkowy produkcyjnego builda (uruchom wcześniej `npm run preview -- --port 5173`):

```sh
python -m pip install -r scripts/requirements-browser.txt
npm run test:browser
```

Domyślnie korzysta z zainstalowanego Chrome; można podać `CHROMIUM_PATH` albo `BROWSER_CHANNEL`. Wyniki i zrzuty trafiają do `artifacts/browser-0.2/`. Test klika rundę 1 myszką, sprawdza zapis/odczyt, otwiera scenariusze 18 i 30 i fizycznie przechodzi finał przez interfejs laboratorium.

Testy obejmują starą geometrię i transport, dokładne manifesty, cztery oznaczenia, zapis w trakcie podnoszenia, dwa równoległe zadania, zajęte wyjście sortera, temperaturę, uszkodzenia, niewłaściwy CMR oraz **fizyczne przejście rund 1–30** z kontrolą stanu po każdej rundzie. Test przejścia trwa około kilku minut zależnie od komputera. Nie zastępuje oceny wygody i balansu przez gracza.

## Architektura

- `src/campaign-data.json` — konkretne rekordy 30 rund, CMR, palety, identyfikatory, terminy, receptury i cele; bilans 696 przyjęć / 696 wydań / 0 po finale.
- `src/campaign.ts` — typy konfiguracji, walidacja manifestów i kartonów, kolory, parametry priorytetów i ceny rozwoju.
- `src/campaign-game.ts` — trwały stan, CMR, rezerwacje pracowników, rozbudowa, procesy i rozliczenia.
- `src/save.ts` — zapis v2 z sumą kontrolną i odtwarzaniem zadań w toku.
- `src/developer.ts` — deterministyczny operator wykorzystujący rzeczywisty transport.
- `src/simulation.ts`, `src/pathfinding.ts`, `src/transport.ts` — zachowany silnik transportu 0.1, rozszerzony o granice rozbudowanej hali i kontrolę wyjazdu do głównego przejazdu.
- `src/renderer.ts`, `src/main.ts` — wspólny system zasobów PNG/placeholderów, kamera, oznaczenia, sprzęt i polski interfejs kampanii.

Specyfikacje w `PixelHub_Codex_Pack/`, wcześniejsze notatki i audyt opisują historyczną wersję 0.1. Rozbieżności mapy i rund rozstrzyga konfiguracja kampanii 0.2.

## Świadome uproszczenia

Sorter i serwis przetwarzają towar po fizycznym odstawieniu i wycofaniu wideł; nie mają minigier ani symulacji zużycia energii. Receptury to pary 2→2 zachowujące kolory i liczbę kartonów. CMR wyjazdowy jest obsługiwany bezpłatnym pojazdem o czterech miejscach, przyjazdy mają modułowe przestrzenie do ośmiu miejsc. Pełne trasy są rezerwowane konserwatywnie; brak automatycznej kolejki i robotów. Grafika rozwija proceduralne sprite’y 0.1; nie dodano zewnętrznego atlasu docelowych assetów.

## Poprawka grywalności CMR

Przyjazdy i wyjazdy mają oddzielne pionowe, przewijane listy dokumentów. Karty pokazują wszystkie palety, stan oraz postęp. Kliknij dokument, a następnie wybierz rampę. W rundzie 3 można podstawić dowolny z dokumentów 8/8/4.

Zwykłe wyjazdy zamawiają ilości kolorów (`requirements`), nie identyfikatory. Dowolna gotowa paleta właściwego koloru realizuje zamówienie. Dodatkowe wymagania temperatury, jeśli skonfigurowane, są jawnie opisane na karcie. Towary muszą wcześniej przejść potrzebne sortowanie, serwis i przechowanie w odpowiedniej temperaturze. Limity uwzględniają również zlecenia innych pracowników.

`src/shipments.ts` wylicza wygląd i dopasowanie. Kafelki i licznik wynikają z faktycznego ładunku po odłożeniu palety; wyładunek cofa postęp. Po wysyłce `shippedPalletIds` przechowuje wyłącznie dowód faktycznie wysłanych palet. Pola `color`/`dueRound` pozostają zgodnymi aliasami starszego silnika; właściwe dane kampanii to `destinationColor`/`dispatchRound`.

Testy akceptacyjne A–H i rezerwacje współbieżne: `tests/cmr.test.ts`. Test produkcyjnej strony, pionowych kart, telefonu, fizycznego załadunku i zapisu: `python scripts/cmr_browser_test.py` (serwer pod `PIXELHUB_URL`). Scenariusze laboratoryjne v3 pochodzą z pełnego fizycznego przejścia 30 rund; można odtworzyć je poleceniem `node --experimental-strip-types scripts/campaign-playthrough.ts --fixtures`.

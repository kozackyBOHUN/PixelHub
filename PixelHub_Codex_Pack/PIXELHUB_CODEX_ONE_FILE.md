# PIXELHUB — START HERE (PROMPT DO CODEXA)

Jesteś głównym inżynierem gameplay oraz UI. Zbuduj **działający, przeglądarkowy prototyp PixelHub MVP**, w którym można rzeczywiście ukończyć **rundy 1 i 2** oraz przegrać przez bankructwo. Projekt jest etapem większego PixelCargo, ale ma działać samodzielnie. Cała treść interfejsu ma być po polsku.

## Materiały wejściowe (przeczytaj w tej kolejności)
1. `PIXELHUB_MVP_SPEC.md` — **źródło prawdy** dla reguł, stanów i zachowań.
2. `game-config.json` — parametry, współrzędne i dane dwóch rund; w implementacji utwórz odpowiadający mu typowany plik konfiguracji lub wczytaj JSON.
3. `ACCEPTANCE_TESTS.md` — testy odbiorowe; traktuj jako obowiązkowe kryteria ukończenia.
4. `exact_grid_20x6.png` — dokładna mapa, rozrysowana programowo na podstawie siatki.
5. `REFERENCE_visual_only_not_to_scale.png` — **wyłącznie inspiracja plastyczna**, NIE używaj jej do ustalania wymiarów mapy, liczby skrzyń, cen, ilości rund ani ustawienia aut.

## Kolejność pracy (bez zbędnych pytań)
1. Sprawdź istniejące repozytorium oraz `package.json` i dopasuj się do obecnego stosu. **Nie kasuj istniejącego projektu ani zmian.** Jeśli repo jest puste, załóż Vite + TypeScript + PixiJS dla renderingu 2D. Wersje bibliotek wybierz zgodne z istniejącym repo / aktualnie instalowalne, bez zgadywania historycznych API.
2. Najpierw zbuduj **deterministyczny model danych**: 20×6, 36 statycznych pól pomieszczeń, rampy i gniazda ładunkowe 2×2. Weryfikuj przy starcie w debug, że wszystkie granice i pola są poprawne.
3. Następnie silnik symulacji niezależny od rendereru: czas gry, logika skrzyń, zasady dostępu do samochodu, trasowanie zestawu 1×2, wydawanie zadań, zarobki, pensje i bankructwo.
4. Następnie renderowanie jednej stałej mapy, klikane obiekty oraz HUD; grafika spójna, pastelowy pixel art, lekko izometryczna perspektywa podobna do referencji, **zawsze z czytelnymi 20×6 kratkami**.
5. Na końcu rundy, testy automatyczne logiki oraz test przejścia całego scenariusza w przeglądarce. Uruchom build i testy. Napraw błędy przed zakończeniem.

## Krytyczne, nienegocjowalne zasady
- Magazyn ma **dokładnie 20 kolumn × 6 rzędów = 120 pól**; żadnych dodatkowych pól w hali. Są 2 rampy po **1×4** na jej krótkich końcach. Dwa samochody (w rundzie 2) dokują **prostopadle do szczytowych ścian**: ich długa oś jest równoległa do osi 20 pól hali. Nie kopiuj błędnego ustawienia aut z grafik.
- Pomieszczenia socjalne są w **dolnej środkowej części hali**, mają dokładne wymiary i blokują pola. **Nie dodawaj** regałów ani dekoracyjnych skrzyń wewnątrz hali, które zmieniałyby logikę lub jej wolną powierzchnię.
- Skrzynia = dokładnie 1 pole. Pracownik + ręczny paleciak = zestaw 1×2. Trasowanie musi uwzględniać cały zestaw, kierunek i przestrzeń na skręt. Ruch 8-kierunkowy, bez przechodzenia przez narożniki przeszkód.
- Sterowanie: wybierz pracownika → skrzynię → miejsce docelowe. **Bez kolejki zadań**. Ścieżka tylko przy zaznaczonym pracowniku; niebieska na pusto, zielona z ładunkiem, czerwona na zablokowanym odcinku. Po zablokowaniu zadanie NIE znika.
- Pojazd przy rampie jest rozszerzeniem siatki: można załadować konkretny slot i wyjąć z niego dostępną skrzynię, ale nie można sięgnąć przez skrzynię bliższą tylnym drzwiom.
- Runda 1: 1 CMR, 4 skrzynie (2 wyblakłoczerwone + 2 wyblakłoniebieskie), tylko rozładunek i magazynowanie. Runda 2: te 4 zmieniają się w aktywne; kolejne 4 przyjeżdżają (2 czerwone + 2 niebieskie); własny bus 2×2 dostaje się ZA DARMO. Wyślij łącznie 8 skrzyń. 1 kolor w kursie = 30 s, 2 kolory = 45 s czasu gry; bus wraca pusty.
- Ekonomia: początek **50 $**; +10 $ za rozładowaną i odłożoną skrzynię; +5 $ za skrzynię przechowaną do następnej rundy; +20 $ za dostarczoną skrzynię. Pensja jednego aktywnego magazyniera: **−20 $ za każdą pełną minutę czasu gry**, jednorazowe zdarzenie co 60 s. Saldo ≤0 $ => natychmiast **GAME OVER**.
- x1/x2/x4 przyspiesza JEDEN zegar symulacji, więc również ruch, pensje i czas dostaw. Nie naliczaj kosztów inaczej przy zmianie prędkości.
- Testowe prędkości: pusty 0,8 s/pole; załadowany 1,2 s/pole; podjęcie 1,5 s; odstawienie 1,5 s. Parametry muszą być łatwe do zmiany w jednej konfiguracji.
- UI **po polsku**, waluta wyłącznie **$**, licznik **Runda 1/2** i **Runda 2/2** (nie 1/3). Przybywające CMR wiszą u góry z lewej i pokazują same ikony skrzyń; **nie ma CMR wychodzących**.

## Definicja ukończenia
Prototyp jest ukończony wyłącznie wtedy, gdy uruchamia się lokalnie, pozwala bez oszukiwania przejść obie rundy i spełnia testy odbiorowe. Nie kończ na statycznej makiecie. Jeśli napotkasz techniczną dwuznaczność, wybierz najmniejszą bezpieczną implementację zgodną ze specyfikacją, zapisz ją w `IMPLEMENTATION_NOTES.md` i NIE dodawaj nowej mechaniki gameplayu na własną rękę.

Na końcu zwróć: sposób uruchomienia, strukturę plików, wyniki testów, listę faktycznie zrealizowanych funkcji i ewentualne otwarte problemy. Nie deklaruj funkcji, które nie działają.


---

# PixelHub MVP — Specyfikacja implementacyjna 1.0

**Status:** wymagania na pierwszą, grywalną wersję (rundy 1–2). **Cel:** deterministyczny, rozszerzalny symulator logistyczny 2D w przeglądarce. Świat gry oparty na kratkach; renderowanie 2.5D w pastelowym pixel arcie. Mechanika ma pierwszeństwo nad dekoracjami.

## 0. Priorytet źródeł i ważne rozróżnienia

1. Niniejszy tekst i `game-config.json` są źródłem prawdy; `ACCEPTANCE_TESTS.md` doprecyzowuje warunki sprawdzania.
2. Renderowany screen referencyjny to **koncepcja wyglądu**, nie dosłowna mapa: może mieć zbyt wiele kratek, skrzyń, nieprawidłowe samochody, euro, trzecią rundę lub nieprawidłowe CMR. Takich błędów nie wolno kopiować.
3. Nie twórz nowych mechanik bez potrzeby: samouczek ma mieć tylko dwie rundy. Nie trzeba implementować wszystkiego, co w przyszłości jest przewidziane dla PixelCargo.
4. Wszystkie czasy poniżej są w **sekundach czasu gry**, niezależnie od FPS i prędkości odtwarzania.
5. Wymiary pomieszczeń oznaczają **pola zajęte na siatce**. Rzut 2.5D nie może zmieniać logiki ani countu.

## 1. Mapa i geometria (konkretne współrzędne)

Przyjmij współrzędne `(x, y)`; `x=0..19` od lewej do prawej, `y=0..5` od górnej krawędzi do dolnej. Jest dokładnie `20 × 6 = 120` pól siatki. Każda skrzynia magazynowa zajmuje jedno `(x,y)`. Zestaw człowiek-paleciak potrzebuje 2 pól i wolnego miejsca na manewr.

### 1.1. Statyczne pomieszczenia (36 pól)

| Pomieszczenie | Współrzędne inkluzywne | Wymiar | Pola |
|---|---|---|---:|
| Biuro | `x=4..6`, `y=2..5` | 3×4 | 12 |
| Szatnia | `x=7..9`, `y=3..5` | 3×3 | 9 |
| Stołówka (przylega do szatni) | `x=10..12`, `y=3..5` | 3×3 | 9 |
| Toaleta | `x=13..14`, `y=3..5` | 2×3 | 6 |
| **Suma** | | | **36** |

Układ to **techniczne uszczegółowienie** zatwierdzonego położenia oraz wielkości. Pomieszczenia mogą mieć widoczne meble i drzwi, ale w MVP są **nieprzechodnie i nieinteraktywne**, nie zatrudniają pracowników i nie symulują potrzeb. Biuro może wyglądać na zajęte przez pracownika biurowego, ale nie wlicza się go do kosztów pensji w MVP. Zablokowane pola nie mogą stać się dostępne wskutek ozdobnego rysunku.

### 1.2. Rampy (8 pól rezerwowanych)

- Lewa rampa ROZŁADUNEK: `x=0, y=1..4`, wielkość 1×4. Aktywna w rundzie 1 i 2.
- Prawa rampa ZAŁADUNEK: `x=19, y=1..4`, wielkość 1×4. Zamknięta w rundzie 1, aktywna w rundzie 2.
- Rampy są polami **operacyjno-przejazdowymi**; nie są zwykłymi miejscami stałego magazynowania. Nie liczymy ich do miejsc składowania skrzyń na podłodze.
- Podstawowy bilans: 120 całkowitych − 36 pomieszczeń − 8 ramp = **76 zwykłych pól przestrzeni** (część musi pozostać przejazdowa!). Rozplanowanie skrzyń i dróg wynika z działań gracza.
- Samochód przyjeżdżający stoi **poza lewą krawędzią** siatki; samochód własny **poza prawą**. Długa oś aut leży na osi X hali (prostopadle do ścian szczytowych). Samochody są poza liczbą 120 pól.

### 1.3. Reszta podłogi

Początkowo pola poza pomieszczeniami i rampami są wolne. Na start **nie rysuj regałów czy porozrzucanych skrzyń z referencji jako przeszkód wewnątrz mapy**. Drobne dekoracje na zewnątrz hali są dopuszczalne i nie są interaktywne. Tak samo zabudowa socjalna ma blokować wyłącznie współrzędne z tabeli.

Schemat programowo wygenerowany w `exact_grid_20x6.png`, a dane w `game-config.json`.

## 2. Reprezentacja danych i architektura

Rozdziel: **stan symulacji** (plain TypeScript i funkcje deterministyczne), **wejście/sterowanie**, **renderer**, **HUD**, **testy**. Sugerowane moduły: `config`, `grid`, `pathfinding`, `warehouse`, `crates`, `cargoSlots`, `employees`, `tasks`, `vehicles`, `contracts`, `economy`, `clock`, `rounds`, `ui`.

Sugerowane typy (nazwy mogą być zmienione, semantyka nie):

```ts
type GridPoint = { x: number; y: number };
type CrateColor = 'red' | 'blue';
type CrateState = 'incoming' | 'stored_inactive' | 'stored_active' | 'on_outgoing_vehicle' | 'in_delivery' | 'delivered';
type TaskPhase = 'idle' | 'choose_source' | 'choose_destination' | 'to_source' | 'picking' | 'to_destination' | 'dropping' | 'blocked';
type VehicleState = 'absent' | 'arriving' | 'docked' | 'departing' | 'delivering' | 'returning';
type Heading = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
type Slot = { lane: 0 | 1; depth: 0 | 1; crateId: string | null }; // depth=0: przy tylnych drzwiach
```

Każda skrzynia ma unikatowe `id`, kolor i stan, a jeśli jest w magazynie, jej jednoznaczne współrzędne. Skrzyni nie można jednocześnie mieć w dwóch lokalizacjach. W modelu nie trzymaj jednocześnie `gridOccupancy` i `cratePositions` jako niezależnych, niesynchronizowanych źródeł prawdy: jedna reprezentacja główna, druga wyliczana lub spójnie aktualizowana transakcją.

Wymagaj `assertInvariant()` w trybie dev: dokładnie 120 pól, 36 pomieszczeń, 8 ramp, brak nachodzących nieruchomych obiektów, brak skrzyń w ścianach, żadne dwie skrzynie nie zajmują tej samej kratki lub slotu, pieniądze i czasy są skończone, brak zduplikowanych identyfikatorów.

## 3. Skrzynie, barwy i czas przechowywania

1. Skrzynia to **kwadratowy ładunek** 1×1 pole, nie prostokątna paleta.
2. Dwa kierunki dystrybucji w MVP: **czerwony** i **niebieski**.
3. W rundzie 1 cztery skrzynie są **wyblakłoczerwone** i **wyblakłoniebieskie**, po 2 z każdego koloru. Oznaczenie `1` na skrzyni oznacza oczekiwanie **jednej rundy** na aktywację. **Nie są wysyłkowe** w rundzie 1.
4. Przy przejściu do rundy 2 cztery skrzynie z magazynu zmieniają się w nasycone/aktywne czerwone lub niebieskie.
5. Dostawa przychodząca w rundzie 2 to kolejne 4 aktywne skrzynie (2 czerwone, 2 niebieskie); razem **8 do wysłania: 4 czerwone i 4 niebieskie**.
6. Na planszy nie ma żadnych pozostałych „losowych” skrzyń. Odbieranie/nadawanie to zmiana stanów tej samej skrzyni.

## 4. Pracownik, paleciak i kolizje

### 4.1. Zestaw 1×2

Jeden magazynier z ręcznym paleciakiem. Logiczny zestaw składa się z dwóch sąsiadujących modułów: człowiek/punkt prowadzący i paleciak/przestrzeń pod skrzynią. Przy ładunku skrzynia zajmuje przedni/transportowy moduł 1×1, człowiek z widoczną częścią paleciaka drugi. Pusty zestaw także zajmuje 1×2. **Nigdy nie traktuj go jako punktu 1×1.**

Zalecana implementacja kolizji: konfiguracja `pose=(headCell, heading)` plus wyprowadzone położenie modułu drugiego. A* ma działać na **konfiguracjach z orientacją**, nie tylko na pojedynczym `(x,y)`. Przy obrocie lub przejściu na skos kontroluj *swept footprint* (przestrzeń zamiataną przez ciało i paleciak). W szczególności nie wolno wykonać skrótu przez narożniki stykających się skrzyń. Jeśli przestrzeń jest niepewna, zablokuj manewr, nie pozwalaj przenikać przez ścianę.

### 4.2. Ruch i animacja

- 8 możliwych kierunków ruchu; skok ukośny nie jest darmowy: koszt długości geometrycznej `sqrt(2)` w stosunku do ruchu osiowego, skorygowany o szybkość.
- Pracownik jako punkt prowadzący rozpoczyna skręt, paleciak i skrzynia podążają po starym torze przez fragment łuku. Skręt animuj w sposób ciągły i interpolowany (bez teleportacji, obrotów o 90° bez przejścia lub skakania obiektów).
- Wykonanie skrętu wymaga miejsca dla obu modułów i łuku. Model A* powinien uwzględniać ten sam warunek, co faktyczna animacja.
- Dotarcie do skrzyni: obsługa z dostępnej strony. Nie można wejść „na kratkę” skrzyni, żeby ją podnieść.
- Odkładanie: gracz klika wolną kratkę dla skrzyni; po odłożeniu zestaw nie może kolidować z nową przeszkodą.
- Prędkość testowa: `emptyMoveSecondsPerTile=0.8`, `loadedMoveSecondsPerTile=1.2`, `pickupSeconds=1.5`, `dropSeconds=1.5`. Utrzymuj je w jednym pliku konfiguracyjnym.

### 4.3. Blokady

- Trasa jest planowana przy przyjęciu zadania. Wykonuj pierwotną trasę, póki jest przejezdna.
- Jeśli pojawi się przeszkoda, dojedź do najdalszego bezpiecznego punktu na pierwotnej trasie, zatrzymaj się; NIE anuluj automatycznie zadania ani NIE teleportuj pracownika.
- Dalszy zablokowany odcinek ścieżki jest czerwony; zadanie czeka. Gdy pierwotna droga stanie się drożna, można wznowić. Jeśli niemożliwe, użytkownik może ręcznie anulować aktywne polecenie, nie powodując utraty skrzyni.
- Przy jednym pracowniku MVP blokada przez innego pracownika nie wystąpi, ale kod rezerwacji/zajętości przygotuj na przyszłe wielu pracowników. **Nie implementuj drugiego pracownika**.

### 4.4. Kolory tras

Ścieżki renderuj **tylko dla aktualnie zaznaczonego pracownika**:
- niebieska: podróż bez ładunku do źródła,
- zielona: podróż z ładunkiem do celu,
- czerwona: zablokowany pozostały odcinek aktualnej trasy.
Nie rysuj przyszłych tras z kolejki: kolejka w MVP nie istnieje. Kolor drogi nie ma związku z kolorem skrzyni.

## 5. Wydawanie zadań (ściśle trzy kliknięcia)

Gracz kliknięciami wybiera: **(1) pracownika → (2) skrzynię → (3) docelową kratkę lub dostępny slot samochodu**.

- Po kliknięciu pracownika u góry na środku pojawia się widoczna opcja `Anuluj`, która resetuje bieżącą sekwencję wyboru. Po wyborze skrzyni nadal można anulować przed wskazaniem celu.
- Jeśli kliknięta skrzynia jest zablokowana w aucie lub nieosiągalna, nie przechodź do trzeciego kroku; pokaż czytelne wyjaśnienie i podświetl blokującą skrzynię.
- Jeśli cel jest zajęty, nieistniejący, zablokowany, jest nieczynną rampą lub jest niedostępny dla zestawu 1×2, nie uruchamiaj zadania; pokaż przyczynę i pozwól wskazać inny cel.
- W MVP pracownik może wykonywać **jedno zadanie na raz**. Nie kolejkować i nie przyjmować kolejnego, dopóki poprzednie nie skończy się lub nie zostanie ręcznie anulowane.
- Dla kliknięć na skrzyniach w ruchomym paleciaku nie twórz duplikatów ani alternatywnego zadania.
- Gracz sam wybiera miejsce składowania oraz dokładny slot auta; AI nie optymalizuje tych wyborów.

## 6. Pojazdy i dokładna logika dostępu

### 6.1. Wirtualna przestrzeń ładunkowa 2×2

Pojazdy mają w MVP 4 sloty w dwóch pasach (`lane=0/1`) i na dwóch głębokościach (`depth=0` blisko tylnych drzwi, `depth=1` dalej wewnątrz). Są **poza magazynowymi 120 polami**, ale są interaktywnymi celami/źródłami zadań.

```
  PRZÓD POJAZDU
  [F-L] [F-R]   ← depth = 1
  [R-L] [R-R]   ← depth = 0, przy DRZWIACH TYLNYCH
        DRZWI
```

- Można wyjąć skrzynię z konkretnego pasa, tylko jeśli między nią a tylnymi drzwiami w **tym samym pasie** nie ma innej skrzyni.
- Analogicznie można wstawić skrzynię do dalszego slotu tylko gdy droga dojścia przez tylny slot danego pasa jest wolna. Aby zapełnić bus, należy ładować przednie sloty przed tylnymi.
- Przykład: jeśli w tylnej prawej pozycji jest skrzynia 3, nie można zabrać przedniej prawej skrzyni 1, nawet jeśli inne pasy opróżniono.
- Wyjęta skrzynia znika z danego slotu **dopiero przy zakończonym podjęciu**. Złożona skrzynia pojawia się w slocie **dopiero po wykonanej operacji odstawienia**. W trakcie ruchu ma jednego właściciela — pracownika.
- Dostępność slotów aktualizuj po każdej zmianie ładunku. Waliduj ją niezależnie od renderingu.

### 6.2. Lewy, przychodzący bus

- Wisi jedno obowiązkowe CMR po lewej stronie górnego interfejsu. Po kliknięciu/zaakceptowaniu pod rampę podjeżdża jeden bus z czterema skrzyniami w 2×2.
- Gracz sam ustala kolejność zgodną z dostępem od tylnych drzwi i odkłada skrzynie w dowolnych dozwolonych miejscach własnej podłogi.
- Gdy ostatnia skrzynia zostanie fizycznie zabrana z auta, auto automatycznie odjeżdża i znika. Nie ma dodatkowego potwierdzania CMR.
- Odjazd auta **nie kończy rundy**, jeśli ostatnia skrzynia jest wciąż na paleciaku; trzeba ją odstawić.

### 6.3. Prawy, własny bus (od rundy 2)

- Zostaje przyznany **bezpłatnie** po zakończeniu rundy 1; ma 4 sloty 2×2. W rundzie 1 prawa rampa jest nieaktywna.
- Można ładować aktywne skrzynie do wskazanego slotu i wyjmować dostępne skrzynie z powrotem na magazyn. Można zostawić część skrzyń w busie, zanim pojadą.
- Przy busie pojawia się strzałka wyjazdu tylko jeśli jest zadokowany i zawiera ≥1 skrzynię oraz nie trwa operacja przenoszenia na jego slot.
- Kliknięcie strzałki uruchamia wysyłkę. Bus znika / rusza, a w miejscu doku pojawia się licznik pozostałego czasu dostawy. W czasie nieobecności nie można go ładować.
- Po kursie wraca pusty i znów można go ładować.
- **Mieszanie kolorów jest legalne.** Długość kursu zależy od liczby *różnych kolorów* obecnych w chwili wysłania:
  `czas = 30 s + 15 s × (liczba_różnych_kolorów − 1)`.
  Jeden kolor: 30 s; dwa: 45 s. Liczba skrzyń (1–4) nie zmienia czasu kursu w MVP.
- Przychód 20 $ **za każdą skrzynię dostarczoną**, naliczany po zakończeniu kursu, nie w chwili włożenia do busa. Każda skrzynia dostarcza przychód tylko raz.

## 7. CMR i UI

### 7.1. CMR

- Wiszące kartoniki w górnej **lewej** części HUD. W MVP po jednym oczekującym dokumencie przychodzącym w rundzie.
- Zawartość rozpoznawalna wzrokowo: **dokładnie 4 ikonki skrzyń**, 2 czerwone, 2 niebieskie; w rundzie 1 w wyblakłych odcieniach (oznaczających przechowanie). Bez rozwlekłego tekstu dokumentów.
- Kliknięcie CMR powoduje przyjazd lewego busa; stan dokumentu zmienia się na aktywny, nie można przywołać drugiego identycznego samochodu.
- **Nie ma CMR wychodzących** w MVP. Po prawej jest własny bus i strzałka wysyłki.

### 7.2. Widok

- Pixel art: ciepłe pastele, estetyka symulatora magazynowego, widok z góry pod łagodnym kątem / pseudoizometryczny; czytelny raster 20×6 i jednakowa skala pól; bez rozjeżdżania sprite'ów względem logiki.
- Stała kamera obejmuje cały magazyn oraz fragmenty obu samochodów przy krótkich szczytach. Nie ukrywaj kratek i nie powiększaj magazynu, żeby dopasować wizualizację. Górny HUD nie może zasłaniać miejsca kliknięć.
- W widoku gry (nie w docelowej grafice) HUD: tytuł PixelHub, Runda 1/2 albo 2/2, wiszące CMR, liczba dolarów, x1/x2/x4, licznik czasu gry, opcja anulowania sekwencji, ewentualny znacznik aktywnego pracownika, strzałka busa, powrót busa, komunikaty instruktażowe.
- Wymagany **tryb debug** włączany klawiszem (np. `G`) rysujący numery kolumn/wierszy, dokładną siatkę i obrysy zajętości zestawu 1×2. Nie traktuj siatki rysowanej dla debug jako nowych pól.
- Interface: tylko język polski, symbol waluty `$`; **nie** `€`, **nie** fikcyjna duża suma. Tylko 2 rundy.

## 8. Czas gry i ekonomia

### 8.1. Jeden zegar, trzy mnożniki

- Mechanika RTS, nie turowa. Czas gry płynie, kiedy gracz myśli.
- x1, x2, x4 określają mnożnik `gameDelta = wallDelta × speedMultiplier`. Odliczenia pracowników, animacje i kurs busa używają **tych samych** sekund symulacji; nie mnożymy prędkości animacji podwójnie.
- Trwałość niezależna od FPS. Używaj pętli z krokiem stałym i akumulatorem, bez gubienia sekund przy lagach i zmianach szybkości.
- Kwoty są liczbami całkowitymi w USD, bez punktów, poziomów czy skomplikowanej waluty.

### 8.2. Księgowanie

- Start: saldo 50 $.
- Rozładunek: +10 $ **po** zakończonym odstawieniu skrzyni, która przyjechała lewym autem, na zwykłym polu składowania. Nie płacić drugi raz przy przenoszeniu tej skrzyni później.
- Magazynowanie: +5 $ za skrzynię, która na **koniec rundy 1** nadal pozostaje w magazynie i ma być przechowana do rundy 2 (4 × 5 $ = 20 $). W rundzie 2 przy obecnym scenariuszu nie ma przychodu za dalsze magazynowanie, bo wszystkie 8 ładunków ma być dostarczone. Pozostaw parametryzację na kolejne rundy.
- Dystrybucja: +20 $ za skrzynię po zakończonym dostarczeniu przez własny bus; 8 × 20 $ = 160 $ przy pełnej realizacji rundy 2.
- Pensja: −20 $ za jednego zatrudnionego magazyniera **co każde pełne 60 s czasu gry**. Obserwowalny skok salda, nie płynny spadek. Biuro jest w MVP wyłącznie wizualne; nie naliczaj drugiej pensji.
- Wyświetlaj krótkie pływające animacje np. `+10 $` i `−20 $`, a całkowite saldo zawsze wyliczaj z jednego ledgeru zdarzeń.
- Po każdej transakcji jeśli `balance <= 0` — natychmiast **GAME OVER**, zatrzymaj symulację. Nie ma kredytów, minusów, ratunku, utrzymania aktywnej rundy. Możliwe jest ponowne uruchomienie gry.
- Przykład rundy 1 z jedną pełną minutą pensji: 50 + 4×10 + 4×5 − 20 = **90 $**.

## 9. Stan rund i warunki zakończenia

### 9.1. Runda 1: nauka rozładunku

Stan początkowy:
- siatka 20×6, brak skrzyń na podłodze,
- pomieszczenia i rampa lewa, prawa rampa zamknięta,
- jeden wolny pracownik z paleciakiem,
- 50 $; jedno oczekujące CMR (4 skrzynie: 2 nieaktywne czerwone, 2 nieaktywne niebieskie).

Sekwencja:
1. Gracz klika CMR, pod lewą rampę dojeżdża bus z dokładnie 4 skrzyniami.
2. Gracz zleca przeniesienie wszystkich skrzyń w sekwencjach 3-klikowych, wybierając różne pola podłogi.
3. Po wyjęciu ostatniej skrzyni bus automatycznie odjeżdża.
4. Po umieszczeniu wszystkich 4 skrzyń w magazynie i odjeździe auta dodaj przychód za magazynowanie 4×5$, pokaż podsumowanie tej rundy, zamroź czas gry na ekranie podsumowania.
5. Przycisk `Runda 2` przenosi do drugiej rundy, zachowując pozycje i identyfikatory 4 skrzyń. Są one teraz aktywne, mają nasycone kolory i tracą wskaźnik `1`.

### 9.2. Runda 2: rozładunek + pierwsze dostawy

Stan początkowy:
- te same 4 skrzynie aktywne dokładnie tam, gdzie zostawił je gracz,
- po lewej kolejny CMR z 4 NOWYMI skrzyniami (2 czerwone, 2 niebieskie),
- prawa rampa działa, własny bus 2×2 stoi pusty pod rampą, bez kosztu zakupu,
- to samo saldo i jeden pracownik, ten sam kontynuowany zegar lub licznik minut pensji; nie resetuj długu pensyjnego w sposób pozwalający graczowi unikać opłaty na granicy rund.

Sekwencja:
1. Rozładuj drugi pojazd; nowe skrzynie mogą zostać odłożone na podłogę, a potem skierowane do dystrybucji.
2. Ładuj własnego busa: każda dostępna skrzynia może zostać skierowana do legalnego slotu. Mieszaj kolory, jeśli chcesz.
3. Po kliknięciu zielonej strzałki bus jedzie na 30 s (jeden kolor) lub 45 s (dwa kolory) i wraca pusty. Przychód z dostarczenia nalicz po ukończeniu kursu.
4. Gracz realizuje wszystkie 8 skrzyń (4 czerwone + 4 niebieskie); wymaga to przynajmniej 2 kursów pełnego busa, ale wolno wykonać więcej, jeśli gracz wyśle częściowe ładunki.
5. **Koniec rundy 2** dopiero gdy lewy bus jest rozładowany, wszystkie 8 skrzyń mają stan `delivered`, a własny bus ukończył ostatnią trasę i wrócił pusty. Pokazuj podsumowanie, a następnie ekran `Koniec wersji demonstracyjnej` / możliwość restartu.

### 9.3. Przegrana

Stan `GAME_OVER` ma priorytet nad wszystkimi innymi stanami. Jeśli przegrana nastąpi w chwili wykonywania zadania, nie kończ sztucznie animacji, nie wysyłaj busa i nie dopisuj przyszłych zarobków.

## 10. Prosty UI samouczka

Pokazuj krótkie instrukcje kontekstowe po polsku:
- `Kliknij CMR, aby przyjąć dostawę.`
- `Kliknij pracownika.`
- `Kliknij dostępną skrzynię.`
- `Wskaż wolne pole na magazynie.`
- `Ta skrzynia jest zablokowana przez inną.`
- `Trasa zablokowana. Usuń przeszkodę lub anuluj polecenie.`
- `Załaduj busa, a potem kliknij strzałkę wyjazdu.`

Nie blokuj kreatywnego rozmieszczenia skrzyń poza regułami fizycznymi. Nie dodawaj okien modalnych po każdym kliknięciu.

## 11. Zakres świadomie odłożony

**Nie implementuj w MVP:** kolejkowania, wielu pracowników, AI rekrutacji, symulowanych potrzeb socjalnych, budowy i kupowania pomieszczeń, odblokowywania pól, rozbudowy magazynu, regałów, wózków elektrycznych, wózków widłowych, robotów, kontraktów cyklicznych, bonusowych CMR, magazynu zewnętrznego, kar finansowych, losowych dostaw, zapisów do chmury, lokalizacji wielu magazynów.

Zadbaj jednak o moduły i konfigurację tak, aby te mechaniki można było dołożyć później.

## 12. Standard jakości i zachowania przy ograniczeniach

- Wszystkie interakcje mają działać myszą, bez wpisywania współrzędnych tekstowo.
- Render i hitbox muszą korzystać z **tych samych** danych mapy oraz odwzorowania współrzędnych; nie używaj dwóch niezależnie ręcznie ustawionych plansz.
- Skala sprite'ów wynika z jednego parametru `tileSize`; kamera mieści wszystkie 20×6 pól. Przy zmianie rozmiaru okna zachowaj proporcje i współrzędne kliknięć.
- Nie wypychaj magazynu poza 6 rzędów tylko po to, aby zmieścić pomieszczenia czy samochody: auta są na zewnątrz hali.
- Zero nieautoryzowanych przychodów, ruchów przenikających przez skrzynie oraz podwójnych kliknięć wywołujących dublowanie pojazdów.
- Jeśli narysujesz ładny placeholder zamiast pixel art assetu, nie możesz nazwać tego pełnym wykonaniem grafiki; przede wszystkim dostarcz kompletną mechanikę.
- Ostatecznie uruchom testy, `build` i manualny smoke-test lub test przeglądarkowy, jeśli narzędzia to umożliwiają. Raportuj rzeczywisty wynik, nie plan.


---

# PixelHub — Testy odbiorowe MVP (dla Codexa)

**Zasada:** każde `MUST` jest obowiązkowe. Automatyczne testy modelu bez renderingu + ręczny / e2e smoke test w przeglądarce. Nie uznawaj zadania za ukończone, jeśli testów nie uruchomiono lub nie da się ręcznie wykonać obu rund.

## A. Geometria i rysowanie

**A01. Dokładna siatka.** `expect(width).toBe(20); expect(height).toBe(6); expect(cellCount).toBe(120)`. Na ekranie, w trybie debug, da się policzyć 20 kolumn i 6 rzędów. Żadnych wierszy/skrytek „pod samochodem”.

**A02. Dokładne pomieszczenia.** Biuro 12, szatnia 9, stołówka 9, toaleta 6. Łącznie dokładnie 36, bez nakładania. Stołówka sąsiaduje z szatnią wzdłuż granicy; wszystkie pomieszczenia leżą w dolnej, centralnej części. Klik na pole pomieszczenia nie tworzy miejsca odkładczego.

**A03. Rampy.** Lewa dokładnie 4 pola `x=0,y=1..4`, prawa dokładnie 4 pola `x=19,y=1..4`. Pozostałe pola = 76. Nie można trwale odłożyć skrzyni na rampie. Rampa prawa nieaktywna w R1, aktywna w R2.

**A04. Pozycja aut.** Samochód z lewej stoi poza `x<0`, własny poza `x>19`; oś długości auta prostopadła do odpowiedniej krótkiej ściany magazynu. Nie rysuj ich równolegle do ściany szczytowej. Auta nie zwiększają rozmiaru hali.

**A05. Hit-test, kamera, responsywność.** Klik w wizualną skrzynię wybiera logicznie tę samą skrzynię; klik w pole wybiera dokładnie to pole także przy mniejszym oknie i zmianie skali.

**A06. Brak dekoracyjnych przeszkód.** Stan magazynu w pierwszych sekundach R1: 0 skrzyń w środku, 36 pól pomieszczeń, 8 ramp, reszta wolna, dokładnie 1 pracownik. Ustawione wizualnie półki nie mogą blokować ani zajmować powierzchni; najlepiej nie rysować półek w hali.

## B. Kliknięcia i dostępność

**B01. Trzy kliknięcia.** Klik pracownika → wybór skrzyni → docelowa wolna kratka → tylko JEDNO zadanie. Brak kolejki. Niewykonane zadanie blokuje dodanie następnego.

**B02. Anulowanie.** Po kliknięciu pracownika na górze pokazuje się `Anuluj`; po kliknięciu tej opcji przed uruchomieniem zadania wybór wraca do początku, nie rusza pracownik, nie znika skrzynia i nie zmienia się saldo.

**B03. Niedozwolony cel.** Kliknięcie zajętej kratki, pola socjalnego, nieczynnej rampy lub braku miejsca na odłożenie zestawu nie tworzy zlecenia i pokazuje czytelny komunikat. Nie wykonuj „auto-korekty” na inne pole.

**B04. Dostęp 2×2.** Dwa pasy w aucie, w każdym tylny slot blokuje przedni. Z początkowo pełnego auta dostępne tylko dwa tylne sloty. Po zdjęciu tylnego lewego dostępny staje się przedni lewy, a przedni prawy nadal zablokowany tylnym prawym.

**B05. Przykład 4→2.** Ustaw: przód `[2,1]`, tył `[4,3]`. Po zdjęciu skrzyni 4, potem 2, wybranie skrzyni 1 jest niedozwolone, bo blokuje ją skrzynia 3.

**B06. Załadunek przedniego slotu.** Własny bus pusty: załaduj przedni lewy, następnie tylny lewy — legalne. Gdy tylny lewy jest zajęty, nie można wstawić skrzyni na przedni lewy.

**B07. Wyjęcie skrzyni z własnego busa.** Przed odjazdem można wskazać jako źródło dostępną skrzynię załadowaną do auta i odłożyć ją z powrotem na dostępne pole hali. Zajętości aktualizują się atomowo; nie ma kopii skrzyni.

**B08. Wyjazd niepusty.** Strzałka wyjazdu widoczna tylko, gdy bus stoi przy rampie i zawiera ≥1 skrzynię. Po kliknięciu: dokładnie jeden kurs, brak możliwości ponownego kliknięcia do końca podróży. Brak strzałki przy pustym busie.

## C. Ruch zestawu

**C01. Obrys 1×2.** Pusty oraz załadowany pracownik w każdej logicznej pozycji zajmuje dwa moduły; nigdy nie przechodzi przez jednopolową szczelinę, w której nie zmieści się paleciak, i nigdy nie nachodzi na stałą skrzynię.

**C02. Styk narożnikami.** Zablokuj dwa skośnie sąsiednie pola skrzyniami. Nie wolno wyznaczyć ani wykonać drogi przebiegającej przez ich narożniki. Dla skrętu kontrola wszystkich pól/swept footprint potrzebnych dla zestawu 1×2.

**C03. Płynność.** Przy skręcie z kierunku poziomego na pionowy moduł paleciaka fizycznie podąża za pracownikiem bez teleportacji; przy animacji każdy etap zachowuje legalność przestrzeni. Manualnie przetestuj kilkanaście skrętów pod rząd.

**C04. Trasa najkrótsza.** W prostym korytarzu A* wybiera najkrótszą legalną trasę geometryczną; jeśli skos wymaga skrótu przez zablokowane pola, wybiera objazd albo nie zwraca trasy.

**C05. Trasa kolorem.** Niebieska podczas dojazdu na pusto, zielona podczas przewozu, czerwona tylko dla zablokowanego odcinka. Ścieżki widoczne tylko gdy dany pracownik jest wybrany. Brak linii kolejkowanych zadań (nie istnieją).

**C06. Blokada w ruchu.** Zastaw jedno z zaplanowanych pól między klatkami symulacji. Pracownik dojeżdża do ostatniej bezpiecznej pozycji, zatrzymuje się z aktywnym zadaniem i czerwoną resztą trasy; nie teleportuje się, nie porzuca skrzyni, po odblokowaniu może kontynuować.

## D. Rundy i samochody

**D01. Początek R1.** Budżet dokładnie 50$, HUD `Runda 1/2`, jedno CMR z DWOMA wyblakłoczerwonymi i DWOMA wyblakłoniebieskimi skrzyniami. W hali żadnych skrzyń, własnego busa nie ma.

**D02. Akceptacja CMR.** Dopiero po kliknięciu CMR pod lewą rampę wjeżdża bus 2×2 z czterema skrzyniami. Dalsze kliki na już zaakceptowanym CMR nie wywołują drugiego busa.

**D03. Odjazd rozładowanego busa.** Gdy ostatnia skrzynia zostaje podjęta, bus sam odjeżdża i znika; żadnej osobnej decyzji o wyjeździe. Jeśli ostatnia skrzynia jest jeszcze na paleciaku, R1 wciąż trwa.

**D04. Warunek R1.** R1 kończy się dopiero, gdy wszystkie 4 skrzynie są rzeczywiście odłożone na magazynowej podłodze, bus rozładunkowy odjechał. W podsumowaniu 40$ za rozładunek i 20$ za przechowanie, koszt pensji zależny od czasu.

**D05. Przejście do R2.** Zachowaj te same 4 skrzynie i ich pozycje, zmień kolory na aktywne, usuń cyfrę 1, odblokuj prawą rampę i daj darmowego pustego busa 2×2. Saldo przechodzi niezmienione poza naliczonymi transakcjami.

**D06. Nowe CMR w R2.** Pojawia się nowy dokument na 4 skrzynie (2 czerwone i 2 niebieskie). Po rozładunku razem jest 8 skrzyń do wysłania (4 czerwone i 4 niebieskie). Nie dubluj skrzyń przy przenosinach.

**D07. Kurs jednego koloru.** Do busa wstaw np. 2 czerwone i wyślij. Bus wraca pusty po 30 sekundach CZASU GRY; po powrocie dokładnie 2 skrzynie są `delivered`, przychód +40$.

**D08. Kurs mieszany.** Wstaw 2 czerwone + 2 niebieskie. Czas trasy = 45 sekund CZASU GRY, przychód +80$ po powrocie; nie 60 s i nie 30 s.

**D09. Częściowy kurs.** W busie jedna skrzynia: można wysłać go w 30 s. Pusty bus nie wyjeżdża.

**D10. Warunek R2.** Zakończ R2 dopiero po rozładunku drugiego auta, dostarczeniu wszystkich 8 skrzyń i ukończeniu ostatniego kursu busa. Pokazanie ekranu końcowego nie może zależeć od nieistniejącego CMR wychodzącego.

## E. Czas, pieniądze i awarie

**E01. Pensje skokowo.** Dla pracownika w pełni zatrudnionego: po 59.99 s bez zmiany stawki, po 60 s dokładnie −20$, po 120 s kolejne −20$. Nie pobieraj pensji co prawdziwą minutę przy x4.

**E02. Zmiana tempa.** Przy x2 podróż 30 s gry trwa około 15 s realnego czasu, przy x4 około 7.5 s realnego czasu; koszty naliczone za te same 30 s czasu gry, nie realnego. Zmień mnożnik w trakcie podróży, zachowaj poprawny postęp.

**E03. Rozładunek jednokrotnie.** +10$ tylko raz za skrzynię po pierwszym skutecznym przeniesieniu z przychodzącego busa na podłogę. Przemieszczenie między dwoma miejscami hali nie generuje kolejnych +10$.

**E04. Magazynowanie jednokrotnie.** Na koniec R1 +5$ za każdą z 4 skrzyń, razem +20$. Nie wypłacaj automatycznie 5$ za każdy ruch lub każdą chwilę przechowywania.

**E05. Dostawa jednokrotnie.** Przesunięcie skrzyni do busa nie generuje +20$; płatność po dostarczeniu, dokładnie raz za każdą skrzynię.

**E06. Game over.** Ustaw saldo 20$ tuż przed pełną minutą (w teście modelu); po pensji saldo 0$ i natychmiast stan GAME OVER. Nie da się kontynuować poleceń, nie ma kredytu. Jest dostępny restart.

**E07. Koniec rundy / zamrożony zegar.** W podsumowaniu R1 oraz R2 nie upływa czas symulacji ani wynagrodzenia. Nie używaj ekranu podsumowania jako sposobu na reset pensji: carry-over licznika minuty jest spójny między R1 a R2.

**E08. Determinizm.** Ten sam seed/scenariusz i ta sama sekwencja kliknięć + czasu gry dają dokładnie te same pozycje, salda i stany. Nie używaj `Date.now()` jako mechanicznego zegara gry.

## F. Testy manualne / uruchomienie

**F01.** `npm install` (lub zgodny menedżer paczek), następnie `npm run dev`, działa w przeglądarce i pozwala ukończyć obie rundy.

**F02.** `npm run build` wychodzi z kodem 0; `npm test` (lub odpowiednio skonfigurowany skrypt) wykonuje testy mechaniki.

**F03.** Gra utrzymuje prawidłowy wybór obiektu/kratki po zmianie rozdzielczości lub wielkości okna.

**F04.** Widoczny HUD: `PixelHub`, `Runda 1/2`, `50 $`, trzy przyciski `×1`, `×2`, `×4`, jeden wizualny CMR; zmienia się na `Runda 2/2` w R2. Teksty i komunikaty po polsku.

**F05.** Graficzny styl jest spójny i w skali: skrzynia zawsze odpowiada jednej kratce, zestaw człowiek–paleciak mieści się w 1×2, własne auto ma 2×2 sloty, a socjal zajmuje dokładnie swoje 36 pól.

## G. Minimalny raport końcowy Codexa

1. Jak uruchomić i testować.
2. Jakie funkcje działają faktycznie, z podaniem numerów testów A–F.
3. Rzeczywisty wynik build/test.
4. Co zostało zrobione uproszczonym rendererem i dlaczego.
5. Jak zmienić prędkości, stawki i mapę w jednym miejscu.
6. Ewentualne nierozwiązane ograniczenia (bez przedstawiania ich jako zaimplementowane).


---

# PixelHub — wytyczne graficzne i proporcje

## Ścisła zasada
`exact_grid_20x6.png` to **wzór geometrii**, a `REFERENCE_visual_only_not_to_scale.png` to **wzór nastroju i wyglądu**. Jeśli są sprzeczne, mapa i specyfikacja zawsze wygrywają.

## Kamera
- Jeden wspólny widok 2.5D, jak w pastelowym symulatorze pixel-art. Rozpoznawalne ściany, izometryczno-ukośne sylwetki obiektów, ale **podłoga pozostaje ortogonalnym rasterem 20×6 w logice i czytelna w renderze**.
- Unikaj mocnego rzutu izometrycznego, w którym niewygodnie wybiera się pole przy pomieszczeniach. Zachowaj lekkie nachylenie/krótkie pionowe ściany, jak w referencji.
- Jeden transform `gridToScreen` i dokładnie odwrotny `screenToGrid` dla kliknięć (dla sprite'ów i skrzyń też); render mapy i eventy wejścia nie mogą się rozjechać.
- Pole = jeden kwadrat podłogi w świecie logicznym. Wszystkie skrzynie 1×1 mają ten sam footprint, a pracownik z paleciakiem 1×2. Auta nie mogą powodować powstania dodatkowych krat wewnątrz hali.

## Palette (orientacyjna, nie sztywna)
- Podłoga: chłodne szaroniebieskie płytki, delikatna kratka i cienkie obrzeża.
- Ściany: jasne szarości, pastelowe odcienie stali, bursztynowe światło nad rampami.
- Przyjezdna skrzynia magazynowa: wyblakła czerwień / wyblakły błękit z małą cyfrą `1`.
- Aktywna skrzynia wysyłkowa: intensywna, lecz pastelowa czerwień / niebieski.
- Pracownik: niebieska czapka, pomarańczowa kamizelka; paleciak ręczny żółty.
- Szatnia: niebieskie szafki; biuro: biurko i monitor; toaleta: WC i umywalka; stołówka: stół, dwa lub trzy krzesła.
- Trasy: jasno-niebieskie (#4299E1), zielone (#43C16F), czerwone (#DF5454), dyskretne przerywane linie widoczne tylko po zaznaczeniu pracownika.

## UX
- Ikony skrzyń na CMR da się policzyć. Miejsce CMR: górny lewy fragment UI, nie nad przejazdem.
- Niewidoczne / wyszarzone nieaktywne przyciski; wizualne podkreślenie klikniętego pracownika, legalnych skrzyń i pól docelowych.
- Auto odjeżdża z widoczną animacją, przy busie wracającym licznik zegara; zielona strzałka pojawia się wyłącznie po częściowym lub pełnym załadunku.
- Wszystkie etykiety po polsku. Zero przypadkowych `Round 1/3`, euro i przychodu 2450 $ z referencji.

## Jeśli brakuje gotowych assetów
Zbuduj podstawową grafikę ze spójnych proceduralnych prostokątów / prostych sprite'ów w rozmiarach wielokrotności tileSize. Istotniejsze są płynny ruch, dokładne obrysy i prawidłowe kliknięcia niż zaawansowany ilustracyjny shading. Nie importuj gotowego screenshotu jako tła mapy; nie jest zgodny geometrycznie.

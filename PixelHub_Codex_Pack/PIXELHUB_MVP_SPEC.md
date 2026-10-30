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

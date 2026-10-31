# Transport ręcznym paleciakiem

Uwaga: poniższy zapis opisuje bazową przebudowę `ee23be2` i jej 32 testy. Aktualne ustalenia, poprawki oraz wyniki 52 testów znajdują się w [raporcie audytu](PIXELHUB_AUDIT_REPORT.md).

## Model i ruch

`pathfinding.ts` definiuje konfigurację `(x, y, orientacja, tryb)` oraz jedną funkcję `geometry`, z której korzystają kolizje, symulacja i renderer. Pozycje węzłów opisują pracownika; `tail` daje pozycję paleciaka w węźle. Podczas manewru autorytatywne pozycje ciągłe są dostępne przez `Game.transportGeometry`, a `pose` oznacza ostatni zatwierdzony węzeł. Skrzynia na widłach jest przypisana do paleciaka, nie interpoluje samodzielnie między lokalizacjami.

Zestaw ma dwa nominalne moduły. Punkt połączenia dyszla leży 0,42 kratki przed środkiem paleciaka, a odcinek od przegubu do pracownika ma stałą długość 0,58 kratki. Podczas skrętu dyszel wychyla się płynnie względem paleciaka; przy końcach manewru znów leży w jego osi. Model nie symuluje mas, sił ani dynamiki kontaktu z podłożem: jest deterministyczną kinematyką biernego urządzenia sterowanego trajektorią pracownika.

Dozwolone prymitywy to osiowy ruch o pół kratki, przegubowy łuk 90° i zatrzymana zmiana ciągnięcia na pchanie lub odwrotnie. Koła i skrzynia poruszają się po stycznej do orientacji paleciaka; nie istnieją krawędzie ruchu poprzecznego ani obrotu w miejscu. Nawrót wymaga sekwencji legalnych manewrów. Pchanie odwraca tę samą trajektorię, bez obrotu skrzyni. Węzły mają cztery orientacje osiowe; wewnątrz łuku orientacja jest ciągła. Osobnych prostych przejazdów po skosie ten zestaw prymitywów nie zawiera (`allowEightDirections: false`). Optymalność dotyczy tego jawnego grafu manewrów, nie wszystkich możliwych trajektorii w przestrzeni ciągłej.

Czasy w `src/game-config.json`: pusty zestaw 0,8 s/kratkę, ciągnięcie 1,2, pchanie 1,8, zmiana trybu 0,8 s, podnoszenie i opuszczanie po 1,5 s. Promień łuku jest konfigurowalny jako 0,5 lub 1 kratka (zachowuje skończoną półkratkową siatkę); wychylenie dyszla jest konfigurowalne w radianach. Czas łuku wynika z długości trajektorii pracownika, obliczanej deterministycznie z 256 odcinków.

## Kolizje

Sprawdzane są osobno obrys pracownika, obracający się obrys pustego paleciaka lub ładunku, połączenie do przegubu i dyszel. SAT sprawdza przecięcia z zajętymi kratkami. Obrys zamiatany powstaje z 64 próbek łuku lub 32 próbek prostej, powiększonych o margines ograniczający maksymalne przemieszczenie dowolnego punktu między próbkami. Zapamiętywane są wyłącznie geometryczne obrysy prymitywów; aktualna zajętość pól jest sprawdzana ponownie przy każdym ruchu. Nie ma reguły pustego obszaru 3×3.

Widoczny korpus pracownika i paleciaka mieści się w ich obrysach kolizyjnych. Cienie oraz obramowania wyboru są dekoracyjne. Renderer rysuje rzeczywiste łuki, osobno kolorując przejazd pusty, załadowany i aktualnie zablokowany odcinek.

## Pełna operacja

`transport.ts` wykonuje jedno wyszukiwanie Dijkstry ze stanem pusty/załadowany, orientacją i trybem. Rozważa wszystkie legalne strony pobrania. Koszt obejmuje dojazd, zmiany trybu, wsunięcie, podniesienie, transport, końcowe pchnięcie, opuszczenie, przełączenie i wycofanie pustych wideł dokładnie o jedną kratkę. Po wycofaniu pracownik pozostaje w miejscu i czeka na kolejne zadanie; nie jedzie przymusowo do górnego korytarza. Stronę odłożenia wybiera spośród czterech stron zgodnie z fizyczną wykonalnością całego manewru. Test porównuje także dłuższą trasę ciągnięciem z krótszą, wolniejszą trasą.

Wsunięcie jest prostym ruchem pustego paleciaka pod nieruchomą skrzynię; pracownik pozostaje przed nią. Podniesienie przenosi własność dopiero po wykonaniu operacji. Wysokość wideł jest osobnym stanem logicznym używanym do rysowania podnoszenia i opuszczania. Po końcowym pchnięciu skrzynia jest opuszczana dokładnie w środku celu. Od tej chwili pozostaje nieruchoma, a paleciak wycofuje puste widły. Zadanie i nagroda kończą się po wycofaniu i bezpiecznym wyjeździe.

Blokada zachowuje zadanie i dokładną pozycję pośrednią; zwolnienie drogi wznawia tę samą trasę. Anulowanie odwraca tylko już przejechaną część bieżącego manewru. Ładunek pozostaje na widłach. Po anulowaniu podnoszenia najpierw wycofywane są wsunięte widły; po opuszczeniu skrzyni pracownik kończy bezpieczne rozłączenie przed przyjęciem następnego zadania.

## Auta, ekonomia i sterowanie

Obie ładownie są rzeczywistymi polami siatki: dostawcza `x=-2,-1`, własna `x=20,21`, pasy `y=2,3`. Dostęp jest od rampy, w osi podłużnej; tylna skrzynia blokuje przednią w tym samym pasie. Pracownik może wejść do pustej części ładowni. Nie istnieje przenoszenie skrzyni między slotem a rampą bez ruchu paleciaka. Dotyczy to również ponownego rozładunku własnego busa. Pojazd czeka na wyjście całego obrysu zestawu; dostawczy pozostaje dodatkowo do zakończenia bieżącego zadania, aby zaplanowana trasa nie traciła podłoża.

Mapa, pomieszczenia, jeden pracownik, trzy kliknięcia, CMR, dwie rundy, kolory, budżet, płace, nagrody, bankructwo i powroty aut pozostają zgodne z istniejącymi regułami. Symulacja nadal używa kroku 0,05 s. Wynagrodzenie pracownika wynosi 20 USD na koniec każdej ukończonej rundy, niezależnie od czasu operacji. Scenariusz testowy może wysyłać pary jednego koloru bez presji kosztów minutowych. Miejsca składowania trzeba dobierać z uwzględnieniem późniejszego fizycznego dostępu do wideł.

## Walidacja

- `npm test`: 32 testy jednostkowe i integracyjne, bez pominięć. Obejmują wymagane przypadki 1–32, stany pośrednie, brak poślizgu bocznego, długość dyszla i przegub, kolizję występującą wyłącznie w środku manewru, dynamiczną blokadę, anulowanie, oba kierunki obsługi samochodu, wyjazd, czasową optymalizację i zgodność renderowania z logiką.
- Pełny deterministyczny scenariusz obu rund kończy rundę 1 przy 109,80 s i 90 USD, a rundę 2 przy 778,30 s i 70 USD. Przychody: 80 USD rozładunek + 20 USD przechowanie + 160 USD dostawy; płace: 240 USD; kapitał: 50 USD. Różne decyzje i zwłoka gracza dają inne wyniki.
- `npm run build`: TypeScript i produkcyjny build Vite.
- `python PixelHub_Codex_Pack/validate_config.py`: niezależna walidacja niezmienionej mapy.
- `npm run test:browser`: rzeczywiste kliknięcia canvasu w Chromium, obie rundy, kontrola ciągłości i niezmienników co 0,05 s, ×1/×2/×4, ekran 1440/760 px, restart i bankructwo. Test zmienia wyłącznie czas przez publiczne `advance`; nie przestawia obiektów ani salda. Zrzuty pobrania, podnoszenia, skrętu, opuszczania i wycofania znajdują się w ignorowanym `artifacts/`.

Nie zmieniano workflow GitHub Pages i nie wdrażano gry publicznie.

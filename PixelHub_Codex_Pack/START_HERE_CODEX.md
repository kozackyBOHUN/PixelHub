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

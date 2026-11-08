# PixelHub 0.2 — raport wdrożenia

## Zakres

Aktualizacja istniejącej gry 0.1, bez wymiany silnika paleciaka. Nowa kampania zawiera 30 konkretnych rund, 696 palet przyjętych i 696 wydanych. Dane manifestów, ID, terminy, kolory, cechy, receptury i cele znajdują się w `src/campaign-data.json`.

Zaimplementowano:

- wyśrodkowany blok pomieszczeń 12×3 wewnątrz początkowego magazynu 20×6;
- trwałe palety i fizyczne pozycje między rundami, bez generowania fikcyjnych wysyłek;
- wybór kolejności CMR, pojazdy o 4 i 8 miejscach, pełne manifesty wydania, druga para ramp;
- do czterech pracowników z niezależnymi paleciakami, zadaniami, trasami i rezerwacjami;
- osiem kolorów odbiorców oraz neutralny szary, cztery niezależne oznaczenia;
- priorytety ×2 / ×1 / ×0,5, bez resetowania zegara przy zapisie lub zmianie CMR;
- sorter z buforem i transakcyjnymi recepturami 2 MIX → 2 palety, kontrolą kolorów i ośmiu kartonów;
- chłodnię, mroźnię i rozbudowę ich rzeczywistej pojemności;
- fizyczne stanowisko napraw i kontroli zwrotów;
- rozbudowy o 120 + 120 pól na północ, zatrudnianie i zakup sprawniejszych paleciaków;
- pensje 20 USD na osobę raz za rundę, start 50 USD, przychody i zakupy;
- wersjonowany zapis v2, także w trakcie podnoszenia / jazdy, z kontrolą integralności;
- ukryte laboratorium `?dev=1`, osobny zapis oraz natychmiastowe wejście do dowolnej rundy z rzeczywistym stanem po poprzednich rundach;
- deterministyczny operator testowy wydający normalne polecenia transportowe.

## Weryfikacja

74 testy regresji i nowych mechanik: manifesty, bilanse, pomieszczenia, kolizje i manewry, anulowanie, własność ładunku, dwóch pracowników, nieruchomy pracownik jako przeszkoda, druga rampa, receptury, temperatury, zwroty, naprawa, priorytet, ekonomia, zapis i scenariusze wejściowe.

Pełny test rzeczywistej kampanii 1–30 zakończony zwycięstwem. Po każdej rundzie sprawdzany jest bilans, rzeczywisty stan magazynu, dodatnie saldo, ciągłość położeń oraz pojedyncze naliczenie pensji. W trakcie kampanii wykonywane są zapisy i odczyty. Finał: 696 palet ze statusem wydania, zero w magazynie. Cały lokalny przebieg testów z pełną kampanią trwał około siedmiu minut.

`typecheck` aplikacji i testów oraz build produkcyjny — poprawne. Walidator archiwalnej paczki został zaktualizowany, żeby porównywać aktualną geometrię z zatwierdzonym układem 0.2.

Test Chrome na produkcyjnym buildzie:

- runda 1 obsłużona kliknięciami myszy, przyspieszany wyłącznie czas symulacji;
- zapis i przeładowanie strony zachowują ID, położenia oraz saldo;
- otwarcie rund 18 i 30 z poprawnym zapasem wejściowym;
- finał wykonany przez przycisk laboratorium, korzystający z tego samego planera i fizycznego transportu;
- wszystkie 58 wymaganych palet wydane, stan końcowy 0, łącznie 696 wydań;
- brak błędów JavaScript, laboratorium niewidoczne w normalnej grze;
- poprawna proporcja mapy i kliknięć po rozbudowie (dynamiczna tekstura Pixi).

Pomiar bez aktywnego zadania na mapie rundy 30: około 75 FPS w tutejszym headless Chrome. To pomiar konkretnego środowiska, nie gwarancja na innych komputerach ani benchmark wszystkich aktywnych operacji.

## Przyjęte decyzje i uproszczenia

1. Rozbudowa odbywa się na północ. Zachowuje szerokość 20 pól, położenia palet, starych ramp i pomieszczeń. Kolejne rozmiary: 20×12 i 20×18.
2. Receptury MIX są parami 2→2. Bufor nie znika przy braku miejsca, a wynik nigdy nie powstaje dwa razy.
3. Sorter i serwis kończą proces po fizycznym odstawieniu oraz wycofaniu wideł; nie dodano minigier ani termodynamiki.
4. Rezerwowane są całe trasy. Dwa zbyt bliskie zadania należy wykonać kolejno; brak automatycznej kolejki i robotów.
5. CMR wymaga wskazanych ID. Pojazd wydania można wycofać pusty, aby zmienić kolejność zleceń.
6. Zbyt gęste, nieprzemyślane składowanie może odciąć dojazd — trzeba zachowywać przejazdy i miejsce na obrót. Operator testowy używa pasów składowania i sprawdzonej kolejności samochodów; rekomendacja rundy 26 znajduje się w danych, nie w silniku ruchu.
7. Termin priorytetu po przekroczeniu daje ×0,5 i nie niszczy towaru. Priorytet zwiększa przychód z obsługi, nigdy pensję pracownika.
8. Grafika rozwija proceduralny pastelowy pixel art wersji 0.1. Nie dodano zewnętrznego atlasu docelowych sprite’ów.
9. Stary format zapisu nie był dostępny w 0.1; 0.2 ma własny wersjonowany klucz. Laboratorium używa oddzielnego klucza.
10. Wygoda i odczuwalny balans 30 rund wymagają oceny gracza. Testy dowodzą wykonalności sprawdzonej strategii, nie wszystkich możliwych układów składowania.

## Testowanie rund

Otwórz grę z `?dev=1`, wybierz rundę i kliknij „Odtwórz historię do rundy”. Runda 30 zaczyna się z 18 rzeczywistymi paletami z poprzednich rund, przyjmuje 40 i wymaga wydania 58. Możesz sam grać albo uruchomić operatora „Wykonaj fizycznie rundę”.

Scenariusze zostały zapisane po fizycznym przejściu historii. Zmiana manifestów unieważnia pakiet; gra odtwarza wówczas historię przez silnik. Ponowna generacja: `node --experimental-strip-types scripts/campaign-playthrough.ts --fixtures`.

Instrukcja uruchomienia, testów oraz opis modułów: `README.md`.

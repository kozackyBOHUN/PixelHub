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

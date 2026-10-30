# Implementacja PixelHub MVP

Źródła reguł: `PixelHub_Codex_Pack/START_HERE_CODEX.md`, specyfikacja, `game-config.json` i testy odbiorowe. Grafika referencyjna służyła tylko jako inspiracja palety i wyposażenia. Załączony plik zbiorczy nie dodaje osobnego źródła reguł.

## Architektura i decyzje

- Model to czysty TypeScript bez DOM, PixiJS i zależności od czasu systemowego. Ruch, załadunek, dostawy i wynagrodzenia obsługuje jeden zegar o kroku 0,05 s. Mnożnik ×1/×2/×4 stosowany jest przy wejściu do akumulatora. Podsumowania i bankructwo zamrażają symulację; licznik płac przechodzi między rundami.
- Lokalizacja skrzyni jest unią rozłączną: podłoga, konkretny slot jednego z aut, pracownik, kurs lub dostarczenie. To jedyne źródło prawdy dla zajętości. Przeniesienie własności następuje po zakończeniu podjęcia/odstawienia. Jednorazowa flaga rozładunku chroni przed ponowną zapłatą.
- Saldo to suma księgi transakcji. Każda transakcja sprawdza bankructwo; płace mają pierwszeństwo w kroku granicznym.
- Trasowanie przeszukuje konfiguracje `(x,y,orientacja)` zestawu 1×2. Wyszukiwanie to Dijkstra, czyli A* z dopuszczalną heurystyką zero. Skos kosztuje √2; zmiana orientacji o 45° ma koszt manewru 0,5 pola. Dopuszczone są przesunięcia zestawu w ośmiu kierunkach bez zmiany orientacji oraz osobne obroty.
- Konserwatywny prostokątny obrys zamiatany obejmuje oba moduły przed i po ruchu/obrocie oraz kontroluje narożniki. Może odrzucać ciasny manewr możliwy dla dokładniejszej fizyki, ale nie przepuszcza przez przeszkody. Rezerwacje przygotowują model na dynamiczne blokady; pracownik jest tylko jeden.
- Trasa pozostaje oryginalna. Zablokowana krawędź zatrzymuje zadanie, nie porzuca ładunku. Anulowanie w trakcie przewozu pozostawia skrzynię na paleciaku; użytkownik wskazuje nowy cel. Model utrzymuje pozycje na węzłach siatki, wizualizacja interpoluje krawędzie. Anulowanie w połowie manewru płynnie cofa niedokończony fragment do ostatniego zatwierdzonego węzła. Nowy cel można wskazać po zakończeniu tego krótkiego cofnięcia; ładunek zachowuje właściciela.
- Skrzynie podchodzą do tylnego/transportowego modułu paleciaka. Podnoszenie i odkładanie ma interpolację; obrót transportowego modułu jest interpolowany po łuku. To uproszczona kinematyka, bez symulacji fizycznego przegubu i bez zaawansowanej animacji kroków pracownika.
- Auta mają wirtualne interaktywne sloty poza halą. Nie rozszerzają 120 pól. Każdy pas ma niezależną kontrolę dostępu przez tył. Głębokie sloty są obsługiwane przez rampę w tej samej linii, bez prowadzenia pracownika po wnętrzu busa.
- Grafika proceduralna Canvas 2D jest wyświetlana jako aktualizowana tekstura w PixiJS 8. Utrzymuje jedną mapę i odwzorowanie kliknięć. To świadomie prosty pastelowy renderer, nie ilustracyjny pixel art jakości referencji. Nie używa referencyjnego screenshotu jako tła. Samochód przychodzący ma animację wjazdu/odjazdu, własny znika na czas kursu i wraca pusty.
- Na małym ekranie cała mapa skaluje się proporcjonalnie, co zachowuje poprawne kliknięcia, ale zmniejsza cele interakcji. MVP jest przeznaczone głównie do myszy na komputerze.
- Brak zapisu gry, rozbudowy, rekrutacji, kolejek i mechanik wymienionych w dokumentacji jako poza MVP.

## Walidacja

`npm test`: 11 testów modelu. Obejmują dokładną geometrię, blokowanie głębokich slotów w każdym pasie, trzyetapowe zlecenie bez kolejki, błędne cele, anulowanie, obrys z orientacją i narożniki, blokadę/wznowienie trasy, jednorazowe przychody, wyjmowanie z własnego busa, częściowy kurs jednego koloru, kursy mieszane, płace, mnożnik zegara, bankructwo, zamrożone podsumowanie i pełne przejście dwóch rund. Test regresji sprawdza załadunek przeniesionych skrzyń przed przyjęciem drugiego CMR.

Pełny scenariusz modelu: R1 ukończona po 22,20 s gry, saldo 110 $. R2 ukończona przy 440,35 s łącznego czasu, saldo 170 $. Przychody: 80 $ rozładunek + 20 $ przechowanie + 160 $ dostawy; pensje: 140 $; kapitał: 50 $. Wynik zależy od legalnie wybranych miejsc i kolejności działań.

`npm run build`: kontrola typów TypeScript i produkcyjny build Vite.

`python PixelHub_Codex_Pack/validate_config.py`: niezależny walidator dostarczonej mapy.

`npm run test:browser`: scenariusz Chromium klika pracownika, skrzynie i pola; przechodzi obie rundy, sprawdza podsumowania, załadowany bus, rozdzielczość 1440 i 760 px, restart i bankructwo. W trybie testowym czas jest przyspieszany wywołaniami tej samej symulacji, bez zmiany parametrów ekonomii lub teleportowania obiektów. Nie jest to ręczny test czasu dostawy ze stoperem ani pełny audyt wizualny każdego kryterium A–F.

Weryfikacja modelu odpowiada przede wszystkim A01–A03/A06, B01–B08, C01/C02/C04/C06, D01–D10, E01–E08. Test przeglądarkowy uzupełnia A05 i F01/F03/F04. Płynność C03 oraz wierność stylistyczna F05 mają opisane wyżej uproszczenia i nie są przedstawiane jako pełna zgodność z ilustracją referencyjną.

Wynik końcowy tej sesji: 11/11 testów modelu PASS, kontrola typów i build PASS, walidator konfiguracji PASS. Scenariusz Chromium na produkcyjnym buildzie (Vite preview) zakończył obie rundy przez kliknięcia, zmianę rozmiaru okna, restart i bankructwo: PASS, bez błędów JavaScript. Zapisano również `install_script` (`npm ci`, `npm run build`) i `start_skill` w szkicu konfiguracji środowiska; zapis nie oznacza publikacji ani sprawdzenia odtworzenia w nowym zadaniu.

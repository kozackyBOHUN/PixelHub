# PixelHub — audyt techniczny i poprawki

Data: 2026-10-31. Przedmiot: `kozackyBOHUN/PixelHub`, gałąź `feat/physical-pallet-jack`, pełny HEAD `ee23be2afe945e241a4775d4e099e047c7457e87`. Poprawki wyłącznie w `audit/pixelhub-full-review`, utworzonej z tego commitu. Porównanie z wcześniejszą implementacją `6a0a445` obejmuje źródła, konfigurację, testy, skrypty, dokumentację i workflow. PR #2 wskazał właściciel; jego bieżących metadanych nie potwierdzono przez API, ponieważ proxy zwróciło 403 dla `api.github.com`.

## A. Ocena ogólna

**Wniosek:** bazowe 32 zielone testy nie wykrywały rzeczywistych błędów. Potwierdzono odzyskiwanie ładunku z jadącego/zakończonego kursu, nieskończone anulowanie i kolizję cofania przy dozwolonej konfiguracji. Poprawki nie zmieniają mapy, parametrów ekonomii, trzech kliknięć, CMR, rund, prędkości ani zasad dostaw.

Oceny dotyczą wersji bazowej oraz kodu po poprawkach; nie są oceną wyłącznie liczby zaliczonych testów.

| Obszar | ee23be2 | Po poprawkach | Uzasadnienie |
|---|---:|---:|---|
| Architektura | 7/10 | 7/10 | Model bez DOM, wspólna geometria i odrębny planer; publiczny mutowalny stan oraz kombinacje flag `Task` nadal wymagają dyscypliny. |
| Mechanika paleciaka | 5/10 | 8/10 | Legalne osiowe ruchy i przegubowe łuki; usunięto nieskończone wycofanie i nieciągłość orientacji. To kinematyka, nie dynamika sił. |
| Kolizje i geometria | 6/10 | 8/10 | Pełne obrysy mają konserwatywny margines; cofanie wcześniej używało niespójnego, zbyt małego marginesu. |
| Algorytm tras | 8/10 | 8/10 | Niezależne wyszukiwanie potwierdza optymalność w kontrolach; brak dowodu optymalności poza skończonym grafem prymitywów. |
| Załadunek i rozładunek | 4/10 | 8/10 | Fizyczne komórki obu ładowni działają; usunięto nieaktualne źródło po odjeździe. |
| Ekonomia | 5/10 | 8/10 | Stawki i interwały poprawne, ale źródło po dostawie umożliwiało ponowne przejęcie tej samej skrzyni. |
| Logika rund | 8/10 | 8/10 | Obie rundy ukończone bez zmiany salda lub położeń przez test; złe decyzje nadal mogą blokować dostęp. |
| Wydajność | 6/10 | 7/10 | Planowanie skrócone o 8,5–22,4% w pomiarze; nadal synchroniczne, może powodować zauważalną pauzę. |
| Jakość testów | 5/10 | 8/10 | 32 bazowe → 52 testy, niezależny solver i wielokąty oraz rzeczywiste interakcje przeglądarkowe. |
| Gotowość do rozbudowy | 5/10 | 7/10 | Stabilniejszy fundament i powtarzalne narzędzia audytu; ograniczenia siatki i stanu trzeba respektować. |

`config.ts` definiuje mapę i typy; `pathfinding.ts` — geometrię, kolizje, ruchy i kolejkę; `transport.ts` — plan całej operacji; `simulation.ts` — czas, własność, fazy, pojazdy i księgę; `renderer.ts` — rysowanie; `main.ts` — wejście, HUD i pętlę. Renderer nie prowadzi własnej interpolacji położenia: korzysta z `transportGeometry`. Dodany `crateAngle` przechowuje również orientację w modelu. `pose` to ostatni zatwierdzony węzeł, nie pozycja ciągła podczas ruchu — rozszerzenia muszą korzystać z właściwego interfejsu.

## B. Wykryte błędy

Lokalizacje odnoszą się do nazw metod w kodzie po poprawkach; historia bazowa jest dostępna przez `git show ee23be2:<plik>`.

| ID | Priorytet | Lokalizacja | Problem | Status / potwierdzenie |
|---|---|---|---|---|
| AUD-01 | P0 | `src/simulation.ts`, `dispatch`, `order` | Nieaktualne źródło pozwalało zabrać skrzynię z kursu lub po zakończonej dostawie. | Naprawiony; 3 regresje stanu i rzeczywiste kliknięcia w Chromium. |
| AUD-02 | P1 | `src/simulation.ts`, odzyskiwanie po anulowaniu | Drugie anulowanie podczas wycofania tworzyło etap o czasie `Infinity`. | Naprawiony; regresja i dwukrotne Escape w Chromium. |
| AUD-03 | P1 | `src/pathfinding.ts`, `transitionRange`; `simulation.ts`, cofanie | 33 próbki z marginesem 0,002 nie obejmowały całego cofania. | Naprawiony; niezależne przecięcie wielokątów i regresja następnego kroku. |
| AUD-04 | P2 | `src/simulation.ts`, `order`/`LOWER` | Przechowywanie referencji do celu umożliwiało teleport po zmianie obiektu przez wywołującego. | Naprawiony przez kopię; regresja mutacji obiektu. |
| AUD-05 | P2 | `src/simulation.ts`, `advance` | Niepoprawny czas zatruwał akumulator albo doprowadzał do bankructwa bez upływu rzeczywistego czasu. | Naprawiony; ujemny czas, NaN, ±Infinity. |
| AUD-06 | P2 | `src/simulation.ts`, `LIFT`/`LOWER`; `renderer.ts`, `crate` | Po odłożeniu/pobraniu obrót grafiki skakał o 90°. | Naprawiony; dokładne kąty rzeczywistych wywołań renderera i PNG. |
| AUD-07 | P2 | `src/renderer.ts`, kolejność rysowania | Widełki nagle rysowały się nad odstawioną skrzynią; podobnie przy wsuwaniu. | Naprawiony; sprawdzona kolejność rysowania i PNG. |
| AUD-08 | P2 | `src/simulation.ts`, `free` używane w wyszukiwaniu | Skan skrzyń powtarzany przy dziesiątkach tysięcy zapytań kolizyjnych. | Naprawiony migawką tylko podczas synchronicznego wyszukiwania; benchmark i identyczne SHA tras. |
| AUD-09 | P2 | `tsconfig.json`, `package.json`, `tests/simulation.test.ts` | Build pomijał typowanie testów; dodatkowy check wykazał możliwe `null` przy `g.task.route`. | Naprawiony; `tsconfig.tests.json`, jawna asercja i `npm run typecheck`. |
| AUD-10 | P2 | `.github/workflows/` | PR nie uruchamiał walidacji; Pages sprawdzało model/build, lecz nie mapę i Chromium. | Dodany osobny workflow PR tylko do odczytu. Uruchomienie na GitHub pozostaje niezweryfikowane. |
| AUD-11 | P3 | `index.html` | Automatyczne żądanie favicon kończyło się 404 i błędem konsoli. | Naprawiony przez `data:,`; końcowy Chromium bez błędów sieci i konsoli. |
| AUD-12 | P3 | `.github/workflows/pages.yml` | Uprawnienia Pages/OIDC na poziomie całego workflow, akcje przypięte do tagów major. | Pozostawiony jako zalecenie hardeningu; nie wykryto exploitu i nie zmieniano procesu publikacji. |

### Odtworzenia i przyczyny

**AUD-01.** Załaduj skrzynię do busa, kliknij pracownika i tę skrzynię, następnie „Wyślij busa” i cel na podłodze. `source` pozostawał ustawiony, a `order` traktował brak fizycznej lokalizacji jako `tail(pose)`. Po 7,4 s testowego przebiegu skrzynia znajdowała się na paleciaku, mimo że bus miał jeszcze 22,6 s kursu. Również `delivered` dało się w ten sposób przejąć ponownie, otwierając drogę do kolejnej nagrody za ten sam ładunek. Rozwiązanie: odjazd unieważnia wybrane źródło, a zlecenie ponownie sprawdza typ i dostępność aktualnej lokalizacji. Nie zmieniano zasad nagród.

**AUD-02.** W `LIFT` anuluj; w odzyskiwaniu poczekaj na `WITHDRAW_FORKS`, przesuń czas o 0,2 s i anuluj ponownie. Kod generował `travel(a, {...a, mode:'pull'})`, choć `a` było już w trybie `pull`. Nie jest to żaden legalny ruch, więc `edgeCost` zwracał `Infinity`. Gra formalnie trwała aż do bankructwa. Rozwiązanie: pominięcie zbędnej zmiany trybu, zachowanie rzeczywistego wycofania. Test kontroluje skończoność etapów, stan skrzyni i brak zapłaty za anulowane podjęcie.

**AUD-03.** Dozwolona konfiguracja: promień 0,5, wychylenie dyszla 0,22 rad; pusty pchany łuk `(17,4.5,d0) → (15.5,4,d6)`, czas 1,359818305 s. Po 0,95 s zarezerwuj `(17,3)`, anuluj i wykonaj krok 0,05 s. Aktualny obrys był wolny, ale następny cofnięty obrys przecinał przeszkodę — niezależnie policzone pole przecięcia pracownika >9×10⁻⁷. Dotyczy obsługi dynamicznej blokady, nie oznacza wykrycia tej kolizji przy domyślnym wychyleniu 0,3. Rozwiązanie: wspólny analityczny limit prędkości punktów i margines zależny od długości sprawdzanego przedziału, również przy anulowaniu. Przy przeszkodzie zestaw pozostaje dokładnie w bezpiecznej pozycji.

**AUD-04.** Przekaż obiekt celu `(2,3)`, po przyjęciu zlecenia zmień jego pola na `(17,4)`. Trasa prowadziła do pierwszego miejsca, ale `LOWER` kopiował już zmodyfikowany cel. Obecne UI tworzy nowy obiekt na kliknięcie, zatem odtworzenie dotyczy kontraktu API/modelu, nie zwykłego trzeciego kliknięcia. Kopia przy przyjęciu zlecenia eliminuje aliasowanie bez zmiany rozgrywki.

**AUD-05.** `advance(-1); advance(1)` nie przesuwało czasu; NaN utrwalało niepoprawny akumulator; Infinity wykonywało symulację do bankructwa. Publiczne wejście czasu odrzuca teraz wartości niefinitywne i niedodatnie. RAF w normalnej grze nie powinien ich generować, ale interfejs modelu nie może sam uszkadzać zegara.

**AUD-06/07.** W rzeczywistym transporcie do `(3,5)` przed końcem `LOWER` renderer rysował skrzynię przy `−π/2`, a po przejęciu przez podłogę przy `0`. Ponadto zmieniał kolejność: skrzynia na paleciaku nad widłami, skrzynia na ziemi pod nimi. Rozwiązanie: orientacja świata + stały kąt względem paleciaka przechowywane w modelu; paleciak rysowany przed wszystkimi fizycznie spoczywającymi na nim skrzyniami. Test obejmuje również ponowne pobranie obróconej skrzyni. Nie wprowadzono osobnej animacji udającej poprawną logikę.

**AUD-08.** Każde `free` przeglądało skrzynie i mapę; samo zlecenie między rampami wykonywało 22–74 tys. takich zapytań. `planningFree` buduje stałą migawkę 144 komórek, zanim zacznie się synchroniczne wyszukiwanie. Wykonanie ruchu nadal sprawdza żywy świat; rezerwacje pojawiające się po zaplanowaniu nie są ignorowane. To optymalizacja kosztu pojedynczego zapytania, nie redukcja dokładności geometrii ani zakresu przeszukiwania.

**AUD-09/10.** `tsc` obejmował wyłącznie `src`; testy wykonywano przez usunięcie adnotacji typów. Jawne dołączenie typów Node i testów wykazało jeden rzeczywisty błąd statyczny. Obecnie build sprawdza źródła, testy i benchmark. Nowy `checks.yml` uruchamia model, typy, build, walidację mapy i test produkcyjny Chromium dla PR do `main` lub gałęzi funkcjonalnej, z `contents:read`, bez zapisanych credentials i bez joba deploy. Istniejący `pages.yml` pozostał bez zmian.

## C. Wykonane poprawki

Zmiany produkcyjne są ograniczone do potwierdzonych przyczyn:

- `simulation.ts`: walidacja fizycznego źródła, unieważnienie wyboru po wysłaniu busa, kopia celu, skończone odzyskiwanie, kontrola czasu, trwała orientacja i migawka zajętości dla wyszukiwania.
- `pathfinding.ts`: wspólna funkcja marginesu i `transitionRange` dla części trajektorii. Wzory ruchu, promienie, prędkości i graf planera nie zostały przepisane.
- `renderer.ts`: odczyt kąta z modelu i poprawna kolejność rysowania wideł/skrzyni. Zachowano pastelową stylistykę i interfejs.
- `index.html`: brak zbędnego żądania favicon. `scripts/browser_test.py` sprawdza również `console.error`, a nie tylko wyjątki strony.
- Testy audytowe, benchmark, skrypt UI, typowanie testów i osobny workflow walidacyjny utrwalają odtworzenia oraz narzędzia pomiarowe.

Nie zmieniono `game-config.json`, stawek ekonomicznych, lockfile, liczby obiektów MVP ani istniejącego procesu publikacji. Nie dodano bibliotek i usług. Nie scalano i nie wdrażano gry.

## D. Wyniki testów

| Sprawdzenie | Przed poprawkami | Po poprawkach |
|---|---|---|
| `npm test` | Oryginalne 32/32 PASS, 0 pominięć | 52/52 PASS, 0 fail, 0 skipped; ok. 3,36 s w końcowym zapisie |
| Nowe `audit-state.test.ts` na niezmiennym `ee23be2` | 6 FAIL, 2 PASS | 8/8 PASS |
| `audit-geometry.test.ts` na niezmiennym `ee23be2` | Pełny obrys PASS, cofanie FAIL | 2/2 PASS |
| `audit-planner.test.ts` | 10/10 PASS, 25 kontrolnych rozwiązań | 10/10 PASS |
| `npm run build` | PASS, źródła TypeScript + Vite | PASS, źródła + testy + benchmark TypeScript, Vite |
| Dodatkowe typowanie testów | FAIL: `g.task` może być null | `npm run typecheck`: PASS |
| `python PixelHub_Codex_Pack/validate_config.py` | PASS | PASS; mapa niezmieniona |
| `npm run test:browser` | PASS, poprzedni scenariusz nie wykrywał audytowanych błędów | PASS na izolowanym produkcyjnym buildzie; oba pełne etapy, 8 dostarczonych |
| `python scripts/audit_browser.py` | Wykryto skok kąta/warstw i favicon404; pomiary oraz interakcje zapisane | PASS; kąt i warstwy, dwa Escape w odzyskiwaniu, odjazd z zaznaczeniem, 390 px, ×4 |
| `npm audit --json` | 0 vulnerabilities, 76 zależności | Zależności/lockfile niezmienione; zapis wyniku w evidence |
| Workflow GitHub Actions | Brak walidacji PR | Dodany i lokalnie sprawdzony krok produkcyjny; wykonania na runnerze GitHub nie przeprowadzono |

Niezmienna kopia bazowa była odczytywana przez `git show`/`git archive`; nie resetowano wspólnego checkoutu. Regresje muszą zawodzić przed poprawką; porównania planera i wielokątów nie odwołują się do wcześniejszych zapewnień autora.

Kontrola geometrii używa niezależnej geometrii środków okręgów i przycinania wielokątów do komórek. Sprawdza **197 376 konfiguracji pośrednich**: oba promienie, wychylenia 0/0,3/π⁄4, cztery orientacje, ciągnięcie/pchanie, pusty/załadowany zestaw i fazy półkratkowe. Dodatkowa regresja sprawdza konkretny błąd następnego kroku przy 0,22 rad. Skończony zestaw próbek nie jest dowodem dla wszystkich liczb rzeczywistych; znaczenie ma również kontrola analitycznego ograniczenia przemieszczenia.

Niezależny solver modeluje jawnie pusty, załadowany, opuszczony i wychodzący zestaw, używa przeglądu minimum w tablicy/Map, nie produkcyjnej kolejki ani gotowych suffixów. Współdzieli prymitywy ruchu i kolizji — dlatego osobny audyt geometrii jest istotny. Potwierdzono, że najszybszy dojazd do źródła nie zawsze daje najszybszy transport (17,7784 vs 16,6338 s) i że najszybszy sam rozładunek może przegrać po uwzględnieniu wyjazdu (24,0676 vs 22,4061 s). Dodatnie koszty, ścisłe relaksacje i skończona siatka zapewniają zakończenie w obsługiwanym świecie. Test z zamkniętym korytarzem rzeczywiście zwraca brak planu.

Pełna rozgrywka zachowuje wynik modelu: runda 1 przy **109,80 s / 90 USD**, zwycięstwo przy **778,30 s / 70 USD**. Przychody 80 rozładunek +20 przechowanie +160 dostawy; płace 240, kapitał 50. Pary kolorów pozwalają finansować pracę bez zmiany stawek. Sprawdzono także kurs mieszany 45 s, pusty bus, powtórzenia anulowania, bezczynność/bankructwo, zmianę kolejności, własny rozładunek i brak trasy.

Sprawdzenie wszystkich 76 wolnych miejsc składowania na początkowej mapie przy źródle `1-0-0` przyjęło 76/76 pełnych zleceń. To weryfikacja osiągalności pojedynczego zadania w pustym magazynie, nie dowód, że każda sekwencja 76 wyborów pozostawia dostęp. Umieszczenie skrzyń przy drzwiach może później zablokować inny ładunek; nie dodawano automatycznego ratowania złych decyzji gracza.

Nowy krok CI został odtworzony lokalnie z osobnym portem. Pierwsza próba nie uruchomiła Chromium: cloud ma systemową przeglądarkę, a nie binarium Playwright w domyślnym cache. Skrypt pozwala podać `CHROMIUM_PATH`; na GitHub poprzedza go `playwright install --with-deps chromium`. Ponowne lokalne wykonanie całego kroku z `CHROMIUM_PATH=/usr/bin/chromium` zakończyło się PASS. Wynik z systemową przeglądarką i stan wykonania GitHub należy rozróżniać.

Dowody: [log 52 testów](audit-evidence/unit-tests-after.txt), [benchmark](audit-evidence/planner-benchmark.json), [przeglądarka przed](audit-evidence/browser-baseline.json), [przeglądarka po](audit-evidence/browser-final.json), [npm audit](audit-evidence/npm-audit.json). Zrzuty lokalne: `artifacts/audit-final/` i wcześniejsze katalogi `artifacts/audit*`, celowo ignorowane w Git.

## E. Wydajność

Polecenie odtworzenia:

```sh
node --experimental-strip-types scripts/audit_benchmark.ts \
  --baseline ee23be2 --repeat 5 --output /tmp/pixelhub-benchmark.json
```

Node 24.19.0, Linux, AMD EPYC 9V45, 5 logicznych CPU dostępnych maszynie. Każda wersja/układ w osobnym procesie; zimny pomiar po imporcie, następnie pięć pomiarów z cache geometrii. Pomiar rzeczywistego `Game.order` obejmuje budowę migawki. Osobne kopie kodu są instrumentowane do zliczania stanów; główne czasy są bez tego narzutu. Skrzynie 12/20 to test gęstości poza maksymalną liczbą ośmiu w MVP.

| Układ | Mediana ms przed | Mediana ms po | Zmiana | Rozwinięte stany (przed=po) | Mediana CPU user+sys ms przed → po |
|---|---:|---:|---:|---:|---:|
| 1 skrzynia | 57,61 | 52,03 | −9,7% | 3624 | 96,49 → 84,27 |
| 4 skrzynie | 57,16 | 52,28 | −8,5% | 3568 | 94,85 → 82,09 |
| 8 skrzyń | 51,81 | 42,98 | −17,0% | 2972 | 99,34 → 81,29 |
| 12 skrzyń, stress | 53,27 | 45,17 | −15,2% | 2892 | 101,10 → 78,70 |
| 20 skrzyń, stress | 50,52 | 39,22 | −22,4% | 2572 | 98,63 → 81,05 |
| 8, zablokowany korytarz | 20,70 | 16,82 | −18,8% | 1148 | 44,05 → 37,16 |

CPU obejmuje pracę procesu i JIT/wątki runtime, zatem nie jest tym samym co czas ścienny jednego wątku. Więcej skrzyń zamyka część przestrzeni, więc mniejszy czas w gęstszym układzie nie dowodzi lepszego skalowania w dowolnym świecie.

Dla wszystkich sześciu układów identyczne są SHA256 uporządkowanych etapów, przyjęcie/odrzucenie, koszt i liczba etapów, liczby stanów i operacji kolejki. Legalny transfer ma 60 etapów i koszt 48,5014246059 s. Zapytania do żywego modelu spadają z 22 082–73 937 do **288** (dwie migawki po 144 komórki). Ta sama liczba dalszych zapytań korzysta ze zbioru komórek; nie usunięto żadnego sprawdzania kolizji.

Pamięć Node/RSS ok. 83–104 MB obejmuje runtime, importy i cache. Heap/RSS w części przypadków rośnie, w części maleje: **brak podstaw do deklarowania redukcji pamięci**. Wszystkie surowe pomiary, SHA plików i scenariusze są w JSON.

Przeglądarka końcowa: rzeczywiste ×4 daje 20,15 s gry w 5,007 s ściennych (4,025×). 190 klatek, p95 odstępu 33,4 ms, maksimum 50 ms; rysowanie p95 0,8 ms, `advance` p95 0,2 ms. CDP TaskDuration ok. 4,99 s, ScriptDuration 0,538 s. Heap 27,63→21,37 MB; po wymuszonym GC 4,30→4,14 MB, DOM 213→213 w krótkiej obserwacji. Nie wykryto krótkoterminowego wycieku, nie jest to wielogodzinny test.

Baseline dev: około 55 FPS, końcowy produkcyjny pomiar około 38 FPS. Różne buildy, instrumentacja, współdzielone obciążenie i software SwiftShader wykluczają przypisywanie tej różnicy optymalizacji lub regresji. **Nie deklaruję poprawy FPS.** Pełna tekstura Canvas→Pixi, rysowanie tras i przepisywanie HUD co klatkę pozostają obszarem profilowania. Nie ograniczano dokładności kolizji dla uzyskania szybszych wyników.

## F. Pozostałe ograniczenia

1. Model to kinematyka: brak sił, mas, tarcia i dynamiki koła skrętnego. Mechaniczne połączenia i brak bocznego poślizgu są sprawdzane, nie jest to uniwersalny silnik fizyki.
2. Cztery osiowe orientacje węzłów, ruchy półkratkowe i ciągłe łuki 90° wystarczają do zweryfikowanej mapy 20×6, wszystkich początkowych miejsc składowania i obu rund. Nie obejmują każdej fizycznie możliwej trajektorii ani prostych skosów. Osiem kierunków wymagałoby nowej reprezentacji, normalizacji przekątnych, spójnych przegubów, kosztów i kontroli kolizji; nie dodano ich automatycznie.
3. Optymalność jest względem grafu oraz obowiązkowego końcowego wyjazdu do górnego korytarza. Ten warunek może odrzucić fizyczne odstawienie, które kończy się w innym bezpiecznym miejscu. Zmiana polityki zakończenia wymaga decyzji projektowej.
4. Dynamiczna blokada zachowuje trasę i wznawia ją po usunięciu przeszkody. Nie wyznacza automatycznie objazdu; można anulować i wskazać nowe zadanie. Nie dodawano nowego zachowania.
5. Planowanie pozostaje synchroniczne. Wyniki ~40–60 ms mogą dawać pojedyncze długie klatki; przyszłe większe mapy wymagają osobnej oceny budżetu/Workera.
6. `Game`, konfiguracja i `step` to wewnętrzny mutowalny model, nie granica bezpieczeństwa wobec wrogiego kodu. Walidacja czasu i kopiowanie celu zabezpieczają potwierdzone błędy, nie zastępują niezmiennych interfejsów. `?test=1` świadomie ujawnia interfejs testowy; bez flagi nie ma `window.pixelhub`.
7. Na 390 px nie ma poziomego przepełnienia, trafienia są poprawne, ale komórki mają ok. 13 px i cele dotykowe są małe; brak odpowiednika klawiaturowego operacji canvasu. To ograniczenie UX, bez przeprojektowania interfejsu w tym zadaniu.
8. `npm audit` nie zgłasza znanych podatności w dacie badania. Wszystkie 76 pobrań lockfile mają `registry.npmjs.org` i integrity; nie jest to dowód braku przyszłych podatności. Gra nie korzysta z backendu, eval, niezaufanego HTML ani kluczy API. HUD używa `textContent`.
9. Próbkowanie numeryczne jest konserwatywne z marginesem; może odrzucać manewry przy bardzo małym prześwicie. Testy nie stanowią dowodu dla wszystkich możliwych konfiguracji świata.
10. GitHub API zwracało 403; nie potwierdzono zdalnego statusu PR ani wykonania nowego workflow. Lokalnych testów nie utożsamia się z zaliczeniem CI GitHub lub publikacją.

## G. Rekomendacje rozwojowe

1. Po akceptacji audytu włączyć poprawki do gałęzi funkcjonalnej i uruchomić nowy workflow PR przed decyzją o `main`.
2. Wydzielić niezmienne polecenia i zawęzić publiczną mutowalność `Game`, zachowując istniejący kontrakt gry.
3. Reprezentować fazy `Task` unią rozłączną z zależnościami własności/wideł, aby nielegalne kombinacje były trudniejsze do skonstruowania.
4. Rozszerzyć generowane testy sekwencji i dłuższe testy pamięci, zachowując niezależny oracle.
5. Zmierzyć planowanie na słabszych urządzeniach; dopiero potem rozważyć Worker lub wyszukiwanie porcjowane.
6. Profilować aktualizacje HUD i kopiowanie tekstury przed zmianą technologii renderera.
7. Rozważyć lepsze wskazanie zablokowanej strony skrzyni i przyszłego dostępu, bez automatycznej zmiany reguł.
8. Osobno zaprojektować dostępność klawiatury/dotyku i minimalne cele interakcji.
9. Ograniczyć `pages:write`/OIDC do deploy joba i rozważyć przypinanie Actions do zweryfikowanych SHA.
10. Rozpatrywać dodatkowe orientacje lub alternatywne miejsca zakończenia dopiero po konkretnych scenariuszach, których obecny model nie obsługuje.

To propozycje, nie dodatkowe funkcje wdrożone w audycie.

## H. Werdykt

**WARUNKOWO — po włączeniu wskazanych poprawek audytowych do gałęzi systemu paleciaka.**

Nie rekomenduję scalania niezmienionego PR #2 w `ee23be2`: zawiera potwierdzony exploit własności/nagród i softlock anulowania mimo 32 zaliczonych testów. Wersja w `audit/pixelhub-full-review` usuwa potwierdzone usterki, przechodzi 52 testy oraz dwa rzeczywiste scenariusze Chromium, zachowuje ekonomię i daje identyczne optymalne plany w kontrolach. Nie znaleziono pozostałego nieusuniętego błędu P0/P1 w zbadanym zakresie; ograniczenia i niewykonane sprawdzenia opisano jawnie.

Warunki decyzji właściciela: przegląd zmian audytowych, ich akceptacja do gałęzi funkcjonalnej i sprawdzenie nowego workflow na GitHub. Werdykt nie stanowi zgody na scalanie ani wdrożenie. Nie scalono PR #2, PR audytowego, nie wykonano push do `main`, nie uruchomiono publikacji gry.

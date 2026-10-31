# PixelHub

Grywalna symulacja magazynu w przeglądarce: dwie rundy, dokładna mapa 20×6, jeden magazynier z paleciakiem i fizyczne przenoszenie skrzyń. Vite + TypeScript + PixiJS 8. Dokumentacja źródłowa: `PixelHub_Codex_Pack/`.

## Uruchomienie

Node.js 24 lub nowszy:

```sh
npm ci
npm run dev
```

Vite uruchamia grę na porcie 5173. `npm run build` sprawdza typy i tworzy `dist/`; `npm run preview` udostępnia wynik produkcyjny.

## Sterowanie

1. Kliknij kartonik CMR z czterema ikonami, aby przyjąć dostawę.
2. Kliknij pracownika (niebieska czapka), dostępną skrzynię, następnie wolne pole podłogi.
3. Paleciak musi mieć miejsce na ustawienie wideł, skręt i wycofanie. Po odstawieniu skrzyni pracownik cofa paleciak o jedną kratkę i tam czeka na kolejne polecenie. Po podsumowaniu przejdź do rundy 2. Załaduj własnego busa i kliknij „Wyślij busa”. Powtórz do dostarczenia wszystkich 8 skrzyń.

W każdym pasie auta tylny slot blokuje przedni. Ładuj najpierw przód. Dostępny ładunek można także wyjąć z własnego busa. Pomieszczenia i rampy nie są miejscami składowania. `Anuluj` / Escape przerywa wybór lub zadanie; przewożony ładunek pozostaje na paleciaku i wymaga wskazania nowego celu. Brak kolejki.

`×1`, `×2`, `×4` zmieniają tempo całej symulacji. Klawisz `G` / przycisk „Siatka” pokazuje współrzędne, przeszkody i obrys zestawu. Pensja wynosi 20 USD za ukończoną rundę (łącznie 40 USD za dwie rundy), bez naliczania kosztów za upływ czasu. Saldo ≤0 kończy grę.

## Testy

```sh
npm test
npm run build
python PixelHub_Codex_Pack/validate_config.py
```

Test przeglądarkowy wymaga uruchomionego `npm run dev`, Pythona, Playwright i Chromium:

```sh
python -m pip install -r scripts/requirements-browser.txt
npm run test:browser
```

Domyślnie test korzysta z `/usr/bin/chromium`. Ścieżkę można nadpisać zmienną `CHROMIUM_PATH`. Test klika obiekty na canvasie, przechodzi obie rundy, zmienia szerokość okna, restartuje i sprawdza bankructwo. Przesuwa wyłącznie czas przez publiczny krok symulacji w trybie `?test=1`; nie zmienia salda, położeń ani stanów skrzyń. Zrzuty zapisuje w ignorowanym `artifacts/`.

## Pliki

- `src/game-config.json` — jedno miejsce zmiany mapy, czasów i stawek; kopia konfiguracji dostarczonej w dokumentacji.
- `src/config.ts` — geometria, typy i walidacja mapy.
- `src/pathfinding.ts` — geometria przegubowego zestawu, dozwolone manewry, obrysy zamiatane i wyszukiwanie według czasu.
- `src/transport.ts` — planowanie pełnego zadania: pobranie, ciągnięcie/pchanie, odstawienie, wycofanie i wyjazd.
- `src/simulation.ts` — zegar, zadania, skrzynie, sloty, pojazdy, rundy i księga transakcji, niezależne od DOM/renderera.
- `src/renderer.ts` — grafika proceduralna, animacje i wspólne odwzorowanie współrzędnych.
- `src/main.ts`, `index.html`, `style.css` — PixiJS, sterowanie i polski HUD.
- `tests/simulation.test.ts` — testy mechaniki, w tym pełne przejście scenariusza.
- `scripts/browser_test.py` — test przeglądarkowy.

Szczegóły uproszczeń i wyników: [IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md).

## Publikacja z GitHub

Workflow `.github/workflows/pages.yml` po każdym pushu do `main` instaluje zależności z lockfile, uruchamia testy, buduje grę i publikuje wyłącznie `dist/` na GitHub Pages. Nie wymaga własnego serwera ani kluczy API.

Jednorazowo w repozytorium otwórz **Settings → Pages → Build and deployment → Source → GitHub Actions**. Następnie w **Actions → Build and deploy PixelHub** uruchom **Run workflow** (kolejne pushe do `main` uruchamiają publikację automatycznie).

Adres po udanej publikacji: `https://kozackybohun.github.io/PixelHub/`. Samo dodanie workflow nie oznacza, że adres już działa; wynik publikacji jest widoczny w zakładce Actions. Dla prywatnego repozytorium dostępność Pages zależy od planu GitHub.

Vite generuje względne adresy zasobów (`vite.config.ts`), więc wszystkie skrypty, tekstury i style działają również pod ścieżką `/PixelHub/`. Gra działa w całości w przeglądarce; nie potrzebuje backendu ani pobierania plików źródłowych w trakcie gry.

## Audyt techniczny

[PIXELHUB_AUDIT_REPORT.md](PIXELHUB_AUDIT_REPORT.md) opisuje niezależne odtworzenia, poprawki, wyniki 52 testów oraz ograniczenia. `npm run typecheck` sprawdza również testy i benchmark.

Powtarzalny pomiar planowania:

```sh
node --experimental-strip-types scripts/audit_benchmark.ts --baseline ee23be2 --repeat 5 --output /tmp/pixelhub-benchmark.json
```

Dodatkowy audyt przeglądarkowy wymaga działającego serwera, tych samych zależności Playwright i Chromium co `test:browser`:

```sh
python scripts/audit_browser.py
```

Skrypt wykonuje interakcje myszy, sprawdza orientację i kolejność rysowania, anulowanie, odjazd busa oraz mierzy rzeczywiste ×4. Wyniki zapisuje w ignorowanym `artifacts/audit/`. Pomiarów płynności w środowisku headless nie należy traktować jako benchmarku urządzeń użytkowników. Workflow `checks.yml` waliduje PR bez wdrażania gry.

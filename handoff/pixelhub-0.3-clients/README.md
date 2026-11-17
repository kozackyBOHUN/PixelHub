# PixelHub 0.3 — Klienci: pakiet dla Codexa

**Status:** zaakceptowane koncepcje sześciu postaci; robocze assety do integracji, nie finalny pixel art produkcyjny.

## Pobierz pakiet
- [Kompletny ZIP (48 plików, ok. 369 KB)](./pixelhub03_codex.zip)
- [Bezpośredni plik](https://github.com/kozackyBOHUN/PixelHub/raw/main/handoff/pixelhub-0.3-clients/pixelhub03_codex.zip)

**SHA-256 ZIP:** `fc997adf683ec9d07c66cd18ae693110fe9f0ff5d05556a575b77c681b4cef9b`

W archiwum są: **24 PNG postaci** (6 klientów × 3 portrety 72×72 px + awatar 48×48 px), **10 PNG UI**, 6 źródeł OpenRaster `.ora`, manifest, podglądy, skrypt walidacyjny i dokumentacja.

## Zadanie Codexa
1. Pobierz ZIP, rozpakuj i przeczytaj `START_HERE_CODEX.md`.
2. Zweryfikuj rzeczywistą wersję źródeł PixelHub 0.3 (bez powrotu do architektury 0.2).
3. Uruchom `python scripts/validate_assets.py` z katalogu paczki.
4. Umieść odpowiednie pliki w `public/assets/characters/clients/` i `public/assets/ui/dialogues/`; nie nadpisuj głównego manifestu grafiki ani dokumentacji mechaniki.
5. Podłącz portrety do **istniejącego** systemu klientów / dialogów, bez zmiany zasad rozgrywki. Jeśli system jeszcze nie istnieje, przygotuj podgląd DEV i wyraźnie oznacz blokadę; nie wymyślaj mechanik.
6. Przetestuj wszystkie emocje, skalowanie nearest-neighbor, 9-slice, dostępność przycisków, wydajność i brak regresji.
7. Po testach opublikuj implementację i zrzuty z prawdziwej gry, uaktualnij `PROJECT_STATUS.md`, `GRAPHICS_SPEC.md` i `CHANGELOG.md`.

Postacie: **Henryk, Anna, Robert, Kasia, Marek, Wiktor**.

**Uwaga:** to katalog przekazania zasobów. Samo opublikowanie ZIP-a na GitHubie nie oznacza jeszcze, że postacie działają w aktualnej grze. Integrację i wdrożenie wykonuje Codex.

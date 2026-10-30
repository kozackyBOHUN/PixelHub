# PixelHub — pakiet wdrożeniowy dla Codexa

## Najprostsze użycie
1. Wypakuj ZIP do katalogu głównego repozytorium gry; powstanie katalog `PixelHub_Codex_Pack/`.
2. Otwórz Codexa w tym repozytorium i wklej: **„Przeczytaj `PixelHub_Codex_Pack/START_HERE_CODEX.md` i zrealizuj całość zgodnie z dołączoną specyfikacją i testami. Nie pomijaj plików towarzyszących.”**
3. Jeśli nie chcesz wypakowywać dokumentacji, skopiuj treść `PIXELHUB_CODEX_ONE_FILE.md` jako pojedynczy duży prompt. Dołącz obraz `exact_grid_20x6.png` i referencję wyglądu, jeśli jest taka możliwość.

## Pliki
- `START_HERE_CODEX.md` — instrukcja startowa i priorytety.
- `PIXELHUB_MVP_SPEC.md` — szczegółowe reguły mechaniki i stanów.
- `game-config.json` — jedna, maszynowo czytelna konfiguracja mapy, ekonomii, pracownika i rund.
- `ACCEPTANCE_TESTS.md` — kryteria odbioru i przypadki testowe.
- `ASSET_AND_RENDER_GUIDE.md` — styl i rozdzielenie grafiki od logiki.
- `exact_grid_20x6.png` — geometria dokładna, sporządzona z JSON.
- `REFERENCE_visual_only_not_to_scale.png` — dostarczony screen, tylko odniesienie plastyczne; błędy geometrii i treści są w nim NIEOBOWIĄZUJĄCE.
- `PIXELHUB_CODEX_ONE_FILE.md` — wszystkie instrukcje w jednym pliku.

## Zastrzeżenie o grafice
Wygenerowane screeny są koncepcyjne, nie są siatką dokładną ani gotowym zestawem sprite'ów. Codex musi zbudować mapę na podstawie współrzędnych i siatki, nie z odrysowania screenu.

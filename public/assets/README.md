# Przyszłe grafiki PixelHub

Ten katalog nie zawiera finalnego artu. Brakujący PNG jest rysowany przez wspólny `AssetPainter` jako geometryczny placeholder.

1. Odczytaj `id`, `path`, klatki i kotwice z `catalog.json`.
2. Umieść PNG RGBA pod wskazaną ścieżką, np. `floors/base.png` albo `workers/default/walk.png`.
3. Przeładuj grę. Nie zmieniaj jej kodu ani logiki transportu.

Inne ścieżki i metadane można wpisać do `manifest.json`. `catalog.json` jest generowany z centralnego rejestru przez `npm run assets:manifest` i przy buildzie.

Kierunki postaci: N, NE, E, SE, S, SW, W, NW. Każda klatka 24×24; pomiędzy klatkami 1 px przezroczystego odstępu. Cztery oddzielne arkusze: idle 49×199, walk/pull/push 99×199. Korpus paleciaka: 16 kierunków w wierszach, arkusz 24×399. Można użyć wspólnego atlasu z jawnymi prostokątami w metadanych.

Pełna specyfikacja implementacji, warstw, modułów oraz testów: [GRAPHICS_CONTRACT.md](../../GRAPHICS_CONTRACT.md).

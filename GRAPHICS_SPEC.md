# Grafika 0.3

Renderer PixiJS. Kafelek źródłowy ma 24 × 24 px, podstawowa skala ×2 daje 48 × 48 px. Kamera skaluje i przesuwa widok magazynu. Grafika pozostaje pixelowa dzięki filtrowaniu nearest. Sprite’y mają indywidualne rozmiary i punkty zakotwiczenia zapisane w katalogu. Moduł pojazdu ma 24 px szerokości, część ładunkowa 48 px wysokości, a koło 8 px.

Kolejność warstw od dołu to otoczenie, podłoga, oznaczenia, cienie, tył konstrukcji, obiekty, przód konstrukcji, efekty i UI. Ruch i fazy podnoszenia wynikają ze stanu symulacji. Ładunek pozostaje pionowy podczas obrotu wózka. Kolorowe etykiety szarych palet wskazują odbiorcę i pozostałe rundy, a aktywne palety używają sprite’a koloru odbiorcy. Rezerwacje kolejki są oznaczone na mapie.

PNG są w public/assets. Katalog i identyfikatory definiuje src/graphics/assets.ts, warstwy i skale src/graphics/config.ts, a scenę src/graphics/scene.ts. Przy podmianie zachowaj ścieżkę, rozmiar, kotwicę i przezroczystość oraz uruchom npm run assets:manifest i testy renderowania. Aktualne przykłady są w [zrzutach](docs/screenshots/README.md).

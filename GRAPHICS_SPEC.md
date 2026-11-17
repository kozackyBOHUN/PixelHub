# Grafika 0.3

Renderer PixiJS. Kafelek źródłowy ma 24 × 24 px, podstawowa skala ×2 daje 48 × 48 px. Kamera skaluje i przesuwa widok magazynu. Grafika pozostaje pixelowa dzięki filtrowaniu nearest. Sprite’y mają indywidualne rozmiary i punkty zakotwiczenia zapisane w katalogu. Moduł pojazdu ma 24 px szerokości, część ładunkowa 48 px wysokości, a koło 8 px.

Kolejność warstw od dołu to otoczenie, podłoga, oznaczenia, cienie, tył konstrukcji, obiekty, przód konstrukcji, efekty i UI. Ruch i fazy podnoszenia wynikają ze stanu symulacji. Ładunek pozostaje pionowy podczas obrotu wózka. Kolorowe etykiety szarych palet wskazują odbiorcę i pozostałe rundy, a aktywne palety używają sprite’a koloru odbiorcy. Rezerwacje kolejki są oznaczone na mapie.

PNG są w public/assets. Katalog i identyfikatory definiuje src/graphics/assets.ts, warstwy i skale src/graphics/config.ts, a scenę src/graphics/scene.ts. Przy podmianie zachowaj ścieżkę, rozmiar, kotwicę i przezroczystość oraz uruchom npm run assets:manifest i testy renderowania. Aktualne przykłady są w [zrzutach](docs/screenshots/README.md).

## Klienci · roboczy art v0.1

Pakiet z handoff/pixelhub-0.3-clients zawiera 24 pliki PNG RGBA postaci (18 portretów 72 × 72 i 6 awatarów 48 × 48) oraz 10 PNG RGBA okienek. Gra ładuje je z public/assets/characters/clients i public/assets/ui/dialogues. Osobny client-characters.manifest.json dokumentuje źródła. Sześć plików OpenRaster jest w oryginalnym ZIP-ie.

Portret w otwartym dialogu ma 144 × 144 CSS px, na małym ekranie 72 × 72. Zwarty awatar używa ×1, a laboratorium pokazuje obie skale dla wszystkich postaci. Skalowanie pixelated, panele 9-slice z marginesem źródłowym 8 px, przyciski z marginesem 6 px. Tekst i statystyki pozostają HTML. W razie błędu odczytu portretu gra próbuje wariantu neutralnego, potem placeholdera.

Rzeczywista oferta Henryka używa roboczego portretu zmartwionego, a akceptacja i powrót pokazują wariant radosny. Neutralny oraz wszystkie inne emocje można obejrzeć w laboratorium. Pozostałe pięć postaci z pakietu nie ma przypisanych zdarzeń w obecnej kampanii. Maja i Lena zachowują własne teksty, zlecenia i dotychczasowy placeholder. Mimika i kontury artu v0.1 czekają na przegląd artystyczny.

[Dialog Henryka](docs/screenshots/clients/henryk-dialog.png) · [Telefon](docs/screenshots/clients/henryk-dialog-mobile.png) · [Sześć postaci ×1](docs/screenshots/clients/szesc-postaci-x1.png) · [Sześć postaci ×2](docs/screenshots/clients/szesc-postaci-x2.png)

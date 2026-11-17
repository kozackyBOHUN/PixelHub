# Grafika 0.3

Renderer PixiJS. Kafelek źródłowy ma 24 × 24 px, podstawowa skala ×2 daje 48 × 48 px. Kamera skaluje i przesuwa widok magazynu. Grafika pozostaje pixelowa dzięki filtrowaniu nearest. Sprite’y mają indywidualne rozmiary i punkty zakotwiczenia zapisane w katalogu. Moduł pojazdu ma 24 px szerokości, część ładunkowa 48 px wysokości, a koło 8 px.

Kolejność warstw od dołu to otoczenie, podłoga, oznaczenia, cienie, tył konstrukcji, obiekty, przód konstrukcji, efekty i UI. Ruch i fazy podnoszenia wynikają ze stanu symulacji. Ładunek pozostaje pionowy podczas obrotu wózka. Kolorowe etykiety szarych palet wskazują odbiorcę i pozostałe rundy, a aktywne palety używają sprite’a koloru odbiorcy. Rezerwacje kolejki są oznaczone na mapie.

PNG są w public/assets. Katalog i identyfikatory definiuje src/graphics/assets.ts, warstwy i skale src/graphics/config.ts, a scenę src/graphics/scene.ts. Przy podmianie zachowaj ścieżkę, rozmiar, kotwicę i przezroczystość oraz uruchom npm run assets:manifest i testy renderowania. Aktualne przykłady są w [zrzutach](docs/screenshots/README.md).

## Klienci · roboczy art v0.1

Pakiet z handoff/pixelhub-0.3-clients zawiera 24 pliki PNG RGBA postaci (18 portretów 72 × 72 i 6 awatarów 48 × 48) oraz 10 PNG RGBA okienek. Gra ładuje je z public/assets/characters/clients i public/assets/ui/dialogues. Osobny client-characters.manifest.json dokumentuje źródła. Sześć plików OpenRaster jest w oryginalnym ZIP-ie.

Portret w otwartym dialogu ma 144 × 144 CSS px, na małym ekranie 72 × 72. Zwarty awatar używa ×1, a laboratorium pokazuje obie skale dla wszystkich postaci. Skalowanie pixelated, panele 9-slice z marginesem źródłowym 8 px, przyciski z marginesem 6 px. Tekst i statystyki pozostają HTML. W razie błędu odczytu portretu gra próbuje wariantu neutralnego, potem placeholdera.

Rzeczywista oferta Henryka używa roboczego portretu zmartwionego, a udana realizacja i powrót zadowolonego klienta pokazują wariant radosny. Akceptacja zachowuje emocję oferty. Neutralny oraz wszystkie inne emocje można obejrzeć w laboratorium. Anna, Robert, Kasia, Marek i Wiktor reprezentują stałych zleceniodawców standardowych kontraktów. Maja i Lena używają własnych portretów z dodanej paczki, z zachowaniem swoich tekstów i historii. Mimika i kontury artu v0.1 czekają na przegląd artystyczny.

[Dialog Henryka](docs/screenshots/clients/henryk-dialog.png) · [Telefon](docs/screenshots/clients/henryk-dialog-mobile.png) · [Osiem postaci ×1](docs/screenshots/clients/osiem-postaci-x1.png) · [Osiem postaci ×2](docs/screenshots/clients/osiem-postaci-x2.png)

## Pracownik i przeszkody · audyt stabilności

Wszystkie cztery atlasy pracownika są wczytywane i walidowane przed obsługą gry. Błędny lub brakujący PNG trafia do diagnostyki zasobów z powodem i kontrolowanym placeholderem. Standardowe przejścia animacji korzystają z gotowych atlasów. Porównano 112 klatek w ośmiu kierunkach oraz fizyczny transport. Twarz, nakrycie głowy, kolory ubrań i proporcje są spójne. Wcześniej asynchroniczne ładowanie przy pierwszym użyciu animacji pozwalało przez chwilę zobaczyć programowy placeholder.

Przeszkody mają odrębne rysunki pikselowe kartonów, połamanych palet, opon i sprzętu. Kod renderuje je bez wygładzania w src/graphics/engine.ts. Pasek nad sprzątanym polem pokazuje dojście i postęp pracy. [Klatki i rzeczywiste stany pracownika](docs/screenshots/stability/).
Przy podnoszeniu i odkładaniu zachowujemy klatkę i kierunek push/pull. Nie wolno wybierać idle skierowanego przeciwnie do kończącego się transportu. Regresję sprawdza tests/stability.test.ts.

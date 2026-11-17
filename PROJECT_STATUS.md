# Stan projektu

Aktualizacja 2026-11-17. PixelHub 0.3 — Ostatni magazyn.

## Zakres wydania

Trzy niezależne strefy modułowe, rampy i własna flota, fizyczny transport, kolejki pracowników, MIX, chłodnia, mroźnia, serwis, Piesek, sezon 30 rund i dalsza gra pozostają aktywne. Zachowano aktualne atlasy i portrety grafika.

Poprawiono przygotowanie animacji przed startem, kierunek postaci przy podnoszeniu i odkładaniu, rozładunek bezpośrednio do auta, koszty ramp, sprzątanie z postępem, kamerę, raport finansowy, jawne wczytywanie starszej kampanii i utrwalanie odpraw po sezonie. Usunięto premię 520 USD. Standardowi klienci mają stałą tożsamość; Maja i Lena używają własnych portretów. Przyjęcie kontraktu nie oznacza sukcesu.

## Weryfikacja i przekazanie

[Audyt, rzeczywista ekonomia i zrzuty](docs/STABILITY-AUDIT.md). Testy przeglądarkowe uruchamia `npm run test:browser`, testy mechaniki `npm test`. Fizyczną kampanię z kontraktami i rundami 31–35 sprawdza `node --experimental-strip-types scripts/campaign-playthrough.ts --story`. Parametr `--fixtures` odtwarza zapisane scenariusze; nie podmieniać ich danymi starej kampanii.

[Gra na GitHub Pages](https://kozackybohun.github.io/PixelHub/). Publikacja z `main` następuje po testach; pełny SHA w nagłówku należy porównać z zakończonym wdrożeniem Actions.

## Uwagi dla kolejnych agentów

Portrety: `public/assets/characters/clients/<id>/`, rejestr `src/portraits.ts`. Materiały pozostają oznaczone **INTEGRATED — ART DRAFT**. Nie zastępować ich historycznymi grafikami. Stawki i ceny są w [ECONOMY_SPEC.md](ECONOMY_SPEC.md), bez dodatkowego dofinansowania pierwszej rundy. Zapis fabularny, wcześniejsza kampania i tryb deweloperski mają osobne klucze. Starszy zapis jest dostępny dopiero po świadomym wybraniu wczytania. Gęsty magazyn nadal wymaga planowania miejsca i przekładania palet; zakup wszystkich ulepszeń natychmiast nie jest gwarantowany.

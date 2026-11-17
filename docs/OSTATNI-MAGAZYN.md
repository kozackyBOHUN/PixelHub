# Ostatni magazyn — PixelHub 0.3

## Pierwsza runda

Start 0 USD, jeden pracownik, ręczny paleciak i własne auto z czterema slotami. Jeden CMR: cztery czerwone i cztery niebieskie palety. Podstaw ciężarówkę, wybierz pracownika, wskaż paletę i miejsce odłożenia lub własne auto. Wykonaj dwa kursy. Przycisk pokazuje czas i koszt przed wysyłką. Jednokolorowe kursy dają końcowe 52 USD, mieszane 22 USD. Brak premii 520 USD. Obowiązują zwykłe stawki; ujemne saldo po rozliczeniu oznacza bankructwo.

## Sprzątanie

Kliknij przeszkodę, mając 5 USD i wolnego pracownika. Po fizycznym dojściu obok przeszkody pracownik wykonuje dwusekundowe sprzątanie z widocznym postępem. Opłata następuje raz przy usunięciu. Można anulować zadanie; zapis przechowuje stan i usunięte blokady.

## Klienci i sezon

Henryk — Piekarnia pod Młynem; Maja — Fundacja Dobre Jutro; Lena — Most Pomocy. Dane historii i warunków powrotu są w `src/story.ts`. Wykonanie pierwszej umowy Henryka odblokowuje większą ofertę. Przyjęcie tworzy fizyczny CMR; odmowa nie pobiera opłaty. Samo przyjęcie nie ustawia happy. Standardowi klienci Anna, Robert, Kasia, Marek i Wiktor zachowują tożsamość i historię.

Po R30 można kontynuować z tą samą firmą. Plan rundy jest utrwalany przed zakupami oraz po zapisie i wczytaniu. Generator uwzględnia flotę, przestrzeń i wyposażenie. Powroty klientów są kolejnymi zamówieniami, bez ponownego odgrywania jednorazowych historii.

## Zapis i portrety

Zapis v10 przechowuje fabułę. Starsza kampania jest dostępna przez jawny przycisk w narzędziach i zachowuje oryginalny zapis. Tryb deweloperski ma osobny klucz.

Aktualne pliki grafika są w `public/assets/characters/clients/<id>/`: `<id>_portrait_neutral.png`, `<id>_portrait_happy.png`, `<id>_portrait_worried.png` i `<id>_avatar.png`. Portrety 72 × 72 i awatary 48 × 48, PNG RGBA, filtrowanie pikselowe. Rejestr: `src/portraits.ts`. Wszystkie trzy postacie fabularne mają własne portrety; nie nadpisujemy ich historycznymi materiałami.

## Weryfikacja

[Aktualny audyt i rzeczywisty bilans](STABILITY-AUDIT.md) · [Specyfikacja grafiki](../GRAPHICS_SPEC.md).

- `node --experimental-strip-types --test tests/story.test.ts tests/stability.test.ts`
- `node --experimental-strip-types scripts/campaign-playthrough.ts --story --fixtures`
- `python scripts/story-browser.py` po buildzie i wygenerowaniu checkpointów z `PIXELHUB_CHECKPOINTS=1`
- `npm run test:browser`

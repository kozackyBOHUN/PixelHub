# Ostatni magazyn · kandydat do przeglądu

Baza wydania: 840a383. Implementacja na gałęzi feature/ostatni-magazyn. Produkcja pozostaje na dotychczasowym buildzie do odbioru kandydata.

## Runda 1

Start 0 USD, jeden pracownik, jeden ręczny paleciak i własne auto z czterema slotami. Jeden CMR przywozi osiem palet, po cztery czerwone i niebieskie. Gracz podstawia pojazd, przemieszcza towar i wysyła dwa pełne kursy. Kursy mieszane są dozwolone. Przed wyjazdem przycisk pokazuje koszt i czas. Niewysłaną paletę można zdjąć z auta.

Zlecenie wypłaca jawne, robocze wynagrodzenie 520 USD po dostarczeniu wszystkich palet. Zwykłe stawki operacyjne 0.3 obowiązują również w samouczku. Saldo 0 USD jest poprawne. Ujemne saldo po rozliczeniu wciąż kończy działalność. Przeniesienie czterech dawnych palet z R1 do R2 zachowuje ich terminy i późniejszy stan magazynu. Nowy bilans 30 rund wynosi 1018/1018.

## Sprzątanie

Kliknięcie przeszkody zleca pracownikowi dojazd na sąsiednią kratkę. Po dotarciu gra usuwa blokadę siatki i rozlicza 5 USD. Bez gotówki ani wolnego pracownika zlecenie jest niedostępne. Zapis przechowuje blokady i aktywne zlecenie sprzątania.

## Klienci i sezon

Dane trzech klientów, wydarzeń i warunków powrotu są w src/story.ts. Wykonanie pierwszej umowy Henryka uruchamia większą ofertę w R9. Analogiczne zależności mają fundacja i organizacja pomocowa. Akceptacja tworzy fizyczny CMR, a odmowa nie pobiera opłaty. Termin oznacza rundę realizacji. Szczegóły przedstawiają klienta, wymagania i wynagrodzenie w odprawie.

Na koniec R30 gra pokazuje stan firmy oraz kursy, klientów i wydarzenia. Przycisk kontynuacji uruchamia R31 z tą samą firmą. Kolejne rundy tworzą regularne przyjazdy i wysyłki ze stabilnym ziarnem zależnym od rundy. Zakres od dwóch do sześciu dostaw zależy od przestrzeni, floty i zespołu. Praca na następnych rundach nadal pozwala przyjmować dodatkowe oferty i inwestować.

## Zapis i portrety

V10 zapisuje nową kampanię. Zapis v8/v9 może być nadal wczytany na dotychczasowych manifestach i zostaje zachowany pod starym kluczem. Nowa gra uruchamia fabułę. Tryb deweloperski ma osobny zapis i odtwarza rundy 1–31.

Dla grafika: umieść pliki w public/assets/clients/<id>/ i zarejestruj warianty w src/portraits.ts. Nazwy to portrait-neutral.png, portrait-happy.png, portrait-worried.png oraz odpowiedniki avatar-. Portrety 72 × 72 i awatary 48 × 48, PNG RGBA, filtrowanie pikselowe. Kandydat używa neutralnego, wspólnego placeholdera.

## Weryfikacja

- node --test tests/story.test.ts
- node scripts/campaign-playthrough.ts --story --fixtures
- python scripts/story-browser.py po buildzie i wygenerowaniu checkpointów z parametrem PIXELHUB_CHECKPOINTS=1
- [Zrzuty z lokalnego buildu](screenshots/story/)

## Decyzje do odbioru

Stawka 520 USD za pierwszą usługę, robocze terminy i wynagrodzenia klientów, finalne portrety i oprawa przeszkód.

## Wyniki kandydata

150 krótszych testów przeszło. Osobny fizyczny przebieg rund 1–30 potwierdził 1018 przyjęć, 1018 dostarczonych palet, pusty magazyn i saldo 649 USD. Z kontynuacji po tym finale runda 31 obsłużyła cztery przyjazdy i 16 wysłanych palet. Rozliczenie zakończyło się saldem 644 USD. Chrome przeszedł scenariusz pierwszego rozładunku, sprzątania i odświeżenia, oferty i powrotu Henryka, finału oraz kontynuacji z tym samym saldem i poziomami stref.

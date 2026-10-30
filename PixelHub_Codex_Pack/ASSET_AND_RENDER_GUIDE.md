# PixelHub — wytyczne graficzne i proporcje

## Ścisła zasada
`exact_grid_20x6.png` to **wzór geometrii**, a `REFERENCE_visual_only_not_to_scale.png` to **wzór nastroju i wyglądu**. Jeśli są sprzeczne, mapa i specyfikacja zawsze wygrywają.

## Kamera
- Jeden wspólny widok 2.5D, jak w pastelowym symulatorze pixel-art. Rozpoznawalne ściany, izometryczno-ukośne sylwetki obiektów, ale **podłoga pozostaje ortogonalnym rasterem 20×6 w logice i czytelna w renderze**.
- Unikaj mocnego rzutu izometrycznego, w którym niewygodnie wybiera się pole przy pomieszczeniach. Zachowaj lekkie nachylenie/krótkie pionowe ściany, jak w referencji.
- Jeden transform `gridToScreen` i dokładnie odwrotny `screenToGrid` dla kliknięć (dla sprite'ów i skrzyń też); render mapy i eventy wejścia nie mogą się rozjechać.
- Pole = jeden kwadrat podłogi w świecie logicznym. Wszystkie skrzynie 1×1 mają ten sam footprint, a pracownik z paleciakiem 1×2. Auta nie mogą powodować powstania dodatkowych krat wewnątrz hali.

## Palette (orientacyjna, nie sztywna)
- Podłoga: chłodne szaroniebieskie płytki, delikatna kratka i cienkie obrzeża.
- Ściany: jasne szarości, pastelowe odcienie stali, bursztynowe światło nad rampami.
- Przyjezdna skrzynia magazynowa: wyblakła czerwień / wyblakły błękit z małą cyfrą `1`.
- Aktywna skrzynia wysyłkowa: intensywna, lecz pastelowa czerwień / niebieski.
- Pracownik: niebieska czapka, pomarańczowa kamizelka; paleciak ręczny żółty.
- Szatnia: niebieskie szafki; biuro: biurko i monitor; toaleta: WC i umywalka; stołówka: stół, dwa lub trzy krzesła.
- Trasy: jasno-niebieskie (#4299E1), zielone (#43C16F), czerwone (#DF5454), dyskretne przerywane linie widoczne tylko po zaznaczeniu pracownika.

## UX
- Ikony skrzyń na CMR da się policzyć. Miejsce CMR: górny lewy fragment UI, nie nad przejazdem.
- Niewidoczne / wyszarzone nieaktywne przyciski; wizualne podkreślenie klikniętego pracownika, legalnych skrzyń i pól docelowych.
- Auto odjeżdża z widoczną animacją, przy busie wracającym licznik zegara; zielona strzałka pojawia się wyłącznie po częściowym lub pełnym załadunku.
- Wszystkie etykiety po polsku. Zero przypadkowych `Round 1/3`, euro i przychodu 2450 $ z referencji.

## Jeśli brakuje gotowych assetów
Zbuduj podstawową grafikę ze spójnych proceduralnych prostokątów / prostych sprite'ów w rozmiarach wielokrotności tileSize. Istotniejsze są płynny ruch, dokładne obrysy i prawidłowe kliknięcia niż zaawansowany ilustracyjny shading. Nie importuj gotowego screenshotu jako tła mapy; nie jest zgodny geometrycznie.

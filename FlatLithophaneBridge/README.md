# Adaptér původního .NET jádra pro plochý editor

Tento samostatný program odkazuje přímo na původní `LithophaneStlGenerator.csproj`.
Nemění jeho konzolové rozhraní ani zdrojové soubory. Volá původní
`ImageProcessor.LoadAndProcessImage`, `HeightMapGenerator.GenerateHeightMap`,
všechny čtyři varianty vyhlazování, `ContinuousSurfaceHeightMapToMeshConverter`
a `StlWriter.SaveToFile`.

```powershell
dotnet build FlatLithophaneBridge/FlatLithophaneBridge.csproj -c Release
dotnet FlatLithophaneBridge/bin/Release/net8.0/FlatLithophaneBridge.dll request.json output-directory
```

Vstup `FlatRequest` v `Program.cs` obsahuje cestu ke složenému šedému PNG, fyzické
rozměry, minimální/maximální tloušťku, šířku okraje, jeho nezávislou výšku
`BorderHeight`, pole souřadnic `X`/`Y`
a parametry vyhlazování. Souřadnice zahrnují přesné hranice okraje. Složení vrstev
a jejich nedestruktivní úpravy zajišťuje `spherical/flat.py`; .NET dostává jasovou
kompozici ve výsledném počtu vzorků. Původní převzorkování tedy v této cestě
nezmění velikost obrázku. Vrstvy se na cílové mřížce vzorkují bilineárně.

Adaptér po vyhlazení nastaví chráněné uzly okraje na `BorderHeight` (0,1–20 mm),
která smí být mimo rozsah tlouštěk obrázku. Pro staré požadavky bez této
vlastnosti použije maximum. Kompozitor před vyhlazením odřízne přesah obrázků
za obrazovou plochu, takže neovlivňuje vyhlazování přes motiv na lemu. Převzaté
trojúhelníky horního povrchu opraví do os X = šířka, Y = výška, Z = tloušťka
a na přesný vnější rozměr. Původní převodník používá krok rozměr / počet bodů,
takže sám končí o jeden krok před zadanou velikostí. Původní základna ze dvou
trojúhelníků také nesdílí segmentaci s obvodem. Adaptér proto uzavírá převzatý
horní povrch segmentovanými boky a vějířem spodních trojúhelníků s konzistentní
orientací. Tyto opravy platí jen pro nové rozhraní; původní CLI se nemění.

Výstupy jsou `result.stl` a `heights.bin`. Binární mapa obsahuje dva 32bitové
počty (šířka, výška), poté 32bitová desetinná pole X, Y a výšky po řádcích;
vše v pořadí bajtů od nejnižšího. Three.js sestaví z těchto dat stejný povrch,
obvod a základnu jako export. Výpočty omezujeme na 600 000 uzlů.

Nové rozhraní vystavuje spojitý povrch. Varianty Cubic a Simple zůstávají
dostupné v původním konzolovém programu. Lanczos3 v původním kódu zatím není
implementovaný a nové rozhraní jej nenabízí.

Integrační testy `spherical/tests/test_flat.py` spouštějí skutečný sestavený
adaptér, měří rozměry a tloušťky a ověřují, že každá hrana má dvě protilehlá
použití. Kontrolují také původní konzolový program. `test_flat_server.py`
ověřuje přenosný projekt, přibalení aktuálního STL a odmítnutí starého výsledku.
Před testy je potřeba adaptér sestavit; bez DLL se integrační testy přeskočí.

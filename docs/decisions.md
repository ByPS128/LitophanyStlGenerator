# Dodané změny a rozhodnutí

## 2026-11-08 — Přesah obrázků a samostatná výška lemu

**Co:** Plochý editor umožňuje volitelně přesahovat obrazovou plochu a motiv
oříznout. Lem má samostatnou šířku a výšku pro zasunutí do připraveného rámečku.

**Jak:** `allow_overflow` vypne omezování transformací ve vrstvě rozhraní i na
serveru. Kompozice je oříznutá před filtrováním; po něm .NET znovu nastaví přesnou
výšku chráněných uzlů lemu. `border_height_mm` je nezávislá na min/max motivu.
Nové projekty mají výšku lemu 0,6 mm, starší soubory bez nového pole zachovávají
původní maximum. Nastavení se ukládají do projektu. Testy skutečných STL ověřily
nízký i vysoký lem se všemi filtry, přesné vnější rozměry a uzavřenost sítě.

**Odkazy:** [Úkol 3](https://github.com/ByPS128/LitophanyStlGenerator/issues/3),
[PR 4](https://github.com/ByPS128/LitophanyStlGenerator/pull/4).

## 2026-11-08 — Ploché litofánie s původním .NET jádrem

**Co:** Přidán samostatný plochý editor s vrstvami, obrázky z počítače/URL,
úpravami PNG, prosvícením, volitelným chráněným okrajem a projekty `.luna`.
Tlačítka rozlišují rozpracovaný projekt od tiskového STL a uložení hlásí,
zda výsledný model skutečně přibalilo.

**Jak:** Nový `FlatLithophaneBridge` odkazuje na původní .NET projekt a volá jeho
generování výšek, vyhlazování, spojitý převodník a zápis STL. Původní zdrojové
soubory a CLI se nemění. Adaptér opravuje rozměry převzatého povrchu a uzavírá
jej segmentovanými boky a základnou. Okraj se vynucuje po vyhlazení; natočené
vrstvy se vejdou celé do obrazové plochy. Náhled při úpravách je zjednodušený,
po přepočtu zobrazuje stejný povrch jako .NET export. Typ projektu odděluje
plochou a kulovou kompozici. Automatické testy ověřily skutečné STL a původní
CLI; vizuální ovládání blokovala chyba nástroje pro ovládání prohlížeče.

**Odkazy:** [Úkol 3](https://github.com/ByPS128/LitophanyStlGenerator/issues/3),
navazuje na [úkol 1](https://github.com/ByPS128/LitophanyStlGenerator/issues/1).

## 2026-11-08 — Výchozí motiv a výměna zdrojů vrstev

**Co:** Nový projekt a import STL vytvářejí jednu konfigurovatelnou ukázkovou
vrstvu. Přidání a výměna obrázku podporují soubor z počítače i veřejnou URL.

**Jak:** `spherical/config.json` určuje výchozí model a obrázek. Výměna zdroje
ponechá metadata vrstvy a oddělí nový zdroj od duplikovaných vrstev. Stahování
omezuje velikost a kontroluje veřejnou cílovou IP při každém přesměrování.
Uložený `.luna` nadále obsahuje skutečné zdrojové bajty, otevření nevyžaduje URL
a nepřidává ukázkovou vrstvu ani do projektu s nulovým počtem obrázků.

**Odkazy:** [Úkol 1](https://github.com/ByPS128/LitophanyStlGenerator/issues/1),
[PR 2](https://github.com/ByPS128/LitophanyStlGenerator/pull/2).

## 2026-11-08 — Místní kulový editor Luna

**Co:** Přidán samostatný editor měsíční skořepiny s vrstvami PNG, skutečnou 3D
scénou, Ctrl + kliknutím pro kotvu, Shift pro zachování poměru stran, podsvícením,
ověřením geometrie a exportem STL. Přidána příprava scény pro Blender Cycles;
skutečné vykreslení v Blenderu zatím neověřeno, protože nebyl nainstalovaný.

**Jak:** Python/VTK adaptuje uživatelův prototyp `Spheric_litophany`. TypeScript a
Three.js nahrazují původní obrázkový náhled. Upravuje se vnitřní stěna, vnější
vrcholy a vrcholy mimo motiv se zachovávají. Export vyžaduje úspěšné ověření
vzorků aktuální geometrie; nulová průhlednost se neřeší globálním ořezem tloušťky.
Původní .NET nástroj zůstává pro ploché litofánie. Omezení a spuštění jsou
v `spherical/README.md`.

Každá vrstva má vlastní metadata a nedestruktivní úpravy PNG: převod do šedi,
úrovně, jas, kontrast, gama a výběr barvy pozadí s tolerancí. Pořadí vrstev
ovlivňuje překryvy, tiskové limity jsou společné. Přenosný projekt `.luna`
obsahuje přesné vstupní STL a obrázky, upravená PNG, metadata a případně aktuální
ověřené STL. Tři draci na dodaném modelu prošli ověřením i uložením/načtením projektu.

**Odkazy:** [Úkol 1](https://github.com/ByPS128/LitophanyStlGenerator/issues/1).

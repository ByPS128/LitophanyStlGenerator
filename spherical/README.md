# Luna — prostorový editor kulové litofánie

Luna obsahuje také [plochý editor s původním .NET jádrem](../FlatLithophaneBridge/README.md),
dostupný na `/flat.html`. Oba editory mají oddělené rozpracované projekty.

Samostatná místní aplikace: Python/VTK měří a upravuje STL, TypeScript/Three.js
zobrazuje skutečnou trojúhelníkovou síť v prohlížeči. Původní .NET generátor
plochých litofánií zůstává samostatný. Geometrické pomocné funkce vycházejí
z uživatelova prototypu `Spheric_litophany`; nové jádro odděluje průhlednost od
jasu, chrání nezasažené vrcholy a ověřuje výslednou geometrii před exportem.

## Spuštění ve Windows

Požadavky: Python 3.12 nebo 3.13, Node.js 22.12+ nebo 24, prohlížeč s WebGL2.
Pro plochou variantu je potřeba také .NET SDK podporující .NET 8 a runtime .NET 8.
`Start-Luna.ps1` sestaví adaptér i původní projekt před spuštěním rozhraní.
Pro finální scénu je volitelně potřeba Blender 4.2 nebo novější. Vývoj a testy
proběhly s Pythonem 3.13.2, Node.js 24.14.1 a VTK 9.7.2.

Nejjednodušší spuštění ve Windows: otevři **`Start-Luna.cmd`** v kořeni projektu.
Připraví Pythonové prostředí (při prvním spuštění i závislosti), sestaví web
a původní .NET jádro s adaptérem, spustí místní službu na pozadí a otevře
rozcestník. Potřebuje nainstalovaný Python, Node.js/npm a .NET SDK uvedené výše.
`Start-Luna.cmd -Install` znovu nainstaluje závislosti. Opakované spuštění
otevře již běžící spravovanou instanci; aktualizace kódu vyžaduje zastavení a nový start.

**`Stop-Luna.cmd`** po potvrzení zastaví tuto instanci i případné její výpočty.
Předtím ulož projekty v obou editorech; neuložená práce v paměti se ztratí.
Uložené soubory se nemažou. Starší ručně spuštěné instance ani jiné Pythonové
a .NET aplikace se neukončují. Spouštěč kontroluje cestu programu, příkaz a čas
vzniku procesu, aby omylem nezastavil jiný proces s opětovně použitým číslem.

Výchozí port je 8765. Je-li obsazený, vybere se první volný z následujících
20 portů; správnou adresu spouštěč vypíše a otevře. Stav a diagnostika jsou
v ignorované složce `temp/`: `luna-process.json`, `luna-stdout.log`,
`luna-stderr.log`. Web a API poskytuje jediná Pythonová služba; .NET adaptér
se spouští až při výpočtu plochého modelu a nemusí trvale běžet zvlášť.

Úvodní stránka `/` představí Lunu a nabízí oba editory:
`/flat.html` pro desku do rámečku, `/sphere.html` pro měsíční skořepinu.
V záhlaví obou editorů je odkaz zpět na rozcestník.

Původní spuštění v otevřeném terminálu zůstává dostupné. Z kořene repozitáře:

```powershell
.\Start-Luna.ps1 -Install # první instalace závislostí
.\Start-Luna.ps1          # další spuštění
```

Otevře se `http://127.0.0.1:8765/`. Terminál nech otevřený; Ctrl+C ukončí server.
`-Empty` spustí prázdný editor a `-Port 8766` změní port. Server přijímá jen
místní požadavky ze stejného původu. Soubory se neposílají do externí služby.

Výchozí STL a ukázkový obrázek určuje `spherical/config.json`:
`default_stl` a `demo_image` jsou cesty relativní k tomuto konfiguračnímu souboru.
Pokud oba soubory existují, načtou se při spuštění automaticky. Výchozím motivem
je `dragon.png`; pro jiný motiv stačí změnit `demo_image`. Konfigurace se čte
znovu při založení projektu, není nutný restart.
„Nový projekt“ i načtení vlastního STL vytvoří právě jednu ukázkovou vrstvu.
Chybějící nebo poškozený ukázkový obrázek zabrání založení projektu a zachová
dosavadní projekt. Otevření uloženého projektu žádné ukázkové vrstvy nepřidává.
Uživatelské vstupy, virtuální prostředí, sestavené rozhraní a výstupy jsou
ignorovány Gitem; nejsou součástí instalace z čistého klonu.

Ruční spuštění po instalaci:

```powershell
cd spherical/web
npm ci
npm run build
cd ../..
.venv/Scripts/python.exe -X utf8 spherical/server.py --demo
```

## Ovládání

### Dostupnost ovládání a nápověda

Zakázaný prvek vysvětluje důvod a další krok přímo u ovládání (nebo společně
u celé skupiny, například chybějící vybraná vrstva). Stejný důvod je dostupný
po najetí myší a přes klávesu Tab i u nativně zakázaného prvku. Nápovědu lze
zavřít klávesou Escape. Během výpočtu jej vysvětluje společný indikátor průběhu,
aby se stejná zpráva neopakovala pod každým vstupem.

Přepínač přesahu je v novém projektu aktuální služby dostupný bez přepočtu STL
a i bez obrazových vrstev. Na starší běžící službě, která přesah ještě neumí,
je nahoře výrazné upozornění: založení nového projektu službu neaktualizuje.
Tlačítka umožní uložit rozpracovaný projekt a otevřít aktuální editor v nové
záložce. Ten se vyhledá přes místní `runtime.json`, který aplikace zapisuje po
spuštění; odkaz není pevně svázán s konkrétním portem. Projekt se přenáší otevřením
uloženého `.luna`, nepřepisuje se automaticky jiný rozpracovaný projekt.

Obě rozhraní používají společné `control-state.ts`. Testy kontrolují pravidla
dostupnosti, důvody v DOM, aktivaci popiskem, klávesnicový přístup i skutečné
události stránky plochého editoru. Tyto testy nahrazují pouze grafickou kartu
a síťové požadavky; nejsou ověřením fyzického prosvícení ani vizuálním testem GPU.

### Ploché litofánie

Přejdi odkazem „Ploché litofánie“ nebo otevři `http://127.0.0.1:8765/flat.html`
(při jiném portu změň i tuto adresu). Nový projekt obsahuje ukázkový motiv
z konfigurace. Lze přidávat a měnit obrázky ze souboru či URL, duplikovat,
odebírat, přejmenovat, skrývat a přeuspořádat vrstvy. Úpravy do šedi, kontrast,
gama, úrovně, inverze a výběr barvy pozadí se počítají samostatně pro každou vrstvu.

Zadaná šířka a výška jsou **vnější rozměry desky včetně okraje**. Například
150 × 100 mm a šířka lemu 5 mm znamenají obrazovou plochu 140 × 90 mm.
**Výška lemu** je samostatný rozměr v ose Z (0,1–20 mm), nezávislý na minimu
a maximu obrázku. Nový projekt začíná lemem vysokým 0,6 mm; starší projekty bez
této vlastnosti zachovají dřívější výšku rovnou maximu obrázku. Lem lze vypnout.
Motiv do něj nikdy nezasahuje, ani po vyhlazení.
Při posunutí, otočení nebo změně desky se vrstva přesune dovnitř a případně
zmenší se zachováním poměru stran. Ochrana platí i pro celý natočený obdélník
PNG, včetně jeho průhledných částí; algoritmus nehledá těsný obrys objektu.

Zaškrtávátko **„Povolit přesah obrázků a oříznout“** ruší omezení polohy,
natočení a rozměrů vrstev hranicí obrazové plochy. Lze tak zvětšit i natočený
motiv přes okraje; přesah se ořízne, celkové rozměry STL a lem zůstanou zachované.
Platí pro celý projekt. Po vypnutí se vrstvy znovu přizpůsobí dovnitř. Obě nové
vlastnosti (přesah a výška lemu) se ukládají do `.luna` a platí pro náhled i STL.

Ctrl + klik/tažení posouvá střed v rovině desky. Tyrkysové úchyty mění rozměry,
zlatý natočení; Shift zachovává poměr stran také v číselných polích.
Při zvětšování motivu se tažený rozměr zastaví na chráněném okraji; druhý
rozměr a střed zůstávají beze změny. Se Shiftem se omezí oba rozměry společně.
Původní .NET algoritmy generují tloušťku a vyhlazení. Rozlišení FDM se počítá původním
vzorcem z trysky a poměru bod/tryska, pro pryskyřici se zadává počet vzorků/mm.
Průměr trysky neurčuje automaticky bezpečnou minimální tloušťku modelu.

Náhled při úpravách má nižší rozlišení a neprovádí vyhlazení. „Přepočítat model
v .NET“ zobrazí skutečný přepočítaný povrch; následný export obsahuje tutéž
geometrii. Podsvícení je aproximace rovnoměrného světla za deskou, nikoli
fyzikální výpočet konkrétní LED sestavy. Jas, teplotu a útlum lze měnit.

Plochý `.luna` je ZIP s `project.json` (`kind: flat`), přesnými zdrojovými
obrázky v `sources/`, upravenými PNG v `processed/` a aktuálním `result.stl`,
pokud už proběhl přepočet. Vstupní STL plochý projekt nepotřebuje. Uchovává
také parametry desky, tiskového výpočtu, světla a kameru. Projekty Měsíce a
plochých litofánií se otevírají ve svých příslušných editorech.

### Měsíční litofánie

V části **Tloušťka pro tisk → Metoda integrace** lze zvolit:
- **Zezadu — vnitřní stěna** (výchozí): zachová vnější krátery a mění vnitřek.
- **Zepředu — vnější povrch**: zachová vnitřní stěnu a mění vnější reliéf,
  takže motiv může být vidět i bez podsvícení.

Volba platí pro všechny vrstvy a ukládá se do projektu jako `integration_method`
(`inside` / `outside`). Starší projekty bez této hodnoty používají `inside`.
Přepnutí zneplatní ověření; před exportem je nutný nový přepočet. Názvy exportů
`moon-inside.stl` a `moon-outside.stl` pomáhají rozlišit zkušební výtisky.
Průhledné oblasti a protější stěna zůstávají přesně zachované v obou metodách.
Rychlý náhled simuluje cílovou tloušťku na původním povrchu; teprve přepočet
zobrazí skutečně posunuté vrcholy a jejich normály. Náhled nepředpovídá rozdíl
v ostrosti při rozptylu světla v konkrétním filamentu. Ten ověř srovnávacím tiskem.
Starší běžící služba nabízí jen zadní integraci a vysvětluje postup aktualizace.


- Levé tlačítko a tažení otáčí kamerou, kolečko přibližuje, pravé tlačítko posouvá pohled.
- **Ctrl + kliknutí** ukotví střed obrázku na STL; **Ctrl + tažení** jej přesouvá.
  Alternativou je přepínač „Umístit motiv“.
- Tyrkysové úchyty mění šířku a výšku, zlatý úchyt otáčí obrázkem.
- **Shift při změně rozměrů drží aktuální poměr stran**, také při úpravě
  číselných polí. U polí drž Shift při změně hodnoty; samotné načtení nastavení
  poměr nemění. Rozměry jsou měřené po povrchu koule, nikoli v obrazových bodech.
- Dominance míchá původní tloušťku s cílovou tloušťkou motivu.
- Režimy Povrch, Podsvícení a Tloušťka ukazují reliéf, aproximaci průchodu
  světla a barevnou kontrolu stěny. Červená značí odchylku od nastavených mezí.
- „Přepočítat a ověřit model“ přepne náhled na skutečně upravenou geometrii
  a znovu změřenou tloušťku. Při změně motivu se toto ověření zneplatní.
- Export STL a scény je dostupný jen po úspěšném ověření aktuální revize.
- „Uložit projekt“ vytváří přenosný soubor `.luna` (ZIP). „Otevřít projekt“
  obnoví zdrojové STL, obrázky, úpravy, vrstvy, světlo i kameru bez dalších souborů.

## Vrstvy 0 až N a úpravy obrázků

Vrstva 0 je neměnné zdrojové STL. Každá obrazová vrstva má vlastní ID, odkaz
na originální obrázek, název, viditelnost, kotvu, rozměry, natočení, dominanci
a parametry zpracování obrázku. V seznamu je nejvyšší vrstva nahoře; výpočet
skládá vrstvy odspodu. Lze je přejmenovat, duplikovat, skrýt, odebrat a přesouvat.
Duplikace sdílí zdrojové bajty, ale nastavení obou vrstev jsou nezávislá.
Obrázky lze přidávat z počítače nebo přímou veřejnou HTTP(S) adresou (do 24 MB).
Vybranému motivu lze vyměnit obrázek stejnými dvěma způsoby: zůstane název vrstvy,
její pořadí, poloha, rozměry, dominance i úpravy obrázku. Duplikovaných vrstev
se výměna nedotkne. Vrstva se smí odebrat i jako poslední; projekt bez obrázků
je platný a při opětovném otevření zůstane prázdný.
Adresy s přihlášením nebo v místní síti nejsou podporovány. Přesměrování se
kontrolují také. Stažené zdrojové bajty se přibalí do projektu; při otevření
se už URL nekontaktuje. Samotné načítání z URL samozřejmě vyžaduje internet.
Počet vrstev nemá pevný limit ve vykreslovacím programu; praktický limit tvoří
paměť, čas výpočtu a limit projektu (400 MB po rozbalení, 2000 položek).

Šířka, výška, Ctrl + umístění a Shift + poměr stran patří vždy vybrané vrstvě.
Minimum a maximum tloušťky jsou společné pro celý model. Průhlednost vyšší
vrstvy propouští nižší vrstvy. Neprůhledná vyšší vrstva při dominanci 100 %
převáží nižší; při nižší dominanci je smíchá. Žádné vrstvy nebo všechny skryté
vrstvy zachovají původní vrcholy (kromě oznámené opravy topologických děr).

Nedestruktivní editor vybrané vrstvy obsahuje:

- vážený jas Rec. 709, průměr RGB, průměr maxima a minima nebo jednotlivý kanál;
- černý a bílý bod, kontrast, jas, gama a inverzi;
- výběr barvy pozadí kliknutím do originálu nebo barevným polem;
- toleranci barvy a plynulé změkčení okraje průhlednosti;
- náhled zpracovaného PNG na šachovnici a histogram vážený průhledností.

Odstranění pozadí je **globální výběr podobné barvy**, nikoli rozpoznávání
objektu nebo výplň pouze souvislé oblasti. Zasáhne i podobnou barvu uvnitř draka.
Při výběru barvy se náhled dočasně přepne na originál. Ruční kreslení křivek,
malování masky ani lokální retuš tato verze neobsahuje; střední tóny řídí gama.

Pořadí zpracování je metoda šedi → černý/bílý bod → kontrast a jas → gama →
inverze. Maska pozadí se počítá z původních barev a násobí původní průhlednost.
Výsledné šedé RGBA PNG je přesný vstup pro geometrii; originál se nepřepisuje.
Změny se po krátkém odkladu promítnou do náhledu obrázku a společné mapy motivů
na kouli. Kamera zůstává interaktivní během přepočtu mapy.

Projekt formátu 2 obsahuje:

Prohlížeč stáhne jediný soubor `.luna`, tedy ZIP s vlastní příponou. Nevyžaduje
povolení ukládat více souborů ani přístup k celé složce. Umístění staženého souboru
řídí nastavení prohlížeče. Archiv lze ručně rozbalit běžným nástrojem pro ZIP.

```text
project.json                  metadata a pořadí vrstev, světlo, meze, kamera
source.stl                    přesné původní STL
sources/<id>.<přípona>         přesné původní bajty obrázků
processed/layer-0001.png ...   upravená PNG použitá ve výpočtu
result.stl                    pouze aktuální ověřený výsledek, je-li dostupný
```

Zastaralý nebo neověřený výsledek se nepřibaluje. Při otevření se upravená PNG
znovu vytvoří z originálů a uložených parametrů současným algoritmem; export
STL vyžaduje nové ověření. Původní výsledek přibalený v archivu zůstává dostupný
ručním rozbalením. Samostatné tlačítko „Uložit STL“ exportuje ověřenou geometrii.

Tlačítka jsou nyní pojmenována „Uložit projekt (.luna)“ a „Exportovat model pro
tisk (.stl)“. Zpráva po uložení výslovně uvádí, zda archiv obsahuje aktuální
`result.stl`; rozhoduje skutečný obsah odpovědi serveru, ne odhad rozhraní.

## Jak se tvoří geometrie

1. VTK načte STL a sdílí shodné vrcholy. Robustní přizpůsobení koule odhadne střed.
2. Kontrola hran odmítne nekonzistentní síť. Pouze malé mezery tvořené třemi
   hranami může uzavřít; počet oprav se zobrazuje a ukládá k ověření.
3. Radiální paprsky měří vnitřní a vnější stěnu. Upravit lze jen bezpečně
   rozpoznanou zvolenou stranu kulové skořepiny; montážní límec zůstává pevný.
4. Azimutální ekvidistantní mapování promítne PNG kolem kotvy. Obraz se načítá
   nejvýše v rozlišení 1600 × 1600. Jas RGB je vážený součtem 0,2126 / 0,7152 /
   0,0722; výpočty používají hodnoty obrázku bez dalšího gama převodu.
5. Cílová tloušťka je `min + (1 - jas) * (max - min)`. Míra směsi je
   `alfa * dominance * změkčení okraje`. Barva se před interpolací násobí alfou,
   takže skryté RGB pod průhlednými body nevytváří barevné okraje. Vrstvy se
   skládají nad sebou v této násobené reprezentaci a meze se uplatní na společný
   výsledek. Průhledná místa všech vrstev dohromady zachovávají původní model.
6. Meze se aplikují jen v zasažené oblasti. Nulová alfa nebo dominance zachová
   původní vrcholy přesně, i když leží mimo meze. Protější stěna se neposouvá.
7. Korekce radiálních měření přerozděluje pouze posuny již zasažených vybraných
   vrcholů. Nezasažené vrcholy mají nulovou kapacitu pro korekci. Korekce může
   lokálně změnit požadovanou dominanci, aby dodržela tloušťku.
8. Ověření používá skutečné nové trojúhelníky: směry všech původních vrcholů,
   úhlovou síť a středy měněných trojúhelníků. Nové chybějící průsečíky nebo
   odchylka větší než 0,015 mm blokují export. Nejednoznačné paprsky již v
   původním modelu se vykazují zvlášť jako `source_ambiguous`.

## Důležité hranice přesnosti

- Je podporovaná přibližně kulová dutá skořepina, radiálně rozlišitelná na dvě
  stěny. Nejde o obecný editor libovolného STL. Jednotky STL se považují za mm.
- Kontrola je vzorkovaná, nikoli matematický důkaz globální minimální tloušťky
  ani úplná kontrola všech samoprůniků. Před tiskem ověř řezy, počet perimetrů
  a měřítko v tiskovém programu.
- Původní trojúhelníková síť se nezjemňuje. Detaily a přesnost hran průhlednosti
  jsou omezené její hustotou. Zaručená je identita nezasažených **vrcholů**;
  trojúhelník přesahující hranici motivu může interpolací zasáhnout okolí.
  Opravy drobných děr jsou samostatnou oznámenou topologickou změnou.
- Výchozí meze jsou odvozené z měření zdroje. Nejsou doporučením tisknutelné
  tloušťky; u dodaného Měsíce vycházejí 0,15–2,85 mm. Zvol si meze podle
  filamentu, trysky a mechanické pevnosti. Příliš úzký interval může být
  při zachování okolí nesplnitelný a export pak zůstane blokovaný.
- Rychlý náhled používá mapu složených motivů 1024 × 513 vzorků (s opakovaným
  sloupcem na švu), zpracovanou na serveru; po ověření používá
  skutečně změřený výsledek. Jemné detaily rychlého náhledu nemusí STL zachytit.
- Světelný náhled je aproximace s útlumem materiálu v 1/mm, nikoli kalibrovaná
  předpověď výtisku. Poloha LED je omezena pro finální scénu na 80 % poloměru.
- První načtení a ověřování velkého STL zabere několik až desítky sekund.
  Tato verze serializuje výpočty a nemá rušení rozpracovaného přepočtu.

## Finální scéna v Blenderu

Je-li Blender na PATH nebo ve standardním adresáři `C:/Program Files/Blender Foundation`,
tlačítko spustí výpočet na pozadí. Jinak stáhni ZIP scény, rozbal jej a spusť:

```powershell
blender --background --python render_blender.py -- scene.json
```

Balíček obsahuje přesně ověřený `moon.stl`, parametry `scene.json` a skript.
Skript převede mm na metry, sestaví scénu s vnitřní LED, objemovým materiálem,
podlahou a kamerou; uloží `scene.blend` a `render.png` (1600 × 1200, 96 vzorků).
Cycles používá skutečnou skořepinu, ale vlastnosti materiálu jsou stále odhad.
Jas je relativní a není kalibrovaný na lumeny; náhled a Cycles nemají totožný
světelný model. Blender zde při implementaci nebyl dostupný, proto tento skript
zatím nebyl ověřen skutečným vykreslením.

## Testy

```powershell
dotnet build FlatLithophaneBridge/FlatLithophaneBridge.csproj -c Release
.venv/Scripts/python.exe -X utf8 -m pytest spherical/tests -q
cd spherical/web
npm test
npm run build
```

Testy pokrývají průhlednost, extrémní jas, poměr stran, kulové mapování, odmítnutí
neplatných parametrů, zachování vnějšího povrchu, blokování neplatného exportu
a místní HTTP rozhraní. Test reálného Měsíce se automaticky vynechá, nejsou-li
přítomné oba uživatelské soubory v `Sources`.

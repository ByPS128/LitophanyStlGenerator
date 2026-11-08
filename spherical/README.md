# Luna — prostorový editor kulové litofánie

Samostatná místní aplikace: Python/VTK měří a upravuje STL, TypeScript/Three.js
zobrazuje skutečnou trojúhelníkovou síť v prohlížeči. Původní .NET generátor
plochých litofánií zůstává samostatný. Geometrické pomocné funkce vycházejí
z uživatelova prototypu `Spheric_litophany`; nové jádro odděluje průhlednost od
jasu, chrání nezasažené vrcholy a ověřuje výslednou geometrii před exportem.

## Spuštění ve Windows

Požadavky: Python 3.12 nebo 3.13, Node.js 22.12+ nebo 24, prohlížeč s WebGL2.
Pro finální scénu je volitelně potřeba Blender 4.2 nebo novější. Vývoj a testy
proběhly s Pythonem 3.13.2, Node.js 24.14.1 a VTK 9.7.2.

Z kořene repozitáře:

```powershell
.\Start-Luna.ps1 -Install # první instalace závislostí
.\Start-Luna.ps1          # další spuštění
```

Otevře se `http://127.0.0.1:8765/`. Terminál nech otevřený; Ctrl+C ukončí server.
`-Empty` spustí prázdný editor a `-Port 8766` změní port. Server přijímá jen
místní požadavky ze stejného původu. Soubory se neposílají do externí služby.

Pokud existují `LithophaneStlGenerator/Sources/moon-globe-mk2.stl` a `dragon.png`,
načtou se při spuštění automaticky. Jinak lze soubory vybrat v editoru.
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

## Jak se tvoří geometrie

1. VTK načte STL a sdílí shodné vrcholy. Robustní přizpůsobení koule odhadne střed.
2. Kontrola hran odmítne nekonzistentní síť. Pouze malé mezery tvořené třemi
   hranami může uzavřít; počet oprav se zobrazuje a ukládá k ověření.
3. Radiální paprsky měří vnitřní a vnější stěnu. Upravit lze jen bezpečně
   rozpoznanou vnitřní část kulové skořepiny; montážní límec zůstává pevný.
4. Azimutální ekvidistantní mapování promítne PNG kolem kotvy. Obraz se načítá
   nejvýše v rozlišení 1600 × 1600. Jas RGB je vážený součtem 0,2126 / 0,7152 /
   0,0722; výpočty používají hodnoty obrázku bez dalšího gama převodu.
5. Cílová tloušťka je `min + (1 - jas) * (max - min)`. Míra směsi je
   `alfa * dominance * změkčení okraje`. Barva se před interpolací násobí alfou,
   takže skryté RGB pod průhlednými body nevytváří barevné okraje. Vrstvy se
   skládají nad sebou v této násobené reprezentaci a meze se uplatní na společný
   výsledek. Průhledná místa všech vrstev dohromady zachovávají původní model.
6. Meze se aplikují jen v zasažené oblasti. Nulová alfa nebo dominance zachová
   původní vrcholy přesně, i když leží mimo meze. Vnější vrcholy se neposouvají.
7. Korekce radiálních měření přerozděluje pouze posuny již zasažených vnitřních
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
.venv/Scripts/python.exe -X utf8 -m pytest spherical/tests -q
cd spherical/web
npm test
npm run build
```

Testy pokrývají průhlednost, extrémní jas, poměr stran, kulové mapování, odmítnutí
neplatných parametrů, zachování vnějšího povrchu, blokování neplatného exportu
a místní HTTP rozhraní. Test reálného Měsíce se automaticky vynechá, nejsou-li
přítomné oba uživatelské soubory v `Sources`.

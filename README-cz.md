# Lithophane STL Generátor

Přeměňte své fotografie na úžasné 3D tisknutelné litofánie s přesností a jednoduchostí.

---

## Přehled

Lithophane STL Generátor je profesionální .NET konzolová aplikace, která převádí barevné nebo černobílé obrázky na vysoce kvalitní litofánie optimalizované pro 3D tisk. Ať už používáte FDM nebo pryskyřičné tiskárny, tento nástroj poskytuje přesnost a flexibilitu potřebnou pro vytváření krásných osvětlených uměleckých děl.

### Klíčové funkce

- Univerzální podpora obrázků: JPG, PNG, BMP a další běžné formáty
- Pokročilý zpracovací pipeline: Víceúrovňová optimalizace s volitelnými algoritmy
- Optimalizace pro 3D tiskárny: Dedikované profily pro FDM (s ohledem na trysku) a pryskyřičný tisk
- Konfigurace založená na šablonách: Opakovaně použitelné JSON šablony pro konzistentní výsledky
- Profesionální výstup: STL soubory s vloženými metadaty + mezilehlé zpracovávací obrázky
- Inteligentní škálování: Automatický výpočet rozlišení na základě specifikací tiskárny

---

## Rychlý start

Základní použití:
LithophaneStlGenerator.exe foto.jpg fdm-0.4mm.json

S vlastním výstupním adresářem:
LithophaneStlGenerator.exe portrét.png resin-hd.json c:\výstup\

Použití relativních cest:
LithophaneStlGenerator.exe ..\obrázky\krajina.jpg templates\fdm-0.2mm.json

Generované výstupní soubory:
- foto-0001.stl - 3D model připravený k tisku
- foto-0001.png - Vizualizace finální výškové mapy
- foto-0001-resampled.png - Zpracovaný vstupní obrázek
- foto-0001-smoothed.png - Výsledek post-processingu

---

## Technická architektura

### Zpracovací pipeline

1. Načítání a předzpracování obrázků
   - Automatická detekce formátu a konverze barevného prostoru
   - Zachování poměru stran s inteligentním ořezem
   - Konfigurovatelné algoritmy převzorkování (Bicubic, Bilinear, Lanczos3)

2. Generování výškové mapy
   - Konverze do odstínů šedi (mapování rozsahu 0-255)
   - Konfigurovatelné mapování výškového rozsahu (min/max tloušťka)
   - Přesné výpočty s plovoucí desetinnou čárkou

3. Pokročilé vyhlazování (Volitelné)
   - Gaussian Blur: Vyhlazování řízené sigma s prahem
   - Median Filter: Redukce šumu s konfigurovatelným oknem
   - Bilateral Filter: Vyhlazování zachovávající hrany

4. Generování meshe
   - Continuous Surface: Hladké povrchy litofánií
   - Cubic: Voxel-based přístup pro artistické efekty
   - Simple: Lehký mesh pro prototypování

5. Export STL
   - Binární STL formát s vloženými metadaty
   - Vlastní 80-bytové ASCII hlavičky (autor, nastavení, info o trysce)
   - Optimalizované generování trojúhelníků

### Inteligentní výpočet rozlišení

Aplikace automaticky vypočítá optimální rozlišení obrázku na základě vaší 3D tiskárny:

- FDM režim: velikost_pixelu = průměr_trysky × 0.8
- Resin režim: Uživatelem definované rozlišení v pixelech na mm
- Validace: Automatická varování před suboptimálními nastaveními

---

## Systém šablon

Šablony jsou JSON konfigurační soubory, které definují všechny parametry zpracování.

Příklad FDM šablony:
```json
{
   "finalWidthMM": 150,
   "finalHeightMM": 100,
   "printMode": "FDM",
   "fdmSettings": {
      "nozzleDiameterMM": 0.4,
      "nozzleToPixelRatio": 0.8
   },
   "smoothingAlgorithm": "BilateralFilter",
   "meshConverterType": "ContinuousSurface"
}
```

Dostupné šablony:
- fdm-0.4mm.json - Standardní FDM tisk (tryska 0.4mm)
- fdm-0.2mm-high-detail.json - Vysoce detailní FDM (tryska 0.2mm)
- fdm-0.6mm-fast.json - Rychlý tisk (tryska 0.6mm, Cubic mesh)
- resin-standard.json - Standardní pryskyřičný tisk
- resin-high-detail.json - Vysokorozlišovací pryskyřičný tisk

---

## Konfigurační parametry

### Rozměry modelu
- finalWidthMM/finalHeightMM: Fyzická velikost tištěného modelu
- minHeightMM: Tloušťka pro bílé pixely (255) - minimální tisknutelná tloušťka
- maxHeightMM: Tloušťka pro černé pixely (0) - neprůhlednost pro vaše LED setup

### Vysvětlení kritických nastavení

Min Height: Představuje tloušťku pro bílé oblasti (hodnota pixelu 255). Zajišťuje, že model lze odstranit z tiskové podložky a umožňuje světlu efektivně procházet.

Max Height: Představuje tloušťku pro černé oblasti (hodnota pixelu 0). Měla by být kalibrována na základě výkonu vašich LED a neprůhlednosti filamentu pro dosažení skutečně černého vzhledu.

### Optimalizace pro typ tisku

FDM nastavení:
- nozzleDiameterMM: Průměr trysky vaší tiskárny
- nozzleToPixelRatio: Poměr pixel-k-trysce (výchozí 0.8 pro optimální kvalitu)

Resin nastavení:
- resolution: Pixely na milimetr pro vysoce detailní tisk

---

## Vytváření dokonalých litofánií

### Testování vašeho setupu

Doporučujeme vytvořit testovací tisk s postupnými přechody tloušťky pro kalibraci LED setupu:

[DEMO_IMAGE_PLACEHOLDER: demo-grayscale-gradient.png]

Tento gradientní test vám pomůže upravit hodnoty min/max height pro dosažení správného přechodu bílá-černá s vaším specifickým:
- Výkonem LED pásků a teplotou barev
- Materiálem filamentu a průhledností
- Setupem zobrazovací krabice

### Setup zobrazení

1. Orientace tisku: Tlustá strana směrem k pozorovateli, tenká strana k LED
2. Umístění LED: Pozice LED pásků za tenkou stranou
3. Ochrana před prachem: Umístění tenkého průhledného akrylového skla vpředu pro zabránění usazování prachu na nerovných površích
4. Kryt: Montáž do světelné krabice s kontrolovaným okolním osvětlením

### Přizpůsobení šablon

Vytvořte vlastní šablony pro váš specifický setup:
```json
{
   "finalWidthMM": 200,
   "finalHeightMM": 150,
   "minHeightMM": 0.8,  // Upravte na základě testovacích tisků
   "maxHeightMM": 4.2,  // Kalibrujte s vaším LED setupem
   "printMode": "FDM",
   "fdmSettings": {
     "nozzleDiameterMM": 0.4
   }
}
```

---

## Pokročilé funkce

### Vložená STL metadata

Generátor vkládá informace o zpracování do STL hlaviček:
author:ByPS128;github:https://github.com/ByPS128/LitophaneStlGenerator;printMode:FDM;nozzle:0.4

### Automatické pojmenování souborů

Sekvenční číslování předchází přepsání:
- foto-0001.stl, foto-0002.stl, atd.
- Zachovává původní název souboru s přírůstkovým sufixem

### Vizualizace zpracování

Každé spuštění generuje mezilehlé obrázky pro kontrolu kvality:
- Resampled: Zobrazuje vstup po škálování a ořezu
- Smoothed: Zobrazuje výsledek vybraného vyhlazovacího algoritmu
- Final: Vizualizace výškové mapy pro ověření

---

## Požadavky

- .NET 8.0 Runtime
- Windows, macOS, nebo Linux
- Podporované formáty obrázků: JPG, PNG, BMP a další prostřednictvím ImageSharp

---

## Instalace a použití

1. Stáhněte nejnovější release
2. Rozbalte do požadovaného umístění
3. Přidejte do systémové PATH pro globální přístup
4. Spusťte z libovolného adresáře:

LithophaneStlGenerator.exe vaše-foto.jpg template.json [výstupní-adresář]

Výchozí šablony se automaticky vytvoří při prvním spuštění v adresáři ./templates/.

---

## Technické specifikace

- Zpracování obrázků: Knihovna SixLabors.ImageSharp
- Generování meshe: Vlastní optimalizované algoritmy
- STL formát: Binární s vlastními metadatovými hlavičkami
- Přesnost: Výpočty s dvojitou přesností plovoucí desetinné čárky
- Paměťově efektivní: Streamované zpracování pro velké obrázky
- Multiplatformní: Kompatibilní s .NET 8.0
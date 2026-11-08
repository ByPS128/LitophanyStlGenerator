# Dodané změny a rozhodnutí

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

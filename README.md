# AnesthesioLogisch

Interactieve kennissite voor studenten anesthesiologie. De inhoud wordt geschreven in **[Obsidian](https://obsidian.md)**: de map [`inhoud/`](inhoud) ís de website. Een kleine eigen bouwstap zet die notities om in een snelle, statische site met zoekfunctie, donkere modus en interactieve animaties.

```
inhoud/               ← Obsidian-kluis (hier schrijft de beheerder)
  Startpagina.md      ← startpagina
  Farmacologie/…      ← elke map = een onderwerp; Map/Map.md = overzichtspagina
  _sjablonen/         ← sjablonen voor nieuwe pagina's (niet op de site)
  _beheer/            ← handleiding voor de beheerder (niet op de site)
  _bijlagen/          ← afbeeldingen en PDF's
site/                 ← bouwcode (hoeft de beheerder nooit aan te komen)
  build.mjs           ← Markdown → HTML
  lib/                ← Obsidian-syntax, templates, animatielijst
  assets/             ← CSS, JavaScript en de animaties (Web Components)
.github/workflows/    ← automatisch publiceren naar GitHub Pages
```

## Wat zit erin?

- **Obsidian-syntax**: `[[wikilinks]]` (ook `[[Pagina#Kop|tekst]]`), `![[afbeelding.png|300]]`, callouts (`> [!tip]`, inklapbaar met `-`), `#tags`, `==markeren==`, voetnoten, takenlijstjes, eigenschappen (frontmatter), aliassen en mermaid-diagrammen.
- **Automatisch**: navigatiemenu uit de mappenstructuur, kruimelpad, inhoudsopgave, "Gelinkt vanuit" (backlinks), vorige/volgende, tagpagina's, overzichtspagina's per map, "recent bijgewerkt" (uit de git-geschiedenis) en een waarschuwing bij links naar pagina's die nog niet bestaan.
- **Zoeken** met `Ctrl/Cmd + K` of `/`.
- **Quizvragen** via een ```` ```quiz ```` blok.
- **Interactieve animaties** via een ```` ```animatie ```` blok:

| Naam | Inhoud |
|---|---|
| `monitor` | OK-monitor (ECG, pleth, arteriële lijn, capnografie) met 9 scenario's, alarmen en saturatie-afhankelijke piep |
| `hart` | Bloedstroom door het hart: volg een bloedcel, kleppen openen/sluiten in systole/diastole |
| `inductie` | Stap voor stap in slaap brengen, met trendgrafiek (MAP, HF, BIS, EtO₂) en TOF |
| `capnografie` | Capnogram-fasen en afwijkende patronen |
| `zuurstofcurve` | Zuurstofdissociatiecurve met pH- en temperatuurverschuiving |

Een uitgebreide, niet-technische handleiding staat in [`inhoud/_beheer/Handleiding.md`](inhoud/_beheer/Handleiding.md).

## Lokaal draaien

Vereist Node.js 20 of nieuwer.

```bash
npm install
npm run dev     # http://localhost:4321, herbouwt en herlaadt bij elke wijziging in inhoud/
npm run build   # bouwt naar dist/
```

## Eenmalige installatie (voor de technische helper)

### 1. Publiceren via GitHub Pages
1. Ga in deze repository naar **Settings → Pages** en kies bij *Source* voor **GitHub Actions**.
2. Elke push naar `main` bouwt en publiceert de site automatisch (zie *Actions*). De site staat dan op `https://<gebruiker>.github.io/AnesthesioLogisch/`.
3. Eigen domein? Stel het in onder *Settings → Pages → Custom domain*; de basis-URL wordt automatisch goed gezet.

### 2. Obsidian bij de beheerder
1. Installeer [Obsidian](https://obsidian.md) en [GitHub Desktop](https://desktop.github.com) (of Git).
2. Clone deze repository naar de computer van de beheerder.
3. Open in Obsidian **"Map openen als kluis"** en kies de map **`inhoud`** (niet de hoofdmap).
4. Installeer de community-plugin **Git** (*Instellingen → Community-plugins → Bladeren → "Git"*) en zet in de instellingen van de plugin:
   - *Auto commit-and-sync interval*: bijv. `10` minuten, en
   - *Pull on startup*: aan.

   Vanaf nu worden wijzigingen automatisch opgeslagen en gepubliceerd. Handmatig kan ook via het Git-icoon → **Commit-and-sync**.
5. Sjablonen staan al ingesteld (`_sjablonen`), en geplakte afbeeldingen gaan automatisch naar `_bijlagen`.

> Alternatief zonder installatie: pagina's kunnen ook direct op github.com in de map `inhoud/` bewerkt worden (potloodje → *Commit changes*).

## Een nieuwe animatie toevoegen (ontwikkelaars)

1. Schrijf een Web Component in [`site/assets/animaties.js`](site/assets/animaties.js) en registreer hem onderaan in `defs`.
2. Voeg hem toe aan [`site/lib/animaties.mjs`](site/lib/animaties.mjs) (naam, aliassen, element, titel, beschrijving).
3. Documenteer de naam in de handleiding voor de beheerder.

## Disclaimer

AnesthesioLogisch is bedoeld voor onderwijs. Doseringen zijn indicatief; volg altijd de lokale protocollen en de aanwijzingen van je supervisor. Gebruik nooit patiëntgegevens in de inhoud.

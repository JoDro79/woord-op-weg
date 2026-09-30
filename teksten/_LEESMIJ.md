# Teksten publiceren

Sleep een bestand in de map van de juiste categorie en klik op **Commit changes**.
Binnen een à twee minuten staat de tekst op woordopweg.nl.

- `Bezinning/`  ·  `Geloof/`  ·  `Geschiedenis/`
- Bestandstypen: **.docx** (Word), **.txt**, **.md**
- **Titel**: de eerste regel (of kop) van de tekst
- **Datum**: de dag van uploaden, of zet de datum vooraan de bestandsnaam: `2026-09-27-de-vuurtoren.docx`
- **Afbeelding**: plak een afbeelding in je Word-bestand (de eerste wordt de kaartfoto), of zet een plaatje met dezelfde naam ernaast: `de-vuurtoren.jpg`. Zonder afbeelding krijgt de kaart een omslag met de beginletter van de titel.
- **Aanpassen**: upload een nieuwe versie met dezelfde bestandsnaam
- **Weghalen**: verwijder het bestand

## Opmaak gaat automatisch

- **Tussenkop**: een korte regel zonder punt aan het eind, gevolgd door gewone tekst. Voorbeeld: `De Held en de Legende`, `Deel II: Autoriteit`, `1. Hoor het Woord`
- **Citaat**: een alinea die helemaal tussen aanhalingstekens staat. Dat werkt bovenaan de tekst, met een bijbeltekst erbij, na een regel die eindigt op `:`, of in een Geloof-tekst. Dialogen in verhalen blijven gewoon tekst.
- **Bijbelverzen**: alinea's die met een versnummer beginnen (`34 Toen zei David…`) komen samen in één citaatblok, met kleine versnummers
- **Bijbeltekst bovenaan** (`Ezechiël 37:1-14`) wordt de openingsregel
- **Scheiding**: een regel met `***` wordt ✦ ✦ ✦
- **Inleiding**: geef in Word de alinea onder de titel de stijl **Ondertitel**. Die wordt schuingedrukt met een streep ervoor, zoals bij "De muis", en komt ook als samenvatting op de kaart. In een .md-bestand zet je bovenaan `inleiding: …`
- **Titel**: gebruik in Word de stijl **Titel** voor de titel, dan wordt hij altijd goed herkend
- **Beginletter**: de eerste alinea krijgt een grote gouden letter

Klopt het een keer niet? Een kop van Word (Kop 1/Kop 2) wordt altijd een tussenkop. Wil je bij een .md-tekst geen automatische opmaak, zet dan `opmaak: nee` bovenaan.

Bestanden en mappen die met `_` beginnen worden overgeslagen, zoals dit bestand. Zet teksten die nog niet af zijn in `_concepten/`. Verplaats ze naar een categorie om ze te publiceren.

De oudere teksten zijn **.html**-bestanden. Zo blijven voetnoten en opmaak precies gelijk. Wil je er een aanpassen? Vervang het bestand dan gerust door een .docx met dezelfde datum vooraan. Het adres (bijvoorbeeld `woordopweg.nl/#muis`) blijft alleen gelijk als je de regel `id:` bovenaan het .html-bestand bewaart.

In een .md-bestand kun je alles ook bovenaan zelf opgeven:

```
---
titel: De sluis van Spaarndam
datum: 12 september 2026
samenvatting: Een kleine sluis, een grote geschiedenis.
afbeelding: images/sluis.jpg
---
```

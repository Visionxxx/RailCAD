# Referansebakgrunn (RC-013)

**Fil → Importer bakgrunn …** (eller «Importer …» i bakgrunnspanelet) leser DXF, PDF, PNG eller JPEG. Bakgrunnen tegnes under sporplanen og er **referanse, ikke prosjekteringsgeometri**: den påvirker ingen kontroller, kan ikke velges som objekt og tas ikke med i DXF-eksporten.

## Formater

| Format                 | Hva som skjer                                                                                                                                                                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DXF** (R12 og nyere) | Leses til vektorgeometri: LINE, ARC, CIRCLE, LWPOLYLINE/POLYLINE (med buer), TEXT, MTEXT og INSERT (blokker, rekursivt). SPLINE/ELLIPSE forenkles til linjer. Øvrige typer (HATCH, DIMENSION, bilder m.fl.) hoppes over og rapporteres. Skjulte/frosne lag hoppes over. |
| **PDF**                | Side 1 gjengis til et bilde (maks ca. 4000 px) med pdf.js, lastet først ved bruk.                                                                                                                                                                                       |
| **PNG / JPEG**         | Brukes direkte (nedskalert til maks 8192 px per side).                                                                                                                                                                                                                  |

## Skala og plassering

- **DXF:** enheten leses fra `$INSUNITS` (mm, cm, m, km, tommer, fot …). Mangler enhet, antas 1 enhet = 1 m og bakgrunnen merkes **«ikke skalert»**. Posisjonen beholdes når koordinatene er «små»; ved store koordinater (f.eks. UTM) legges bakgrunnen midt i visningen og du får en forklaring.
- **PDF/bilde:** skalaen er ukjent. Startverdien (bildet er 200 m bredt) er bare et utgangspunkt, og bakgrunnen merkes «ikke skalert» til du setter skalaen.
- **Skaler med to punkter:** klikk to punkter på kartet (snapper til sporendepunkter og til hjørner i DXF-bakgrunner), og oppgi virkelig avstand. Skaleringen skjer om det første punktet. Skala kan også skrives inn (meter per enhet).
- **Flytt fra → til:** klikk et punkt på kartet og hvor det skal ligge. Origo og rotasjon kan også settes numerisk. Dekkevne og synlighet styres i panelet.
- Alle endringer (import, skala, flytting, dekkevne, synlighet, fjerning) kan angres.

## Lagring

Bakgrunner lagres i prosjektfilen (`backgrounds`, valgfritt felt – filer uten bakgrunner er uendret):

- DXF som kompakte primitiver (`['L', lag, x1, y1, x2, y2]`, `['A', …]`, `['C', …]`, `['P', lag, lukket, [x, y, bulge, …]]`, `['T', …]`), koordinater relativt til tegningens nedre venstre hjørne.
- Bilder/PDF som PNG/JPEG data-URL (maks ca. 10 MB per bilde).
  Importerte filer valideres (struktur, tall, primitiver, bildeformat) før noe vises. Plassering: `p_verden = origo + R(rotasjon) · (skala · p_innhold)`.

## Robusthet ved import

- Ødelagte entiteter (f.eks. LINE uten sluttpunkt) hoppes over og rapporteres; resten leses.
- Blokker utvides med grense (maks 400 000 elementer og et arbeidstak) – «DXF-bomber» med nøstede blokker eller enorme matriser avvises med klar feilmelding i stedet for å fryse fanen.
- Entiteter på lag `0` i en blokk arver lagnavnet til INSERT-en. Matrisemellomrom måles i INSERT-ens rotasjonsramme uten skalering.
- Speilede entiteter (ekstrusjon 0,0,−1) speiles riktig: buer, sirkler og polylinjer.
- PDF med flere sider: du velger side ved import.

## Begrensninger

- Én PDF-side per bakgrunn (importer på nytt for flere). Ingen georeferering (koordinatsystem/EPSG) – bakgrunnen plasseres i det lokale XY-systemet.
- DXF: ingen HATCH-fyll, DIMENSION, bilder eller 3D; tekst gjengis enkelt (en font, ingen justering).
- Veldig store DXF-er (> 400 000 elementer) avvises. Store bilder øker prosjektfilens størrelse.

# DXF-testfiler

Genereres av `npx tsx scripts/generate-dxf-samples.ts` (kan kjøres på nytt). Alle mål er i meter der ikke annet er oppgitt.

## RailCAD-eksporter (tester RC-012 – åpne i ditt CAD-program)

| Fil                                       | Innhold                                                           |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `railcad-verksted-r12.dxf` / `-r2007.dxf` | Verkstedeksempelet: 3 parallelle spor à 140 m, en kurve og to mål |
| `railcad-lodalen-r12.dxf` / `-r2007.dxf`  | Lodalen-inspirert sporfelt: 8 veksler, 28 sporsegmenter, 4 mål    |

Lag: `RAILCAD_SPORAKSE`, `RAILCAD_SPORVEKSEL`, `RAILCAD_MAAL`, `RAILCAD_TEKST`. Se hva du skal sjekke under.

## Kartunderlag (SYNTETISK testdata – ikke reelt kartgrunnlag)

Bygget for å passe under Lodalen-planen (samme koordinater) og for å teste bakgrunnsimport (RC-013).

| Fil                            | Hva den tester                                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kartunderlag-lokal-r2007.dxf` | Lokale koordinater (x 0–985, y −36–230). LWPOLYLINE (med bulge/buer), LINE, ARC, CIRCLE, TEXT på lag `EIENDOM`, `BYGG`, `VEG`, `SPOR_EKSISTERENDE`, `MAST`, `TEKST` |
| `kartunderlag-lokal-r12.dxf`   | Samme innhold i R12 (bare LINE/ARC/TEXT; polylinjer og sirkler er utvidet til linjer og buer)                                                                       |
| `kartunderlag-utm-r2007.dxf`   | Samme, flyttet til store koordinater (x ≈ 262 000, y ≈ 6 649 500; UTM-lignende). Tester presisjon og «tilpass visning»                                              |
| `kartunderlag-mm-r2007.dxf`    | Samme, i **millimeter** (`$INSUNITS = 4`, koordinater × 1000). Tester skalering                                                                                     |

## Hva du bør sjekke i ditt CAD-program (RailCAD-eksportene)

1. Filen åpnes uten advarsler eller «audit»-meldinger, og lagene finnes.
2. Sporene ligger på riktig sted: i `railcad-lodalen-*` ender alle parallelle spor på samme tverrlinje (x ≈ 37).
3. **Høyrekurver** (innkjøringen mot slutten av tilførselssporet) ligger riktig vei (DXF-buer går alltid mot klokka).
4. Måleenhet er meter, og måltall (tekst) viser f.eks. «294,160 m» ved målelinjen.
5. Teksten «delvis verifisert» står ved hver sporveksel, og forbeholdsteksten nederst til venstre.

Rapportér gjerne hvilket CAD-program og hvilken versjon du brukte.

## Kontroll utført her

Alle åtte filer er lest og revidert med `ezdxf` (Python): 0 feil og 0 reparasjoner. Ikke testet i AutoCAD.

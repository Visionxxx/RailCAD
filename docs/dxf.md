# DXF-eksport (RC-012)

**Fil → Eksporter DXF …** laster ned en `.dxf`-fil lokalt. To versjoner:

| Versjon            | Format                        | Bruk                                                                  |
| ------------------ | ----------------------------- | --------------------------------------------------------------------- |
| **R12** (AC1009)   | ASCII, håndskrevet            | Maksimal kompatibilitet. Norske tegn transkriberes (æ→ae, ø→o, å→aa). |
| **R2007** (AC1021) | UTF-8, via `@tarikjabiri/dxf` | Moderne CAD. Norske tegn bevares.                                     |

R2000 (AC1015) ble ønsket, men biblioteket skriver R2007 – merket ærlig som R2007. R2007 leses av all moderne CAD.

## Innhold

- **Enheter:** meter (`$INSUNITS = 6` i R2007; R12 har ingen enhetsvariabel).
- **Lag** (ASCII-navn): `RAILCAD_SPORAKSE`, `RAILCAD_SPORVEKSEL` (delvis verifisert), `RAILCAD_MAAL`, `RAILCAD_TEKST`.
- **Spor:** rette → `LINE`, sirkelkurver → `ARC`. DXF-buer går alltid mot klokka, så høyrekurver skrives med start- og sluttvinkel byttet om.
- **Sporveksler:** stamspor, avviksbue og evt. rett parti som LINE/ARC på sporvekselaget, pluss en tekst med ID, type, KO-nummer og «delvis verifisert».
- **Mål:** målelinje, hjelpelinjer og måltall som `LINE`/`ARC`/`TEXT` (ikke DIMENSION-entiteter – måltallet er dermed ikke assosiativt i CAD).
- En forbeholdstekst («skisse, ikke regelverkskontrollert, veksler delvis verifisert») legges nederst til venstre.

Geometrien regnes av samme motor som i appen, så eksporten tilsvarer det som vises.

## Kontroll

- Enhetstester (`packages/dxf/tests`) leser filene tilbake og sjekker lag, entitetstall, buevinkler (venstre/høyre) og tegnsett.
- Eksemplene er også lest og revidert med `ezdxf` (Python): 0 feil, 0 reparasjoner for R12 og R2007.
- **Ikke testet i AutoCAD.** Åpne filen i ditt CAD-program og si fra om noe ser feil ut.

# RailCAD

Parametrisk 2D-CAD for jernbanespor, kjørbart lokalt i nettleseren uten server. Dette er **MVP (P0)** i henhold til `RailCAD_konsept_og_AI_spesifikasjon.md`.

> **Viktig:** RailCAD er et skisse- og geometriverktøy. Ingenting i programmet er regelverkskontrollert, og eksempelprosjektet er illustrativt. Se [Kjente begrensninger](#kjente-begrensninger).

## Installasjon og oppstart

Krever Node.js ≥ 20 (testet med Node 24, npm 11).

```bash
npm install
npm run dev          # http://localhost:5173
```

| Kommando                                                          | Hva den gjør                                     |
| ----------------------------------------------------------------- | ------------------------------------------------ |
| `npm run dev`                                                     | Utviklingsserver                                 |
| `npm run build` / `npm run preview`                               | Typesjekk + produksjonsbygg / forhåndsvis bygget |
| `npm test`                                                        | Enhetstester (Vitest)                            |
| `npx playwright install chromium` (én gang) og `npm run test:e2e` | Ende-til-ende-tester (starter dev-serveren selv) |
| `npm run typecheck`                                               | `vue-tsc` over hele arbeidsområdet               |
| `npm run lint` / `npm run format`                                 | ESLint / Prettier                                |

Ingen hemmeligheter eller miljøvariabler er nødvendige. Alt kjører lokalt, og ingen data forlater nettleseren.

## Bruk

Åpne **Fil → Åpne eksempelprosjekt** for tre parallelle spor på 140 m, en kurve og to mål, eller **Åpne avansert eksempel (Lodalen-inspirert)** for et sporfelt med 8 veksler, 35 koblinger og vifteformet veksellest. Det er en illustrasjon – ikke Lodalens faktiske geometri.

| Verktøy (hurtigtast) | Slik bruker du det                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Marker (V)           | Klikk velger, Shift+klikk flervalg. Dra objekt for å flytte; dra endepunktgrepene for direkte redigering. Esc avbryter/fjerner valg.                                            |
| Panorer (H)          | Dra. Midtknapp, eller Mellomrom + dra, panorerer også i alle andre verktøy. Musehjul zoomer rundt markøren.                                                                     |
| Rett spor (L)        | Klikk start- og sluttpunkt, **eller** fyll ut skjemaet (X, Y, retning, lengde) over tegneflaten og trykk Opprett.                                                               |
| Sirkelkurve (C)      | Klikk start (starter du i et sporendepunkt fortsetter buen tangentielt), klikk evt. tangentretning, klikk sluttpunkt. Eller bruk skjemaet (radius, venstre/høyre, sveipvinkel). |
| Parallelt spor (P)   | Sett sporavstand og side i verktøylinjen, klikk et rett referansespor og klikk for å plassere. Kopien er **uavhengig** av referansen.                                           |
| Roter (R)            | Valgte objekter: klikk pivot, referanseretning og ny retning – eller skriv vinkel (grader, mot klokka).                                                                         |
| Mål lengde (M)       | Klikk et spor, klikk for å plassere målelinjen. Måltallet er knyttet til sporet og oppdateres automatisk.                                                                       |
| Mål avstand (D)      | Klikk to punkter (med snapping) og plasser målelinjen. Lagres med egne koordinater.                                                                                             |
| Slett (E)            | Klikk objekt. Del-tasten sletter valgte. Tilknyttede lengdemål slettes med; Angre gjenoppretter alt.                                                                            |

Andre hurtigtaster: `Ctrl+Z` angre, `Ctrl+Y`/`Ctrl+Shift+Z` gjør om (200 trinn), `Ctrl+S` lagre, `Ctrl+O` åpne, `F` tilpass visning, `Enter` bekrefter parallelt spor.

**Kryssende spor:** programmet markerer der spor krysser, ender på eller overlapper hverandre uten kryss/veksel (gult kryss på tegneflaten og i **Kontroll → Kryssende spor**). Status er «ikke vurdert»; «Planskilt» bekrefter en bevisst kryssing i ulik høyde. Se `docs/kryssing.md`.

**Å bli fort kjent:** i et tomt prosjekt vises et «Kom i gang»-kort (eksempler, åpne fil, import, hjelp). **Hjelp → Hurtigtaster og tips** (eller `?`) viser alle snarveier. Angre/gjør om og zoom/tilpass har egne knapper.

**Valg og tegning:** dra på tom flate for _valgboks_ (mot høyre: helt innenfor, mot venstre: alt som berøres, Skift legger til). Hold **Skift** mens du tegner et rett spor for å låse retningen til 15°. Pil opp/ned i tallfelt justerer verdien (Skift ×10, Alt ×0,1). Objekter opprettet via skjema utenfor skjermen blir vist automatisk.

**Sikkerhetskopi:** ulagret arbeid kopieres automatisk til nettleserens lokale lagring (ca. 1,5 s etter hver endring; ikke for svært store prosjekter) og tilbys gjenopprettet ved neste oppstart. Det erstatter ikke lagring – bruk Fil → Lagre.

**Snapping** (bunnlinjen, kan slås av/på): endepunkt, senter, tangent (fra forrige punkt), nærmeste punkt og rutenett. Søkeradius er 12 px og omregnes til meter – den påvirker aldri modellen. Merket vises ved markøren.

**Høyre panel** har fire faner: _Egenskaper_, _Objekter_, _Koblinger_ og _Bakgrunn_. Fanene viser antall (rødt merke på Koblinger ved avvik), kan betjenes med piltaster, og valgt fane huskes. Å velge et objekt (på tegneflaten eller i listen) viser egenskapene; i fanene Koblinger og Bakgrunn blir du værende.

**Egenskapspanelet** redigerer geometrien direkte (start, retning, lengde / radius, kurveretning, sveipvinkel, buelengde). Tall kan skrives med komma eller punktum; ugyldige verdier gir en feilmelding og endrer ingenting. **Visning → Skjematisk skinne-/svillevisning** tegner to skinner (1,435 m, kun skjematisk) og sviller ved høy zoom.

**Topologi:** Koblinger lagres eksplisitt i prosjektfilen (`connections`) og kontrolleres mot toleranser (posisjon `1 µm`, tangent foreløpig `1e-6` rad). Avvik rapporteres, ingenting flyttes automatisk.

**DXF-eksport:** Fil → Eksporter DXF (R12 eller R2007) – se `docs/dxf.md`. Lag for sporakser, sporveksler, mål og tekst; meter som enhet.

**Bakgrunn:** Fil → Importer bakgrunn (DXF, PDF, PNG, JPEG) – referanse under planen, med skalering ved to punkter, flytting, dekkevne og synlighet. Se `docs/bakgrunn.md`.

**Lagring:** Fil → Lagre laster ned `<prosjektnavn>.railcad.json`. Åpne leser filen tilbake og validerer den (struktur, tall, invarianter, unike ID-er, referanser) før noe vises; ved feil forklares det hva som er galt og prosjektet er urørt.

## Arkitektur

```
packages/
  domain/         Typer, JSON-skjema (zod), validering, migrering, ID-generering
  geometry-api/   Stabilt GeometryEngine-grensesnitt + eksplisitte toleranser
  geometry-ts/    TypeScript-implementasjon: linje, bue, offset, rotasjon, snapping, mål, topologi, sporveksler
  dxf/            DXF-eksport (R12, R2007) og DXF-lesing for bakgrunn
apps/web/src/
  commands/       Patch-modell og rene builders (opprett, erstatt, slett, flytt/roter)
  stores/         Pinia: project (modell + angre/gjør om), view (utsnitt/snap), ui
  tools/          Verktøy (Marker, tegning, parallell, mål, roter, slett) + controller
  rendering/      world↔screen, rutenett, SVG-stier
  components/     Meny, verktøylinje, tegneflate, egenskaper, objektliste, status
fixtures/         Eksempelprosjekter (tre spor; Lodalen-inspirert sporfelt – generert av scripts/generate-lodalen.ts)
scripts/          Generatorer for eksempler og testfiler (generate-lodalen, generate-dxf-samples, generate-background-samples)
tests/e2e/        Playwright
docs/             Beslutninger, filformat, kravstatus
```

Prinsipper (fra spesifikasjonen):

- **Modell først.** Geometri lagres som parametere i meter/radianer. Skjermkoordinater finnes bare i `rendering/` og i pekerhendelser. Zoom/pan endrer aldri modellen.
- **Ren geometrimotor.** Vue-maler regner ikke faggeometri. Alt går via `GeometryEngine` (`apps/web/src/engine.ts` er eneste bindingspunkt, slik at Rust/WASM kan settes inn senere).
- **Angre/gjør om som data.** Hver redigering er en `Patch` (før/etter + posisjon) – deterministisk å reversere.
- **Geometri ≠ topologi.** Filformatet har `connections`; MVP oppretter ingen (P1), men validerer og bevarer dem.
- **Eksplisitte toleranser:** `TOLERANCES` i `geometry-api`.

Se `docs/` for filformat og beslutninger.

## Kjente begrensninger

- **Ikke regelverkskontrollert.** Ingen kontroller mot Bane NOR/TRV. Panelet viser «ikke vurdert»; ingenting presenteres som godkjent.
- **Sporveksler er delvis verifisert** (3 typer, akser avledet fra TRV-hovedmål, ikke kontrollert mot KO-tegning – se `docs/vekseldata-trv.md`). Dobbel kryssveksel, sporsløyfer og EVB-typer er ikke lagt inn.
- **Tangenttoleranse for koblinger er en foreløpig testverdi.**
- **DXF-eksport er ikke testet i AutoCAD** (kun ezdxf og egne tester); måltall eksporteres som tekst.
- **Bakgrunn:** bare side 1 av PDF, ingen georeferering, DXF uten HATCH/DIMENSION.
- **Ingen lag, klotoider, vertikalgeometri eller 3D** (P1/P2 eller eksplisitt utelatt).
- Kryssende spor oppdages, men sporkryss/kryssveksler finnes ikke i biblioteket (mangler verifiserte data), og høyder finnes ikke i modellen.
- Parallellføring støtter kun **rette** spor. Kopien er en uavhengig kopi (ingen parametrisk kobling).
- Lokalt XY-system. Svært store koordinater (f.eks. UTM ~6 000 000 m) er ikke testet i visningen og bør løses sammen med georeferering.
- Mål: «Mål avstand» er punkt-til-punkt. Vinkelrett sporavstand må settes via endepunkter/snapping; egen funksjon kan komme i P1.
- Mellomrom som panoreringstast virker ikke mens en knapp har tastaturfokus (den aktiverer da knappen).
- Skinne-/svillevisning er skjematisk (sporvidde 1,435 m, sviller visualisert som mønster), ikke overbygningsprosjektering.
- Ytelse: tegnet og testet med 5 000 spor (utsnittskulling; ca. 20–40 ms per zoomsteg i testmiljøet). Objektlisten tegner alle rader.
- Lagring skjer som nedlastet fil. Automatisk sikkerhetskopi i nettleseren (kladd) beskytter mot tap ved oppdatering/krasj, men kan utebli for svært store prosjekter eller hvis nettleseren blokkerer lokal lagring.

## Neste steg (P1)

Verifisert sporvekselgeometri fra KO-tegninger (se `docs/henvendelse-bane-nor.md`), flere vekseltyper, DXF-eksport (med lag), referansebakgrunn, parametriske sammenhenger mellom spor. MVP skal være ferdig verifisert før dette starter.

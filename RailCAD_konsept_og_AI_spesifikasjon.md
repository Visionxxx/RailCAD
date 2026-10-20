# RailCAD

**Konsept og utviklingsspesifikasjon for et CAD-program for jernbanespor**  
**Versjon:** 1.0  
**Dato:** 20. oktober 2026  
**Status:** Produktkonsept / grunnlag for AI-assistert programutvikling

> **Formålet med dokumentet:** Dette er en selvstendig, maskinlesbar spesifikasjon som kan gis til en kodeassistent. Den beskriver produktvisjon, arbeidsflyt, datamodell, funksjonskrav, tekniske valg, prioriteringer og akseptansekriterier. Dokumentet er ikke en verifisert prosjekteringsstandard eller et godkjent jernbanefaglig grunnlag.

## 1. Sammendrag

**RailCAD** er et spesialisert, parametrisk 2D-CAD-program for prosjektering av jernbanespor. Brukeren skal arbeide med intelligente sporobjekter – rette spor, kurver, sporveksler, tilkoblinger, sporavstand og tilhørende konstruksjoner – i stedet for løse tegneelementer.

Programmet prioriterer **verksteder, hensettingsanlegg, terminaler og sidespor**. Den første versjonen skal kunne kjøres lokalt i nettleser og fungere uten server. Programmet skal senere kunne utvides med regelverkskontroll, vertikalgeometri, 3D, kjøretøysimulering og BIM-/jernbanedatautveksling.

**Produktløfte:** Tegn spor raskt; rediger faktiske geometriparametere; få en konsistent sporplan; eksporter en brukbar tegning og strukturerte prosjektdata.

**Anbefalt teknisk retning:** Vue 3 + TypeScript i grensesnittet, SVG eller Canvas/WebGL for 2D-tegning, og en isolert geometrimotor i Rust, med WebAssembly-integrasjon når geometrien er moden. Første tekniske prototype kan implementere den samme motorgrensesnittet i TypeScript for å fremskynde læring – uten å låse datamodellen til visningslaget.

## 2. Mål, brukere og avgrensning

### 2.1 Primære brukere

- Prosjektledere og prosjekterende som utvikler sporoppsett på verksted- og terminalområder.
- Jernbanetekniske rådgivere og fagressurser innen spor/overbygning.
- Bygg- og anleggsprosjekter hvor spor, sporveksler, porter, haller og konstruksjoner må samordnes.

### 2.2 Hovedmål

1. Lage en målbar 2D-sporplan basert på geometriske parametere.
2. Håndtere sporforbindelser uten at linjer og objekter mister sammenheng.
3. Redigere lengder, radius og plassering direkte fra en egenskapspalett.
4. Støtte metrisk arbeid, koordinater, snapping, målsetting og undo/redo.
5. Lagre og åpne prosjektfiler uten ekstern tjeneste.
6. På sikt utføre etterprøvbare kontroller mot versjonerte krav.

### 2.3 Ikke-mål for første versjon (MVP)

- Ikke en full erstatning for AutoCAD, Civil 3D, OpenRail eller øvrige prosjekteringssystemer.
- Ikke sertifiserte sporberegninger, sikkerhetsgodkjenning eller automatisk godkjenning mot Bane NORs tekniske regelverk.
- Ikke 3D-modellering, dynamiske togbevegelser, signalanlegg eller komplett høydegeometri.
- Ikke flerspiller/sanntidssamarbeid eller skybasert brukeradministrasjon.

## 3. Designprinsipper

**Parametrisk:** Geometrien lagres som data (startpunkt, retning, lengde, radius mv.), ikke som skjermpiksler.

**Sammenhengende:** Spor og sporveksler kobles til hverandre i en topologisk graf med eksplisitte porter/endepunkter.

**Forutsigbart:** Samme prosjektdata skal gi identisk geometri ved hver opptegning og eksport innen definerte toleranser.

**Kontrollerbart:** Feil og manglende data skal vises tydelig. Programmet skal aldri fremstille en uvalidert skisse som en regelverksgodkjent løsning.

**Utvidbart:** Tegnemotor, faglig geometrimotor, regelverksmotor og import/eksport skal ha tydelige grensesnitt.

## 4. Arbeidsflate og brukeropplevelse

Programmet åpner i en **mørk eller lys 2D-arbeidsflate** med metrisk rutenett. Foreslått oppbygging:

| Område | Innhold |
|---|---|
| Toppmeny | Ny, åpne, lagre, importer, eksporter, visning, prosjektinnstillinger. |
| Venstre verktøylinje | Marker, panorer, rett spor, kurve, parallelt spor, sporveksel, mål og slett. |
| Sentral tegneflate | Spor, skinne-/akserepresentasjon, rutenett, koordinater, hjelpelinjer og objekter. |
| Høyre egenskapspanel | Objekt-ID, geometri, tilkoblinger, låsing, lag, status og kontrollresultater. |
| Bunnlinje | Markørkoordinat, zoom/skala, aktivt verktøy, enheter, snap-status. |

### 4.1 Grunnleggende arbeidsflyt

1. Opprett prosjekt og velg enheter/koordinatsystem.
2. Tegn et rett spor ved å velge startpunkt, retning og lengde.
3. Velg sporet, endre lengden i egenskapspanelet og se direkte oppdatering.
4. Opprett et parallelt spor med oppgitt avstand.
5. Plasser en kurve eller en sporveksel med kontrollerte endepunkter.
6. Bruk snapping for å koble objektene sammen.
7. Mål mellom spormidt, sjekk objektlisten og eksporter tegning/prosjektfil.

### 4.2 Samhandlingskrav

- Musehjul: zoom rundt markøren. Midtknapp/mellomrom + dra: panorer.
- Klikk: velg objekt. Shift + klikk: flervalg. Escape: avbryt kommando.
- Synlige snap-punkter: endepunkt, senter, tangent, nærmeste punkt, rutenett.
- Forhåndsvisning ved plassering; tydelig forskjell på gyldig og ugyldig tilkobling.
- Undo/redo for alle redigerende handlinger, inkludert endring i egenskapspanelet.
- Veksle mellom visning av bare sporakse og skjematisk skinne-/svillevisning.

## 5. Spor- og geometrimodell

### 5.1 Koordinater og enheter

Intern geometriberegning skal foregå i **meter og radianer** (IEEE 754 double eller tilsvarende). UI kan vise grader, meter, millimeter og promille. Prosjektet kan starte i lokalt koordinatsystem (X, Y). Georefererte koordinatsystemer (f.eks. relevante norske EUREF89-varianter) og NN2000 håndteres i senere fase med eksplisitt CRS-/høydereferanse og kontrollert transformasjon.

### 5.2 Geometriske primitiver

| Objekt | Obligatoriske parametere | MVP |
|---|---|---|
| Rett spor | Startpunkt, orientering, lengde | Ja |
| Sirkelkurve | Startpunkt, starttangent, signert radius, buelengde/vinkel | Ja |
| Overgangskurve (klotoide) | Starttilstand og parameter/kurvaturutvikling | Senere |
| Vertikalprofil | Kilometer/stasjon, kote, stigning, vertikalkurve | Senere |
| Parallelt spor | Referansegeometri, signert sideforskyvning | Ja, rett spor først |
| Sporveksel | Bibliotektype, transformasjon, tilkoblingsporter | Ja, som typebestemt objekt |

Sporlinjer har en **senterlinje/sporakse** som primærgeometri. To skinnekanter kan visualiseres ved konstant sporvidde der det er relevant, men er ikke en erstatning for detaljert overbygningsprosjektering.

### 5.3 Geometri og topologi er to forskjellige lag

- **Geometri:** Forteller hvor et spor fysisk ligger (linje, bue, kurvatur, tangent, lengde).
- **Topologi:** Forteller hvilke spor og sporvekselporter som er koblet sammen.
- **Koblingsregler:** Endepunkter må møtes innen en definert posisjonstoleranse; tangentretning må kontrolleres der det kreves. Feil må rapporteres – ikke skjules gjennom automatisk flytting.

### 5.4 Sporveksler

Sporveksler må modelleres ut fra et **versjonert objektbibliotek med faktiske dimensjoner og tilkoblingsporter**, ikke fra håndtegnede symboler. Hver type skal ha katalog-ID, kilde/revisjon, avgrenset geometri, hovedsporport og avvikende sporport(er), retning/orientering samt relevant metadata.

En sporveksel kan plasseres og roteres i prosjektet. Systemet skal transformere den lokale bibliotekgeometrien til prosjektkoordinater uten å endre interne mål. I MVP kan biblioteket inneholde **demodata**, men slike objekter må merkes `illustrasjon / ikke verifisert` og skal ikke inngå i godkjent prosjektering.

### 5.5 Geometriske invariants

- Et sporsegment har alltid positiv, endelig lengde.
- Radier skal ikke være null; retningen på krumning må være entydig.
- Objekt-ID-er skal være unike og stabile ved lagring.
- Referanser til tilkoblingsporter skal vise til eksisterende objekter.
- Visningszoom og skjermkoordinater skal aldri endre den lagrede prosjekteringsgeometrien.
- Alle toleranser må være eksplisitte og kunne testes, ikke skjulte magiske konstanter.

## 6. Funksjonskrav med prioritet

**Prioritet:** P0 = nødvendig for første brukbare prototype. P1 = neste utvidelse. P2 = senere visjon.

| ID | Krav | Prioritet | Akseptansekriterium |
|---|---|---|---|
| RC-001 | Opprette/åpne/lokallagre prosjekt | P0 | Lagret prosjekt åpnes med samme objekter og mål. |
| RC-002 | Tegne rett spor | P0 | Punkt, retning og lengde kan angis numerisk. |
| RC-003 | Tegne sirkelkurve | P0 | Radius og buelengde/vinkel er redigerbare. |
| RC-004 | Redigere objekt i egenskapspanel | P0 | Modellen og tegneflaten oppdateres synkront. |
| RC-005 | Snapping mot endepunkter | P0 | Gitt toleranse vises og oppnås presist. |
| RC-006 | Panorering, zoom, grid, valghåndtering | P0 | Fungerer stabilt ved normal sporplanskala. |
| RC-007 | Undo/redo | P0 | Minst 50 brukerhandlinger kan reverseres. |
| RC-008 | Målsetting av lengde/avstand | P0 | Verdier beregnes fra modellkoordinater. |
| RC-009 | Lage parallelt rett spor | P0 | Bruker oppgir sporavstand og retning. |
| RC-010 | Sporveksel fra bibliotek | P1 | Plasseres med porter og korrekt typegeometri. |
| RC-011 | Topologiske sporforbindelser | P1 | Koblingsstatus kan listes og valideres. |
| RC-012 | Eksport til DXF | P1 | Sporakser og lag kan åpnes i ekstern CAD. |
| RC-013 | Referansebakgrunn (DXF/bilde) | P1 | Kan importeres og skaleres/posisjoneres. |
| RC-014 | Regelverkskontroll | P2 | Resultat viser kilde, versjon, beregning og status. |
| RC-015 | 3D, profil og kjøretøykontroll | P2 | Egne validerte moduler med dokumenterte forutsetninger. |

## 7. Regelverksmotor – fremtidig modul

Regelverkskontroll skal være en **separat, versjonert regelmotor** som leser objektdata og returnerer sporbare resultater. Den må ikke bygges ved at en språkmodell fritt gjetter om en sporplan er godkjent.

Forslag til struktur for én kontrollregel:

- `rule_id`: intern ID.
- `source`: for eksempel Bane NOR Teknisk regelverk.
- `reference`: dokument, side eller TRV-nummer.
- `revision` og `valid_from`: regelverksversjon.
- `scope`: hvilke objekt- og anleggstyper kravet gjelder.
- `inputs`: nøyaktig hvilke geometriske felter som brukes.
- `logic`: maskinlesbar test eller eksplisitt manuell sjekkliste.
- `result`: pass / fail / warning / not_applicable / not_evaluated.
- `evidence`: faktisk målt verdi, terskel og beregningsspor.

Viktige krav: Et regelnummer uten kontrollert kilde skal ikke aktivere automatisk samsvarskontroll. Unntak, fravik og prosjektspesifikke forutsetninger må håndteres eksplisitt. Uavklarte kontroller skal vises som **ikke vurdert**, aldri som godkjent.

## 8. Anbefalt teknisk arkitektur

```text
Vue 3 / TypeScript – brukergrensesnitt
    |
    +-- CAD Canvas (viewport, valg, snap-forhåndsvisning)
    +-- Command Controller (tegne- og redigerkommandoer)
    +-- Properties Panel (numeriske felt)
    +-- Project Store (objekter, seleksjon, undo/redo)
    |
    v
Geometry API (stabilt og uavhengig av renderer)
    |
    +-- Segmenter: linje, sirkelbue, senere klotoide
    +-- Transformasjoner og nærmeste punkt
    +-- Konstruksjon og snapping
    +-- Topologi- og integritetskontroll
    |
    v
Project Model (versjonert JSON)
    +-- Local file import/export
    +-- Senere: DXF / IFC / railML / database
```

### 8.1 Valg av teknologi

| Del | Foreslått teknologi | Begrunnelse |
|---|---|---|
| UI | Vue 3 + TypeScript + Vite | Komponentbasert, rask lokal utvikling. |
| State | Pinia og kommandomønster | Tydelig tilstand, undo/redo og testbarhet. |
| 2D-rendering | SVG for MVP; vurder Canvas/WebGL ved behov | SVG er enkel å inspisere og teste tidlig. |
| Geometrimotor | Rust, eksponert som WebAssembly | Egnet for robust, modulær matematikk på sikt. |
| Første prototypemotor | TypeScript bak samme `GeometryEngine`-interface | Raskere iterasjoner; kan erstattes med Rust/WASM. |
| Lagring | Versjonert JSON og lokal fil | Ingen obligatorisk server eller pålogging. |
| Fremtidig backend | PostgreSQL + PostGIS | Flerprosjekt, geodata og samarbeid ved behov. |
| Testing | Vitest + Playwright; Rust unit/property tests | Regresjonstesting av interaksjon og geometri. |

**Viktig arkitekturregel:** Komponenter skal aldri regne ut faggeometri direkte i Vue-maler eller skjermpikselkoordinater. De skal kalle en ren geometrimotor.

### 8.2 Foreslått mappestruktur

```text
railcad/
  apps/web/
    src/components/       # toolbar, viewport, properties
    src/commands/         # CAD commands
    src/stores/           # project + history + selection
    src/rendering/        # world-to-screen + drawing
  packages/domain/        # types, validation, schema
  packages/geometry-api/  # stable engine interface
  packages/geometry-ts/   # initial geometry implementation
  crates/geometry/        # future Rust core
  fixtures/               # sample project files
  tests/                  # geometry + e2e scenarios
  docs/                   # decisions, formats, guides
```

## 9. Prosjektformat og eksempeldata

Prosjektfilen må ha `schemaVersion`, prosjektmetadata, enheter, koordinatreferanse, objekter og eksplisitte koblinger. Den skal kunne migreres når formatet utvikles. Under vises **konseptuelt eksempeldata** i lokalt XY-system, ikke kontrollert prosjekteringsgeometri.

```json
{
  "schemaVersion": "0.1.0",
  "project": {
    "id": "demo-verksted-01",
    "name": "Verkstedspor – demoprosjekt",
    "units": "m",
    "coordinateSystem": {"type": "local_xy"}
  },
  "objects": [
    {"id": "track-001", "type": "track_segment",
     "geometry": {"kind": "line", "start": [0, 0],
                  "headingRad": 0, "lengthM": 140}},
    {"id": "track-002", "type": "track_segment",
     "geometry": {"kind": "arc", "start": [0, 10],
                  "headingRad": 0, "signedRadiusM": 300,
                  "sweepRad": 0.15}}
  ],
  "connections": []
}
```

**Designvalg:** `geometry` bør være en diskriminert union (`kind: line | arc | ...`). Sporveksler lagres som egne biblioteksobjekter med transformasjon og porter. Importer skal validere skjema, numeriske verdier og referanser før prosjektet tegnes.

## 10. Første implementasjon – MVP

### 10.1 Mål for første leveranse

Et faktisk kjørbart lokalt nettsted som lar brukeren:

1. Tegne et rett spor ved museklikk og/eller inntasting av lengde.
2. Tegne en sirkelbue med endringsbar radius.
3. Velge, flytte, rotere og slette objekter.
4. Opprette et parallelt rett spor med gitt sporavstand.
5. Snape til endepunkter og måle avstander.
6. Bruke zoom/pan, prosjektlagring og undo/redo.
7. Åpne et vedlagt eksempelprosjekt.

**Merk:** Et sporvekselverktøy med dokumentert bibliotekgeometri kommer i fase 2. Et grafisk demonstrasjonssymbol kan testes i MVP, men må markeres som uvalidert.

### 10.2 Prioritert gjennomføringsrekkefølge

| Trinn | Konkret leveranse | Ferdig når |
|---|---|---|
| 1 | Vite/Vue/TS-prosjekt, responsiv CAD-layout | Starter lokalt med én kommando. |
| 2 | World/screen-transformasjon, grid, pan og zoom | Markør og objekter holder riktig posisjon. |
| 3 | Ren modell for linjesegment og sirkelbue | Segmenter kan serialiseres og testes. |
| 4 | Valg, snap, tegnekommandoer og egenskapspanel | Brukeren kan konstruere og redigere spor. |
| 5 | Parallellføring, målsetting, undo/redo | Vanlige operasjoner kan utføres trygt. |
| 6 | Prosjektlagring, import, eksempelprosjekt og tester | Prosjektet overlever gjenåpning uten geometriendring. |

### 10.3 Definisjon av ferdig (MVP)

- `npm install` og `npm run dev` fungerer med dokumentert oppsett.
- Ingen TypeScript-feil, ødelagte kontroller eller ukontrollerte JavaScript-feil i testscenariet.
- Prosjektdata kan eksporteres og importeres uten tap av geometri.
- Minst 20 enhetstester for geometri/data og 5 ende-til-ende-tester av kjerneflyter.
- Koordinater og lengder beregnes fra modellen, ikke fra antall piksler.
- Grunnleggende nettbreddestøtte; desktop er primærplattform.
- En `README.md` beskriver installasjon, arkitektur, kjente begrensninger og neste steg.

## 11. Testscenario: verkstedområde med tre spor

Bruk et **illustrativt** anlegg med tre parallelle verkstedspor, hvert ca. 140 meter. Dette er en praktisk testmodell – ikke en dokumentert, kontrollert situasjonsplan.

**Scenario A – grunngeometri:** Opprett spor 1 fra (0, 0) til (140, 0). Generer to parallelle spor med brukerstyrte avstander. Verifiser lengder, retning og målsetting.

**Scenario B – endring:** Endre lengden på ett spor fra 140 til 150 meter. Kontroller at tilhørende visning, måltall og lagret prosjekt reflekterer 150 meter.

**Scenario C – kurve:** Lag en sirkelbue og endre radius. Kontroller at starttangent, buelengde og endepunkt følger matematiske forventninger.

**Scenario D – lagring:** Lagre, last inn på nytt og sammenlign alle objekters numeriske geometriverdier.

**Scenario E – senere fase:** Sett inn sporveksler fra dokumentert bibliotek, knytt spor sammen og vis eventuelle koblingsfeil med en forklaring.

## 12. Kvalitet og risiko

### 12.1 Kvalitetskrav

- Test nøyaktighet for linje, bue, rotasjon, offset, snapping og invers transformasjon.
- Bruk faste numeriske toleranser spesifisert per beregningskategori; ikke en generell skjermtoleranse for alt.
- Skill datavalidering, brukerfeil og faglige regelverksavvik.
- Prosjektfiler skal tåle manglende/ukjente felt uten lydløs korrupsjon.
- Prioriter tastaturnavigasjon, kontrast og tydelig markering i grensesnittet.
- Hold prosjektmodellen uavhengig av enhver ekstern CAD- eller BIM-leverandør.

### 12.2 Viktigste risikoer

| Risiko | Tiltak |
|---|---|
| Spor ser riktige ut, men matematisk geometri er feil | Enhetstester og modellstyrt rendering fra første dag. |
| Vekselgeometri bygger på skjematiske symboler | Versjonert bibliotek med verifiserte data; ellers tydelig demo-merking. |
| Regler endres eller har unntak | Versjonering, kildekontroll, sporbarhet og «ikke vurdert»-status. |
| For tidlig fokus på IFC, DXF og 3D | Prioriter editor og stabil intern datamodell først. |
| Mange UI-funksjoner gir ustabil redigering | Kommandomønster, deterministisk undo/redo, e2e-tester. |

## 13. Videre produktfaser

**Fase 2 – Jernbanefunksjoner:** Ekte sporvekselbibliotek, portsnap, topologisk nettverk, feilrapportering og DXF-eksport. Den geometriske kontinuiteten skal kunne verifiseres.

**Fase 3 – Prosjekteringsstøtte:** Verifiserte kravsett med TRV-/kildereferanser, bakgrunnskart, bygg og hinderflater, sporgeometrirapporter samt kontroll av relevante avstander. Kjøretøy- og profilkontroll krever dokumenterte forutsetninger.

**Fase 4 – Avansert modell:** Klotoider, vertikalgeometri, overhøyde, 3D-visualisering, bedre koordinattransformasjoner, IFC 4.3/railML-utveksling og samhandling. Formatstøtte må avklares mot relevante versjoner og lisenser når fasen starter.

## 14. Beslutninger og åpne spørsmål

**Foreslåtte beslutninger som AI kan bruke uten å spørre:**

- Første versjon: lokal, nettleserbasert 2D-applikasjon, ingen backend.
- Primært språk i grensesnittet: norsk bokmål.
- Metriske enheter og lokalt XY-system som utgangspunkt.
- En enkel, profesjonell CAD-design med lys/mørk modus.
- Start med skjematisk sporakse; skinne-/svillevisning som valg.
- TypeScript-motor i MVP bak rent grensesnitt; Rust/WASM senere.
- Ingen automatisk sertifisering eller regelverksgodkjenning.

**Spørsmål som kan avklares senere uten å blokkere MVP:** Ønsket CAD-importformat, nøyaktige norske sporvekseltyper, behov for NTM/UTM fra første produktversjon, dimensjonerende togmateriell, konkrete TRV-kontroller og eventuelle krav til offline/sikkerhetsmiljø.

## 15. Instruksjon til en utviklings-AI

> Du skal utvikle RailCAD med utgangspunkt i dette dokumentet. Lag først en kjørbar MVP, ikke bare en designmockup. Bruk Vue 3, TypeScript og Vite. Implementer geometri i en egen modul med et stabilt grensesnitt, slik at den senere kan erstattes av Rust/WebAssembly. Bygg en responsiv 2D-arbeidsflate med zoom, pan, snapping, rette spor, sirkelkurver, parallelt spor, objektvalg, numerisk egenskapspanel, målsetting, undo/redo og lokal JSON-lagring. Hold alle beregninger i meter/radianer og adskilt fra skjermpiksler. Lag et illustrativt eksempelprosjekt med tre parallelle verkstedspor. Opprett et testoppsett med enhetstester og ende-til-ende-tester, og dokumenter hvordan prosjektet startes. Del implementasjonen i forståelige komponenter og presenter filstruktur, designvalg, testresultater og kjente begrensninger. Ikke påstå at demo-objekter, sporveksler eller sporplaner er regelverksgodkjente. Begynn med milepæl 1: prosjektoppsett, viewport, verdenskoordinater og grunnleggende spormodell. Fortsett deretter sekvensielt mot den definerte MVP-en.

### Foreslått første utviklingsoppgave

**Leveranse:** En lokal webapp som tegner en metrisk 2D-flate, støtter pan/zoom, lar brukeren tegne et rett spor numerisk, velge det og justere lengden. Inkluder prosjektlagring til JSON, minst fem geometritester og et enkelt, ryddig grensesnitt. Dette er første verifiserbare byggeblokk før kurver, offset og sporveksler.

---

**Dokumentstatus:** RailCAD v1.0 er en produkt- og implementasjonsspesifikasjon. Faglige forutsetninger, prosjekteringskrav, referansegeometri og standardversjoner skal verifiseres før programmet brukes til faktiske jernbaneanlegg.

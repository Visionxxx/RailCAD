# Kravstatus – MVP (P0)

Kontrollert mot `RailCAD_konsept_og_AI_spesifikasjon.md`. Enhetstester: `packages/*/tests`, `apps/web/tests`. E2E: `tests/e2e/railcad.spec.ts`.

## Funksjonskrav (kap. 6)

| ID                      | Krav                                                | Status                                                                             | Dekket i                                                                              | Verifisert av                                                                                           |
| ----------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| RC-001                  | Opprette/åpne/lokallagre                            | Ferdig                                                                             | `io/files.ts`, `actions.ts`, `domain/validation.ts`                                   | e2e «lengdemål … lagring», «ugyldig prosjektfil», enhet «prosjektvalidering»                            |
| RC-002                  | Tegne rett spor (punkt, retning, lengde numerisk)   | Ferdig                                                                             | `tools/drawing.ts` (LineTool), `ToolOptions.vue`                                      | e2e «tegn rett spor numerisk», «tegn spor med musen»                                                    |
| RC-003                  | Sirkelkurve, radius og buelengde/vinkel redigerbare | Ferdig                                                                             | `ArcTool`, `PropertiesPanel.vue`, `geometry-ts/track.ts`                              | e2e «scenario C», «bue … tangentielt»; enhet «sirkelbue»                                                |
| RC-004                  | Egenskapspanel, synkron oppdatering                 | Ferdig                                                                             | `PropertiesPanel.vue`, `NumberField.vue`                                              | e2e «scenario B», «ugyldige verdier»                                                                    |
| RC-005                  | Snapping mot endepunkter                            | Ferdig (+ senter, tangent, nærmeste, rutenett)                                     | `geometry-ts/snap.ts`, `ViewportCanvas.vue`                                           | e2e «snapper til endepunkt», enhet «snapping»                                                           |
| RC-006                  | Pan, zoom, grid, valg                               | Ferdig                                                                             | `rendering/viewport.ts`, `ViewportCanvas.vue`                                         | e2e «zoom rundt markøren», «midtknapp», ytelse (5000 spor); enhet «viewport»                            |
| RC-007                  | Undo/redo ≥ 50                                      | Ferdig (200)                                                                       | `stores/project.ts`, `commands/patch.ts`                                              | e2e «50 handlinger», enhet «prosjektstore og historikk»                                                 |
| RC-008                  | Målsetting fra modellkoordinater                    | Ferdig (lagrede lengde- og avstandsmål)                                            | `geometry-ts/dimension.ts`, `MeasureLengthTool`, `MeasureDistanceTool`                | e2e «lengdemål følger sporet», enhet «målsetting»                                                       |
| RC-009                  | Parallelt rett spor                                 | Ferdig (uavhengig kopi)                                                            | `ParallelTool`, `GeometryEngine.offset`                                               | e2e «parallelle spor er uavhengige kopier», enhet «parallellforskyvning»                                |
| RC-011                  | Topologiske sporforbindelser (P1)                   | **Ferdig** – koblinger kan opprettes (Koble-verktøy, forslag), listes og valideres | `geometry-ts/topology.ts`, `tools/connect.ts`, `ConnectionsPanel.vue`, `PortMenu.vue` | e2e «RC-011» (4 tester); enhet «koblingskontroll», «forslag til koblinger», «koblinger i prosjektstore» |
| RC-010, RC-012 – RC-015 | Sporveksel, DXF, bakgrunn, regelverk, 3D            | **Ikke ferdig** (RC-010/012/013 = neste P1-steg; RC-014/015 = P2)                  | –                                                                                     | –                                                                                                       |

## MVP-leveranse (kap. 10.1) og ferdig-kriterier (10.3)

| Punkt                                  | Status                                                            |
| -------------------------------------- | ----------------------------------------------------------------- |
| Rett spor med mus og/eller inntasting  | Ferdig                                                            |
| Sirkelbue med endringsbar radius       | Ferdig                                                            |
| Velge, flytte, rotere, slette          | Ferdig (e2e «flytt, roter og slett»)                              |
| Parallelt spor med gitt avstand        | Ferdig                                                            |
| Snap til endepunkter, måle avstander   | Ferdig                                                            |
| Zoom/pan, lagring, undo/redo           | Ferdig                                                            |
| Eksempelprosjekt (tre parallelle spor) | Ferdig (`fixtures/demo-verksted.json`)                            |
| `npm install` + `npm run dev`          | Ferdig (verifisert fra ren kloning)                               |
| Ingen TS-feil / JS-feil i testscenario | Ferdig (`vue-tsc`, ESLint rene; konsollfeil asserteres i e2e)     |
| Eksport/import uten tap                | Ferdig (e2e sammenligner lagret fil før og etter gjenåpning)      |
| ≥ 20 enhetstester / ≥ 5 e2e            | 50 enhetstester / 17 e2e                                          |
| Lengder fra modellen, ikke piksler     | Ferdig (arkitekturregel; `rendering/` er eneste sted med piksler) |
| Grunnleggende nettbreddestøtte         | Ferdig (e2e «smal skjerm»)                                        |
| README                                 | Ferdig                                                            |

## Testscenarier (kap. 11)

A (grunngeometri) ✓ · B (140 → 150) ✓ · C (bue/radius) ✓ · D (lagre/last) ✓ · E (sporveksler) – senere fase.

## Avvik og ikke-implementerte forslag

- Egenskapspanelets forslag om **låsing** og **lag** er ikke implementert (lag er avklart utelatt; låsing er ikke et krav i kravtabellen).
- Panelet viser «Tilkoblinger: ingen» og «Regelverk: ikke vurdert» (kap. 3/7: aldri vise uvalidert som godkjent).

## P1: topologi (RC-011) – merknader

- Tangenttoleranse (`TOLERANCES.connectionTangentRad`) er en **foreløpig testverdi** (ikke faglig fastsatt) og vises som sådan i koblingspanelet.
- Avvik rapporteres (posisjon, tangent, manglende spor) – ingenting flyttes automatisk.
- Sporveksler: se `docs/vekseldata-trv.md`. Alle typer har `verification: 'partial'` og vises som «delvis verifisert» i panel, på tegneflaten og i tegningsmenyen. Geometrien lagres ikke i prosjektfilen, den utledes fra katalog + plassering (katalogrevisjon lagres for sporbarhet).

## Sluttkontroll (2026-10-20)

Kjørt fra en ren `git clone` (`npm ci`): `npm run typecheck`, `npm run lint`, `npm run build` rene; `npm test` = **145 bestått**; `npm run test:e2e` = **49 bestått** (Chromium, egen dev-server).

| Område                      | Resultat                                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| P0 (RC-001 – RC-009)        | Ferdig og testet                                                                                                                    |
| P1 (RC-010 – RC-013)        | Ferdig. RC-010 **delvis verifisert** (geometri avledet fra TRV-hovedmål, ikke KO-tegning). RC-012 ikke testet i AutoCAD (kun ezdxf) |
| P2 (RC-014, RC-015)         | Ikke i omfang                                                                                                                       |
| Testscenarier A–D (kap. 11) | Dekket av e2e; E (sporveksler/koblingsfeil) dekket av veksel- og koblingstester                                                     |
| Uavhengig kodegjennomgang   | 12 funn verifisert og rettet, hver med test                                                                                         |

### Tillegg etter sluttkontroll

- **Kryssende spor** (advarsel, ikke vurdert mot regelverk): `geometry-ts/intersect.ts`, `ConnectionsPanel.vue`, `docs/kryssing.md`. Tester: enhet `intersect.test.ts` (14) + store (3); e2e (2). Eksempelplanene gir 0 treff.

- **Sporkryss (brukerdefinert, ikke verifisert):** `domain` (`crossing`-objekt), `geometry-ts/crossing.ts`, `tools/crossing.ts`, DXF-lag `RAILCAD_SPORKRYSS`. Tester: enhet `crossing.test.ts` (4) + domene/DXF/store; e2e (3). Uten åpne norske produktmål er lengden brukerdefinert.

- **Brukerforbedringer (kopiér/lim inn, lås, lag, tittelendring)** og **DXF-bakgrunn:** speilede sirkler/polylinjer, PDF-sidevalg. Tester: store (4), DXF (3), domene (1), e2e (4+1).

- **Kryssveksel (enkel/dobbel) og sovitet sporkryss** (brukerdefinert/delvis verifisert): `geometry-ts/crossing.ts`, `scissors.ts`, `tools/scissors.ts`. Tester: enhet `scissors.test.ts` (7), kryssveksel (3+1), e2e (3).

- **Vekseleditor og bibliotek:** egne veksltyper (enkel, tresporsveksel, symmetrisk/dobbel; geometri eller hovedmål A–F), forhåndsinnstillinger for sporkryss/kryssveksel, bibliotekfil for deling, live forhåndsvisning. Alt «brukerdefinert – ikke verifisert». `domain/custom-turnouts.ts`, `library.ts`, `geometry-ts/turnout.ts` (ruter), `TurnoutEditor.vue`, `docs/vekseleditor.md`. Tester: enhet `custom-turnout.test.ts` (6) + `custom-turnouts.test.ts` (12); e2e (7).

- **3D-oversikt (RC-015 trinn 2):** skrivebeskyttet, `rendering/scene3d.ts` (punktrekker med kote), `rendering/three-scene.ts` (lazy), `View3D.vue`. Overdrevet høyde og «ikke vurdert mot regelverk» står i dialogen. Tester: enhet `scene3d.test.ts` (2), e2e (1). Ikke testet visuelt mot andre nettlesere enn Chromium.

- **Høyder (RC-015 trinn 1) og planskilt:** kote per port (delt via koblinger), stigning, lengdeprofil langs sporkjede, kote-konflikter, automatisk planskilt ut fra kote og en fri høyde du selv setter i prosjektinnstillingene. `geometry-ts/elevation.ts`, `ElevationFields.vue`, `ProfileChart.vue`. Tester: enhet (4+4+2), e2e (3).

### Kjente åpne punkter

- Sporkryss og kryssveksler mangler i biblioteket (ingen åpne måltabeller; se `docs/kryssing.md`, `docs/henvendelse-leverandor.md`).

- Sporveksler venter på KO-tegninger (se `docs/henvendelse-bane-nor.md`). Tangenttoleranse for koblinger er en foreløpig testverdi.
- Speilede sirkler/polylinjer (negativ ekstrusjon) i DXF-bakgrunn støttes ikke; bare buer.
- Ikke implementert: verifiserte mål for kryss/kryssveksel, høyder, 3D/profil/kjøretøykontroll (RC-015).
- Bare side 1 av PDF; ingen georeferering.

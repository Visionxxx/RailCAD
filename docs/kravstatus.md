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

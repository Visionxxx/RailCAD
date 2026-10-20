# Beslutninger

Beslutninger fra spesifikasjonen (kap. 14) og fra oppdragsgiver (utviklingsstart).

| #   | Beslutning                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Parallelle spor er **uavhengige kopier** med egen ID og geometri. Endring i referansen påvirker ikke kopien. Parametriske koblinger kommer i P1. |
| 2   | **Sporveksler utelates i MVP** (ingen illustrasjonssymboler). Kommer i P1 med eget bibliotek.                                                    |
| 3   | **Mål er permanente objekter.** Lengdemål knyttes til spor og oppdateres automatisk; frie mål har egne koordinater.                              |
| 4   | Kurver: startpunkt og starttangent er låst når radius/sveip endres; endepunkt beregnes. Venstre og høyre støttes.                                |
| 5   | **Ingen lagadministrasjon** i MVP (kommer med DXF i P1).                                                                                         |
| 6   | Git + Conventional Commits.                                                                                                                      |
| 7   | Playwright/Chromium og npm-pakker installeres lokalt.                                                                                            |

Tekniske valg tatt under utviklingen:

- **TypeScript 5.9** (ikke 7): `vue-tsc` støtter ikke TypeScript 7 ennå.
- **zod** for skjemavalidering ved import.
- **Angre/gjør om** lagrer `Patch` (før/etter) i stedet for kommando-objekter med egen undo-logikk; gir deterministisk reversering for alle redigeringer, inkl. endringer i egenskapspanelet. Grense 200 trinn (krav: ≥ 50).
- **Snap** velger høyest prioritet innenfor søkeradius: endepunkt > senter > tangent > nærmeste > rutenett. Rutenett-snap har samme radius som de andre (markøren er fri mellom rutenettpunkter).
- **Tangent-snap** = punkt på en bue der linjen fra forrige punkt tangerer buen. Kun aktiv med referansepunkt.
- **Buetegning med mus:** start → (tangentretning) → sluttpunkt; sirkelen er entydig bestemt av start, tangent og sluttpunkt. Fra et sporendepunkt hoppes tangentsteget over (tangentiell fortsettelse).
- **Pek-/grep-radius** (8–12 px) er visningsverdier, omregnet til meter ved bruk.
- **Standardverdi for sporavstand i parallellverktøyet (5 m) er kun en UI-startverdi**, ikke en faglig anbefaling.
- **Mål-forskyvning** avrundes til mm ved plassering med mus.
- **Skinnevisning:** sporvidde 1,435 m brukes kun til skjematisk tegning.

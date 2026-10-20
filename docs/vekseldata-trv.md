# Sporvekseldata fra TRV – kontrollert utlesing

**Kilde:** Bane NOR, Teknisk regelverk, [Overbygning/Prosjektering/Sporveksler](https://trv.banenor.no/wiki/Overbygning/Prosjektering/Sporveksler), «Hovedmål».
**Revisjon på siden:** «Fra Teknisk regelverk utgitt 18. mai 2026», sist redigert 5. aug. 2026 (oldid=141902).
**Enheter:** alle mål i mm. **Tegningene (KO-…) ligger i ProArc og er ikke lest.**

Tallene er hentet to ganger fra siden (to uavhengige utlesinger) og stemmer med tekst limt inn av oppdragsgiver. Siden er lest via et verktøy som flater ut tabellene, så _profilgruppering er utledet fra radrekkefølge_. **Må kontrolleres av et menneske mot siden før bruk i prosjektering.**

| Profil | Type       | Stigning / R | A     | B     | C     | D    | L     | E    | F    | Tegn.nr   |
| ------ | ---------- | ------------ | ----- | ----- | ----- | ---- | ----- | ---- | ---- | --------- |
| 54E3   | kort kurve | 1:9 R190     | 10523 | 16616 | 10523 | 6093 | 27139 | 3000 | 3575 | KO-701334 |
| 54E3   | EVF        | 1:9 R300     | 16616 | 16616 | 16616 | –    | 33231 | 3575 | 3000 | KO-701287 |
| 60E1   | EVF        | 1:9 R300     | 16615 | 16615 | 16615 | –    | 33230 | 5400 | 2350 | KO-701409 |
| 60E1   | EVF        | 1:12 R500    | 20797 | 21985 | 20797 | 1188 | 42783 | 7314 | 3600 | KO-800068 |
| 60E1   | EVB        | 1:9 R300     | 16615 | 19760 | 16615 | 3145 | 36375 | 4150 | –    | KO-800099 |
| 60E1   | EVB        | 1:12 R500    | 20797 | 23306 | 20797 | 2509 | 44103 | 5994 | –    | KO-800090 |

Merknad: KO-800068 er oppgitt både for 60E1 1:12 R500 og 1:11,66 R500 på siden («som trykt»).

## Interne kontroller (utført)

- `B = C + D` stemmer i alle rader (f.eks. 10523 + 6093 = 16616; 20797 + 1188 = 21985).
- `L ≈ A + B` stemmer (±1 mm avrunding), f.eks. 10523 + 16616 = 27139.
- `A = C = R · tan(α/2)` med `tan α = 1/n`: 1:9 R190 → 190 · 0,055385 = 10,523 m ✓; 1:9 R300 → 16,616 m ✓; 1:12 R500 → 20,80 m ✓. Dette bekrefter at avviksbuen starter i SS (tangent til stamsporet) og at A og C er tangentlengder til samme sirkel.

## Hva som IKKE er kjent fra TRV-teksten

Tungespiss relativt SS, skjøter, nøyaktig kryssgeometri og avviksbuens eksakte sluttpunkt mot BK. Akser avledet fra hovedmålene er derfor **delvis verifisert** og skal merkes slik, til KO-tegningene er innhentet.

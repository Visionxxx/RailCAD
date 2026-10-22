# Kilder, data og ansvarsfraskrivelse

## Ansvarsfraskrivelse

RailCAD er et **skisse- og geometriverktøy**, ikke et prosjekteringsverktøy. Ingenting i programmet er kontrollert mot regelverk (Bane NOR/TRV, Jernbanedirektoratet, EU-krav), og resultatene skal ikke brukes som underlag for bygging, sikkerhetsvurdering eller godkjenning uten uavhengig faglig kontroll. Programvaren leveres «som den er», uten garantier (se `LICENSE`).

## Data fra tredjeparter

- **Sporveksler (3 typer i biblioteket):** hovedmål (A–F, L) er lest fra Bane NORs Tekniske regelverk (TRV), «Overbygning/Prosjektering/Sporveksler» (revisjon 2026-05-18, oldid 141902) – se `docs/vekseldata-trv.md`. Tegningene (KO-…) er **ikke** lest, geometrien er avledet fra hovedmålene og merket «delvis verifisert». Rettighetene til kilden tilhører Bane NOR. Tallene er tatt med som faglige referanseverdier; hvis Bane NOR ønsker dem fjernet, gjøres det på forespørsel. Dette er ikke et offisielt Bane NOR-produkt og er ikke godkjent av dem.
- **Eksempelprosjektene** (`fixtures/`) er illustrasjoner. «illustrasjon» er ikke en faktisk anleggsgeometri.
- **Egne veksltyper, sporkryss, kryssveksler og sovitet sporkryss** er brukerdefinert og alltid merket «ikke verifisert».

## Programvare (kjøretid)

Vue, Pinia, Vite, zod, three.js (MIT), pdf.js (Apache-2.0), @tarikjabiri/dxf, dxf-parser. Se `package.json`/`package-lock.json` for versjoner og respektive lisenser.

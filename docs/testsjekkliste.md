# Sjekkliste: test med egne filer og eget CAD-program

Dette kan bare du gjøre (jeg har ikke tilgang til ditt CAD-program eller dine filer). Kryss av og noter avvik – send gjerne skjermbilder og filen som ga problemet.

## 1. DXF-eksport i ditt CAD-program

- [ ] Åpne et eksempel (Fil → Åpne avansert eksempel) og eksporter **R2007** og **R12** (Fil → Eksporter DXF).
- [ ] Åpne filene i ditt CAD-program. Åpner de uten feil/advarsler?
- [ ] Enhet er **meter**. Mål en kjent lengde (f.eks. et 140 m spor i eksempelprosjektet) – stemmer den?
- [ ] Lagene finnes: `RAILCAD_SPORAKSE`, `RAILCAD_SPORVEKSEL`, `RAILCAD_SPORKRYSS`, `RAILCAD_MAAL`, `RAILCAD_TEKST` (+ prosjektlag som `RAILCAD_SPORAKSE_<LAGNAVN>`).
- [ ] Buer er buer (ikke mange små linjer), og tekst er lesbar (æøå).
- [ ] Eksporter et prosjekt med **egen veksel** og **sporkryss** – står det «ikke verifisert» i teksten?
- Kjent: eksportert tekst, ikke DIMENSION-objekter. Verifisert så langt bare med ezdxf.

## 2. Bakgrunn

- [ ] Importer en av dine egne DXF-kart. Riktig enhet? (Programmet sier fra hvis enheten mangler.) Store koordinater (UTM) plasseres midt i visningen.
- [ ] Importer en PDF med flere sider (velg side) og et bilde (PNG/JPEG). Bruk «Skaler med to punkter» mot en kjent avstand.
- [ ] Lagre prosjektet, last siden på nytt, åpne filen – er bakgrunnen med?
- [ ] Filstørrelse: hvor stor blir prosjektfilen med bakgrunnen? (Grense ca. 10 MB per bilde.)

## 3. Lagring og sikkerhetskopi

- [ ] Tegn noe, last siden på nytt uten å lagre – tilbys gjenoppretting?
- [ ] Lagre, åpne på nytt: ser alt likt ut? Er «ulagret»-merket borte?
- [ ] Åpne en bevisst ødelagt fil (fjern en `}`) – kommer en forståelig feilmelding uten at prosjektet ditt endres?

## 4. Nettlesere

- [ ] Firefox og Safari/WebKit: start appen, tegn spor, åpne 3D-oversikten, eksporter DXF.
- [ ] 3D-oversikten på maskinen du faktisk skal bruke (WebGL, ytelse med ditt største anlegg).

## 5. Egne data

- [ ] Legg inn dine egne veksl- og kryssmål i Vekseleditor (Fil → Veksler og kryss) fra en kilde du stoler på, og noter kilden i «Kilde»-feltet.
- [ ] Kjøretøykontroll: sett dine kjøretøymål (Fil → Prosjektinnstillinger) og sammenlign utsving og nødvendig sporavstand med en håndberegning.
- [ ] Sammenlign et lite anlegg mot en kjent tegning – avvik i lengder/vinkler?

## 6. Ytelse

- [ ] Hvor mange spor/objekter har et typisk anlegg hos deg? (Testet med 5 000 spor; zoom ca. 20–50 ms per steg.)
- [ ] 3D-oversikt med ditt største anlegg: flyter dreiing og zoom?

## 7. Før noe brukes som underlag

- [ ] Skaff verifiserte vekselmål (KO-tegninger, leverandørdata) fra Bane NOR/leverandør.
- [ ] Avklar regelverkskrav (RC-014) og hvem som skal godkjenne. Programmet viser alltid «ikke vurdert mot regelverk».

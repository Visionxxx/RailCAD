# Kryssveksel og sovitet sporkryss

Begge er bygd uten åpne norske produktmål og er derfor **brukerdefinert / delvis verifisert**. Begrepene (RR, KRV/YRV, SRR) er hentet fra finsk praksis; ingen finske mål er brukt.

## Kryssveksel (YRV/KRV) – utvidelse av sporkrysset

Et `crossing`-objekt med `slip: { arcs, radiusM }`:

- Aksene A og B krysser i M med vinkel α = atan(1/n).
- Sirkelbuer med radius R kobler aksene inne i krysset. Tangentlengden fra M er **T = R·tan(α/2)**.
  - `ab`: starter på A i avstand T før M (tangent til A), svinger mot klokka α og slutter på B i avstand T etter M (tangent til B).
  - `ba`: starter på B før M, svinger med klokka α og slutter på A etter M.
  - `both` = dobbel kryssveksel (begge buene), ett av dem = enkel.
- Kravet `T ≤ lengden fra M til enden` kontrolleres ved opprettelse, redigering og åpning av fil.
- Geometrien er verifisert i tester (tangens og sluttpunkt på riktig akse, riktig retning).
- Ingen tungeoppbygning modelleres – bare akser. Lengde og radius angir du selv fra leverandørtegning.

## Sovitet sporkryss (SRR, «sporsløyfe»)

Et verktøy (_Sovitet sporkryss, S_) som oppretter **11 objekter og 12 koblinger som ett angretrinn**:

- 4 veksler fra biblioteket (valgt type, delvis verifisert), 1 midtkryss med vinkel **2α** (`ratioN = 1/tan(2α)`, brukerdefinert), 4 rette diagonaler (vinkel ±α) og 2 gjennomgående spor mellom vekslenes stamspor.
- Parametre: veksltype, **sporavstand** `s` (TRV nevner 4700 mm for sporsløyfe – startverdi, ikke krav) og midtkryssets halve lengde `h` (brukerdefinert). Plassering: M og retning (to klikk eller skjema).
- Geometri (lokalt, M i origo, spor i y = ∓s/2): vekselens avvik-ut D ligger i (x₁+lx, ly−s/2); diagonalen går gjennom M med retning α, så
  `x₁ = (ly − s/2)/tan α − lx` og diagonalens lengde `t = −h − D·(cos α, sin α) > 0`.
  Fire veksler ligger symmetrisk (180°-rotasjon og speiling om sporaksen).
- Feil rapporteres tydelig: for liten sporavstand (med **minste sporavstand** `2(ly + h·sin α)`) eller vekslene overlapper på samme spor.
- Fire ledige porter (stamspor inn på hver veksel) for å fortsette sporene.
- Kontrollert i tester for alle tre bibliotekstyper: alle 12 koblinger er eksakte (posisjon og tangent), rigid plassering/rotasjon, ingen uønskede kryssinger.

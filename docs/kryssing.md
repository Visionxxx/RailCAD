# Kryssende spor

I virkeligheten kan spor ikke krysse hverandre fritt:

- **Samme plan:** krever sporkryss (diamantkryss) eller kryssveksel – hjulflenser trenger skinnehull. En T-forbindelse (spor som ender på et annet) krever sporveksel.
- **Ulik høyde:** bro eller tunnel med fri høyde og avstander.
- Krysningsvinkelen er normalt standardisert (f.eks. 1:9, 1:12) og kryss forutsetter vanligvis rette spor og avstand til sporveksler/kurver. Eksakte krav må hentes fra TRV/EN 13232 – de er **ikke** implementert.

## Hva RailCAD gjør

Programmet markerer steder der akser fra **ulike objekter** (spor og sporveksler) møtes uten å være koblet ende mot ende:

| Type       | Betyr                                                                        |
| ---------- | ---------------------------------------------------------------------------- |
| `crossing` | Aksene krysser hverandre (med spiss krysningsvinkel)                         |
| `touch`    | Ett objekts ende ligger på et annet objekts akse (T-forbindelse uten veksel) |
| `overlap`  | Aksene ligger oppå hverandre over en strekning (f.eks. duplisert spor)       |

Ende mot ende regnes ikke (det er en mulig kobling – se Koblinger). Markering vises på tegneflaten (gult kryss), i fanen **Kontroll → Kryssende spor** (med «Vis») og i prosjektoversikten. Status er alltid **ikke vurdert** – programmet blokkerer ingenting og godkjenner ingenting.

**Planskilt:** Knappen bekrefter at kryssingen er bevisst (bro/tunnel). Bekreftelsen lagres i prosjektfilen (`acknowledgedCrossings`, objekt-ID-par) og kan angres. Høydegeometri finnes ikke i modellen ennå (P2).

## Kilder til kryss-/kryssvekseldata (søk 2026-10-20)

Ingen åpne måltabeller funnet:

- **Bane NOR TRV** har tegningsnumre for dobbel kryssveksel og sporsløyfe med sporkryss, men uten mål i teksten (se `henvendelse-bane-nor.md`).
- **EN 13232-2 / -9** (geometri for sporveksler og kryss) ligger bak betalingsmur (BSI/CEN/nasjonale standardorgan).
- **Trafikverket (SE)** publiserer definisjoner og vedlikeholdsregler, ikke geometritabeller i det jeg fant.
- **Väylävirasto (FI) RATO 4 «Vaihteet»** (lastet ned manuelt av deg, 2012-utgaven): har tegninger med hovedmål for sporkryss (RR), kryssveksler (KRV/YRV) og sovitettu sporkryss (SRR), men for **sporvidde 1524 mm** – ikke gyldig for norske forhold. Se `kilde-rato4.md`.
- **Leverandører** (Vossloh Cogifer, voestalpine Turnout Technology) har brosjyrer, men ingen offentlige CAD-/geometrifiler – se `henvendelse-leverandor.md`.

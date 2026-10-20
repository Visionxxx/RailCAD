# Kilde: Liikenneviraston ohjeita 22/2012 – RATO 4 «Vaihteet» (Finland)

Lest 2026-10-20 fra `lo_2012-22_rato_4_web.pdf` (66 sider, utgitt 14.12.2012, endret 2018). Sidehenvisninger = PDF-sider.

> **Forbehold:** Dette er **finsk** regelverk fra **2012** for **sporvidde 1524 mm** (s. 4.6.1: «suoran raiteen raideleveys on 1524 mm»). Måltallene er produkt- og sporviddeavhengige og er **ikke gyldige for norske forhold (1435 mm)**. Eksempel: finsk 54E1 1:9 har L2 = 17 223 mm, mens TRV (Bane NOR) har A = C = 16 616 mm for 54E3 1:9 R300. Må ikke brukes som verifisert norsk geometri. Mulig at nyere utgave finnes.

## Hva dokumentet gir oss (begreper og konvensjoner)

| Begrep          | Betyr (RATO 4, kap. 4.1.4)                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **YV**          | enkel sporveksel                                                                                                                                                                                        |
| **KV**          | dobbel sporveksel (to veksler etter hverandre, kaksoisvaihde)                                                                                                                                           |
| **TYV**         | tresporsveksel (symmetrisk, to like avvik)                                                                                                                                                              |
| **YRV / KRV**   | enkel / dobbel **kryssveksel** (risteysvaihde): sporkryss med to (YRV) eller fire (KRV) tungepar                                                                                                        |
| **RR**          | **sporkryss** (raideristeys): to spors krysning med fire kryss – to 2-spisser og to 1-spisser                                                                                                           |
| **SRR**         | **sovitettu raideristeys** (tilpasset sporkryss): fire veksler + kryss som kobler to nabospor med to kryssende forbindelser; normalutgave for **4800 mm** sporavstand. Krysset midt i har vinkel **2α** |
| **M**           | vekselens/krysset matematiske midtpunkt (skjæring av sporenes midtlinjer)                                                                                                                               |
| Krysningsvinkel | oppgis som forhold 1:n, `tan α = 1/n` (samme definisjon som i TRV)                                                                                                                                      |

## Hovedmål fra Liite 1 (s. 51–53), mm, finsk 1524 mm

| Type              | Mål (fra tegning)                                             |
| ----------------- | ------------------------------------------------------------- |
| RR54-1:9          | 17 223 på hver side av M (lengde 2 × 17 223); begge kryss 1:9 |
| RR54-2×1:9        | 11 154 på hver side av M; kryssvinkel 1:4,44 (= 2α)           |
| KRV/YRV54-200-1:9 | 17 223 (lange ender) og 7 432 (korte ender)                   |
| SRR54-2×1:9-4,8   | totalt 11 077 + 21 600 + 21 600 + 11 077, sporavstand 4800    |
| SRR60-2×1:9-4,8   | 16 615 + 21 600 + 21 600 + 16 615, sporavstand 4800           |

Konsistens: `tan(2α) = 2·(1/9)/(1 − 1/81) = 0,2250 = 1:4,44` ✓.

## Regler/anbefalinger som er nyttige som referanse

- 1:9 anbefales som grunnløsning for korte veksler i planlegging (s. 20).
- Hastighet over sporkryss: høyst 100 km/h (+10 %) (s. 22).
- Tegninger gir ikke fullstendige akser (radius for forbindelseskurver i KRV/SRR må utledes), og ingen krav om rette strekninger/avstand til nærmeste veksel er gitt i det jeg leste.

## Konsekvens for RailCAD

- Brukt: begrepene over (dokumentasjon) og visning av krysningsforhold `1:n` i kryssende-spor-listen (ren omregning av vinkelen).
- **Ikke lagt i biblioteket:** noe sporkryss/kryssveksel med finske mål. Alternativ: legg inn som tydelig merket _referanse – ikke gyldig for norske forhold_ hvis du ønsker det.
- Neste: be Bane NOR/leverandør om tilsvarende **1435 mm**-data for RR, KRV/YRV og SRR (utkast: `henvendelse-bane-nor.md`, `henvendelse-leverandor.md`).

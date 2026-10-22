# Vekseleditor og bibliotek

**Fil → Veksler og kryss (editor) …** lar deg definere egne veksltyper og forhåndsinnstillinger for sporkryss/kryssveksel med mål fra din egen kilde (leverandørtegning, spesifikasjon, intern standard).

> **Alt som lages her er «Brukerdefinert – ikke verifisert».** Programmet har ingen norske produktmål for kryss og kryssveksler, og kan ikke kontrollere dem. En veksel er i modellen en samling **akser** (sirkelbuer og rette linjer) – ikke produktgeometri (tunger, hjertestykker, svilleplan). Resultatet er skisse, ikke godkjent prosjektering.

## Veksltyper

En type består av et valgfritt **gjennomgående stamspor** og **1–2 grener**:

| Oppbygning                    | Stamspor | Grener                      | Porter                                                   |
| ----------------------------- | -------- | --------------------------- | -------------------------------------------------------- |
| Enkel veksel                  | ja       | 1                           | `stem_in`, `stem_out`, `diverging_out`                   |
| Tresporsveksel (symmetrisk/…) | ja       | 2 (typisk venstre og høyre) | `stem_in`, `stem_out`, `diverging_out`, `diverging2_out` |
| Symmetrisk/asymmetrisk dobbel | nei      | 2                           | `stem_in`, `diverging_out`, `diverging2_out`             |

Stokkskinneskjøten (SS) ligger i origo, stamsporet langs +X. Hver gren er en sirkelbue med radius **R** fra SS, tangent til stamsporet og dreid **α = atan(1/n)**, etterfulgt av et valgfritt **rett parti** langs buens sluttangent. Tangentlengden er T = R·tan(α/2).

To måter å oppgi mål:

- **Geometri:** forhold 1:n, radius, rett parti og stamsporlengde for hver gren.
- **Hovedmål A–F (som TRV-tabellene):** forhold 1:n, A/C (tangentlengde), B, D (rett parti), L (total lengde). Radius utledes som R = A / tan(α/2) (eller fra C), rett parti fra D og stamspor fra L. Målene kontrolleres mot hverandre (A ≈ C, B = C + D, L ≈ A + B, toleranse 2 mm), og avvik vises som advarsel. Dette er samme kontroller som er gjort på TRV-tabellene i biblioteket. Modusen gjelder én gren med stamspor.

Editoren viser en **live forhåndsvisning** (aksene, portene og portnavn) og feilmeldinger mens du skriver; lagring avvises ved ugyldige mål.

### Regler

- Typer lagres **i prosjektfilen** (`customTurnouts`) og følger prosjektet. Katalogtypene (TRV) er uendret og delvis verifisert.
- ID er `egen-001`, `egen-002` … og kan ikke endres. En type som brukes av veksel-objekter kan **ikke slettes**. Endrer du en type, følger alle objekter som bruker den med; en endring som fjerner en port som er **koblet**, avvises (fjern koblingen først).
- Endringer i typene (ny, endre, slett, import) er vanlige angretrinn.
- Veksel-verktøyet (T), egenskapspanelet, tegneflaten og DXF-eksporten merker egne typer «brukerdefinert – ikke verifisert». Sovitet sporkryss (S) kan bygges av enkle venstreveksler (stamspor og én gren mot venstre), også egne.
- Høyder: koten fordeles lineært langs hver rute (stamspor eller gren) fra `stem_in` til rutens utgående port.

## Sporkryss og kryssveksel – forhåndsinnstillinger

Fanen «Sporkryss og kryssveksel» lagrer navngitte kombinasjoner av krysningsforhold 1:n, lengde M→ende og eventuelt kryssvekselbuer (enkel A→B, B→A eller dobbel, med radius). De lagres i prosjektfilen (`crossingPresets`) og velges i kryss-verktøyet (X) under «Forhåndsinnstilling», som fyller skjemaet. Tangentlengden R·tan(α/2) kontrolleres mot lengden M→ende, som for vanlige kryssveksler.

## Bibliotekfil (deling)

**Fil → Eksporter vekselbibliotek …** lagrer egne typer og forhåndsinnstillinger som `<prosjekt>.bibliotek.json`:

```jsonc
{
  "format": "railcad-bibliotek",
  "version": 1,
  "turnouts": [/* CustomTurnoutType */],
  "crossingPresets": [/* … */],
}
```

**Fil → Importer vekselbibliotek …** validerer filen (struktur, tall og de samme reglene som i editoren; en prosjektfil avvises med forklaring) og slår den sammen med prosjektet i ett angretrinn:

- Identiske oppføringer (samme ID og innhold) hoppes over.
- Samme ID med **annet** innhold importeres med ny ID (`egen-001-2`); eksisterende oppføringer og objekter endres aldri.
- Importerte typer er **brukerdefinerte og ikke verifisert**, uansett hvem som har laget dem. Å dele en fil gjør den ikke verifisert.

Veksler i en åpnet prosjektfil som viser til en type som mangler i `customTurnouts`, avvises ved åpning (ukjent veksltype).

## Tester

Enhet: `packages/geometry-ts/tests/custom-turnout.test.ts` (geometri for enkel/symmetrisk/tre-spors, speiling, ruter og høyde), `packages/domain/tests/custom-turnouts.test.ts` (validering, utledning fra hovedmål, port-regler per type, bibliotek og sammenslåing). E2E: «vekseleditor …» (4), «forhåndsinnstillinger …», «bibliotek …», «DXF-eksport merker egen veksel …» i `tests/e2e/railcad.spec.ts`.

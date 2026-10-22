# Bidra til RailCAD

Takk for interessen! Prosjektet er på norsk (brukergrensesnitt, dokumentasjon og commit-meldinger kan være på norsk eller engelsk).

## Kom i gang

```bash
npm ci
npm run dev            # http://localhost:5173
npm test               # enhetstester
npx playwright install chromium && npm run test:e2e
npm run lint && npm run typecheck
```

## Retningslinjer

- **Ikke fremstill uverifisert som verifisert.** Alt som ikke er kontrollert mot kilde skal være merket («delvis verifisert», «brukerdefinert – ikke verifisert»). Nye data må ha kilde (dokument, revisjon, tegningsnummer).
- **Modell først:** geometri lagres i meter/radianer; skjermkoordinater finnes bare i `apps/web/src/rendering/` og pekerhendelser. Faggeometri regnes i `packages/geometry-ts` bak `GeometryEngine`-grensesnittet, ikke i Vue-komponenter.
- **Tester:** ny logikk skal ha enhetstest; nye brukerflyter bør ha e2e-test. Alle tester, lint og typecheck må være grønne (CI kjører dem).
- **Commits:** Conventional Commits (`feat(scope): …`, `fix: …`, `docs: …`).
- **Filformat:** endringer i prosjektfilen skal være additive, eller få en migrering i `packages/domain/src/migrate.ts`. Se `docs/filformat.md`.
- Hold PR-er små og fokuserte, og beskriv hva som er endret og hvordan det er testet.

## Verdifulle bidrag akkurat nå

Se «Hva som mangler» i README. Spesielt: kontrollerte vekselmål (med kilde), tilbakemelding fra bruk med ekte DXF/PDF-filer, test i Safari/WebKit og i ulike CAD-program.

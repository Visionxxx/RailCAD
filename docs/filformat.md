# Prosjektfilformat (`schemaVersion` 0.1.0)

JSON, lagret som `*.railcad.json`. Alle lengder i meter, alle vinkler i radianer, lokalt XY (X øst, Y nord, vinkel mot klokka fra +X).

```jsonc
{
  "schemaVersion": "0.1.0",
  "project": {
    "id": "…",
    "name": "…",
    "description": "valgfri",
    "units": "m",
    "coordinateSystem": { "type": "local_xy" },
  },
  "objects": [/* spor og mål, se under */],
  "connections": [], // { "a": {"objectId","port"}, "b": {…} }  port: spor = start|end, veksel = stem_in|stem_out|diverging_out|diverging2_out (portene avhenger av typen)
}
```

**Objekter** (diskriminert på `type`):

| `type`          | Felt                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| `track_segment` | `id`, `geometry` (diskriminert på `kind`)                                                                    |
| `dimension`     | `id`, `dimension`: `{kind:"length", targetId, offsetM}` eller `{kind:"distance", a:[x,y], b:[x,y], offsetM}` |

**Geometri:** `{kind:"line", start, headingRad, lengthM}` og `{kind:"arc", start, headingRad, signedRadiusM, sweepRad}`. Positiv radius = venstrekurve. `0 < sweepRad < 2π`. Buelengde = `|radius| · sweepRad`.

**Mål:** `offsetM` er sideforskyvning av målelinjen, positiv til venstre for sporets/linjens retning. Måltallet lagres ikke – det beregnes fra geometrien.

**Validering ved åpning** (`@railcad/domain` → `loadProject`): struktur og talltyper (zod), geometriske invarianter (positiv lengde, radius ≠ 0, sveip i (0, 2π)), unike ID-er, målreferanser og koblingsreferanser. Ukjente felt **bevares**; ukjent `schemaVersion` avvises med forklaring. Migreringer legges i `migrate.ts`.

**Bakgrunner** (valgfritt toppnivåfelt `backgrounds`, se `docs/bakgrunn.md`): `{kind:"dxf"|"image", id, name, visible, opacity, placement:{origin, scaleMPerUnit, rotationRad, scaleConfirmed}, …}`. Felt for DXF: `layers`, `prims`, `sourceUnits`, `extents`. Felt for bilde: `source`, `dataUrl`, `widthPx`, `heightPx`. Feltet er additivt – `schemaVersion` er uendret.

**Lås og lag** (valgfrie felt): `locked: true` på et objekt, `layerId` på et objekt og toppnivåfeltet `layers: [{id, name, visible, locked}]` (standardlaget har id `standard` og er implisitt – listen skrives bare når lagoppsettet avviker fra standard). Objekter på skjulte lag tegnes ikke og kan ikke velges eller snappes mot; låste objekter/lag kan ikke endres.

**Egne veksltyper og krysningsinnstillinger** (valgfrie toppnivåfelt, se `docs/vekseleditor.md`): `customTurnouts: [{id, name, stemLengthM|null, branches:[{hand, ratioN, radiusM, straightM}], inputMode, mainDimensionsMm?, source?, note?}]` og `crossingPresets: [{id, name, ratioN, halfLengthM, slip?:{arcs, radiusM}, note?}]`. Et veksel-objekt viser til en egen type med `turnout.catalogId` = typens `id`. Porter valideres per type (`diverging2_out` finnes bare med to grener, `stem_out` bare med stamspor). Feltene er additive – `schemaVersion` er uendret. Bibliotekfilen (`railcad-bibliotek`) er et eget format for deling.

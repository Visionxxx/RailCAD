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
  "connections": [], // topologi: { "a": {"objectId","port":"start|end"}, "b": {…} } – P1
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

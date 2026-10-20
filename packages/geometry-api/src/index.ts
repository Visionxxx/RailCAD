import type { Connection, DimensionSpec, PortName, TrackGeometry, Vec2 } from '@railcad/domain';

export type { Vec2, TrackGeometry } from '@railcad/domain';

/**
 * Eksplisitte toleranser per beregningskategori (spesifikasjon 5.5 og 12.1).
 * Ingen skjermpiksler her – piksler hører til visningslaget.
 */
export const TOLERANCES = Object.freeze({
  /** To punkter regnes som sammenfallende (koblinger, degenererte mål). Meter. */
  coincidentPointM: 1e-6,
  /** To retninger regnes som like. Radianer. */
  angleRad: 1e-9,
  /** Minste lengde et sporsegment kan opprettes med interaktivt. Meter. */
  minSegmentLengthM: 1e-6,
  /** Største radius som aksepteres ved interaktiv konstruksjon av buer (nær-rette linjer avvises). Meter. */
  maxInteractiveRadiusM: 1e5,
  /** Endepunkter i en kobling skal sammenfalle innenfor denne avstanden. Meter. */
  connectionPositionM: 1e-6,
  /**
   * Største tillatte vinkelavvik mellom tangentene i en kobling. Radianer.
   * FORELØPIG TESTVERDI – ikke faglig fastsatt. Må avklares mot gjeldende krav før bruk i prosjektering.
   */
  connectionTangentRad: 1e-6,
});

export interface Pose {
  point: Vec2;
  /** Radianer, mot klokka fra +X. */
  headingRad: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ClosestPoint {
  point: Vec2;
  /** Avstand langs sporet fra start, meter. */
  s: number;
  distanceM: number;
}

export type SnapKind = 'endpoint' | 'center' | 'tangent' | 'nearest' | 'grid';

export interface SnapResult {
  kind: SnapKind;
  point: Vec2;
  objectId?: string;
  distanceM: number;
}

export interface SnapQuery {
  cursor: Vec2;
  /** Søkeradius i verdenskoordinater (meter). Visningslaget omregner fra piksler. */
  toleranceM: number;
  kinds: readonly SnapKind[];
  /** Referansepunkt (forrige punkt) – kreves for tangent-snap. */
  reference?: Vec2;
  /** Rutenettavstand i meter, kreves for grid-snap. */
  gridStepM?: number;
  excludeIds?: ReadonlySet<string>;
}

export interface TrackRef {
  id: string;
  geometry: TrackGeometry;
}

export type ConnectionStatus = 'ok' | 'position' | 'tangent' | 'missing';

export interface PortRef {
  objectId: string;
  port: PortName;
}

export interface ConnectionResult {
  /** Posisjon i `connections`-listen. */
  index: number;
  connection: Connection;
  status: ConnectionStatus;
  /** Avstand mellom de to endepunktene, meter (NaN hvis et spor mangler). */
  distanceM: number;
  /** Vinkelavvik fra perfekt motsatt rettede tangenter, radianer (NaN hvis et spor mangler). */
  tangentDeviationRad: number;
  /** Midtpunkt mellom endepunktene – brukes til markering (null hvis et spor mangler). */
  at: Vec2 | null;
}

export interface PortPair {
  a: PortRef;
  b: PortRef;
  distanceM: number;
}

export interface DimensionLayout {
  /** Målt verdi i meter, beregnet fra modellen. */
  valueM: number;
  anchorA: Vec2;
  anchorB: Vec2;
  /** Målelinjen (rett eller buet). */
  line: TrackGeometry;
  /** Hjelpelinjer fra målpunkt til målelinje. */
  extensionLines: ReadonlyArray<readonly [Vec2, Vec2]>;
  labelPoint: Vec2;
  /** Lesbar tekstvinkel, i (-π/2, π/2]. */
  labelAngleRad: number;
}

/**
 * Stabilt grensesnitt mot faggeometrien. Implementeres i dag av `@railcad/geometry-ts`
 * og kan senere byttes ut med Rust/WebAssembly uten endringer i UI eller prosjektmodell.
 * Alle verdier er meter og radianer.
 */
export interface GeometryEngine {
  length(g: TrackGeometry): number;
  startPose(g: TrackGeometry): Pose;
  endPose(g: TrackGeometry): Pose;
  /** Pose i avstand s fra start (0 ≤ s ≤ lengde; utenfor klemmes). */
  poseAt(g: TrackGeometry, s: number): Pose;
  /** Endepunktets posisjon og UTGÅENDE retning (bort fra sporet): slutt = retning, start = retning + π. */
  portPose(g: TrackGeometry, port: PortName): Pose;
  closestPoint(g: TrackGeometry, p: Vec2): ClosestPoint;
  bounds(g: TrackGeometry): Bounds;
  /** Sentrum for buer; null for rette spor. */
  arcCenter(g: TrackGeometry): Vec2 | null;
  /** Parallellforskyvning. Positiv avstand = venstre side. Null hvis resultatet er ugyldig. */
  offset(g: TrackGeometry, signedDistanceM: number): TrackGeometry | null;
  /** Fortegnet sideavstand fra sporet til punktet (samme fortegnsregel som `offset`). */
  signedOffsetOf(g: TrackGeometry, p: Vec2): number;
  translate(g: TrackGeometry, dx: number, dy: number): TrackGeometry;
  rotate(g: TrackGeometry, pivot: Vec2, angleRad: number): TrackGeometry;
  /** Sirkelbue med gitt start og starttangent som går gjennom `end`. Null hvis ugyldig. */
  arcFromStartTangentEnd(start: Vec2, headingRad: number, end: Vec2): TrackGeometry | null;
  snap(tracks: Iterable<TrackRef>, query: SnapQuery): SnapResult | null;
  /** Kontrollerer hver kobling mot toleransene i TOLERANCES. Flytter aldri noe. */
  evaluateConnections(
    tracks: ReadonlyMap<string, TrackGeometry>,
    connections: readonly Connection[],
  ): ConnectionResult[];
  /** Ukoblede, sammenfallende endepunkter (forslag til nye koblinger). */
  findCoincidentFreePorts(
    tracks: ReadonlyMap<string, TrackGeometry>,
    connections: readonly Connection[],
  ): PortPair[];
  dimensionLayout(
    spec: DimensionSpec,
    resolveTarget: (id: string) => TrackGeometry | undefined,
  ): DimensionLayout | null;
}

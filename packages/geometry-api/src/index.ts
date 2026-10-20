import type {
  Connection,
  DimensionSpec,
  PortName,
  TrackGeometry,
  CrossingPlacement,
  CrossingPortName,
  TurnoutPlacement,
  TurnoutPortName,
  TurnoutType,
  Vec2,
} from '@railcad/domain';

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
  /** Avstand langs en akse for å regne et skjæringspunkt som «i enden» av aksen. Meter. */
  intersectionEndM: 1e-4,
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

/** Nøkkel for en port i portkartet: `<objektId>:<port>`. */
export const portKey = (objectId: string, port: PortName): string => `${objectId}:${port}`;

export interface TurnoutLayout {
  /** Aksene som rette/buede segmenter i prosjektkoordinater: stamspor, avviksbue og evt. rett avvik. */
  segments: TrackGeometry[];
  ports: Record<TurnoutPortName, Pose>;
}

export interface CrossingLayout {
  /** Spor A og spor B som rette akser gjennom M (prosjektkoordinater). */
  segments: TrackGeometry[];
  ports: Record<CrossingPortName, Pose>;
}

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

export type IntersectionKind = 'crossing' | 'touch' | 'overlap';

/** Et objekt (spor eller sporveksel) som akser: ett eller flere segmenter. */
export interface IntersectionItem {
  id: string;
  segments: readonly TrackGeometry[];
}

/**
 * Sted der to ulike objekters akser møtes uten å være koblet ende mot ende.
 * - `crossing`: aksene krysser hverandre (begge innvendig).
 * - `touch`: ett objekts ende ligger på et annet objekts akse (T-forbindelse uten veksel).
 * - `overlap`: aksene ligger oppå hverandre over en strekning.
 * Ende mot ende regnes ikke (det er en mulig kobling, ikke en kryssing).
 */
export interface Intersection {
  /** Objekt-ID-ene, sortert (a < b). */
  a: string;
  b: string;
  point: Vec2;
  kind: IntersectionKind;
  /** Spiss vinkel mellom aksenes tangenter, radianer (0 – π/2). 0 for overlapp. */
  angleRad: number;
  /** Lengde av overlappet, meter (kun `overlap`). */
  overlapM?: number;
  /** Ved `touch`: objektet hvis ende ligger på det andre. */
  endOf?: string;
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
  portPose(g: TrackGeometry, port: 'start' | 'end'): Pose;
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
    ports: ReadonlyMap<string, Pose>,
    connections: readonly Connection[],
  ): ConnectionResult[];
  /** Ukoblede, sammenfallende endepunkter (forslag til nye koblinger). */
  findCoincidentFreePorts(
    ports: ReadonlyMap<string, Pose>,
    connections: readonly Connection[],
  ): PortPair[];
  /** Sporkryss (diamantkryss): to rette akser som krysser i M med vinkel atan(1/n). */
  crossingLayout(placement: CrossingPlacement): CrossingLayout;
  /** Finner steder der akser fra ulike objekter krysser, berører eller overlapper hverandre. */
  findIntersections(items: readonly IntersectionItem[]): Intersection[];
  /**
   * Sporveksel fra biblioteket: akser og porter i prosjektkoordinater. Geometrien er avledet av
   * hovedmålene (se `TurnoutType`) og skal vises som delvis verifisert.
   */
  turnoutLayout(type: TurnoutType, placement: TurnoutPlacement): TurnoutLayout;
  dimensionLayout(
    spec: DimensionSpec,
    resolveTarget: (id: string) => TrackGeometry | undefined,
  ): DimensionLayout | null;
}

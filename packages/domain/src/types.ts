import type { Background } from './background';
/** Punkt i lokalt XY-system, meter. X mot øst, Y mot nord (matematisk orientering). */
export type Vec2 = readonly [number, number];

/**
 * Retning på alle spor er i radianer, mot klokka fra +X.
 * Positiv `signedRadiusM` = venstrekurve (sentrum til venstre for kjøreretningen),
 * negativ = høyrekurve.
 */
export interface LineGeometry {
  kind: 'line';
  start: Vec2;
  headingRad: number;
  lengthM: number;
}

export interface ArcGeometry {
  kind: 'arc';
  start: Vec2;
  headingRad: number;
  signedRadiusM: number;
  /** Alltid positiv, 0 < sweep < 2π. Buelengde = |radius| * sweep. */
  sweepRad: number;
}

export type TrackGeometry = LineGeometry | ArcGeometry;

export interface TrackSegment {
  id: string;
  type: 'track_segment';
  geometry: TrackGeometry;
}

/** Lengdemål knyttet til et sporobjekt. Måltallet beregnes alltid fra sporets geometri. */
export interface LengthDimension {
  kind: 'length';
  targetId: string;
  /** Sideforskyvning av målelinjen. Positiv = til venstre for sporets kjøreretning. */
  offsetM: number;
}

/** Fritt punkt-til-punkt-mål med egne koordinater. */
export interface DistanceDimension {
  kind: 'distance';
  a: Vec2;
  b: Vec2;
  /** Positiv = til venstre for retningen a → b. */
  offsetM: number;
}

export type DimensionSpec = LengthDimension | DistanceDimension;

export interface DimensionObject {
  id: string;
  type: 'dimension';
  dimension: DimensionSpec;
}

/**
 * Sporveksel plassert fra biblioteket. Geometrien lagres IKKE – den utledes av katalogoppføringen
 * (`catalogId`) og plasseringen. Plasseringspunktet er stokkskinneskjøten (SS) i stamsporet inn,
 * og `headingRad` er stamsporets retning.
 */
export interface TurnoutPlacement {
  catalogId: string;
  /** Katalogrevisjonen plasseringen ble gjort mot (sporbarhet). */
  catalogRevision: string;
  position: Vec2;
  headingRad: number;
  /** Retning avvikssporet tar sett fra stamsporet innover mot krysset. */
  hand: 'left' | 'right';
}

export interface TurnoutObject {
  id: string;
  type: 'turnout';
  turnout: TurnoutPlacement;
}

export type RailObject = TrackSegment | DimensionObject | TurnoutObject;

export type TrackPortName = 'start' | 'end';
/** Stamspor inn (SS), stamspor ut (bakkant), avvikende spor ut (bakkant). */
export type TurnoutPortName = 'stem_in' | 'stem_out' | 'diverging_out';
export type PortName = TrackPortName | TurnoutPortName;

export const TRACK_PORTS: readonly TrackPortName[] = ['start', 'end'];
export const TURNOUT_PORTS: readonly TurnoutPortName[] = ['stem_in', 'stem_out', 'diverging_out'];

/**
 * Eksplisitt topologisk kobling mellom to sporendepunkter.
 * MVP oppretter ingen koblinger (P1), men formatet validerer og bevarer dem.
 */
export interface Connection {
  a: { objectId: string; port: PortName };
  b: { objectId: string; port: PortName };
}

export interface ProjectMeta {
  id: string;
  name: string;
  description?: string;
  units: 'm';
  coordinateSystem: { type: 'local_xy' };
}

export interface RailProject {
  schemaVersion: string;
  project: ProjectMeta;
  objects: RailObject[];
  connections: Connection[];
  /** Referansebakgrunner (valgfri; mangler i eldre filer). */
  backgrounds?: Background[];
  /**
   * Kryssende spor brukeren har bekreftet som bevisst (f.eks. planskilt), som objekt-ID-par `a|b`
   * (sortert). Valgfritt felt.
   */
  acknowledgedCrossings?: string[];
}

export function isTrack(o: RailObject): o is TrackSegment {
  return o.type === 'track_segment';
}

export function isDimension(o: RailObject): o is DimensionObject {
  return o.type === 'dimension';
}

export function isTurnout(o: RailObject): o is TurnoutObject {
  return o.type === 'turnout';
}

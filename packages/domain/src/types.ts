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
  /** Låst objekt kan ikke flyttes, roteres, redigeres eller slettes før det låses opp. */
  locked?: boolean;
  /** Lag (se `ProjectLayer`). Mangler = standardlaget. */
  layerId?: string;
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
  /** Låst objekt kan ikke flyttes, roteres, redigeres eller slettes før det låses opp. */
  locked?: boolean;
  /** Lag (se `ProjectLayer`). Mangler = standardlaget. */
  layerId?: string;
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
  /** Låst objekt kan ikke flyttes, roteres, redigeres eller slettes før det låses opp. */
  locked?: boolean;
  /** Lag (se `ProjectLayer`). Mangler = standardlaget. */
  layerId?: string;
  type: 'turnout';
  turnout: TurnoutPlacement;
}

/**
 * Sporkryss (diamantkryss, RR): to rette akser som krysser hverandre i M. Geometrien er KUN
 * krysningsvinkelen og lengdene – produktmål (kryssets faktiske lengde) finnes ikke som åpne
 * norske data, så `halfLengthM` er brukerdefinert og objektet er alltid «ikke verifisert».
 */
export interface CrossingPlacement {
  /** Matematisk midtpunkt M (skjæringspunktet mellom aksene). */
  position: Vec2;
  /** Retning på spor A. Spor B ligger `atan(1/ratioN)` mot klokka fra A. */
  headingRad: number;
  /** n i krysningsforholdet 1:n (tan α = 1/n). */
  ratioN: number;
  /** Lengde fra M til hver ende av begge aksene, meter. */
  halfLengthM: number;
  /**
   * Kryssveksel (slip): sirkelbuer med radius R som kobler aksene inne i krysset. Tangentlengden
   * T = R·tan(α/2) fra M må ikke overstige `halfLengthM`.
   * `ab`: bue fra spor A (før M) over til spor B (etter M), svinger mot klokka (enkel kryssveksel).
   * `ba`: bue fra spor B (før M) over til spor A (etter M), svinger med klokka (enkel kryssveksel).
   * `both`: begge (dobbel kryssveksel).
   */
  slip?: { arcs: 'ab' | 'ba' | 'both'; radiusM: number };
}

export interface CrossingObject {
  id: string;
  /** Låst objekt kan ikke flyttes, roteres, redigeres eller slettes før det låses opp. */
  locked?: boolean;
  /** Lag (se `ProjectLayer`). Mangler = standardlaget. */
  layerId?: string;
  type: 'crossing';
  crossing: CrossingPlacement;
}

export type RailObject = TrackSegment | DimensionObject | TurnoutObject | CrossingObject;

export type TrackPortName = 'start' | 'end';
/** Stamspor inn (SS), stamspor ut (bakkant), avvikende spor ut (bakkant). */
export type TurnoutPortName = 'stem_in' | 'stem_out' | 'diverging_out';
/** Sporkryss: ender på spor A og spor B (A går i retning `headingRad`, B i retning `headingRad + α`). */
export type CrossingPortName = 'a_start' | 'a_end' | 'b_start' | 'b_end';
export type PortName = TrackPortName | TurnoutPortName | CrossingPortName;

export const TRACK_PORTS: readonly TrackPortName[] = ['start', 'end'];
export const TURNOUT_PORTS: readonly TurnoutPortName[] = ['stem_in', 'stem_out', 'diverging_out'];
export const CROSSING_PORTS: readonly CrossingPortName[] = ['a_start', 'a_end', 'b_start', 'b_end'];

/**
 * Eksplisitt topologisk kobling mellom to sporendepunkter.
 * MVP oppretter ingen koblinger (P1), men formatet validerer og bevarer dem.
 */
export interface Connection {
  a: { objectId: string; port: PortName };
  b: { objectId: string; port: PortName };
}

/** Laget alle objekter uten eksplisitt `layerId` ligger på. Finnes alltid. */
export const DEFAULT_LAYER_ID = 'standard';

export interface ProjectLayer {
  id: string;
  name: string;
  visible: boolean;
  /** Objekter på et låst lag kan ikke endres. */
  locked: boolean;
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
  /** Lag utover standardlaget (og evt. endringer i standardlagets synlighet/lås). Valgfritt. */
  layers?: ProjectLayer[];
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

export function isCrossing(o: RailObject): o is CrossingObject {
  return o.type === 'crossing';
}

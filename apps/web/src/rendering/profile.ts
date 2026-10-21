import { isCrossing, isTrack, isTurnout, type Connection, type RailObject } from '@railcad/domain';
import { portKey } from '@railcad/geometry-api';
import { cachedCrossingLayout } from './crossings';
import { cachedTurnoutLayout } from './turnouts';
import { geometryEngine as engine } from '../engine';

export interface ProfileSegment {
  objectId: string;
  /** Porten vi går inn i og ut av, i profilets retning. */
  enter: string;
  exit: string;
  lengthM: number;
  zStart: number | null;
  zEnd: number | null;
}

export interface Profile {
  segments: ProfileSegment[];
  /** Stasjon (m) ved starten av hvert segment, og total lengde til slutt. */
  stations: number[];
  totalM: number;
}

/** Porten på «andre siden» av et objekt (gjennomgående rute) – null der ruten ikke er entydig/gjennomgående. */
function otherPort(o: RailObject, port: string): string | null {
  if (isTrack(o)) return port === 'start' ? 'end' : port === 'end' ? 'start' : null;
  if (isTurnout(o)) {
    // Bare stamsporet følges (avvik følges ikke), og bare når vekselen har et gjennomgående stamspor.
    if (!cachedTurnoutLayout(o)?.ports.stem_out) return null;
    return port === 'stem_in' ? 'stem_out' : port === 'stem_out' ? 'stem_in' : null;
  }
  if (isCrossing(o)) {
    const m: Record<string, string> = {
      a_start: 'a_end',
      a_end: 'a_start',
      b_start: 'b_end',
      b_end: 'b_start',
    };
    return m[port] ?? null;
  }
  return null;
}

function routeLength(o: RailObject, enter: string): number {
  if (isTrack(o)) return engine.length(o.geometry);
  if (isTurnout(o)) {
    const layout = cachedTurnoutLayout(o);
    const stem = layout?.routes.find((r) => r.port === 'stem_out');
    return stem ? engine.length(layout!.segments[stem.segments[0]!]!) : 0;
  }
  if (isCrossing(o)) return 2 * o.crossing.halfLengthM * (enter.startsWith('a') ? 1 : 1);
  return 0;
}

/**
 * Lengdeprofil langs sporkjeden gjennom `startId`: følger koblinger gjennom spor, veksler (stamspor)
 * og sporkryss (rett igjennom) til kjeden ender, forgrener seg (avvik) eller danner en sløyfe.
 */
export function buildProfile(
  startId: string,
  byId: ReadonlyMap<string, RailObject>,
  connections: readonly Connection[],
  elevations: ReadonlyMap<string, number>,
): Profile | null {
  const start = byId.get(startId);
  if (!start || !isTrack(start)) return null;
  const partner = (id: string, port: string): { id: string; port: string } | null => {
    for (const c of connections) {
      if (c.a.objectId === id && c.a.port === port) return { id: c.b.objectId, port: c.b.port };
      if (c.b.objectId === id && c.b.port === port) return { id: c.a.objectId, port: c.a.port };
    }
    return null;
  };
  const segment = (o: RailObject, enter: string, exit: string): ProfileSegment => ({
    objectId: o.id,
    enter,
    exit,
    lengthM: routeLength(o, enter),
    zStart: elevations.get(portKey(o.id, enter as never)) ?? null,
    zEnd: elevations.get(portKey(o.id, exit as never)) ?? null,
  });
  const seen = new Set<string>([startId]);
  const forward: ProfileSegment[] = [];
  const backward: ProfileSegment[] = [];

  let cursor: { id: string; port: string } | null = partner(startId, 'end');
  while (cursor) {
    const o = byId.get(cursor.id);
    const exit = o ? otherPort(o, cursor.port) : null;
    if (!o || !exit || seen.has(o.id)) break;
    seen.add(o.id);
    forward.push(segment(o, cursor.port, exit));
    cursor = partner(o.id, exit);
  }
  cursor = partner(startId, 'start');
  while (cursor) {
    const o = byId.get(cursor.id);
    const enter = o ? otherPort(o, cursor.port) : null;
    if (!o || !enter || seen.has(o.id)) break;
    seen.add(o.id);
    backward.unshift(segment(o, enter, cursor.port));
    cursor = partner(o.id, enter);
  }
  const segments = [...backward, segment(start, 'start', 'end'), ...forward];
  const stations: number[] = [];
  let s = 0;
  for (const seg of segments) {
    stations.push(s);
    s += seg.lengthM;
  }
  void isCrossing;
  void cachedCrossingLayout;
  return { segments, stations, totalM: s };
}

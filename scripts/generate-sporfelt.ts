/**
 * Genererer fixtures/demo-sporfelt.json: et ILLUSTRATIVT sporfelt.
 * Ikke en faktisk anleggsgeometri og ikke regelverkskontrollert. Veksler er «delvis verifisert».
 *
 * Bruker geometrimotoren til å kjede objekter fra port til port, slik at alle koblinger er eksakte.
 *   npx tsx scripts/generate-sporfelt.ts
 */
import { writeFileSync } from 'node:fs';
import {
  TURNOUT_CATALOG_REVISION,
  createEmptyProject,
  getTurnoutType,
  nextId,
  serializeProject,
  loadProject,
  type Connection,
  type PortName,
  type RailObject,
  type TrackGeometry,
} from '@railcad/domain';
import { portKey, type Pose } from '@railcad/geometry-api';
import { geometryEngine as engine } from '@railcad/geometry-ts';

const SPACING_M = 5; // senteravstand mellom parallelle spor (illustrasjon)
const TURNOUT_ID = 'trv-60E1-1:9-R300-EVF';
const type = getTurnoutType(TURNOUT_ID)!;
const alpha = Math.atan(1 / type.ratioN);
const COUNTER_R = 300;

const objects: RailObject[] = [];
const connections: Connection[] = [];
const ids = () => objects.map((o) => o.id);

type Port = { objectId: string; port: PortName };
const ports = new Map<string, Pose>();

function addTrack(g: TrackGeometry, from?: Port): Port {
  const id = nextId('track', ids());
  objects.push({ id, type: 'track_segment', geometry: g });
  ports.set(portKey(id, 'start'), engine.portPose(g, 'start'));
  ports.set(portKey(id, 'end'), engine.portPose(g, 'end'));
  if (from) connections.push({ a: from, b: { objectId: id, port: 'start' } });
  return { objectId: id, port: 'end' };
}

function addTurnout(hand: 'left' | 'right', from: Port) {
  const pose = ports.get(portKey(from.objectId, from.port))!;
  const id = nextId('turnout', ids());
  const placement = {
    catalogId: type.catalogId,
    catalogRevision: TURNOUT_CATALOG_REVISION,
    position: pose.point,
    headingRad: pose.headingRad,
    hand,
  };
  objects.push({ id, type: 'turnout', turnout: placement });
  const layout = engine.turnoutLayout(type, placement);
  for (const [p, pp] of Object.entries(layout.ports)) ports.set(`${id}:${p}`, pp);
  connections.push({ a: from, b: { objectId: id, port: 'stem_in' } });
  return {
    stemOut: { objectId: id, port: 'stem_out' as const },
    divergingOut: { objectId: id, port: 'diverging_out' as const },
  };
}

const pose = (p: Port) => ports.get(portKey(p.objectId, p.port))!;
const line = (from: Pose, lengthM: number): TrackGeometry => ({
  kind: 'line',
  start: from.point,
  headingRad: from.headingRad,
  lengthM,
});
const arc = (from: Pose, signedRadiusM: number, sweepRad: number): TrackGeometry => ({
  kind: 'arc',
  start: from.point,
  headingRad: from.headingRad,
  signedRadiusM,
  sweepRad,
});
const along = (origin: Pose, p: Pose) =>
  (p.point[0] - origin.point[0]) * Math.cos(origin.headingRad) +
  (p.point[1] - origin.point[1]) * Math.sin(origin.headingRad);

// --- Innkjøring fra øst (retning vest) med rett strekning, venstrekurve og rett ---
const entryStart: Pose = { point: [900, 60], headingRad: Math.PI };
let tail = addTrack(line(entryStart, 150));
tail = addTrack(arc(pose(tail), -800, 0.14), tail);
tail = addTrack(line(pose(tail), 40), tail);
const axis = pose(tail); // yard-aksen: veksellesten følger denne retningen
const END_ALONG = 560; // alle spor ender i samme tverrlinje, målt langs aksen fra første veksel

// --- Veksellest: annenhver høyre/venstre, parallelle spor i SPACING_M (ytterst først) ---
const ladderStart = axis;
const SIDE_TRACKS = 4; // spor per side
const trackEnds: Array<{ side: 'left' | 'right'; n: number; port: Port }> = [];
for (let k = 0; k < 8; k++) {
  const hand = k % 2 === 0 ? 'right' : 'left';
  const t = addTurnout(hand, tail);
  tail = t.stemOut;
  // Første veksel fra innkjøringen leder til det ytterste sporet; da krysser ingen spor hverandre.
  const n = SIDE_TRACKS - Math.floor(k / 2);
  const sign = hand === 'left' ? 1 : -1;
  const target = SPACING_M * n;
  const drop = (1 - Math.cos(alpha)) * (type.radiusM + COUNTER_R);
  const ls = (target - drop) / Math.sin(alpha);
  let p: Port = addTrack(line(pose(t.divergingOut), ls), t.divergingOut);
  p = addTrack(arc(pose(p), -sign * COUNTER_R, alpha), p);
  const here = along(ladderStart, pose(p));
  p = addTrack(line(pose(p), END_ALONG - here), p);
  trackEnds.push({ side: hand, n, port: p });
}
// gjennomgående hovedspor
const mainHere = along(ladderStart, pose(tail));
const mainEnd = addTrack(line(pose(tail), END_ALONG - mainHere), tail);

// --- Mål: lengdemål på ett avvikende spor og sporavstand mellom endene på høyre side ---
objects.push({
  id: nextId('dim', ids()),
  type: 'dimension',
  dimension: { kind: 'length', targetId: mainEnd.objectId, offsetM: 8 },
});
const rights = trackEnds.filter((e) => e.side === 'right').sort((a, b) => a.n - b.n);
for (let i = 0; i + 1 < rights.length; i++) {
  const a = pose(rights[i]!.port).point;
  const b = pose(rights[i + 1]!.port).point;
  objects.push({
    id: nextId('dim', ids()),
    type: 'dimension',
    dimension: { kind: 'distance', a, b, offsetM: 6 },
  });
}

const project = createEmptyProject('Sporfelt (illustrasjon)');
project.project.id = 'demo-sporfelt-01';
project.project.description =
  'Illustrativt sporfelt inspirert av en stor sporgruppe med innkjøring fra øst og veksellest som åpner seg mot vest. ' +
  'IKKE en faktisk anleggsgeometri, og ikke regelverkskontrollert. Veksler (60E1 1:9 R300) er delvis verifisert: ' +
  'akser avledet fra TRV-hovedmål. Sporavstand 5 m er en illustrasjonsverdi.';
project.objects = objects;
project.connections = connections;

const checked = loadProject(JSON.parse(serializeProject(project)));
if (!checked.ok) throw new Error(`Ugyldig prosjekt:\n${checked.errors.join('\n')}`);
const bad = engine.evaluateConnections(ports, connections).filter((r) => r.status !== 'ok');
if (bad.length) throw new Error(`Koblingsavvik: ${JSON.stringify(bad.slice(0, 3))}`);

writeFileSync('fixtures/demo-sporfelt.json', serializeProject(project));
console.log(
  `Skrev fixtures/demo-sporfelt.json: ${objects.length} objekter, ${connections.length} koblinger, alle OK`,
);

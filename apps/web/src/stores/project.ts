import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import {
  createEmptyProject,
  type Background,
  isTrack,
  isTurnout,
  type Connection,
  type DimensionSpec,
  type ProjectMeta,
  type RailObject,
  type RailProject,
  type TrackGeometry,
  type TurnoutPlacement,
} from '@railcad/domain';
import {
  portKey,
  type IntersectionItem,
  type Pose,
  type PortRef,
  type TrackRef,
} from '@railcad/geometry-api';
import { applyPatch, type Patch } from '../commands/patch';
import {
  addBackgroundPatch,
  removeBackgroundPatch,
  updateBackgroundPatch,
  connectMany,
  toggleCrossingAckPatch,
  connectPorts,
  createDimension,
  createTrack,
  createTrackConnected,
  createTurnout,
  deleteObjects,
  disconnect,
  replaceObjects,
} from '../commands/builders';
import { geometryEngine as engine } from '../engine';
import { cachedTurnoutLayout } from '../rendering/turnouts';

/** Spesifikasjonen krever minst 50 reverserbare handlinger. */
export const HISTORY_LIMIT = 200;

export const useProjectStore = defineStore('project', () => {
  const meta = ref<ProjectMeta>(createEmptyProject().project);
  const objects = shallowRef<RailObject[]>([]);
  const connections = shallowRef<Connection[]>([]);
  const backgrounds = shallowRef<Background[]>([]);
  const crossingAcks = shallowRef<string[]>([]);
  const selection = shallowRef<string[]>([]);
  const undoStack = shallowRef<Patch[]>([]);
  const redoStack = shallowRef<Patch[]>([]);
  /** Økes ved hver modellendring (også angre/gjør om) – brukes til å utløse sikkerhetskopi. */
  const revision = ref(0);
  /**
   * «Ulagret» betyr at historikken ikke står på det lagrede punktet (eller navn/beskrivelse er endret).
   * Å angre tilbake til lagret tilstand gjør derfor prosjektet «lagret» igjen.
   */
  const savedMarker = shallowRef<unknown>(null);
  const metaRevision = ref(0);
  const savedMetaRevision = ref(0);
  /** Økes når historikken hopper (angre/gjør om/åpne) – åpne verktøy må da avbrytes. */
  const historyEpoch = ref(0);
  /** Økes når et helt prosjekt lastes – visningen bruker det til å tilpasse utsnittet. */
  const loadCount = ref(0);

  const byId = computed(() => new Map(objects.value.map((o) => [o.id, o] as const)));
  /** Alle akser som kan snappes mot: spor og sporvekslenes segmenter (`<id>#<n>`). */
  const trackRefs = computed<TrackRef[]>(() => {
    const out: TrackRef[] = [];
    for (const o of objects.value) {
      if (isTrack(o)) out.push({ id: o.id, geometry: o.geometry });
      else if (isTurnout(o)) {
        cachedTurnoutLayout(o)?.segments.forEach((g, i) =>
          out.push({ id: `${o.id}#${i}`, geometry: g }),
        );
      }
    }
    return out;
  });
  const selectedObjects = computed(() =>
    selection.value.map((id) => byId.value.get(id)).filter((o): o is RailObject => !!o),
  );
  const dirty = computed(
    () =>
      (undoStack.value.at(-1) ?? null) !== savedMarker.value ||
      metaRevision.value !== savedMetaRevision.value,
  );
  const canUndo = computed(() => undoStack.value.length > 0);
  const canRedo = computed(() => redoStack.value.length > 0);
  const lastUndoLabel = computed(() => undoStack.value.at(-1)?.label ?? '');
  const trackGeometries = computed(
    () => new Map(objects.value.filter(isTrack).map((o) => [o.id, o.geometry] as const)),
  );
  /** Alle porter (spor og sporvekslers) med posisjon og utgående retning. */
  const portPoses = computed(() => {
    const m = new Map<string, Pose>();
    for (const o of objects.value) {
      if (isTrack(o)) {
        for (const port of ['start', 'end'] as const) {
          m.set(portKey(o.id, port), engine.portPose(o.geometry, port));
        }
      } else if (isTurnout(o)) {
        const layout = cachedTurnoutLayout(o);
        if (layout) {
          for (const [port, pose] of Object.entries(layout.ports)) {
            m.set(`${o.id}:${port}`, pose);
          }
        }
      }
    }
    return m;
  });
  /** Porter som ikke inngår i noen kobling, med utgående retning. */
  const freePorts = computed(() => {
    const used = new Set(
      connections.value.flatMap((c) => [
        portKey(c.a.objectId, c.a.port),
        portKey(c.b.objectId, c.b.port),
      ]),
    );
    const out: Array<PortRef & { point: readonly [number, number]; headingRad: number }> = [];
    for (const [key, pose] of portPoses.value) {
      if (used.has(key)) continue;
      const split = key.lastIndexOf(':');
      out.push({
        objectId: key.slice(0, split),
        port: key.slice(split + 1) as PortRef['port'],
        point: pose.point,
        headingRad: pose.headingRad,
      });
    }
    return out;
  });
  /** Kontroll av alle koblinger mot toleransene – gjøres på nytt ved hver modellendring. */
  const connectionResults = computed(() =>
    engine.evaluateConnections(portPoses.value, connections.value),
  );
  const connectionSuggestions = computed(() =>
    engine.findCoincidentFreePorts(portPoses.value, connections.value),
  );
  /** Steder der akser fra ulike objekter krysser, berører eller overlapper (ikke vurdert mot regelverk). */
  const intersections = computed(() => {
    const items: IntersectionItem[] = [];
    for (const o of objects.value) {
      if (isTrack(o)) items.push({ id: o.id, segments: [o.geometry] });
      else if (isTurnout(o)) {
        const layout = cachedTurnoutLayout(o);
        if (layout) items.push({ id: o.id, segments: layout.segments });
      }
    }
    return engine.findIntersections(items);
  });
  const crossingIssues = computed(() =>
    intersections.value.map((x) => ({
      ...x,
      key: `${x.a}|${x.b}`,
      acknowledged: crossingAcks.value.includes(`${x.a}|${x.b}`),
    })),
  );
  const openCrossingCount = computed(
    () => crossingIssues.value.filter((x) => !x.acknowledged).length,
  );
  /** Bekreftelser som fortsatt gjelder to eksisterende objekter. */
  function liveAcks(): string[] {
    return crossingAcks.value.filter((k) => k.split('|').every((id) => byId.value.has(id)));
  }
  const lastRedoLabel = computed(() => redoStack.value.at(-1)?.label ?? '');

  function pruneSelection() {
    const kept = selection.value.filter((id) => byId.value.has(id));
    if (kept.length !== selection.value.length) selection.value = kept;
  }

  function commit(next: {
    objects: RailObject[];
    connections: Connection[];
    backgrounds: Background[];
    crossingAcks: string[];
  }) {
    objects.value = next.objects;
    connections.value = next.connections;
    backgrounds.value = next.backgrounds;
    crossingAcks.value = next.crossingAcks;
    revision.value++;
    pruneSelection();
  }

  /** Utfører en redigering og legger den på angre-stakken. */
  function execute(patch: Patch | null): boolean {
    if (!patch) return false;
    commit(
      applyPatch(
        {
          objects: objects.value,
          connections: connections.value,
          backgrounds: backgrounds.value,
          crossingAcks: crossingAcks.value,
        },
        patch,
        'do',
      ),
    );
    undoStack.value = [...undoStack.value, patch].slice(-HISTORY_LIMIT);
    redoStack.value = [];
    return true;
  }

  function undo() {
    const patch = undoStack.value.at(-1);
    if (!patch) return;
    commit(
      applyPatch(
        {
          objects: objects.value,
          connections: connections.value,
          backgrounds: backgrounds.value,
          crossingAcks: crossingAcks.value,
        },
        patch,
        'undo',
      ),
    );
    undoStack.value = undoStack.value.slice(0, -1);
    redoStack.value = [...redoStack.value, patch];
    historyEpoch.value++;
  }

  function redo() {
    const patch = redoStack.value.at(-1);
    if (!patch) return;
    commit(
      applyPatch(
        {
          objects: objects.value,
          connections: connections.value,
          backgrounds: backgrounds.value,
          crossingAcks: crossingAcks.value,
        },
        patch,
        'do',
      ),
    );
    redoStack.value = redoStack.value.slice(0, -1);
    undoStack.value = [...undoStack.value, patch];
    historyEpoch.value++;
  }

  function select(ids: string[]) {
    selection.value = ids;
  }
  function toggleSelect(id: string) {
    selection.value = selection.value.includes(id)
      ? selection.value.filter((x) => x !== id)
      : [...selection.value, id];
  }

  function addTrack(geometry: TrackGeometry): string {
    const { patch, id } = createTrack(objects.value, geometry);
    execute(patch);
    selection.value = [id];
    return id;
  }

  function addDimension(spec: DimensionSpec): string {
    const { patch, id } = createDimension(objects.value, spec);
    execute(patch);
    selection.value = [id];
    return id;
  }

  function connect(a: PortRef, b: PortRef): boolean {
    return execute(connectPorts(connections.value, a, b));
  }
  /** Kobler flere par som én angrebar handling. Returnerer antall koblede par. */
  function connectAll(pairs: Array<{ a: PortRef; b: PortRef }>): number {
    const { patch, connected } = connectMany(connections.value, pairs);
    execute(patch);
    return connected;
  }
  function toggleCrossingAck(key: string) {
    return execute(toggleCrossingAckPatch(crossingAcks.value, key));
  }
  function removeConnection(index: number): boolean {
    return execute(disconnect(connections.value, index));
  }
  /** Nytt spor fra en eksisterende port; sporet og koblingen angres samlet. */
  function addTrackFromPort(geometry: TrackGeometry, anchor: PortRef): string {
    const { patch, id } = createTrackConnected(objects.value, connections.value, geometry, anchor);
    execute(patch);
    selection.value = [id];
    return id;
  }

  function addTurnout(placement: TurnoutPlacement, anchor?: PortRef): string {
    const { patch, id } = createTurnout(objects.value, connections.value, placement, anchor);
    execute(patch);
    selection.value = [id];
    return id;
  }

  function addBackground(bg: Background): string {
    execute(addBackgroundPatch(backgrounds.value, bg));
    return bg.id;
  }
  function updateBackground(id: string, change: (b: Background) => Background, label: string) {
    return execute(updateBackgroundPatch(backgrounds.value, id, change, label));
  }
  function removeBackground(id: string) {
    return execute(removeBackgroundPatch(backgrounds.value, id));
  }

  function updateObject(next: RailObject, label: string): boolean {
    return execute(replaceObjects(objects.value, new Map([[next.id, next]]), label));
  }

  function deleteSelection(): boolean {
    return deleteIds(selection.value);
  }
  function deleteIds(ids: string[]): boolean {
    return execute(deleteObjects(objects.value, connections.value, ids));
  }

  function updateMeta(patch: Partial<Pick<ProjectMeta, 'name' | 'description'>>) {
    meta.value = { ...meta.value, ...patch };
    metaRevision.value++;
    revision.value++;
  }

  function load(project: RailProject) {
    meta.value = project.project;
    objects.value = project.objects;
    connections.value = project.connections;
    backgrounds.value = project.backgrounds ?? [];
    crossingAcks.value = project.acknowledgedCrossings ?? [];
    selection.value = [];
    undoStack.value = [];
    redoStack.value = [];
    revision.value = 0;
    savedMarker.value = null;
    metaRevision.value = 0;
    savedMetaRevision.value = 0;
    historyEpoch.value++;
    loadCount.value++;
  }

  function reset() {
    load(createEmptyProject());
  }

  function toProject(): RailProject {
    return {
      schemaVersion: '0.1.0',
      project: { ...meta.value },
      objects: [...objects.value],
      connections: [...connections.value],
      // Valgfritt felt: utelates når det ikke finnes bakgrunner (filene forblir like som før).
      ...(backgrounds.value.length ? { backgrounds: [...backgrounds.value] } : {}),
      ...(liveAcks().length ? { acknowledgedCrossings: liveAcks() } : {}),
    };
  }

  /** Markerer prosjektet som endret (f.eks. etter gjenoppretting av en sikkerhetskopi). */
  function touch() {
    savedMarker.value = {}; // et punkt som aldri tilsvarer en historikkpost ⇒ ulagret
    revision.value++;
  }

  function markSaved() {
    savedMarker.value = undoStack.value.at(-1) ?? null;
    savedMetaRevision.value = metaRevision.value;
    revision.value++; // utløser opprydding av sikkerhetskopien
  }

  return {
    meta,
    objects,
    connections,
    backgrounds,
    selection,
    revision,
    historyEpoch,
    loadCount,
    byId,
    trackRefs,
    trackGeometries,
    portPoses,
    freePorts,
    connectionResults,
    connectionSuggestions,
    intersections,
    crossingIssues,
    openCrossingCount,
    crossingAcks,
    toggleCrossingAck,
    selectedObjects,
    dirty,
    canUndo,
    canRedo,
    lastUndoLabel,
    lastRedoLabel,
    execute,
    undo,
    redo,
    select,
    toggleSelect,
    addTrack,
    addDimension,
    updateObject,
    connect,
    connectAll,
    removeConnection,
    addTrackFromPort,
    addTurnout,
    addBackground,
    updateBackground,
    removeBackground,
    deleteSelection,
    deleteIds,
    updateMeta,
    load,
    reset,
    toProject,
    markSaved,
    touch,
  };
});

import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import {
  createEmptyProject,
  DEFAULT_LAYER_ID,
  nextId,
  type ProjectLayer,
  type Background,
  isTrack,
  isTurnout,
  isCrossing,
  type CrossingPlacement,
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
  addLayerPatch,
  copyObjects,
  pasteObjects,
  removeLayerPatch,
  setLayerPatch,
  setLockedPatch,
  updateLayerPatch,
  type Clipboard,
  removeBackgroundPatch,
  updateBackgroundPatch,
  connectMany,
  toggleCrossingAckPatch,
  connectPorts,
  createDimension,
  createTrack,
  createCrossing,
  createTrackConnected,
  createTurnout,
  deleteObjects,
  disconnect,
  replaceObjects,
} from '../commands/builders';
import { geometryEngine as engine } from '../engine';
import { useUiStore } from './ui';
import { cachedCrossingLayout } from '../rendering/crossings';
import { objectBounds } from '../rendering/objectBounds';
import { cachedTurnoutLayout } from '../rendering/turnouts';

/** Spesifikasjonen krever minst 50 reverserbare handlinger. */
export const HISTORY_LIMIT = 200;

const defaultLayer = (): ProjectLayer => ({
  id: DEFAULT_LAYER_ID,
  name: 'Standard',
  visible: true,
  locked: false,
});

/** Sørger for at standardlaget finnes (først i listen). */
function normalizeLayers(list: readonly ProjectLayer[] | undefined): ProjectLayer[] {
  const rest = (list ?? []).filter((l) => l.id !== DEFAULT_LAYER_ID);
  const def = (list ?? []).find((l) => l.id === DEFAULT_LAYER_ID) ?? defaultLayer();
  return [def, ...rest];
}

export const useProjectStore = defineStore('project', () => {
  const meta = ref<ProjectMeta>(createEmptyProject().project);
  const objects = shallowRef<RailObject[]>([]);
  const connections = shallowRef<Connection[]>([]);
  const backgrounds = shallowRef<Background[]>([]);
  const crossingAcks = shallowRef<string[]>([]);
  const layers = shallowRef<ProjectLayer[]>([defaultLayer()]);
  /** Nye objekter legges på dette laget. */
  const activeLayerId = ref(DEFAULT_LAYER_ID);
  const clipboard = shallowRef<Clipboard | null>(null);
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
  const layerById = computed(() => new Map(layers.value.map((l) => [l.id, l] as const)));
  /** Objekter på skjulte lag: ikke tegnet, ikke valgbare, ikke snappbare. */
  const hiddenIds = computed(
    () =>
      new Set(
        objects.value
          .filter((o) => layerById.value.get(o.layerId ?? DEFAULT_LAYER_ID)?.visible === false)
          .map((o) => o.id),
      ),
  );
  /** Objekter som ikke kan endres: egen lås eller låst lag. */
  const lockedIds = computed(
    () =>
      new Set(
        objects.value
          .filter(
            (o) => o.locked || layerById.value.get(o.layerId ?? DEFAULT_LAYER_ID)?.locked === true,
          )
          .map((o) => o.id),
      ),
  );
  /** Objekter som kan velges/plukkes (ikke på skjulte lag). */
  const visibleObjects = computed(() =>
    hiddenIds.value.size ? objects.value.filter((o) => !hiddenIds.value.has(o.id)) : objects.value,
  );
  /** Alle akser som kan snappes mot: spor og sporvekslenes segmenter (`<id>#<n>`). */
  const trackRefs = computed<TrackRef[]>(() => {
    const out: TrackRef[] = [];
    for (const o of visibleObjects.value) {
      if (isTrack(o)) out.push({ id: o.id, geometry: o.geometry });
      else if (isTurnout(o)) {
        cachedTurnoutLayout(o)?.segments.forEach((g, i) =>
          out.push({ id: `${o.id}#${i}`, geometry: g }),
        );
      } else if (isCrossing(o)) {
        cachedCrossingLayout(o).segments.forEach((g, i) =>
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
      } else if (isCrossing(o)) {
        for (const [port, pose] of Object.entries(cachedCrossingLayout(o).ports)) {
          m.set(`${o.id}:${port}`, pose);
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
      } else if (isCrossing(o))
        items.push({ id: o.id, segments: cachedCrossingLayout(o).segments });
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
  /** Skrives bare i filen når lagene avviker fra standardoppsettet (en synlig, ulåst «Standard»). */
  function layersCustomised(): boolean {
    const d = layers.value[0];
    return layers.value.length > 1 || !d || !d.visible || d.locked || d.name !== 'Standard';
  }
  /** Bekreftelser som fortsatt gjelder to eksisterende objekter. */
  function liveAcks(): string[] {
    return crossingAcks.value.filter((k) => k.split('|').every((id) => byId.value.has(id)));
  }
  const lastRedoLabel = computed(() => redoStack.value.at(-1)?.label ?? '');

  function pruneSelection() {
    const kept = selection.value.filter((id) => byId.value.has(id) && !hiddenIds.value.has(id));
    if (kept.length !== selection.value.length) selection.value = kept;
  }

  function commit(next: {
    objects: RailObject[];
    connections: Connection[];
    backgrounds: Background[];
    crossingAcks: string[];
    layers: ProjectLayer[];
  }) {
    objects.value = next.objects;
    connections.value = next.connections;
    backgrounds.value = next.backgrounds;
    crossingAcks.value = next.crossingAcks;
    layers.value = next.layers;
    if (!layers.value.some((l) => l.id === activeLayerId.value))
      activeLayerId.value = DEFAULT_LAYER_ID;
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
          layers: layers.value,
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
          layers: layers.value,
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
          layers: layers.value,
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

  /** Nye objekter havner på det aktive laget. */
  function onActiveLayer(patch: Patch): Patch {
    if (activeLayerId.value === DEFAULT_LAYER_ID) return patch;
    for (const e of Object.values(patch.objects)) {
      if (e.before === null && e.after && !e.after.layerId) {
        e.after = { ...e.after, layerId: activeLayerId.value } as RailObject;
      }
    }
    return patch;
  }

  function addTrack(geometry: TrackGeometry): string {
    const { patch, id } = createTrack(objects.value, geometry);
    execute(onActiveLayer(patch));
    selection.value = [id];
    return id;
  }

  function addDimension(spec: DimensionSpec): string {
    const { patch, id } = createDimension(objects.value, spec);
    execute(onActiveLayer(patch));
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
    execute(onActiveLayer(patch));
    selection.value = [id];
    return id;
  }

  function addTurnout(placement: TurnoutPlacement, anchor?: PortRef): string {
    const { patch, id } = createTurnout(objects.value, connections.value, placement, anchor);
    execute(onActiveLayer(patch));
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

  function addCrossing(placement: CrossingPlacement, anchor?: PortRef): string {
    const { patch, id } = createCrossing(objects.value, connections.value, placement, anchor);
    execute(onActiveLayer(patch));
    selection.value = [id];
    return id;
  }

  function updateObject(next: RailObject, label: string): boolean {
    return execute(replaceObjects(objects.value, new Map([[next.id, next]]), label));
  }

  function deleteSelection(): boolean {
    return deleteIds(selection.value);
  }
  function deleteIds(ids: string[]): boolean {
    const locked = ids.filter((id) => lockedIds.value.has(id)).length;
    const done = execute(deleteObjects(objects.value, connections.value, ids, lockedIds.value));
    if (locked) {
      useUiStore().notify(
        done
          ? `${locked} låste objekter ble ikke slettet.`
          : locked === 1
            ? 'Objektet er låst og kan ikke slettes. Lås det opp først.'
            : 'Objektene er låst og kan ikke slettes. Lås dem opp først.',
        'error',
      );
    }
    return done;
  }

  /** Låser/låser opp objekter (egen lås – laget påvirkes ikke). */
  function setLocked(ids: string[], locked: boolean): boolean {
    return execute(setLockedPatch(objects.value, new Set(ids), locked));
  }

  function addLayer(name: string): string | null {
    const clean = name.trim().slice(0, 60);
    if (!clean) return null;
    const id = nextId(
      'lag',
      layers.value.map((l) => l.id),
    );
    execute(addLayerPatch(layers.value, { id, name: clean, visible: true, locked: false }));
    activeLayerId.value = id;
    return id;
  }
  function updateLayer(id: string, change: (l: ProjectLayer) => ProjectLayer, label: string) {
    const ok = execute(updateLayerPatch(layers.value, id, change, label));
    pruneSelection(); // objekter på et lag som skjules kan ikke lenger være valgt
    return ok;
  }
  function removeLayer(id: string): boolean {
    const ok = execute(removeLayerPatch(layers.value, objects.value, id));
    if (activeLayerId.value === id) activeLayerId.value = DEFAULT_LAYER_ID;
    return ok;
  }
  /** Flytter objekter til et lag. Låste objekter flyttes ikke. */
  function setLayerFor(ids: string[], layerId: string): boolean {
    return execute(setLayerPatch(objects.value, new Set(ids), layerId, lockedIds.value));
  }

  /** Kopierer valgte objekter (og koblinger mellom dem) til utklippstavlen i programmet. */
  function copySelection(): number {
    const clip = copyObjects(objects.value, connections.value, new Set(selection.value));
    clipboard.value = clip;
    return clip?.objects.length ?? 0;
  }
  /**
   * Limer inn utklippet slik at midten av objektene havner i `at` (verdenskoordinat), ellers
   * forskjøvet 5 m. Nye ID-er; koblinger mellom de limte objektene bevares.
   */
  function pasteClipboard(at?: readonly [number, number]): string[] {
    const clip = clipboard.value;
    if (!clip) return [];
    let delta: [number, number] = [5, 5];
    if (at) {
      const pts: number[][] = [];
      for (const o of clip.objects) {
        const b = objectBounds(o);
        if (b) pts.push([b.minX, b.minY, b.maxX, b.maxY]);
      }
      if (pts.length) {
        const cx =
          (Math.min(...pts.map((p) => p[0] as number)) +
            Math.max(...pts.map((p) => p[2] as number))) /
          2;
        const cy =
          (Math.min(...pts.map((p) => p[1] as number)) +
            Math.max(...pts.map((p) => p[3] as number))) /
          2;
        delta = [at[0] - cx, at[1] - cy];
      }
    }
    const { patch, ids } = pasteObjects(
      objects.value,
      connections.value,
      clip,
      delta,
      engine,
      (o) => {
        const original = o.layerId ?? DEFAULT_LAYER_ID;
        const target = layerById.value.get(original);
        return target ? original : activeLayerId.value;
      },
    );
    if (execute(patch)) selection.value = ids;
    return ids;
  }
  function duplicateSelection(): string[] {
    if (!copySelection()) return [];
    return pasteClipboard();
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
    layers.value = normalizeLayers(project.layers);
    activeLayerId.value = DEFAULT_LAYER_ID;
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
      ...(layersCustomised() ? { layers: [...layers.value] } : {}),
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
    layers,
    activeLayerId,
    layerById,
    hiddenIds,
    lockedIds,
    visibleObjects,
    clipboard,
    setLocked,
    addLayer,
    updateLayer,
    removeLayer,
    setLayerFor,
    copySelection,
    pasteClipboard,
    duplicateSelection,
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
    addCrossing,
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

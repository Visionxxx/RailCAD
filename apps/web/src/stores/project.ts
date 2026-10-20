import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import {
  createEmptyProject,
  isTrack,
  type Connection,
  type DimensionSpec,
  type ProjectMeta,
  type RailObject,
  type RailProject,
  type TrackGeometry,
} from '@railcad/domain';
import type { PortRef, TrackRef } from '@railcad/geometry-api';
import { applyPatch, type Patch } from '../commands/patch';
import {
  connectPorts,
  createDimension,
  createTrack,
  createTrackConnected,
  deleteObjects,
  disconnect,
  replaceObjects,
} from '../commands/builders';
import { geometryEngine as engine } from '../engine';

/** Spesifikasjonen krever minst 50 reverserbare handlinger. */
export const HISTORY_LIMIT = 200;

export const useProjectStore = defineStore('project', () => {
  const meta = ref<ProjectMeta>(createEmptyProject().project);
  const objects = shallowRef<RailObject[]>([]);
  const connections = shallowRef<Connection[]>([]);
  const selection = shallowRef<string[]>([]);
  const undoStack = shallowRef<Patch[]>([]);
  const redoStack = shallowRef<Patch[]>([]);
  /** Økes ved hver modellendring; `savedRevision` markerer sist lagrede tilstand. */
  const revision = ref(0);
  const savedRevision = ref(0);
  /** Økes når et helt prosjekt lastes – visningen bruker det til å tilpasse utsnittet. */
  const loadCount = ref(0);

  const byId = computed(() => new Map(objects.value.map((o) => [o.id, o] as const)));
  const trackRefs = computed<TrackRef[]>(() =>
    objects.value.filter(isTrack).map((o) => ({ id: o.id, geometry: o.geometry })),
  );
  const selectedObjects = computed(() =>
    selection.value.map((id) => byId.value.get(id)).filter((o): o is RailObject => !!o),
  );
  const dirty = computed(() => revision.value !== savedRevision.value);
  const canUndo = computed(() => undoStack.value.length > 0);
  const canRedo = computed(() => redoStack.value.length > 0);
  const lastUndoLabel = computed(() => undoStack.value.at(-1)?.label ?? '');
  const trackGeometries = computed(
    () => new Map(objects.value.filter(isTrack).map((o) => [o.id, o.geometry] as const)),
  );
  /** Kontroll av alle koblinger mot toleransene – gjøres på nytt ved hver modellendring. */
  const connectionResults = computed(() =>
    engine.evaluateConnections(trackGeometries.value, connections.value),
  );
  const connectionSuggestions = computed(() =>
    engine.findCoincidentFreePorts(trackGeometries.value, connections.value),
  );
  const lastRedoLabel = computed(() => redoStack.value.at(-1)?.label ?? '');

  function pruneSelection() {
    const kept = selection.value.filter((id) => byId.value.has(id));
    if (kept.length !== selection.value.length) selection.value = kept;
  }

  function commit(next: { objects: RailObject[]; connections: Connection[] }) {
    objects.value = next.objects;
    connections.value = next.connections;
    revision.value++;
    pruneSelection();
  }

  /** Utfører en redigering og legger den på angre-stakken. */
  function execute(patch: Patch | null): boolean {
    if (!patch) return false;
    commit(applyPatch({ objects: objects.value, connections: connections.value }, patch, 'do'));
    undoStack.value = [...undoStack.value, patch].slice(-HISTORY_LIMIT);
    redoStack.value = [];
    return true;
  }

  function undo() {
    const patch = undoStack.value.at(-1);
    if (!patch) return;
    commit(applyPatch({ objects: objects.value, connections: connections.value }, patch, 'undo'));
    undoStack.value = undoStack.value.slice(0, -1);
    redoStack.value = [...redoStack.value, patch];
  }

  function redo() {
    const patch = redoStack.value.at(-1);
    if (!patch) return;
    commit(applyPatch({ objects: objects.value, connections: connections.value }, patch, 'do'));
    redoStack.value = redoStack.value.slice(0, -1);
    undoStack.value = [...undoStack.value, patch];
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
    revision.value++;
  }

  function load(project: RailProject) {
    meta.value = project.project;
    objects.value = project.objects;
    connections.value = project.connections;
    selection.value = [];
    undoStack.value = [];
    redoStack.value = [];
    revision.value = 0;
    savedRevision.value = 0;
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
    };
  }

  function markSaved() {
    savedRevision.value = revision.value;
  }

  return {
    meta,
    objects,
    connections,
    selection,
    revision,
    loadCount,
    byId,
    trackRefs,
    trackGeometries,
    connectionResults,
    connectionSuggestions,
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
    removeConnection,
    addTrackFromPort,
    deleteSelection,
    deleteIds,
    updateMeta,
    load,
    reset,
    toProject,
    markSaved,
  };
});

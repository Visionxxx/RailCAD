import { isTrack, type TrackGeometry, type Vec2 } from '@railcad/domain';
import { transformObjects } from '../commands/builders';
import { fmt, fmtM, radToDeg, degToRad } from '../format';
import { ghostGeometries } from './ghosts';
import { pickObject } from './pick';
import { Tool, type KeyInfo } from './tool';
import type { Ghost, PointerInfo } from './types';

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export class PanTool extends Tool {
  readonly id = 'pan' as const;
  readonly label = 'Panorer';
  cursor = 'grab';
  snapEnabled = false;
  hint() {
    return 'Dra for å panorere. Midtknapp eller mellomrom + dra fungerer i alle verktøy.';
  }
}

export class DeleteTool extends Tool {
  readonly id = 'delete' as const;
  readonly label = 'Slett';
  snapEnabled = false;
  hint() {
    return 'Klikk et objekt for å slette det (tilknyttede lengdemål slettes med). Ctrl+Z angrer.';
  }
  move(p: PointerInfo) {
    const { project, view } = this.env;
    const hit = pickObject(project.objects, project.byId, p.world, view.pickToleranceM);
    this.env.setPreview(hit ? { ghosts: [], hoverId: hit.id, hoverKind: 'danger' } : null);
  }
  down(p: PointerInfo) {
    if (p.button !== 0) return;
    const { project, view } = this.env;
    const hit = pickObject(project.objects, project.byId, p.world, view.pickToleranceM);
    if (hit) project.deleteIds([hit.id]);
    this.env.setPreview(null);
  }
}

export class ParallelTool extends Tool {
  readonly id = 'parallel' as const;
  readonly label = 'Parallelt spor';
  snapEnabled = false;
  private refId: string | null = null;

  hint() {
    return this.refId
      ? 'Klikk (eller Enter) for å plassere kopien. Esc avbryter. Kopien er uavhengig av referansesporet.'
      : 'Velg et rett referansespor. Avstand og side settes i verktøylinjen over tegneflaten.';
  }

  move(p: PointerInfo) {
    const { project, view } = this.env;
    if (!this.refId) {
      const hit = pickObject(project.objects, project.byId, p.world, view.pickToleranceM, (o) =>
        isTrack(o),
      );
      this.env.setPreview(hit ? { ghosts: [], hoverId: hit.id } : null);
      return;
    }
    this.preview(p.world);
  }

  down(p: PointerInfo) {
    if (p.button !== 0) return;
    const { project, view, ui } = this.env;
    if (!this.refId) {
      const hit = pickObject(project.objects, project.byId, p.world, view.pickToleranceM, (o) =>
        isTrack(o),
      );
      if (!hit) return;
      const o = project.byId.get(hit.id);
      if (!o || !isTrack(o) || o.geometry.kind !== 'line') {
        ui.notify('Parallellføring støttes foreløpig kun for rette spor.', 'error');
        return;
      }
      this.refId = hit.id;
      project.select([hit.id]);
      this.preview(p.world);
      return;
    }
    this.commit(p.world);
  }

  key(k: KeyInfo) {
    if (k.key === 'Enter' && this.refId) {
      const w = this.env.view.cursor;
      if (w) this.commit(w);
      return true;
    }
    return false;
  }

  cancel() {
    if (!this.refId) return false;
    this.refId = null;
    this.env.setPreview(null);
    return true;
  }

  private signedDistance(world: Vec2): number | null {
    const { project, view } = this.env;
    const o = this.refId ? project.byId.get(this.refId) : undefined;
    if (!o || !isTrack(o)) return null;
    const dist = view.parallelDistanceM;
    if (!(Number.isFinite(dist) && dist > 0)) return null;
    const side =
      view.parallelSide === 'left'
        ? 1
        : view.parallelSide === 'right'
          ? -1
          : Math.sign(this.env.engine.signedOffsetOf(o.geometry, world)) || 1;
    return side * dist;
  }

  private preview(world: Vec2) {
    const o = this.refId ? this.env.project.byId.get(this.refId) : undefined;
    const d = this.signedDistance(world);
    if (!o || !isTrack(o) || d === null) {
      this.env.setPreview({ ghosts: [], hud: ['Ugyldig avstand'], hudValid: false });
      return;
    }
    const g = this.env.engine.offset(o.geometry, d);
    this.env.setPreview({
      ghosts: g ? [{ geometry: g, valid: true }] : [],
      hoverId: o.id,
      hud: [`${d > 0 ? 'Venstre' : 'Høyre'}, ${fmtM(Math.abs(d))}`],
      hudValid: !!g,
    });
  }

  private commit(world: Vec2) {
    const o = this.refId ? this.env.project.byId.get(this.refId) : undefined;
    const d = this.signedDistance(world);
    if (!o || !isTrack(o) || d === null) {
      this.env.ui.notify('Angi en positiv, endelig sporavstand i verktøylinjen.', 'error');
      return;
    }
    const g = this.env.engine.offset(o.geometry, d);
    if (!g) return;
    this.env.project.addTrack(g);
    this.refId = null;
    this.env.setPreview(null);
  }
}

export class MeasureLengthTool extends Tool {
  readonly id = 'measure-length' as const;
  readonly label = 'Mål lengde';
  snapEnabled = false;
  private targetId: string | null = null;

  hint() {
    return this.targetId
      ? 'Klikk for å plassere målelinjen. Måltallet følger sporet når det endres.'
      : 'Klikk et spor for å sette et lengdemål knyttet til sporet.';
  }

  move(p: PointerInfo) {
    const { project, view } = this.env;
    if (!this.targetId) {
      const hit = pickObject(project.objects, project.byId, p.world, view.pickToleranceM, (o) =>
        isTrack(o),
      );
      this.env.setPreview(hit ? { ghosts: [], hoverId: hit.id } : null);
      return;
    }
    const t = project.byId.get(this.targetId);
    if (!t || !isTrack(t)) return;
    const offsetM = round3(this.env.engine.signedOffsetOf(t.geometry, p.world));
    this.env.setPreview({
      ghosts: [],
      hoverId: t.id,
      dimensions: [{ spec: { kind: 'length', targetId: t.id, offsetM }, valid: true }],
    });
  }

  down(p: PointerInfo) {
    if (p.button !== 0) return;
    const { project, view } = this.env;
    if (!this.targetId) {
      const hit = pickObject(project.objects, project.byId, p.world, view.pickToleranceM, (o) =>
        isTrack(o),
      );
      if (hit) this.targetId = hit.id;
      return;
    }
    const t = project.byId.get(this.targetId);
    if (!t || !isTrack(t)) {
      this.cancel();
      return;
    }
    const offsetM = round3(this.env.engine.signedOffsetOf(t.geometry, p.world));
    if (
      !this.env.engine.dimensionLayout(
        { kind: 'length', targetId: t.id, offsetM },
        () => t.geometry,
      )
    ) {
      this.env.ui.notify('Målelinjen kan ikke plasseres der (forbi buens sentrum).', 'error');
      return;
    }
    project.addDimension({ kind: 'length', targetId: t.id, offsetM });
    this.cancel();
  }

  cancel() {
    if (!this.targetId) return false;
    this.targetId = null;
    this.env.setPreview(null);
    return true;
  }
}

export class MeasureDistanceTool extends Tool {
  readonly id = 'measure-distance' as const;
  readonly label = 'Mål avstand';
  private a: Vec2 | null = null;
  private b: Vec2 | null = null;

  hint() {
    if (!this.a) return 'Klikk første punkt (snapping aktiv).';
    if (!this.b) return 'Klikk andre punkt.';
    return 'Klikk for å plassere målelinjen.';
  }

  move(p: PointerInfo) {
    if (!this.a) return;
    if (!this.b) {
      const len = Math.hypot(p.point[0] - this.a[0], p.point[1] - this.a[1]);
      this.env.setPreview({
        ghosts: [],
        guides: [[this.a, p.point]],
        hud: [`${fmtM(len)}`],
        hudValid: len > 0,
      });
      return;
    }
    this.env.setPreview({
      ghosts: [],
      dimensions: [{ spec: this.spec(p.world), valid: true }],
    });
  }

  down(p: PointerInfo) {
    if (p.button !== 0) return;
    if (!this.a) {
      this.a = p.point;
      this.snapReference = p.point;
    } else if (!this.b) {
      if (Math.hypot(p.point[0] - this.a[0], p.point[1] - this.a[1]) < 1e-6) {
        this.env.ui.notify('Punktene er sammenfallende.', 'error');
        return;
      }
      this.b = p.point;
    } else {
      this.env.project.addDimension(this.spec(p.world));
      this.cancel();
    }
  }

  cancel() {
    if (!this.a) return false;
    this.a = this.b = null;
    this.snapReference = undefined;
    this.env.setPreview(null);
    return true;
  }

  private spec(world: Vec2) {
    const a = this.a as Vec2;
    const b = this.b as Vec2;
    const line: TrackGeometry = {
      kind: 'line',
      start: a,
      headingRad: Math.atan2(b[1] - a[1], b[0] - a[0]),
      lengthM: Math.hypot(b[0] - a[0], b[1] - a[1]),
    };
    return {
      kind: 'distance' as const,
      a,
      b,
      offsetM: round3(this.env.engine.signedOffsetOf(line, world)),
    };
  }
}

/** Roter valgte objekter: pivot → referanseretning → ny retning (eller numerisk vinkel). */
export class RotateTool extends Tool {
  readonly id = 'rotate' as const;
  readonly label = 'Roter';
  private pivot: Vec2 | null = null;
  private refAngle: number | null = null;

  hint() {
    if (!this.pivot) return 'Klikk rotasjonspunkt (valgte objekter roteres).';
    if (this.refAngle === null)
      return 'Klikk for å angi startretning, eller skriv vinkel i verktøylinjen.';
    return 'Klikk for å angi ny retning. Esc avbryter.';
  }

  activate() {
    if (!this.env.project.selection.length) {
      this.env.ui.notify('Velg objekter med Marker først, deretter Roter.');
      this.env.setTool('select');
    }
  }

  get hasPivot() {
    return this.pivot !== null;
  }

  down(p: PointerInfo) {
    if (p.button !== 0) return;
    if (!this.pivot) {
      this.pivot = p.point;
      this.snapReference = p.point;
      return;
    }
    const v: Vec2 = [p.point[0] - this.pivot[0], p.point[1] - this.pivot[1]];
    if (Math.hypot(v[0], v[1]) < 1e-6) return;
    const angle = Math.atan2(v[1], v[0]);
    if (this.refAngle === null) {
      this.refAngle = angle;
      return;
    }
    this.apply(angle - this.refAngle);
  }

  move(p: PointerInfo) {
    if (!this.pivot) return;
    const v: Vec2 = [p.point[0] - this.pivot[0], p.point[1] - this.pivot[1]];
    if (Math.hypot(v[0], v[1]) < 1e-6) return;
    const angle = Math.atan2(v[1], v[0]);
    if (this.refAngle === null) {
      this.env.setPreview({ ghosts: [], pivot: this.pivot, guides: [[this.pivot, p.point]] });
      return;
    }
    this.showGhost(angle - this.refAngle, p.point);
  }

  /** Numerisk rotasjon (grader, mot klokka) om det valgte rotasjonspunktet. */
  applyDegrees(deg: number) {
    if (this.pivot) this.apply(degToRad(deg));
  }

  cancel() {
    if (!this.pivot) return false;
    this.pivot = null;
    this.refAngle = null;
    this.snapReference = undefined;
    this.env.setPreview(null);
    return true;
  }

  private showGhost(angle: number, at: Vec2) {
    const ids = new Set(this.env.project.selection);
    const ghosts: Ghost[] = [];
    for (const o of this.env.project.objects) {
      if (!ids.has(o.id)) continue;
      for (const geometry of ghostGeometries(
        o,
        { type: 'rotate', pivot: this.pivot as Vec2, angleRad: angle },
        this.env.engine,
      )) {
        ghosts.push({ geometry, valid: true });
      }
    }
    const shown = ((((radToDeg(angle) + 180) % 360) + 360) % 360) - 180;
    this.env.setPreview({
      ghosts,
      pivot: this.pivot as Vec2,
      guides: [[this.pivot as Vec2, at]],
      hud: [`${fmt(shown, 3)}°`],
      hudValid: true,
    });
  }

  private apply(angle: number) {
    const patch = transformObjects(
      this.env.project.objects,
      new Set(this.env.project.selection),
      this.env.engine,
      { type: 'rotate', pivot: this.pivot as Vec2, angleRad: angle },
      'Roter',
    );
    if (!this.env.project.execute(patch)) {
      this.env.ui.notify('Ingenting å rotere – lengdemål følger sporet.');
    }
    this.cancel();
  }
}

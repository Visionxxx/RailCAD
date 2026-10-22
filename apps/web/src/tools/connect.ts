import { TURNOUT_CATALOG_REVISION, findTurnoutDefinition, type Vec2 } from '@railcad/domain';
import { TOLERANCES, type PortRef } from '@railcad/geometry-api';
import { fmtM, portLabel } from '../format';
import { crossingFromView } from './crossing';
import { Tool } from './tool';
import type { PointerInfo } from './types';

interface PortHit extends PortRef {
  point: Vec2;
  /** Utgående retning (bort fra sporet). */
  headingRad: number;
}

type Mode =
  { kind: 'idle' } | { kind: 'menu'; port: PortHit } | { kind: 'line' | 'arc'; port: PortHit };

/**
 * Koble: klikk et ledig sporendepunkt. En meny ved musepeker spør hva som skal skje der:
 * koble til sammenfallende endepunkt, fortsette med rett spor eller kurve (tangentielt).
 * Nye spor og koblingen opprettes i én angrebar handling.
 */
export class ConnectTool extends Tool {
  readonly id = 'connect' as const;
  readonly label = 'Koble';
  snapEnabled = false;
  private mode: Mode = { kind: 'idle' };

  get activeMode() {
    return this.mode.kind;
  }

  hint() {
    switch (this.mode.kind) {
      case 'menu':
        return 'Velg i menyen hva som skal lages i endepunktet. Esc lukker.';
      case 'line':
        return 'Klikk for å sette lengden langs tangenten, eller skriv lengde i verktøylinjen. Esc avbryter.';
      case 'arc':
        return 'Klikk sluttpunkt for kurven (starter tangentielt). Esc avbryter.';
      default:
        return 'Klikk et ledig sporendepunkt (markert med ring) for å koble eller fortsette.';
    }
  }

  activate() {
    this.snapEnabled = false;
  }

  move(p: PointerInfo) {
    const m = this.mode;
    if (m.kind === 'idle') {
      const hit = this.portAt(p.world);
      this.env.setPreview(hit ? { ghosts: [], portHover: hit.point } : null);
      return;
    }
    if (m.kind === 'line') {
      const s = this.alongTangent(m.port, p.point);
      const g = this.lineGeometry(m.port, s);
      this.env.setPreview({
        ghosts: g ? [{ geometry: g, valid: true }] : [],
        hud: g ? [`L = ${fmtM(s)}`] : ['Ugyldig lengde'],
        hudValid: !!g,
      });
    } else if (m.kind === 'arc') {
      const arc = this.env.engine.arcFromStartTangentEnd(m.port.point, m.port.headingRad, p.point);
      this.env.setPreview({
        ghosts: arc ? [{ geometry: arc, valid: true }] : [],
        hud: arc
          ? [`R = ${fmtM(Math.abs((arc as { signedRadiusM: number }).signedRadiusM))}`]
          : ['Ugyldig kurve'],
        hudValid: !!arc,
      });
    }
  }

  down(p: PointerInfo) {
    if (p.button !== 0) return;
    const m = this.mode;
    if (m.kind === 'idle') {
      const hit = this.portAt(p.world);
      if (!hit) return;
      this.mode = { kind: 'menu', port: hit };
      this.env.setPreview({ ghosts: [], portHover: hit.point });
      this.env.openPortMenu({
        screen: p.screen,
        title: `${hit.objectId} · ${portLabel(hit.port)}`,
        items: [
          ...this.partnersOf(hit).map((o) => ({
            id: `connect:${o.objectId}:${o.port}`,
            label: `Koble til ${o.objectId} (${portLabel(o.port)})`,
          })),
          { id: 'line', label: 'Rett spor (tangentielt)' },
          { id: 'arc', label: 'Kurve (tangentiell)' },
          ...this.turnoutItems(),
          {
            id: 'crossing',
            label:
              this.env.view.crossingSlip === 'none'
                ? `Sporkryss 1:${this.env.view.crossingRatioN}`
                : `Kryssveksel 1:${this.env.view.crossingRatioN}`,
            note: 'ikke verifisert',
          },
        ],
      });
    } else if (m.kind === 'line') {
      this.createLine(this.alongTangent(m.port, p.point));
    } else if (m.kind === 'arc') {
      const arc = this.env.engine.arcFromStartTangentEnd(m.port.point, m.port.headingRad, p.point);
      if (!arc) {
        this.env.ui.notify(
          'Ugyldig kurve: sluttpunktet ligger på tangentlinjen eller gir for stor radius.',
          'error',
        );
        return;
      }
      this.env.project.addTrackFromPort(arc, m.port);
      this.reset();
    }
  }

  /** Kalles av kontrolleren når et menyvalg er gjort. */
  menuChoice(id: string) {
    const m = this.mode;
    if (m.kind !== 'menu') return;
    if (id.startsWith('connect:')) {
      const [, objectId, port] = id.split(':');
      const ok = this.env.project.connect(
        { objectId: m.port.objectId, port: m.port.port },
        { objectId: objectId as string, port: port as PortRef['port'] },
      );
      if (!ok) this.env.ui.notify('Portene kunne ikke kobles (allerede i bruk).', 'error');
      this.reset();
    } else if (id === 'crossing') {
      const half = this.env.view.crossingHalfLengthM;
      const r = crossingFromView(
        this.env.view,
        [
          m.port.point[0] + Math.cos(m.port.headingRad) * half,
          m.port.point[1] + Math.sin(m.port.headingRad) * half,
        ],
        m.port.headingRad,
      );
      if (r.ok) {
        this.env.project.addCrossing(r.placement, { objectId: m.port.objectId, port: m.port.port });
      } else {
        this.env.ui.notify(r.error, 'error');
      }
      this.reset();
    } else if (id === 'turnout:left' || id === 'turnout:right') {
      const type = findTurnoutDefinition(this.env.view.turnoutTypeId);
      if (type) {
        this.env.project.addTurnout(
          {
            catalogId: type.id,
            catalogRevision: TURNOUT_CATALOG_REVISION,
            position: m.port.point,
            headingRad: m.port.headingRad,
            hand: id === 'turnout:left' ? 'left' : 'right',
          },
          { objectId: m.port.objectId, port: m.port.port },
        );
      }
      this.reset();
    } else if (id === 'line' || id === 'arc') {
      this.mode = { kind: id, port: m.port };
      this.snapEnabled = id === 'arc';
      this.env.setPreview({ ghosts: [] });
    }
  }

  menuClosed() {
    if (this.mode.kind === 'menu') this.reset();
  }

  /** Numerisk lengde (verktøylinjen) for tangentiell fortsettelse. */
  createLine(lengthM: number): boolean {
    const m = this.mode;
    if (m.kind !== 'line') return false;
    const g = this.lineGeometry(m.port, lengthM);
    if (!g) {
      this.env.ui.notify('Lengden må være et positivt tall.', 'error');
      return false;
    }
    this.env.project.addTrackFromPort(g, m.port);
    this.reset();
    return true;
  }

  cancel() {
    if (this.mode.kind === 'idle') return false;
    this.env.closePortMenu();
    this.reset();
    return true;
  }

  private reset() {
    this.mode = { kind: 'idle' };
    this.snapEnabled = false;
    this.env.closePortMenu();
    this.env.setPreview(null);
  }

  private alongTangent(port: PortHit, at: Vec2): number {
    return (
      (at[0] - port.point[0]) * Math.cos(port.headingRad) +
      (at[1] - port.point[1]) * Math.sin(port.headingRad)
    );
  }

  private lineGeometry(port: PortHit, lengthM: number) {
    if (!(Number.isFinite(lengthM) && lengthM >= TOLERANCES.minSegmentLengthM)) return null;
    return { kind: 'line' as const, start: port.point, headingRad: port.headingRad, lengthM };
  }

  /** Alle ledige porter (ikke i noen kobling) – spor og sporveksler. */
  freePorts(): PortHit[] {
    return this.env.project.freePorts.map((f) => ({ ...f, point: f.point as Vec2 }));
  }

  private turnoutItems() {
    const type = findTurnoutDefinition(this.env.view.turnoutTypeId);
    if (!type) return [];
    return [
      {
        id: 'turnout:left',
        label: `Sporveksel ${type.name} – venstre`,
        note: type.verificationLabel.toLowerCase(),
      },
      {
        id: 'turnout:right',
        label: `Sporveksel ${type.name} – høyre`,
        note: type.verificationLabel.toLowerCase(),
      },
    ];
  }

  private portAt(world: Vec2): PortHit | null {
    const tol = this.env.view.pickToleranceM * 1.5;
    let best: PortHit | null = null;
    let bestD = tol;
    for (const p of this.freePorts()) {
      const d = Math.hypot(p.point[0] - world[0], p.point[1] - world[1]);
      if (d <= bestD) {
        best = p;
        bestD = d;
      }
    }
    return best;
  }

  private partnersOf(port: PortHit): PortHit[] {
    return this.freePorts().filter(
      (o) =>
        o.objectId !== port.objectId &&
        Math.hypot(o.point[0] - port.point[0], o.point[1] - port.point[1]) <=
          TOLERANCES.connectionPositionM,
    );
  }
}

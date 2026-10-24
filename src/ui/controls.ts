import type { FrameState } from '../animation/timeline';
import type { Quality } from '../animation/perf';
import type { Phase } from '../animation/config';
import { kochFlank } from '../animation/chaos';

export interface ControlHandlers {
  prev(): void;
  next(): void;
  togglePause(): void;
  save(): void;
}

const PHASE_LABELS: Record<Phase, string> = {
  generate: 'Grow · 成長',
  chaos: 'Chaos · 混沌',
  dissolve: 'Dissolve · 消滅',
  zoomIn: 'Zoom in · 拡大',
  infinite: 'Infinite zoom · 無限拡大',
  zoomOut: 'Zoom out · 縮小',
  fadeOut: 'Melt · 収縮',
  transition: 'Next seed · 次へ',
};

export const formatSeed = (n: number) => `#${String(n).padStart(4, '0')}`;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

/** Heads-up display: seed, phase, parameters, transport controls and keyboard shortcuts. */
export class Hud {
  private readonly seedValue = el('div', 'seed-value');
  private readonly phase = el('div', 'phase');
  private readonly progress = el('div', 'phase-progress');
  private readonly params = el('div', 'params');
  private readonly perf = el('div', 'perf');
  private readonly pauseButton: HTMLButtonElement;
  private lastSeed = -1;
  private lastParamText = '';

  constructor(root: HTMLElement, handlers: ControlHandlers, visible: boolean) {
    root.hidden = !visible;

    const top = el('section', 'hud-top');
    top.setAttribute('aria-live', 'polite');
    const progressTrack = el('div', 'phase-track');
    progressTrack.append(this.progress);
    top.append(
      el('div', 'seed-label', 'Seed'),
      this.seedValue,
      this.phase,
      progressTrack,
      this.params,
    );

    const bar = el('nav', 'controls');
    bar.setAttribute('aria-label', 'Playback');
    const button = (label: string, title: string, onClick: () => void) => {
      const b = el('button', 'control', label);
      b.type = 'button';
      b.title = title;
      b.addEventListener('click', onClick);
      bar.append(b);
      return b;
    };
    button('◀ Prev', '前のシード (←)', handlers.prev);
    this.pauseButton = button('❚❚ Pause', '一時停止 / 再生 (Space)', handlers.togglePause);
    button('Next ▶', '次のシード (→)', handlers.next);
    button('⤓ PNG', 'PNG 保存 (S)', handlers.save);

    root.append(top, bar, this.perf);

    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement) return;
      const actions: Record<string, () => void> = {
        ArrowLeft: handlers.prev,
        ArrowRight: handlers.next,
        ' ': handlers.togglePause,
        s: handlers.save,
        S: handlers.save,
      };
      const action = actions[e.key];
      if (!action) return;
      e.preventDefault();
      action();
    });
  }

  setPaused(paused: boolean): void {
    this.pauseButton.textContent = paused ? '▶ Play' : '❚❚ Pause';
    this.pauseButton.setAttribute('aria-pressed', String(paused));
  }

  update(frame: FrameState, quality: Quality, frameMs: number): void {
    if (frame.seed !== this.lastSeed) {
      this.lastSeed = frame.seed;
      this.seedValue.textContent = formatSeed(frame.seed);
    }
    this.phase.textContent = PHASE_LABELS[frame.phase];
    this.progress.style.transform = `scaleX(${frame.progress.toFixed(3)})`;

    const p = frame.layers[0]?.params;
    if (p) {
      const text = [
        `Koch  d${p.kochDepth} · ${p.kochAngle.toFixed(0)}° · m ${p.kochRatio.toFixed(2)}`,
        `Sierpiński  ${p.sierpinskiPattern} · d${p.sierpinskiDepth}`,
        `Sides  ${p.sideCount} @ ${p.sideAngle.toFixed(0)}°`,
        `HSL  ${p.hue.toFixed(0)}° ${p.saturation.toFixed(0)}% ${p.lightness.toFixed(0)}%`,
        frame.cycle === 'zoom'
          ? `Zoom  ${frame.plan.kind === 'koch' ? 'Koch tip' : 'gasket centre'} ×${frame.plan.scale.toFixed(2)}`
          : `Flank  ${kochFlank(p.kochRatio, p.kochAngle).toFixed(2)} of segment`,
      ].join('\n');
      if (text !== this.lastParamText) {
        this.lastParamText = text;
        this.params.textContent = text;
      }
    }
    this.perf.textContent = `${frameMs.toFixed(1)} ms · LOD ${quality.minSegmentPx.toFixed(1)}px · depth ≤ ${quality.maxBaseDepth}${quality.glow ? '' : ' · no glow'}`;
  }
}

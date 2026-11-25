// Felt-and-cardboard trackside scenery cut from the concept-art scenery sheet.
// Each layer repeats across the frame and scrolls at its own speed (parallax).
const URLS = import.meta.glob('./scenery/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export type SceneryName = 'hills' | 'stands' | 'tree1' | 'tree2' | 'tree3' | 'cloud1' | 'cloud2' | 'sun' | 'fence' | 'finish';
export type Scenery = Record<SceneryName, HTMLImageElement>;

let loading: Promise<Scenery> | null = null;
export function loadScenery(): Promise<Scenery> {
  loading ??= Promise.all(Object.entries(URLS).map(([path, url]) => new Promise<[string, HTMLImageElement]>((res, rej) => {
    const img = new Image();
    img.onload = () => res([path.replace(/^.*\//, '').replace('.webp', ''), img]);
    img.onerror = rej;
    img.src = url;
  }))).then((e) => Object.fromEntries(e) as Scenery);
  return loading;
}

/**
 * Repeat an image along x between L and R, bottom edge on `bottom`, `height` tall.
 * `mirror` flips every other copy so strips whose ends don't match still join seamlessly.
 */
export function tileX(g: CanvasRenderingContext2D, img: HTMLImageElement, L: number, R: number, scroll: number, bottom: number, height: number, mirror = true, gap = 0): void {
  const w = img.naturalWidth * (height / img.naturalHeight);
  const period = w + gap;
  const first = Math.floor((L - scroll) / period) - 1;
  for (let i = first; ; i++) {
    const x = scroll + i * period;
    if (x > R) break;
    if (mirror && i % 2 !== 0) {
      g.save(); g.translate(x + w, bottom - height); g.scale(-1, 1); g.drawImage(img, 0, 0, w, height); g.restore();
    } else {
      g.drawImage(img, x, bottom - height, w, height);
    }
  }
}

/** A repeating run of pieces (e.g. stands, trees, trees) with their own heights and spacing. */
export function tileRun(g: CanvasRenderingContext2D, run: { img: HTMLImageElement; height: number; gap: number }[], L: number, R: number, scroll: number, bottom: number): void {
  const widths = run.map((p) => p.img.naturalWidth * (p.height / p.img.naturalHeight) + p.gap);
  const period = widths.reduce((a, b) => a + b, 0);
  const first = Math.floor((L - scroll) / period) - 1;
  for (let i = first; ; i++) {
    let x = scroll + i * period;
    if (x > R) break;
    run.forEach((p, k) => {
      const w = widths[k] - p.gap;
      g.drawImage(p.img, x, bottom - p.height, w, p.height);
      x += widths[k];
    });
  }
}

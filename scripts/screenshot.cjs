// Capture the README screenshots from the production build.
// Usage: npm run build && npm run screenshot
const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');

const PORT = 4179;
const BASE = `http://localhost:${PORT}/`;
const OUT = path.join(__dirname, '..', 'docs');

// `at` = seconds into the timeline: 6 s = fully grown, 6–14 s = chaos, 14–16.4 s = dissolve.
// The zoom shots use the optional zoom cycle (infinite zoom from 10.5 s).
const GROWN = 5.99;
const SHOTS = [
  ['hero.png', `seed=12&at=${GROWN}&paused=1`],
  ['chaos-peak.png', 'seed=4&at=13.2&paused=1&hud=0'],
  ['zoom-koch.png', 'seed=7&at=12.1&cycle=zoom&paused=1&hud=0'],
  ['zoom-sierpinski.png', 'seed=21&at=12.1&cycle=zoom&paused=1&hud=0'],
];
const GALLERY = {
  file: 'gallery.png',
  columns: 6,
  tiles: Array.from({ length: 24 }, (_, seed) => ({
    q: `seed=${seed}&at=${GROWN}`,
    label: `#${String(seed).padStart(4, '0')}`,
  })),
};
// Growth of seed #0012: dot → hexagon → sprouting arms → full crystal.
const GROWTH = {
  file: 'growth.png',
  columns: 8,
  tiles: [0.3, 1.0, 1.6, 2.2, 2.8, 3.5, 4.4, GROWN].map((t) => ({
    q: `seed=12&at=${t}`,
    label: `${t.toFixed(1)} s`,
  })),
};
// Life of seed #0004 after growing: corners multiply into chaos, then it dissolves.
const CHAOS = {
  file: 'chaos.png',
  columns: 8,
  tiles: [GROWN, 8, 10, 11.5, 12.7, 13.6, 14.6, 15.4].map((t) => ({
    q: `seed=4&at=${t}`,
    label: `${t.toFixed(1)} s`,
  })),
};

async function waitForServer(url, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server at ${url} did not start`);
}

/** Render each tile's query in a square viewport and lay the crops out in a grid. */
async function contactSheet(browser, page, { file, columns, tiles }) {
  await page.setViewportSize({ width: 480, height: 480 });
  const images = [];
  for (const { q } of tiles) {
    await page.goto(`${BASE}?${q}&paused=1&hud=0`);
    await page.waitForTimeout(300);
    const png = await page.screenshot({ clip: { x: 24, y: 24, width: 432, height: 432 } });
    images.push(png.toString('base64'));
  }
  const sheet = await browser.newPage({ viewport: { width: columns * 240, height: 240 } });
  await sheet.setContent(
    `<body style="margin:0;background:#010208;display:grid;grid-template-columns:repeat(${columns},240px)">` +
      images
        .map(
          (b64, i) =>
            `<div style="position:relative"><img width="240" height="240" src="data:image/png;base64,${b64}">` +
            `<span style="position:absolute;left:10px;top:8px;font:12px ui-monospace,monospace;color:#8b9bc4">${tiles[i].label}</span></div>`,
        )
        .join('') +
      '</body>',
  );
  await sheet.screenshot({ path: path.join(OUT, file), fullPage: true });
  await sheet.close();
  console.log(`saved docs/${file}`);
}

async function main() {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
  });
  const browser = await chromium.launch();
  const errors = [];
  try {
    await waitForServer(BASE);
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

    for (const [file, q] of SHOTS) {
      await page.goto(`${BASE}?${q}`);
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUT, file) });
      console.log(`saved docs/${file}`);
    }

    for (const sheet of [GALLERY, GROWTH, CHAOS]) await contactSheet(browser, page, sheet);
  } finally {
    await browser.close();
    server.kill();
  }
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  }
}

main();

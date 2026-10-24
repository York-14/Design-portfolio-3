// Capture the README screenshots from the production build.
// Usage: npm run build && npm run screenshot
const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');

const PORT = 4179;
const BASE = `http://localhost:${PORT}/`;
const OUT = path.join(__dirname, '..', 'docs');

// `at` = seconds into the timeline (5 s ≈ end of generation, 11 s ≈ infinite zoom).
const SHOTS = [
  ['hero.png', 'seed=12&at=4.99&paused=1'],
  ['zoom-koch.png', 'seed=7&at=11.1&paused=1&hud=0'],
  ['zoom-sierpinski.png', 'seed=21&at=11.1&paused=1&hud=0'],
];
const GALLERY = { file: 'gallery.png', seeds: 24, columns: 6 };

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

    // Gallery: seeds 0..N-1 at the end of their generation phase.
    await page.setViewportSize({ width: 480, height: 480 });
    const tiles = [];
    for (let seed = 0; seed < GALLERY.seeds; seed++) {
      await page.goto(`${BASE}?seed=${seed}&at=4.99&paused=1&hud=0`);
      await page.waitForTimeout(300);
      tiles.push(
        (await page.screenshot({ clip: { x: 24, y: 24, width: 432, height: 432 } })).toString(
          'base64',
        ),
      );
    }
    const sheet = await browser.newPage({
      viewport: { width: GALLERY.columns * 240, height: 240 },
    });
    await sheet.setContent(
      `<body style="margin:0;background:#010208;display:grid;grid-template-columns:repeat(${GALLERY.columns},240px)">` +
        tiles
          .map(
            (b64, seed) =>
              `<div style="position:relative"><img width="240" height="240" src="data:image/png;base64,${b64}">` +
              `<span style="position:absolute;left:10px;top:8px;font:12px ui-monospace,monospace;color:#8b9bc4">#${String(seed).padStart(4, '0')}</span></div>`,
          )
          .join('') +
        '</body>',
    );
    await sheet.screenshot({ path: path.join(OUT, GALLERY.file), fullPage: true });
    console.log(`saved docs/${GALLERY.file}`);
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

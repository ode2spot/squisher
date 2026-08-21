// Build the extension into dist/extension/: bundle the three entry points
// with esbuild and copy the static files (manifest, popup html/css, icons)
// through. `--watch` keeps esbuild in watch mode and re-copies statics when
// they change; reload the extension in the browser to pick up changes.
import * as esbuild from 'esbuild';
import { cp, mkdir, watch } from 'node:fs/promises';
import path from 'node:path';

const watchMode = process.argv.includes('--watch');
const outDir = 'dist/extension';

const staticFiles = [
  ['src/manifest.json', 'manifest.json'],
  ['src/popup/popup.html', 'popup.html'],
  ['src/popup/popup.css', 'popup.css'],
  ['src/icons/icon-16.png', 'icons/icon-16.png'],
  ['src/icons/icon-32.png', 'icons/icon-32.png'],
  ['src/icons/icon-48.png', 'icons/icon-48.png'],
  ['src/icons/icon-128.png', 'icons/icon-128.png'],
];

async function copyStatics() {
  await mkdir(path.join(outDir, 'icons'), { recursive: true });
  for (const [src, dst] of staticFiles) {
    await cp(src, path.join(outDir, dst));
  }
}

const buildOptions = {
  entryPoints: [
    { in: 'src/content/index.ts', out: 'content' },
    { in: 'src/content/expander-processor.ts', out: 'expander-processor' },
    { in: 'src/popup/popup.ts', out: 'popup' },
    { in: 'src/background/service-worker.ts', out: 'service-worker' },
  ],
  outdir: outDir,
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  sourcemap: watchMode ? 'inline' : false,
  minify: !watchMode,
  logLevel: 'info',
};

await copyStatics();

if (watchMode) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  // esbuild only watches the TS graph; re-copy statics on change ourselves.
  for (const [src] of staticFiles) {
    (async () => {
      for await (const _event of watch(src)) {
        await copyStatics();
        console.log(`[statics] re-copied after change to ${src}`);
      }
    })().catch(() => {});
  }
  console.log('Watching for changes...');
} else {
  await esbuild.build(buildOptions);
}

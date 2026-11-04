/**
 * 截圖：對一個已建置好的 dist 目錄，逐個 case × viewport 連拍兩次。
 *
 * issue #73 的要求：每個案例連續截圖兩次，解碼後像素必須完全一致；
 * 不一致就代表驗收環境不穩定，要先找出非確定因素，不得調容差。
 *
 * 用法：
 *   node tools/visual/run.mjs --dist apps/web/dist --out .workbuddy/visual/baseline --label baseline
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CASES, VIEWPORTS } from './cases.mjs';
import { comparePng } from './png.mjs';
import { startServer } from './server.mjs';
import { capture } from './shoot.mjs';

function readArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index].replace(/^--/, '');
    args[key] = argv[index + 1];
  }

  return args;
}

const args = readArgs(process.argv.slice(2));

if (args.dist === undefined || args.out === undefined) {
  console.error('用法：node tools/visual/run.mjs --dist <dist-dir> --out <out-dir> [--label 名稱]');
  process.exit(2);
}

const distDir = resolve(args.dist);
const outDir = resolve(args.out);
const port = Number(args.port ?? 4600);

mkdirSync(outDir, { recursive: true });

const report = { label: args.label ?? outDir, cases: [] };
let failures = 0;

for (const testCase of CASES) {
  const server = await startServer({ distDir, mode: testCase.mode, port });

  try {
    for (const viewport of VIEWPORTS) {
      const key = `${testCase.name}__${viewport.name}`;
      const options = {
        viewport: { width: viewport.width, height: viewport.height },
        steps: testCase.steps,
        url: `${server.url}/`,
      };

      const first = await capture(options);
      const second = await capture(options);

      writeFileSync(join(outDir, `${key}.png`), first);
      writeFileSync(join(outDir, `${key}--repeat.png`), second);

      const self = comparePng(first, second);

      if (!self.sameSize || self.diffPixels !== 0) {
        failures += 1;
      }

      report.cases.push({
        key,
        case: testCase.name,
        viewport: `${String(viewport.width)}x${String(viewport.height)}`,
        size: self.sizeA,
        selfDiffPixels: self.diffPixels,
        selfStable: self.sameSize && self.diffPixels === 0,
      });

      console.log(
        `${key} | ${self.sizeA} | 同版本連拍差異 ${String(self.diffPixels)} px | ${self.sameSize && self.diffPixels === 0 ? 'STABLE' : 'UNSTABLE'}`,
      );
    }
  } finally {
    await server.close();
  }
}

writeFileSync(join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);

console.log(`\n完成：${String(report.cases.length)} 組，不穩定 ${String(failures)} 組。輸出於 ${outDir}`);
process.exit(failures === 0 ? 0 : 1);

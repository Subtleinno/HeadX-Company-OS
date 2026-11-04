/**
 * 比較基準圖與候選圖（issue #73 驗收 5）。
 *
 * 規則：尺寸不同直接失敗；尺寸相同時差異像素必須為 0。
 * 不設 maxDiffPixels、不設顏色閾值、不遮罩 —— 任何非零差異都是失敗。
 *
 * 用法：
 *   node tools/visual/compare.mjs --baseline <dir> --candidate <dir> --out <dir>
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { comparePng, encodePng } from './png.mjs';

function readArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 2) {
    args[argv[index].replace(/^--/, '')] = argv[index + 1];
  }

  return args;
}

const args = readArgs(process.argv.slice(2));

if (args.baseline === undefined || args.candidate === undefined || args.out === undefined) {
  console.error('用法：node tools/visual/compare.mjs --baseline <dir> --candidate <dir> --out <dir>');
  process.exit(2);
}

const baselineDir = resolve(args.baseline);
const candidateDir = resolve(args.candidate);
const outDir = resolve(args.out);

mkdirSync(outDir, { recursive: true });

const baselineReport = JSON.parse(readFileSync(join(baselineDir, 'report.json'), 'utf8'));
const candidateReport = JSON.parse(readFileSync(join(candidateDir, 'report.json'), 'utf8'));

const baselineKeys = baselineReport.cases.map((entry) => entry.key);
const candidateKeys = candidateReport.cases.map((entry) => entry.key);

const rows = [];
let failures = 0;

if (baselineKeys.join('|') !== candidateKeys.join('|')) {
  console.error('兩邊的案例清單不同，直接失敗。');
  console.error(`基準：${baselineKeys.join(', ')}`);
  console.error(`候選：${candidateKeys.join(', ')}`);
  process.exit(1);
}

for (const key of baselineKeys) {
  const baseline = readFileSync(join(baselineDir, `${key}.png`));
  const candidate = readFileSync(join(candidateDir, `${key}.png`));
  const result = comparePng(baseline, candidate);

  if (result.diff !== null) {
    writeFileSync(join(outDir, `${key}--diff.png`), encodePng(result.diff));
  }

  const passed = result.sameSize && result.diffPixels === 0;

  if (!passed) {
    failures += 1;
  }

  rows.push({
    key,
    baselineSize: result.sizeA,
    candidateSize: result.sizeB,
    diffPixels: result.sameSize ? result.diffPixels : null,
    totalPixels: result.totalPixels,
    ratio: result.sameSize ? result.ratio : null,
    passed,
  });

  console.log(
    `${key} | 基準 ${result.sizeA} | 候選 ${result.sizeB} | 差異 ${result.sameSize ? String(result.diffPixels) : '尺寸不同'} px | ${passed ? 'PASS' : 'FAIL'}`,
  );
}

writeFileSync(join(outDir, 'compare.json'), `${JSON.stringify({ rows, failures }, null, 2)}\n`);

console.log(`\n共 ${String(rows.length)} 組，失敗 ${String(failures)} 組。差異圖與報告在 ${outDir}`);
process.exit(failures === 0 ? 0 : 1);

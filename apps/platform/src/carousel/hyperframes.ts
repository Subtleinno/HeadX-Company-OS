import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { zipSync } from 'fflate';
import sharp from 'sharp';
import type { BrandCreativeProfile, CarouselSlide } from '@company-os/contracts';

const execFileAsync = promisify(execFile);
export const HYPERFRAMES_VERSION = '0.9.56';
const WIDTH = 1080;
const HEIGHT = 1350;

export type RenderMaterial = { id: string; dataUri: string };
export type RenderedCarousel = {
  pages: { name: string; body: Buffer; width: number; height: number }[];
  archive: { name: string; body: Buffer };
};

function html(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function plain(value: string): string {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#]/g, '')
    .replace(/^\s*[-+]\s+/gm, '')
    .trim();
}
function font(value: string): string { return value.replace(/[;{}<>]/g, '').trim() || 'sans-serif'; }
function luminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (match?.[1] === undefined) return 0;
  const channels = [0, 2, 4].map((offset) => Number.parseInt((match[1] ?? '').slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return (linear[0] ?? 0) * 0.2126 + (linear[1] ?? 0) * 0.7152 + (linear[2] ?? 0) * 0.0722;
}
function textOn(color: string, light: string, dark: string): string { return luminance(color) > 0.45 ? dark : light; }

function slideHtml(slide: CarouselSlide, index: number, materials: Map<string, string>): string {
  const image = slide.materialId === null ? undefined : materials.get(slide.materialId);
  const content = html(plain(slide.body));
  const imageHtml = image === undefined ? '' : `<img class="visual" src="${image}" alt="" />`;
  if (slide.role === 'cover') {
    return `<section class="slide clip cover" data-start="${index}" data-duration="1" data-track-index="0" data-still-at="settled">
      <div class="brand">MOONIC PLACEHOLDER</div>
      <div class="cover-copy"><h1>${html(slide.headline)}</h1><p>${content}</p></div>
      ${imageHtml}<div class="page">${index + 1} / {{TOTAL}}</div>
    </section>`;
  }
  if (slide.role === 'cta') {
    return `<section class="slide clip cta" data-start="${index}" data-duration="1" data-track-index="0" data-still-at="settled">
      <div class="brand">MOONIC PLACEHOLDER</div><div class="cta-copy"><h1>${html(slide.headline)}</h1><p>${content}</p><strong>${html(slide.cta)}</strong></div>
      <div class="page">${index + 1} / {{TOTAL}}</div>
    </section>`;
  }
  return `<section class="slide clip body-slide ${image === undefined ? 'no-image' : ''}" data-start="${index}" data-duration="1" data-track-index="0" data-still-at="settled">
    <div class="brand">MOONIC PLACEHOLDER</div><div class="section-number">${String(index + 1).padStart(2, '0')}</div>
    ${imageHtml}<div class="body-copy"><h2>${html(slide.headline)}</h2><p>${content}</p></div>
    <div class="page">${index + 1} / {{TOTAL}}</div>
  </section>`;
}

/** 生成唯一 HTML 真相；正式 PNG 由 HyperFrames 從這份文件抽取。 */
export function compositionHtml(input: { slides: CarouselSlide[]; brand: BrandCreativeProfile; materials: RenderMaterial[] }): string {
  const brandName = html(input.brand.brandName);
  const materials = new Map(input.materials.map((item) => [item.id, item.dataUri]));
  const ctaInk = textOn(input.brand.colors.primary, input.brand.colors.paper, input.brand.colors.ink);
  const scenes = input.slides.map((slide, index) => slideHtml(slide, index, materials)).join('\n')
    .replaceAll('MOONIC PLACEHOLDER', brandName).replaceAll('{{TOTAL}}', String(input.slides.length));
  return `<!doctype html>
<html lang="zh-Hant-HK"><head><meta charset="UTF-8" /><meta name="viewport" content="width=${WIDTH}, height=${HEIGHT}" />
<style>
:root { --primary:${input.brand.colors.primary}; --ink:${input.brand.colors.ink}; --paper:${input.brand.colors.paper}; --accent:${input.brand.colors.accent}; --cta-ink:${ctaInk}; }
* { box-sizing:border-box; margin:0; padding:0; }
html,body { width:${WIDTH}px; height:${HEIGHT}px; overflow:hidden; background:var(--paper); }
#root { position:relative; width:${WIDTH}px; height:${HEIGHT}px; overflow:hidden; font-family:${font(input.brand.fonts.body)}; color:var(--ink); }
.slide { position:absolute; inset:0; width:${WIDTH}px; height:${HEIGHT}px; overflow:hidden; background:var(--paper); }
.brand { position:absolute; left:72px; top:58px; z-index:3; font-size:25px; font-weight:650; letter-spacing:.02em; }
.page { position:absolute; right:66px; bottom:48px; z-index:3; font-size:22px; font-variant-numeric:tabular-nums; }
.cover:before { content:""; position:absolute; left:0; top:0; width:18px; height:100%; background:var(--primary); }
.cover-copy { position:absolute; z-index:2; left:72px; right:72px; top:174px; }
h1,h2 { font-family:${font(input.brand.fonts.display)}; letter-spacing:-.045em; font-weight:650; }
.cover h1 { font-size:88px; line-height:1.03; max-width:900px; }
.cover p { margin-top:34px; max-width:790px; font-size:31px; line-height:1.5; }
.cover .visual { position:absolute; left:72px; right:0; bottom:0; width:1008px; height:48%; object-fit:cover; object-position:center; border-radius:32px 0 0 0; }
.cover:has(.visual) .cover-copy { max-height:52%; }
.cover:has(.visual) h1 { font-size:76px; }
.cover:has(.visual) p { font-size:27px; max-width:700px; }
.body-slide { padding:160px 72px 96px; }
.section-number { color:var(--primary); font-size:26px; font-weight:650; margin-bottom:28px; }
.body-copy { position:absolute; left:72px; right:72px; bottom:130px; }
.body-copy h2 { font-size:66px; line-height:1.1; margin-bottom:32px; }
.body-copy p { font-size:31px; line-height:1.58; white-space:pre-wrap; }
.body-slide .visual { position:absolute; left:72px; top:150px; width:936px; height:43%; object-fit:cover; border-radius:24px; }
.body-slide:has(.visual) .body-copy { bottom:100px; }
.body-slide:has(.visual) .body-copy h2 { font-size:54px; margin-bottom:20px; }
.body-slide:has(.visual) .body-copy p { font-size:27px; line-height:1.45; max-height:350px; }
.cta { background:var(--primary); color:var(--cta-ink); }
.cta-copy { position:absolute; left:72px; right:72px; top:310px; }
.cta h1 { font-size:92px; line-height:1.04; }
.cta p { margin-top:42px; font-size:32px; line-height:1.55; }
.cta strong { display:inline-block; margin-top:64px; padding:22px 30px; background:var(--cta-ink); color:var(--primary); font-size:30px; border-radius:999px; }
</style></head><body><main id="root" data-composition-id="main" data-start="0" data-duration="${input.slides.length}" data-width="${WIDTH}" data-height="${HEIGHT}">${scenes}</main>
<script src="assets/gsap.min.js"></script><script>
window.__timelines = window.__timelines || {};
const timeline = gsap.timeline({ paused:true });
timeline.to("#root", { opacity:1, duration:${input.slides.length} }, 0);
window.__timelines.main = timeline;
timeline.seek(0);
</script></body></html>`;
}

async function run(bin: string, args: string[], cwd: string): Promise<string> {
  try {
    const result = await execFileAsync(bin, args, {
      cwd, timeout: 240_000, maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, HYPERFRAMES_TELEMETRY: '0', CI: '1' },
    });
    return `${result.stdout}\n${result.stderr}`.trim();
  } catch (error) {
    const detail = error as { stdout?: string; stderr?: string; message?: string };
    const output = `${detail.stdout ?? ''}\n${detail.stderr ?? ''}`.trim();
    throw new Error(`HyperFrames ${args[0] ?? ''} 失敗：${(output || detail.message || '未知錯誤').slice(-3000)}`, { cause: error });
  }
}

export async function renderWithHyperframes(input: {
  slides: CarouselSlide[]; brand: BrandCreativeProfile; materials: RenderMaterial[];
}): Promise<RenderedCarousel> {
  const directory = await mkdtemp(resolve(tmpdir(), 'headx-carousel-'));
  const bin = process.env.HYPERFRAMES_BIN ?? resolve(process.cwd(), 'node_modules/.bin/hyperframes');
  try {
    await mkdir(resolve(directory, 'assets'), { recursive: true });
    const gsapPackage = require.resolve('gsap/package.json');
    await copyFile(resolve(dirname(gsapPackage), 'dist/gsap.min.js'), resolve(directory, 'assets/gsap.min.js'));
    await writeFile(resolve(directory, 'index.html'), compositionHtml(input), 'utf8');
    await writeFile(resolve(directory, 'package.json'), JSON.stringify({ private: true, type: 'module', scripts: { check: `hyperframes check`, render: `hyperframes render` } }), 'utf8');
    await writeFile(resolve(directory, 'hyperframes.json'), JSON.stringify({ media: { autoProxy: false } }), 'utf8');
    await writeFile(resolve(directory, 'meta.json'), JSON.stringify({ name: 'HeadX IG Carousel', renderer: 'hyperframes', version: HYPERFRAMES_VERSION }), 'utf8');

    await run(bin, ['check', '--json', '--no-cache', '--no-craft', '--timeout=60000'], directory);
    const snapshotDir = resolve(directory, 'snapshots');
    const at = input.slides.map((_slide, index) => `${index + 0.5}`).join(',');
    await run(bin, ['snapshot', `--at=${at}`, '--no-end', `--output=${snapshotDir}`, '--json', '--timeout=60000'], directory);
    const names = (await readdir(snapshotDir)).filter((name) => name.endsWith('.png')).sort((a, b) => {
      const aTime = Number(/at-([\d.]+)s/.exec(a)?.[1] ?? 0);
      const bTime = Number(/at-([\d.]+)s/.exec(b)?.[1] ?? 0);
      return aTime - bTime || a.localeCompare(b);
    });
    if (names.length !== input.slides.length) throw new Error(`HyperFrames 應輸出 ${input.slides.length} 頁，實際只有 ${names.length} 頁`);

    const pages: RenderedCarousel['pages'] = [];
    const archiveFiles: Record<string, Uint8Array> = {};
    for (const [index, name] of names.entries()) {
      const body = await readFile(resolve(snapshotDir, name));
      const metadata = await sharp(body).metadata();
      if (metadata.width !== WIDTH || metadata.height !== HEIGHT) throw new Error(`第 ${index + 1} 頁尺寸是 ${metadata.width ?? 0}×${metadata.height ?? 0}，不是 1080×1350`);
      const pageName = `slide-${String(index + 1).padStart(2, '0')}.png`;
      pages.push({ name: pageName, body, width: WIDTH, height: HEIGHT });
      archiveFiles[pageName] = new Uint8Array(body);
    }
    return { pages, archive: { name: 'ig-carousel.zip', body: Buffer.from(zipSync(archiveFiles, { level: 6 })) } };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

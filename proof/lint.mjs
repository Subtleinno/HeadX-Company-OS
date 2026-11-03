#!/usr/bin/env node
/**
 * lint.mjs —— 策略條款檢查器（可行性驗證用）
 *
 * 它做一件很具體的事：把 catalog 裡 strategy.mandatory 的條款，變成可執行的檢查，
 * 然後對一個真實的影片檔案跑一遍，輸出逐條 pass / fail / skip。
 *
 * 三個原則：
 *   1. 檢查不到就說 skip，不假裝 pass。
 *   2. 門檻值來自 catalog（政策即資料），不寫死在程式裡。
 *   3. 每條結果都附證據數字，人可以自己判斷合不合理。
 *
 * 用法：
 *   node lint.mjs --video <file.mp4> --catalog <catalog.json> --project <project.json>
 *   加上 --json 只輸出 JSON。
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/* ---------- 參數 ---------- */

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}

const videoPath = arg("video");
const catalogPath = arg("catalog", "catalog/video.json");
const projectPath = arg("project", "project.json");
const asJson = Boolean(arg("json", false));

if (!videoPath) {
  console.error("缺少 --video");
  process.exit(2);
}

const catalog = JSON.parse(readFileSync(resolve(catalogPath), "utf8"));
const project = JSON.parse(readFileSync(resolve(projectPath), "utf8"));

/* ---------- ffprobe / ffmpeg 包裝 ---------- */

function probe(file) {
  const raw = execFileSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0",
     "-show_entries", "stream=width,height,nb_frames,r_frame_rate",
     "-show_entries", "format=duration",
     "-of", "json", file],
    { encoding: "utf8" },
  );
  const j = JSON.parse(raw);
  const s = j.streams?.[0] ?? {};
  return {
    width: Number(s.width),
    height: Number(s.height),
    frames: Number(s.nb_frames ?? 0),
    fps: s.r_frame_rate ? Number(s.r_frame_rate.split("/")[0]) / Number(s.r_frame_rate.split("/")[1] || 1) : null,
    duration: Number(j.format?.duration ?? 0),
  };
}

/**
 * 量一個橫向條帶的「邊緣能量」。
 * 做法：裁出條帶 → sobel（取邊緣）→ signalstats 的 YAVG（亮度平均）。
 * 邊緣多＝有內容（文字、圖形、徽章）；邊緣少＝乾淨背景。
 * 回傳逐幀平均值的最大值與中位數。
 */
function bandEdgeEnergy(file, { x, y, w, h }, maxFrames = 240) {
  const filter = `crop=${w}:${h}:${x}:${y},sobel,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-`;
  let out = "";
  try {
    out = execFileSync("ffmpeg",
      ["-v", "error", "-i", file, "-vf", filter, "-frames:v", String(maxFrames), "-f", "null", "-"],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    return { ok: false, reason: String(e.message ?? e).slice(0, 200) };
  }
  const values = [...out.matchAll(/YAVG=([0-9.]+)/g)].map((m) => Number(m[1]));
  if (!values.length) return { ok: false, reason: "沒有量到任何幀" };
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const max = sorted[sorted.length - 1];
  return { ok: true, frames: values.length, median, max };
}

/* ---------- 檢查實作 ---------- */

const CHECKS = {
  /** 尺寸與格式規格一致 */
  dimension(rule, ctx) {
    const spec = ctx.format;
    if (!spec) return { status: "skip", detail: "catalog 裡沒有這個格式的規格" };
    const pass = ctx.meta.width === spec.width && ctx.meta.height === spec.height;
    return {
      status: pass ? "pass" : "fail",
      detail: `實際 ${ctx.meta.width}x${ctx.meta.height}，規格 ${spec.width}x${spec.height}`,
    };
  },

  /** 長度不超過上限 */
  duration(rule, ctx) {
    const spec = ctx.format;
    if (!spec?.maxSeconds) return { status: "skip", detail: "catalog 裡沒有長度上限" };
    const pass = ctx.meta.duration <= spec.maxSeconds + 0.05;
    return {
      status: pass ? "pass" : "fail",
      detail: `實際 ${ctx.meta.duration.toFixed(2)}s，上限 ${spec.maxSeconds}s`,
    };
  },

  /** 安全區內不得有內容（用邊緣能量判斷） */
  "safe-zone"(rule, ctx) {
    const spec = ctx.format;
    if (!spec?.safeZone) return { status: "skip", detail: "catalog 裡沒有安全區規格" };

    const zones = [
      { name: "上", band: { x: 0, y: 0, w: ctx.meta.width, h: spec.safeZone.top } },
      { name: "下", band: { x: 0, y: ctx.meta.height - spec.safeZone.bottom, w: ctx.meta.width, h: spec.safeZone.bottom } },
    ];

    const limit = spec.safeZone.maxEdgeEnergy ?? 5;
    const results = zones.map((z) => ({ name: z.name, ...bandEdgeEnergy(ctx.file, z.band) }));
    const broken = results.filter((r) => r.ok && r.max > limit);
    const unmeasured = results.filter((r) => !r.ok);

    const detail = results
      .map((r) => (r.ok ? `${r.name}帶 max=${r.max.toFixed(2)} (${r.frames} 幀)` : `${r.name}帶量不到`))
      .join("；") + `；門檻 ${limit}`;

    if (unmeasured.length === zones.length) return { status: "skip", detail };
    return { status: broken.length ? "fail" : "pass", detail };
  },

  /** 字幕軌存在（檢查來源，不是檢查畫面） */
  "caption-track"(rule, ctx) {
    if (!ctx.sourceHtml) return { status: "skip", detail: "沒有提供 --source，無法檢查來源" };
    const has = /data-caption-track/.test(ctx.sourceHtml);
    return {
      status: has ? "pass" : "fail",
      detail: has ? "來源有宣告 data-caption-track" : "來源沒有宣告字幕軌",
    };
  },

  /** 只給指引，不做機器判斷 */
  "hook-2s"(rule) {
    return { status: "skip", detail: "指引類條款，需人判斷（前 2 秒是否出現主張）" };
  },
};

/* ---------- 主流程 ---------- */

const strategyKey = project.strategy;
const strategy = catalog.strategies.find((s) => s.key === strategyKey);
if (!strategy) {
  console.error(`專案指定的策略在目錄裡不存在：${strategyKey}`);
  process.exit(2);
}

const sub = catalog.channels
  ?.flatMap((c) => c.subs ?? [])
  .find((s) => s.key === project.sub);
const format = sub?.formats?.find((f) => f.key === project.format) ?? sub?.format ?? null;

const meta = probe(videoPath);
const sourceHtml = arg("source") ? readFileSync(resolve(arg("source")), "utf8") : null;

const ctx = { file: videoPath, meta, format, sourceHtml };

const results = [];
for (const rule of strategy.mandatory ?? []) {
  const fn = CHECKS[rule.check];
  const outcome = fn ? fn(rule, ctx) : { status: "skip", detail: `未實作的檢查：${rule.check}` };
  results.push({ id: rule.id, check: rule.check, kind: rule.kind, text: rule.text, ...outcome });
}

const counts = results.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {});
const verdict = counts.fail ? "fail" : counts.pass ? "pass" : "skip";

if (asJson) {
  console.log(JSON.stringify({ video: videoPath, strategy: strategyKey, verdict, meta, counts, results }, null, 2));
} else {
  console.log(`\n策略：${strategyKey}  (${strategy.title?.zh ?? ""})`);
  console.log(`影片：${videoPath}`);
  console.log(`規格：${meta.width}x${meta.height} · ${meta.duration.toFixed(2)}s · ${meta.frames} 幀\n`);
  for (const r of results) {
    const mark = r.status === "pass" ? "PASS" : r.status === "fail" ? "FAIL" : "SKIP";
    console.log(`  [${mark}] ${r.id} ${r.check} — ${r.text}`);
    console.log(`         ${r.detail}`);
  }
  console.log(`\n結論：${verdict}   (pass ${counts.pass ?? 0} / fail ${counts.fail ?? 0} / skip ${counts.skip ?? 0})\n`);
}

process.exit(verdict === "fail" ? 1 : 0);

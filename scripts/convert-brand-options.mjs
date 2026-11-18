// 一次性轉換腳本：把 Perplexity idea Branding 12 個 stage 的 options.js
// 轉成 brand_guide_option 選項 + brand_guide_stage.text_fields 的 SQL seed。
//
// 用法：node scripts/convert-brand-options.mjs > db/migrations/0026_brand_guide_seed_stages.sql
//
// 處理四種欄位：
//   CAT（category 多選）  -> brand_guide_option, field_type='category'
//   DIALS（-2~+2 刻度）   -> brand_guide_option, field_type='dial'
//   SETS/DIMS（dim 單選） -> brand_guide_option, field_type='dim'
//   TEXTS（文字欄）       -> brand_guide_stage.text_fields（不是選項）
//
// 每條選項保留 reference 的所有欄位（desc/r/reg flag/s1/lic/t/...）入 extra jsonb，
// 方便下游 stage 的 checks/hints 邏輯讀取。

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', 'Perplexity idea', 'Branding');

const STAGE_DIRS = [
  'headx-stage0-business-v2',
  'headx-stage1-positioning-v9',
  'headx-stage2-material-v1',
  'headx-stage3-voice-v1',
  'headx-stage4a-identity-v1',
  'headx-stage4b-surface-v1',
  'headx-stage4c-motion-v1',
  'headx-stage4d-product-v1',
  'headx-stage4e-ui-space-v1',
  'headx-stage4f-marketing-v3',
  'headx-stage4g-governance-v1',
  'headx-stage4h-library-v1',
];

const STAGE_KEY = {
  'headx-stage0-business-v2': 'stage0',
  'headx-stage1-positioning-v9': 'stage1',
  'headx-stage2-material-v1': 'stage2',
  'headx-stage3-voice-v1': 'stage3',
  'headx-stage4a-identity-v1': 'stage4a',
  'headx-stage4b-surface-v1': 'stage4b',
  'headx-stage4c-motion-v1': 'stage4c',
  'headx-stage4d-product-v1': 'stage4d',
  'headx-stage4e-ui-space-v1': 'stage4e',
  'headx-stage4f-marketing-v3': 'stage4f',
  'headx-stage4g-governance-v1': 'stage4g',
  'headx-stage4h-library-v1': 'stage4h',
};

function sqlStr(s) {
  if (s === null || s === undefined) return null;
  return String(s).replace(/'/g, "''");
}

function loadOptions(dir) {
  const code = readFileSync(join(ROOT, dir, 'options.js'), 'utf8');
  // const/let 是 block-scoped，不會掛到 context 對象；在 code 結尾加一段
  // export 把需要的變數搬到 globalThis，再讀回。
  const withExport =
    code +
    '\n;globalThis.__export = {' +
    " CAT: typeof CAT!=='undefined'?CAT:undefined," +
    " DIALS: typeof DIALS!=='undefined'?DIALS:undefined," +
    " DIMS: typeof DIMS!=='undefined'?DIMS:undefined," +
    " SETS: typeof SETS!=='undefined'?SETS:undefined," +
    " TEXTS: typeof TEXTS!=='undefined'?TEXTS:undefined };";
  const sandbox = { globalThis: null };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(withExport, sandbox, { filename: `${dir}/options.js` });
  return sandbox.__export ?? {};
}

// 收集一個 stage 的所有選項（category + dim + dial），每一條是一行。
function collectOptions(stage, sb) {
  const rows = [];
  const push = (fieldType, dimension, opt, groupName, sortOrder) => {
    const extra = {};
    let regFlag = null;
    let licence = null;
    // reference 的額外欄位：reg flag（r 或 f 陣列）與牌照（lic 字串）提取到
    // 獨立欄位（合規檢查要 query），其餘放 extra jsonb 保留。
    const known = new Set(['id', 'zh', 'desc', 'r', 'f', 'lic']);
    for (const [k, v] of Object.entries(opt)) {
      if (k === 'r' && Array.isArray(v)) {
        regFlag = v.join(',');
        continue;
      }
      if (k === 'f' && typeof v === 'string') {
        regFlag = v;
        continue;
      }
      if (k === 'lic' && typeof v === 'string' && v !== '') {
        licence = v;
        continue;
      }
      if (known.has(k)) continue;
      extra[k] = v;
    }
    rows.push({ stage, fieldType, dimension, opt, groupName, sortOrder, extra, regFlag, licence });
  };

  // CAT: { key: { title, max, hint, groups: [{g, items:[...]}] } }
  if (sb.CAT) {
    for (const [key, cat] of Object.entries(sb.CAT)) {
      if (!cat || typeof cat !== 'object' || !Array.isArray(cat.groups)) continue;
      let sort = 0;
      for (const grp of cat.groups) {
        for (const item of grp.items) {
          push('category', key, item, grp.g, sort++);
        }
      }
    }
  }

  // DIALS: [ { id, l, r, q, le, re, lw, rw } ]
  if (Array.isArray(sb.DIALS)) {
    for (const d of sb.DIALS) {
      push('dial', d.id, d, '', 0);
    }
  }

  // DIMS（扁平）: [ { id, title, q, opts:[{id,zh,desc,tok}] } ]
  if (Array.isArray(sb.DIMS)) {
    for (const dim of sb.DIMS) {
      let sort = 0;
      for (const opt of dim.opts) {
        push('dim', dim.id, opt, '', sort++);
      }
    }
  }

  // SETS: { set: { title, dims:[{id,title,q,opts:[...]}] } }
  if (sb.SETS) {
    for (const set of Object.values(sb.SETS)) {
      if (!set || typeof set !== 'object' || !Array.isArray(set.dims)) continue;
      for (const dim of set.dims) {
        let sort = 0;
        for (const opt of dim.opts) {
          push('dim', dim.id, opt, '', sort++);
        }
      }
    }
  }

  return rows;
}

function escJson(obj) {
  // 空 extra 回 NULL，非空回 json 字串。
  if (Object.keys(obj).length === 0) return 'NULL';
  return "'" + sqlStr(JSON.stringify(obj)) + "'::jsonb";
}

const out = [];
out.push('-- 品牌引導 12 stage 選項庫種子（由 reference options.js 一次性轉換）。');
out.push('-- 選項欄位：category（多選）、dim（單選）、dial（刻度）。');
out.push('-- 文字欄位（TEXTS）不進選項表，寫入 brand_guide_stage.text_fields。');
out.push('');

let totalOptions = 0;

for (const dir of STAGE_DIRS) {
  const stage = STAGE_KEY[dir];
  const sb = loadOptions(dir);
  const options = collectOptions(stage, sb);

  out.push(`-- ── ${stage} ── ${dir} ────────────────────────────`);
  out.push('');

  // 選項
  if (options.length > 0) {
    out.push('insert into brand_guide_option');
    out.push('  (stage, dimension, opt_id, zh, description, group_name, sort_order, field_type, reg_flag, licence, extra)');
    out.push('values');
    const valueLines = options.map((r) => {
      totalOptions += 1;
      const zh = sqlStr(r.opt.zh);
      const desc = sqlStr(r.opt.desc || '');
      const group = sqlStr(r.groupName || '');
      const extra = escJson(r.extra);
      const reg = r.regFlag ? `'${sqlStr(r.regFlag)}'` : 'NULL';
      const lic = r.licence ? `'${sqlStr(r.licence)}'` : 'NULL';
      return `  ('${stage}', '${r.dimension}', '${r.opt.id}', '${zh}', '${desc}', '${group}', ${r.sortOrder}, '${r.fieldType}', ${reg}, ${lic}, ${extra})`;
    });
    out.push(valueLines.join(',\n'));
    out.push('on conflict (stage, dimension, opt_id) do nothing;');
    out.push('');
  }

  // 文字欄位（TEXTS）
  if (Array.isArray(sb.TEXTS) && sb.TEXTS.length > 0) {
    const fields = sb.TEXTS.map((t) => ({
      id: t.id,
      label: t.label || t.id,
      ph: t.ph || '',
      help: t.help || '',
      rows: t.rows || 2,
    }));
    out.push('update brand_guide_stage');
    out.push(`   set text_fields = '${sqlStr(JSON.stringify(fields))}'::jsonb`);
    out.push(` where stage = '${stage}';`);
    out.push('');
  }
}

// 文字欄位少的 stage（stage1/2 冇 TEXTS）用空陣列。
out.push('-- 沒有 TEXTS 的 stage 補空陣列，避免 NULL。');
out.push("update brand_guide_stage set text_fields = '[]'::jsonb where text_fields is null;");
out.push('');

console.error(`共 ${totalOptions} 條選項`);

process.stdout.write(out.join('\n'));

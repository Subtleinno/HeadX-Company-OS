/**
 * 品牌引導引擎：把 reference（Perplexity idea Branding stage0–4h）的
 * options.js + core.js 原封不動載入，喺 Node 後端執行計算邏輯。
 *
 * reference 是純函數（state → brief／checks／hints／canvas），唯一 browser
 * 依賴是 localStorage（load/save）。這裡用 vm 執行，把 localStorage 換成
 * 傳入的 state 對象 —— 計算函數只讀 state，不寫 localStorage。
 *
 * 選項數據已入 DB（brand_guide_option），但計算邏輯仍用 reference 原封，
 * 保真不遷移錯。引擎 load 一個 stage 的 options.js + core.js，暴露計算函數。
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

/** 12 個 stage 的 reference 檔案前綴（對應 engine/reference/ 目錄）。 */
const STAGE_DIRS: Record<string, string> = {
  stage0: 'headx-stage0-business-v2',
  stage1: 'headx-stage1-positioning-v9',
  stage2: 'headx-stage2-material-v1',
  stage3: 'headx-stage3-voice-v1',
  stage4a: 'headx-stage4a-identity-v1',
  stage4b: 'headx-stage4b-surface-v1',
  stage4c: 'headx-stage4c-motion-v1',
  stage4d: 'headx-stage4d-product-v1',
  stage4e: 'headx-stage4e-ui-space-v1',
  stage4f: 'headx-stage4f-marketing-v3',
  stage4g: 'headx-stage4g-governance-v1',
  stage4h: 'headx-stage4h-library-v1',
};

/**
 * 每個 stage 的 reference 檔案載入順序（有些 stage 依賴額外檔案）。
 * 順序跟 reference edit.html 的 <script src> 一致。
 */
const STAGE_FILES: Record<string, string[]> = {
  stage4a: ['color', 'options', 'core', 'prompts', 'ui'],
  stage4f: ['options', 'tpl-data', 'core', 'tpl-logic', 'prompts'],
};
/** 預設順序（大部份 stage）。 */
const DEFAULT_FILES = ['options', 'core', 'prompts'];

/** 引擎暴露的通用計算函數（每個 stage 都有）。 */
export type StageEngine = {
  stage: string;
  /** 初始空 state（reference 的 emptyState()）。 */
  emptyState: () => Record<string, unknown>;
  /** buildBrief(s)：輸出結構化 brief JSON。 */
  buildBrief: (state: Record<string, unknown>) => Record<string, unknown>;
  /** checks(s)：一致性檢查，回 {level,msg}[]。 */
  checks: (state: Record<string, unknown>) => { level: string; msg: string }[];
  /** completeness(s)：完成度，回 {done,total,pct,missing}。 */
  completeness: (state: Record<string, unknown>) => {
    done: number;
    total: number;
    pct: number;
    missing: { key: string; label: string }[];
  };
  /** hints(s)：下游建議，回 {stage,field,text,why}[]。 */
  hints: (state: Record<string, unknown>) => {
    stage: string;
    field: string;
    text: string;
    why: string;
  }[];
  /** applyPaste(text, s)：貼回 AI 結果（fuzzy matching）。 */
  applyPaste: (text: string, state: Record<string, unknown>) => Record<string, unknown>;
  /** 討論提示詞（prompts.js 的 PROMPTS）：key -> (state) -> prompt 文字。 */
  prompts: Record<string, (state: Record<string, unknown>) => string>;
  /** 選項結構（options.js 的 CAT/SETS/DIMS_ALL/TEXTS/LINKS），供前端畫 Edit 卡片。 */
  schema: Record<string, unknown>;
  /** reference 暴露的全部頂層 globals（含 stage 專屬的 DIALS／TENSIONS／
   *  MAT_KEYS／SETS／DIMS 等選項結構，以及 draft／checkText／tokensCSS 等
   *  stage 專屬輔助函數）。前端需要 stage 專屬結構時由呢度攞。 */
  globals: Record<string, unknown>;
  /** 跨 stage 連繫：把前 stage 的 brief 注入 state 的 s0/s1/s2/... 欄位，
   *  回一個新的 state（模擬 reference 的 autoImport／autoS1）。
   *  priorBriefs：stage -> brief JSON（例如 {stage0: {...}, stage1: {...}}）。 */
  importPrior: (
    state: Record<string, unknown>,
    priorBriefs: Record<string, Record<string, unknown>>,
  ) => Record<string, unknown>;
};

/**
 * 讀 reference 檔案。檔案在 engine/reference/ 目錄，runtime 讀取。
 * build 時 copy 到 dist。
 */
function readReference(stage: string, kind: string): string {
  const dir = STAGE_DIRS[stage];

  if (dir === undefined) {
    throw new Error(`未知 stage：${stage}`);
  }

  // reference 檔案 build 時 copy 到 dist/brand-guide/engine/reference/。
  // runtime 的 cwd 視乎啟動方式（node dist/server.js 時 cwd = apps/platform），
  // 所以試多個候選相對路徑，由近到遠。
  const candidates = [
    join('dist', 'brand-guide', 'engine', 'reference', `${dir}.${kind}.js`),
    join('src', 'brand-guide', 'engine', 'reference', `${dir}.${kind}.js`),
    join(process.cwd(), 'dist', 'brand-guide', 'engine', 'reference', `${dir}.${kind}.js`),
    join(process.cwd(), 'src', 'brand-guide', 'engine', 'reference', `${dir}.${kind}.js`),
    join(process.cwd(), 'apps', 'platform', 'dist', 'brand-guide', 'engine', 'reference', `${dir}.${kind}.js`),
    join(process.cwd(), 'apps', 'platform', 'src', 'brand-guide', 'engine', 'reference', `${dir}.${kind}.js`),
  ];

  for (const path of candidates) {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      // 試下一個候選位置。
    }
  }

  throw new Error(`找不到 ${stage} 的 ${kind} 檔案`);
}

/**
 * 載入一個 stage 的計算引擎。
 *
 * 把 stage 的 reference 檔案（options/core/prompts，加 stage4a 的 color/ui、
 * stage4f 的 tpl-data/tpl-logic）按 reference edit.html 的順序喺同一 vm
 * context 執行，再讀回計算函數。
 */
export function loadStageEngine(stage: string): StageEngine {
  const files = STAGE_FILES[stage] ?? DEFAULT_FILES;
  const code = files.map((kind) => readReference(stage, kind)).join('\n');

  // 提供一個 localStorage shim（core.js 的 load/save 用）。引擎計算不依賴
  // load/save（計算函數收 state 參數），但 core.js 頂部定義它們，要能解析。
  // 跨 stage 連繫時，importPrior 會用 setItem 注入 brand_brief_stage{N}，
  // 再由 reference 的 autoImport 用 getItem 讀回 —— 所以要真嘅 key-value store。
  const localStore = new Map<string, string>();
  const sandbox: Record<string, unknown> = {
    localStorage: {
      getItem: (key: string) => (localStore.has(key) ? localStore.get(key)! : null),
      setItem: (key: string, value: string) => {
        localStore.set(key, String(value));
      },
      removeItem: (key: string) => {
        localStore.delete(key);
      },
    },
    console,
  };
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);

  const exportCode = `
;globalThis.__engine = {
  emptyState: typeof emptyState==='function' ? emptyState : null,
  buildBrief: typeof buildBrief==='function' ? buildBrief : null,
  checks: typeof checks==='function' ? checks : null,
  completeness: typeof completeness==='function' ? completeness : null,
  hints: typeof hints==='function' ? hints : null,
  applyPaste: typeof applyPaste==='function' ? applyPaste : null,
  prompts: typeof PROMPTS==='object' ? PROMPTS : null,
  schema: {
    cat: typeof CAT==='object' ? CAT : null,
    sets: typeof SETS==='object' ? SETS : null,
    dimsAll: typeof DIMS_ALL==='object' ? DIMS_ALL : null,
    texts: typeof TEXTS==='object' ? TEXTS : null,
    textBy: typeof TEXT_BY==='object' ? TEXT_BY : null,
    links: typeof LINKS==='object' ? LINKS : null,
    catKeys: typeof CAT_KEYS==='object' ? CAT_KEYS : null,
    matKeys: typeof MAT_KEYS==='object' ? MAT_KEYS : null,
    dials: typeof DIALS==='object' ? DIALS : null,
    dialPos: typeof DIAL_POS==='object' ? DIAL_POS : null,
    tensions: typeof TENSIONS==='object' ? TENSIONS : null,
    dims: typeof DIMS==='object' ? DIMS : null,
    shifts: typeof SHIFTS==='object' ? SHIFTS : null,
    situations: typeof SITUATIONS==='object' ? SITUATIONS : null,
  },
  globals: {
    CAT: typeof CAT==='object' ? CAT : undefined,
    CAT_KEYS: typeof CAT_KEYS==='object' ? CAT_KEYS : undefined,
    MAT_KEYS: typeof MAT_KEYS==='object' ? MAT_KEYS : undefined,
    DIALS: typeof DIALS==='object' ? DIALS : undefined,
    DIAL_POS: typeof DIAL_POS==='object' ? DIAL_POS : undefined,
    TENSIONS: typeof TENSIONS==='object' ? TENSIONS : undefined,
    SETS: typeof SETS==='object' ? SETS : undefined,
    DIMS: typeof DIMS==='object' ? DIMS : undefined,
    DIMS_ALL: typeof DIMS_ALL==='object' ? DIMS_ALL : undefined,
    TEXTS: typeof TEXTS==='object' ? TEXTS : undefined,
    TEXT_BY: typeof TEXT_BY==='object' ? TEXT_BY : undefined,
    LINKS: typeof LINKS==='object' ? LINKS : undefined,
    SHIFTS: typeof SHIFTS==='object' ? SHIFTS : undefined,
    SITUATIONS: typeof SITUATIONS==='object' ? SITUATIONS : undefined,
    STATUS: typeof STATUS==='object' ? STATUS : undefined,
    LOGO_STATUS: typeof LOGO_STATUS==='object' ? LOGO_STATUS : undefined,
    draft: typeof draft==='function' ? draft : undefined,
    checkText: typeof checkText==='function' ? checkText : undefined,
    tokensCSS: typeof tokensCSS==='function' ? tokensCSS : undefined,
    buildTokens: typeof buildTokens==='function' ? buildTokens : undefined,
    tokensOf: typeof tokensOf==='function' ? tokensOf : undefined,
    s1Text: typeof s1Text==='function' ? s1Text : undefined,
  },
  // 跨 stage 連繫：reference 的匯入函數。下游 stage 用佢哋把前 stage 的
  // brief 拆成 state.s0/s1/s2/...，做 cross-check／prefill／agent context。
  import: {
    autoImport: typeof autoImport==='function' ? autoImport : null,
    autoS1: typeof autoS1==='function' ? autoS1 : null,
    parseStage: typeof parseStage==='function' ? parseStage : null,
    parseS0: typeof parseS0==='function' ? parseS0 : null,
    parseS1: typeof parseS1==='function' ? parseS1 : null,
    parseS2: typeof parseS2==='function' ? parseS2 : null,
    parseS3: typeof parseS3==='function' ? parseS3 : null,
    parseS4a: typeof parseS4a==='function' ? parseS4a : null,
    parseS4b: typeof parseS4b==='function' ? parseS4b : null,
    parseS4c: typeof parseS4c==='function' ? parseS4c : null,
    parseS4d: typeof parseS4d==='function' ? parseS4d : null,
    parseS4e: typeof parseS4e==='function' ? parseS4e : null,
    parseS4f: typeof parseS4f==='function' ? parseS4f : null,
    parseS4g: typeof parseS4g==='function' ? parseS4g : null,
  },
  // 跨 stage 連繫主流程：把 priorBriefs（stage -> brief JSON）塞入 localStorage
  // 的 brand_brief_stage{N} key，再跑 reference 自己的匯入流程（autoImport /
  // autoS1 / parseStage），回一個已注入 s0/s1/... 的新 state。
  importPrior: function(state, priorBriefs){
    // 清空舊的 brief key，再注入今次的。
    ['brand_brief_stage0','brand_brief_stage1','brand_brief_stage2','brand_brief_stage3',
     'brand_brief_stage4a','brand_brief_stage4b','brand_brief_stage4c','brand_brief_stage4d',
     'brand_brief_stage4e','brand_brief_stage4f','brand_brief_stage4g'].forEach(function(k){ localStorage.removeItem(k); });
    var pb = priorBriefs || {};
    Object.keys(pb).forEach(function(stageKey){
      var brief = pb[stageKey];
      var n = stageKey.replace('stage','');
      try { localStorage.setItem('brand_brief_stage' + n, JSON.stringify(brief)); } catch(e){}
    });
    var s = Object.assign({}, state);
    // 有 autoImport 就用（stage4b-4h）；否則有 autoS1（stage2）；否則 parseStage（stage4a）。
    if (typeof autoImport==='function') { try { s = autoImport(s); } catch(e){} }
    else if (typeof autoS1==='function') { try { s = autoS1(s); } catch(e){} }
    else if (typeof parseStage==='function') {
      // stage4a 用 parseStage，逐個前 brief 手動 parse 塞入。
      ['stage0','stage1','stage2','stage3'].forEach(function(k){
        var brief = pb[k];
        if (!brief || s[k]) return;
        try {
          var p = parseStage(brief);
          if (p && p.type===k) s[k] = p.data;
        } catch(e){}
      });
    }
    // stage3 冇 autoImport；用 parseS1/parseS2 手動注入。
    if (typeof parseS1==='function' && typeof autoImport!=='function' && typeof autoS1!=='function' && typeof parseStage!=='function') {
      try {
        var b1 = pb['stage1'];
        var b2 = pb['stage2'];
        if (b1 && !s.s1) { var p1 = parseS1(b1); if (p1) s.s1 = p1; }
        if (b2 && !s.s2) { var p2 = parseS2(b2); if (p2) s.s2 = p2; }
      } catch(e){}
    }
    return s;
  },
};`;

  vm.runInContext(code + exportCode, sandbox, {
    filename: `${stage}/engine.js`,
  });

  const engine = sandbox.__engine as Record<string, unknown>;

  if (typeof engine.buildBrief !== 'function') {
    throw new Error(`${stage} 引擎缺少 buildBrief 函數`);
  }

  // globals 裡「未定義」的 binding 會係 undefined，JSON 序列化時會消失。
  // 前端只需要拿到該 stage 實際定義咗嘅嘢。
  const rawGlobals = (engine.globals as Record<string, unknown>) ?? {};
  const globals: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawGlobals)) {
    if (value !== undefined) {
      globals[key] = value;
    }
  }

  return {
    stage,
    emptyState: (engine.emptyState as (() => Record<string, unknown>) | null)
      ?? (() => ({})),
    buildBrief: engine.buildBrief as StageEngine['buildBrief'],
    checks: (engine.checks as StageEngine['checks'] | null) ?? (() => []),
    completeness: (engine.completeness as StageEngine['completeness'] | null)
      ?? (() => ({ done: 0, total: 0, pct: 0, missing: [] })),
    hints: (engine.hints as StageEngine['hints'] | null) ?? (() => []),
    applyPaste: engine.applyPaste as StageEngine['applyPaste'],
    prompts: (engine.prompts as StageEngine['prompts'] | null) ?? {},
    schema: (engine.schema as Record<string, unknown>) ?? {},
    globals,
    importPrior: engine.importPrior as StageEngine['importPrior'],
  };
}

/**
 * 讀一個 stage 的選項結構（CAT/SETS/DIMS_ALL/TEXTS/LINKS）。
 * 前端畫 Edit 卡片需要知道每張卡片有咩 category／dim／text、每個選項的
 * 標題／說明／選項、每格文字欄的 label／placeholder。全部由 reference 原封
 * 吐出，保真不遷移錯。
 */
export function loadStageSchema(stage: string): Record<string, unknown> {
  return loadStageEngine(stage).schema;
}

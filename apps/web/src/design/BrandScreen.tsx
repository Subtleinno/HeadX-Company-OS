import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { t } from '@company-os/i18n';
import {
  brandGuideApi,
  companyGuideApi,
  deleteFile,
  fetchBrandSets,
  fetchGuideBriefs,
  fetchGuideMap,
  fetchLayer,
  fetchScopePrompt,
  fileDownloadUrl,
  layerExportUrl,
  saveScopePrompt,
  uploadFile,
  type BrandSetTree,
  type GuideApproval,
  type GuideBlock,
  type GuideBrief,
  type GuideEndpoints,
  type GuideMapDimension,
  type GuideSchema,
  type GuideStage,
  type LayerKind,
  type LayerProjection,
} from '../api';
import { navigatePath, useHashPath } from '../router';
import { BrandSetsRail } from './BrandSetsRail';
import { buildAgentInput, buildScopeAgentInput, isEmptyAgentInput, isEmptyScopeAgentInput } from './brand-agent-input';
import { buildBlockPrompt, type PromptField } from './brand-block-prompt';
import { buildScopePrompt, type ScopePromptStage } from './brand-scope-prompt';

/**
 * Brand 模組：品牌總覽（01–03）＋ 品牌集（04A–04H）＋ 每階段 dashboard。
 *
 * 2026-11-17 晚老闆定：04A–04H 不是品牌的一部分，而是「一套做法」（brand
 * set）。同一副品牌性格一年可以生幾套，每套都可以重複套用到任何產品／設計／
 * 輸出。所以左欄是一棵「資料夾 → 品牌集」的樹，04 的答案住在品牌集裡；
 * 01–03 仍然留在品牌總覽，因為那只有一份。
 *
 * 00 業務基礎不在這裡（老闆 2026-11-17：它屬公司層），改由 Boss Portal › 品牌
 * 用同一個 `StageDetail` 打開；`StageDetail` 因此收 `stages` 與 `showBack`，
 * 決定「這一串階段有邊幾站」。
 *
 * 三層互動：
 *   1. 總覽：每個階段一張卡，每格一條進度條，講得出「還缺幾項」。
 *   2. 點卡 → 該階段的 dashboard：業務畫布、填寫區塊。
 *   3. 每張區塊卡自己是一個工作單位：位置編號＋名稱、可複製的 AI Agent
 *      prompt（跟住選擇即時更新）、上載檔案、決策記錄、歷史。點卡身就即場
 *      改選項，唔使跳去另一個 mode。
 *
 * 資料全部來自後端 brand-guide 端點（schema／state／brief／blocks）。後端
 * schema 各 stage 形狀不同（有的有 SETS／有的只有 DIMS／DIALS 或 TENSIONS 為
 * null），這裡先正規化成統一的 Field 模型再畫，避免逐 stage 寫死。
 */

type LoadState = 'loading' | 'ready' | 'failed';

/* ── 階段目錄 ───────────────────────────────────────────── */

type StageEntry = { id: GuideStage; num: string; name: string };

const STAGES: StageEntry[] = [
  { id: 'stage0', num: '00', name: t('brandBuild.stage.stage0') },
  { id: 'stage1', num: '01', name: t('brandBuild.stage.stage1') },
  { id: 'stage2', num: '02', name: t('brandBuild.stage.stage2') },
  { id: 'stage3', num: '03', name: t('brandBuild.stage.stage3') },
  { id: 'stage4a', num: '04A', name: t('brandBuild.stage.stage4a') },
  { id: 'stage4b', num: '04B', name: t('brandBuild.stage.stage4b') },
  { id: 'stage4c', num: '04C', name: t('brandBuild.stage.stage4c') },
  { id: 'stage4d', num: '04D', name: t('brandBuild.stage.stage4d') },
  { id: 'stage4e', num: '04E', name: t('brandBuild.stage.stage4e') },
  { id: 'stage4f', num: '04F', name: t('brandBuild.stage.stage4f') },
  { id: 'stage4g', num: '04G', name: t('brandBuild.stage.stage4g') },
  { id: 'stage4h', num: '04H', name: t('brandBuild.stage.stage4h') },
];

/**
 * 品牌建立（Design）由 01 開始。
 *
 * 00 業務基礎講的是「這門生意怎麼運作」，屬於公司層，老闆 2026-11-17 把它
 * 搬到 Boss Portal › 品牌（見 `BrandBusinessStage`）。同一個區塊只留一個入口，
 * 兩邊都有的話，填邊一份都會有人問「另一份係唔係舊嘅」。
 */
const CORE_STAGES: readonly StageEntry[] = STAGES.filter(
  (stage) => stage.id === 'stage1' || stage.id === 'stage2' || stage.id === 'stage3',
);

/**
 * 04A 核心識別、04G 治理：跟著品牌走，不住品牌集（老闆 2026-11-17 晚定）。
 *
 * 理由就是老闆講的那句：品牌集是不停變的一批做法，核心識別與治理不是。
 * 把它們留在品牌集，每開一套新做法就要重填一次同一件事，四份答案早晚分叉。
 * 所以它們固定出現在左欄最上面，資料寫在品牌層（`brand_set_id is null`）。
 *
 * 04F 行銷內容不在這裡：那是全公司共用、只有老闆看得到的策略，
 * 住在 Boss Portal › Marketing（`brand_id is null`，見 `marketing`）。
 */
const BRAND_FIXED_ENTRIES: readonly StageEntry[] = STAGES.filter(
  (stage) => stage.id === 'stage4a' || stage.id === 'stage4g',
);

/** 品牌層可以直接開的 stage：01–03 總覽，加上 04A／04G 兩個固定項。 */
const BRAND_LEVEL_STAGES: readonly StageEntry[] = [...CORE_STAGES, ...BRAND_FIXED_ENTRIES];

/**
 * 品牌集只裝這五個：04B 圖形表面、04C、04D、04E、04H 風格庫與 AI。
 *
 * 同一個品牌可以有幾套（2026 夏季／冬季…），每套都可以重複套用到任何
 * 產品／設計／輸出，答案互不相干。
 */
const SET_STAGE_ENTRIES: readonly StageEntry[] = STAGES.filter(
  (stage) =>
    stage.id === 'stage4b' ||
    stage.id === 'stage4c' ||
    stage.id === 'stage4d' ||
    stage.id === 'stage4e' ||
    stage.id === 'stage4h',
);

/** 六個用途層（五層＋不入層）。導航主軸，見 BRAND-LAYER-RESTRUCTURE.md §4。 */
const LAYER_KINDS: readonly LayerKind[] = [
  'design-doc',
  'tokens',
  'templates',
  'examples',
  'checks',
  'unfiled',
];

const STAGE_IDS: readonly GuideStage[] = STAGES.map((s) => s.id);

function stageNum(stage: GuideStage): string {
  return STAGES.find((s) => s.id === stage)?.num ?? stage;
}

function stageName(stage: GuideStage): string {
  return STAGES.find((s) => s.id === stage)?.name ?? stage;
}

/* ── 正規化模型 ─────────────────────────────────────────── */

type Opt = { id: string; zh: string; desc?: string; img?: string };
type CatItem = { id: string; zh: string; desc?: string; lic?: string; img?: string };

type CatField = {
  k: 'cat';
  id: string;
  title: string;
  hint: string;
  max: number;
  groups: { g: string; items: CatItem[] }[];
};

type DimField = {
  k: 'dim';
  id: string;
  title: string;
  q: string;
  opts: Opt[];
  set: string;
  container: 'pick' | 'dims';
};

type DialField = {
  k: 'dial';
  id: string;
  title: string;
  q: string;
  l: string;
  r: string;
  le: string;
  re: string;
};

/** 單選一項：核心張力（tensionPrimary）或情境語氣（sit[situationId]）。 */
type OneField = {
  k: 'one';
  id: string;
  title: string;
  q: string;
  opts: Opt[];
  source: 'tension' | 'sit';
};

type TextField = {
  k: 'text';
  id: string;
  title: string;
  help: string;
  ph: string;
  rows: number;
};

type Field = CatField | DimField | DialField | OneField | TextField;

type Section = { id: string; title: string; fields: Field[] };
type Band = { id: string; title: string; sections: Section[] };

/**
 * 排好位置的區塊：位置編號（`00.1`）＋ 所屬 band。
 *
 * 為什麼要編號：一張卡要同人、同 AI 都講得清「係邊一格」。只有標題的話，
 * 「業務狀態」在兩個 stage 都可能有；編號跨 stage 唯一，貼 prompt 或者
 * 寫紀錄都對得返位。
 */
type PlacedSection = Section & { code: string; bandId: string; bandTitle: string };
type PlacedBand = { id: string; title: string; sections: PlacedSection[] };

type Model = {
  bands: PlacedBand[];
  sections: PlacedSection[];
  labelById: Map<string, string>;
};

type RawDim = { id: string; title?: string; q?: string; opts?: Opt[]; set?: string };
type RawCat = {
  title?: string;
  max?: number;
  hint?: string;
  groups?: { g?: string; items?: CatItem[] }[];
};
type RawText = { id: string; label?: string; ph?: string; help?: string; rows?: number };
type RawDial = { id: string; l?: string; r?: string; q?: string; le?: string; re?: string };

type RawSchema = {
  cat?: Record<string, RawCat> | null;
  sets?: Record<string, { title?: string; dims?: RawDim[] }> | null;
  dimsAll?: RawDim[] | null;
  dims?: RawDim[] | null;
  texts?: RawText[] | null;
  dials?: RawDial[] | null;
  tensions?: (Opt & { id: string })[] | null;
  situations?: { id: string; zh?: string; hint?: string; desc?: string }[] | null;
  shifts?: Opt[] | null;
  catKeys?: string[] | null;
};

function arr<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function buildModel(schema: GuideSchema | null, stage: GuideStage | null): Model {
  const labelById = new Map<string, string>();

  if (schema === null) {
    return { bands: [], sections: [], labelById };
  }

  const raw = schema as unknown as RawSchema;
  const cats = raw.cat ?? {};
  const sets = raw.sets ?? {};

  for (const cat of Object.values(cats)) {
    for (const group of arr(cat.groups)) {
      for (const item of arr(group.items)) {
        if (typeof item?.id === 'string') {
          labelById.set(item.id, str(item.zh) !== '' ? str(item.zh) : item.id);
        }
      }
    }
  }
  for (const dim of [...arr(raw.dimsAll), ...arr(raw.dims)]) {
    for (const opt of arr(dim.opts)) {
      if (typeof opt?.id === 'string') {
        labelById.set(opt.id, str(opt.zh) !== '' ? str(opt.zh) : opt.id);
      }
    }
  }
  for (const set of Object.values(sets)) {
    for (const dim of arr(set.dims)) {
      for (const opt of arr(dim.opts)) {
        if (typeof opt?.id === 'string') {
          labelById.set(opt.id, str(opt.zh) !== '' ? str(opt.zh) : opt.id);
        }
      }
    }
  }
  for (const tension of arr(raw.tensions)) {
    labelById.set(tension.id, str(tension.zh) !== '' ? str(tension.zh) : tension.id);
  }
  for (const shift of arr(raw.shifts)) {
    labelById.set(shift.id, str(shift.zh) !== '' ? str(shift.zh) : shift.id);
  }

  const bands: Band[] = [];

  // 1. 基本狀況：SETS 分組的單選維度。
  const setNames = Object.keys(sets);
  if (setNames.length > 0) {
    bands.push({
      id: 'basic',
      title: t('brandBuild.band.basic'),
      sections: setNames.map((name) => ({
        id: `set:${name}`,
        title: str(sets[name]?.title) !== '' ? str(sets[name]?.title) : name,
        fields: arr(sets[name]?.dims).map<Field>((dim) => ({
          k: 'dim',
          id: dim.id,
          title: str(dim.title) !== '' ? str(dim.title) : dim.id,
          q: str(dim.q),
          opts: arr(dim.opts),
          set: name,
          container: 'pick',
        })),
      })),
    });
  }

  // 2. 策略選擇：每一個 CAT 一張卡。
  const catKeys = arr(raw.catKeys).length > 0 ? arr(raw.catKeys) : Object.keys(cats);
  const catSections: Section[] = [];
  for (const key of catKeys) {
    const cat = cats[key];
    if (cat === undefined) {
      continue;
    }
    catSections.push({
      id: `cat:${key}`,
      title: str(cat.title) !== '' ? str(cat.title) : key,
      fields: [
        {
          k: 'cat',
          id: key,
          title: str(cat.title) !== '' ? str(cat.title) : key,
          hint: str(cat.hint),
          max: typeof cat.max === 'number' ? cat.max : 99,
          groups: arr(cat.groups).map((group) => ({ g: str(group.g), items: arr(group.items) })),
        },
      ],
    });
  }
  if (catSections.length > 0) {
    bands.push({ id: 'choice', title: t('brandBuild.band.choice'), sections: catSections });
  }

  // 3. 詳細設定：不在 SETS 內的單選維度（stage2 / 4b–4h 全是這一種）。
  const groupedIds = new Set<string>();
  for (const set of Object.values(sets)) {
    for (const dim of arr(set.dims)) {
      groupedIds.add(dim.id);
    }
  }
  const loose = arr(raw.dimsAll).length > 0 ? arr(raw.dimsAll) : arr(raw.dims);
  const ungrouped = loose.filter((dim) => !groupedIds.has(dim.id));
  if (ungrouped.length > 0) {
    bands.push({
      id: 'detail',
      title: t('brandBuild.band.detail'),
      sections: [
        {
          id: 'dims',
          title: t('brandBuild.section.dims'),
          fields: ungrouped.map<Field>((dim) => ({
            k: 'dim',
            id: dim.id,
            title: str(dim.title) !== '' ? str(dim.title) : dim.id,
            q: str(dim.q),
            opts: arr(dim.opts),
            set: str(dim.set),
            container: 'dims',
          })),
        },
      ],
    });
  }

  // 4. 語氣與張力：刻度、核心張力、情境語氣。
  const toneSections: Section[] = [];
  const dials = arr(raw.dials);
  if (dials.length > 0) {
    toneSections.push({
      id: 'dials',
      title: t('brandBuild.section.dials'),
      fields: dials.map<Field>((dial) => ({
        k: 'dial',
        id: dial.id,
        title: `${str(dial.l)} ⇄ ${str(dial.r)}`,
        q: str(dial.q),
        l: str(dial.l),
        r: str(dial.r),
        le: str(dial.le),
        re: str(dial.re),
      })),
    });
  }
  const tensions = arr(raw.tensions);
  if (tensions.length > 0) {
    toneSections.push({
      id: 'tensions',
      title: t('brandBuild.section.tensions'),
      fields: [
        {
          k: 'one',
          id: 'tensionPrimary',
          title: t('brandBuild.card.tensionPrimary'),
          q: '',
          opts: tensions,
          source: 'tension',
        },
      ],
    });
  }
  const situations = arr(raw.situations);
  const shifts = arr(raw.shifts);
  if (situations.length > 0 && shifts.length > 0) {
    toneSections.push({
      id: 'sits',
      title: t('brandBuild.section.sits'),
      fields: situations.map<Field>((sit) => ({
        k: 'one',
        id: sit.id,
        title: str(sit.zh) !== '' ? str(sit.zh) : sit.id,
        q: str(sit.hint) !== '' ? str(sit.hint) : str(sit.desc),
        opts: shifts,
        source: 'sit',
      })),
    });
  }
  if (toneSections.length > 0) {
    bands.push({ id: 'tone', title: t('brandBuild.band.tone'), sections: toneSections });
  }

  // 5. 文字與數字。
  const texts = arr(raw.texts);
  if (texts.length > 0) {
    bands.push({
      id: 'text',
      title: t('brandBuild.band.text'),
      sections: [
        {
          id: 'texts',
          title: t('brandBuild.section.texts'),
          fields: texts.map<Field>((txt) => ({
            k: 'text',
            id: txt.id,
            title: str(txt.label) !== '' ? str(txt.label) : txt.id,
            help: str(txt.help),
            ph: str(txt.ph),
            rows: typeof txt.rows === 'number' ? txt.rows : 2,
          })),
        },
      ],
    });
  }

  const placed = placeSections(bands, stage);

  return { bands: placed, sections: placed.flatMap((band) => band.sections), labelById };
}

/**
 * 給每張卡一個位置編號，順序跟畫面一樣（由上而下、由左至右）。
 *
 * 編號在一個 stage 內連續：`00.1`、`00.2`…；stage 4A 就是 `04A.1`。
 * 不用 band 前綴，因為一個 stage 只有幾個 band，連續編號對人更易數。
 */
function placeSections(bands: Band[], stage: GuideStage | null): PlacedBand[] {
  if (stage === null) {
    return bands.map((band) => ({
      ...band,
      sections: band.sections.map((section) => ({ ...section, code: '', bandId: band.id, bandTitle: band.title })),
    }));
  }

  const prefix = stageNum(stage);
  let index = 0;

  return bands.map((band) => ({
    ...band,
    sections: band.sections.map((section) => {
      index += 1;
      return { ...section, code: `${prefix}.${index}`, bandId: band.id, bandTitle: band.title };
    }),
  }));
}

/* ── 讀取答案 ───────────────────────────────────────────── */

type Answer = {
  /** 已填欄位數。 */
  done: number;
  /** 欄位總數。 */
  total: number;
  /** 可以顯示的答案文字（已排除失效編號）。 */
  labels: string[];
  /** 對不上現有選項的舊編號。 */
  stale: string[];
};

function pickValue(state: Record<string, unknown>, field: DimField): string {
  if (field.container === 'pick') {
    const group = (state.pick as Record<string, Record<string, unknown>> | undefined)?.[field.set];
    return str(group?.[field.id]);
  }
  const dims = state.dims as Record<string, unknown> | undefined;
  return str(dims?.[field.id]);
}

function rawValues(field: Field, state: Record<string, unknown>): string[] {
  switch (field.k) {
    case 'cat': {
      const value = state[field.id];
      return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
    }
    case 'dim':
      return [pickValue(state, field)].filter((x) => x !== '');
    case 'dial': {
      const dials = state.dials as Record<string, unknown> | undefined;
      const value = dials?.[field.id];
      return typeof value === 'number' ? [String(value)] : [];
    }
    case 'one': {
      if (field.source === 'tension') {
        return [str(state.tensionPrimary)].filter((x) => x !== '');
      }
      const sits = state.sit as Record<string, unknown> | undefined;
      return [str(sits?.[field.id])].filter((x) => x !== '');
    }
    case 'text': {
      const texts = state.text as Record<string, unknown> | undefined;
      return [str(texts?.[field.id])].filter((x) => x !== '');
    }
  }
}

function dialLabel(value: number): string {
  const map: Record<number, string> = {
    [-2]: t('brandBuild.dial.neg2'),
    [-1]: t('brandBuild.dial.neg1'),
    0: t('brandBuild.dial.zero'),
    1: t('brandBuild.dial.pos1'),
    2: t('brandBuild.dial.pos2'),
  };
  return map[value] ?? String(value);
}

function answerOf(field: Field, state: Record<string, unknown>, model: Model): Answer {
  const values = rawValues(field, state);
  const labels: string[] = [];
  const stale: string[] = [];

  for (const value of values) {
    if (field.k === 'dial') {
      labels.push(dialLabel(Number(value)));
      continue;
    }
    if (field.k === 'text') {
      const oneLine = value.replace(/\s+/g, ' ').trim();
      labels.push(oneLine.length > 60 ? `${oneLine.slice(0, 60)}…` : oneLine);
      continue;
    }
    const label = model.labelById.get(value);
    if (label === undefined) {
      stale.push(value);
    } else {
      labels.push(label);
    }
  }

  const filled = field.k === 'cat' ? (labels.length > 0 ? 1 : 0) : labels.length > 0 ? 1 : 0;
  return { done: filled, total: 1, labels, stale };
}

function sectionAnswer(section: Section, state: Record<string, unknown>, model: Model): Answer {
  let done = 0;
  const labels: string[] = [];
  const stale: string[] = [];

  for (const field of section.fields) {
    const answer = answerOf(field, state, model);
    done += answer.done;
    labels.push(...answer.labels);
    stale.push(...answer.stale);
  }

  return { done, total: section.fields.length, labels, stale };
}

function modelAnswer(model: Model, state: Record<string, unknown>): Answer {
  let done = 0;
  let total = 0;
  const stale: string[] = [];

  for (const section of model.sections) {
    const answer = sectionAnswer(section, state, model);
    done += answer.done;
    total += answer.total;
    stale.push(...answer.stale);
  }

  return { done, total, labels: [], stale };
}

/* ── 工具 ───────────────────────────────────────────────── */

/**
 * 把一張卡砌成 prompt 需要的欄位形狀。
 *
 * 值一律用「畫面睇到的文字」（選項中文名、刻度描述），不是選項編號：
 * agent 讀得明的係文字，寫回系統時我們再靠 block 識別碼對位。
 */
function promptFieldsOf(section: Section, state: Record<string, unknown>, model: Model): PromptField[] {
  return section.fields.map((field) => {
    const answer = answerOf(field, state, model);

    if (field.k === 'text') {
      const raw = rawValues(field, state)[0] ?? '';
      return { title: field.title, kind: 'text', values: raw.trim() === '' ? [] : [raw.trim()], options: [] };
    }

    if (field.k === 'cat') {
      return {
        title: field.title,
        kind: 'multi',
        values: answer.labels,
        options: field.groups.flatMap((group) => group.items.map((item) => item.zh)),
      };
    }

    if (field.k === 'dial') {
      return {
        title: `${field.l} ⇄ ${field.r}`,
        kind: 'scale',
        values: answer.labels,
        options: [-2, -1, 0, 1, 2].map((step) => dialLabel(step)),
      };
    }

    return {
      title: field.title,
      kind: 'choice',
      values: answer.labels,
      options: field.opts.map((opt) => opt.zh),
    };
  });
}

/** `11月17日 18:12`。只用本地格式，不引入日期庫。 */
function whenText(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  // 24 小時制＋短日期：`17/11 18:48`。歷史欄一列只有 110px，用 12 小時制
  // 會變成「下午06:48」而斷行。
  return date.toLocaleString('zh-HK', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** 檔案大小。字串表已有這一組，重用而不是自己砌單位。 */
function sizeText(bytes: number): string {
  if (bytes < 1024) {
    return t('files.size.bytes', { count: bytes });
  }
  if (bytes < 1024 * 1024) {
    return t('files.size.kb', { count: Math.round(bytes / 1024) });
  }
  if (bytes < 1024 * 1024 * 1024) {
    return t('files.size.mb', { count: Math.round(bytes / (1024 * 1024)) });
  }
  return t('files.size.gb', { count: Math.round(bytes / (1024 * 1024 * 1024)) });
}

function cloneState(state: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
}

/** 後端 canvas 有時把選項編號直接寫成文字（例如「賺錢策略：bm_service」）。 */
function cleanLine(line: string, labelById: Map<string, string>): string {
  const replaced = line.replace(/[a-z][a-z0-9]*(?:_[a-z0-9]+)+/g, (match) => labelById.get(match) ?? '');
  const trimmed = replaced.replace(/[：:]\s*$/, '').replace(/\s{2,}/g, ' ').trim();
  return trimmed === '：' || trimmed === ':' ? '' : trimmed;
}

function looksPlaceholder(text: string): boolean {
  return /［|〔|「[a-z][a-z0-9_]*」/.test(text);
}

function clampText(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

/* ── 總覽 ───────────────────────────────────────────────── */

type StageCardStatus = 'done' | 'doing' | 'todo';

type StageCard = {
  id: GuideStage;
  num: string;
  name: string;
  status: StageCardStatus;
  pct: number;
  summary: string;
  missingCount: number;
};

function statusLabel(status: StageCardStatus): string {
  const map: Record<StageCardStatus, string> = {
    done: t('brandBuild.status.done'),
    doing: t('brandBuild.status.doing'),
    todo: t('brandBuild.status.todo'),
  };
  return map[status];
}

function briefText(brief: GuideBrief | undefined, key: string): string {
  const text = brief?.text as Record<string, unknown> | undefined;
  return str(text?.[key]);
}

function extractStatement(brief: GuideBrief): string {
  const candidates = [
    brief.positioning_statement,
    brief.sensory_statement,
    brief.voice_statement,
    brief.visual_statement,
    brief.surface_statement,
    brief.statement,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate !== '' && !looksPlaceholder(candidate)) {
      return candidate;
    }
    if (candidate !== null && typeof candidate === 'object') {
      const text = (candidate as { text?: unknown }).text;
      if (typeof text === 'string' && text !== '' && !looksPlaceholder(text)) {
        return text;
      }
    }
  }
  return '';
}

function stageCardOf(
  id: GuideStage,
  briefs: Record<string, GuideBrief>,
  map: GuideMapDimension[],
): StageCard {
  const num = stageNum(id);
  const name = stageName(id);
  const brief = briefs[id];

  if (brief === undefined) {
    const answered = map.filter((d) => d.stage === id && d.answered).length;
    return {
      id,
      num,
      name,
      status: answered > 0 ? 'doing' : 'todo',
      pct: 0,
      summary: '',
      missingCount: 0,
    };
  }

  const pct = typeof brief.completeness === 'number' ? brief.completeness : 0;
  const missing = Array.isArray(brief.missing) ? brief.missing.length : 0;
  const status: StageCardStatus = brief.status === 'complete' ? 'done' : pct > 0 ? 'doing' : 'todo';

  const summary = clampText(
    briefText(brief, 'what') ||
      briefText(brief, 'who') ||
      extractStatement(brief) ||
      briefText(brief, 'how'),
    70,
  );

  return { id, num, name, status, pct, summary, missingCount: missing };
}

/**
 * 品牌模組的路由。
 *
 * 01–03、04A、04G 留在品牌層（`#/design/brand/stage/<stage>`）。
 * 04B–04E、04H 住品牌集（`#/design/brand/sets/<setId>` 與 `.../<stage>`），
 * 因為同一個品牌可以有幾套做法，答案互不相干。
 *
 * 04F 行銷內容不在這個 app：它在 Boss Portal › Marketing（公司層）。
 */
export type BrandRoute =
  | { kind: 'overview' }
  | { kind: 'stage'; stage: GuideStage }
  | { kind: 'layer'; layer: LayerKind }
  | { kind: 'set'; setId: string }
  | { kind: 'setStage'; setId: string; stage: GuideStage };

export function parseBrandRoute(segments: readonly string[]): BrandRoute {
  const [head, second, third] = segments;

  if (head === 'stage') {
    const fixed = BRAND_LEVEL_STAGES.find((entry) => entry.id === second);

    if (fixed !== undefined) {
      return { kind: 'stage', stage: fixed.id };
    }
  }

  if (head === 'layer' && typeof second === 'string' && LAYER_KINDS.includes(second as LayerKind)) {
    return { kind: 'layer', layer: second as LayerKind };
  }

  if (head === 'sets' && typeof second === 'string' && second !== '') {
    if (third === undefined) {
      return { kind: 'set', setId: second };
    }

    const inSet = SET_STAGE_ENTRIES.find((entry) => entry.id === third);

    if (inSet !== undefined) {
      return { kind: 'setStage', setId: second, stage: inSet.id };
    }

    // 品牌集內只認 04B–04E、04H：其他 stage（包括已搬去品牌層的 04A／04G）
    // 或亂寫都停在這一套品牌集的總覽，不要靜靜跳去一個共用答案的畫面。
    return { kind: 'set', setId: second };
  }

  return { kind: 'overview' };
}

export function BrandScreen(props: { brandId: string; brandName?: string; railOpen?: boolean; onToggleRail?: () => void }) {
  const { brandId, brandName, railOpen = true } = props;
  const path = useHashPath();
  const route = parseBrandRoute(path.slice(1));
  const setId = route.kind === 'set' || route.kind === 'setStage' ? route.setId : null;

  const [tree, setTree] = useState<BrandSetTree | null>(null);
  const [treeState, setTreeState] = useState<LoadState>('loading');
  const [briefs, setBriefs] = useState<Record<string, GuideBrief>>({});
  const [map, setMap] = useState<GuideMapDimension[]>([]);
  const [scopeState, setScopeState] = useState<LoadState>('loading');

  const loadTree = useCallback(async () => {
    setTreeState('loading');
    const result = await fetchBrandSets(brandId);

    if (!result.ok) {
      setTreeState('failed');
      return;
    }

    setTree(result.data);
    setTreeState('ready');
  }, [brandId]);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  const loadScope = useCallback(() => {
    let live = true;
    setScopeState('loading');

    void (async () => {
      const [briefsResult, mapResult] = await Promise.all([
        fetchGuideBriefs(brandId, setId),
        fetchGuideMap(brandId),
      ]);

      if (!live) {
        return;
      }

      if (!briefsResult.ok || !mapResult.ok) {
        setScopeState('failed');
        return;
      }

      setBriefs(briefsResult.data.briefs);
      setMap(mapResult.data.dimensions);
      setScopeState('ready');
    })();

    return () => {
      live = false;
    };
  }, [brandId, setId]);

  useEffect(() => loadScope(), [loadScope]);

  const openOverview = (): void => {
    navigatePath('/design', 'brand', 'dashboard');
  };

  const openStage = (nextStage: GuideStage): void => {
    navigatePath('/design', 'brand', 'stage', nextStage);
  };

  const openSet = (nextSetId: string): void => {
    navigatePath('/design', 'brand', 'sets', nextSetId);
    void loadTree();
  };

  /**
   * 用途組內的品牌集卡（04B–04E、04F、04H）：這些卡住在品牌集裡（可多套）。
   *
   * 只有一套品牌集就直接開那一套的對應 stage；多套就停在品牌集總覽，讓老闆
   * 揀邊一套（不靜靜替人揀）。沒有一套就開品牌集總覽，那裡有空白狀態引導。
   */
  const openSetStage = (nextStage: GuideStage): void => {
    const sets = tree?.sets ?? [];
    const first = sets[0];

    if (sets.length === 1 && first !== undefined) {
      navigatePath('/design', 'brand', 'sets', first.id, nextStage);
    } else {
      navigatePath('/design', 'brand', 'sets', '');
      void loadTree();
    }
  };

  const activeSet = setId === null ? null : (tree?.sets.find((item) => item.id === setId) ?? null);

  // 總覽層的 AI Agent 匯出要逐站抓區塊紀錄，所以物件要穩定：每次 render
  // 都 `brandGuideApi()` 一個新的，總覽的 effect 就會無限重抓。
  const scopeApi = useMemo(() => brandGuideApi(brandId, setId), [brandId, setId]);

  function renderMain(): ReactNode {
    if (route.kind === 'stage') {
      return (
        <StageDetail
          brandId={brandId}
          brandName={brandName ?? ''}
          stage={route.stage}
          // 04A 核心識別、04G 治理是獨立模組：這兩頁各有一份交代整頁的 Prompt。
          scopePrompt={BRAND_FIXED_ENTRIES.some((entry) => entry.id === route.stage)}
          onBack={() => {
            openOverview();
            void loadScope();
          }}
        />
      );
    }

    if (route.kind === 'setStage') {
      return (
        <StageDetail
          brandId={brandId}
          brandName={brandName ?? ''}
          stage={route.stage}
          setId={route.setId}
          setName={activeSet?.name ?? ''}
          onBack={() => {
            openSet(route.setId);
            void loadScope();
          }}
        />
      );
    }

    if (route.kind === 'layer') {
      return (
        <LayerScreen
          brandId={brandId}
          brandName={brandName ?? ''}
          layer={route.layer}
          setId={setId}
          onOpenStage={(stage) => navigatePath('/design', 'brand', 'stage', stage)}
        />
      );
    }

    if (route.kind === 'set' && treeState === 'ready' && activeSet === null) {
      return (
        <div className="design-empty" data-brand-set-missing>
          <p>{t('brandBuild.set.notFound')}</p>
          <button type="button" className="design-btn" onClick={openOverview}>
            {t('brandBuild.overview.back')}
          </button>
        </div>
      );
    }

    if (scopeState === 'failed') {
      return (
        <div className="design-empty" data-brand-dash="failed">
          <p>{t('brandBuild.loadFailed')}</p>
          <button type="button" className="design-btn" onClick={() => void loadScope()}>
            {t('common.retry')}
          </button>
        </div>
      );
    }

    if (scopeState === 'loading') {
      return (
        <p className="design-empty" data-brand-dash="loading">
          {t('brandBuild.loading')}
        </p>
      );
    }

    if (route.kind === 'set') {
      const folderName =
        activeSet?.folderId == null
          ? t('brandBuild.set.unfiled')
          : (tree?.folders.find((folder) => folder.id === activeSet?.folderId)?.name ??
            t('brandBuild.set.unfiled'));

      return (
        <div data-brand-set-view={route.setId}>
          <header className="brand-set__head">
            <p className="brand-dash__eyebrow">{folderName}</p>
            <h2 className="brand-set__title" data-brand-set-title>
              {activeSet?.name ?? ''}
            </h2>
            <p className="brand-set__lead">{t('brandBuild.set.lead')}</p>
          </header>
          <BrandOverview
            briefs={briefs}
            map={map}
            stages={SET_STAGE_ENTRIES}
            agent={{
              api: scopeApi,
              brandId,
              brandName: brandName ?? '',
              kind: 'brand-set',
              scopeId: route.setId,
              scopeName: activeSet?.name ?? t('brandBuild.set.unfiled'),
            }}
            onOpenStage={(stage) => navigatePath('/design', 'brand', 'sets', route.setId, stage)}
          />
        </div>
      );
    }

    return (
      <div data-brand-core-view>
        <p className="brand-dash__secLead brand-core__lead">{t('brandBuild.set.coreLead')}</p>
        <BrandOverview
          briefs={briefs}
          map={map}
          stages={CORE_STAGES}
          agent={{
            api: scopeApi,
            brandId,
            brandName: brandName ?? '',
            kind: 'brand',
            scopeId: null,
            scopeName: t('brandBuild.overview.nav'),
          }}
          onOpenStage={(stage) => navigatePath('/design', 'brand', 'stage', stage)}
        />
      </div>
    );
  }

  return (
    <div className="brand-module" data-brand-module data-brand-rail-open={railOpen ? 'true' : 'false'}>
      {railOpen && (
        <BrandSetsRail
          brandId={brandId}
          tree={tree}
          loadState={treeState}
          target={
            route.kind === 'stage'
              ? { kind: 'stage', stage: route.stage }
              : setId === null
                ? { kind: 'overview' }
                : { kind: 'set', setId }
          }
          onOpenOverview={openOverview}
          onOpenStage={openStage}
          onOpenSetStage={openSetStage}
          onOpenSet={openSet}
          onChanged={() => void loadTree()}
          onRetry={() => void loadTree()}
        />
      )}
      <div className="brand-module__main">{renderMain()}</div>
    </div>
  );
}

/**
 * Boss Portal › 品牌：00 業務基礎。
 *
 * 同一個 `StageDetail`，只是沒有「返回」 —— 它的上一站在公司層，不是另一個
 * 品牌階段。填的、存的、prompt 的、agent 寫的全部跟 Design 共用同一份資料
 * （0026／0027 三張表）。
 */
export function BrandBusinessStage(props: { brandId: string; brandName?: string }) {
  return (
    <StageDetail
      brandId={props.brandId}
      brandName={props.brandName ?? ''}
      stage="stage0"
      showBack={false}
      onBack={() => undefined}
    />
  );
}

/**
 * 公司層的 04F 行銷內容（Boss Portal › Marketing）。
 *
 * 同一組 `StageDetail`，但 API 換成 `/company/guide/stage4f/...`：答案不屬於
 * 任何品牌（`brand_id is null`），全公司共用一份，而且只有老闆讀得到
 * （後端 403，不是前端隱藏）。所以品牌名留空，提示詞裡不會假裝這是某個品牌
 * 的東西 —— 這份策略本身就是全公司的。
 */
export function CompanyMarketingStage(props: { brandName?: string }) {
  const api = useMemo(() => companyGuideApi(), []);

  return (
    <StageDetail
      brandId=""
      brandName={props.brandName ?? ''}
      stage="stage4f"
      showBack={false}
      api={api}
      onBack={() => undefined}
    />
  );
}

/**
 * 只讀的業務摘要：業務畫布、單位經濟、起步清單。
 *
 * Boss Portal 首頁用它把「這間公司／這個品牌怎麼運作」講清楚；寫入仍然在
 * 品牌頁那一邊，這裡不另外做一套表格。
 */
export function BrandBusinessSummary(props: { brandId: string; heading?: string }) {
  const { brandId } = props;
  const [schema, setSchema] = useState<GuideSchema | null>(null);
  const [brief, setBrief] = useState<GuideBrief | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');

  const load = useCallback(() => {
    let live = true;
    setLoadState('loading');

    void (async () => {
      const api = brandGuideApi(brandId);

      const [schemaResult, briefResult] = await Promise.all([
        api.schema('stage0'),
        api.brief('stage0'),
      ]);

      if (!live) {
        return;
      }

      if (!schemaResult.ok || !briefResult.ok) {
        setLoadState('failed');
        return;
      }

      setSchema(schemaResult.data.schema);
      setBrief(briefResult.data.brief);
      setLoadState('ready');
    })();

    return () => {
      live = false;
    };
  }, [brandId]);

  useEffect(() => load(), [load]);

  if (loadState === 'loading') {
    return <p className="design-empty">{t('brandBuild.loading')}</p>;
  }

  if (loadState === 'failed') {
    return (
      <div className="design-empty">
        <p>{t('brandBuild.loadFailed')}</p>
        <button type="button" className="design-btn" onClick={load}>
          {t('common.retry')}
        </button>
      </div>
    );
  }

  const model = buildModel(schema, 'stage0');
  const checks = (brief?.consistency_checks as { level: string; msg: string }[] | undefined) ?? [];

  return (
    <div className="brand-dash" data-brand-summary={brandId}>
      {props.heading !== undefined && props.heading !== '' && (
        <h2 className="brand-dash__title">{props.heading}</h2>
      )}
      <BriefDerivedSection brief={brief} model={model} />
      <DashSection title={t('brandBuild.view.checks')}>
        <ul className="brand-dash__checks">
          {checks.length === 0 ? (
            <li className="brand-dash__check brand-dash__check--info">
              <span className="brand-dash__checkIcon" aria-hidden="true" />
              {t('brandBuild.dash.checksNone')}
            </li>
          ) : (
            checks.map((check, index) => (
              <li key={index} className={`brand-dash__check brand-dash__check--${check.level}`}>
                <span className="brand-dash__checkIcon" aria-hidden="true" />
                {check.msg}
              </li>
            ))
          )}
        </ul>
      </DashSection>
    </div>
  );
}

/**
 * 總覽層的 AI Agent 匯出設定。
 *
 * 品牌總覽（01–03）與每個品牌集（04B–04E、04H）都是「一組階段」而不是一格，
 * 所以它們的匯出要講得出「這個範圍有邊幾站」，而不是硬套單一階段的形狀。
 * `api` 由呼叫端 `useMemo` 固定，不可每次 render 新造。
 */
type OverviewAgent = {
  api: GuideEndpoints;
  brandId: string;
  brandName: string;
  kind: 'brand' | 'brand-set';
  scopeId: string | null;
  scopeName: string;
};

/* ── 範圍層 Prompt（品牌總覽／品牌集／04A／04G）────────────── */

type ScopePromptLoad = 'loading' | 'ready' | 'failed';

/**
 * 範圍層 Prompt 的自訂版本。
 *
 * 為什麼要另存一份：卡片 prompt 的自訂版本住在 `brand_guide_block.prompt_override`
 * （一格一份）；品牌總覽／品牌集不是一格，是「一次交代幾站」。兩者混在一起，
 * 改一格就會蓋掉整份交代。所以後端另開 `brand_guide_prompt`，這裡只管讀寫。
 *
 * `generated` 由呼叫端即時砌（跟住決策更新），空字串代表資料未載入。
 * 自訂版本一存在就以它為準，畫面會講明它不再跟決策走。
 */
function useScopePrompt(input: {
  brandId: string;
  setId: string | null;
  /** `brand`／`set`／stage id，見 prompt-routes 的 isKnownScope。 */
  scopeKey: string;
  generated: string;
  enabled: boolean;
}) {
  const { brandId, setId, scopeKey, generated, enabled } = input;
  const [override, setOverride] = useState('');
  const [state, setState] = useState<ScopePromptLoad>(enabled ? 'loading' : 'ready');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setOverride('');
      setState('ready');
      return;
    }

    let live = true;
    setState('loading');

    void (async () => {
      const result = await fetchScopePrompt(brandId, scopeKey, setId);

      if (!live) {
        return;
      }

      if (!result.ok) {
        setState('failed');
        return;
      }

      setOverride(result.data.prompt);
      setState('ready');
    })();

    return () => {
      live = false;
    };
  }, [brandId, setId, scopeKey, enabled, reloadKey]);

  const custom = override.trim() !== '';
  const text = custom ? override : generated;

  const write = useCallback(
    async (next: string): Promise<boolean> => {
      setSaving(true);
      setNote('');
      const result = await saveScopePrompt(brandId, scopeKey, setId, next);
      setSaving(false);

      if (!result.ok) {
        setNote(t('brandBuild.block.prompt.failed'));
        return false;
      }

      setOverride(result.data.prompt);
      return true;
    },
    [brandId, scopeKey, setId],
  );

  const save = useCallback(
    async (next: string): Promise<boolean> => {
      const ok = await write(next);

      if (ok) {
        setNote(t('brandBuild.block.prompt.saved'));
        window.setTimeout(() => setNote(''), 3000);
      }

      return ok;
    },
    [write],
  );

  const reset = useCallback(async (): Promise<boolean> => {
    const ok = await write('');

    if (ok) {
      setNote(t('brandBuild.block.prompt.resetDone'));
      window.setTimeout(() => setNote(''), 3000);
    }

    return ok;
  }, [write]);

  const retry = useCallback(() => setReloadKey((value) => value + 1), []);

  return { text, custom, state, saving, note, save, reset, retry, override };
}

/** brief 的進度：沒有 brief 就 null（整段進度不輸出，不要假裝 0%）。 */
function scopeProgressOf(brief: GuideBrief | null | undefined): { pct: number; missing: number } | null {
  if (brief === null || brief === undefined) {
    return null;
  }

  return {
    pct: typeof brief.completeness === 'number' ? brief.completeness : 0,
    missing: Array.isArray(brief.missing) ? brief.missing.length : 0,
  };
}

/** 一格已填的決策 → prompt 需要的一行。未填的回 null（不輸出空殼）。 */
function scopeBlockOf(
  block: GuideBlock | undefined,
  section: { id: string; code: string; title: string },
): {
  blockId: string;
  code: string;
  title: string;
  decision: string;
  at: string | null;
  by: string;
  actorType: 'human' | 'agent';
} | null {
  const decision = (block?.decision ?? '').trim();

  if (decision === '') {
    return null;
  }

  return {
    blockId: section.id,
    code: section.code,
    title: section.title,
    decision,
    at: block?.decisionAt == null ? null : whenText(block.decisionAt),
    by: block?.decisionByName ?? '',
    actorType: block?.decisionActorType ?? 'human',
  };
}

/**
 * 範圍層 Prompt 的面板：可讀、可就地改、可還原。
 *
 * 與卡片內的 prompt 一樣是「一個 textarea 加儲存／還原」：同一個操作在不同
 * 地方要有同一個手感，否則使用者要記兩套。
 */
function approvalStatusLabel(status: GuideApproval['status']): string {
  switch (status) {
    case 'approved':
      return t('brandBuild.approval.statusApproved');
    case 'in_review':
      return t('brandBuild.approval.statusInReview');
    case 'needs_revision':
      return t('brandBuild.approval.statusNeedsRevision');
    default:
      return t('brandBuild.approval.statusDraft');
  }
}

/** stage 級核准狀態面板：寫入草稿／審核中／已核准／需修訂，加版本、備註與 rationale。 */
function ApprovalPanel(props: {
  stage: GuideStage;
  approval: GuideApproval | null;
  api: GuideEndpoints;
  onSaved: (next: GuideApproval) => void;
  onClose: () => void;
}) {
  const { stage, approval, api, onSaved, onClose } = props;
  const [status, setStatus] = useState<GuideApproval['status']>(approval?.status ?? 'draft');
  const [version, setVersion] = useState(approval?.version ?? '');
  const [note, setNote] = useState(approval?.note ?? '');
  const [rationale, setRationale] = useState(approval?.rationale ?? '');
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState('');
  const [error, setError] = useState('');

  async function save() {
    setSaving(true);
    setError('');
    const result = await api.saveApproval(stage, { status, version, note, rationale });
    setSaving(false);

    if (!result.ok) {
      setError(t('brandBuild.approval.failed'));
      return;
    }

    onSaved(result.data.approval);
    setSavedNote(t('brandBuild.approval.saved'));
    window.setTimeout(() => setSavedNote(''), 3000);
  }

  return (
    <section className="brand-agent" data-brand-approval>
      <div className="brand-agent__head">
        <div>
          <h3 className="brand-agent__title">{t('brandBuild.approval.title')}</h3>
          <p className="brand-agent__lead">{t('brandBuild.approval.lead')}</p>
        </div>
        <button type="button" className="design-btn" onClick={onClose}>
          {t('brandBuild.dash.closeDetail')}
        </button>
      </div>

      <div className="brand-approval__body">
        <label className="brand-approval__field">
          <span>{t('brandBuild.approval.statusLabel')}</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as GuideApproval['status'])}
            data-approval-status
          >
            <option value="draft">{t('brandBuild.approval.statusDraft')}</option>
            <option value="in_review">{t('brandBuild.approval.statusInReview')}</option>
            <option value="approved">{t('brandBuild.approval.statusApproved')}</option>
            <option value="needs_revision">{t('brandBuild.approval.statusNeedsRevision')}</option>
          </select>
        </label>

        <label className="brand-approval__field">
          <span>{t('brandBuild.approval.versionLabel')}</span>
          <input
            type="text"
            value={version}
            placeholder={t('brandBuild.approval.versionPlaceholder')}
            onChange={(event) => setVersion(event.target.value)}
            data-approval-version
          />
        </label>

        <label className="brand-approval__field">
          <span>{t('brandBuild.approval.noteLabel')}</span>
          <textarea
            rows={3}
            value={note}
            placeholder={t('brandBuild.approval.notePlaceholder')}
            onChange={(event) => setNote(event.target.value)}
            data-approval-note
          />
        </label>

        <label className="brand-approval__field">
          <span>{t('brandBuild.approval.rationaleLabel')}</span>
          <textarea
            rows={5}
            value={rationale}
            placeholder={t('brandBuild.approval.rationalePlaceholder')}
            onChange={(event) => setRationale(event.target.value)}
            data-approval-rationale
          />
        </label>

        {approval !== null && approval.approverName !== null && approval.approverName !== '' && (
          <p className="brand-approval__meta">
            {t('brandBuild.approval.approvedBy', { name: approval.approverName })}
            {approval.updatedAt !== null ? ` · ${whenText(approval.updatedAt)}` : ''}
          </p>
        )}

        {error !== '' && <p className="brand-edit__error">{error}</p>}
        {savedNote !== '' && (
          <p className="brand-block__saved" role="status">
            {savedNote}
          </p>
        )}

        <div className="brand-approval__actions">
          <button
            type="button"
            className="design-btn design-btn--primary"
            disabled={saving}
            onClick={() => void save()}
            data-approval-save
          >
            {saving ? t('brandBuild.saving') : t('brandBuild.approval.save')}
          </button>
        </div>
      </div>
    </section>
  );
}

function ScopePromptPanel(props: {
  text: string;
  custom: boolean;
  state: ScopePromptLoad;
  saving: boolean;
  note: string;
  onSave: (next: string) => Promise<boolean>;
  onReset: () => Promise<boolean>;
  onRetry: () => void;
  onClose: () => void;
}) {
  const { text, custom, state, saving, note, onSave, onReset, onRetry, onClose } = props;
  // 草稿只在這一版之內有效：自動版本會跟住決策更新，用 state 直接綁定會
  // 令打到一半的內容被輪詢蓋走。
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? text;

  return (
    <section className="brand-agent" data-brand-scope-prompt>
      <div className="brand-agent__head">
        <div>
          <h3 className="brand-agent__title">{t('brandBuild.block.prompt')}</h3>
          <p className="brand-agent__lead">{t('brandBuild.scopePrompt.lead')}</p>
        </div>
        {/*
          複製按鈕放在上面那一行（與「睇 Prompt」並排），面板內不再重複一次：
          同一個動作在同一個畫面出現兩個入口，只會令人想「兩個有咩分別」。
        */}
        <button type="button" className="design-btn" onClick={onClose}>
          {t('brandBuild.dash.closeDetail')}
        </button>
      </div>

      {state === 'loading' && <p className="design-empty">{t('brandBuild.loading')}</p>}

      {state === 'failed' && (
        <div className="design-empty" data-scope-prompt-failed>
          <p>{t('brandBuild.loadFailed')}</p>
          <button type="button" className="design-btn" onClick={onRetry}>
            {t('common.retry')}
          </button>
        </div>
      )}

      {state === 'ready' && (
        <div className="brand-dash__body">
          <textarea
            className="brand-block__promptEdit"
            rows={18}
            value={value}
            onChange={(event) => setDraft(event.target.value)}
            aria-label={t('brandBuild.block.promptTitle')}
            spellCheck={false}
            data-scope-prompt-editor
          />
          <div className="brand-block__foot">
            <span className="brand-block__meta">
              {custom ? t('brandBuild.block.prompt.customNote') : t('brandBuild.block.prompt.autoNote')}
            </span>
            <div className="brand-block__headActions">
              {note !== '' && (
                <span className="brand-block__saved" role="status" data-scope-prompt-note>
                  {note}
                </span>
              )}
              <button
                type="button"
                className="design-btn design-btn--primary"
                disabled={saving || value === text}
                data-scope-prompt-save
                onClick={() => {
                  void onSave(value).then((ok) => {
                    if (ok) {
                      setDraft(null);
                    }
                  });
                }}
              >
                {saving ? t('brandBuild.saving') : t('brandBuild.block.prompt.save')}
              </button>
              {custom && (
                <button
                  type="button"
                  className="design-btn"
                  disabled={saving}
                  data-scope-prompt-reset
                  onClick={() => {
                    void onReset().then((ok) => {
                      if (ok) {
                        setDraft(null);
                      }
                    });
                  }}
                >
                  {t('brandBuild.block.prompt.reset')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * 一個用途層的投影頁（design.md／tokens／模板／範例／檢查／不入層）。
 *
 * 層是投影：每次打開由 stage 的 brief 即時合成，不落表。每段講得出來源 stage、
 * 核准狀態、rationale，並可跳回對應 stage 編輯。design.md／tokens 有匯出 .md。
 */
function LayerScreen(props: {
  brandId: string;
  brandName: string;
  layer: LayerKind;
  setId: string | null;
  onOpenStage: (stage: GuideStage) => void;
}) {
  const { brandId, layer, setId, onOpenStage } = props;
  const [projection, setProjection] = useState<LayerProjection | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');

  const loadLayer = useCallback(() => {
    let live = true;
    setLoadState('loading');

    void (async () => {
      const result = await fetchLayer(brandId, layer, setId);

      if (!live) {
        return;
      }

      if (!result.ok) {
        setLoadState('failed');
        return;
      }

      setProjection(result.data);
      setLoadState('ready');
    })();

    return () => {
      live = false;
    };
  }, [brandId, layer, setId]);

  useEffect(() => loadLayer(), [loadLayer]);

  if (loadState === 'loading') {
    return (
      <p className="design-empty" data-brand-layer="loading">
        {t('brandBuild.loading')}
      </p>
    );
  }

  if (loadState === 'failed' || projection === null) {
    return (
      <div className="design-empty" data-brand-layer="failed">
        <p>{t('brandBuild.loadFailed')}</p>
        <button type="button" className="design-btn" onClick={() => void loadLayer()}>
          {t('common.retry')}
        </button>
      </div>
    );
  }

  const { sections, completeness, conflicts, exportText, exportName } = projection;
  const exportUrl = layerExportUrl(brandId, layer, setId);

  return (
    <div className="brand-layer" data-brand-layer={layer}>
      <header className="brand-layer__head">
        <p className="brand-dash__eyebrow">{t('brandBuild.layer.eyebrow')}</p>
        <h2 className="brand-layer__title" data-brand-layer-title>
          {projection.title}
        </h2>
        <div className="brand-layer__meta">
          <span className="brand-layer__maturity" data-brand-layer-maturity>
            {t('brandBuild.layer.maturity', {
              done: String(completeness.done),
              total: String(completeness.total),
            })}
          </span>
          <a
            className="design-btn design-btn--primary"
            href={exportUrl}
            download={exportName + '.md'}
            data-brand-layer-export
          >
            {t('brandBuild.layer.export')}
          </a>
        </div>
      </header>

      {conflicts.length > 0 && (
        <section className="brand-layer__conflicts" data-brand-layer-conflicts>
          <h3 className="brand-layer__sub">{t('brandBuild.layer.conflicts')}</h3>
          <ul>
            {conflicts.map((conflict) => (
              <li key={conflict.token} data-brand-layer-conflict={conflict.token}>
                <strong>{conflict.label}</strong>：{conflict.sources.map((s) => `${s.stage}＝${s.value}`).join('、')}
              </li>
            ))}
          </ul>
        </section>
      )}

      {sections.length === 0 ? (
        <p className="design-empty" data-brand-layer-empty>
          {t('brandBuild.layer.empty')}
        </p>
      ) : (
        sections.map((section) => (
          <section className="brand-layer__section" key={`${section.stage}-${section.title}`}>
            <header className="brand-layer__sectionHead">
              <h3 className="brand-layer__sub">{section.title}</h3>
              <button
                type="button"
                className="design-btn design-btn--ghost"
                data-brand-layer-jump={section.stage}
                onClick={() => onOpenStage(section.stage as GuideStage)}
              >
                {t('brandBuild.layer.jump')}
              </button>
            </header>
            <pre className="brand-layer__body">{section.body}</pre>
            {section.rationale.trim() !== '' && (
              <p className="brand-layer__rationale" data-brand-layer-rationale>
                {t('brandBuild.layer.rationale', { text: section.rationale })}
              </p>
            )}
            {section.approval !== null && section.approval !== '' && (
              <p className="brand-layer__approval" data-brand-layer-approval>
                {t('brandBuild.layer.approval', {
                  state: section.approval,
                  who: section.approvedBy ?? '',
                })}
              </p>
            )}
          </section>
        ))
      )}

      <details className="brand-layer__raw">
        <summary>{t('brandBuild.layer.raw')}</summary>
        <pre>{exportText}</pre>
      </details>
    </div>
  );
}

function BrandOverview(props: {
  briefs: Record<string, GuideBrief>;
  map: GuideMapDimension[];
  stages: readonly StageEntry[];
  agent: OverviewAgent;
  onOpenStage: (stage: GuideStage) => void;
}) {
  const { briefs, map, stages, agent, onOpenStage } = props;
  const [agentOpen, setAgentOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'failed'>('idle');

  /**
   * 兩個面板（Prompt 與 AI Agent JSON）都靠同一份區塊紀錄，所以載入一次共用。
   *
   * 為什麼不是一進總覽就抓：總覽是入口頁，3–5 個 stage 的區塊紀錄加起來
   * 不便宜，而多數人開總覽只是要看進度。按下去才抓，開過之後就重用。
   */
  const [blocks, setBlocks] = useState<Record<string, GuideBlock[]> | null>(null);
  const [blocksState, setBlocksState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const blocksRef = useRef<Record<string, GuideBlock[]> | null>(null);

  const loadBlocks = useCallback(async (): Promise<Record<string, GuideBlock[]> | null> => {
    if (blocksRef.current !== null) {
      return blocksRef.current;
    }

    setBlocksState('loading');
    const results = await Promise.all(stages.map((stage) => agent.api.blocks(stage.id)));

    if (results.some((result) => !result.ok)) {
      setBlocksState('failed');
      return null;
    }

    const next: Record<string, GuideBlock[]> = {};
    stages.forEach((stage, index) => {
      const result = results[index];

      if (result !== undefined && result.ok) {
        next[stage.id] = result.data.blocks;
      }
    });

    blocksRef.current = next;
    setBlocks(next);
    setBlocksState('ready');
    return next;
  }, [agent.api, stages]);

  const retryBlocks = useCallback(() => {
    blocksRef.current = null;
    setBlocksState('idle');
    void loadBlocks();
  }, [loadBlocks]);

  useEffect(() => {
    if ((promptOpen || agentOpen) && blocksState === 'idle') {
      void loadBlocks();
    }
  }, [promptOpen, agentOpen, blocksState, loadBlocks]);

  const promptFrom = useCallback(
    (data: Record<string, GuideBlock[]> | null): string =>
      data === null
        ? ''
        : buildScopePrompt({
            brand: { id: agent.brandId, name: agent.brandName },
            scope: {
              kind: agent.kind,
              setId: agent.kind === 'brand-set' ? agent.scopeId : null,
              setName: agent.kind === 'brand-set' ? agent.scopeName : '',
            },
            stages: stages.map((stage) => ({
              id: stage.id,
              num: stage.num,
              name: stage.name,
              blocks: (data[stage.id] ?? []).flatMap((block) => {
                const item = scopeBlockOf(block, {
                  id: block.blockId,
                  code: block.code,
                  title: block.title,
                });

                return item === null ? [] : [item];
              }),
              progress: scopeProgressOf(briefs[stage.id]),
            })),
          }),
    [agent.brandId, agent.brandName, agent.kind, agent.scopeId, agent.scopeName, stages, briefs],
  );

  const generated = useMemo(() => promptFrom(blocks), [promptFrom, blocks]);

  const scopePrompt = useScopePrompt({
    brandId: agent.brandId,
    setId: agent.kind === 'brand-set' ? agent.scopeId : null,
    scopeKey: agent.kind === 'brand-set' ? 'set' : 'brand',
    generated,
    enabled: agent.brandId !== '',
  });

  const promptState: ScopePromptLoad =
    scopePrompt.state === 'failed' || blocksState === 'failed'
      ? 'failed'
      : scopePrompt.state === 'loading' || blocks === null
        ? 'loading'
        : 'ready';

  const retryPrompt = useCallback(() => {
    scopePrompt.retry();

    if (blocksState === 'failed') {
      retryBlocks();
    }
  }, [scopePrompt, blocksState, retryBlocks]);

  /**
   * 未開面板都可以複製：先確保區塊紀錄已載入，再即時砌一次。
   * 失敗要講出聲，不要靜靜複製一段空白。
   */
  async function copyPrompt(): Promise<void> {
    const data = blocksRef.current ?? (await loadBlocks());

    if (data === null) {
      setCopyState('failed');
      window.setTimeout(() => setCopyState('idle'), 2200);
      return;
    }

    const text = scopePrompt.custom ? scopePrompt.override : promptFrom(data);
    const ok = await copyText(text);
    setCopyState(ok ? 'done' : 'failed');
    window.setTimeout(() => setCopyState('idle'), 2200);
  }

  const cards = stages.map((stage) => stageCardOf(stage.id, briefs, map));
  const done = cards.filter((card) => card.status === 'done').length;
  // 整體進度取所有階段的平均：只計「已完成階段」會長期停在 0%，
  // 用戶填了很多仍然像冇動過。
  const pct =
    cards.length === 0 ? 0 : Math.round(cards.reduce((sum, card) => sum + card.pct, 0) / cards.length);
  const missingTotal = cards.reduce((sum, card) => sum + card.missingCount, 0);

  return (
    <div className="brand-dash brand-overview" data-brand-overview>
      <div className="brand-overview__summary">
        <div className="brand-dash__progress">
          <span className="brand-dash__pct">{pct}%</span>
          <div
            className="brand-dash__bar"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <i style={{ width: `${pct}%` }} />
          </div>
          <span className="brand-dash__progLabel">
            {t('brandBuild.overview.progress', { done: String(done), total: String(cards.length) })}
          </span>
        </div>
        <span className="brand-overview__total">
          {missingTotal > 0 ? t('brandBuild.overview.missing', { n: String(missingTotal) }) : t('brandBuild.status.done')}
        </span>
        <button
          type="button"
          className="design-btn"
          data-brand-scope-prompt-copy
          onClick={() => void copyPrompt()}
        >
          {copyState === 'done'
            ? t('brandBuild.block.copied')
            : copyState === 'failed'
              ? t('brandBuild.block.copyFailed')
              : t('brandBuild.block.copyPrompt')}
        </button>
        <button
          type="button"
          className={`design-btn${promptOpen ? ' design-btn--primary' : ''}`}
          aria-pressed={promptOpen}
          data-brand-scope-prompt-toggle
          onClick={() => setPromptOpen((value) => !value)}
        >
          {promptOpen ? t('brandBuild.block.hidePrompt') : t('brandBuild.block.promptShow')}
        </button>
        <button
          type="button"
          className={`design-btn${agentOpen ? ' design-btn--primary' : ''}`}
          aria-pressed={agentOpen}
          data-brand-scope-agent-toggle
          onClick={() => setAgentOpen((value) => !value)}
        >
          {t('brandBuild.agent.button')}
        </button>
      </div>

      {promptOpen && (
        <ScopePromptPanel
          text={scopePrompt.text}
          custom={scopePrompt.custom}
          state={promptState}
          saving={scopePrompt.saving}
          note={scopePrompt.note}
          onSave={scopePrompt.save}
          onReset={scopePrompt.reset}
          onRetry={retryPrompt}
          onClose={() => setPromptOpen(false)}
        />
      )}

      {agentOpen && (
        <section className="brand-agent" data-brand-scope-agent>
          <div className="brand-agent__head">
            <div>
              <h3 className="brand-agent__title">{t('brandBuild.agent.button')}</h3>
              <p className="brand-agent__lead">{t('brandBuild.agent.scopePanelLead')}</p>
            </div>
            <button type="button" className="design-btn" onClick={() => setAgentOpen(false)}>
              {t('brandBuild.dash.closeDetail')}
            </button>
          </div>
          <ScopeContext
            agent={agent}
            stages={stages}
            blocks={blocks}
            state={blocksState}
            onRetry={retryBlocks}
          />
        </section>
      )}

      <div className="brand-overview__grid">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            className={`brand-overview__card brand-overview__card--${card.status}`}
            data-brand-overview-card={card.id}
            onClick={() => onOpenStage(card.id)}
          >
            <span className="brand-overview__cardTop">
              <span className="brand-overview__cardNum">{card.num}</span>
              <span className="brand-overview__cardStatus">{statusLabel(card.status)}</span>
            </span>
            <span className="brand-overview__cardName">{card.name}</span>
            <span className="brand-overview__cardBar">
              <i style={{ width: `${card.pct}%` }} />
            </span>
            <span className="brand-overview__cardFoot">
              <span className="brand-overview__cardPct">{card.pct}%</span>
              {card.missingCount > 0 && (
                <span className="brand-overview__cardMissing">
                  {t('brandBuild.overview.missing', { n: String(card.missingCount) })}
                </span>
              )}
            </span>
            {card.summary !== '' && <span className="brand-overview__cardSummary">{card.summary}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── 階段頁 ─────────────────────────────────────────────── */

type FieldOps = {
  toggleCat: (key: string, itemId: string, max: number) => void;
  setDim: (field: DimField, optId: string) => void;
  setOne: (field: OneField, optId: string) => void;
  setText: (id: string, value: string) => void;
  setDial: (id: string, value: number) => void;
  clearDial: (id: string) => void;
};

/** 寫入區塊紀錄的四個動作。回 false 代表失敗，面板自己講。 */
type BlockApi = {
  saveDecision: (section: PlacedSection, decision: string) => Promise<boolean>;
  savePrompt: (section: PlacedSection, prompt: string) => Promise<boolean>;
  saveRationale: (section: PlacedSection, rationale: string) => Promise<boolean>;
  upload: (section: PlacedSection, file: File) => Promise<boolean>;
  removeFile: (section: PlacedSection, attachmentId: string) => Promise<boolean>;
};

/**
 * 砌 prompt 需要的固定背景（品牌、stage、品牌集）。
 *
 * `setId` 只有 04B–04E、04H 在品牌集之內才有值：同一個 `block_id` 在每一套
 * 品牌集都一樣，卡片 prompt 沒有 set 那一行，agent 寫回時就會改錯另一套。
 */
type PromptContext = {
  brandId: string;
  brandName: string;
  stageId: GuideStage;
  stageNum: string;
  stageName: string;
  setId: string | null;
  setName: string;
};

function promptFor(
  context: PromptContext,
  section: PlacedSection,
  state: Record<string, unknown>,
  model: Model,
  block: GuideBlock | undefined,
): string {
  // 「之前的決策」要排除與現況相同的那一版：saveDecision 會把現況也寫進
  // 歷史，如果不篩，prompt 會把同一句講兩次，agent 以為有兩次共識。
  const previous = (block?.revisions ?? []).filter((revision) => revision.decision !== block?.decision);

  return buildBlockPrompt({
    brandName: context.brandName,
    brandId: context.brandId,
    setId: context.setId,
    setName: context.setName,
    stageNum: context.stageNum,
    stageName: context.stageName,
    stageId: context.stageId,
    code: section.code,
    title: section.title,
    blockId: section.id,
    fields: promptFieldsOf(section, state, model),
    decision: {
      text: block?.decision ?? '',
      at: block?.decisionAt == null ? null : whenText(block.decisionAt),
      by: block?.decisionByName ?? '',
      actorType: block?.decisionActorType ?? 'human',
    },
    history: previous.map((revision) => ({
      at: whenText(revision.createdAt),
      by: revision.actorName,
      text: revision.decision,
      actorType: revision.actorType === 'agent' ? 'agent' : 'human',
    })),
    historyTotal: previous.length,
  });
}

function StageDetail(props: {
  brandId: string;
  brandName: string;
  stage: GuideStage;
  /**
   * 04A–04H 住在品牌集：同一個品牌可以有幾套（2026 夏季／冬季…），
   * 每套自己的答案。01–03 傳 null／不傳，就是品牌層那一份。
   */
  setId?: string | null;
  /**
   * 品牌集名稱：卡片 prompt 的識別碼要寫出「這一格屬於邊一套做法」。
   * 品牌層傳空字串。
   */
  setName?: string;
  /**
   * 這一頁自己是不是一個「範圍」：04A 核心識別、04G 治理是獨立模組，
   * 所以除了一格一格的 prompt，還有一份交代整頁的 Prompt。
   * 01–03 與品牌集內的階段由總覽那個 Prompt 負責，這裡不重複。
   */
  scopePrompt?: boolean;
  /** 由別處直接開一個階段（Boss Portal 的 00）時，不需要「返回」。 */
  showBack?: boolean;
  /**
   * 資料端點。不傳＝這個品牌（或這個品牌集）；Boss Portal › Marketing 傳
   * 公司層那一組。畫面元件只有一份，路徑差異收在 `api.ts`。
   */
  api?: GuideEndpoints;
  onBack: () => void;
}) {
  const { brandId, brandName, stage, setId = null, onBack } = props;
  // `brandGuideApi()` 每次呼叫都是新物件，直接放進 useCallback 的 dep 會令
  // `load` 每次都變 → 每 render 重新抓一次資料（無限迴圈）。所以要在這裡固定。
  const brandApi = useMemo(() => props.api ?? brandGuideApi(brandId, setId), [props.api, brandId, setId]);
  const api = brandApi;
  const [schema, setSchema] = useState<GuideSchema | null>(null);
  const [state, setState] = useState<Record<string, unknown>>({});
  const [brief, setBrief] = useState<GuideBrief | null>(null);
  // 區塊紀錄（決策／歷史／附件）按 blockId 索引。載入失敗只影響這幾格，
  // 不會令整頁空白 —— 選項仍然可以改。
  const [blocks, setBlocks] = useState<Record<string, GuideBlock>>({});
  const [loadState, setLoadState] = useState<LoadState>('loading');
  // 一次只開一張卡：改動集中一處，其他卡暫時鎖住，唔會漏存。
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedNote, setSavedNote] = useState('');
  const [agentOpen, setAgentOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [approval, setApproval] = useState<GuideApproval | null>(null);
  const [approvalOpen, setApprovalOpen] = useState(false);

  const load = useCallback(() => {
    let live = true;
    setLoadState('loading');

    void (async () => {
      const [schemaResult, stateResult, briefResult, blocksResult, approvalResult] = await Promise.all([
        api.schema(stage),
        api.state(stage),
        api.brief(stage),
        api.blocks(stage),
        api.approval(stage),
      ]);

      if (!live) {
        return;
      }

      if (!schemaResult.ok || !stateResult.ok || !briefResult.ok) {
        setLoadState('failed');
        return;
      }

      setSchema(schemaResult.data.schema);
      setState(stateResult.data.state);
      setBrief(briefResult.data.brief);

      if (blocksResult.ok) {
        const map: Record<string, GuideBlock> = {};
        for (const block of blocksResult.data.blocks) {
          map[block.blockId] = block;
        }
        setBlocks(map);
      }

      if (approvalResult.ok) {
        setApproval(approvalResult.data.approval);
      }

      setLoadState('ready');
    })();

    return () => {
      live = false;
    };
  }, [api, stage]);

  useEffect(() => {
    setOpenId(null);
    setAgentOpen(false);
    setPromptOpen(false);
    setSavedNote('');
    return load();
  }, [load]);

  const model = useMemo(() => buildModel(schema, stage), [schema, stage]);

  const promptContext = useMemo<PromptContext>(
    () => ({
      brandId,
      brandName,
      stageId: stage,
      stageNum: stageNum(stage),
      stageName: stageName(stage),
      setId,
      setName: props.setName ?? '',
    }),
    [brandId, brandName, stage, setId, props.setName],
  );

  /*
   * 這一頁自己就是一個範圍（04A 核心識別、04G 治理）：除了一格一格的
   * prompt，還要一份交代整頁的。01–03 與品牌集內的階段由總覽那份負責，
   * `scopePrompt` 不傳就不會出現第二個入口。
   */
  const scopePromptEnabled = props.scopePrompt === true && brandId !== '';

  const scopeStages = useMemo<ScopePromptStage[]>(
    () => [
      {
        id: stage,
        num: stageNum(stage),
        name: stageName(stage),
        blocks: model.sections.flatMap((section) => {
          const item = scopeBlockOf(blocks[section.id], section);
          return item === null ? [] : [item];
        }),
        progress: scopeProgressOf(brief),
      },
    ],
    [stage, model, blocks, brief],
  );

  const scopeGenerated = useMemo(
    () =>
      buildScopePrompt({
        brand: { id: brandId, name: brandName },
        scope: { kind: 'stage', setId: null, setName: '' },
        stages: scopeStages,
      }),
    [brandId, brandName, scopeStages],
  );

  const scopePrompt = useScopePrompt({
    brandId,
    setId: null,
    scopeKey: stage,
    generated: scopeGenerated,
    enabled: scopePromptEnabled,
  });

  const patchBlock = useCallback((block: GuideBlock) => {
    setBlocks((prev) => ({ ...prev, [block.blockId]: block }));
  }, []);

  /**
   * 重新讀這一 stage 的區塊紀錄。
   *
   * 為什麼要輪詢：決策可以由 agent 經 MCP 寫入。如果只在載入時讀一次，
   * 老闆看著畫面等 agent 寫完，會以為沒有成功 —— 看不到的改動等於沒做。
   * 12 秒一次、單一 stage 三條查詢，成本很低。
   */
  const refreshBlocks = useCallback(async () => {
    const result = await api.blocks(stage);

    if (!result.ok) {
      return;
    }

    const map: Record<string, GuideBlock> = {};
    for (const block of result.data.blocks) {
      map[block.blockId] = block;
    }
    setBlocks(map);
  }, [api, stage]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshBlocks();
    }, 12_000);

    // 切返嚟這個 tab 即刻更新，不等下一個 tick。
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') {
        void refreshBlocks();
      }
    };

    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshBlocks]);

  /**
   * 卡片上的四種寫入。全部回 boolean 而不是丟錯誤：面板要喺原位顯示
   * 「儲存唔到」，唔應該整頁炸掉。
   */
  const blockApi = useMemo<BlockApi>(
    () => ({
      async saveDecision(section, decision) {
        const result = await api.saveDecision(stage, section.id, {
          code: section.code,
          title: section.title,
          decision,
        });
        if (!result.ok) {
          return false;
        }
        patchBlock(result.data.block);
        return true;
      },
      async savePrompt(section, prompt) {
        const result = await api.savePrompt(stage, section.id, {
          code: section.code,
          title: section.title,
          prompt,
        });
        if (!result.ok) {
          return false;
        }
        patchBlock(result.data.block);
        return true;
      },
      async saveRationale(section, rationale) {
        const result = await api.saveRationale(stage, section.id, {
          code: section.code,
          title: section.title,
          rationale,
        });
        if (!result.ok) {
          return false;
        }
        patchBlock(result.data.block);
        return true;
      },
      async upload(section, file) {
        const uploaded = await uploadFile(file);
        if (!uploaded.ok) {
          return false;
        }
        const attached = await api.attachFile(stage, section.id, {
          code: section.code,
          title: section.title,
          fileId: uploaded.data.id,
        });
        if (!attached.ok) {
          // 掛唔上就唔好留一份孤兒檔案喺檔案層。
          await deleteFile(uploaded.data.id);
          return false;
        }
        patchBlock(attached.data.block);
        return true;
      },
      async removeFile(section, attachmentId) {
        const result = await api.removeFile(stage, section.id, attachmentId);
        if (!result.ok) {
          return false;
        }
        patchBlock(result.data.block);
        return true;
      },
    }),
    [api, stage, patchBlock],
  );

  const ops: FieldOps = useMemo(
    () => ({
      toggleCat(key, itemId, max) {
        setDraft((prev) => {
          const current = Array.isArray(prev[key]) ? (prev[key] as string[]) : [];
          if (current.includes(itemId)) {
            return { ...prev, [key]: current.filter((item) => item !== itemId) };
          }
          if (current.length >= max) {
            return prev;
          }
          return { ...prev, [key]: [...current, itemId] };
        });
      },
      setDim(field, optId) {
        setDraft((prev) => {
          if (field.container === 'pick') {
            const pick = { ...((prev.pick as Record<string, Record<string, string>>) ?? {}) };
            const group = { ...(pick[field.set] ?? {}) };
            if (optId === '') {
              delete group[field.id];
            } else {
              group[field.id] = optId;
            }
            pick[field.set] = group;
            return { ...prev, pick };
          }
          const dims = { ...((prev.dims as Record<string, string>) ?? {}) };
          if (optId === '') {
            delete dims[field.id];
          } else {
            dims[field.id] = optId;
          }
          return { ...prev, dims };
        });
      },
      setOne(field, optId) {
        setDraft((prev) => {
          if (field.source === 'tension') {
            return { ...prev, tensionPrimary: optId };
          }
          const sit = { ...((prev.sit as Record<string, string>) ?? {}) };
          if (optId === '') {
            delete sit[field.id];
          } else {
            sit[field.id] = optId;
          }
          return { ...prev, sit };
        });
      },
      setText(id, value) {
        setDraft((prev) => ({
          ...prev,
          text: { ...((prev.text as Record<string, string>) ?? {}), [id]: value },
        }));
      },
      setDial(id, value) {
        setDraft((prev) => ({
          ...prev,
          dials: { ...((prev.dials as Record<string, number>) ?? {}), [id]: value },
        }));
      },
      clearDial(id) {
        setDraft((prev) => {
          const dials = { ...((prev.dials as Record<string, number>) ?? {}) };
          delete dials[id];
          return { ...prev, dials };
        });
      },
    }),
    [],
  );

  if (loadState === 'loading') {
    return <p className="design-empty">{t('brandBuild.loading')}</p>;
  }

  if (loadState === 'failed' || schema === null) {
    return (
      <div className="design-empty">
        <p>{t('brandBuild.loadFailed')}</p>
        <button type="button" className="design-btn" onClick={onBack}>
          {t('brandBuild.overview.back')}
        </button>
      </div>
    );
  }

  const counts = modelAnswer(model, state);
  // 頂欄進度用「已填欄位」：填一格就動，唔會等到成組完成才跳。
  // 引擎的完成度（brief.completeness）留在總覽的階段卡顯示，兩者意思唔同。
  const coverage = counts.total === 0 ? 0 : Math.round((counts.done / counts.total) * 100);
  const checks = (brief?.consistency_checks as { level: string; msg: string }[] | undefined) ?? [];
  const hints =
    (brief?.downstream_hints as { stage: string; field: string; text: string; why: string }[] | undefined) ?? [];
  const dirty = openId !== null && JSON.stringify(draft) !== JSON.stringify(state);

  function openBlock(sectionId: string) {
    // 另一格仲有未存改動：問一句才跳，唔好靜靜丟走。
    if (openId !== null && openId !== sectionId && dirty && !window.confirm(t('brandBuild.edit.discardConfirm'))) {
      return;
    }

    setDraft(cloneState(state));
    setOpenId(sectionId);
    setError('');
    // 卡可能喺畫面下方：開卡後即時捲到頂，唔使人自己搵。
    window.setTimeout(() => {
      const node = document.querySelector(`[data-edit-section="${sectionId}"]`);
      if (node instanceof HTMLElement) {
        node.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    }, 80);
  }

  function closeBlock() {
    setOpenId(null);
    setDraft({});
    setError('');
  }

  async function save() {
    setSaving(true);
    setError('');
    const result = await api.saveState(stage, draft);
    setSaving(false);
    if (!result.ok) {
      setError(t('brandBuild.edit.saveFailedHint'));
      return;
    }
    setState(draft);
    setBrief(result.data.brief);
    // 唔關卡：儲存完通常仲要寫決策、放檔案。draft 跟手同步，就唔會再顯示「未儲存」。
    setDraft(cloneState(draft));
    setSavedNote(t('brandBuild.edit.saveDone'));
    window.setTimeout(() => setSavedNote(''), 4000);
  }

  return (
    <div className="brand-dash" data-brand-dash-stage={stage}>
      <div className="brand-stage__bar">
        {props.showBack !== false && (
          <button type="button" className="brand-build__back" onClick={onBack}>
            {t('brandBuild.overview.back')}
          </button>
        )}
        <div className="brand-stage__ident">
          <span className="brand-dash__eyebrow">{stageNum(stage)}</span>
          <h2 className="brand-dash__title">{stageName(stage)}</h2>
        </div>
        <div className="brand-dash__progress brand-stage__progress">
          <span className="brand-dash__pct">{coverage}%</span>
          <div
            className="brand-dash__bar"
            role="progressbar"
            aria-valuenow={coverage}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <i style={{ width: `${coverage}%` }} />
          </div>
          <span className="brand-dash__progLabel">
            {counts.done}/{counts.total} {t('brandBuild.dash.fieldsN')}
          </span>
        </div>
        <div className="brand-stage__actions">
          {/*
            沒有上一階段／下一階段（老闆 2026-11-17 晚：「we don't need 階段
            buttons」）。次序是左欄那棵樹的事：人由左欄進去，比在頁尾猜
            「下一站是甚麼」清楚。剩下的只有佢自己那一份 Prompt 與匯出。
          */}
          {scopePromptEnabled && (
            <>
              <CopyButton text={scopePrompt.text} label={t('brandBuild.block.copyPrompt')} />
              <button
                type="button"
                className={`design-btn${promptOpen ? ' design-btn--primary' : ''}`}
                aria-pressed={promptOpen}
                data-brand-scope-prompt-toggle
                onClick={() => setPromptOpen((value) => !value)}
              >
                {promptOpen ? t('brandBuild.block.hidePrompt') : t('brandBuild.block.promptShow')}
              </button>
            </>
          )}
          <button
            type="button"
            className={`design-btn${approvalOpen ? ' design-btn--primary' : ''}`}
            aria-pressed={approvalOpen}
            data-brand-approval-toggle
            onClick={() => setApprovalOpen((value) => !value)}
          >
            {t('brandBuild.approval.button', {
              status: approvalStatusLabel(approval?.status ?? 'draft'),
            })}
          </button>
          <button
            type="button"
            className={`design-btn${agentOpen ? ' design-btn--primary' : ''}`}
            aria-pressed={agentOpen}
            data-brand-agent-toggle
            onClick={() => setAgentOpen((value) => !value)}
          >
            {t('brandBuild.agent.button')}
          </button>
        </div>
      </div>

      {savedNote !== '' && (
        <p className="brand-stage__saved" role="status" data-brand-saved>
          {savedNote}
        </p>
      )}

      {scopePromptEnabled && promptOpen && (
        <ScopePromptPanel
          text={scopePrompt.text}
          custom={scopePrompt.custom}
          state={scopePrompt.state}
          saving={scopePrompt.saving}
          note={scopePrompt.note}
          onSave={scopePrompt.save}
          onReset={scopePrompt.reset}
          onRetry={scopePrompt.retry}
          onClose={() => setPromptOpen(false)}
        />
      )}

      {approvalOpen && (
        <ApprovalPanel
          stage={stage}
          approval={approval}
          api={api}
          onSaved={(next) => setApproval(next)}
          onClose={() => setApprovalOpen(false)}
        />
      )}

      {agentOpen && (
        <section className="brand-agent" data-brand-agent>
          <div className="brand-agent__head">
            <div>
              <h3 className="brand-agent__title">{t('brandBuild.agent.button')}</h3>
              <p className="brand-agent__lead">{t('brandBuild.agent.panelLead')}</p>
            </div>
            <button type="button" className="design-btn" onClick={() => setAgentOpen(false)}>
              {t('brandBuild.dash.closeDetail')}
            </button>
          </div>
          <StageContext context={promptContext} sections={model.sections} blocks={blocks} />
        </section>
      )}

      <div className="brand-dash__body">
        {counts.stale.length > 0 && (
          <div className="brand-dash__stale" data-brand-stale>
            <b>{t('brandBuild.dash.staleTitle')}</b>
            <p>{t('brandBuild.dash.staleBody')}</p>
            <span className="brand-dash__staleList">{counts.stale.join('、')}</span>
          </div>
        )}

        <BriefDerivedSection brief={brief} model={model} />

        {model.bands.map((band) => (
          <section key={band.id} className="brand-dash__band" data-brand-band={band.id}>
            <h3 className="brand-dash__bandTitle">{band.title}</h3>
            <div className="brand-cardgrid">
              {band.sections.map((section) =>
                openId === section.id ? (
                  <SectionCardOpen
                    key={section.id}
                    section={section}
                    block={blocks[section.id]}
                    draft={draft}
                    model={model}
                    ops={ops}
                    promptContext={promptContext}
                    blockApi={blockApi}
                    saving={saving}
                    dirty={dirty}
                    error={error}
                    onSave={() => void save()}
                    onClose={closeBlock}
                  />
                ) : (
                  <SectionCardView
                    key={section.id}
                    section={section}
                    state={state}
                    model={model}
                    block={blocks[section.id]}
                    onOpen={() => openBlock(section.id)}
                  />
                ),
              )}
            </div>
          </section>
        ))}

        <DashSection title={t('brandBuild.view.checks')}>
          <ul className="brand-dash__checks">
            {checks.length === 0 ? (
              <li className="brand-dash__check brand-dash__check--info">
                <span className="brand-dash__checkIcon" aria-hidden="true" />
                {t('brandBuild.dash.checksNone')}
              </li>
            ) : (
              checks.map((check, index) => (
                <li key={index} className={`brand-dash__check brand-dash__check--${check.level}`}>
                  <span className="brand-dash__checkIcon" aria-hidden="true" />
                  {check.msg}
                </li>
              ))
            )}
          </ul>
        </DashSection>

        {hints.length > 0 && (
          <DashSection title={t('brandBuild.view.hints')}>
            <ul className="brand-dash__hints">
              {hints.map((hint, index) => (
                <li key={index}>
                  <b>
                    {hint.stage} · {hint.field}
                  </b>
                  ：{hint.text}
                  <small>
                    {t('brandBuild.view.hintWhy')}：{hint.why}
                  </small>
                </li>
              ))}
            </ul>
          </DashSection>
        )}
      </div>
    </div>
  );
}

/* ── 卡片：格上只放內容，點開才見整份工作 ───────────────── */

/**
 * 格上的卡：編號、名稱、已選內容、決策摘要。
 *
 * 卡上不再放工具列 —— prompt／檔案／決策／歷史都屬於這一格的內部，
 * 點開之後才出現。格上只留「這是甚麼、填了幾多、上次結論是甚麼」。
 */
function SectionCardView(props: {
  section: PlacedSection;
  state: Record<string, unknown>;
  model: Model;
  block: GuideBlock | undefined;
  onOpen: () => void;
}) {
  const { section, state, model, block, onOpen } = props;
  const answer = sectionAnswer(section, state, model);
  const pct = answer.total === 0 ? 0 : Math.round((answer.done / answer.total) * 100);
  const rows = section.fields.map((field) => ({ field, answer: answerOf(field, state, model) }));
  const shown = rows.slice(0, 8);
  const rest = rows.length - shown.length;
  const hasDecision = block !== undefined && block.decision.trim() !== '';
  // 格上要見到「呢格有幾多個檔案」：唔使開卡都知邊幾格放過料。
  const fileCount = (block?.files ?? []).filter((file) => file.removedAt === null).length;

  return (
    <article
      className={`brand-cardgrid__card${answer.done === 0 ? ' brand-cardgrid__card--empty' : ''}`}
      data-brand-card={section.id}
    >
      <button type="button" className="brand-cardgrid__hit" onClick={onOpen} data-card-hit>
        <span className="brand-cardgrid__cardTop">
          <span className="brand-cardgrid__cardIdent">
            <span className="brand-cardgrid__cardCode" data-block-code>
              {section.code}
            </span>
            <span className="brand-cardgrid__cardTitle">{section.title}</span>
          </span>
          <span className="brand-cardgrid__cardMeta">
            {fileCount > 0 && (
              <span className="brand-cardgrid__cardFiles" data-card-files>
                {t('brandBuild.card.files', { n: String(fileCount) })}
              </span>
            )}
            <span
              className={`brand-cardgrid__cardCount${answer.done === answer.total ? ' brand-cardgrid__cardCount--done' : ''}`}
            >
              {answer.done}/{answer.total}
            </span>
          </span>
        </span>
        <span className="brand-cardgrid__cardBar">
          <i style={{ width: `${pct}%` }} />
        </span>
        <span className="brand-cardgrid__rows">
          {shown.map((row) => (
            <span
              key={row.field.id}
              className={`brand-cardgrid__row${section.fields.length === 1 ? ' brand-cardgrid__row--solo' : ''}`}
            >
              {/* 一張卡只有一個欄位時，標題已寫在上面，唔重複貼一次。 */}
              {section.fields.length > 1 && <span className="brand-cardgrid__rowLabel">{row.field.title}</span>}
              <FieldValue field={row.field} answer={row.answer} state={state} />
            </span>
          ))}
          {rest > 0 && <span className="brand-cardgrid__more">{t('brandBuild.card.more', { n: String(rest) })}</span>}
        </span>
        {/* 決策是這張卡的重點：唔開卡都睇得到最後定了甚麼。 */}
        {hasDecision && (
          <span className="brand-cardgrid__decisionLine" data-card-decision>
            <b>{t('brandBuild.block.decisionLabel')}</b>
            <span>{block.decision}</span>
          </span>
        )}
      </button>
    </article>
  );
}

/**
 * 打開的卡：一格的完整工作面。
 *
 * 頂欄右邊依次是「複製 Prompt」「睇 Prompt」「儲存」「關閉」；下面由選項、
 * 決策、檔案、歷史排落去。Prompt 用 draft 砌，所以未儲存之前複製出去的
 * 都已經是最新選擇。
 */
function SectionCardOpen(props: {
  section: PlacedSection;
  block: GuideBlock | undefined;
  draft: Record<string, unknown>;
  model: Model;
  ops: FieldOps;
  promptContext: PromptContext;
  blockApi: BlockApi;
  saving: boolean;
  dirty: boolean;
  error: string;
  onSave: () => void;
  onClose: () => void;
}) {
  const { section, block, draft, model, ops, promptContext, blockApi, saving, dirty, error, onSave, onClose } = props;
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptDraft, setPromptDraft] = useState<string | null>(null);
  const [promptSaving, setPromptSaving] = useState(false);
  const [promptNote, setPromptNote] = useState('');
  const answer = sectionAnswer(section, draft, model);
  const onlyText = section.fields.every((field) => field.k === 'text');

  // 自動版本跟住 draft 即時更新（未儲存之前複製都已經是最新選擇）；
  // 一旦老闆改過並儲存，就用他自己那一版，畫面會講明它不再跟選擇更新。
  const generated = useMemo(
    () => promptFor(promptContext, section, draft, model, block),
    [promptContext, section, draft, model, block],
  );
  const custom = (block?.promptOverride ?? '').trim() !== '';
  const savedPrompt = custom ? (block?.promptOverride ?? '') : generated;
  const promptText = promptDraft ?? savedPrompt;

  // 儲存成功之後回到「顯示已儲存那一版」，不留一個看起來未存的草稿。
  // 不清 promptNote：留言是由 savePrompt 自己控制幾時熄，這裡清掉會令
  // 「Prompt 已儲存」永遠閃不出來。
  useEffect(() => {
    setPromptDraft(null);
  }, [block?.promptOverride]);

  async function savePrompt() {
    setPromptSaving(true);
    setPromptNote('');
    const ok = await blockApi.savePrompt(section, promptText);
    setPromptSaving(false);

    if (!ok) {
      setPromptNote(t('brandBuild.block.prompt.failed'));
      return;
    }

    setPromptDraft(null);
    setPromptNote(t('brandBuild.block.prompt.saved'));
    window.setTimeout(() => setPromptNote(''), 3000);
  }

  async function resetPrompt() {
    setPromptSaving(true);
    setPromptNote('');
    const ok = await blockApi.savePrompt(section, '');
    setPromptSaving(false);

    if (!ok) {
      setPromptNote(t('brandBuild.block.prompt.failed'));
      return;
    }

    setPromptDraft(null);
    setPromptNote(t('brandBuild.block.prompt.resetDone'));
    window.setTimeout(() => setPromptNote(''), 3000);
  }

  /**
   * 開 prompt 時把卡頂拉返入畫面：browser 的 scroll anchoring 會因為內容
   * 變高而把選項留在原位，prompt 就變成「開了但睇唔到」。
   */
  function togglePrompt() {
    const next = !promptOpen;
    setPromptOpen(next);

    if (next) {
      window.setTimeout(() => {
        const node = document.querySelector(`[data-edit-section="${section.id}"]`);
        if (node instanceof HTMLElement) {
          node.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }
      }, 60);
    }
  }

  function requestClose() {
    // 改動未儲存就關，等於丟掉。問一句，唔好靜靜食咗。
    if (dirty && !window.confirm(t('brandBuild.edit.discardConfirm'))) {
      return;
    }

    onClose();
  }

  return (
    <section
      className="brand-cardgrid__card brand-cardgrid__card--open"
      data-brand-card={section.id}
      data-edit-section={section.id}
      data-card-panel
    >
      <header className="brand-open__head">
        <div className="brand-open__ident">
          <span className="brand-open__code" data-block-code>
            {section.code}
          </span>
          <h4 className="brand-open__title">{section.title}</h4>
          <span
            className={`brand-cardgrid__cardCount${answer.done === answer.total ? ' brand-cardgrid__cardCount--done' : ''}`}
          >
            {answer.done}/{answer.total}
          </span>
        </div>
        <div className="brand-open__actions">
          <CopyButton text={promptText} label={t('brandBuild.block.copyPrompt')} />
          <button
            type="button"
            className={`design-btn${promptOpen ? ' design-btn--primary' : ''}`}
            aria-pressed={promptOpen}
            onClick={togglePrompt}
            data-open-prompt
          >
            {promptOpen ? t('brandBuild.block.hidePrompt') : t('brandBuild.block.promptShow')}
          </button>
          <button
            type="button"
            className="design-btn design-btn--primary"
            disabled={saving || !dirty}
            onClick={onSave}
            data-open-save
          >
            {saving ? t('brandBuild.saving') : t('brandBuild.edit.save')}
          </button>
          <button
            type="button"
            className="brand-open__close"
            aria-label={t('brandBuild.block.close')}
            title={t('brandBuild.block.close')}
            onClick={requestClose}
            data-open-close
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </header>

      <div className="brand-open__body">
        {dirty && <p className="brand-edit__state brand-edit__state--dirty">{t('brandBuild.edit.unsaved')}</p>}
        {error !== '' && <p className="brand-edit__error">{error}</p>}

        {promptOpen && (
          <BlockSection
            kind="prompt"
            title={t('brandBuild.block.promptTitle')}
            lead={t('brandBuild.block.promptLead')}
            actions={
              <>
                <button
                  type="button"
                  className="design-btn design-btn--primary"
                  disabled={promptSaving || promptText === savedPrompt}
                  onClick={() => void savePrompt()}
                  data-prompt-save
                >
                  {promptSaving ? t('brandBuild.saving') : t('brandBuild.block.prompt.save')}
                </button>
                {custom && (
                  <button
                    type="button"
                    className="design-btn"
                    disabled={promptSaving}
                    onClick={() => void resetPrompt()}
                    data-prompt-reset
                  >
                    {t('brandBuild.block.prompt.reset')}
                  </button>
                )}
              </>
            }
          >
            <textarea
              className="brand-block__promptEdit"
              rows={16}
              value={promptText}
              onChange={(event) => setPromptDraft(event.target.value)}
              aria-label={t('brandBuild.block.promptTitle')}
              spellCheck={false}
              data-prompt-editor
            />
            <div className="brand-block__foot">
              <span className="brand-block__meta">
                {custom ? t('brandBuild.block.prompt.customNote') : t('brandBuild.block.prompt.autoNote')}
              </span>
              {promptNote !== '' && (
                <span className="brand-block__saved" role="status" data-prompt-note>
                  {promptNote}
                </span>
              )}
            </div>
          </BlockSection>
        )}

        <div className="brand-edit__fields" data-edit-kind={onlyText ? 'text' : 'choice'}>
          {section.fields.map((field) => (
            <FieldEditor key={field.id} field={field} draft={draft} model={model} {...ops} />
          ))}
        </div>

        <BlockDecisionPanel section={section} block={block} api={blockApi} />
        <BlockRationalePanel section={section} block={block} api={blockApi} />
        <BlockFilesPanel section={section} block={block} api={blockApi} />
        <BlockHistoryPanel block={block} />
      </div>
    </section>
  );
}

/** 卡內每一節（prompt／決策／檔案／歷史）的殼：標題、說明、右邊的動作。 */
function BlockSection(props: {
  kind: string;
  title: string;
  count?: number;
  lead?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="brand-block" data-block-panel={props.kind}>
      <div className="brand-block__head">
        <div className="brand-block__headText">
          <b className="brand-block__title">
            {props.title}
            {props.count !== undefined && <span className="brand-block__count">{props.count}</span>}
          </b>
          {props.lead !== undefined && props.lead !== '' && <p className="brand-block__lead">{props.lead}</p>}
        </div>
        {props.actions !== undefined && <div className="brand-block__headActions">{props.actions}</div>}
      </div>
      {props.children}
    </section>
  );
}

/**
 * 複製文字。
 *
 * 非安全來源（http 而非 localhost）沒有 clipboard API：退回 execCommand，
 * 至少使用者可以自己按 Cmd-C —— 複製不到要講得出，不要靜靜失敗。
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard !== undefined) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 落去 fallback。
  }

  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();

  let ok: boolean;

  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }

  document.body.removeChild(area);
  return ok;
}

/** 複製按鈕：成敗都講出聲，唔好靜靜失敗。 */
function CopyButton(props: { text: string; label: string; primary?: boolean }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');

  async function copy() {
    const ok = await copyText(props.text);
    setState(ok ? 'done' : 'failed');
    window.setTimeout(() => setState('idle'), 2200);
  }

  return (
    <button
      type="button"
      className={`design-btn${props.primary === true ? ' design-btn--primary' : ''}`}
      onClick={() => void copy()}
      data-copy-button
    >
      {state === 'done'
        ? t('brandBuild.block.copied')
        : state === 'failed'
          ? t('brandBuild.block.copyFailed')
          : props.label}
    </button>
  );
}

/**
 * 檔案：上載、預覽、下載、移除。移除只標記，歷史仍然有紀錄。
 *
 * 為什麼要有預覽：開會時貼一份牌照顧問 PDF 進來，之後要確認「係咪呢份」，
 * 開新分頁再等一次下載很慢。圖片與 PDF 直接在卡內看，其餘類型老實講
 * 「未能在畫面預覽」並保留下載。
 */
function BlockFilesPanel(props: { section: PlacedSection; block: GuideBlock | undefined; api: BlockApi }) {
  const { section, block, api } = props;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const files = (block?.files ?? []).filter((file) => file.removedAt === null);

  async function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // 清空 value：同一個檔案揀兩次都要觸發 onChange。
    event.target.value = '';

    if (file === undefined) {
      return;
    }

    setBusy(true);
    setError('');
    const ok = await api.upload(section, file);
    setBusy(false);

    if (!ok) {
      setError(t('brandBuild.block.uploadFailed'));
    }
  }

  async function remove(attachmentId: string) {
    if (!window.confirm(t('brandBuild.block.fileRemoveConfirm'))) {
      return;
    }

    setBusy(true);
    setError('');
    const ok = await api.removeFile(section, attachmentId);
    setBusy(false);

    if (ok) {
      setPreviewId((current) => (current === attachmentId ? null : current));
      return;
    }

    setError(t('brandBuild.block.uploadFailed'));
  }

  return (
    <BlockSection
      kind="files"
      title={t('brandBuild.block.filesTitle')}
      count={files.length}
      actions={
        <>
          <input ref={inputRef} type="file" className="brand-block__fileInput" onChange={(event) => void pick(event)} />
          <button
            type="button"
            className="design-btn design-btn--primary"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            data-block-upload
          >
            {busy ? t('brandBuild.block.uploading') : t('brandBuild.block.upload')}
          </button>
        </>
      }
    >
      {error !== '' && <p className="brand-edit__error">{error}</p>}
      {files.length === 0 ? (
        <p className="brand-block__empty">{t('brandBuild.block.filesEmpty')}</p>
      ) : (
        <ul className="brand-block__files">
          {files.map((file) => {
            const kind = previewKind(file.contentType);
            const open = previewId === file.id;

            return (
              <li key={file.id} className="brand-block__file" data-block-file={file.id}>
                <div className="brand-block__fileRow">
                  <div className="brand-block__fileText">
                    <span className="brand-block__fileName" title={file.originalName}>
                      {file.name}
                    </span>
                    <span className="brand-block__fileMeta">
                      {sizeText(file.sizeBytes)} · {whenText(file.createdAt)}
                      {file.uploadedByName !== '' &&
                        ` · ${t('brandBuild.block.fileUploader', { name: file.uploadedByName })}`}
                    </span>
                  </div>
                  <div className="brand-block__fileActions">
                    {kind !== 'none' && (
                      <button
                        type="button"
                        className={`design-btn${open ? ' design-btn--primary' : ''}`}
                        aria-expanded={open}
                        onClick={() => setPreviewId(open ? null : file.id)}
                        data-block-file-preview={file.id}
                      >
                        {open ? t('brandBuild.block.filePreviewHide') : t('brandBuild.block.filePreview')}
                      </button>
                    )}
                    <a
                      className="design-btn"
                      href={fileDownloadUrl(file.fileId, true)}
                      data-block-file-download={file.id}
                    >
                      {t('brandBuild.block.fileDownload')}
                    </a>
                    <button
                      type="button"
                      className="design-btn"
                      disabled={busy}
                      onClick={() => void remove(file.id)}
                      data-block-file-remove={file.id}
                    >
                      {t('brandBuild.block.fileRemove')}
                    </button>
                  </div>
                </div>
                {open && (
                  <div className="brand-block__preview" data-block-preview={file.id}>
                    {kind === 'image' && (
                      <img src={fileDownloadUrl(file.fileId)} alt={file.name} className="brand-block__previewImg" />
                    )}
                    {kind === 'frame' && (
                      <iframe
                        src={fileDownloadUrl(file.fileId)}
                        title={file.name}
                        className="brand-block__previewFrame"
                      />
                    )}
                    {kind === 'video' && (
                      <video src={fileDownloadUrl(file.fileId)} controls className="brand-block__previewMedia" />
                    )}
                    {kind === 'audio' && (
                      <audio src={fileDownloadUrl(file.fileId)} controls className="brand-block__previewMedia" />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </BlockSection>
  );
}

/** 可以在卡內直接顯示的類型；其餘一律只給下載。 */
function previewKind(contentType: string): 'image' | 'frame' | 'video' | 'audio' | 'none' {
  if (contentType.startsWith('image/')) {
    return 'image';
  }

  // PDF 與純文字用 iframe：瀏覽器自己的閱讀器比我們重做一個好。
  if (contentType === 'application/pdf' || contentType === 'text/plain') {
    return 'frame';
  }

  if (contentType.startsWith('video/')) {
    return 'video';
  }

  if (contentType.startsWith('audio/')) {
    return 'audio';
  }

  return 'none';
}

/** 決策：討論完把結論寫落嚟。每次內容有變都留一版歷史。 */
function BlockDecisionPanel(props: { section: PlacedSection; block: GuideBlock | undefined; api: BlockApi }) {
  const { section, block, api } = props;
  const [value, setValue] = useState(block?.decision ?? '');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  // 外面寫入（agent 經 MCP，或重新載入）之後同步一次；但使用者正在打字時
  // 不蓋他的內容 —— 只有「這份草稿仍然等於上一次同步的值」才跟外部更新。
  const synced = useRef(block?.decision ?? '');

  useEffect(() => {
    const next = block?.decision ?? '';
    setValue((current) => (current === synced.current ? next : current));
    synced.current = next;
  }, [block?.decision]);

  async function save() {
    setSaving(true);
    setError('');
    const ok = await api.saveDecision(section, value);
    setSaving(false);

    if (!ok) {
      setError(t('brandBuild.block.decisionFailed'));
      return;
    }

    setNote(t('brandBuild.block.decisionSaved'));
    window.setTimeout(() => setNote(''), 3000);
  }

  return (
    <BlockSection
      kind="decision"
      title={t('brandBuild.block.decisionTitle')}
      lead={t('brandBuild.block.decisionLead')}
      actions={
        <button
          type="button"
          className="design-btn design-btn--primary"
          // 只有「未改動」才停用：清空都要按得，否則寫錯字就擦唔走。
          disabled={saving || value === (block?.decision ?? '')}
          onClick={() => void save()}
          data-block-decision-save
        >
          {saving ? t('brandBuild.block.decisionSaving') : t('brandBuild.block.decisionSave')}
        </button>
      }
    >
      <textarea
        className="brand-edit__textarea brand-block__decision"
        rows={5}
        placeholder={t('brandBuild.block.decisionPlaceholder')}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        data-block-decision
      />
      {error !== '' && <p className="brand-edit__error">{error}</p>}
      <div className="brand-block__foot">
        <span className="brand-block__meta" data-decision-meta>
          {block !== undefined && block.decision.trim() !== '' && block.decisionAt !== null
            ? block.decisionActorType === 'agent'
              ? `${t('brandBuild.block.decisionByAgent', { name: block.decisionByName ?? '' })} · ${whenText(block.decisionAt)}`
              : `${t('brandBuild.block.decisionBy')} ${block.decisionByName ?? ''} · ${whenText(block.decisionAt)}`
            : t('brandBuild.block.decisionEmpty')}
        </span>
        {note !== '' && (
          <span className="brand-block__saved" role="status">
            {note}
          </span>
        )}
      </div>
    </BlockSection>
  );
}

/** 區塊的 rationale（為甚麼這樣揀）。與 decision（結論）分開，卡片內另一節。 */
function BlockRationalePanel(props: { section: PlacedSection; block: GuideBlock | undefined; api: BlockApi }) {
  const { section, block, api } = props;
  const [value, setValue] = useState(block?.rationale ?? '');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const synced = useRef(block?.rationale ?? '');

  useEffect(() => {
    const next = block?.rationale ?? '';
    setValue((current) => (current === synced.current ? next : current));
    synced.current = next;
  }, [block?.rationale]);

  async function save() {
    setSaving(true);
    setError('');
    const ok = await api.saveRationale(section, value);
    setSaving(false);

    if (!ok) {
      setError(t('brandBuild.block.rationaleFailed'));
      return;
    }

    setNote(t('brandBuild.block.rationaleSaved'));
    window.setTimeout(() => setNote(''), 3000);
  }

  return (
    <BlockSection
      kind="rationale"
      title={t('brandBuild.block.rationaleTitle')}
      lead={t('brandBuild.block.rationaleLead')}
      actions={
        <button
          type="button"
          className="design-btn design-btn--primary"
          disabled={saving || value === (block?.rationale ?? '')}
          onClick={() => void save()}
          data-block-rationale-save
        >
          {saving ? t('brandBuild.block.rationaleSaving') : t('brandBuild.block.rationaleSave')}
        </button>
      }
    >
      <textarea
        className="brand-edit__textarea brand-block__decision"
        rows={4}
        placeholder={t('brandBuild.block.rationalePlaceholder')}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        data-block-rationale
      />
      {error !== '' && <p className="brand-edit__error">{error}</p>}
      <div className="brand-block__foot">
        <span className="brand-block__meta">
          {block !== undefined && block.rationale.trim() !== ''
            ? t('brandBuild.block.rationaleFilled')
            : t('brandBuild.block.rationaleEmpty')}
        </span>
        {note !== '' && (
          <span className="brand-block__saved" role="status">
            {note}
          </span>
        )}
      </div>
    </BlockSection>
  );
}

type HistoryItem = {
  key: string;
  at: string;
  kind: 'decision' | 'file-add' | 'file-remove';
  text: string;
  who: string;
  /** 這一版是 agent 經 MCP 寫的（畫面要分得出，不是人寫的）。 */
  agent: boolean;
};

/** 歷史 = 決策版本 ＋ 檔案加減，按時間倒序。卡片計數與面板共用這一份。 */
function historyOf(block: GuideBlock | undefined): HistoryItem[] {
  const items: HistoryItem[] = [];

  for (const revision of block?.revisions ?? []) {
    items.push({
      key: `rev-${revision.id}`,
      at: revision.createdAt,
      kind: 'decision',
      text: revision.decision,
      who: revision.actorName,
      agent: revision.actorType === 'agent',
    });
  }

  for (const file of block?.files ?? []) {
    items.push({
      key: `add-${file.id}`,
      at: file.createdAt,
      kind: 'file-add',
      text: file.name,
      who: file.uploadedByName,
      agent: false,
    });
    if (file.removedAt !== null) {
      items.push({
        key: `rm-${file.id}`,
        at: file.removedAt,
        kind: 'file-remove',
        text: file.name,
        who: file.removedByName ?? '',
        agent: false,
      });
    }
  }

  return items.sort((a, b) => b.at.localeCompare(a.at));
}

function BlockHistoryPanel(props: { block: GuideBlock | undefined }) {
  const items = historyOf(props.block);

  return (
    <BlockSection kind="history" title={t('brandBuild.block.historyTitle')} count={items.length}>
      {items.length === 0 ? (
        <p className="brand-block__empty">{t('brandBuild.block.historyEmpty')}</p>
      ) : (
        <ol className="brand-block__history">
          {items.map((item) => (
            <li key={item.key} className={`brand-block__event brand-block__event--${item.kind}`}>
              <span className="brand-block__eventAt">{whenText(item.at)}</span>
              <span className="brand-block__eventKind">
                {item.kind === 'decision'
                  ? item.agent
                    ? t('brandBuild.block.historyDecisionAgent')
                    : t('brandBuild.block.historyDecision')
                  : item.kind === 'file-add'
                    ? t('brandBuild.block.historyFileAdd')
                    : t('brandBuild.block.historyFileRemove')}
              </span>
              <span className="brand-block__eventText">{item.text}</span>
              {item.who !== '' && <span className="brand-block__eventWho">{item.who}</span>}
            </li>
          ))}
        </ol>
      )}
    </BlockSection>
  );
}

/** 卡片內一個欄位的值：多選顯示 chips，文字直接顯示，其餘顯示所選名稱。 */
function FieldValue(props: { field: Field; answer: Answer; state: Record<string, unknown> }) {
  const { field, answer, state } = props;

  if (answer.labels.length === 0) {
    return (
      <span className="brand-cardgrid__rowValue brand-cardgrid__rowValue--empty">
        {answer.stale.length > 0
          ? `${t('brandBuild.view.staleTag')}：${answer.stale.join('、')}`
          : t('brandBuild.dash.unfilled')}
      </span>
    );
  }

  if (field.k === 'cat') {
    const chips = answer.labels.slice(0, 8);
    return (
      <span className="brand-cardgrid__chips">
        {chips.map((label, index) => (
          <span key={`${label}-${index}`} className="brand-cardgrid__chip">
            {label}
          </span>
        ))}
        {answer.labels.length > chips.length && (
          <span className="brand-cardgrid__chip brand-cardgrid__chip--more">
            +{answer.labels.length - chips.length}
          </span>
        )}
      </span>
    );
  }

  if (field.k === 'text') {
    const raw = rawValues(field, state)[0] ?? '';
    return <span className="brand-cardgrid__rowValue brand-cardgrid__text">{raw}</span>;
  }

  if (field.k === 'dial') {
    // 標籤欄已經寫了兩端（正式 ⇄ 隨和），呢度只顯示選中位置。
    return (
      <span className="brand-cardgrid__rowValue">
        <span className="brand-cardgrid__chip">{answer.labels.join('')}</span>
      </span>
    );
  }

  return (
    <span className="brand-cardgrid__rowValue">
      <span className="brand-cardgrid__chip">{answer.labels.join('')}</span>
    </span>
  );
}

/* ── brief 衍生區塊（KPI／畫布／清單） ──────────────────── */

function BriefDerivedSection(props: { brief: GuideBrief | null; model: Model }) {
  const { brief, model } = props;
  if (brief === null) {
    return null;
  }

  const nodes: React.ReactNode[] = [];

  const economics = brief.derived as { unit_economics?: Record<string, unknown> } | undefined;
  const unit = economics?.unit_economics;
  if (unit !== undefined) {
    const hasValue = Object.values(unit).some((value) => typeof value === 'number');
    nodes.push(
      <DashSection key="econ" title={t('brandBuild.view.econ')} lead={t('brandBuild.view.econLead')}>
        {hasValue ? (
          <UnitEconTable unit={unit} />
        ) : (
          <p className="brand-dash__empty">{t('brandBuild.view.econEmpty')}</p>
        )}
      </DashSection>,
    );
  }

  const canvas = brief.business_canvas as { id: string; zh: string; en: string; lines: string[] }[] | undefined;
  if (Array.isArray(canvas) && canvas.length > 0) {
    nodes.push(
      <DashSection key="canvas" title={t('brandBuild.view.canvas')} lead={t('brandBuild.view.canvasLead')}>
        <div className="brand-dash__canvas">
          {canvas.map((block) => {
            const lines = block.lines
              .map((line) => cleanLine(line, model.labelById))
              .filter((line) => line !== '');
            return (
              <div
                key={block.id}
                className={`brand-dash__block brand-dash__block--${block.id}${lines.length === 0 ? ' brand-dash__block--empty' : ''}`}
              >
                <h4>
                  {block.zh}
                  <small>{block.en}</small>
                </h4>
                {lines.length === 0 ? (
                  <p className="brand-dash__empty">{t('brandBuild.dash.unfilled')}</p>
                ) : (
                  lines.map((line, index) => <p key={index}>{line}</p>)
                )}
              </div>
            );
          })}
        </div>
      </DashSection>,
    );
  }

  const checklist = brief.startup_checklist as
    | { id: string; title: string; status: string; detail: string }[]
    | undefined;
  if (Array.isArray(checklist) && checklist.length > 0) {
    nodes.push(
      <DashSection key="checklist" title={t('brandBuild.view.checklist')} lead={t('brandBuild.view.checklistLead')}>
        <ul className="brand-dash__checklist">
          {checklist.map((item) => (
            <li key={item.id} className={`brand-dash__checklistItem brand-dash__checklistItem--${item.status}`}>
              <span className="brand-dash__status">{checklistStatusLabel(item.status)}</span>
              <div>
                <b>{item.title}</b>
                <p>{item.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </DashSection>,
    );
  }

  if (nodes.length === 0) {
    return null;
  }

  return <>{nodes}</>;
}

function checklistStatusLabel(status: string): string {
  const map: Record<string, string> = {
    done: t('brandBuild.sw.status.done'),
    doing: t('brandBuild.sw.status.doing'),
    todo: t('brandBuild.sw.status.todo'),
    check: t('brandBuild.sw.status.review'),
    later: t('brandBuild.sw.status.later'),
  };
  return map[status] ?? status;
}

function UnitEconTable(props: { unit: Record<string, unknown> }) {
  const { unit } = props;
  const rows: [string, string, string][] = [
    ['gross_profit_per_transaction', t('brandBuild.calc.gp'), t('brandBuild.calc.gpFormula')],
    ['ltv', t('brandBuild.calc.ltv'), t('brandBuild.calc.ltvFormula')],
    ['ltv_to_cac', t('brandBuild.calc.ltvCac'), t('brandBuild.calc.ltvCacFormula')],
    ['payback_months', t('brandBuild.calc.payback'), t('brandBuild.calc.paybackFormula')],
    ['break_even_transactions_per_month', t('brandBuild.calc.breakEven'), t('brandBuild.calc.breakEvenFormula')],
    ['target_transactions_per_month', t('brandBuild.calc.target'), t('brandBuild.calc.targetFormula')],
  ];

  return (
    <table className="brand-dash__table">
      <tbody>
        {rows.map(([key, label, formula]) => {
          const value = unit[key];
          if (value === undefined || value === null || value === '') {
            return null;
          }
          return (
            <tr key={key}>
              <th>{label}</th>
              <td>
                <b>{String(value)}</b>
              </td>
              <td>
                <small>{formula}</small>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function FieldEditor(props: {
  field: Field;
  draft: Record<string, unknown>;
  model: Model;
  toggleCat: (key: string, itemId: string, max: number) => void;
  setDim: (field: DimField, optId: string) => void;
  setOne: (field: OneField, optId: string) => void;
  setText: (id: string, value: string) => void;
  setDial: (id: string, value: number) => void;
  clearDial: (id: string) => void;
}) {
  const { field, draft, model, toggleCat, setDim, setOne, setText, setDial, clearDial } = props;

  if (field.k === 'cat') {
    const picked = Array.isArray(draft[field.id]) ? (draft[field.id] as string[]) : [];
    const atMax = picked.length >= field.max;
    return (
      <div className="brand-edit__dim">
        {field.hint !== '' && <p className="brand-edit__cardHint">{field.hint}</p>}
        <p className="brand-edit__dimQ">
          {t('brandBuild.edit.max', { n: String(field.max) })} · {t('brandBuild.edit.picked', { n: String(picked.length) })}
        </p>
        {field.groups.map((group) => (
          <div key={group.g} className="brand-edit__group">
            {group.g !== '' && <b className="brand-edit__groupTitle">{group.g}</b>}
            <div className="brand-edit__options">
              {group.items.map((item) => {
                const checked = picked.includes(item.id);
                return (
                  <label
                    key={item.id}
                    className={`brand-edit__opt${checked ? ' brand-edit__opt--on' : ''}${!checked && atMax ? ' brand-edit__opt--off' : ''}${item.img !== undefined && item.img !== '' ? ' brand-edit__opt--img' : ''}`}
                  >
                    {item.img !== undefined && item.img !== '' && (
                      <img
                        className="brand-edit__optImg"
                        src={item.img}
                        alt={item.zh}
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                    <span className="brand-edit__optMain">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!checked && atMax}
                        onChange={() => toggleCat(field.id, item.id, field.max)}
                      />
                      <span className="brand-edit__optLabel">{item.zh}</span>
                    </span>
                    {item.desc !== undefined && item.desc !== '' && (
                      <span className="brand-edit__optDesc">{item.desc}</span>
                    )}
                    {item.lic !== undefined && item.lic !== '' && (
                      <span className="brand-edit__optLic">{item.lic}</span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (field.k === 'dim' || field.k === 'one') {
    const current = field.k === 'dim' ? pickValue(draft, field) : rawValues(field, draft)[0] ?? '';
    return (
      <div className="brand-edit__dim">
        <b className="brand-edit__dimTitle">{field.title}</b>
        {field.q !== '' && <p className="brand-edit__dimQ">{field.q}</p>}
        <div className="brand-edit__options">
          {field.opts.map((opt) => {
            const on = current === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                className={`brand-edit__opt brand-edit__opt--radio${on ? ' brand-edit__opt--on' : ''}${opt.img !== undefined && opt.img !== '' ? ' brand-edit__opt--img' : ''}`}
                aria-pressed={on}
                onClick={() => (field.k === 'dim' ? setDim(field, opt.id) : setOne(field, opt.id))}
              >
                {opt.img !== undefined && opt.img !== '' && (
                  <img
                    className="brand-edit__optImg"
                    src={opt.img}
                    alt={opt.zh}
                    loading="lazy"
                    decoding="async"
                  />
                )}
                <span className="brand-edit__optLabel">{opt.zh}</span>
                {opt.desc !== undefined && opt.desc !== '' && <span className="brand-edit__optDesc">{opt.desc}</span>}
              </button>
            );
          })}
        </div>
        {current !== '' && !model.labelById.has(current) && (
          <p className="brand-edit__staleNote">
            {t('brandBuild.view.staleTag')}：{current}
          </p>
        )}
        {current !== '' && (
          <button
            type="button"
            className="brand-edit__clear"
            onClick={() => (field.k === 'dim' ? setDim(field, '') : setOne(field, ''))}
          >
            {t('brandBuild.edit.unset')}
          </button>
        )}
      </div>
    );
  }

  if (field.k === 'dial') {
    const raw = (draft.dials as Record<string, unknown> | undefined)?.[field.id];
    const value = typeof raw === 'number' ? raw : null;
    return (
      <div className="brand-edit__dim">
        <b className="brand-edit__dimTitle">{field.l} ⇄ {field.r}</b>
        {field.q !== '' && <p className="brand-edit__dimQ">{field.q}</p>}
        <div className="brand-edit__dialRow">
          {[-2, -1, 0, 1, 2].map((step) => (
            <button
              key={step}
              type="button"
              className={`brand-edit__dialStep${value === step ? ' brand-edit__dialStep--on' : ''}`}
              aria-pressed={value === step}
              onClick={() => setDial(field.id, step)}
            >
              {dialLabel(step)}
            </button>
          ))}
        </div>
        <div className="brand-edit__dialEnds">
          <span>{field.l}</span>
          <span>{field.r}</span>
        </div>
        <p className="brand-edit__cardHint">{t('brandBuild.edit.dialNote')}</p>
        {value !== null && (value < 0 ? field.le : value > 0 ? field.re : '') !== '' && (
          <p className="brand-edit__dimQ">{value < 0 ? field.le : field.re}</p>
        )}
        {value !== null && (
          <button type="button" className="brand-edit__clear" onClick={() => clearDial(field.id)}>
            {t('brandBuild.edit.unset')}
          </button>
        )}
      </div>
    );
  }

  const value = str((draft.text as Record<string, unknown> | undefined)?.[field.id]);
  const rows = field.rows > 1 ? field.rows : 1;

  return (
    <div className="brand-edit__text">
      <b className="brand-edit__dimTitle">{field.title}</b>
      {field.help !== '' && <p className="brand-edit__dimQ">{field.help}</p>}
      {rows > 1 ? (
        <textarea
          className="brand-edit__textarea"
          rows={rows}
          placeholder={field.ph}
          value={value}
          onChange={(event) => setText(field.id, event.target.value)}
        />
      ) : (
        <input
          type="text"
          className="brand-edit__input"
          placeholder={field.ph}
          value={value}
          onChange={(event) => setText(field.id, event.target.value)}
        />
      )}
    </div>
  );
}

/* ── 整階段 context（給需要全份資料的 agent） ───────────── */

/**
 * 階段層的 JSON 匯出：只有「已填的決策」同「已上載的檔案」。
 *
 * 不再倒出整份 brief + state。老闆沒有打算一次填滿一版，把未填的欄位、選項庫、
 * 預設值都倒出去，agent 會把未決定的事當成已決定；而且那份 JSON 長到貼進對話
 * 就吃掉大半 context。逐格討論仍然用卡片上的 Prompt。
 */
function StageContext(props: {
  context: PromptContext;
  sections: PlacedSection[];
  blocks: Record<string, GuideBlock>;
}) {
  const { context, sections, blocks } = props;

  const payload = useMemo(
    () =>
      buildAgentInput({
        context,
        sections: sections.map((section) => ({
          blockId: section.id,
          code: section.code,
          title: section.title,
        })),
        blocks,
        origin: window.location.origin,
      }),
    [context, sections, blocks],
  );

  if (isEmptyAgentInput(payload)) {
    return (
      <div className="brand-dash__body">
        <p className="brand-agent__empty" data-brand-agent-empty>
          {t('brandBuild.agent.empty')}
        </p>
      </div>
    );
  }

  const json = JSON.stringify(payload, null, 2);

  return (
    <div className="brand-dash__body">
      <DashSection title={t('brandBuild.agent.briefTitle')} lead={t('brandBuild.agent.briefNote')}>
        <pre className="brand-dash__ctx" data-brand-agent-json>
          {json}
        </pre>
        <CopyButton text={json} label={t('brandBuild.json.copy')} />
      </DashSection>
    </div>
  );
}

/* ── 整組階段 context（品牌總覽／一個品牌集）──────────────── */

/**
 * 一組階段的 JSON 匯出：品牌總覽（01–03）或者一個品牌集（04B–04E、04H）。
 *
 * 為什麼要逐站抓 `api.blocks(stage)` 而不是用 brief：brief 只講「缺幾項」，
 * 決策內容同檔案位置只有區塊紀錄有。按下去才抓，打開總覽不會先打幾個 request。
 *
 * 為什麼要分 `stages` 陣列而不是把幾份 JSON 疊起來：同一個位置編號（例如
 * `04B.1`）在每一套品牌集都出現，疊起來 agent 分不出是邊一份；分站之後每條
 * 決策都帶著自己所屬的階段。
 */
function ScopeContext(props: {
  agent: OverviewAgent;
  stages: readonly StageEntry[];
  /**
   * 區塊紀錄由 `BrandOverview` 一次過載入，Prompt 與 JSON 兩個面板共用：
   * 各抓一次的話，兩個面板會各自停在不同的載入狀態，而同一份資料卻有兩個
   * 版本（一個剛好輪詢過、一個未）。
   */
  blocks: Record<string, GuideBlock[]> | null;
  state: 'idle' | 'loading' | 'ready' | 'failed';
  onRetry: () => void;
}) {
  const { agent, stages, blocks, state, onRetry } = props;

  const payload = useMemo(
    () =>
      buildScopeAgentInput({
        brand: { id: agent.brandId, name: agent.brandName },
        scope: { kind: agent.kind, id: agent.scopeId, name: agent.scopeName },
        stages: stages.map((stage) => ({
          id: stage.id,
          code: stage.num,
          name: stage.name,
          blocks: (blocks?.[stage.id] ?? []).map((block) => ({
            blockId: block.blockId,
            code: block.code,
            title: block.title,
            decision: block.decision,
            decisionAt: block.decisionAt,
            decisionByName: block.decisionByName,
            decisionActorType: block.decisionActorType,
            files: block.files,
          })),
        })),
        origin: window.location.origin,
      }),
    [agent.brandId, agent.brandName, agent.kind, agent.scopeId, agent.scopeName, stages, blocks],
  );

  if (state === 'idle' || state === 'loading') {
    return (
      <p className="design-empty" data-brand-scope-agent-loading>
        {t('brandBuild.loading')}
      </p>
    );
  }

  if (state === 'failed') {
    return (
      <div className="design-empty" data-brand-scope-agent-failed>
        <p>{t('brandBuild.loadFailed')}</p>
        <button type="button" className="design-btn" onClick={onRetry}>
          {t('common.retry')}
        </button>
      </div>
    );
  }

  if (isEmptyScopeAgentInput(payload)) {
    return (
      <div className="brand-dash__body">
        <p className="brand-agent__empty" data-brand-scope-agent-empty>
          {t('brandBuild.agent.scopeEmpty')}
        </p>
      </div>
    );
  }

  const json = JSON.stringify(payload, null, 2);

  return (
    <div className="brand-dash__body">
      <DashSection title={t('brandBuild.agent.briefTitle')} lead={t('brandBuild.agent.scopeBriefNote')}>
        <pre className="brand-dash__ctx" data-brand-scope-agent-json>
          {json}
        </pre>
        <CopyButton text={json} label={t('brandBuild.json.copy')} />
      </DashSection>
    </div>
  );
}

/* ── 通用區塊 ──────────────────────────────────────────── */

function DashSection(props: { title: string; lead?: string; children?: React.ReactNode }) {
  return (
    <section className="brand-dash__sec">
      <h3 className="brand-dash__secTitle">{props.title}</h3>
      {props.lead !== undefined && props.lead !== '' && <p className="brand-dash__secLead">{props.lead}</p>}
      {props.children}
    </section>
  );
}

/** 供外部（MCP／其他畫面）使用的 stage 卡資料計算，純函式。 */
export function computeStageCards(
  briefs: Record<string, GuideBrief>,
  map: GuideMapDimension[],
): StageCard[] {
  return STAGES.map((stage) => stageCardOf(stage.id, briefs, map));
}

export const BRAND_STAGES = STAGES;
export const BRAND_STAGE_IDS = STAGE_IDS;
export type { StageCard, StageCardStatus };

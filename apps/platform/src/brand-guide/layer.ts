/**
 * 品牌模組的「五層」投影：由 stage 的 brief 合成持續累積的產出物。
 *
 * 這份 module 是純函式 —— 只讀 brief（stage 事實），不寫任何表。層是投影，
 * 不是第二份真相（見 docs/product/BRAND-LAYER-RESTRUCTURE.md §3.1）。
 *
 * 五個層＋一個「不入層」：
 *   design.md  規則與原因（01／02／03／04A 方向）
 *   tokens     鎖死數值（04A 色／字／Logo、04B、04C 動態、04E UI、04D CMF）
 *   模板        限制版面（04F、04E 元件、04C 影片、04D 3D）
 *   範例        教味道（04H 風格庫、03 範例句）
 *   檢查        守門（04H、04F 合規、04B／04E 對比、04E 政策、04G 規則）
 *   不入層      狀態／紀錄／專業領域（4A 登記、4G 登記冊、4B 印刷、4E 空間、4D 工程）
 *
 * 每個 stage 的 brief 已由引擎 buildBrief() 算好，這裡只負責「揀邊段、砌成
 * 一份產出物」。核准狀態標記有兩個來源：
 *   - stage brief 內的 approval（4b–4h 引擎自帶，state 固定 draft）
 *   - brand_guide_approval 表（stage 級可寫入事實，本 module 由 caller 傳入）
 */

/** 層的種類。 */
export const LAYER_KINDS = [
  'design-doc',
  'tokens',
  'templates',
  'examples',
  'checks',
  'unfiled',
] as const;

export type LayerKind = (typeof LAYER_KINDS)[number];

export function isLayerKind(value: string): value is LayerKind {
  return (LAYER_KINDS as readonly string[]).includes(value);
}

/** 一段產出物：來源 stage、標題、正文、核准狀態、rationale。 */
export type LayerSection = {
  /** 來源 stage（例如 `stage1`）。 */
  stage: string;
  /** 中文標題（例如「定位與核心張力」）。 */
  title: string;
  /** 已合成的一段文字（markdown 或 token 片段）。 */
  body: string;
  /** 核准狀態：`draft`／`approved`／`needs_revision`／未知。 */
  approval: string | null;
  /** 誰核准（冇就 null）。 */
  approvedBy: string | null;
  /** 老闆寫下的 rationale（點解咁揀），冇就空字串。 */
  rationale: string;
};

/** 一個層的合成結果。 */
export type LayerProjection = {
  kind: LayerKind;
  /** 中文名稱。 */
  title: string;
  /** 一段產出物（按 stage 次序）。 */
  sections: LayerSection[];
  /** 成熟度：材料齊／缺幾段。 */
  completeness: { done: number; total: number; pct: number };
  /** 衝突（例如 4B 與 4E 同一個 token 值不同）。 */
  conflicts: TokenConflict[];
  /** design.md／tokens 層的整份匯出文字。 */
  exportText: string;
  /** 匯出檔名（不帶副檔名）。 */
  exportName: string;
};

export type TokenConflict = {
  token: string;
  label: string;
  sources: { stage: string; value: string }[];
};

/** stage -> 中文標題（供 section.title 用）。 */
const STAGE_TITLES: Record<string, string> = {
  stage1: '定位與核心張力',
  stage2: '材質感官',
  stage3: '語言語氣',
  stage4a: '核心識別',
  stage4b: '圖形表面',
  stage4c: '動態影音',
  stage4d: '3D 產品',
  stage4e: 'UI 與空間',
  stage4f: '行銷內容',
  stage4g: '治理',
  stage4h: '風格庫與 AI',
};

/** 每個 stage 的核准狀態，落在 brief 哪個 key（4b–4h 引擎自帶 approval 物件）。 */
function briefApproval(stage: string, brief: Record<string, unknown>): string | null {
  const approval = brief.approval;
  if (typeof approval === 'object' && approval !== null) {
    const state = (approval as Record<string, unknown>).state;
    if (typeof state === 'string' && state !== '') {
      return state;
    }
  }
  // stage1/2/3/4a 冇 approval 物件，只有 status（complete/incomplete）。
  const status = brief.status;
  if (typeof status === 'string') {
    return status === 'complete' ? 'approved' : 'draft';
  }
  return null;
}

/**
 * 把一個 brief 的某段（物件或陣列）轉成 markdown 列表行。
 *
 * 只印「有意義」的內容；空物件／空陣列／null 一律省略（方案 A：不畫假的空行）。
 */
function describeValue(value: unknown, indent: string): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? '' : `${indent}${trimmed}`;
  }
  if (typeof value === 'number') {
    return `${indent}${value}`;
  }
  if (Array.isArray(value)) {
    const lines: string[] = [];
    for (const item of value) {
      const line = describeValue(item, `${indent}- `);
      if (line !== '') {
        lines.push(line);
      }
    }
    return lines.join('\n');
  }
  if (typeof value === 'object') {
    // 「一句話宣言」形狀（{text, source}）：只印 text，source 係 human／auto-draft
    // 對讀者冇意義，唔好變成一堆巢狀 bullet。
    const maybe = value as Record<string, unknown>;
    if (typeof maybe.text === 'string' && maybe.text.trim() !== '') {
      return `${indent}${maybe.text.trim()}`;
    }
    const lines: string[] = [];
    for (const [key, item] of Object.entries(maybe)) {
      const described = describeValue(item, `${indent}- **${key}**：`);
      if (described !== '') {
        lines.push(described);
      }
    }
    return lines.join('\n');
  }
  return '';
}

/** 一個簡短物件（{id,name,note} 或 {name,note}）轉成 `name（note）`。 */
function describePick(item: unknown): string {
  if (typeof item !== 'object' || item === null) {
    return '';
  }
  const record = item as Record<string, unknown>;
  const name = typeof record.name === 'string' ? record.name : '';
  const note = typeof record.note === 'string' ? record.note : '';
  if (name === '' && note === '') {
    return '';
  }
  return note !== '' ? `${name}（${note}）` : name;
}

/** 揀選項陣列（pk 的輸出）轉成 markdown 列表。 */
function describePicks(value: unknown, indent: string): string {
  if (!Array.isArray(value)) {
    return '';
  }
  const lines: string[] = [];
  for (const item of value) {
    const text = describePick(item);
    if (text !== '') {
      lines.push(`${indent}- ${text}`);
    }
  }
  return lines.join('\n');
}

/** 一個 stage 的 brief 內指定 key 群組：標題 + 列表。 */
function sectionFromKeys(
  stage: string,
  brief: Record<string, unknown>,
  keys: string[],
): { title: string; body: string } {
  const parts: string[] = [];
  for (const key of keys) {
    const value = brief[key];
    if (value === undefined || value === null) {
      continue;
    }
    const label = key.replace(/_/g, ' ');
    if (Array.isArray(value)) {
      const picks = describePicks(value, '');
      if (picks !== '') {
        parts.push(`**${label}**\n${picks}`);
      }
    } else if (typeof value === 'object') {
      const desc = describeValue(value, '');
      if (desc !== '') {
        parts.push(`**${label}**\n${desc}`);
      }
    } else {
      const desc = describeValue(value, '');
      if (desc !== '') {
        parts.push(`**${label}**\n${desc}`);
      }
    }
  }
  return { title: STAGE_TITLES[stage] ?? stage, body: parts.join('\n\n') };
}

/**
 * 由 01／02／03／04A 的 brief 合成 design.md。
 *
 * 只取「方向與原因」部分：定位宣言、張力、感官、語氣、核心識別方向／Logo 概念。
 * 每段拼上 rationale 與核准狀態（由 caller 傳入的 approval map）。
 */
export function buildDesignDoc(
  briefs: Record<string, Record<string, unknown>>,
  approvals: Record<string, { state: string; approvedBy: string | null; rationale: string }>,
): Pick<LayerProjection, 'sections' | 'exportText'> {
  const sections: LayerSection[] = [];

  const addSection = (
    stage: string,
    keys: string[],
    fallbackKeys: string[] = [],
  ): void => {
    const brief = briefs[stage];
    if (brief === undefined) {
      return;
    }
    // 優先揀 primary keys，冇內容就 fallback。
    let { title, body } = sectionFromKeys(stage, brief, keys);
    if (body === '' && fallbackKeys.length > 0) {
      ({ title, body } = sectionFromKeys(stage, brief, fallbackKeys));
    }
    if (body === '') {
      return;
    }
    const approval = approvals[stage];
    sections.push({
      stage,
      title,
      body,
      approval: approval?.state ?? briefApproval(stage, brief),
      approvedBy: approval?.approvedBy ?? null,
      rationale: approval?.rationale ?? '',
    });
  };

  // 01 定位：品牌名、宣言、張力、反人格、客戶。
  addSection('stage1', ['brand_name', 'positioning_statement', 'core_tension', 'anti_persona']);
  // 02 材質感官：感官宣言、材質、關鍵字。
  addSection('stage2', ['sensory_statement', 'material_metaphor', 'mood_keywords']);
  // 03 語言語氣：聲音宣言、性格、範例句。
  addSection('stage3', ['voice_statement', 'personality', 'samples']);
  // 04A 核心識別：方向與 Logo 概念。只取「真正揀咗」的 choices（dim 有揀先出現）
  // 與 selections（有內容先出現）；唔取 identity_context —— 佢係 prompt-ready 的
  // 「全部欄位＋（尚未選擇）」佔位文字，冇揀嘢都非空，會令 design.md 出假內容。
  addSection('stage4a', ['choices', 'selections']);

  const exportText = renderMarkdown('design-doc', sections);

  return { sections, exportText };
}

/**
 * 由 04A／04B／04C／04E／04D 的 brief 合成 tokens。
 *
 * 只收「用多少／是甚麼數值」。引擎每個 stage 已產出專屬 token 欄位：
 *   04A palette + 字體登記（typeReg）
 *   04B surface_tokens + color_output
 *   04C motion_tokens
 *   04E ui_tokens_css + tokens
 *   04D cmf 色樣
 * 並偵測 4B ↔ 4E 同一個 token 名值不同（衝突不靜默取其一）。
 */
export function buildTokenFile(
  briefs: Record<string, Record<string, unknown>>,
  approvals: Record<string, { state: string; approvedBy: string | null; rationale: string }>,
): Pick<LayerProjection, 'sections' | 'exportText' | 'conflicts'> {
  const sections: LayerSection[] = [];
  const conflicts: TokenConflict[] = [];

  // token 名 -> {stage, value} 的對照，用嚟偵測跨 stage 衝突。
  const tokenSources = new Map<string, { stage: string; value: string }[]>();

  const recordTokens = (stage: string, tokens: Record<string, unknown>): void => {
    for (const [name, value] of Object.entries(tokens)) {
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      if (text === '' || text === 'null') {
        continue;
      }
      const list = tokenSources.get(name) ?? [];
      if (!list.some((item) => item.stage === stage && item.value === text)) {
        list.push({ stage, value: text });
        tokenSources.set(name, list);
      }
    }
  };

  const addTokenSection = (
    stage: string,
    key: string,
    label: string,
  ): void => {
    const brief = briefs[stage];
    if (brief === undefined) {
      return;
    }
    const value = brief[key];
    if (value === undefined || value === null) {
      return;
    }
    let body: string;
    if (typeof value === 'string') {
      body = value.trim();
    } else {
      body = describeValue(value, '');
      recordTokens(stage, value as Record<string, unknown>);
    }
    if (body === '') {
      return;
    }
    const approval = approvals[stage];
    sections.push({
      stage,
      title: label,
      body,
      approval: approval?.state ?? briefApproval(stage, brief),
      approvedBy: approval?.approvedBy ?? null,
      rationale: approval?.rationale ?? '',
    });
  };

  // 04A：色票 + 字體登記。
  const a4 = briefs.stage4a;
  if (a4 !== undefined) {
    if (typeof a4.palette === 'object' && a4.palette !== null) {
      recordTokens('stage4a', a4.palette as Record<string, unknown>);
      const body = describeValue(a4.palette, '');
      if (body !== '') {
        const approval = approvals.stage4a;
        sections.push({
          stage: 'stage4a',
          title: '色票（palette）',
          body,
          approval: approval?.state ?? briefApproval('stage4a', a4),
          approvedBy: approval?.approvedBy ?? null,
          rationale: approval?.rationale ?? '',
        });
      }
    }
    if (a4.registers !== undefined && typeof a4.registers === 'object') {
      const reg = (a4.registers as Record<string, unknown>).type;
      if (reg !== undefined) {
        const body = describeValue(reg, '');
        if (body !== '') {
          const approval = approvals.stage4a;
          sections.push({
            stage: 'stage4a',
            title: '字體登記（type register）',
            body,
            approval: approval?.state ?? briefApproval('stage4a', a4),
            approvedBy: approval?.approvedBy ?? null,
            rationale: approval?.rationale ?? '',
          });
        }
      }
    }
  }

  // 04B：表面 token（surface_tokens）＋ 色彩輸出（color_output）。
  addTokenSection('stage4b', 'surface_tokens', '表面 tokens');
  const b4 = briefs.stage4b;
  if (b4 !== undefined && b4.color_output !== undefined) {
    recordTokens('stage4b', { color_output: b4.color_output });
    const body = describeValue(b4.color_output, '');
    if (body !== '') {
      const approval = approvals.stage4b;
      sections.push({
        stage: 'stage4b',
        title: '色彩輸出（color_output）',
        body,
        approval: approval?.state ?? briefApproval('stage4b', b4),
        approvedBy: approval?.approvedBy ?? null,
        rationale: approval?.rationale ?? '',
      });
    }
  }

  // 04C：動態 token（motion_tokens）。
  addTokenSection('stage4c', 'motion_tokens', '動態 tokens');

  // 04E：UI token（tokens + ui_tokens_css）。
  const e4 = briefs.stage4e;
  if (e4 !== undefined) {
    const ui = e4.ui;
    if (typeof ui === 'object' && ui !== null) {
      const tokens = (ui as Record<string, unknown>).tokens;
      if (tokens !== undefined) {
        recordTokens('stage4e', tokens as Record<string, unknown>);
        const body = describeValue(tokens, '');
        if (body !== '') {
          const approval = approvals.stage4e;
          sections.push({
            stage: 'stage4e',
            title: 'UI tokens',
            body,
            approval: approval?.state ?? briefApproval('stage4e', e4),
            approvedBy: approval?.approvedBy ?? null,
            rationale: approval?.rationale ?? '',
          });
        }
      }
    }
    addTokenSection('stage4e', 'ui_tokens_css', 'UI tokens（CSS）');
  }

  // 04D：CMF 色樣。
  const d4 = briefs.stage4d;
  if (d4 !== undefined) {
    const product = d4.product;
    if (typeof product === 'object' && product !== null) {
      const cmf = (product as Record<string, unknown>).cmf;
      if (cmf !== undefined) {
        const body = describeValue(cmf, '');
        if (body !== '') {
          const approval = approvals.stage4d;
          sections.push({
            stage: 'stage4d',
            title: 'CMF 色樣',
            body,
            approval: approval?.state ?? briefApproval('stage4d', d4),
            approvedBy: approval?.approvedBy ?? null,
            rationale: approval?.rationale ?? '',
          });
        }
      }
    }
  }

  // 偵測衝突：同一個 token 名出現在多個 stage 且值不同。
  for (const [name, sources] of tokenSources) {
    const distinct = new Map<string, { stage: string; value: string }>();
    for (const source of sources) {
      distinct.set(source.stage, source);
    }
    if (distinct.size > 1) {
      const values = [...distinct.values()];
      const uniqueValues = new Set(values.map((v) => v.value));
      if (uniqueValues.size > 1) {
        conflicts.push({
          token: name,
          label: name,
          sources: values.map((v) => ({ stage: v.stage, value: v.value })),
        });
      }
    }
  }

  const exportText = renderMarkdown('tokens', sections, conflicts);

  return { sections, exportText, conflicts };
}

/**
 * 分組檢視：把散落欄位聚合到一層（模板／範例／檢查／不入層）。
 *
 * 首版只做「分組」，真實產出物（模板庫、風格庫、視覺複核）屬後續。
 */
export function buildGroupedView(
  kind: Exclude<LayerKind, 'design-doc' | 'tokens'>,
  briefs: Record<string, Record<string, unknown>>,
  approvals: Record<string, { state: string; approvedBy: string | null; rationale: string }>,
): Pick<LayerProjection, 'sections' | 'exportText'> {
  const keysByKind: Record<
    Exclude<LayerKind, 'design-doc' | 'tokens'>,
    Record<string, string[]>
  > = {
    templates: {
      stage4f: ['template_pack', 'template_rules', 'channels'],
      stage4e: ['components', 'ux'],
      stage4c: ['video', 'video_spec', 'storyboard'],
      stage4d: ['three_d', 'render_spec'],
    },
    examples: {
      stage4h: ['style_library', 'library', 'references'],
      stage3: ['samples'],
    },
    checks: {
      stage4h: ['policy', 'acceptance', 'ai_contract'],
      stage4f: ['compliance', 'copy'],
      stage4e: ['components', 'a11y_tests'],
      stage4g: ['governance', 'prohibited'],
    },
    unfiled: {
      stage4a: ['registers'],
      stage4g: ['proof_register', 'license_register', 'raci'],
      stage4b: ['color_output'],
      stage4e: ['space'],
      stage4d: ['product'],
    },
  };

  const sections: LayerSection[] = [];
  const map = keysByKind[kind];

  for (const [stage, keys] of Object.entries(map)) {
    const brief = briefs[stage];
    if (brief === undefined) {
      continue;
    }
    const { title, body } = sectionFromKeys(stage, brief, keys);
    if (body === '') {
      continue;
    }
    const approval = approvals[stage];
    sections.push({
      stage,
      title,
      body,
      approval: approval?.state ?? briefApproval(stage, brief),
      approvedBy: approval?.approvedBy ?? null,
      rationale: approval?.rationale ?? '',
    });
  }

  const exportText = renderMarkdown(kind, sections);

  return { sections, exportText };
}

/** 層的中文標題。 */
export function layerTitle(kind: LayerKind): string {
  const titles: Record<LayerKind, string> = {
    'design-doc': 'design.md（規則與原因）',
    tokens: 'tokens（鎖死數值）',
    templates: '模板（限制版面）',
    examples: '範例（教味道）',
    checks: '檢查與視覺複核（守門）',
    unfiled: '未分類／待管理',
  };
  return titles[kind];
}

/** 把 sections 砌成一份可下載的 markdown。 */
function renderMarkdown(
  kind: LayerKind,
  sections: LayerSection[],
  conflicts: TokenConflict[] = [],
): string {
  const title = layerTitle(kind);
  const lines: string[] = [`# ${title}`, ''];

  for (const section of sections) {
    lines.push(`## ${section.title}`);
    lines.push('');
    lines.push(section.body);
    lines.push('');
    if (section.rationale.trim() !== '') {
      lines.push(`> 原因：${section.rationale.trim()}`);
      lines.push('');
    }
    const approval = section.approval;
    if (approval !== null && approval !== undefined && approval !== '') {
      const who = section.approvedBy ? `（${section.approvedBy}）` : '';
      lines.push(`> 狀態：${approval}${who}`);
      lines.push('');
    }
  }

  if (conflicts.length > 0) {
    lines.push('## 衝突');
    lines.push('');
    for (const conflict of conflicts) {
      const sources = conflict.sources
        .map((s) => `${s.stage}＝${s.value}`)
        .join('、');
      lines.push(`- **${conflict.label}**：${sources}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim() + '\n';
}

/**
 * 組裝一個完整層投影（供 route 回傳）。純函式，不碰 DB。
 */
export function projectLayer(
  kind: LayerKind,
  briefs: Record<string, Record<string, unknown>>,
  approvals: Record<string, { state: string; approvedBy: string | null; rationale: string }>,
): LayerProjection {
  let result: Pick<LayerProjection, 'sections' | 'exportText'> & {
    conflicts?: TokenConflict[];
  };

  if (kind === 'design-doc') {
    result = buildDesignDoc(briefs, approvals);
  } else if (kind === 'tokens') {
    result = buildTokenFile(briefs, approvals);
  } else {
    result = buildGroupedView(kind, briefs, approvals);
  }

  const total = result.sections.length;
  const done = result.sections.filter((s) => s.body.trim() !== '').length;

  return {
    kind,
    title: layerTitle(kind),
    sections: result.sections,
    completeness: {
      done,
      total,
      pct: total === 0 ? 0 : Math.round((done / total) * 100),
    },
    conflicts: result.conflicts ?? [],
    exportText: result.exportText,
    // 檔名用人讀得順的名（design-doc 的 URL kind 唔好漏入檔名）。
    exportName: `brand-${kind === 'design-doc' ? 'design' : kind}`,
  };
}

import { contrastRatio, isHex, readableOn } from './contrast.ts';
import { readPath, type BrandDocument, type BrandGapType } from './document.ts';
import {
  schemaForPage,
  type ColorPayload,
  type HomePayload,
  type LogoPayload,
  type PromptSection,
  type Section,
  type TokenGroups,
  type TokenValue,
  type TypePayload,
} from './schemas.ts';

/**
 * 四種輸出（issue #57）：HTML、tokens.json、品牌 prompt 包、A4 印刷版。
 *
 * 一個原則：**四者由同一份 payload 出來，沒有一份是手寫的副本。** 所以改一個
 * 色彩角色，四份都會跟著變；任何一份對不上，就是這支程式的 bug，不是「忘了
 * 同步」這種人手問題。
 *
 * 另一個原則：**缺就是缺。** tokens 不會為缺失的角色編一個值；prompt 會寫
 * 「缺」；HTML 會畫一個虛線框。三份文件對「缺」的講法不同，但立場一致。
 *
 * 色值只來自 payload。這一支的原始碼一個色值都沒有（`gates` 有測試咬住），
 * 連 fallback 都用 CSS 的 `Canvas`／`CanvasText` 系統色 —— 那不是品牌色，
 * 是「未定」的樣子。
 */

/** 一頁的組成資料：版本號與文件都由資料庫來，這一層不查任何東西。 */
export type ComposedPage = {
  key: string;
  name: string;
  kind: 'fixed' | 'custom';
  versionNo: number;
  policyVersionNo: number | null;
  document: BrandDocument;
};

/** 一個缺口的組成資料（文件內的缺口 ＋ 資料庫的缺口登記，兩者同一形狀）。 */
export type ComposedGap = {
  pageKey: string;
  pageName: string;
  item: string;
  what: string;
  type: BrandGapType;
  ruleId: string | null;
  needStatus: 'none' | 'open' | 'delivered' | 'accepted' | 'rejected';
};

export type ComposedBrand = {
  code: string;
  name: string;
  /** 品牌版本（`brand_release.release_no`）。0＝未有任何版本。 */
  releaseNo: number;
  pages: ComposedPage[];
  gaps: ComposedGap[];
};

/* ── tokens.json（W3C Design Tokens） ─────────────────────────── */

export type TokensOutput = {
  light: Record<string, Record<string, TokenValue>>;
  dark: Record<string, Record<string, TokenValue>>;
  /** 沒有貢獻 token 的頁，與原因。不是缺口，是事實。 */
  notes: { page: string; name: string; note: string }[];
  /** 缺了值所以沒有出現在 tokens 的角色（給「缺口」分頁用，不進 tokens 檔）。 */
  missing: string[];
};

export function buildTokens(composed: ComposedBrand): TokensOutput {
  const light: Record<string, Record<string, TokenValue>> = {};
  const dark: Record<string, Record<string, TokenValue>> = {};
  const notes: TokensOutput['notes'] = [];
  const missing: string[] = [];

  for (const page of composed.pages) {
    const schema = schemaForPage(page.key, page.kind);
    const payload = schema.normalize(page.document.payload);
    const groups: TokenGroups | null = schema.tokens(payload);

    if (schema.tokensNote !== null) {
      notes.push({ page: page.key, name: page.name, note: schema.tokensNote });
    }

    if (groups === null) {
      continue;
    }

    for (const [group, entries] of Object.entries(groups.light)) {
      light[group] = { ...(light[group] ?? {}), ...entries };
    }

    for (const [group, entries] of Object.entries(groups.dark)) {
      dark[group] = { ...(dark[group] ?? {}), ...entries };
    }

    if (schema.key === 'color') {
      const roles = (payload as ColorPayload).roles;
      const present = new Set(roles.filter((role) => role.hex !== '').map((role) => role.id));

      for (const role of roles) {
        if (role.id !== '' && role.hex === '') {
          missing.push(role.id);
        }
      }

      // 連角色都未建立也是缺：`surface` 不在清單之內，tokens 就沒有深色底。
      for (const required of ['brand.primary', 'ink', 'paper', 'surface']) {
        if (!present.has(required)) {
          missing.push(required);
        }
      }
    }
  }

  return { light, dark, notes, missing };
}

/* ── 品牌 prompt 包（Markdown） ───────────────────────────────── */

export type PromptPack = {
  markdown: string;
  composed: { page: string; name: string; versionNo: number }[];
  gaps: string[];
};

function gapLine(gap: ComposedGap): string {
  const who = gap.type === 'file' ? '檔案型，外判可交付' : '判斷型，只有老闆可補';
  const rule = gap.ruleId === null ? '' : `，規則 ${gap.ruleId}`;
  return `${gap.pageName}／${gap.item}：${gap.what}（${who}${rule}）`;
}

export function buildPromptPack(composed: ComposedBrand): PromptPack {
  const sections: PromptSection[] = [];
  const composedList = composed.pages
    .filter((page) => page.document.payload !== undefined && page.versionNo > 0)
    .map((page) => ({ page: page.key, name: page.name, versionNo: page.versionNo }));

  // 主頁與範例放最後：它們是彙整與引用，不是規則。之前兩者直接被跳過，
  // 結果 `home.prompt()` 寫的立場與版面永遠出不了街（#67）、範例也進不了
  // prompt 包（#68）—— 一段「寫好了但永遠不會執行」的碼比冇寫更危險。
  const ordered = [
    ...composed.pages.filter((page) => page.key !== 'home' && page.key !== 'examples'),
    ...composed.pages.filter((page) => page.key === 'home' || page.key === 'examples'),
  ];

  for (const page of ordered) {
    const schema = schemaForPage(page.key, page.kind);
    const payload = schema.normalize(page.document.payload);
    const pageSections = schema.prompt(payload);

    for (const section of pageSections) {
      if (section.lines.length > 0) {
        sections.push({ title: section.title, lines: section.lines });
      }
    }
  }

  const gapLines = composed.gaps.map(gapLine);

  const lines: string[] = [];
  lines.push(`# ${composed.name} 品牌 prompt`);
  lines.push('');
  lines.push(`品牌版本 v${composed.releaseNo}`);
  lines.push('');
  lines.push(
    `組成：${composedList.length === 0 ? '（未有版本）' : composedList.map((item) => `${item.name} v${item.versionNo}`).join(' ')}`,
  );
  lines.push('');
  lines.push('以下每一條都由品牌頁的現行版本產生。標「缺」的項目未定，不要自行補上。');
  lines.push('');

  for (const section of sections) {
    lines.push(`## ${section.title}`);
    lines.push('');

    for (const line of section.lines) {
      lines.push(`- ${line}`);
    }

    lines.push('');
  }

  lines.push('## 缺口');
  lines.push('');

  if (gapLines.length === 0) {
    lines.push('- 沒有登記的缺口。');
  } else {
    for (const line of gapLines) {
      lines.push(`- ${line}`);
    }
  }

  lines.push('');

  return { markdown: lines.join('\n'), composed: composedList, gaps: gapLines };
}

/* ── HTML 與 A4 印刷版 ───────────────────────────────────────── */

export type HtmlOptions = {
  /** 只出這一頁（`null`＝整本品牌書）。 */
  pageKey?: string | null;
  /** 印刷版：A4、頁碼、folio。 */
  print?: boolean;
  /** 資產引用 → 可下載網址。沒有這個函式就畫虛線框，不假裝有圖。 */
  assetUrl?: (ref: string) => string | null;
  generatedAt?: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function paragraphs(values: string[], className = ''): string {
  return values
    .filter((value) => value.trim() !== '')
    .map((value) => `<p${className === '' ? '' : ` class="${className}"`}>${escapeHtml(value)}</p>`)
    .join('');
}

/** 由各頁 payload 抽出來的「跨頁查表」：只讀，不複製。 */
type Lookup = {
  colors: Map<string, { hex: string; name: string; group: string }>;
  families: Map<string, { name: string; script: string }>;
  ratios: Map<string, number>;
  voiceSamples: string[];
  logoAssets: { label: string; fileRef: string; className: string }[];
};

function buildLookup(pages: readonly ComposedPage[]): Lookup {
  const colors = new Map<string, { hex: string; name: string; group: string }>();
  const families = new Map<string, { name: string; script: string }>();
  const ratios = new Map<string, number>();
  const voiceSamples: string[] = [];
  const logoAssets: { label: string; fileRef: string; className: string }[] = [];

  for (const page of pages) {
    const schema = schemaForPage(page.key, page.kind);
    const payload = schema.normalize(page.document.payload);

    if (schema.key === 'color') {
      const colour = payload as ColorPayload;
      for (const role of colour.roles) {
        if (role.id !== '') {
          colors.set(role.id, { hex: role.hex, name: role.name, group: role.group });
        }
      }
      for (const ratio of colour.ratios) {
        if (ratio.role !== '') {
          ratios.set(ratio.role, ratio.percent);
        }
      }
    }

    if (schema.key === 'type') {
      for (const family of (payload as TypePayload).families) {
        if (family.id !== '') {
          families.set(family.id, { name: family.name, script: family.script });
        }
      }
    }

    if (schema.key === 'tone') {
      voiceSamples.push(...(payload as { samples: { like: string[] } }).samples.like);
    }

    if (schema.key === 'logo') {
      for (const asset of (payload as LogoPayload).assets) {
        logoAssets.push({ label: asset.label, fileRef: asset.file_ref, className: asset.class });
      }
    }
  }

  return { colors, families, ratios, voiceSamples, logoAssets };
}

function swatch(hex: string, label: string): string {
  if (!isHex(hex)) {
    return `<span class="swatch swatch--missing" data-swatch="missing">${escapeHtml(label)}<span class="missing">缺</span></span>`;
  }

  const text = readableOn(hex);

  return `<span class="swatch" data-swatch="${escapeHtml(label)}" style="background:${escapeHtml(hex)};color:${text ?? 'inherit'}">${escapeHtml(label)}</span>`;
}

function renderFields(section: Section, payload: unknown, rationale: Record<string, string>): string {
  const rows = (section.fields ?? [])
    .map((field) => {
      const value = readPath(payload, field.path);
      const text = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').join('、') : String(value ?? '');
      const reason = rationale[`${section.path === '' ? '' : `${section.path}.`}${field.path}`] ?? '';

      if (text.trim() === '') {
        return `<div class="row" data-field="${escapeHtml(field.path)}"><dt>${escapeHtml(field.label)}</dt><dd class="missing">缺</dd></div>`;
      }

      return `<div class="row" data-field="${escapeHtml(field.path)}"><dt>${escapeHtml(field.label)}</dt><dd>${escapeHtml(text)}${
        reason === '' ? '' : `<span class="why">${escapeHtml(reason)}</span>`
      }</dd></div>`;
    })
    .join('');

  return `<dl class="fields">${rows}</dl>`;
}

function renderRecords(section: Section, payload: unknown): string {
  const rows = (readPath(payload, section.path ?? '') as unknown[]) ?? [];
  const columns = section.columns ?? [];

  if (!Array.isArray(rows) || rows.length === 0) {
    return `<p class="missing">缺</p>`;
  }

  const head = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('');
  const body = rows
    .map((row) => {
      const cells = columns
        .map((column) => {
          const value = readPath(row, column.path);

          if (column.kind === 'hex') {
            return `<td>${swatch(typeof value === 'string' ? value : '', '')}<code>${escapeHtml(String(value ?? '')) || '缺'}</code></td>`;
          }

          return `<td>${escapeHtml(String(value ?? '')) || '<span class="missing">缺</span>'}</td>`;
        })
        .join('');

      return `<tr>${cells}</tr>`;
    })
    .join('');

  return `<table class="records"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderColorRoles(section: Section, payload: unknown): string {
  const role = (payload as ColorPayload).roles;

  if (role.length === 0) {
    return `<p class="missing">缺</p>`;
  }

  const rows = role
    .map(
      (item) => `<tr data-role="${escapeHtml(item.id)}">
<td>${swatch(item.hex, item.name === '' ? item.id : item.name)}</td>
<td><strong>${escapeHtml(item.id)}</strong><span class="sub">${escapeHtml(item.name)}</span></td>
<td><code>${escapeHtml(item.hex) || '缺'}</code><span class="sub">${escapeHtml(item.cmyk)}</span></td>
<td>${escapeHtml(item.usage) || '<span class="missing">缺</span>'}</td>
<td>${escapeHtml(item.reason)}</td>
</tr>`,
    )
    .join('');

  return `<table class="records" data-section="${escapeHtml(section.id)}"><thead><tr><th>色樣</th><th>角色</th><th>螢幕／印刷</th><th>用途</th><th>理由</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderColorPairs(section: Section, payload: unknown): string {
  const colour = payload as ColorPayload;
  const references = new Map(colour.roles.map((role) => [role.id, role.hex]));

  const rows = colour.pairs.allowed
    .map((pair) => {
      const ratio = contrastRatio(references.get(pair.fg) ?? '', references.get(pair.bg) ?? '');
      const floor = pair.use === 'large' ? colour.large_floor : colour.contrast_floor;
      const state = ratio === null ? '無法判斷' : ratio >= floor ? '通過' : '不通過';

      return `<tr data-pair="${escapeHtml(`${pair.fg}-${pair.bg}`)}"><td>${escapeHtml(pair.fg)} on ${escapeHtml(pair.bg)}</td><td>${ratio === null ? '缺' : `${ratio}:1`}</td><td>${escapeHtml(String(floor))}:1</td><td data-result="${state}">${state}</td></tr>`;
    })
    .join('');

  return `<table class="records" data-section="${escapeHtml(section.id)}"><thead><tr><th>配對</th><th>實測</th><th>下限</th><th>結果</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderTypeFamilies(section: Section, payload: unknown): string {
  const typed = payload as TypePayload;

  if (typed.families.length === 0) {
    return `<p class="missing">缺</p>`;
  }

  return `<ul class="families">${typed.families
    .map(
      (family) =>
        `<li data-family="${escapeHtml(family.id)}"><strong>${escapeHtml(family.name) || '缺'}</strong><span class="sub">${escapeHtml(family.script)} 網頁授權 ${escapeHtml(family.license_web) || '缺'} 印刷授權 ${escapeHtml(family.license_print) || '缺'}</span>${
          family.file_ref === '' ? '<span class="missing">缺可嵌入檔</span>' : ''
        }</li>`,
    )
    .join('')}</ul>`;
}

function renderTypeRoles(section: Section, payload: unknown): string {
  const typed = payload as TypePayload;

  if (typed.roles.length === 0) {
    return `<p class="missing">缺</p>`;
  }

  return `<div class="specimens">${typed.roles
    .map((role) => {
      const size = /^\d+(\.\d+)?px$/.test(role.size) ? role.size : '16px';
      return `<div class="specimen" data-role="${escapeHtml(role.role)}" style="font-family:${escapeHtml(role.family)};font-weight:${escapeHtml(role.weight) || '400'};font-size:${escapeHtml(size)};line-height:${escapeHtml(role.leading) || '1.4'}">
<span class="specimen__meta">${escapeHtml(role.role)} ${escapeHtml(role.family)} ${escapeHtml(role.weight)} ${escapeHtml(role.size)}/${escapeHtml(role.leading)} 最小 ${role.min > 0 ? `${role.min}px` : '缺'}</span>
<span class="specimen__text">${escapeHtml(typed.sentence_anatomy) || '先把話說清楚，再講風格。'}</span>
</div>`;
    })
    .join('')}</div>`;
}

function renderLogoAssets(section: Section, payload: unknown, options: HtmlOptions): string {
  const typed = payload as LogoPayload;

  if (typed.assets.length === 0) {
    return `<div class="missing-box">主標誌向量檔（SVG）<span class="missing">缺</span></div>`;
  }

  return `<div class="logo-grid">${typed.assets
    .map((asset) => {
      const url = asset.file_ref === '' ? null : (options.assetUrl?.(asset.file_ref) ?? null);

      if (url === null) {
        return `<div class="missing-box" data-logo="${escapeHtml(asset.label)}">${escapeHtml(asset.label)}<span class="missing">缺</span></div>`;
      }

      return `<figure data-logo="${escapeHtml(asset.label)}"><img src="${escapeHtml(url)}" alt="${escapeHtml(asset.label)}"><figcaption>${escapeHtml(asset.label)}</figcaption></figure>`;
    })
    .join('')}</div>`;
}

function renderLogoModes(section: Section, payload: unknown, lookup: Lookup): string {
  const typed = payload as LogoPayload;

  if (typed.modes.length === 0) {
    return `<p class="missing">缺</p>`;
  }

  return `<ul class="chips">${typed.modes
    .map((mode) => {
      const colour = lookup.colors.get(mode.color_role);
      const group = colour?.group ?? 'unknown';
      const bad = group === 'function';
      return `<li data-mode="${escapeHtml(mode.mode)}" data-role-group="${escapeHtml(group)}"${bad ? ' data-violation="true"' : ''}>${escapeHtml(mode.mode)} → ${escapeHtml(mode.color_role) || '缺'}${
        bad ? '<span class="violation">功能色不可用於標誌</span>' : ''
      }</li>`;
    })
    .join('')}</ul>`;
}

function renderVoiceTraits(section: Section, payload: unknown): string {
  const typed = payload as { traits: { name: string; do: string; dont: string; sentence: string }[] };

  if (typed.traits.length === 0) {
    return `<p class="missing">缺</p>`;
  }

  return `<table class="records"><thead><tr><th>特質</th><th>會這樣講</th><th>不會這樣講</th><th>示範</th></tr></thead><tbody>${typed.traits
    .map(
      (trait) =>
        `<tr data-trait="${escapeHtml(trait.name)}"><td>${escapeHtml(trait.name)}</td><td>${escapeHtml(trait.do)}</td><td>${escapeHtml(trait.dont)}</td><td>${escapeHtml(trait.sentence) || '<span class="missing">缺示範</span>'}</td></tr>`,
    )
    .join('')}</tbody></table>`;
}

function renderVoiceSamples(payload: unknown): string {
  const typed = payload as { samples: { like: string[]; unlike: string[] } };

  return `<div class="two-col"><div><h4>像</h4>${paragraphs(typed.samples.like, 'sample')}</div><div><h4>不像</h4>${paragraphs(typed.samples.unlike, 'sample sample--no')}</div></div>`;
}

function renderSection(
  section: Section,
  page: ComposedPage,
  lookup: Lookup,
  options: HtmlOptions,
): string {
  const payload = page.document.payload;

  switch (section.kind) {
    case 'stance': {
      const stance = typeof payload['stance'] === 'string' ? payload['stance'] : page.document.stance ?? '';
      return `<p class="stance" data-stance>${escapeHtml(stance) || '<span class="missing">缺立場句</span>'}</p>`;
    }
    case 'fields':
      return renderFields(section, section.path === '' || section.path === undefined ? payload : readPath(payload, section.path) ?? payload, page.document.rationale);
    case 'records':
      return renderRecords(section, payload);
    case 'color-roles':
      return renderColorRoles(section, payload);
    case 'color-pairs':
      return renderColorPairs(section, payload);
    case 'type-families':
      return renderTypeFamilies(section, payload);
    case 'type-roles':
      return renderTypeRoles(section, payload);
    case 'logo-assets':
      return renderLogoAssets(section, payload, options);
    case 'logo-modes':
      return renderLogoModes(section, payload, lookup);
    case 'voice-traits':
      return renderVoiceTraits(section, payload);
    case 'voice-samples':
      return renderVoiceSamples(payload);
    case 'quotes': {
      const values = (readPath(payload, section.path ?? '') as unknown[]) ?? lookup.voiceSamples;
      return `<ul class="quotes">${(Array.isArray(values) ? values : [])
        .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join('')}</ul>`;
    }
    case 'list': {
      const values = (readPath(payload, section.path ?? '') as unknown[]) ?? [];
      return Array.isArray(values) && values.length > 0
        ? `<ul class="list">${values.filter((item): item is string => typeof item === 'string').map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
        : `<p class="missing">缺</p>`;
    }
    case 'tags': {
      const values = (readPath(payload, section.path ?? '') as unknown[]) ?? [];
      return Array.isArray(values) && values.length > 0
        ? `<ul class="chips">${values.filter((item): item is string => typeof item === 'string').map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
        : `<p class="missing">缺</p>`;
    }
    case 'entries': {
      return `<ul class="entries">${lookup.logoAssets
        .map((asset) => `<li>${escapeHtml(asset.label)}</li>`)
        .join('')}</ul>`;
    }
    default:
      return '';
  }
}

function renderHomeBlocks(page: ComposedPage, lookup: Lookup, options: HtmlOptions): string {
  const schema = schemaForPage(page.key, page.kind);
  const payload = schema.normalize(page.document.payload) as HomePayload;
  const blocks: string[] = [];

  for (const layoutBlock of page.document.layout.blocks) {
    if (layoutBlock.kind === 'stance') {
      blocks.push(
        `<section class="block block--stance" data-block="stance"><p class="stance">${escapeHtml(payload.stance) || '<span class="missing">缺立場句</span>'}</p>${
          payload.who === '' ? '' : `<p class="who">${escapeHtml(payload.who)}</p>`
        }</section>`,
      );
      continue;
    }

    if (layoutBlock.kind === 'gaps') {
      const gaps = page.document.gaps;
      blocks.push(
        `<section class="block" data-block="gaps"><h3>缺口</h3>${
          gaps.length === 0
            ? '<p class="ok">沒有登記的缺口。</p>'
            : `<ul class="gaps">${gaps
                .map((gap) => `<li data-gap-type="${gap.type}">${escapeHtml(gap.what)}<span class="missing">缺</span></li>`)
                .join('')}</ul>`
        }</section>`,
      );
      continue;
    }

    const section = schema.sections.find((item) => item.id === layoutBlock.source);

    if (section === undefined) {
      continue;
    }

    if (section.id === 'color_order') {
      const order = payload.color_order.roles
        .map((role) => {
          const colour = lookup.colors.get(role);
          const percent = lookup.ratios.get(role);
          return `<div class="order" data-order-role="${escapeHtml(role)}">${swatch(colour?.hex ?? '', colour?.name ?? role)}<span class="order__label">${escapeHtml(role)}${
            percent === undefined ? '' : ` · ${percent}%`
          }</span></div>`;
        })
        .join('');

      blocks.push(
        `<section class="block" data-block="color_order"><h3>${escapeHtml(layoutBlock.title ?? '用色順序')}</h3><div class="order-bar">${order}</div><p class="why">${escapeHtml(payload.color_order.note)}</p></section>`,
      );
      continue;
    }

    if (section.id === 'type_split') {
      const split = payload.type_split;
      blocks.push(
        `<section class="block" data-block="type_split"><h3>字體分工</h3><div class="two-col"><div class="split"><span class="split__sample split__sample--serif">${escapeHtml(split.serif)}</span><span class="split__meta">Serif 負責</span></div><div class="split"><span class="split__sample">${escapeHtml(split.sans)}</span><span class="split__meta">Sans 負責</span></div></div><p class="why">${escapeHtml(split.note)}</p></section>`,
      );
      continue;
    }

    if (section.id === 'systems') {
      const systems = payload.systems
        .map((system) => `<li><strong>${escapeHtml(system.name)}</strong><span class="sub">${escapeHtml(system.note)}</span></li>`)
        .join('');

      blocks.push(
        `<section class="block" data-block="systems"><h3>品牌專屬系統</h3>${systems === '' ? '<p class="missing">缺</p>' : `<ul class="systems">${systems}</ul>`}</section>`,
      );
      continue;
    }

    if (section.id === 'voice_samples') {
      const samples = payload.voice_samples.length > 0 ? payload.voice_samples : lookup.voiceSamples;
      blocks.push(
        `<section class="block" data-block="voice"><h3>語氣</h3>${
          samples.length === 0
            ? '<div class="missing-box">語氣頁尚未建立<span class="missing">缺</span></div>'
            : `<ul class="quotes">${samples.map((sample) => `<li>${escapeHtml(sample)}</li>`).join('')}</ul>`
        }</section>`,
      );
      continue;
    }

    blocks.push(
      `<section class="block" data-block="${escapeHtml(section.id)}"><h3>${escapeHtml(section.label)}</h3>${renderSection(section, page, lookup, options)}</section>`,
    );
  }

  return blocks.join('');
}

const STYLE = `
:root { --paper: Canvas; --ink: CanvasText; --accent: CanvasText; --muted: GrayText; --line: color-mix(in srgb, CanvasText 22%, transparent); }
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 15px/1.65 "Noto Sans HK", "Inter", system-ui, sans-serif; }
.book { max-width: 900px; margin: 0 auto; padding: 48px 40px 96px; }
.book-head { border-bottom: 1px solid var(--line); padding-bottom: 20px; margin-bottom: 40px; }
.book-head .code { font-size: 12px; letter-spacing: .18em; color: var(--muted); margin: 0 0 8px; text-transform: uppercase; }
.book-head h1 { font-size: 34px; line-height: 1.2; margin: 0 0 8px; font-weight: 600; }
.book-head .composed { font-size: 13px; color: var(--muted); margin: 0; }
.page { margin: 0 0 64px; }
.page > h2 { font-size: 12px; letter-spacing: .18em; color: var(--muted); font-weight: 600; text-transform: uppercase; margin: 0 0 4px; }
.page > .version { font-size: 12px; color: var(--muted); margin: 0 0 20px; }
.block { margin: 0 0 40px; }
.block h3 { font-size: 13px; letter-spacing: .04em; color: var(--muted); font-weight: 600; margin: 0 0 12px; }
.stance { font-family: "Noto Serif HK", "Iowan Old Style", serif; font-size: 40px; line-height: 1.3; letter-spacing: -0.01em; margin: 0 0 16px; }
.block--stance .stance { font-size: 52px; }
.who { font-size: 17px; color: var(--muted); margin: 0; }
table.records { width: 100%; border-collapse: collapse; font-size: 14px; }
table.records th { text-align: left; font-size: 12px; color: var(--muted); font-weight: 600; padding: 8px 10px; border-bottom: 1px solid var(--line); }
table.records td { padding: 12px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
.code, code { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 12.5px; }
.sub { display: block; font-size: 12.5px; color: var(--muted); margin-top: 2px; }
dl.fields { display: grid; grid-template-columns: 160px 1fr; gap: 12px 24px; margin: 0; }
dl.fields .row { display: contents; }
dl.fields dt { font-size: 13px; color: var(--muted); }
dl.fields dd { margin: 0; }
.why { display: block; font-size: 12.5px; color: var(--muted); margin-top: 6px; }
.missing { opacity: .62; font-weight: 600; font-size: 12.5px; margin-left: 6px; }
.missing-box { border: 1px dashed var(--line); border-radius: 10px; padding: 24px; color: var(--muted); font-size: 14px; }
.swatch { display: inline-flex; align-items: center; justify-content: center; min-width: 40px; height: 40px; padding: 0 8px; border-radius: 8px; font-size: 11px; border: 1px solid var(--line); }
.swatch--missing { border-style: dashed; background: transparent; color: var(--muted); }
.order-bar { display: flex; gap: 12px; flex-wrap: wrap; }
.order { display: flex; flex-direction: column; gap: 6px; flex: 1 1 120px; }
.order .swatch { width: 100%; height: 88px; }
.order__label { font-size: 12.5px; color: var(--muted); }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
.split__sample { display: block; font-size: 28px; line-height: 1.2; }
.split__sample--serif { font-family: "Noto Serif HK", serif; }
.split__meta { display: block; font-size: 12px; color: var(--muted); margin-top: 6px; }
.quotes, .list, .chips, .systems, .families, .entries { margin: 0; padding: 0; list-style: none; }
.quotes li { font-family: "Noto Serif HK", serif; font-size: 20px; line-height: 1.5; padding: 12px 0; border-bottom: 1px solid var(--line); }
.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.chips li { border: 1px solid var(--line); border-radius: 999px; padding: 4px 12px; font-size: 13px; }
.list li, .systems li { padding: 8px 0; border-bottom: 1px solid var(--line); }
.specimens { display: grid; gap: 20px; }
.specimen__meta { display: block; font-size: 12px; color: var(--muted); font-family: "Inter", system-ui, sans-serif; }
.logo-grid { display: flex; gap: 16px; flex-wrap: wrap; }
.logo-grid figure { margin: 0; }
.logo-grid img { max-width: 220px; max-height: 120px; }
.gaps li { padding: 8px 0; border-bottom: 1px solid var(--line); }
.violation { font-style: italic; font-size: 12px; margin-left: 8px; }
.ok { color: var(--muted); }
.sample { font-family: "Noto Serif HK", serif; font-size: 17px; }
.sample--no { text-decoration: line-through; color: var(--muted); }
@page { size: A4; margin: 18mm 16mm 20mm; }
@media print {
  body { background: White; color: Black; }
  .book { max-width: none; padding: 0; }
  .page { break-after: page; margin-bottom: 0; }
  .page:last-of-type { break-after: auto; }
  .block { break-inside: avoid; }
  .book-head { break-after: page; }
  .folio { display: block; }
}
.folio { display: none; position: fixed; bottom: 8mm; right: 16mm; font-size: 10px; color: var(--muted); }
`;

/**
 * 整本品牌書（或其中一頁）的 HTML。
 *
 * `options.print` 只影響 CSS：同一份標記、同一份內容，用 A4 紙印出來就是
 * 品牌手冊。不另寫一個「PDF 版」renderer —— 兩份 renderer 早晚會講不同的話。
 */
export function renderBrandHtml(composed: ComposedBrand, options: HtmlOptions = {}): string {
  const lookup = buildLookup(composed.pages);
  const paper = lookup.colors.get('paper');
  const ink = lookup.colors.get('ink');
  const accent = lookup.colors.get('brand.primary');
  const muted = lookup.colors.get('muted');

  const selected =
    options.pageKey === undefined || options.pageKey === null
      ? composed.pages
      : composed.pages.filter((page) => page.key === options.pageKey);

  const rootStyle = [
    paper === undefined || paper.hex === '' ? null : `--paper:${paper.hex}`,
    ink === undefined || ink.hex === '' ? null : `--ink:${ink.hex}`,
    accent === undefined || accent.hex === '' ? null : `--accent:${accent.hex}`,
    muted === undefined || muted.hex === '' ? null : `--muted:${muted.hex}`,
  ]
    .filter((item): item is string => item !== null)
    .join(';');

  const pages = selected
    .map((page) => {
      const schema = schemaForPage(page.key, page.kind);
      const body =
        schema.key === 'home'
          ? renderHomeBlocks(page, lookup, options)
          : page.document.layout.blocks
              .map((layoutBlock) => {
                if (layoutBlock.kind === 'stance') {
                  const stance = typeof page.document.payload['stance'] === 'string' ? page.document.payload['stance'] : page.document.stance ?? '';
                  return `<section class="block block--stance" data-block="stance"><p class="stance">${escapeHtml(stance) || '<span class="missing">缺立場句</span>'}</p></section>`;
                }

                if (layoutBlock.kind === 'gaps') {
                  return `<section class="block" data-block="gaps"><h3>缺口</h3>${
                    page.document.gaps.length === 0
                      ? '<p class="ok">沒有登記的缺口。</p>'
                      : `<ul class="gaps">${page.document.gaps
                          .map((gap) => `<li data-gap-type="${gap.type}">${escapeHtml(gap.what)}<span class="missing">缺</span></li>`)
                          .join('')}</ul>`
                  }</section>`;
                }

                const section = schema.sections.find((item) => item.id === layoutBlock.source);

                if (section === undefined) {
                  return '';
                }

                return `<section class="block" data-block="${escapeHtml(section.id)}"${
                  layoutBlock.emphasis === 'lead' ? ' data-emphasis="lead"' : ''
                }><h3>${escapeHtml(layoutBlock.title ?? section.label)}</h3>${renderSection(section, page, lookup, options)}</section>`;
              })
              .join('');

      return `<section class="page" data-page="${escapeHtml(page.key)}">
<h2>${escapeHtml(page.name)}</h2>
<p class="version">v${page.versionNo}${page.policyVersionNo === null ? '' : ` · 用策略 v${page.policyVersionNo}`}</p>
${body}
</section>`;
    })
    .join('\n');

  const composedLine = composed.pages.map((page) => `${page.name} v${page.versionNo}`).join(' ');

  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(composed.name)} 品牌${options.print === true ? '手冊' : ''}</title>
<style>${STYLE}</style>
</head>
<body data-print="${options.print === true ? 'true' : 'false'}">
<div class="book" style="${rootStyle}">
<header class="book-head">
<p class="code">${escapeHtml(composed.code)}</p>
<h1>${escapeHtml(composed.name)}</h1>
<p class="composed">品牌 v${composed.releaseNo} ${escapeHtml(composedLine)}</p>
</header>
${pages}
<span class="folio">${escapeHtml(composed.name)} 品牌 v${composed.releaseNo}</span>
</div>
</body>
</html>`;
}

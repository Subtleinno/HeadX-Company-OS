import { emptyBrandDocument, parseBrandDocument, type BrandDocument } from './document.ts';
import { schemaForPage } from './schemas.ts';

/**
 * 舊版（#35–#39）內容 → v2 文件的**單向讀取**（issue #57）。
 *
 * 為什麼要這一步：`brand_page_version.content` 已經存了幾版示範資料，其中
 * 有些是自由文字、有些是舊形狀的 JSON。選擇「讀的時候轉換」而不是「寫一個
 * 遷移腳本改寫歷史」，因為版本只加不改（C97）—— 改寫歷史版本去迎合新程式，
 * 正是那條規則要防的事。
 *
 * 舊版只有兩種，都如實處理：
 *   1. 舊形狀 JSON（自定義頁）→ 逐個欄位搬過去，搬不到的留空。
 *   2. 自由文字 → 原文放進 `legacy_text`，畫面以「舊版內容」一段顯示。
 *      **不猜**它屬於哪一個欄位：一段文字可能是立場、也可能是規則。
 *
 * 轉換只在讀取時發生。下一次儲存一定寫 v2 文件，所以舊版會自然停在舊版，
 * 而新舊不會同時是「現行」。
 */

const LEGACY_TEXT_KEY = 'legacy_text';

export function documentFromStored(pageKey: string, kind: 'fixed' | 'custom', content: string): BrandDocument {
  const trimmed = content.trim();

  if (trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);

      if (typeof parsed === 'object' && parsed !== null) {
        const asDocument = parseBrandDocument(parsed);

        if (asDocument.ok) {
          return asDocument.value;
        }
      }

      return fromLegacyJson(pageKey, kind, parsed);
    } catch {
      // 解析不到就當自由文字：寧願顯示原文，也不要顯示「壞掉了」。
    }
  }

  const schema = schemaForPage(pageKey, kind);
  const payload = schema.normalize({});

  return {
    ...emptyBrandDocument({
      blocks: [{ kind: 'section', source: 'legacy', reason: '這一版是舊格式，先把原文讀得返，再決定怎樣拆。' }],
    }),
    payload: { ...payload, [LEGACY_TEXT_KEY]: trimmed },
  };
}

function fromLegacyJson(pageKey: string, kind: 'fixed' | 'custom', raw: unknown): BrandDocument {
  const schema = schemaForPage(pageKey, kind);
  const record = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

  // 自定義頁的舊形狀就係 v2 的欄位名（decided／notDecided／rules…），所以
  // normalize 已經接得住；其餘頁的舊形狀不同，逐頁搬。
  const payload =
    schema.key === 'custom'
      ? schema.normalize(record)
      : schema.normalize(convertKnown(pageKey, record));

  return {
    ...emptyBrandDocument(schema.layout(payload)),
    payload,
  };
}

/** 舊形狀 → v2 形狀。只搬讀得明的欄位，不猜。 */
function convertKnown(pageKey: string, raw: Record<string, unknown>): Record<string, unknown> {
  if (pageKey === 'color') {
    const light = asRecord(raw.light);
    const dark = asRecord(raw.dark);
    const roles = Object.entries(light).map(([id, value]) => {
      const pair = asRecord(value);
      const darkPair = asRecord(dark[id]);

      return {
        id,
        group: id.startsWith('brand.') ? 'brand' : isFunctionRole(id) ? 'function' : 'reading',
        name: typeof pair.label === 'string' ? pair.label : '',
        hex: typeof pair.hex === 'string' ? pair.hex : '',
        cmyk: typeof pair.cmyk === 'string' ? pair.cmyk : '',
        dark: typeof darkPair.hex === 'string' ? darkPair.hex : '',
        usage: '',
        reason: '',
      };
    });

    const allowed = Array.isArray(raw.allowed) ? raw.allowed : [];
    const pairs = allowed
      .map((item) => {
        const text = typeof item === 'string' ? item : typeof asRecord(item).text === 'string' ? String(asRecord(item).text) : '';
        const match = /^(.+?)\s+on\s+(.+)$/.exec(text);
        return match === null ? null : { fg: match[1]?.trim() ?? '', bg: match[2]?.trim() ?? '', use: 'body', reason: '' };
      })
      .filter((item): item is { fg: string; bg: string; use: string; reason: string } => item !== null);

    return { roles, pairs: { allowed: pairs, forbidden: [] } };
  }

  if (pageKey === 'type') {
    const families = Array.isArray(raw.families) ? raw.families : [];
    const roles = asRecord(raw.roles);

    return {
      families: families.map((item) => {
        const family = asRecord(item);
        return {
          id: typeof family.id === 'string' ? family.id : '',
          name: typeof family.name === 'string' ? family.name : '',
          script: typeof family.script === 'string' ? family.script : '',
          license_web: family.webEmbeddable === true ? '可嵌入' : '',
          license_print: typeof family.licence === 'string' ? family.licence : '',
          file_ref: '',
        };
      }),
      roles: Object.entries(roles).map(([role, value]) => {
        const spec = asRecord(value);
        return {
          role,
          family: typeof spec.familyId === 'string' ? spec.familyId : '',
          weight: typeof spec.weight === 'string' ? spec.weight : '',
          size: typeof spec.size === 'string' ? spec.size : '',
          leading: typeof spec.leading === 'string' ? spec.leading : '',
          min: typeof spec.minSize === 'string' ? Number.parseInt(spec.minSize, 10) || 0 : 0,
          measure: typeof spec.measure === 'string' ? spec.measure : '',
          reason: '',
        };
      }),
      pairing: typeof raw.pairing === 'string' ? raw.pairing : '',
      misuse: Array.isArray(raw.misuse)
        ? raw.misuse.map((item) => ({ example: typeof item === 'string' ? item : '', reason: '' }))
        : [],
    };
  }

  if (pageKey === 'logo') {
    const assets = Array.isArray(raw.assets) ? raw.assets : [];
    const modes = asRecord(raw.modes);

    return {
      assets: assets.map((item) => {
        const asset = asRecord(item);
        return {
          class: typeof asset.kind === 'string' ? asset.kind : '',
          label: typeof asset.name === 'string' ? asset.name : '',
          file_ref: typeof asset.master === 'string' && asset.master !== '' ? asset.master : typeof asset.preview === 'string' ? asset.preview : '',
          version: '',
        };
      }),
      master_vector: typeof raw.primaryId === 'string' ? raw.primaryId : '',
      modes: Object.entries(modes).map(([mode, value]) => {
        const spec = asRecord(value);
        return { mode, color_role: typeof spec.role === 'string' ? spec.role : '', note: '' };
      }),
      clear_space_x: {
        x: typeof raw.safeArea === 'string' ? raw.safeArea : '',
        multiples: typeof raw.safeArea === 'string' ? raw.safeArea : '',
        note: typeof raw.whenToUse === 'string' ? raw.whenToUse : '',
      },
      backgrounds: typeof raw.backgrounds === 'string' ? raw.backgrounds : '',
      misuse: Array.isArray(raw.misuse)
        ? raw.misuse.map((item) => ({ example: typeof item === 'string' ? item : '', reason: '' }))
        : [],
    };
  }

  if (pageKey === 'tone') {
    const traits = Array.isArray(raw.traits) ? raw.traits : [];

    return {
      traits: traits.map((item) => {
        const trait = asRecord(item);
        return {
          name: typeof trait.name === 'string' ? trait.name : '',
          do: typeof trait.does === 'string' ? trait.does : '',
          dont: typeof trait.doesNot === 'string' ? trait.doesNot : '',
          sentence: typeof trait.doesExample === 'string' ? trait.doesExample : '',
        };
      }),
      banned: Array.isArray(raw.banned)
        ? raw.banned.map((item) => (typeof item === 'string' ? { term: item, reason: '' } : { term: '', reason: '' }))
        : [],
    };
  }

  return {};
}

function isFunctionRole(id: string): boolean {
  return id === 'success' || id === 'warning' || id === 'danger';
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

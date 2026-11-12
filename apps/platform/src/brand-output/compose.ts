import type { Pool } from 'pg';
import {
  buildPromptPack,
  buildTokens,
  renderBrandHtml,
  type ComposedBrand,
  type ComposedGap,
} from '@company-os/contracts';
import { brandHeader, composePages } from '../brand-pages/store.js';
import { gapsForOutput } from '../brand-gaps/store.js';

/**
 * 品牌輸出的組成（issue #57）。
 *
 * 「組成」＝ 這間公司此刻的每一頁現行版本。它是一個**查詢**，不是一份存檔：
 * 所以改了色彩頁，下一秒的 tokens、prompt、HTML 都會跟著變。要固定下來給
 * 成品用的話，那是 `brand_release`（品牌版本）的事，不是這裡。
 *
 * 缺口由文件講（有什麼缺），由 `brand_gap` 補「交了給誰跟」（#58）。
 * prompt 的缺口段落因此講得出「已建立 Need」與「未建立」，而不是一律同一句。
 */

export async function composeBrand(pool: Pool, brandId: string): Promise<ComposedBrand | null> {
  const header = await brandHeader(pool, brandId);

  if (header === null) {
    return null;
  }

  const pages = await composePages(pool, brandId);
  const gaps: ComposedGap[] = await gapsForOutput(pool, brandId);

  return {
    code: header.code,
    name: header.name,
    releaseNo: header.releaseNo,
    pages,
    gaps,
  };
}

export function tokensOf(composed: ComposedBrand): { body: string; filename: string } {
  const tokens = buildTokens(composed);

  const body = JSON.stringify(
    {
      $description: `${composed.name} 品牌 tokens（品牌 v${composed.releaseNo}）。淺色與深色兩套；缺的角色不出現，缺口另見品牌 prompt。`,
      $extensions: {
        'com.headx.brand': {
          brand: composed.code,
          releaseNo: composed.releaseNo,
          composed: composed.pages.map((page) => ({ page: page.key, versionNo: page.versionNo })),
          missing: tokens.missing,
          notes: tokens.notes,
        },
      },
      light: tokens.light,
      dark: tokens.dark,
    },
    null,
    2,
  );

  return { body: `${body}\n`, filename: `${composed.code}-tokens.json` };
}

export function promptOf(composed: ComposedBrand): { body: string; filename: string } {
  const pack = buildPromptPack(composed);

  return { body: `${pack.markdown}\n`, filename: `${composed.code}-brand-prompt.md` };
}

export function htmlOf(
  composed: ComposedBrand,
  options: { pageKey?: string | null; print?: boolean },
): string {
  return renderBrandHtml(composed, {
    pageKey: options.pageKey ?? null,
    print: options.print === true,
    assetUrl: (ref) => (/^[0-9a-f-]{36}$/i.test(ref) ? `/api/files/${ref}` : null),
  });
}

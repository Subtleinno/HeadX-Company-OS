import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { GUIDE_STAGES } from './schema.js';

/**
 * 選項圖：把「看得見的選項」變成一張實物示意圖。
 *
 * 圖跟源碼走，不進 MinIO／DB。理由：
 *   選項庫本身（0025 的 seed、engine/reference 的 options.js）就是系統的一部分，
 *   跟著 commit 走；圖是同一份參考資料的另一半。放在 DB 或物件儲存，新機／新環境
 *   一裝就沒有圖，而「沒有圖」與「生成失敗」在畫面上長得一樣 —— 沒有人分得出。
 *
 * 檔案位置：`apps/platform/assets/brand-options/<stage>/<dimension>/<optId>.webp`。
 * 由 scripts/gen-option-images.mjs 生成，跟其他源碼一齊 commit。
 *
 * 為什麼要分 dimension 一層：
 *   同一個 stage 內，`opt_id` 會跨維度重複 —— stage2 的 `ceramic` 同時是
 *   「材質」與「表面」，`flat` 同時是「表面」與「光線」。平放一層的話，
 *   後生成的一張會靜靜蓋掉前一張，而畫面完全正常（只是圖錯了）。
 *   分一層之後，路徑本身就是完整的識別。
 *
 * 讀取要登入：選項庫本身都是登入後才看得到的東西，圖不應該比文字更寬鬆。
 */

const SEGMENT_RE = /^[a-zA-Z0-9_]{1,40}$/;
const FILE_RE = /^([a-zA-Z0-9_]{1,40})\.webp$/;

/** 一個 stage 的圖資料夾。找不到就回 null（不是拋錯：沒有圖不是壞掉）。 */
function stageDir(stage: string): string {
  const candidates = [
    // dist/brand-guide/option-images.js → apps/platform/assets
    join(__dirname, '..', '..', 'assets', 'brand-options', stage),
    // 由 repo 根目錄跑的測試／腳本
    join(process.cwd(), 'apps', 'platform', 'assets', 'brand-options', stage),
    join(process.cwd(), 'assets', 'brand-options', stage),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0] as string;
}

export function registerBrandOptionImages(app: FastifyInstance): void {
  /**
   * 讀一張選項圖。沒有檔案回 404 —— 不是 500，也不是一張灰色的佔位圖：
   * 「這格還沒有圖」是一個正常的狀態，前端就不畫圖框。
   */
  app.get(
    '/brand-options/:stage/:dimension/:file',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { stage, dimension, file } = request.params as {
        stage: string;
        dimension: string;
        file: string;
      };

      if (!(GUIDE_STAGES as readonly string[]).includes(stage)) {
        return reply.code(404).send({ error: 'stage_not_found', stage });
      }

      // 只收 [A-Za-z0-9_] 組成的維度與 `<optId>.png`：
      // 不讓任何路徑成分（`..`、`/`）進來。
      const match = FILE_RE.exec(file);

      if (!SEGMENT_RE.test(dimension) || match === null) {
        return reply.code(404).send({ error: 'option_image_not_found', stage, dimension });
      }

      const optId = match[1] as string;

      try {
        const body = await readFile(join(stageDir(stage), dimension, `${optId}.webp`));

        reply.header('Content-Type', 'image/webp');
        // 圖跟 commit 走，內容不會在執行期改變；但仍用短快取，換圖後很快見到。
        reply.header('Cache-Control', 'private, max-age=300');
        reply.header('ETag', `"${stage}-${dimension}-${optId}-${body.length}"`);

        return reply.send(body);
      } catch {
        return reply.code(404).send({ error: 'option_image_not_found', stage, dimension, optId });
      }
    },
  );
}

/**
 * 一個 stage 的「維度 → (選項 id → 圖網址)」對照，給 schema 回應併入每個選項。
 *
 * 直接讀資料夾而不是查 DB：檔案的存廢就是唯一真相，不會出現「DB 說有圖、
 * 檔案卻不在」這種兩份答案不一致的情況。一個 stage 幾百個檔，readdir 的
 * 成本可以忽略。
 */
export async function loadOptionImages(stage: string): Promise<Map<string, Map<string, string>>> {
  const byDimension = new Map<string, Map<string, string>>();

  let entries;

  try {
    entries = await readdir(stageDir(stage), { withFileTypes: true });
  } catch {
    return byDimension;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || !SEGMENT_RE.test(entry.name)) {
      continue;
    }

    const files = await readdir(join(stageDir(stage), entry.name));
    const byOption = new Map<string, string>();

    for (const file of files) {
      const match = FILE_RE.exec(file);

      if (match === null) {
        continue;
      }

      const optId = match[1] as string;
      byOption.set(optId, `/api/brand-options/${stage}/${entry.name}/${optId}.webp`);
    }

    if (byOption.size > 0) {
      byDimension.set(entry.name, byOption);
    }
  }

  return byDimension;
}

/**
 * 把圖網址併進 schema 的每一個選項（`cat` 的 groups[].items[]）。
 *
 * `cat` 的 key 就是 dimension，所以同一組 id 在不同維度可以有不同圖，
 * 不會互相蓋掉。
 *
 * 回傳新物件，不改原本的 schema：schema 由 vm 載入、可能被多處共用，
 * 就地改會令下一個請求拿到上一批圖。
 */
export function attachOptionImages(
  schema: Record<string, unknown>,
  images: Map<string, Map<string, string>>,
): Record<string, unknown> {
  if (images.size === 0) {
    return schema;
  }

  const cat = schema.cat;

  if (typeof cat !== 'object' || cat === null) {
    return schema;
  }

  const nextCat: Record<string, unknown> = {};
  let touched = false;

  for (const [dim, value] of Object.entries(cat as Record<string, unknown>)) {
    const byOption = images.get(dim);

    if (
      byOption === undefined ||
      typeof value !== 'object' ||
      value === null ||
      !Array.isArray((value as { groups?: unknown }).groups)
    ) {
      nextCat[dim] = value;
      continue;
    }

    const entry = value as { groups: unknown[] };

    nextCat[dim] = {
      ...entry,
      groups: entry.groups.map((group: unknown) => {
        const g = group as { items?: unknown };

        if (!Array.isArray(g.items)) {
          return group;
        }

        return {
          ...g,
          items: g.items.map((item: unknown) => {
            const i = item as { id?: unknown };
            const id = typeof i.id === 'string' ? i.id : '';
            const img = byOption.get(id);

            if (img === undefined) {
              return item;
            }

            touched = true;
            return { ...i, img };
          }),
        };
      }),
    };
  }

  // 這個 stage 一張圖都對不上（例如資料夾名字改了）：原樣回傳，不做無謂複製。
  return touched ? { ...schema, cat: nextCat } : schema;
}

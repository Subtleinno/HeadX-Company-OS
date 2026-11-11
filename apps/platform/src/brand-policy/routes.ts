import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { writeAudit } from '../audit.js';
// 同一條「內容不可以空白、note 空白當沒有」的規則，不抄第二份。
import { parseVersionInput } from '../brand-pages/schema.js';
import { createPolicyVersion, isPolicySlot, listPolicy } from './store.js';

/**
 * 品牌頁策略 API（issue #34）。
 *
 * 兩條路：
 *   GET  /policy                        六個槽連現行版本與版本列表（任何登入者）
 *   POST /policy/:slot/versions         儲存＝新增一版（只有老闆）
 *
 * **讀為什麼不是老闆專用**：這一頁在 Boss Portal（非老闆開不到），但讀取本身
 * 不是秘密 —— 擋在讀取只會令日後 agent 與員工 lookup 時得到一個看不出原因的
 * 403。寫才是「只有老闆」（C102）。
 *
 * **沒有 PUT／PATCH／DELETE**：策略只加不改。改一個字都是新版本，舊版永遠讀
 * 得返 —— 已出街成品可能引用某一版。這不是前端不提供，是後端沒有這條路。
 */

export type BrandPolicyDeps = {
  pool: Pool;
};

type SlotParams = { slot: string };

export function registerBrandPolicy(app: FastifyInstance, deps: BrandPolicyDeps): void {
  app.get('/policy', { preHandler: app.requireUser }, async () => {
    return { slots: await listPolicy(deps.pool) };
  });

  app.post(
    '/policy/:slot/versions',
    { preHandler: app.requireOwner },
    async (request, reply) => {
      const user = request.currentUser;

      if (user === null) {
        throw new Error('brand-policy 路由缺少 requireOwner：request.currentUser 是空的');
      }

      const { slot } = request.params as SlotParams;

      // 未知的槽當作不存在（404），不是 400：這六個槽是對外承諾的鍵，
      // 打錯字與打錯網址是同一件事。
      if (!isPolicySlot(slot)) {
        return reply.code(404).send({ error: 'policy_slot_not_found', slot });
      }

      const parsed = parseVersionInput(request.body);

      if (!parsed.ok) {
        return reply.code(400).send({ error: 'invalid_version', reason: parsed.reason });
      }

      const version = await createPolicyVersion(deps.pool, {
        slot,
        content: parsed.value.content,
        note: parsed.value.note,
        actorId: user.id,
      });

      await writeAudit(deps.pool, {
        actorType: 'human',
        actorId: user.id,
        action: 'brand.policy.version.create',
        target: version.id,
        detail: { slot, versionNo: version.versionNo },
      });

      return reply.code(201).send({ version });
    },
  );
}

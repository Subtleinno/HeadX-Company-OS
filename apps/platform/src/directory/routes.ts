import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { writeAudit } from '../audit.js';
import { parseBrandFocusInput, parseBrandInput, parseSiteInput } from './schema.js';
import {
  approveSite,
  createBrand,
  createSite,
  ensureLocalSite,
  findBrandByCode,
  findBrandFocus,
  findSite,
  listBrands,
  listSites,
  setBrandFocus,
} from './store.js';

/**
 * 品牌同據點的 API（Frame 品牌 selector、Boss Portal 據點目錄）。
 *
 * 六條路：
 *   GET  /brands           品牌清單（任何登入者：selector 要用）
 *   POST /brands           開新品牌（老闆）
 *   GET  /me/brand-focus   我上次做緊邊個品牌（任何登入者，只讀自己）
 *   PUT  /me/brand-focus   記住我而家做緊邊個品牌（任何登入者，只寫自己）
 *   GET  /sites            據點目錄（老闆；設計稿 frame-06 講明只有管理級見到）
 *   POST /sites            新增據點，回一次性邀請憑證（老闆）
 *   POST /sites/:id/approve 批准（老闆）
 *
 * 為咩 brand-focus 唔係老闆專用：呢個係「我自己做緊邊個品牌」，
 * 每個人都有自己的答案，而且寫的是自己那一行。請求裡面冇 user id，
 * 寫邊個由 session 決定 —— 呢一點唔可以交俾呼叫者講。
 *
 * 為咩據點要老闆專用：據點 = 一台可以讀全公司資料的機器。呢個唔係「一個功能」，
 * 係「邊幾台機入得到」。員工就算知道網址，API 都會 403 —— 前端另外畫一個
 * 誠實的權限頁（C66），唔會出現一個睇得見但入唔到的選單。
 */

export type DirectoryDeps = {
  pool: Pool;
  /** 注入時鐘：測試要固定「而家」才講得清邀請幾時過期。 */
  now?: () => Date;
};

export function registerDirectory(app: FastifyInstance, deps: DirectoryDeps): void {
  const now = deps.now ?? (() => new Date());

  app.get('/brands', { preHandler: app.requireUser }, async () => {
    return { items: await listBrands(deps.pool) };
  });

  app.post('/brands', { preHandler: app.requireOwner }, async (request, reply) => {
    const user = request.currentUser;

    if (user === null) {
      throw new Error('directory 路由缺少 requireOwner：request.currentUser 是空的');
    }

    const parsed = parseBrandInput(request.body);

    if (!parsed.ok) {
      return reply.code(400).send({ error: 'invalid_brand', reason: parsed.reason });
    }

    const existing = await findBrandByCode(deps.pool, parsed.value.code);

    if (existing !== null) {
      return reply.code(409).send({ error: 'duplicate_code', code: parsed.value.code });
    }

    const brand = await createBrand(deps.pool, parsed.value.code, parsed.value.name);

    await writeAudit(deps.pool, {
      actorType: 'human',
      actorId: user.id,
      action: 'brand.create',
      target: brand.id,
      detail: { code: brand.code },
    });

    return reply.code(201).send({ item: brand });
  });

  /**
   * 我上次做緊邊個品牌（issue #15）。
   *
   * 冇記錄就回 null。前端拿到 null 會隨機揀一個並寫入 —— 隨機只發生一次，
   * 之後就係「記住」。伺服器唔自己揀：GET 有副作用會令每次預取都改寫事實。
   */
  app.get('/me/brand-focus', { preHandler: app.requireUser }, async (request) => {
    const user = request.currentUser;

    if (user === null) {
      throw new Error('directory 路由缺少 requireUser：request.currentUser 是空的');
    }

    return { brandId: await findBrandFocus(deps.pool, user.id) };
  });

  app.put('/me/brand-focus', { preHandler: app.requireUser }, async (request, reply) => {
    const user = request.currentUser;

    if (user === null) {
      throw new Error('directory 路由缺少 requireUser：request.currentUser 是空的');
    }

    const parsed = parseBrandFocusInput(request.body);

    if (!parsed.ok) {
      return reply.code(400).send({ error: 'invalid_input', reason: parsed.reason });
    }

    const written = await setBrandFocus(deps.pool, user.id, parsed.value.brandId);

    // 寫唔到只有一個原因：呢個 brand id 唔存在。如實講，唔好回 200 令前端
    // 以為記住了 —— 下一次開機就會出現一個唔同的品牌，而冇人知點解。
    if (!written) {
      return reply.code(400).send({ error: 'unknown_brand', brandId: parsed.value.brandId });
    }

    return { brandId: parsed.value.brandId };
  });

  /**
   * 頁尾要顯示「本機公司・公司名・城市」。呢三樣唔係秘密：任何員工都應該
   * 知道自己喺邊一間公司、邊一台機上面做嘢。所以呢一條唔係老闆專用，
   * 但只回三個欄位 —— 唔會順便漏出其他據點、憑證或者邀請狀態。
   */
  app.get('/company', { preHandler: app.requireUser }, async () => {
    const local = await ensureLocalSite(deps.pool);

    return {
      siteCode: local.code,
      name: local.company_label,
      city: local.city,
    };
  });

  app.get('/sites', { preHandler: app.requireOwner }, async () => {
    return { items: await listSites(deps.pool, now()) };
  });

  app.post('/sites', { preHandler: app.requireOwner }, async (request, reply) => {
    const user = request.currentUser;

    if (user === null) {
      throw new Error('directory 路由缺少 requireOwner：request.currentUser 是空的');
    }

    const parsed = parseSiteInput(request.body);

    if (!parsed.ok) {
      return reply.code(400).send({ error: 'invalid_site', reason: parsed.reason });
    }

    const created = await createSite(deps.pool, parsed.value, now());

    if (!created.ok) {
      return reply.code(409).send({ error: 'duplicate_code', code: parsed.value.code });
    }

    await writeAudit(deps.pool, {
      actorType: 'human',
      actorId: user.id,
      action: 'site.create',
      target: created.site.id,
      detail: { code: created.site.code },
    });

    // 明文憑證只會喺呢個回應出現一次；之後資料庫只有 hash。
    return reply.code(201).send({
      item: created.site,
      invite: { token: created.inviteToken, expiresAt: created.inviteExpiresAt },
    });
  });

  app.post('/sites/:id/approve', { preHandler: app.requireOwner }, async (request, reply) => {
    const user = request.currentUser;

    if (user === null) {
      throw new Error('directory 路由缺少 requireOwner：request.currentUser 是空的');
    }

    const id = (request.params as { id: string }).id;
    const outcome = await approveSite(deps.pool, id, now());

    if (outcome === 'missing') {
      return reply.code(404).send({ error: 'site_not_found', id });
    }

    if (outcome === 'not_pending') {
      return reply.code(409).send({ error: 'site_not_pending', id });
    }

    await writeAudit(deps.pool, {
      actorType: 'human',
      actorId: user.id,
      action: 'site.approve',
      target: id,
    });

    const site = await findSite(deps.pool, id, now());

    return site === null ? reply.code(404).send({ error: 'site_not_found', id }) : { item: site };
  });
}

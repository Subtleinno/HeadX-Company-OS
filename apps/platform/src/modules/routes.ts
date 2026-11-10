import type { FastifyInstance } from 'fastify';
import type { ModuleKind, ModuleManifest, ModuleRegistry } from './registry/index.js';

/**
 * GET /modules：誰見到哪些模組。
 *
 * 老闆見全部（含老闆台）；員工只見到自己部門的那一個。
 * 回應只有 manifest 的六個欄位，不回傳檔案路徑 —— 路徑是伺服器的實作細節。
 *
 * R4 之後 manifest 多了 route、exposure、sensitive，但這一支的回應刻意不變：
 * 對外欄位在這裡逐個列出才輸出（白名單，不是黑名單），所以將來 manifest 再加
 * 欄位也不會靜靜漏出去。route 與 exposure 怎樣影響授權，是之後 S1-07 的工作。
 *
 * 身份一律經 requireUser（issue 140）：入口驗證、session 查詢同
 * 「未改初始密碼一律 403」都只有這一個來源。呢支路由以前自己查 session，
 * 所以漏咗嗰道閘門；唔好再喺路由入面抄第二份判斷。
 */

/**
 * 對外公開的欄位。manifest 其他欄位一律不出現在回應裡。
 *
 * 2026-11-10 起多一個 `route`：外殼要用它才知道「撳呢個 app 去邊」。
 * 以前唔公開，係因為 app-host 未接線、冇任何畫面接得住；而家 Boss Portal
 * 同 Design 兩個 app 已經有真畫面，唔公開 route 就等於要前端自己寫死
 * app id ↔ 網址對照表，那正是「兩份清單，總有一份過時」。
 */
export type PublicModule = {
  id: string;
  title: string;
  kind: ModuleKind;
  department: string | null;
  order: number;
  available: boolean;
  /** 這個 app 的入口路徑，例如 `/boss`。 */
  route: string;
};

/** 逐個欄位抄出來，不是 spread —— spread 會把新欄位一併帶出去。 */
export function toPublicModule(module: ModuleManifest): PublicModule {
  return {
    id: module.id,
    title: module.title,
    kind: module.kind,
    department: module.department,
    order: module.order,
    available: module.available,
    route: module.route,
  };
}

export type ModuleDeps = {
  registry: ModuleRegistry;
};

export function registerModules(app: FastifyInstance, deps: ModuleDeps): void {
  app.get('/modules', { preHandler: app.requireUser }, async (request) => {
    const user = request.currentUser;

    // requireUser 未登入時已經回 401 not_signed_in，唔會行到呢度。
    // 保留呢個檢查係為咗 TypeScript 收窄，同埋萬一漏咗接線要即刻睇得見。
    if (user === null) {
      throw new Error('GET /modules 缺少 requireUser：request.currentUser 是空的');
    }

    if (user.role === 'owner') {
      return { modules: deps.registry.listModules().map(toPublicModule) };
    }

    // 員工沒有部門（或部門沒有對應模組）就是空清單，不會見到別人的模組。
    const modules = deps.registry
      .listModules()
      .filter((item) => item.kind === 'department' && item.department === user.department)
      .map(toPublicModule);

    return { modules };
  });
}

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 邊界規則的唯一來源（issue #71）。
 *
 * 規則不是寫死一堆 app 名，而是由資料夾現況生成：apps/ 多一個資料夾，cross-app 規則
 * 自動多一條；packages/ 多一個 package，deep-import 規則自動多一條。這樣「有哪些 app」
 * 仍然只有一個來源（檔案系統），不會出現規則與實際結構各說各話。
 *
 * `lint:boundaries` 與 fixtures 測試都經這裡拿規則，所以測試驗的是真正上 CI 的那一組，
 * 不是另外一份「測試專用」的寬鬆版。
 *
 * 路徑一律用 `(^|/)` 開頭而不是 `^`：掃描根目錄既可能是 repo 根（apps/...），
 * 也可能是 fixtures（tools/boundaries/fixtures/violations/apps/...），
 * 同一組規則要兩邊都咬得住。
 */

/**
 * 資料夾名即 id；不符格式的（例如 .DS_Store、README）不當成 app／package。
 *
 * 允許連字號：`apps/app-host`（#77）是執行器，不是有 manifest 的 app，
 * 所以它不受 contracts 的 manifest id 規則（只准底線）約束，但它在 apps/ 之下，
 * 一樣要受「app 之間不可互相 import」管。沒有這一條，app-host 引用 platform
 * 的內部檔案時 lint:boundaries 會完全看不到 —— 一條守不住東西的規則不算規則。
 */
const ID_PATTERN = /^[a-z][a-z0-9_-]*$/;

/** 平台的舊名與新名。R2 改名後 `api` 會消失，規則不用改。 */
const PLATFORM_IDS = ['api', 'platform'];

function subdirectories(directory) {
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => ID_PATTERN.test(name))
      .sort();
  } catch {
    return [];
  }
}

/**
 * package 的公開入口：只認 package.json 的 exports（沒有就退回 main，再沒有就 src/index.ts）。
 *
 * 為甚麼要讀 package.json 而不是寫死 index.ts：`@company-os/design-tokens/tokens.css`
 * 這種寫法是 package.json 明明白白宣告的公開入口，不是偷偷深入子資料夾。把「哪些入口
 * 合法」放在兩個地方（package.json 與這裡）就是第二個真相；這裡只讀，不重複。
 *
 * 回傳相對於 package 目錄的路徑，例如 `src/index.ts`、`src/tokens.css`。
 */
function publicEntries(packageDir) {
  // 一律允許這兩種寫法：fixtures 內的假 package 沒有 package.json。
  const entries = new Set(['index.ts', 'src/index.ts']);

  const collect = (value) => {
    if (typeof value === 'string') {
      entries.add(value.replace(/^\.\//, ''));
      return;
    }
    if (value !== null && typeof value === 'object') {
      for (const item of Object.values(value)) {
        collect(item);
      }
    }
  };

  try {
    const manifest = JSON.parse(readFileSync(resolve(packageDir, 'package.json'), 'utf8'));
    collect(manifest.exports ?? manifest.main);
  } catch {
    // 沒有 package.json（fixtures 的假 package）或檔案壞掉：用上面的預設。
  }

  return [...entries].sort();
}

/** 讀出一個根目錄的結構：有哪些 app、哪些 package（連公開入口）、每個 app 有哪些模組。 */
export function discoverLayout(root) {
  const appIds = subdirectories(resolve(root, 'apps'));
  const packageIds = subdirectories(resolve(root, 'packages'));

  const packageEntries = {};
  for (const packageId of packageIds) {
    packageEntries[packageId] = publicEntries(resolve(root, 'packages', packageId));
  }

  const moduleIds = {};
  for (const appId of appIds) {
    const modules = subdirectories(resolve(root, 'apps', appId, 'src', 'modules'));
    if (modules.length > 0) {
      moduleIds[appId] = modules;
    }
  }

  return { appIds, packageIds, packageEntries, moduleIds };
}

/** 合併多個根目錄的結構（fixtures 的 violations 與 clean 各有自己的 app）。 */
export function mergeLayouts(...layouts) {
  const appIds = new Set();
  const packageIds = new Set();
  const packageEntries = {};
  const moduleIds = {};

  for (const layout of layouts) {
    for (const appId of layout.appIds) {
      appIds.add(appId);
    }
    for (const packageId of layout.packageIds) {
      packageIds.add(packageId);
    }
    for (const [packageId, entries] of Object.entries(layout.packageEntries ?? {})) {
      const merged = new Set([...(packageEntries[packageId] ?? []), ...entries]);
      packageEntries[packageId] = [...merged].sort();
    }
    for (const [appId, modules] of Object.entries(layout.moduleIds)) {
      const merged = new Set([...(moduleIds[appId] ?? []), ...modules]);
      moduleIds[appId] = [...merged].sort();
    }
  }

  return { appIds: [...appIds].sort(), packageIds: [...packageIds].sort(), packageEntries, moduleIds };
}

/**
 * 依結構生成禁止規則。
 * 順序有意義：platform 與其他 app 分開生成，令同一條違規只會被一條規則咬住，
 * 避免「兩條規則同時報同一件事」而看不出真正原因。
 */
export function buildForbiddenRules(layout) {
  const platformIds = layout.appIds.filter((id) => PLATFORM_IDS.includes(id));
  const otherAppIds = layout.appIds.filter((id) => !PLATFORM_IDS.includes(id));
  const rules = [];

  for (const appId of otherAppIds) {
    rules.push({
      name: `app-cross-import-${appId}`,
      severity: 'error',
      comment: `app 之間不可互相 import：${appId} 只可以引用自己、packages/* 與 platform 的介面。`,
      from: { path: `(^|/)apps/${appId}/` },
      to: { path: `(^|/)apps/(?!${appId}/)[^/]+/` },
    });
  }

  if (platformIds.length > 0) {
    rules.push({
      name: 'platform-no-app-import',
      severity: 'error',
      comment: `platform 不可引用任何 app（${platformIds.join('、')} 都算 platform）。`,
      from: { path: `(^|/)apps/(?:${platformIds.join('|')})/` },
      to: { path: `(^|/)apps/(?!(?:${platformIds.join('|')})/)[^/]+/` },
    });
  }

  for (const packageId of layout.packageIds) {
    const entries = layout.packageEntries?.[packageId] ?? ['index.ts', 'src/index.ts'];
    const allowed = entries.map((entry) => entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

    rules.push({
      name: `package-deep-import-${packageId}`,
      severity: 'error',
      // 公開入口由 package.json 的 exports 決定（見 publicEntries），不是寫死一份名單。
      // 要新增公開入口，就改 package.json 的 exports —— 這裡會自動跟着，
      // 兩邊各寫一份就會有一天對不上。
      comment: `package 只可經 package.json 宣告的公開入口被引用，不可引用 ${packageId} 的其他檔案。`,
      from: { pathNot: `(^|/)packages/${packageId}/` },
      to: { path: `(^|/)packages/${packageId}/(?!(?:${allowed})$)` },
    });
  }

  for (const [appId, modules] of Object.entries(layout.moduleIds)) {
    for (const moduleId of modules) {
      rules.push({
        name: `module-deep-import-${appId}-${moduleId}`,
        severity: 'error',
        comment: `模組只可經 index.ts 被引用，不可引用 ${appId}/${moduleId} 的子資料夾。`,
        from: { pathNot: `(^|/)apps/${appId}/src/modules/${moduleId}/` },
        to: { path: `(^|/)apps/${appId}/src/modules/${moduleId}/(?!index\\.ts$)` },
      });
    }
  }

  rules.push({
    name: 'no-circular',
    severity: 'error',
    comment: '不允許循環依賴。',
    from: {},
    to: { circular: true },
  });

  rules.push({
    name: 'layer-web-no-domain-db',
    severity: 'error',
    comment: '分層方向只可以 web → api → domain → db，web 不可跳過 api 直接引用 domain 或 db。',
    from: { path: '(^|/)src/web/' },
    to: { path: '(^|/)src/(?:domain|db)/' },
  });

  rules.push({
    name: 'layer-domain-no-framework',
    severity: 'error',
    comment: 'domain 必須是純邏輯，不可引用 fastify、pg、react。',
    from: { path: '(^|/)src/domain/' },
    to: { path: '(^|/)node_modules/(?:fastify|pg|react|react-dom)/' },
  });

  rules.push({
    name: 'layer-api-no-web',
    severity: 'error',
    comment: 'api 不可引用 web（分層方向不可反轉）。',
    from: { path: '(^|/)src/api/' },
    to: { path: '(^|/)src/web/' },
  });

  return rules;
}

/** 掃描選項：不跟進 node_modules，只看 TypeScript／JavaScript 的 import 關係。 */
export function cruiseOptions() {
  return {
    doNotFollow: { path: '(^|/)node_modules/' },
    // 只排除建置產物。node_modules 必須留在圖內（用 doNotFollow 不跟進去），
    // 否則「domain 引用 fastify」這種違規會連依賴本身都消失，規則永遠咬不到。
    exclude: { path: '(^|/)(?:dist|coverage)/' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  };
}

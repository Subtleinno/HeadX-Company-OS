import { readdirSync } from 'node:fs';
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

/** 資料夾名即 id；不符格式的（例如 .DS_Store、README）不當成 app／package。 */
const ID_PATTERN = /^[a-z][a-z0-9_]*$/;

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

/** 讀出一個根目錄的結構：有哪些 app、哪些 package、每個 app 有哪些模組。 */
export function discoverLayout(root) {
  const appIds = subdirectories(resolve(root, 'apps'));
  const packageIds = subdirectories(resolve(root, 'packages'));

  const moduleIds = {};
  for (const appId of appIds) {
    const modules = subdirectories(resolve(root, 'apps', appId, 'src', 'modules'));
    if (modules.length > 0) {
      moduleIds[appId] = modules;
    }
  }

  return { appIds, packageIds, moduleIds };
}

/** 合併多個根目錄的結構（fixtures 的 violations 與 clean 各有自己的 app）。 */
export function mergeLayouts(...layouts) {
  const appIds = new Set();
  const packageIds = new Set();
  const moduleIds = {};

  for (const layout of layouts) {
    for (const appId of layout.appIds) {
      appIds.add(appId);
    }
    for (const packageId of layout.packageIds) {
      packageIds.add(packageId);
    }
    for (const [appId, modules] of Object.entries(layout.moduleIds)) {
      const merged = new Set([...(moduleIds[appId] ?? []), ...modules]);
      moduleIds[appId] = [...merged].sort();
    }
  }

  return { appIds: [...appIds].sort(), packageIds: [...packageIds].sort(), moduleIds };
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
    rules.push({
      name: `package-deep-import-${packageId}`,
      severity: 'error',
      comment: `package 只可經 index.ts 被引用，不可引用 ${packageId} 的子資料夾。`,
      from: { pathNot: `(^|/)packages/${packageId}/` },
      to: { path: `(^|/)packages/${packageId}/(?!index\\.ts$)` },
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

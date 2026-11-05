import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RESERVED_ROUTES, validateManifest } from '../src/index';

/**
 * 保留路由（issue #79 第 2 項）。
 *
 * 為甚麼要這一組：入口（nginx）已經把 `/api/`、`/healthz` 當成自己的路徑，
 * 平台的健康檢查用 `/healthz`、儲存空間走 `/files`。如果哪天有人開一個 route 是
 * `/api` 的 app，它的前端會經 `/api/*` 被反向代理到 API 去 —— 頁面永遠打不開，
 * 而 lint、test、build 全部照樣綠。這一組就是要把「抄到別人地盤」變成啟動前的錯。
 *
 * 判斷方式：route 等於保留路徑，或者位於它之下（`/api/x`）就算撞。
 * `/apix`、`/api-docs` 這種同字首但不是同一段的不算 —— 用字串前綴比對會誤殺。
 */

function validate(route: string) {
  return validateManifest('sales', {
    id: 'sales',
    title: '業務',
    kind: 'department',
    department: 'sales',
    order: 40,
    available: false,
    route,
    exposure: 'internal',
    sensitive: false,
  });
}

describe('保留路由清單本身', () => {
  it('七個保留路徑都在，而且是 / 開頭、沒有結尾斜線', () => {
    expect([...RESERVED_ROUTES]).toEqual([
      '/api',
      '/auth',
      '/healthz',
      '/livez',
      '/health',
      '/assets',
      '/files',
    ]);
  });
});

describe('撞到保留路由：驗證必須失敗', () => {
  it('route 就是 /api', () => {
    const result = validate('/api');

    expect(result.manifest).toBeUndefined();
    expect(result.errors.join('\n')).toContain('保留');
    expect(result.errors.join('\n')).toContain('/api');
  });

  it('route 在保留路徑之下：/api/x', () => {
    const result = validate('/api/x');

    expect(result.manifest).toBeUndefined();
    expect(result.errors.join('\n')).toContain('保留');
  });

  it('route 是 /health', () => {
    const result = validate('/health');

    expect(result.manifest).toBeUndefined();
    expect(result.errors.join('\n')).toContain('保留');
  });

  it('每一條保留路徑本身及其下一層都會被擋', () => {
    for (const reserved of RESERVED_ROUTES) {
      expect(validate(reserved).errors.length, reserved).toBeGreaterThan(0);
      expect(validate(`${reserved}/detail`).errors.length, reserved).toBeGreaterThan(0);
    }
  });

  it('結尾多一個斜線也算撞（/api/ 與 /api 是同一個入口）', () => {
    expect(validate('/api/').errors.length).toBeGreaterThan(0);
  });

  it('錯誤訊息指出是哪一個保留路徑，不是只說「不對」', () => {
    const message = validate('/files/invoice').errors.join('\n');

    expect(message).toContain('/files');
    expect(message).toContain('apps/sales/manifest.json');
  });
});

describe('只是同字首的不算撞', () => {
  it('/apix、/api-docs、/health-check、/assets2 全部合格', () => {
    for (const route of ['/apix', '/api-docs', '/health-check', '/assets2', '/files-app']) {
      expect(validate(route).errors, route).toEqual([]);
    }
  });

  it('一般的部門路徑照樣合格', () => {
    expect(validate('/sales').errors).toEqual([]);
  });
});

describe('repo 內六個真正的 manifest 全部合格', () => {
  const repoApps = resolve(process.cwd(), 'apps');
  const folders = readdirSync(repoApps, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => {
      try {
        readFileSync(join(repoApps, entry.name, 'manifest.json'), 'utf8');
        return true;
      } catch {
        return false;
      }
    })
    .map((entry) => entry.name)
    .sort();

  it('找得到六個 manifest（不是空集合通過）', () => {
    expect(folders).toEqual(['boss', 'design', 'hr', 'ops_finance', 'sales', 'support']);
  });

  it('六個的 route 都沒有撞到保留路徑，保留路由這個閘門不會擋住現有 app', () => {
    for (const folder of folders) {
      const record = JSON.parse(
        readFileSync(join(repoApps, folder, 'manifest.json'), 'utf8'),
      ) as Record<string, unknown>;

      expect(validateManifest(folder, record).errors, folder).toEqual([]);
    }
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  APP_ROOT,
  ID_PATTERN,
  validateManifest,
  validateManifests,
  type ModuleExposure,
  type ModuleManifest,
  type RawManifest,
} from '@company-os/contracts';
import { AppHostError } from './config';

/**
 * 決定這個 app-host 要載入哪些 app，並在**任何 app 都未載入之前**把全部問題找出來。
 *
 * 為甚麼要先驗完：app-host 是同一個容器裝多個 app，如果載入了第一個才發現第二個
 * 的 manifest 壞，容器已經開始服務一半的 app —— 那是一個說不出「我有幾個 app」的狀態。
 * 所以這裡一次過驗到底，有任何問題就一併列出並拒絕啟動。
 */

export type LoadedApp = {
  manifest: ModuleManifest;
  /** app 的根目錄（APPS_DIR/<id>）。 */
  dir: string;
};

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function selectApps(appIds: readonly string[], appsDir: string): LoadedApp[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const raws: RawManifest[] = [];
  const loaded: LoadedApp[] = [];

  for (const appId of appIds) {
    if (seen.has(appId)) {
      errors.push(`APP_SET 內有重複的 id：${appId}（同一個 app 只可以載入一次）`);
      continue;
    }
    seen.add(appId);

    if (!ID_PATTERN.test(appId)) {
      errors.push(
        `APP_SET 內的 id 格式不對：${appId}（只可以小寫英文字母、數字、底線，並以字母開頭）`,
      );
      continue;
    }

    const dir = join(appsDir, appId);
    const file = join(dir, 'manifest.json');

    if (!existsSync(file)) {
      errors.push(`找不到 app：${APP_ROOT}/${appId}/manifest.json（APPS_DIR=${appsDir}）`);
      continue;
    }

    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch (error) {
      errors.push(`${APP_ROOT}/${appId}/manifest.json：讀不到（${describe(error)}）`);
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      errors.push(`${APP_ROOT}/${appId}/manifest.json：不是合法的 JSON（${describe(error)}）`);
      continue;
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      errors.push(`${APP_ROOT}/${appId}/manifest.json：最外層必須是一個物件`);
      continue;
    }

    const record = parsed as Record<string, unknown>;
    raws.push({ folder: appId, record });

    const result = validateManifest(appId, record);
    errors.push(...result.errors);

    if (result.manifest !== undefined) {
      loaded.push({ manifest: result.manifest, dir });
    }
  }

  // 跨 app 的重複（id／department／route）與 console 數量，訊息與 platform 完全一樣。
  errors.push(...validateManifests(raws));

  // C32：同一個容器只可以載入同一種 exposure 的 app。
  if (loaded.length > 1) {
    const first = loaded[0] as LoadedApp;
    for (const item of loaded.slice(1)) {
      if (item.manifest.exposure !== first.manifest.exposure) {
        errors.push(
          `${APP_ROOT}/${first.manifest.id} 與 ${APP_ROOT}/${item.manifest.id} 的 exposure 不同（${first.manifest.exposure} 與 ${item.manifest.exposure}）：同一個 app-host 只可以載入同一種 exposure 的 app`,
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new AppHostError(errors.join('\n'));
  }

  return loaded;
}

/** 這個 host 的 exposure；沒有 app 時回 null（空殼沒有曝露程度可言）。 */
export function exposureOf(apps: readonly LoadedApp[]): ModuleExposure | null {
  return apps[0]?.manifest.exposure ?? null;
}

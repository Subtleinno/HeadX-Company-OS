// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import './helpers/rtl';
import { useAppList } from '../src/frame/useAppList';
import {
  installFakeApi,
  jsonResponse,
  resetBrowserState,
  type FakeResponse,
} from './helpers/fake-api';

/**
 * F-03（issue #160）：共用 app 清單 hook 嘅時序契約。
 *
 * 重點係「舊回應不覆蓋新一輪讀取」（沿用 MyApps 嘅序號守衛），
 * 以及重試會換一個新序號。呢兩件事喺畫面層難以注入延遲，所以直接測 hook。
 */

const ONE = {
  id: 'sales',
  title: '銷售',
  kind: 'department',
  department: 'sales',
  order: 20,
  available: false,
};

const MANY = [
  { id: 'boss', title: '老闆台', kind: 'console', department: null, order: 0, available: false },
  ONE,
];

afterEach(() => {
  resetBrowserState();
});

describe('useAppList：序號守衛', () => {
  it('舊一輪慢回應不會蓋掉新一輪結果', async () => {
    let attempt = 0;
    let resolveOld: ((response: FakeResponse) => void) | null = null;
    const pending = new Promise<FakeResponse>((resolve) => {
      resolveOld = resolve;
    });

    installFakeApi({
      modules: () => {
        attempt += 1;

        // 第一輪掛起；之後每一輪即刻回一個 app。
        return attempt === 1 ? pending : jsonResponse(200, { modules: [ONE] });
      },
      appAccess: () => jsonResponse(200, { allowed: false, reason: 'app_disabled' }),
    });

    const { result } = renderHook(() => useAppList(true));

    // 觸發第二輪：即刻回一個 app。
    await act(async () => {
      result.current.reload();
    });

    await waitFor(() => {
      expect(result.current.list.kind).toBe('ready');
    });

    expect(result.current.list.kind === 'ready' && result.current.list.modules).toHaveLength(1);

    // 第一輪（較舊）呢刻先回，而且回兩個 app；序號守衛要擋住佢。
    await act(async () => {
      resolveOld?.(jsonResponse(200, { modules: MANY }));
    });

    expect(result.current.list.kind === 'ready' && result.current.list.modules).toHaveLength(1);
  });

  it('停用時不去讀 /modules', () => {
    const api = installFakeApi({
      modules: () => jsonResponse(200, { modules: MANY }),
      appAccess: () => jsonResponse(200, { allowed: false, reason: 'app_disabled' }),
    });

    renderHook(() => useAppList(false));

    expect(api.count('modules')).toBe(0);
  });
});

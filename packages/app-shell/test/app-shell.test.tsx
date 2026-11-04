// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useCallback } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AppShell,
  ConnectionErrorScreen,
  LoadingScreen,
  screenOf,
  useAuthGate,
  type AuthSnapshot,
} from '../src/index.js';

/**
 * app-shell 的測試（issue #73 驗收 3：登入狀態注入要有成功與失敗測試）。
 *
 * 這些斷言在 R3 之前不存在：那時「該顯示哪個畫面」寫死在 App.tsx 裡面，
 * 只能連同整個 app 一起測。抽成 package 之後，守衛本身要有自己的契約。
 */

afterEach(() => {
  cleanup();
});

describe('screenOf：狀態 → 畫面', () => {
  it('載入中', () => {
    expect(screenOf({ kind: 'loading' })).toBe('loading');
  });

  it('連不到', () => {
    expect(screenOf({ kind: 'unreachable' })).toBe('unreachable');
  });

  it('未開機 → setup', () => {
    expect(screenOf({ kind: 'ready', auth: { setupRequired: true, signedIn: false } })).toBe('setup');
  });

  it('已開機但未登入 → login', () => {
    expect(screenOf({ kind: 'ready', auth: { setupRequired: false, signedIn: false } })).toBe('login');
  });

  it('已登入且有使用者 → home', () => {
    expect(
      screenOf({
        kind: 'ready',
        auth: {
          setupRequired: false,
          signedIn: true,
          user: { id: 'u1', email: 'a@example.com', displayName: '陳大文', role: 'owner' },
        },
      }),
    ).toBe('home');
  });

  it('signedIn 為 true 但沒有 user，退回 login（不會顯示一個沒有名字的首頁）', () => {
    expect(screenOf({ kind: 'ready', auth: { setupRequired: false, signedIn: true } })).toBe('login');
  });
});

/** 測試用的注入點：回傳事先準備好的答案。 */
function Gate({ answer }: { answer: () => Promise<AuthSnapshot | null> }) {
  const loadState = useCallback(answer, [answer]);
  const { state, retry } = useAuthGate(loadState);

  return (
    <div>
      <span data-testid="screen">{screenOf(state)}</span>
      <button type="button" onClick={retry}>
        retry
      </button>
    </div>
  );
}

describe('useAuthGate：登入狀態由注入函數提供', () => {
  it('成功：注入的答案決定畫面', async () => {
    render(
      <Gate
        answer={async () => ({ setupRequired: false, signedIn: false })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('screen').textContent).toBe('login');
    });
  });

  it('失敗：注入函數回 null 時顯示「連不到」，不是空白頁', async () => {
    render(<Gate answer={async () => null} />);

    await waitFor(() => {
      expect(screen.getByTestId('screen').textContent).toBe('unreachable');
    });
  });

  it('只問一次：注入函數被呼叫一次，重試才再問一次', async () => {
    const answer = vi.fn(async () => null);

    render(<Gate answer={answer} />);

    await waitFor(() => {
      expect(screen.getByTestId('screen').textContent).toBe('unreachable');
    });

    expect(answer).toHaveBeenCalledTimes(1);

    screen.getByRole('button', { name: 'retry' }).click();

    await waitFor(() => {
      expect(answer).toHaveBeenCalledTimes(2);
    });
  });
});

describe('外殼元件', () => {
  it('LoadingScreen 有一句狀態而且 aria-busy', () => {
    render(<LoadingScreen />);

    expect(screen.getByText('載入中…')).toBeTruthy();
    expect(document.querySelector('main.screen')?.getAttribute('aria-busy')).toBe('true');
  });

  it('ConnectionErrorScreen 說真話，並提供重試', () => {
    let retried = 0;
    render(<ConnectionErrorScreen onRetry={() => (retried += 1)} />);

    expect(screen.getByRole('heading', { name: '無法連線到伺服器' })).toBeTruthy();
    screen.getByRole('button', { name: '重試' }).click();
    expect(retried).toBe(1);
  });

  it('AppShell 顯示品牌與帳戶，登出中會停用按鈕', () => {
    render(
      <AppShell displayName="陳大文" signingOut onSignOut={() => undefined}>
        <main className="home">內容</main>
      </AppShell>,
    );

    expect(screen.getByText('Company OS')).toBeTruthy();
    expect(screen.getByText('陳大文')).toBeTruthy();
    expect((screen.getByRole('button', { name: '登出' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import './helpers/rtl';
import { App } from '../src/App';
import { installFakeApi, jsonResponse, resetBrowserState, type FakeHandlers } from './helpers/fake-api';

/**
 * 登入落點（issue #14）。
 *
 * 三條規矩，每一條都要有自己的一個測試，因為它們是三個不同的事實：
 *   1. 老闆 → Boss Portal。
 *   2. 員工有部門 → 該部門的 app（route 由 `/modules` 講，不是前端寫死）。
 *   3. 員工冇部門／部門未開放 → 唔入任何 app，講清楚原因。
 *
 * 這裡全部由真 `App` + 真登入表單驅動：落點是「登入」這個動作的結果，
 * 不是某個元件自己猜的。
 */

const BOSS = {
  id: 'u-boss',
  email: 'boss@example.com',
  displayName: '陳老闆',
  role: 'owner',
  department: null,
  mustChangePassword: false,
};

const WAI = {
  id: 'u-wai',
  email: 'wai@example.com',
  displayName: '林慧',
  role: 'staff',
  department: 'design',
  mustChangePassword: false,
};

const DESIGN = {
  id: 'design',
  title: 'Design',
  kind: 'department',
  department: 'design',
  order: 10,
  available: true,
  route: '/design',
};

const HR = {
  id: 'hr',
  title: '人事',
  kind: 'department',
  department: 'hr',
  order: 40,
  available: false,
  route: '/hr',
};

/** 用真登入表單登入，回傳安裝好的假 API（方便斷言請求）。 */
async function signIn(
  user: typeof BOSS | typeof WAI,
  handlers: FakeHandlers = {},
): Promise<void> {
  window.history.replaceState(null, '', '/#/login');

  installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: false }),
    login: () => jsonResponse(200, { user }),
    modules: () => jsonResponse(200, { modules: [] }),
    ...handlers,
  });

  render(<App />);

  await userEvent.type(await screen.findByLabelText('電郵'), user.email);
  await userEvent.type(screen.getByLabelText('密碼'), 'correct-horse-battery');
  await userEvent.click(screen.getByRole('button', { name: '登入' }));
}

afterEach(() => {
  cleanup();
  resetBrowserState();
});

describe('登入落點', () => {
  it('老闆登入之後直接去 Boss Portal', async () => {
    await signIn(BOSS);

    await waitFor(() => {
      expect(window.location.hash).toBe('#/boss');
    });
  });

  it('員工登入之後去自己部門的 app，route 由 /modules 講', async () => {
    await signIn(WAI, { modules: () => jsonResponse(200, { modules: [DESIGN] }) });

    await waitFor(() => {
      expect(window.location.hash).toBe('#/design');
    });
  });

  it('員工冇部門：唔入任何 app，如實講原因，並且可以登出', async () => {
    await signIn({ ...WAI, department: null });

    const gate = await waitFor(() => {
      const node = document.querySelector('[data-gate="no-department"]');
      expect(node).not.toBeNull();

      return node as HTMLElement;
    });

    expect(within(gate).getByText('你未獲指派部門')).toBeTruthy();

    // 由這裡登出要真的可行：一個被困住的人最需要的就是離開。
    await userEvent.click(within(gate).getByRole('button', { name: '登出' }));
  });

  it('員工的部門 app 未開放：講明是「未開放」，唔會當成冇部門', async () => {
    await signIn({ ...WAI, department: 'hr' }, { modules: () => jsonResponse(200, { modules: [HR] }) });

    const gate = await waitFor(() => {
      const node = document.querySelector('[data-gate="department-closed"]');
      expect(node).not.toBeNull();

      return node as HTMLElement;
    });

    expect(within(gate).getByText('你嘅部門 app 仲未開放')).toBeTruthy();
    // 用 manifest 的 title 講部門名，唔顯示 hr 這個 key。
    expect(gate.textContent).toContain('人事');
  });
});

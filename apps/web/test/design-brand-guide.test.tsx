// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './helpers/rtl';

/**
 * 每頁頂部的「這一頁」（issue #53，v2.1）。
 *
 * 這一版要證明五件事：
 *   1. 三段都在，而且**預設收起** —— 一打開見到三行摘要，不是一屏說明文字。
 *   2. 平台／圖像／範例有自己的名與自己的槽，不再被當成自定義頁。
 *   3. 引用清單對稱：色彩頁講得出被標誌、字體、主頁、圖像用。
 *   4. 策略只有老闆見到編輯鍵；員工見到同一份正文，但見到「只有老闆可以改」。
 *   5. 給 agent 的是一句人話，**沒有 HTTP 方法、路徑與 JSON**。
 */

const mocks = vi.hoisted(() => ({
  fetchPolicy: vi.fn(),
  savePolicyVersion: vi.fn(),
}));

vi.mock('../src/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/api')>();

  return {
    ...actual,
    fetchPolicy: () => mocks.fetchPolicy(),
    savePolicyVersion: (...args: unknown[]) => mocks.savePolicyVersion(...args),
  };
});

const { BrandPageGuide } = await import('../src/design/BrandPageGuide');

const COLOR_V3 = {
  id: 'v3',
  versionNo: 3,
  createdAt: '2026-11-12T02:20:00.000Z',
  note: null,
  preview: '九個角色',
  policyVersionNo: 3,
  changed: [],
};

const COLOR_POLICY = {
  id: 'pv-color-3',
  versionNo: 3,
  createdAt: '2026-11-11T09:00:00.000Z',
  note: null,
  preview: '每一個色都要有角色。',
  content: '每一個色都要有角色。分品牌色、閱讀色、功能色，不准混用。',
};

function slotsFixture(): unknown {
  return {
    slots: [
      { slot: 'platform', current: null, versions: [] },
      { slot: 'home', current: null, versions: [] },
      { slot: 'logo', current: null, versions: [] },
      { slot: 'color', current: COLOR_POLICY, versions: [COLOR_POLICY] },
      { slot: 'type', current: null, versions: [] },
      { slot: 'tone', current: null, versions: [] },
      { slot: 'image', current: null, versions: [] },
      { slot: 'apply', current: null, versions: [] },
      { slot: 'custom', current: null, versions: [] },
    ],
  };
}

beforeEach(() => {
  mocks.fetchPolicy.mockResolvedValue({ ok: true, data: slotsFixture() });
  mocks.savePolicyVersion.mockResolvedValue({
    ok: true,
    data: { version: { ...COLOR_POLICY, id: 'pv-4', versionNo: 4 } },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function open(
  container: HTMLElement,
  section: 'state' | 'policy' | 'agent',
): Promise<void> {
  const button = container.querySelector(`[data-guide-toggle="${section}"]`);

  if (button === null) {
    throw new Error(`找不到 ${section} 的展開鍵`);
  }

  await userEvent.setup().click(button as HTMLElement);
}

function renderGuide(overrides: Partial<Parameters<typeof BrandPageGuide>[0]> = {}) {
  return render(
    <BrandPageGuide
      pageKey="color"
      current={COLOR_V3}
      gapCount={6}
      isOwner
      brandName="Moonic 滿月堂"
      {...overrides}
    />,
  );
}

describe('「這一頁」面板', () => {
  it('三段都在，但預設收起：內容未展開時不畫', () => {
    const { container } = renderGuide();

    expect(container.querySelector('[data-guide-section="state"]')).not.toBeNull();
    expect(container.querySelector('[data-guide-section="policy"]')).not.toBeNull();
    expect(container.querySelector('[data-guide-section="agent"]')).not.toBeNull();

    expect(container.querySelector('[data-guide-current]')).toBeNull();
    expect(container.querySelector('[data-guide-policy-body]')).toBeNull();
    expect(container.querySelector('[data-guide-instruction]')).toBeNull();
  });

  it('三個展開鍵都在，按下去只開自己那一段', async () => {
    const { container } = renderGuide();

    expect(container.querySelectorAll('[data-guide-toggle]')).toHaveLength(3);

    await open(container, 'state');

    expect(container.querySelector('[data-guide-current]')).not.toBeNull();
    expect(container.querySelector('[data-guide-instruction]')).toBeNull();
  });

  it('現況：版本、缺口數、用哪一版策略', async () => {
    const { container } = renderGuide();
    await open(container, 'state');

    expect(container.querySelector('[data-guide-current]')?.getAttribute('data-guide-current')).toBe(
      '3',
    );
    expect(container.querySelector('[data-guide-gaps]')?.getAttribute('data-guide-gaps')).toBe('6');
    expect(container.querySelector('[data-guide-policy-used]')?.textContent).toContain('第 3 版');
  });

  it('現況：色彩頁講明被標誌、字體、主頁、圖像與自定義頁用', async () => {
    const { container } = renderGuide();
    await open(container, 'state');

    const usedBy = container.querySelector('[data-guide-used-by]')?.textContent ?? '';

    expect(usedBy).toContain('標誌');
    expect(usedBy).toContain('字體');
    expect(usedBy).toContain('品牌主頁');
    expect(usedBy).toContain('圖像');
    expect(usedBy).toContain('自定義頁');
  });

  it('平台頁：有自己的槽與名，引用清單是「不引用其他頁」', async () => {
    const { container } = renderGuide({ pageKey: 'platform', current: null, gapCount: 6 });
    expect(container.querySelector('[data-guide-slot]')?.getAttribute('data-guide-slot')).toBe(
      'platform',
    );

    await open(container, 'state');

    expect(container.querySelector('[data-guide-uses]')?.textContent).toContain(
      '這一頁不引用其他頁',
    );
  });

  it('範例頁用 apply 槽，不被當成自定義頁', () => {
    const { container } = renderGuide({ pageKey: 'examples', current: null, gapCount: 0 });

    expect(container.querySelector('[data-guide-slot]')?.getAttribute('data-guide-slot')).toBe(
      'apply',
    );
  });

  it('未有版本時講「還沒有版本」，不畫一個假的第 0 版', async () => {
    const { container } = renderGuide({ current: null });
    await open(container, 'state');

    expect(container.querySelector('[data-guide-current]')?.getAttribute('data-guide-current')).toBe(
      'none',
    );
    expect(container.querySelector('[data-guide-current]')?.textContent).toContain('還沒有版本');
  });

  it('老闆：見到策略正文與「改策略（新增一版）」', async () => {
    const { container } = renderGuide();
    await open(container, 'policy');

    expect(container.querySelector('[data-guide-policy-body]')?.textContent).toContain(
      '每一個色都要有角色',
    );
    expect(container.querySelector('[data-guide-policy-edit]')).not.toBeNull();
  });

  it('員工：讀到同一份正文，但沒有編輯鍵，改為講「只有老闆可以改」', async () => {
    const { container } = renderGuide({ isOwner: false });
    await open(container, 'policy');

    expect(container.querySelector('[data-guide-policy-body]')?.textContent).toContain(
      '每一個色都要有角色',
    );
    expect(container.querySelector('[data-guide-policy-edit]')).toBeNull();
    expect(container.querySelector('[data-guide-policy-owner-only]')?.textContent).toContain(
      '只有老闆可以改',
    );
  });

  it('槽未有策略：講缺，不畫一個空的第 1 版', async () => {
    const { container } = renderGuide({ pageKey: 'type' });
    await open(container, 'policy');

    expect(container.querySelector('[data-guide-policy-missing]')).not.toBeNull();
    expect(container.querySelector('[data-guide-policy-body]')).toBeNull();
  });

  it('儲存策略：打的就是這一個槽的版本端點', async () => {
    const { container } = renderGuide();
    await open(container, 'policy');

    await userEvent.setup().click(container.querySelector('[data-guide-policy-edit]') as HTMLElement);

    const box = container.querySelector('textarea') as HTMLTextAreaElement;
    await userEvent.setup().clear(box);
    await userEvent.setup().type(box, '新的色彩標準。');

    await userEvent.setup().click(container.querySelector('[data-guide-policy-save]') as HTMLElement);

    expect(mocks.savePolicyVersion).toHaveBeenCalledWith('color', { content: '新的色彩標準。' });
  });

  it('agent 段：三件可以、兩件不可以，指令是沒有 HTTP 的人話', async () => {
    const { container } = renderGuide();
    await open(container, 'agent');

    const allowed = [...container.querySelectorAll('[data-guide-agent="allowed"] [data-guide-ability]')].map(
      (node) => node.getAttribute('data-guide-ability'),
    );
    const blocked = [...container.querySelectorAll('[data-guide-agent="blocked"] [data-guide-ability]')].map(
      (node) => node.getAttribute('data-guide-ability'),
    );

    expect(allowed.sort()).toEqual(['read', 'readPolicy', 'write']);
    expect(blocked.sort()).toEqual(['noDelete', 'noPolicy']);

    const instruction = container.querySelector('[data-guide-instruction]')?.textContent ?? '';

    expect(instruction).toContain('Moonic 滿月堂');
    expect(instruction).not.toContain('/api/');
    expect(instruction).not.toContain('POST');
  });

  it('收起之後那一段的內容消失，再按一次回來', async () => {
    const { container } = renderGuide();
    await open(container, 'state');

    expect(container.querySelector('[data-guide-current]')).not.toBeNull();

    await open(container, 'state');

    expect(container.querySelector('[data-guide-current]')).toBeNull();
  });

  it('策略段永遠有一句「要改標準，到 Boss Portal 的策略」', async () => {
    const { container } = renderGuide();
    await open(container, 'policy');

    expect(container.querySelector('[data-guide-policy-portal]')?.textContent).toContain(
      'Boss Portal',
    );
  });

  it('頁名不是原樣印出鍵', () => {
    renderGuide({ pageKey: 'image', current: null });

    expect(screen.queryByText('image')).toBeNull();
  });
});

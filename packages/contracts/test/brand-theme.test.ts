import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND_THEME, parseBrandTheme, sameBrandTheme } from '../src/brand/theme.ts';

/**
 * 品牌主題的驗證。
 *
 * 兩件事要同時成立：改一個色不可以失敗（最常見的用法），但打錯色碼要即刻
 * 拒絕 —— 靜靜換回預設，人會以為改咗，畫面卻冇反應。
 */

describe('parseBrandTheme', () => {
  it('完整的八個色照收，色碼統一小寫（同一個色不應該有兩種寫法）', () => {
    const parsed = parseBrandTheme({
      color: {
        paper: '#F6F3FE',
        surface: '#FFFFFF',
        ink: '#1F1B2D',
        muted: '#5E5970',
        line: '#E3DFEE',
        accent: '#4A5396',
        accentInk: '#FFFFFF',
        accentSoft: '#DADEF8',
      },
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.value.color.paper).toBe('#f6f3fe');
    expect(parsed.value.color.accent).toBe('#4a5396');
  });

  it('只送一個色：其餘補預設，不是整份失敗', () => {
    const parsed = parseBrandTheme({ color: { accent: '#ff0000' } });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.value.color.accent).toBe('#ff0000');
    expect(parsed.value.color.paper).toBe(DEFAULT_BRAND_THEME.color.paper);
    expect(parsed.value.shape.radius).toBe(DEFAULT_BRAND_THEME.shape.radius);
  });

  it('打錯的色碼要拒絕，並講出是哪一格', () => {
    const parsed = parseBrandTheme({ color: { ink: 'navy' } });

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;

    expect(parsed.reason).toContain('color.ink');
  });

  it('#RGB 三碼色照收（設計師手寫的短碼很常見）', () => {
    const parsed = parseBrandTheme({ color: { ink: '#111' } });

    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.color.ink).toBe('#111');
  });

  it('漸變：可以沒有；有就要兩個色與 0–360 的角度', () => {
    expect(parseBrandTheme({ wash: null }).ok).toBe(true);

    const ok = parseBrandTheme({ wash: { from: '#ffffff', to: '#efeafb', angle: 175 } });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.wash).toEqual({ from: '#ffffff', to: '#efeafb', angle: 175 });

    expect(parseBrandTheme({ wash: { from: '#ffffff', to: '#efeafb', angle: 999 } }).ok).toBe(false);
    expect(parseBrandTheme({ wash: { from: 'white', to: '#efeafb', angle: 90 } }).ok).toBe(false);
  });

  it('字體只可以揀認得的 id，不然畫面會靜靜跌回系統字', () => {
    expect(parseBrandTheme({ font: { display: 'serif', body: 'system' } }).ok).toBe(true);
    expect(parseBrandTheme({ font: { display: 'comic' } }).ok).toBe(false);
  });

  it('圓角 0–24；超出範圍要拒絕', () => {
    expect(parseBrandTheme({ shape: { radius: 0 } }).ok).toBe(true);
    expect(parseBrandTheme({ shape: { radius: 24 } }).ok).toBe(true);
    expect(parseBrandTheme({ shape: { radius: 40 } }).ok).toBe(false);
    expect(parseBrandTheme({ shape: { radius: -1 } }).ok).toBe(false);
  });

  it('不是物件就拒絕', () => {
    expect(parseBrandTheme(null).ok).toBe(false);
    expect(parseBrandTheme('dark').ok).toBe(false);
  });
});

describe('sameBrandTheme', () => {
  it('同一份＝沒有未儲存的改動', () => {
    expect(sameBrandTheme(DEFAULT_BRAND_THEME, structuredClone(DEFAULT_BRAND_THEME))).toBe(true);
  });

  it('改一個色就係有改動', () => {
    const changed = structuredClone(DEFAULT_BRAND_THEME);
    changed.color.accent = '#4a5396';

    expect(sameBrandTheme(DEFAULT_BRAND_THEME, changed)).toBe(false);
  });
});

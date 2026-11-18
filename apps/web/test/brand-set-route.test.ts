import { describe, expect, it } from 'vitest';
import { parseBrandRoute } from '../src/design/BrandScreen';

/**
 * 品牌模組的網址解析。
 *
 * 這裡要鎖死三件事，因為三件都會影響「答案寫去邊」：
 *   1. 01–03、04A、04G 在品牌層：只有一份，跟品牌走。
 *   2. 04B–04E、04H 一定要帶品牌集 id：同一品牌可以有好幾套。
 *   3. 04F 不在這個 app（它在 Boss Portal › Marketing，公司層）。
 * 手改網址的人不應該得到一個共用答案的畫面。
 */
describe('品牌模組路由', () => {
  it('品牌總覽：dashboard 與不認識的段落都返總覽', () => {
    expect(parseBrandRoute(['dashboard'])).toEqual({ kind: 'overview' });
    expect(parseBrandRoute([])).toEqual({ kind: 'overview' });
    expect(parseBrandRoute(['nonsense'])).toEqual({ kind: 'overview' });
  });

  it('01–03 在品牌層：stage/<stage>', () => {
    expect(parseBrandRoute(['stage', 'stage1'])).toEqual({ kind: 'stage', stage: 'stage1' });
    expect(parseBrandRoute(['stage', 'stage3'])).toEqual({ kind: 'stage', stage: 'stage3' });
  });

  it('04A 核心識別與 04G 治理也在品牌層（2026-11-17 晚由品牌集搬回）', () => {
    expect(parseBrandRoute(['stage', 'stage4a'])).toEqual({ kind: 'stage', stage: 'stage4a' });
    expect(parseBrandRoute(['stage', 'stage4g'])).toEqual({ kind: 'stage', stage: 'stage4g' });
  });

  it('04F 行銷內容不屬於品牌模組：品牌層或品牌集都不開', () => {
    expect(parseBrandRoute(['stage', 'stage4f'])).toEqual({ kind: 'overview' });
    expect(parseBrandRoute(['sets', 'set-1', 'stage4f'])).toEqual({ kind: 'set', setId: 'set-1' });
  });

  it('品牌集：sets/<id> 與 sets/<id>/<stage>', () => {
    expect(parseBrandRoute(['sets', 'set-1'])).toEqual({ kind: 'set', setId: 'set-1' });
    expect(parseBrandRoute(['sets', 'set-1', 'stage4c'])).toEqual({
      kind: 'setStage',
      setId: 'set-1',
      stage: 'stage4c',
    });
  });

  it('品牌集裡只有 04B–04E、04H；帶住 01／04A／04G 或亂寫都退回該品牌集', () => {
    expect(parseBrandRoute(['sets', 'set-1', 'stage1'])).toEqual({ kind: 'set', setId: 'set-1' });
    expect(parseBrandRoute(['sets', 'set-1', 'stage4a'])).toEqual({ kind: 'set', setId: 'set-1' });
    expect(parseBrandRoute(['sets', 'set-1', 'stage4g'])).toEqual({ kind: 'set', setId: 'set-1' });
    expect(parseBrandRoute(['sets', 'set-1', 'oops'])).toEqual({ kind: 'set', setId: 'set-1' });
  });

  it('品牌集的那五個 stage 都開得', () => {
    for (const stage of ['stage4b', 'stage4c', 'stage4d', 'stage4e', 'stage4h'] as const) {
      expect(parseBrandRoute(['sets', 'set-1', stage])).toEqual({
        kind: 'setStage',
        setId: 'set-1',
        stage,
      });
    }
  });

  it('五層投影：layer/<kind> 六個層都開得，未知層退回總覽', () => {
    for (const layer of ['design-doc', 'tokens', 'templates', 'examples', 'checks', 'unfiled'] as const) {
      expect(parseBrandRoute(['layer', layer])).toEqual({ kind: 'layer', layer });
    }
    expect(parseBrandRoute(['layer', 'nonsense'])).toEqual({ kind: 'overview' });
  });
});

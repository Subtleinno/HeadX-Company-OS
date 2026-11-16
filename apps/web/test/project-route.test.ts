import { describe, expect, it } from 'vitest';
import { parseProjectRoute } from '../src/design/projectRoute';

/**
 * `#/design` 落點（空段）必須等於 Create 的 project 列表，而唔係
 * 一個「未提供」的 stub：用戶由 app selector 揀「Design」進入時，
 * 第一眼就應該見到真實作品。
 */
describe('parseProjectRoute 落點', () => {
  it('#/design（空段）落到 project 列表', () => {
    expect(parseProjectRoute([])).toEqual({ kind: 'list' });
  });

  it('#/design/create/projects 落到 project 列表', () => {
    expect(parseProjectRoute(['create', 'projects'])).toEqual({ kind: 'list' });
  });

  it('#/design/create/carousel 落到 carousel 列表', () => {
    expect(parseProjectRoute(['create', 'carousel'])).toEqual({ kind: 'list' });
  });

  it('project 詳情（合法 UUID）落到 detail', () => {
    expect(parseProjectRoute(['create', 'projects', '123e4567-e89b-12d3-a456-426614174000'])).toEqual({
      kind: 'detail',
      projectId: '123e4567-e89b-12d3-a456-426614174000',
    });
  });

  it('project 詳情（非法 ID）落到 invalid', () => {
    expect(parseProjectRoute(['create', 'projects', 'not-a-uuid'])).toEqual({ kind: 'invalid' });
  });
});

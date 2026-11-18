import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { brandGuideApi, companyGuideApi } from '../src/api';

/**
 * 引導端點的路徑閘門。
 *
 * 這一組存在的理由是一個真實的錯：`?setId=` 一度被拼在 `/blocks` 之前，實際
 * 送出的是 `…/guide/stage4b?setId=xxx/blocks`。伺服器只看到 `stage4b` 加一個
 * 空 query，於是品牌集裡面每一格都 404 —— 而品牌層沒有 query，所以 01–03、
 * 04A、04G 一直正常，看起來像「只有品牌集壞了」。
 *
 * 所以這裡不驗行為，只驗 URL：query string 只可以出現在最後。
 */

let urls: string[] = [];

beforeEach(() => {
  urls = [];
  vi.stubGlobal('fetch', async (path: string) => {
    urls.push(path);
    return new Response(JSON.stringify({ stage: 'stage4b', blocks: [], brief: null }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('guide endpoints 路徑', () => {
  it('品牌集：scope 只出現在最後，不會夾在 /blocks 之前', async () => {
    const api = brandGuideApi('brand-1', 'set-1');

    await api.blocks('stage4b');
    await api.brief('stage4b');
    await api.saveDecision('stage4b', 'cat:gradType', { code: '04B.1', title: '漸變', decision: '不用漸變' });
    await api.removeFile('stage4b', 'cat:gradType', 'att-1');

    expect(urls).toEqual([
      '/api/brands/brand-1/guide/stage4b/blocks?setId=set-1',
      '/api/brands/brand-1/guide/stage4b/brief?setId=set-1',
      '/api/brands/brand-1/guide/stage4b/blocks/cat%3AgradType/decision?setId=set-1',
      '/api/brands/brand-1/guide/stage4b/blocks/cat%3AgradType/files/att-1?setId=set-1',
    ]);
  });

  it('品牌層：沒有 setId 就不要多一個問號', async () => {
    const api = brandGuideApi('brand-1');

    await api.state('stage4a');
    await api.blocks('stage4a');

    expect(urls).toEqual(['/api/brands/brand-1/guide/stage4a/state', '/api/brands/brand-1/guide/stage4a/blocks']);
  });

  it('公司層 04F：沒有品牌也沒有品牌集', async () => {
    const api = companyGuideApi();

    await api.schema('stage4f');
    await api.savePrompt('stage4f', 'set:hook', { code: '04F.2', title: 'Hook', prompt: '寫三個 hook' });

    expect(urls).toEqual([
      '/api/company/guide/stage4f/schema',
      '/api/company/guide/stage4f/blocks/set%3Ahook/prompt',
    ]);
  });

  it('空字串 setId 視同品牌層（不會出現 setId=）', async () => {
    await brandGuideApi('brand-1', '').blocks('stage4b');

    expect(urls).toEqual(['/api/brands/brand-1/guide/stage4b/blocks']);
  });
});

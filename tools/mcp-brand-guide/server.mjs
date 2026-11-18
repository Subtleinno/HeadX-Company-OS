#!/usr/bin/env node
/**
 * HeadX 品牌引導 MCP server（stdio）。
 *
 * 為什麼要存在：卡片上的 prompt 只能叫 agent「講」，講完的結論要有人手動貼回
 * 系統，中間就會走樣。這個 server 把「讀這一格」與「寫回決策」變成工具，
 * 于是老闆在對話裡批准之後，agent 可以直接寫入同一份紀錄 —— 畫面與歷史
 * 即刻見到，不需要 copy & paste。
 *
 * 三個工具刻意對應三個動作：
 *   brand_block_list           睇一個 stage 有哪幾格、每格最後定了甚麼
 *   brand_block_get            睇一格的完整狀態（決策、歷史、附件清單）
 *   brand_block_save_decision  寫回決策（有變才留新版本）
 *
 * 認證：agent Bearer token（在 HeadX 的 agent 授權頁簽發），而且該 agent
 * 要有 `design` app 的有效授權。token 只經環境變數傳入，不寫進檔案。
 *
 * 執行：
 *   HEADX_API_BASE=http://127.0.0.1:4210/api \
 *   HEADX_AGENT_TOKEN=... node tools/mcp-brand-guide/server.mjs
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const API_BASE = (process.env.HEADX_API_BASE ?? 'http://127.0.0.1:4210/api').replace(/\/+$/, '');
const AGENT_TOKEN = process.env.HEADX_AGENT_TOKEN ?? '';

const STAGES = [
  'stage0',
  'stage1',
  'stage2',
  'stage3',
  'stage4a',
  'stage4b',
  'stage4c',
  'stage4d',
  'stage4e',
  'stage4f',
  'stage4g',
  'stage4h',
];

/** 一個工具成功／失敗都回同一種形狀：agent 讀得懂，唔會以為 text 就係成功。 */
function ok(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

function fail(message, detail) {
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ error: message, ...detail }, null, 2) }],
  };
}

async function call(method, path, body) {
  if (AGENT_TOKEN === '') {
    throw new Error('缺少 HEADX_AGENT_TOKEN：先在 HeadX「Agent 授權」簽發 token，再放進 MCP 設定。');
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${AGENT_TOKEN}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const text = await response.text();
  let parsed;

  try {
    parsed = text === '' ? {} : JSON.parse(text);
  } catch {
    parsed = { raw: text.slice(0, 400) };
  }

  if (!response.ok) {
    throw new Error(`HeadX API ${response.status}：${JSON.stringify(parsed)}`);
  }

  return parsed;
}

const blockProperties = {
  brandId: { type: 'string', description: '品牌 id（卡上 prompt 的 brand: 一行）' },
  stage: {
    type: 'string',
    enum: STAGES,
    description:
      '階段 id，例如 stage0、stage4b。04A 核心識別與 04G 治理在品牌層（唔要 setId）；04F 行銷內容屬公司層，不是品牌集。',
  },
  setId: {
    type: 'string',
    description:
      '品牌集 id（只限 04B–04E、04H）。同一品牌有幾套做法，唔講就係品牌層那一份。04A／04F／04G 帶 setId 會被 400 拒絕。',
  },
};

const server = new Server(
  { name: 'headx-brand-guide', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'brand_block_list',
      description:
        '列出一個 stage 的所有填寫區塊，包括位置編號、名稱、目前決策與最後更新時間。討論之前先用它確認要改哪一格。',
      inputSchema: {
        type: 'object',
        properties: blockProperties,
        required: ['brandId', 'stage'],
        additionalProperties: false,
      },
    },
    {
      name: 'brand_block_get',
      description:
        '讀一格的完整狀態：目前決策、決策歷史（每次有變留一版）、附件清單。要延續之前的共識，先讀這個。',
      inputSchema: {
        type: 'object',
        properties: {
          ...blockProperties,
          blockId: { type: 'string', description: '區塊代號，例如 set:basic、cat:pricing' },
        },
        required: ['brandId', 'stage', 'blockId'],
        additionalProperties: false,
      },
    },
    {
      name: 'brand_block_save_decision',
      description:
        '把討論好的結論寫回這一格。只在使用者明確批准之後才呼叫；寫入會留一版歷史，畫面即刻見到。',
      inputSchema: {
        type: 'object',
        properties: {
          ...blockProperties,
          blockId: { type: 'string', description: '區塊代號' },
          decision: {
            type: 'string',
            description: '三至五句結論，講埋為甚麼。空白會清走現況（歷史不刪）。',
          },
        },
        required: ['brandId', 'stage', 'blockId', 'decision'],
        additionalProperties: false,
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = request.params.arguments ?? {};

  try {
    switch (request.params.name) {
      case 'brand_block_list': {
        const query = new URLSearchParams({ brandId: String(args.brandId), stage: String(args.stage) });

        if (args.setId !== undefined) {
          query.set('setId', String(args.setId));
        }

        const data = await call('GET', `/agent/brand-guide/blocks?${query.toString()}`);

        return ok({
          stage: data.stage,
          setId: args.setId ?? null,
          blocks: (data.blocks ?? []).map((block) => ({
            blockId: block.blockId,
            code: block.code,
            title: block.title,
            decision: block.decision,
            decisionAt: block.decisionAt,
            decisionBy: block.decisionByName,
            revisions: block.revisions.length,
            files: block.files.filter((file) => file.removedAt === null).length,
          })),
        });
      }

      case 'brand_block_get': {
        const query = new URLSearchParams({ brandId: String(args.brandId), stage: String(args.stage) });

        if (args.setId !== undefined) {
          query.set('setId', String(args.setId));
        }

        const data = await call('GET', `/agent/brand-guide/blocks?${query.toString()}`);
        const block = (data.blocks ?? []).find((item) => item.blockId === args.blockId);

        if (block === undefined) {
          return fail('block_not_found', { blockId: args.blockId, stage: args.stage });
        }

        return ok(block);
      }

      case 'brand_block_save_decision': {
        const data = await call(
          'PUT',
          `/agent/brand-guide/blocks/${encodeURIComponent(String(args.blockId))}/decision`,
          {
            brandId: args.brandId,
            stage: args.stage,
            setId: args.setId,
            decision: args.decision,
          },
        );

        return ok({
          written: data.written,
          stage: data.stage,
          block: {
            blockId: data.block.blockId,
            code: data.block.code,
            title: data.block.title,
            decision: data.block.decision,
            decisionAt: data.block.decisionAt,
            decisionBy: data.block.decisionByName,
            revisions: data.block.revisions.length,
          },
          note:
            data.written === true
              ? '已寫入，並留了一版歷史。'
              : '內容與現況相同，沒有新版本。',
        });
      }

      default:
        return fail('unknown_tool', { name: request.params.name });
    }
  } catch (error) {
    return fail('request_failed', { message: error instanceof Error ? error.message : String(error) });
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);

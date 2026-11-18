import { t } from '@company-os/i18n';

/**
 * 範圍層 Prompt：品牌總覽（01–03）、一個品牌集（04B–04E、04H）、
 * 或者一個固定模組（04A 核心識別／04G 治理）。
 *
 * 為什麼要與卡片 prompt 分開：卡片 prompt 是「傾這一格」，一次只有一格；
 * 範圍 prompt 是「接手這一整份」，agent 要知三件事才不會做錯：
 *   1. 這個範圍有哪幾站、每站去到幾成；
 *   2. 已經定了的決策（連識別碼，寫回系統時對得位）；
 *   3. 未定的部分不要自己猜，用 MCP 工具去讀。
 *
 * 為什麼每一格都要自己的 `## 識別碼`：同一個品牌可以有幾套品牌集，
 * `04B.1` 在每一套都存在，而 `block_id`（例如 `set:tension`）在幾套之間
 * 完全一樣。只寫 brand/stage/block 的話，agent 分不出這一格屬於邊一套，
 * 寫回時就會改錯另一個品牌集。所以品牌集一定要帶 `set:` 那一行。
 *
 * 全部字串經 t()：這個檔案在 apps/web/src 之內，介面文字不可以寫死
 * （見 tools/i18n-guard）。
 */

/** 一格已經談成的決策。時間由呼叫端格式化好，這裡不碰 locale。 */
export type ScopePromptBlock = {
  blockId: string;
  /** 位置編號，例如 `04B.1`。 */
  code: string;
  title: string;
  decision: string;
  /** 已格式化的時間；沒有就 null。 */
  at: string | null;
  /** 誰寫的（人名或 agent 名）。 */
  by: string;
  actorType: 'human' | 'agent';
};

export type ScopePromptStage = {
  id: string;
  /** 兩位數的階段號，例如 `04B`。 */
  num: string;
  name: string;
  /** 只有已填決策的區塊；未填的不會出現在 prompt。 */
  blocks: readonly ScopePromptBlock[];
  /** brief 的進度；沒有 brief 就 null（整段進度不輸出）。 */
  progress?: { pct: number; missing: number } | null;
};

export type ScopePromptInput = {
  brand: { id: string; name: string };
  scope: {
    /** `brand`＝品牌總覽；`brand-set`＝一套做法；`stage`＝單一階段模組。 */
    kind: 'brand' | 'brand-set' | 'stage';
    /** 品牌集 id；其他 scope 是 null。 */
    setId: string | null;
    /** 品牌集名稱；其他 scope 是空字串。 */
    setName: string;
  };
  stages: readonly ScopePromptStage[];
};

export function buildScopePrompt(input: ScopePromptInput): string {
  const { brand, scope, stages } = input;
  const brandName = brand.name.trim() === '' ? t('brandBuild.scopePrompt.unnamedBrand') : brand.name.trim();
  const setName = scope.setName.trim() === '' ? t('brandBuild.block.prompt.setUnnamed') : scope.setName.trim();
  const isSet = scope.kind === 'brand-set' && scope.setId !== null;

  const range = [
    t('brandBuild.scopePrompt.range'),
    t('brandBuild.scopePrompt.rangeBrand', { name: brandName, id: brand.id }),
    scopeLine(scope, setName, stages),
    ...(isSet ? [t('brandBuild.scopePrompt.rangeSetNote')] : []),
    ...(stages.length > 0
      ? [t('brandBuild.scopePrompt.rangeStages', { stages: stages.map((stage) => stage.num).join('、') })]
      : []),
  ];

  const progress = stages.filter(
    (stage): stage is ScopePromptStage & { progress: { pct: number; missing: number } } =>
      stage.progress !== undefined && stage.progress !== null,
  );

  // 每格之前留一個空行：`## 識別碼` 是獨立小節，貼出去之後 Markdown 才不會
  // 把兩個標題黏成一段。
  const decided = stages.flatMap((stage) =>
    stage.blocks.flatMap((block) => [
      '',
      blockSection(stage, block, brand.id, isSet ? scope.setId : null, setName),
    ]),
  );

  const todoBody = isSet
    ? t('brandBuild.scopePrompt.todoBodySet', { setId: scope.setId ?? '' })
    : t('brandBuild.scopePrompt.todoBody');

  return [
    t('brandBuild.scopePrompt.intro', { brand: brandName }),
    '',
    ...range,
    '',
    ...(progress.length > 0
      ? [
          t('brandBuild.scopePrompt.progress'),
          ...progress.map((stage) =>
            t('brandBuild.scopePrompt.progressLine', {
              num: stage.num,
              name: stage.name,
              pct: String(stage.progress.pct),
              missing: String(stage.progress.missing),
            }),
          ),
          '',
        ]
      : []),
    t('brandBuild.scopePrompt.decided'),
    ...(decided.length === 0 ? [t('brandBuild.scopePrompt.decidedNone')] : decided),
    '',
    t('brandBuild.scopePrompt.todo'),
    todoBody,
    '',
    t('brandBuild.scopePrompt.rules'),
    t('brandBuild.scopePrompt.rulesBody'),
    '',
    t('brandBuild.scopePrompt.tasks'),
    '',
    t('brandBuild.scopePrompt.replyFormat'),
    '',
    t('brandBuild.scopePrompt.writeBack'),
    t('brandBuild.scopePrompt.toolName'),
    isSet
      ? t('brandBuild.scopePrompt.toolArgsSet', { brandId: brand.id, setId: scope.setId ?? '' })
      : t('brandBuild.scopePrompt.toolArgs', { brandId: brand.id }),
    t('brandBuild.scopePrompt.toolNote'),
  ].join('\n');
}

function scopeLine(
  scope: ScopePromptInput['scope'],
  setName: string,
  stages: readonly ScopePromptStage[],
): string {
  if (scope.kind === 'brand-set' && scope.setId !== null) {
    return t('brandBuild.scopePrompt.rangeSet', { name: setName, id: scope.setId });
  }

  const only = scope.kind === 'stage' ? stages[0] : undefined;

  return only === undefined
    ? t('brandBuild.scopePrompt.rangeBrandLayer')
    : t('brandBuild.scopePrompt.rangeStage', { num: only.num, name: only.name });
}

/**
 * 一格的完整段落。
 *
 * `## 識別碼：<編號> <名稱>` 是刻意每格重複一次：agent 貼回對話之後，
 * 段落之間可能被截斷或重排，識別碼跟著那一格走才對得回系統。
 */
function blockSection(
  stage: ScopePromptStage,
  block: ScopePromptBlock,
  brandId: string,
  setId: string | null,
  setName: string,
): string {
  const who =
    block.actorType === 'agent'
      ? t('brandBuild.block.prompt.agentWho', { name: block.by })
      : block.by;

  const decisionLine =
    block.at === null
      ? t('brandBuild.scopePrompt.decisionNoTime', { who, text: block.decision.trim() })
      : t('brandBuild.scopePrompt.decisionLine', {
          at: block.at,
          who,
          text: block.decision.trim(),
        });

  return [
    t('brandBuild.scopePrompt.ident', { code: block.code, title: block.title }),
    t('brandBuild.scopePrompt.identBrand', { id: brandId }),
    ...(setId === null ? [] : [t('brandBuild.scopePrompt.identSet', { id: setId, name: setName })]),
    t('brandBuild.scopePrompt.identStage', { id: stage.id }),
    t('brandBuild.scopePrompt.identBlock', { id: block.blockId }),
    '',
    decisionLine,
  ].join('\n');
}

import { t } from '@company-os/i18n';

/**
 * 區塊討論 Prompt：貼給已接 MCP 的 AI Agent。
 *
 * 為什麼不是一句「幫我傾下品牌」：Agent 要知三件事才做對事 ——
 *   1. 位置（第幾個 stage、第幾格、叫咩名），否則它會把全份品牌重做一次；
 *   2. 識別碼（brand / stage / block），寫回系統時靠這三個對位；
 *   3. 你已經揀了甚麼、還有甚麼未揀，否則它會建議一個你已經做過的決定。
 *
 * 文字全部經 t()：這個 module 在 apps/web/src 之內，介面文字不可以寫死
 * （見 tools/i18n-guard）。要改語氣就改字串表，不要改這裡的結構。
 */

/**
 * 列出幾多版舊決策。太多會把 prompt 撐長，agent 反而捉不到重點；
 * 只列最近幾版，其餘用「另有 n 版」帶過。
 */
const MAX_HISTORY_LINES = 5;

export type PromptField = {
  title: string;
  /** `choice` 單選、`multi` 多選、`scale` 刻度、`text` 自由文字。 */
  kind: 'choice' | 'multi' | 'scale' | 'text';
  /** 已選的顯示文字；未填就是空陣列。 */
  values: string[];
  /** 可以揀的項目（text 欄位為空）。 */
  options: string[];
};

/** 現況決策：這一格最後一次談成甚麼。 */
export type PromptDecision = {
  text: string;
  /** 已格式化的時間；沒有就 null。 */
  at: string | null;
  /** 誰寫的（人名或 agent 名）。 */
  by: string;
  actorType: 'human' | 'agent';
};

/** 之前談過的版本：由上一個版本排到更早，交給 agent 做延續而不是重來。 */
export type PromptHistoryEntry = {
  at: string;
  by: string;
  text: string;
  actorType: 'human' | 'agent';
};

export type BlockPromptInput = {
  brandName: string;
  brandId: string;
  /**
   * 品牌集 id／名稱：只有 04B–04E、04H 在品牌集之內才會有。
   *
   * 為什麼一定要帶：`block_id`（例如 `set:tension`）在每一套品牌集都一樣，
   * 只寫 brand／stage／block 的話，agent 寫回時會改錯另一套的同一格。
   */
  setId?: string | null;
  setName?: string;
  stageNum: string;
  stageName: string;
  stageId: string;
  code: string;
  title: string;
  blockId: string;
  fields: PromptField[];
  decision: PromptDecision;
  /** 已按時間倒序。 */
  history: PromptHistoryEntry[];
  /** 歷史總版數（可能多過列出條數）。 */
  historyTotal: number;
};

function kindLabel(kind: PromptField['kind']): string {  const map: Record<PromptField['kind'], string> = {
    choice: t('brandBuild.block.prompt.kind.choice'),
    multi: t('brandBuild.block.prompt.kind.multi'),
    scale: t('brandBuild.block.prompt.kind.scale'),
    text: t('brandBuild.block.prompt.kind.text'),
  };

  return map[kind];
}

function optionLine(field: PromptField): string {
  if (field.kind === 'text') {
    return t('brandBuild.block.prompt.textLine', { field: field.title });
  }

  return t('brandBuild.block.prompt.optionLine', {
    field: field.title,
    options: field.options.join('、'),
  });
}

/**
 * 砌一段完整、可以直接貼的 prompt。
 *
 * 已填與未填分開列：Agent 最常犯的錯是「重新建議一個已經定了的選項」，
 * 把已完成的部分獨立成一段就少一半這種回覆。
 *
 * 決策與歷史一定要帶：agent 要延續上一次的共識，不是每次由零開始。
 * 沒有這一段，它會把已經談好的結論當成「未決定」再問一次。
 */
export function buildBlockPrompt(input: BlockPromptInput): string {
  const brand = input.brandName.trim() === '' ? t('brandBuild.block.prompt.unnamed') : input.brandName.trim();
  const done = input.fields.filter((field) => field.values.length > 0);
  const todo = input.fields.filter((field) => field.values.length === 0);

  const doneBlock =
    done.length === 0
      ? t('brandBuild.block.prompt.noChoice')
      : done
          .map((field) =>
            t('brandBuild.block.prompt.filledLine', {
              field: field.title,
              kind: kindLabel(field.kind),
              values: field.values.join('、'),
            }),
          )
          .join('\n');

  const todoBlock =
    todo.length === 0
      ? t('brandBuild.block.prompt.allFilled')
      : todo.map((field) => t('brandBuild.block.prompt.todoLine', { field: field.title })).join('\n');

  const optionsBlock = input.fields.map((field) => optionLine(field)).join('\n');

  const decisionBlock =
    input.decision.text.trim() === ''
      ? t('brandBuild.block.prompt.decisionNone')
      : t('brandBuild.block.prompt.decisionLine', {
          at: input.decision.at ?? '',
          who:
            input.decision.actorType === 'agent'
              ? t('brandBuild.block.prompt.agentWho', { name: input.decision.by })
              : input.decision.by,
          text: input.decision.text.trim(),
        });

  const shown = input.history.slice(0, MAX_HISTORY_LINES);
  const hidden = input.historyTotal - shown.length;

  const historyBlock =
    input.historyTotal === 0
      ? t('brandBuild.block.prompt.historyNone')
      : shown
          .map((entry) =>
            t('brandBuild.block.prompt.historyLine', {
              at: entry.at,
              who:
                entry.actorType === 'agent'
                  ? t('brandBuild.block.prompt.agentWho', { name: entry.by })
                  : entry.by,
              text: entry.text,
            }),
          )
          .join('\n');

  return [
    t('brandBuild.block.prompt.intro', { brand }),
    '',
    t('brandBuild.block.prompt.position'),
    `${input.stageNum} ${input.stageName} · ${input.code} ${input.title}`,
    '',
    t('brandBuild.block.prompt.ids'),
    t('brandBuild.block.prompt.brand', { id: input.brandId }),
    ...(input.setId === null || input.setId === undefined
      ? []
      : [
          t('brandBuild.block.prompt.set', {
            id: input.setId,
            name:
              (input.setName ?? '').trim() === ''
                ? t('brandBuild.block.prompt.setUnnamed')
                : (input.setName ?? '').trim(),
          }),
        ]),
    t('brandBuild.block.prompt.stage', { id: input.stageId }),
    t('brandBuild.block.prompt.block', { id: input.blockId }),
    '',
    t('brandBuild.block.prompt.done'),
    doneBlock,
    '',
    t('brandBuild.block.prompt.todo'),
    todoBlock,
    '',
    t('brandBuild.block.prompt.options'),
    optionsBlock,
    '',
    t('brandBuild.block.prompt.decision'),
    decisionBlock,
    '',
    t('brandBuild.block.prompt.historyCount', { n: String(input.historyTotal) }),
    historyBlock,
    ...(hidden > 0 ? [t('brandBuild.block.prompt.historyMore', { n: String(hidden) })] : []),
    '',
    t('brandBuild.block.prompt.rules'),
    t('brandBuild.block.prompt.rulesBody'),
    '',
    t('brandBuild.block.prompt.tasks'),
    '',
    t('brandBuild.block.prompt.replyFormat'),
    '',
    t('brandBuild.block.prompt.writeBack'),
    t('brandBuild.block.prompt.toolName'),
    input.setId === null || input.setId === undefined
      ? t('brandBuild.block.prompt.toolArgs', {
          brandId: input.brandId,
          stageId: input.stageId,
          blockId: input.blockId,
        })
      : t('brandBuild.block.prompt.toolArgsSet', {
          brandId: input.brandId,
          stageId: input.stageId,
          setId: input.setId,
          blockId: input.blockId,
        }),
    t('brandBuild.block.prompt.toolNote'),
  ].join('\n');
}

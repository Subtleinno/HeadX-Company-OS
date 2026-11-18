/**
 * AI Agent 匯出：只帶「已經有人做過的決定」同「已經放低嘅檔案」。
 *
 * 為什麼不是整階段 brief＋state：
 *   1. 老闆無打算一次填滿一版。把未填的欄位、選項庫、預設值一齊倒出去，
 *      agent 會以為那些是「已定的事」，或者反過來問一堆老闆未想答的問題。
 *   2. 那份 JSON 很長，貼進對話就吃掉一大截 context，真正有用的幾句反而被淹沒。
 *   3. 卡片上的 Prompt 已經負責「逐格討論」；這個面板是「你做完的部分，
 *      交給 agent 接手」，所以只應該有做完的部分。
 *
 * 檔案要連位置一起給：agent 拿到 `url` 才真的讀得到，只有檔名等於沒給。
 *
 * 全部是純函式（origin 由呼叫端傳入），可以在 node 測試裡直接跑。
 */

export type AgentInputSection = {
  blockId: string;
  /** 位置編號，例如 `01.3`。 */
  code: string;
  title: string;
};

export type AgentInputFile = {
  fileId: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  uploadedByName: string;
  createdAt: string;
  /** 非 null 代表已移除，不會出現在匯出裡。 */
  removedAt: string | null;
};

export type AgentInputBlock = {
  decision: string;
  decisionAt: string | null;
  decisionByName: string | null;
  decisionActorType: 'human' | 'agent';
  files: AgentInputFile[];
};

export type AgentInputContext = {
  brandId: string;
  brandName: string;
  stageId: string;
  /** 兩位數的階段號，例如 `01`。 */
  stageNum: string;
  stageName: string;
};

export type AgentInput = {
  brand: { id: string; name: string };
  stage: { id: string; code: string; name: string };
  decisions: {
    block: string;
    title: string;
    decision: string;
    by: string;
    byType: 'human' | 'agent';
    at: string | null;
  }[];
  files: {
    block: string;
    title: string;
    fileId: string;
    name: string;
    type: string;
    bytes: number;
    uploadedBy: string;
    uploadedAt: string;
    url: string;
  }[];
};

/** 檔案位置。agent 直接用這條去讀，不需要知我們的內部路由。 */
export function agentFileUrl(origin: string, fileId: string): string {
  return `${origin.replace(/\/+$/, '')}/api/files/${encodeURIComponent(fileId)}`;
}

export function buildAgentInput(input: {
  context: AgentInputContext;
  sections: readonly AgentInputSection[];
  blocks: Readonly<Record<string, AgentInputBlock | undefined>>;
  /** 例如 `https://headx.example.com`；用來砌檔案位置。 */
  origin: string;
}): AgentInput {
  const { context, sections, blocks, origin } = input;
  const collected = collect(
    sections.map((section) => ({
      code: section.code,
      title: section.title,
      block: blocks[section.blockId],
    })),
    origin,
  );

  return {
    brand: { id: context.brandId, name: context.brandName },
    stage: {
      id: context.stageId,
      code: context.stageNum,
      name: context.stageName,
    },
    decisions: collected.decisions,
    files: collected.files,
  };
}

/* ── 整個範圍（品牌總覽／一個品牌集）───────────────────── */

/**
 * 一次匯出多個階段：品牌總覽（01–03）或者一個品牌集（04B–04E、04H）。
 *
 * 為什麼要另外一個形狀而不是把幾個 stage 的 JSON 疊起來：agent 要知「這一堆
 * 決策分別屬於邊一站」。分開三段就靠貼上時的次序，次序一亂就對錯位；而
 * `scope.stages` 講得出這個範圍有邊幾站，agent 才知自己是做整份品牌，還是
 * 只做某一套做法。
 *
 * 空階段不輸出（同單階段匯出的原則一樣）：未填的站列出來只會令 agent 以為
 * 「這一站已經決定過，只是內容是空」。
 */
export type AgentScopeKind = 'brand' | 'brand-set';

export type AgentScopeStage = {
  id: string;
  /** 兩位數的階段號，例如 `04B`。 */
  code: string;
  name: string;
  /** 這一站動過的區塊紀錄（只有動過的格才會有 row）。 */
  blocks: readonly (AgentInputBlock & { blockId: string; code: string; title: string })[];
};

export type AgentScopeInput = {
  brand: { id: string; name: string };
  scope: {
    kind: AgentScopeKind;
    /** 品牌集 id；品牌層（01–03、04A、04G）是 null。 */
    id: string | null;
    name: string;
    /** 這個範圍包含哪幾站，例如 `['01','02','03']`。 */
    stages: string[];
  };
  stages: {
    id: string;
    code: string;
    name: string;
    decisions: AgentInput['decisions'];
    files: AgentInput['files'];
  }[];
};

/** 位置編號排序：`04A.2` 要排在 `04A.10` 之前（按數字，不是按字串）。 */
const CODE_ORDER = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export function buildScopeAgentInput(input: {
  brand: { id: string; name: string };
  scope: { kind: AgentScopeKind; id: string | null; name: string };
  stages: readonly AgentScopeStage[];
  origin: string;
}): AgentScopeInput {
  const { brand, scope, stages, origin } = input;
  const filled: AgentScopeInput['stages'] = [];

  for (const stage of stages) {
    const ordered = [...stage.blocks].sort((a, b) => CODE_ORDER.compare(a.code, b.code));
    const collected = collect(
      ordered.map((block) => ({ code: block.code, title: block.title, block })),
      origin,
    );

    if (collected.decisions.length === 0 && collected.files.length === 0) {
      continue;
    }

    filled.push({
      id: stage.id,
      code: stage.code,
      name: stage.name,
      decisions: collected.decisions,
      files: collected.files,
    });
  }

  return {
    brand,
    scope: {
      kind: scope.kind,
      id: scope.id,
      name: scope.name,
      stages: stages.map((stage) => stage.code),
    },
    stages: filled,
  };
}

/** 一個範圍（品牌／品牌集）一格都未填。 */
export function isEmptyScopeAgentInput(input: AgentScopeInput): boolean {
  return input.stages.length === 0;
}

/**
 * 由「位置編號＋標題＋紀錄」抽出決策與檔案。
 *
 * 單階段與整個範圍都用這一個，因為兩邊的規則必須一模一樣：只帶已填的決策、
 * 只帶未移除的檔案、檔案連位置。各寫一份早晚會有一邊漏掉 `removedAt`。
 */
function collect(
  entries: readonly { code: string; title: string; block: AgentInputBlock | undefined }[],
  origin: string,
): { decisions: AgentInput['decisions']; files: AgentInput['files'] } {
  const decisions: AgentInput['decisions'] = [];
  const files: AgentInput['files'] = [];

  // 跟畫面上的次序（位置編號由細到大），agent 讀起來同人看到的一致。
  for (const entry of entries) {
    const { block, code: sectionCode, title } = entry;

    if (block === undefined) {
      continue;
    }

    const decision = block.decision.trim();

    if (decision !== '') {
      decisions.push({
        block: sectionCode,
        title,
        decision,
        by: block.decisionByName ?? '',
        byType: block.decisionActorType,
        at: block.decisionAt,
      });
    }

    for (const file of block.files) {
      if (file.removedAt !== null) {
        continue;
      }

      files.push({
        block: sectionCode,
        title,
        fileId: file.fileId,
        name: file.name,
        type: file.contentType,
        bytes: file.sizeBytes,
        uploadedBy: file.uploadedByName,
        uploadedAt: file.createdAt,
        url: agentFileUrl(origin, file.fileId),
      });
    }
  }

  return { decisions, files };
}

/** 一格都未填：這個階段沒有任何東西可以交給 agent。 */
export function isEmptyAgentInput(input: AgentInput): boolean {
  return input.decisions.length === 0 && input.files.length === 0;
}

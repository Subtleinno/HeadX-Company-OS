/**
 * Marketing Design Project／Brief 的共用契約。
 *
 * Project 沒有可寫入的萬能 status；API 與 UI 都由同一個純函式推導顯示狀態。
 */

export type ProjectState =
  | 'awaiting_agent'
  | 'planning'
  | 'waiting_materials'
  | 'ready_to_render'
  | 'rendering'
  | 'produced'
  | 'received';

export type ProjectFacts = {
  hasAgentRun: boolean;
  hasBrief: boolean;
  openNeedCount: number;
  hasCompleteComposition: boolean;
  hasActiveRender: boolean;
  hasOutput: boolean;
  receivedAt: string | null;
};

export function deriveProjectState(facts: ProjectFacts): ProjectState {
  if (facts.receivedAt !== null) return 'received';
  if (facts.hasOutput) return 'produced';
  if (facts.hasActiveRender) return 'rendering';
  if (facts.openNeedCount > 0) return 'waiting_materials';
  if (facts.hasCompleteComposition) return 'ready_to_render';
  if (facts.hasAgentRun || facts.hasBrief) return 'planning';
  return 'awaiting_agent';
}

export type ProjectBriefDocument = {
  objective: string;
  audience: string;
  channel: string;
  format: string;
  language: string;
  constraints: string[];
  dueDate: string | null;
};

export type ProjectAgentRun = {
  id: string;
  agentId: string;
  agentName: string;
  requestId: string;
  claimedAt: string;
};

export type ProjectBriefVersion = {
  id: string;
  versionNo: number;
  document: ProjectBriefDocument;
  note: string | null;
  sourceRequestId: string;
  basedOnBriefVersionId: string | null;
  agentId: string;
  agentName: string;
  requestId: string;
  createdAt: string;
};

export type ProjectSummary = {
  id: string;
  brandId: string;
  brandName: string;
  title: string;
  state: ProjectState;
  briefVersionNo: number | null;
  agentRun: ProjectAgentRun | null;
  createdAt: string;
};

export type ProjectDetail = ProjectSummary & {
  originalRequest: {
    id: string;
    body: string;
    createdBy: string;
    createdAt: string;
  };
  brief: ProjectBriefVersion | null;
  briefVersions: ProjectBriefVersion[];
};

export type ProjectList = {
  projects: ProjectSummary[];
  total: number;
};

export type ParseBriefResult =
  | { ok: true; value: ProjectBriefDocument }
  | { ok: false; errors: string[] };

const TEXT_LIMIT = 4000;
const CONSTRAINT_LIMIT = 500;

function textOf(value: unknown, field: string, errors: string[]): string {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${field} 必須是非空白字串`);
    return '';
  }

  const text = value.trim();
  if (text.length > TEXT_LIMIT) {
    errors.push(`${field} 不可以超過 ${TEXT_LIMIT} 個字元`);
  }

  return text;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** 只接受白名單欄位，避免把未審閱的 agent 內容當成 Brief 真相。 */
export function parseProjectBriefDocument(input: unknown): ParseBriefResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: ['document 必須是物件'] };
  }

  const raw = input as Record<string, unknown>;
  const errors: string[] = [];
  const document: ProjectBriefDocument = {
    objective: textOf(raw.objective, 'objective', errors),
    audience: textOf(raw.audience, 'audience', errors),
    channel: textOf(raw.channel, 'channel', errors),
    format: textOf(raw.format, 'format', errors),
    language: textOf(raw.language, 'language', errors),
    constraints: [],
    dueDate: null,
  };

  if (raw.constraints !== undefined) {
    if (!Array.isArray(raw.constraints) || raw.constraints.length > 20) {
      errors.push('constraints 必須是最多 20 項的字串清單');
    } else {
      for (const item of raw.constraints) {
        if (typeof item !== 'string' || item.trim() === '' || item.length > CONSTRAINT_LIMIT) {
          errors.push(`constraints 每項必須是 1 至 ${CONSTRAINT_LIMIT} 個字元`);
          continue;
        }
        document.constraints.push(item.trim());
      }
    }
  }

  if (raw.dueDate !== undefined && raw.dueDate !== null) {
    if (typeof raw.dueDate !== 'string' || !validDate(raw.dueDate)) {
      errors.push('dueDate 必須是 YYYY-MM-DD 或 null');
    } else {
      document.dueDate = raw.dueDate;
    }
  }

  return errors.length === 0 ? { ok: true, value: document } : { ok: false, errors };
}

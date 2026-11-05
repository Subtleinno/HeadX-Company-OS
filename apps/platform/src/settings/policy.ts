/**
 * 政策引擎（issue #80／決策 C04）。
 *
 * 這是純函數：不查資料庫、不看時鐘、不知道 caller 是誰。規則由呼叫者先讀出來再傳進來，
 * 所以「讀哪些規則」（enabled、未刪除、哪個 domain）與「怎樣判斷」是兩件事。
 *
 * 決定 C04 的預設是**全部需批准**：沒有任何規則命中時回 require_approval。
 * 這個方向很重要 —— 忘記寫規則的後果是「多問老闆一次」，不是「靜靜送出」。
 *
 * 金額比較一定要帶貨幣：`lte`／`gte` 的子句必須寫 `currency`，而 facts 也要有 currency，
 * 兩者相同才比較。貨幣不同一律當作「不命中」，不是拋錯 —— 一張 CNY 的單據不應該讓
 * 整個判斷失敗，它只是不適用這條港幣規則。
 */

export type PolicyAction = 'allow' | 'require_approval';

export const POLICY_ACTIONS: readonly PolicyAction[] = ['allow', 'require_approval'];

export const POLICY_OPERATORS = ['eq', 'lte', 'gte', 'in'] as const;

export type PolicyOperator = (typeof POLICY_OPERATORS)[number];

/** 子句的值只可以是這三種純量；物件與陣列（除了 in）都不接受。 */
export type ScalarValue = string | number | boolean;

export type PolicyClause = {
  field: string;
  op: PolicyOperator;
  value: ScalarValue | ScalarValue[];
  /** 只有 lte／gte 用；金額比較必填。 */
  currency?: string;
};

export type PolicyCondition = {
  /** 全部子句都要命中才算命中。空陣列等於「全部命中」，所以驗證時拒絕。 */
  all: PolicyClause[];
};

/** 待判斷的事實。值可能是任何東西，對不上就是不命中。 */
export type PolicyFacts = Record<string, unknown>;

/** 判斷用得到的規則欄位（DB 的列轉過來的形狀）。 */
export type PolicyRule = {
  id: string;
  domain: string;
  condition: PolicyCondition;
  action: PolicyAction;
  priority: number;
  enabled: boolean;
  /**
   * 這條規則屬於哪個組織單位（issue #81）；null／未給＝整間公司。
   * 只有當呼叫者帶了 unitOrder 才會被考慮 —— 沒有單位概念的流程行為完全不變。
   */
  orgUnitId?: string | null;
  deletedAt?: Date | null;
};

export type Decision = {
  action: PolicyAction;
  /** 命中的規則；沒有任何規則命中時是 null。 */
  ruleId: string | null;
  reason: 'rule_matched' | 'no_rule_matched';
};

export type DecideOptions = {
  /**
   * 由近到遠的單位 id（含自己），通常來自組織圖的 unitOrder()。
   * 不給＝只看整間公司的規則（#80 的行為）。
   */
  unitOrder?: readonly string[];
};

const CLAUSE_FIELDS: readonly string[] = ['field', 'op', 'value', 'currency'];

export type ConditionValidation = {
  condition?: PolicyCondition;
  errors: string[];
};

function isScalar(value: unknown): value is ScalarValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function describe(value: unknown): string {
  return JSON.stringify(value) ?? String(value);
}

/**
 * 驗 condition 的格式。一次過報齊所有問題，不是只報第一個 ——
 * 寫錯一條規則時不用重複試。
 */
export function validateCondition(raw: unknown): ConditionValidation {
  const errors: string[] = [];

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { errors: ['condition 必須是物件，形如 { "all": [ … ] }'] };
  }

  const record = raw as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (key !== 'all') {
      errors.push(`condition 有未知欄位 ${key}（只可以有 all）`);
    }
  }

  const all = record.all;

  if (!Array.isArray(all)) {
    errors.push('condition.all 必須是陣列');
    return { errors };
  }

  if (all.length === 0) {
    // 空陣列在邏輯上「全部命中」，會變成一條放行一切的規則。這種預設太危險，直接拒絕。
    errors.push('condition.all 不可以是空陣列（空等於全部命中）');
    return { errors };
  }

  const clauses: PolicyClause[] = [];

  all.forEach((item, index) => {
    const where = `condition.all[${index}]`;

    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      errors.push(`${where} 必須是物件`);
      return;
    }

    const clause = item as Record<string, unknown>;

    for (const key of Object.keys(clause)) {
      if (!CLAUSE_FIELDS.includes(key)) {
        errors.push(`${where} 有未知欄位 ${key}（只可以有 ${CLAUSE_FIELDS.join('、')}）`);
      }
    }

    const field = clause.field;
    if (typeof field !== 'string' || field.trim() === '') {
      errors.push(`${where}.field 必須是非空字串`);
    }

    const rawOp = clause.op;
    if (typeof rawOp !== 'string' || !(POLICY_OPERATORS as readonly string[]).includes(rawOp)) {
      errors.push(`${where}.op 必須是 ${POLICY_OPERATORS.join('、')} 其中之一`);
      return;
    }

    // 上面已經驗過，這裡只是讓型別收窄成那四個字面值。
    const op = rawOp as PolicyOperator;

    if (op === 'eq') {
      if (!isScalar(clause.value)) {
        errors.push(`${where}.value 在 eq 之下只可以是字串、數字或布林`);
      }
      if (clause.currency !== undefined) {
        errors.push(`${where}.currency 只在 lte／gte（金額比較）之下有意義`);
      }
      clauses.push({ field: field as string, op, value: clause.value as ScalarValue });
      return;
    }

    if (op === 'in') {
      const value = clause.value;

      if (!Array.isArray(value) || value.length === 0) {
        errors.push(`${where}.value 在 in 之下必須是非空陣列`);
      } else if (!value.every((entry) => isScalar(entry))) {
        errors.push(`${where}.value 在 in 之下的元素只可以是字串、數字或布林`);
      }
      if (clause.currency !== undefined) {
        errors.push(`${where}.currency 只在 lte／gte（金額比較）之下有意義`);
      }
      clauses.push({ field: field as string, op, value: value as ScalarValue[] });
      return;
    }

    // lte／gte：金額比較。
    if (typeof clause.value !== 'number' || !Number.isFinite(clause.value)) {
      errors.push(`${where}.value 在 ${op} 之下必須是數字`);
    }

    if (typeof clause.currency !== 'string' || clause.currency.trim() === '') {
      errors.push(`${where}.currency 是必填：金額比較必須同時帶貨幣，否則貨幣不同也會被當成同一個數`);
    }

    clauses.push({
      field: field as string,
      op,
      value: clause.value as number,
      currency: clause.currency as string,
    });
  });

  if (errors.length > 0) {
    return { errors };
  }

  return { errors: [], condition: { all: clauses } };
}

/** 一條子句是否命中。缺少 fact 欄位就是不命中。 */
function clauseMatches(clause: PolicyClause, facts: PolicyFacts): boolean {
  const actual = facts[clause.field];

  if (actual === undefined) {
    return false;
  }

  switch (clause.op) {
    case 'eq':
      return actual === clause.value;

    case 'in':
      return Array.isArray(clause.value) && clause.value.includes(actual as ScalarValue);

    case 'lte':
    case 'gte': {
      if (typeof actual !== 'number' || typeof clause.value !== 'number') {
        return false;
      }

      // 貨幣一定要兩邊都有而且相同；不同就是「不適用」，不是錯誤。
      if (typeof facts.currency !== 'string' || facts.currency !== clause.currency) {
        return false;
      }

      return clause.op === 'lte' ? actual <= clause.value : actual >= clause.value;
    }

    default: {
      const exhaustive: never = clause.op;
      throw new Error(`未知運算子 ${String(exhaustive)}`);
    }
  }
}

function ruleMatches(rule: PolicyRule, domain: string, facts: PolicyFacts): boolean {
  if (rule.domain !== domain) {
    return false;
  }

  return rule.condition.all.every((clause) => clauseMatches(clause, facts));
}

/**
 * 判斷一個動作要放行還是要批准。
 *
 * 只考慮 enabled 且未刪除、domain 相同的規則；按 priority 由小到大，第一條命中者勝。
 * 完全沒有命中時回 require_approval（決策 C04）。
 *
 * 帶 `unitOrder`（由近到遠的單位 id，含自己）時（issue #81）：
 *   - 只考慮這些單位的規則，加上整間公司（orgUnitId 為空）的規則；
 *   - 越近的單位越先考慮，**同一個單位之內**才按 priority；
 *   - 不帶時只看整間公司的規則 —— 與 #80 完全一樣，既有流程的行為不會被悄悄改掉。
 *
 * 不修改傳入的陣列 —— 排序在副本上做，呼叫者拿到的次序不會被偷偷改掉。
 */
export function decide(
  rules: readonly PolicyRule[],
  domain: string,
  facts: PolicyFacts,
  options: DecideOptions = {},
): Decision {
  const unitOrder = options.unitOrder;

  /** 排序用的「多近」：0 是最近的單位；整間公司排在最後；-1 代表不考慮。 */
  const rankOf = (rule: PolicyRule): number => {
    const unitId = rule.orgUnitId ?? null;

    if (unitId === null) {
      return unitOrder === undefined ? 0 : unitOrder.length;
    }

    if (unitOrder === undefined) {
      return -1;
    }

    return unitOrder.indexOf(unitId);
  };

  const candidates = rules
    .filter((rule) => rule.enabled && (rule.deletedAt ?? null) === null)
    .map((rule) => ({ rule, rank: rankOf(rule) }))
    .filter((entry) => entry.rank >= 0)
    .sort((left, right) =>
      left.rank === right.rank
        ? left.rule.priority - right.rule.priority
        : left.rank - right.rank,
    )
    .map((entry) => entry.rule);

  for (const rule of candidates) {
    if (ruleMatches(rule, domain, facts)) {
      return { action: rule.action, ruleId: rule.id, reason: 'rule_matched' };
    }
  }

  return { action: 'require_approval', ruleId: null, reason: 'no_rule_matched' };
}

/**
 * 把一組規則綁進來的版本，對外就是 `decide(domain, facts, options?)`。
 * 讀一次規則、判斷多次時用這個，避免每次呼叫都重新排序。
 */
export function createDecider(
  rules: readonly PolicyRule[],
): (domain: string, facts: PolicyFacts, options?: DecideOptions) => Decision {
  return (domain, facts, options) => decide(rules, domain, facts, options);
}

// ---------------------------------------------------------------------------
// 規則的輸入（API 的 body 與種子檔共用同一份）
// ---------------------------------------------------------------------------

/** 一條規則可以填的欄位。 */
export type RuleInput = {
  domain: string;
  condition: PolicyCondition;
  action: PolicyAction;
  priority: number;
  enabled: boolean;
  note: string | null;
  /** 屬於哪個組織單位（issue #81）；null／未給＝整間公司。 */
  orgUnitId?: string | null;
};

const RULE_FIELDS: readonly string[] = [
  'domain',
  'condition',
  'action',
  'priority',
  'enabled',
  'note',
  'orgUnitId',
];

/** domain 的形狀：小寫字母開頭，只用小寫英數與底線（例如 payment、outbound）。 */
const DOMAIN_PATTERN = /^[a-z][a-z0-9_]*$/;

/** orgUnitId 只接受標準 UUID 形狀；是否存在由路由查（這裡不知道資料庫）。 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const NOTE_MAX_LENGTH = 500;

export type RuleInputValidation = {
  value: Partial<RuleInput>;
  errors: string[];
};

/**
 * 解析一條規則的輸入。
 *
 * `partial: true` 時只驗有出現的欄位（PATCH 用）；否則要求 domain、condition、action
 * 齊全，並補上 priority=100、enabled=true、note=null 這三個預設值。
 *
 * 種子檔與 API 用同一支，否則「種子填得進去、API 卻拒絕」會變成兩套標準。
 */
export function parseRuleInput(
  raw: unknown,
  options: { partial?: boolean } = {},
): RuleInputValidation {
  const partial = options.partial === true;
  const errors: string[] = [];
  const value: Partial<RuleInput> = {};

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { value, errors: ['規則必須是物件'] };
  }

  const record = raw as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!RULE_FIELDS.includes(key)) {
      errors.push(`規則有未知欄位 ${key}（只可以有 ${RULE_FIELDS.join('、')}）`);
    }
  }

  if (!partial || record.domain !== undefined) {
    const domain = record.domain;

    if (typeof domain !== 'string' || !DOMAIN_PATTERN.test(domain)) {
      errors.push(
        `domain 必須是小寫字母開頭、只用小寫英數與底線的非空字串（現在是 ${describe(domain)}）`,
      );
    } else {
      value.domain = domain;
    }
  }

  if (!partial || record.condition !== undefined) {
    if (record.condition === undefined) {
      errors.push('condition 是必填');
    } else {
      const condition = validateCondition(record.condition);

      if (condition.condition === undefined) {
        errors.push(...condition.errors);
      } else {
        value.condition = condition.condition;
      }
    }
  }

  if (!partial || record.action !== undefined) {
    const action = record.action;

    if (typeof action !== 'string' || !(POLICY_ACTIONS as readonly string[]).includes(action)) {
      errors.push(`action 必須是 ${POLICY_ACTIONS.join('、')} 其中之一（現在是 ${describe(action)}）`);
    } else {
      value.action = action as PolicyAction;
    }
  }

  if (record.priority !== undefined) {
    const priority = record.priority;

    if (typeof priority !== 'number' || !Number.isInteger(priority)) {
      errors.push(`priority 必須是整數（現在是 ${describe(priority)}）`);
    } else {
      value.priority = priority;
    }
  } else if (!partial) {
    value.priority = 100;
  }

  if (record.enabled !== undefined) {
    const enabled = record.enabled;

    if (typeof enabled !== 'boolean') {
      errors.push(`enabled 必須是 true 或 false（現在是 ${describe(enabled)}）`);
    } else {
      value.enabled = enabled;
    }
  } else if (!partial) {
    value.enabled = true;
  }

  if (record.note !== undefined) {
    const note = record.note;

    if (note !== null && typeof note !== 'string') {
      errors.push('note 必須是字串或 null');
    } else if (typeof note === 'string' && note.length > NOTE_MAX_LENGTH) {
      errors.push(`note 不可以超過 ${NOTE_MAX_LENGTH} 個字元`);
    } else {
      value.note = note;
    }
  } else if (!partial) {
    value.note = null;
  }

  // 沒給就不放進 value（undefined），插入時當作整間公司的規則。
  // 這樣 #80 既有的 toEqual 期望不會因為多了一個 key 而變。
  if (record.orgUnitId !== undefined) {
    const orgUnitId = record.orgUnitId;

    if (orgUnitId !== null && (typeof orgUnitId !== 'string' || !UUID_PATTERN.test(orgUnitId))) {
      errors.push(`orgUnitId 必須是 UUID 或 null（null 代表整間公司，現在是 ${describe(orgUnitId)}）`);
    } else {
      value.orgUnitId = orgUnitId as string | null;
    }
  }

  return { value, errors };
}


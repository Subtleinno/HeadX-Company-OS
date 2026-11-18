/**
 * 品牌引導的輸入驗證。
 *
 * 選項庫是唯讀參考資料（種子），沒有寫入 API —— 增刪選項是老闆／agent 的
 * 事，日後再開。這裡只驗證「答案」的形狀：stage、dimension、揀了的選項、
 * 自由文字。
 */

export const GUIDE_STAGES = [
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
] as const;
export type GuideStage = (typeof GUIDE_STAGES)[number];

const DIMENSION_RE = /^[a-zA-Z][a-zA-Z0-9]{0,39}$/;
const OPT_ID_RE = /^[a-zA-Z0-9_]{1,40}$/;

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export type AnswerInput =
  | { ok: true; value: { stage: string; answers: { dimension: string; picked: string[]; textValue: string }[] } }
  | { ok: false; reason: string };

/**
 * 驗證一批答案。
 *
 * 一個 stage 可以有零到多個維度，一次過提交；每個維度是「揀了的 opt_id
 * 陣列 ＋ 自由文字」。兩者至少其一非空（空答案沒有意義，不寫入）。
 */
export function parseGuideAnswers(body: unknown): AnswerInput {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, reason: 'body 必須是物件' };
  }

  const record = body as Record<string, unknown>;
  const stage = record.stage;

  if (typeof stage !== 'string' || !(GUIDE_STAGES as readonly string[]).includes(stage)) {
    return { ok: false, reason: `stage 必須是 ${GUIDE_STAGES.join('／')} 之一` };
  }

  if (!Array.isArray(record.answers) || record.answers.length === 0) {
    return { ok: false, reason: 'answers 必須是非空陣列' };
  }

  const answers: { dimension: string; picked: string[]; textValue: string }[] = [];

  for (const item of record.answers) {
    if (typeof item !== 'object' || item === null) {
      return { ok: false, reason: 'answers 每一項必須是物件' };
    }

    const answer = item as Record<string, unknown>;
    const dimension = answer.dimension;

    if (typeof dimension !== 'string' || !DIMENSION_RE.test(dimension)) {
      return { ok: false, reason: 'dimension 必須是小寫英文（可含數字）' };
    }

    const picked = Array.isArray(answer.picked) ? answer.picked : [];

    for (const opt of picked) {
      if (typeof opt !== 'string' || !OPT_ID_RE.test(opt)) {
        return { ok: false, reason: `picked 的選項 ${String(opt)} 格式不對` };
      }
    }

    const textValue = typeof answer.textValue === 'string' ? answer.textValue : '';

    if (picked.length === 0 && textValue.trim() === '') {
      return { ok: false, reason: `維度 ${dimension} 至少要有揀選項或文字` };
    }

    if (textValue.length > 4000) {
      return { ok: false, reason: `維度 ${dimension} 的文字超過 4000 字` };
    }

    answers.push({ dimension, picked, textValue });
  }

  return { ok: true, value: { stage, answers } };
}

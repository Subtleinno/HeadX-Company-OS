import {
  parseProjectBriefDocument,
  type ProjectBriefDocument,
} from '@company-os/contracts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9._:-]{1,100}$/;

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

export function isProjectUuid(value: string): boolean {
  return UUID.test(value);
}

export type CreateProjectInput = {
  brandId: string;
  title: string;
  request: string;
};

export function parseCreateProjectInput(body: unknown): ParseResult<CreateProjectInput> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, errors: ['body 必須是物件'] };
  }

  const raw = body as Record<string, unknown>;
  const brandId = typeof raw.brandId === 'string' ? raw.brandId : '';
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const request = typeof raw.request === 'string' ? raw.request.trim() : '';
  const errors: string[] = [];

  if (!UUID.test(brandId)) errors.push('brandId 必須是有效品牌 ID');
  if (title === '' || title.length > 120) errors.push('title 必須是 1 至 120 個字元');
  if (request === '' || request.length > 20000) errors.push('request 必須是 1 至 20000 個字元');

  return errors.length === 0
    ? { ok: true, value: { brandId, title, request } }
    : { ok: false, errors };
}

export type SubmitBriefInput = {
  runId: string;
  document: ProjectBriefDocument;
  note: string | null;
  basedOnBriefVersionId: string | null;
};

export function parseSubmitBriefInput(body: unknown): ParseResult<SubmitBriefInput> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, errors: ['body 必須是物件'] };
  }

  const raw = body as Record<string, unknown>;
  const runId = typeof raw.runId === 'string' ? raw.runId : '';
  const parsedDocument = parseProjectBriefDocument(raw.document);
  const rawNote = raw.note;
  const note = typeof rawNote === 'string' ? rawNote.trim() : '';
  const basedOn = raw.basedOnBriefVersionId;
  const errors: string[] = [];

  if (!UUID.test(runId)) errors.push('runId 必須是有效 agent run ID');
  if (!parsedDocument.ok) errors.push(...parsedDocument.errors);
  if (rawNote !== undefined && rawNote !== null && typeof rawNote !== 'string') {
    errors.push('note 必須是字串或 null');
  }
  if (note.length > 200) errors.push('note 不可以超過 200 個字元');
  if (basedOn !== undefined && basedOn !== null && (typeof basedOn !== 'string' || !UUID.test(basedOn))) {
    errors.push('basedOnBriefVersionId 必須是有效 Brief 版本 ID 或 null');
  }

  if (errors.length > 0 || !parsedDocument.ok) return { ok: false, errors };

  return {
    ok: true,
    value: {
      runId,
      document: parsedDocument.value,
      note: note === '' ? null : note,
      basedOnBriefVersionId: typeof basedOn === 'string' ? basedOn : null,
    },
  };
}

export function validRequestKey(value: unknown): value is string {
  return typeof value === 'string' && KEY.test(value);
}

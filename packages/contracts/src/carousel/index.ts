/** IG Carousel 縱切片：素材、知識、組稿、輸出與來源的共用契約。 */

export type CarouselSlideRole = 'cover' | 'body' | 'cta';
export type MaterialSource = 'human_shot' | 'ai_generated' | 'stock' | 'client_provided';
export type KnowledgeStatus = 'unverified' | 'verified' | 'outdated';

export type KnowledgeRef = {
  docId: string;
  versionId: string;
  chunkId: string;
};

export type CarouselSlide = {
  id: string;
  role: CarouselSlideRole;
  headline: string;
  body: string;
  cta: string;
  materialId: string | null;
  knowledgeRefs: KnowledgeRef[];
};

export type MaterialView = {
  id: string;
  brandId: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  width: number;
  height: number;
  source: MaterialSource;
  description: string;
  tags: string[];
  versionNo: number;
  previewUrl: string;
  originalUrl: string;
  createdAt: string;
};

export type KnowledgeSource = { title: string; url: string; retrieved: string };
export type KnowledgeChunk = { id: string; heading: string; body: string; ordinal: number };
export type KnowledgeVersion = {
  id: string;
  versionNo: number;
  summary: string;
  bodyMd: string;
  sources: KnowledgeSource[];
  jurisdiction: string[];
  reviewBy: string | null;
  chunks: KnowledgeChunk[];
  createdAt: string;
};

export type KnowledgeDocView = {
  id: string;
  brandId: string | null;
  title: string;
  status: KnowledgeStatus;
  current: KnowledgeVersion | null;
  createdAt: string;
};

export type CarouselTemplate = {
  id: string;
  version: number;
  family: 'ig-carousel';
  role: CarouselSlideRole;
  name: string;
  summary: string;
  slots: { key: string; type: 'text' | 'image' | 'cta'; required: boolean; maxChars?: number }[];
};

export const CAROUSEL_TEMPLATES: readonly CarouselTemplate[] = [
  {
    id: 'ig-carousel-cover-editorial', version: 1, family: 'ig-carousel', role: 'cover',
    name: '編輯式封面', summary: '品牌字標、大標題、輔助句與一張主圖；適合系列開場。',
    slots: [
      { key: 'headline', type: 'text', required: true, maxChars: 60 },
      { key: 'body', type: 'text', required: true, maxChars: 240 },
      { key: 'hero_image', type: 'image', required: true },
    ],
  },
  {
    id: 'ig-carousel-body-evidence', version: 1, family: 'ig-carousel', role: 'body',
    name: '知識內頁', summary: '一頁一個重點，保留知識段落引用與可選素材。',
    slots: [
      { key: 'headline', type: 'text', required: true, maxChars: 70 },
      { key: 'body', type: 'text', required: true, maxChars: 420 },
      { key: 'supporting_image', type: 'image', required: false },
    ],
  },
  {
    id: 'ig-carousel-cta-end', version: 1, family: 'ig-carousel', role: 'cta',
    name: '行動結尾', summary: '收結重點與單一行動；不自動發布。',
    slots: [
      { key: 'headline', type: 'text', required: true, maxChars: 60 },
      { key: 'body', type: 'text', required: true, maxChars: 240 },
      { key: 'cta', type: 'cta', required: true, maxChars: 60 },
    ],
  },
] as const;

export type BrandCreativeProfile = {
  brandId: string;
  brandName: string;
  releaseId: string | null;
  releaseNo: number | null;
  colors: { primary: string; ink: string; paper: string; accent: string };
  fonts: { display: string; body: string };
  tone: { traits: string[]; banned: string[]; languagePolicy: string };
  image: { composition: string; light: string; space: string };
  pages: { key: string; versionId: string; versionNo: number }[];
};

export type CompositionLintItem = { level: 'error' | 'warning'; code: string; message: string; slideId?: string };
export type CompositionView = {
  id: string;
  projectId: string;
  versionNo: number;
  basedOnId: string | null;
  briefVersionId: string | null;
  brandReleaseId: string | null;
  slides: CarouselSlide[];
  sourceRefs: { materialIds: string[]; knowledge: KnowledgeRef[]; templateIds: string[] };
  lint: CompositionLintItem[];
  actorType: 'human' | 'agent';
  actorId: string;
  requestId: string;
  createdAt: string;
};

export type OutputFile = {
  id: string;
  name: string;
  kind: 'page' | 'archive';
  contentType: string;
  sizeBytes: number;
  sha256: string;
  width: number | null;
  height: number | null;
  url: string;
};

export type ProvenanceItem = {
  kind: 'brand' | 'knowledge' | 'material' | 'template' | 'brief';
  objectId: string;
  version: string;
  detail: string;
};

export type CarouselOutput = {
  id: string;
  projectId: string;
  compositionId: string;
  compositionVersionNo: number;
  profile: 'carousel-png';
  files: OutputFile[];
  provenance: ProvenanceItem[];
  createdAt: string;
};

export type ProjectCreativeWorkspace = {
  brand: BrandCreativeProfile;
  materials: MaterialView[];
  knowledge: KnowledgeDocView[];
  templates: CarouselTemplate[];
  compositions: CompositionView[];
  outputs: CarouselOutput[];
};

export type CreateCompositionInput = {
  slides: CarouselSlide[];
  basedOnId?: string | null;
  idempotencyKey: string;
};

export function validateCarouselSlides(input: unknown): { ok: true; value: CarouselSlide[] } | { ok: false; errors: string[] } {
  if (!Array.isArray(input) || input.length < 3 || input.length > 10) {
    return { ok: false, errors: ['Carousel 必須有 3 至 10 頁'] };
  }
  const errors: string[] = [];
  const ids = new Set<string>();
  const slides: CarouselSlide[] = [];
  for (const [index, raw] of input.entries()) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      errors.push(`第 ${index + 1} 頁必須是物件`);
      continue;
    }
    const item = raw as Record<string, unknown>;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const role = item.role;
    const headline = typeof item.headline === 'string' ? item.headline.trim() : '';
    const body = typeof item.body === 'string' ? item.body.trim() : '';
    const cta = typeof item.cta === 'string' ? item.cta.trim() : '';
    if (!/^[a-zA-Z0-9_-]{1,60}$/.test(id) || ids.has(id)) errors.push(`第 ${index + 1} 頁 id 無效或重複`);
    ids.add(id);
    if (role !== 'cover' && role !== 'body' && role !== 'cta') errors.push(`第 ${index + 1} 頁 role 無效`);
    if (headline === '' || headline.length > 100) errors.push(`第 ${index + 1} 頁標題須為 1 至 100 字元`);
    if (body === '' || body.length > 700) errors.push(`第 ${index + 1} 頁內容須為 1 至 700 字元`);
    if (cta.length > 80) errors.push(`第 ${index + 1} 頁 CTA 不可超過 80 字元`);
    if (role === 'cta' && cta === '') errors.push('結尾頁必須有 CTA');
    const materialId = typeof item.materialId === 'string' && item.materialId !== '' ? item.materialId : null;
    const refs = Array.isArray(item.knowledgeRefs) ? item.knowledgeRefs : [];
    const knowledgeRefs: KnowledgeRef[] = [];
    for (const ref of refs) {
      if (typeof ref !== 'object' || ref === null) {
        errors.push(`第 ${index + 1} 頁知識引用無效`);
        continue;
      }
      const value = ref as Record<string, unknown>;
      if (typeof value.docId !== 'string' || typeof value.versionId !== 'string' || typeof value.chunkId !== 'string') {
        errors.push(`第 ${index + 1} 頁知識引用缺少 docId／versionId／chunkId`);
        continue;
      }
      knowledgeRefs.push({ docId: value.docId, versionId: value.versionId, chunkId: value.chunkId });
    }
    if (role === 'body' && knowledgeRefs.length === 0) errors.push(`第 ${index + 1} 頁必須引用至少一段知識`);
    slides.push({ id, role: role as CarouselSlideRole, headline, body, cta, materialId, knowledgeRefs });
  }
  if (slides[0]?.role !== 'cover') errors.push('第一頁必須是 cover');
  if (slides[slides.length - 1]?.role !== 'cta') errors.push('最後一頁必須是 cta');
  return errors.length === 0 ? { ok: true, value: slides } : { ok: false, errors };
}

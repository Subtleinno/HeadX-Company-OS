import type { CarouselSlide, KnowledgeDocView, KnowledgeRef, ProjectCreativeWorkspace, ProjectDetail } from '@company-os/contracts';

export type AutomaticCompositionResult =
  | { ok: true; slides: CarouselSlide[] }
  | { ok: false; reason: 'knowledge_required' };

function refsFor(doc: KnowledgeDocView, chunkId: string): KnowledgeRef[] {
  const versionId = doc.current?.id;
  return versionId === undefined ? [] : [{ docId: doc.id, versionId, chunkId }];
}

/**
 * 無外部模型時的可重現組稿：標題與目的來自 Project／Brief，內頁逐字取自所選知識，
 * 圖片只引用所選 Materials。它不是假 AI；畫面會明確稱為「由已選資料組稿」。
 */
export function buildAutomaticSlides(
  project: ProjectDetail,
  workspace: ProjectCreativeWorkspace,
  selection: { materialIds?: string[]; knowledgeIds?: string[] } = {},
): AutomaticCompositionResult {
  const materials = workspace.materials.filter((item) => selection.materialIds === undefined || selection.materialIds.includes(item.id));
  const documents = workspace.knowledge.filter((item) => item.current !== null && (selection.knowledgeIds === undefined || selection.knowledgeIds.includes(item.id)));
  const entries = documents.flatMap((doc) => (doc.current?.chunks ?? []).map((chunk) => ({ doc, chunk })));
  const first = entries[0];
  if (first === undefined) return { ok: false, reason: 'knowledge_required' };

  const objective = project.brief?.document.objective ?? project.originalRequest.body;
  const audience = project.brief?.document.audience ?? '';
  const constraints = project.brief?.document.constraints ?? [];
  const slides: CarouselSlide[] = [
    {
      id: 'cover', role: 'cover', headline: project.title,
      body: objective, cta: '', materialId: materials[0]?.id ?? null,
      knowledgeRefs: refsFor(first.doc, first.chunk.id),
    },
  ];

  for (let index = 0; index < 3; index += 1) {
    const entry = entries[index % entries.length];
    if (entry === undefined) continue;
    const fallbackHeadline = index === 0 && audience !== '' ? '先理解自己的需要' : entry.doc.title;
    const body = index === 2 && constraints.length > 0
      ? `${entry.chunk.body}\n\n創作提醒：${constraints.join('；')}`
      : entry.chunk.body;
    slides.push({
      id: `point-${index + 1}`, role: 'body',
      headline: entry.chunk.heading === '內容' ? fallbackHeadline : entry.chunk.heading,
      body, cta: '', materialId: materials[(index + 1) % Math.max(materials.length, 1)]?.id ?? null,
      knowledgeRefs: refsFor(entry.doc, entry.chunk.id),
    });
  }

  slides.push({
    id: 'cta', role: 'cta', headline: '把重點留在日常',
    body: objective, cta: '與我們聊聊', materialId: null,
    knowledgeRefs: refsFor(first.doc, first.chunk.id),
  });
  return { ok: true, slides };
}

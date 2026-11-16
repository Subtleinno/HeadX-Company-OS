import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { t } from '@company-os/i18n';
import { appendKnowledgeVersion, createKnowledge, fetchKnowledge, reviewKnowledge, type KnowledgeDocView, type KnowledgeInput } from '../api';

const emptyForm = { title: '', summary: '', bodyMd: '', sourceTitle: '', sourceUrl: '', reviewBy: '' };
export function KnowledgeScreen({
  brandId,
  status = 'all',
  selectedDocumentId = null,
  onDocumentsChange,
  onSelectDocument,
}: {
  brandId: string | null;
  status?: KnowledgeDocView['status'] | 'all';
  selectedDocumentId?: string | null;
  onDocumentsChange?: (documents: readonly KnowledgeDocView[]) => void;
  onSelectDocument?: (id: string) => void;
}) {
  const [items, setItems] = useState<KnowledgeDocView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit' | 'agent'>('view');
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const visibleItems = status === 'all' ? items : items.filter((item) => item.status === status);
  const selected = loading ? null : visibleItems.find((item) => item.id === selectedDocumentId)
    ?? visibleItems.find((item) => item.id === selectedId)
    ?? visibleItems[0]
    ?? null;

  const load = useCallback(async (search = query) => {
    if (brandId === null) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const result = await fetchKnowledge(brandId, search);
    setLoading(false);
    if (result.ok) {
      setItems(result.data.knowledge);
      setSelectedId((id) => id ?? result.data.knowledge[0]?.id ?? null);
      onDocumentsChange?.(result.data.knowledge);
    }
    else setMessage(t('design.knowledge.loadFailed'));
  }, [brandId, query, onDocumentsChange]);
  useEffect(() => { setForm(emptyForm); setSelectedId(null); setCreating(false); void load(''); }, [brandId]);
  useEffect(() => {
    setSelectedId(selectedDocumentId);
    setCreating(false);
    setMode('view');
  }, [selectedDocumentId]);

  function startNew(): void { setSelectedId(null); setCreating(true); setForm(emptyForm); setMode('edit'); }
  function startEdit(): void {
    if (selected?.current == null) return;
    setCreating(false);
    setForm({ title: selected.title, summary: selected.current.summary, bodyMd: selected.current.bodyMd, sourceTitle: selected.current.sources[0]?.title ?? '', sourceUrl: selected.current.sources[0]?.url ?? '', reviewBy: selected.current.reviewBy ?? '' });
    setMode('edit');
  }
  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (brandId === null) return;
    setBusy(true); setMessage(null);
    const input: KnowledgeInput = {
      brandId, title: form.title, summary: form.summary, bodyMd: form.bodyMd,
      sources: form.sourceUrl.trim() === '' ? [] : [{ title: form.sourceTitle || form.sourceUrl, url: form.sourceUrl, retrieved: new Date().toISOString().slice(0, 10) }],
      jurisdiction: ['HK'], reviewBy: form.reviewBy === '' ? null : form.reviewBy,
    };
    const result = creating || selected === null ? await createKnowledge(input) : await appendKnowledgeVersion(selected.id, input);
    setBusy(false);
    if (!result.ok) { setMessage(result.failure.kind === 'http' ? result.failure.message ?? result.failure.reasons.join('；') : t('error.network')); return; }
    setSelectedId(result.data.knowledge.id);
    setCreating(false);
    setMode('view');
    setMessage(t('design.knowledge.saved'));
    onSelectDocument?.(result.data.knowledge.id);
    await load();
  }
  async function mark(status: KnowledgeDocView['status']): Promise<void> {
    if (selected === null) return;
    const result = await reviewKnowledge(selected.id, status);
    if (result.ok) { setMessage(t('design.knowledge.saved')); await load(); }
  }

  return <div className="knowledge-page" data-design-page="knowledge">
    <div className="library-hero"><div><h2>{t('design.knowledge.title')}</h2><p>{t('design.knowledge.lead')}</p></div><button type="button" className="design-btn design-btn--primary" onClick={startNew}>{t('design.knowledge.new')}</button></div>
    <form className="library-search" onSubmit={(event) => { event.preventDefault(); void load(); }}><input aria-label={t('design.knowledge.search')} placeholder={t('design.knowledge.search')} value={query} onChange={(event) => setQuery(event.target.value)} /><button className="design-btn" type="submit">{t('design.knowledge.search')}</button></form>
    {message !== null && <p className="design-note">{message}</p>}
    <div className="knowledge-layout">
      <section className="knowledge-document">
        {selected !== null && <div className="library-mode" role="tablist">{(['view', 'edit', 'agent'] as const).map((item) => <button type="button" key={item} role="tab" aria-selected={mode === item} onClick={() => item === 'edit' ? startEdit() : setMode(item)}>{t(item === 'view' ? 'design.knowledge.view' : item === 'edit' ? 'design.knowledge.editMode' : 'design.knowledge.agentMode')}</button>)}</div>}
        {mode === 'edit' ? <form className="knowledge-form" onSubmit={(event) => void save(event)}><input aria-label={t('design.knowledge.fieldTitle')} placeholder={t('design.knowledge.fieldTitle')} required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /><textarea aria-label={t('design.knowledge.summary')} placeholder={t('design.knowledge.summary')} required rows={2} value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} /><div className="knowledge-form__sources"><input aria-label={t('design.knowledge.sourceTitle')} placeholder={t('design.knowledge.sourceTitle')} value={form.sourceTitle} onChange={(event) => setForm({ ...form, sourceTitle: event.target.value })} /><input aria-label={t('design.knowledge.sourceUrl')} placeholder={t('design.knowledge.sourceUrl')} type="url" value={form.sourceUrl} onChange={(event) => setForm({ ...form, sourceUrl: event.target.value })} /><input aria-label={t('design.knowledge.reviewBy')} type="date" value={form.reviewBy} onChange={(event) => setForm({ ...form, reviewBy: event.target.value })} /></div><textarea className="knowledge-form__markdown" aria-label={t('design.knowledge.body')} placeholder={t('design.knowledge.bodyHint')} required rows={18} value={form.bodyMd} onChange={(event) => setForm({ ...form, bodyMd: event.target.value })} /><button type="submit" className="design-btn design-btn--primary" disabled={busy}>{busy ? t('design.knowledge.saving') : t('design.knowledge.save')}</button></form> : selected === null ? <div className="design-empty"><p>{t(loading ? 'design.common.loading' : 'design.knowledge.empty')}</p>{!loading && <p>{t('design.knowledge.emptyBody')}</p>}</div> : mode === 'agent' ? <div className="agent-guide"><h2>kb_search → kb_get</h2><p>{t('design.knowledge.agentBody')}</p><pre>{JSON.stringify({ id: selected.id, title: selected.title, status: selected.status, summary: selected.current?.summary, version: selected.current?.versionNo, chunks: selected.current?.chunks.map((chunk) => ({ id: chunk.id, heading: chunk.heading })) }, null, 2)}</pre></div> : <article className="knowledge-view"><div className="knowledge-view__head"><div><h2>{selected.title}</h2><p>{selected.current?.summary}</p></div><span className={`knowledge-status knowledge-status--${selected.status}`}>{t(`design.knowledge.status.${selected.status}`)}</span></div><div className="knowledge-view__actions">{selected.status !== 'verified' ? <button type="button" className="design-btn" onClick={() => void mark('verified')}>{t('design.knowledge.markVerified')}</button> : <button type="button" className="design-btn" onClick={() => void mark('outdated')}>{t('design.knowledge.markOutdated')}</button>}</div><div className="knowledge-view__body">{selected.current?.bodyMd}</div><h3>{t('design.knowledge.chunks')}</h3><ol className="knowledge-chunks">{selected.current?.chunks.map((chunk) => <li key={chunk.id}><strong>{chunk.heading}</strong><p>{chunk.body}</p></li>)}</ol></article>}
      </section>
    </div>
  </div>;
}

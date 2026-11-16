import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { t } from '@company-os/i18n';
import { fetchMaterials, uploadMaterial, type MaterialView } from '../api';

export function MaterialsScreen({
  brandId,
  sourceFilter = 'all',
}: {
  brandId: string | null;
  sourceFilter?: MaterialView['source'] | 'all';
}) {
  const [items, setItems] = useState<MaterialView[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'view' | 'edit' | 'agent'>('view');
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [source, setSource] = useState<MaterialView['source']>('human_shot');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (search = query) => {
    if (brandId === null) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const result = await fetchMaterials(brandId, search);
    setLoading(false);
    if (result.ok) setItems(result.data.materials);
    else setMessage(t('design.material.loadFailed'));
  }, [brandId, query]);
  useEffect(() => { void load(''); }, [brandId]);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (brandId === null || file === null) return;
    setBusy(true); setMessage(null);
    const result = await uploadMaterial({ brandId, file, description, tags: tags.split(',').map((item) => item.trim()).filter(Boolean), source });
    setBusy(false);
    if (!result.ok) { setMessage(result.failure.kind === 'http' ? result.failure.message ?? t('design.material.uploadFailed') : t('error.network')); return; }
    setFile(null); setDescription(''); setTags(''); setMode('view'); setMessage(t('design.material.added'));
    await load();
  }

  const visibleItems = sourceFilter === 'all' ? items : items.filter((item) => item.source === sourceFilter);

  return <div className="library-page materials-page" data-design-page="materials">
    <div className="library-hero"><div><h2>{t('design.material.title')}</h2><p>{t('design.material.lead')}</p></div><button type="button" className="design-btn design-btn--primary" onClick={() => setMode('edit')}>{t('design.material.upload')}</button></div>
    <div className="library-mode" role="tablist">{(['view', 'edit', 'agent'] as const).map((item) => <button type="button" key={item} role="tab" aria-selected={mode === item} onClick={() => setMode(item)}>{t(item === 'view' ? 'design.knowledge.view' : item === 'edit' ? 'design.knowledge.editMode' : 'design.knowledge.agentMode')}</button>)}</div>
    {mode === 'edit' && <form className="material-upload" onSubmit={(event) => void submit(event)}><label className="design-field"><span>{t('design.material.file')}</span><input type="file" accept="image/png,image/jpeg,image/webp" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label><label className="design-field"><span>{t('design.material.description')}</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t('design.material.descriptionHint')} /></label><label className="design-field"><span>{t('design.material.tags')}</span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder={t('design.material.tagsHint')} /></label><label className="design-field"><span>{t('design.material.source')}</span><select value={source} onChange={(event) => setSource(event.target.value as MaterialView['source'])}><option value="human_shot">{t('design.material.source.human')}</option><option value="ai_generated">{t('design.material.source.ai')}</option><option value="stock">{t('design.material.source.stock')}</option><option value="client_provided">{t('design.material.source.client')}</option></select></label><button type="submit" className="design-btn design-btn--primary" disabled={busy || file === null}>{busy ? t('design.material.uploading') : t('design.material.uploadAction')}</button></form>}
    {mode === 'agent' && <section className="agent-guide"><h2>asset_search</h2><p>{t('design.material.agentBody')}</p><pre>{t('design.material.agentExample')}</pre></section>}
    <form className="library-search" onSubmit={(event) => { event.preventDefault(); void load(); }}><input aria-label={t('design.material.search')} placeholder={t('design.material.search')} value={query} onChange={(event) => setQuery(event.target.value)} /><button type="submit" className="design-btn">{t('design.material.search')}</button></form>
    {message !== null && <p className="design-note" role="status">{message}</p>}
    {loading ? <p className="design-empty">{t('design.common.loading')}</p> : visibleItems.length === 0 ? <div className="design-empty"><p className="design-empty__title">{t('design.material.empty')}</p><p>{t('design.material.emptyBody')}</p></div> : <div className="material-grid">{visibleItems.map((item) => <article className="material-card" key={item.id}><img src={item.previewUrl} alt={item.description || item.name} /><div><h3>{item.name}</h3><p>{item.description}</p><footer><span>{item.width}×{item.height}</span><span>{t(`design.material.source.${item.source === 'human_shot' ? 'human' : item.source === 'ai_generated' ? 'ai' : item.source === 'client_provided' ? 'client' : 'stock'}`)}</span></footer></div></article>)}</div>}
  </div>;
}

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { t } from '@company-os/i18n';
import {
  createComposition,
  renderProjectCarousel,
  fetchProjectCreative,
  type CarouselOutput,
  type CarouselSlide,
  type CompositionView,
  type MaterialView,
  type ProjectCreativeWorkspace,
  type ProjectDetail,
} from '../api';

function failureText(result: { ok: false; failure: import('../api').ApiFailure }): string {
  if (result.failure.kind === 'network') return t('error.network');
  return result.failure.message ?? result.failure.reasons.join('；') ?? result.failure.error ?? t('design.studio.failed');
}

function SlideCanvas({ slide, workspace, materials, small = false }: {
  slide: CarouselSlide; workspace: ProjectCreativeWorkspace; materials: Map<string, MaterialView>; small?: boolean;
}) {
  const material = slide.materialId === null ? null : materials.get(slide.materialId) ?? null;
  const style = {
    '--carousel-primary': workspace.brand.colors.primary,
    '--carousel-ink': workspace.brand.colors.ink,
    '--carousel-paper': workspace.brand.colors.paper,
    '--carousel-accent': workspace.brand.colors.accent,
    '--carousel-display': workspace.brand.fonts.display,
    '--carousel-body': workspace.brand.fonts.body,
  } as CSSProperties;
  return (
    <div className={`slide-canvas slide-canvas--${slide.role} ${small ? 'slide-canvas--small' : ''}`} style={style}>
      <span className="slide-canvas__brand">{workspace.brand.brandName}</span>
      {material !== null && <img className="slide-canvas__image" src={material.previewUrl} alt={material.description || material.name} />}
      <div className="slide-canvas__copy">
        <strong>{slide.headline}</strong>
        <p>{slide.body}</p>
        {slide.role === 'cta' && slide.cta !== '' && <span className="slide-canvas__cta">{slide.cta}</span>}
      </div>
    </div>
  );
}

function OutputPreview({ output }: { output: CarouselOutput }) {
  const pages = output.files.filter((file) => file.kind === 'page');
  const archive = output.files.find((file) => file.kind === 'archive');
  return (
    <section className="output-preview">
      <div className="output-preview__head">
        <div><h3>{t('design.studio.latestOutput')}</h3><p>{t('design.studio.outputVersion')} {output.compositionVersionNo}</p></div>
        {archive !== undefined && <a className="design-btn design-btn--primary" href={archive.url} download>{t('design.studio.downloadZip')}</a>}
      </div>
      <div className="output-preview__grid">
        {pages.map((file) => (
          <a key={file.id} href={file.url} download className="output-page">
            <img src={file.url} alt={file.name} loading="lazy" />
            <span>{file.name}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

export function CreativeWorkspace({ project, onChanged }: { project: ProjectDetail; onChanged: () => void }) {
  const [workspace, setWorkspace] = useState<ProjectCreativeWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'compose' | 'save' | 'render' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedMaterials, setSelectedMaterials] = useState<string[] | null>(null);
  const [selectedKnowledge, setSelectedKnowledge] = useState<string[] | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CarouselSlide[]>([]);
  const [activeSlideId, setActiveSlideId] = useState('cover');

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchProjectCreative(project.id);
    if (!result.ok) {
      setError(failureText(result));
      setLoading(false);
      return;
    }
    setWorkspace(result.data.workspace);
    setError(null);
    setLoading(false);
    setCurrentId((current) => current ?? result.data.workspace.compositions[0]?.id ?? null);
  }, [project.id]);

  useEffect(() => { void load(); }, [load]);
  const current: CompositionView | null = workspace?.compositions.find((item) => item.id === currentId) ?? workspace?.compositions[0] ?? null;
  useEffect(() => {
    if (current !== null) {
      setDraft(current.slides);
      setActiveSlideId(current.slides[0]?.id ?? 'cover');
    }
  }, [current?.id]);

  const materials = useMemo(() => new Map(workspace?.materials.map((item) => [item.id, item])), [workspace]);
  const activeSlide = draft.find((slide) => slide.id === activeSlideId) ?? draft[0] ?? null;

  function toggleMaterial(id: string): void {
    const all = workspace?.materials.map((item) => item.id) ?? [];
    const currentIds = selectedMaterials ?? all;
    setSelectedMaterials(currentIds.includes(id) ? currentIds.filter((item) => item !== id) : [...currentIds, id]);
  }
  function toggleKnowledge(id: string): void {
    const all = workspace?.knowledge.map((item) => item.id) ?? [];
    const currentIds = selectedKnowledge ?? all;
    setSelectedKnowledge(currentIds.includes(id) ? currentIds.filter((item) => item !== id) : [...currentIds, id]);
  }
  function updateActive(patch: Partial<CarouselSlide>): void {
    if (activeSlide === null) return;
    setDraft((slides) => slides.map((slide) => slide.id === activeSlide.id ? { ...slide, ...patch } : slide));
  }

  async function compose(): Promise<void> {
    if (workspace === null) return;
    setBusy('compose'); setError(null); setNotice(null);
    const result = await createComposition(project.id, {
      ...(selectedMaterials === null ? {} : { materialIds: selectedMaterials }),
      ...(selectedKnowledge === null ? {} : { knowledgeIds: selectedKnowledge }),
      ...(current === null ? {} : { basedOnId: current.id }),
    }, crypto.randomUUID());
    setBusy(null);
    if (!result.ok) { setError(failureText(result)); return; }
    setCurrentId(result.data.composition.id);
    setDraft(result.data.composition.slides);
    await load(); onChanged();
  }

  async function save(): Promise<void> {
    if (current === null) return;
    setBusy('save'); setError(null); setNotice(null);
    const result = await createComposition(project.id, { slides: draft, basedOnId: current.id }, crypto.randomUUID());
    setBusy(null);
    if (!result.ok) { setError(failureText(result)); return; }
    setCurrentId(result.data.composition.id);
    setDraft(result.data.composition.slides);
    setNotice(t('design.studio.saved'));
    await load(); onChanged();
  }

  async function render(): Promise<void> {
    if (current === null) return;
    setBusy('render'); setError(null); setNotice(null);
    const result = await renderProjectCarousel(project.id, current.id, crypto.randomUUID());
    setBusy(null);
    if (!result.ok) { setError(failureText(result)); return; }
    setNotice(t('design.studio.generated'));
    await load(); onChanged();
  }

  if (loading) return <p className="design-empty" role="status">{t('design.common.loading')}</p>;
  if (workspace === null) return <div className="design-empty" role="alert"><p>{error ?? t('design.studio.loadFailed')}</p><button type="button" className="design-btn" onClick={() => void load()}>{t('design.common.retry')}</button></div>;

  return (
    <div className="creative-workspace">
      {error !== null && <p className="design-note design-note--error" role="alert">{error}</p>}
      {notice !== null && <p className="design-note" role="status">{notice}</p>}

      {current === null ? (
        <section className="creative-setup">
          <div className="creative-setup__intro"><h2>{t('design.studio.setupTitle')}</h2><p>{t('design.studio.setupLead')}</p></div>
          <SourcePicker workspace={workspace} selectedMaterials={selectedMaterials} selectedKnowledge={selectedKnowledge} onMaterial={toggleMaterial} onKnowledge={toggleKnowledge} />
          <button type="button" className="design-btn design-btn--primary design-btn--large" disabled={busy !== null || workspace.knowledge.length === 0} onClick={() => void compose()}>
            {busy === 'compose' ? t('design.studio.generating') : t('design.studio.generate')}
          </button>
        </section>
      ) : (
        <>
          <div className="studio-toolbar">
            <label>{t('design.studio.version')}
              <select value={current.id} onChange={(event) => setCurrentId(event.target.value)}>
                {workspace.compositions.map((item) => <option key={item.id} value={item.id}>v{item.versionNo}</option>)}
              </select>
            </label>
            <div className="studio-toolbar__actions">
              <button type="button" className="design-btn" disabled={busy !== null} onClick={() => void save()}>{busy === 'save' ? t('design.studio.saving') : t('design.studio.saveVersion')}</button>
              <button type="button" className="design-btn design-btn--primary" disabled={busy !== null} onClick={() => void render()}>{busy === 'render' ? t('design.studio.rendering') : t('design.studio.render')}</button>
            </div>
          </div>

          <div className="studio-editor">
            <aside className="studio-filmstrip" aria-label={t('design.studio.slides')}>
              {draft.map((slide, index) => (
                <button type="button" key={slide.id} className={slide.id === activeSlide?.id ? 'studio-thumb studio-thumb--active' : 'studio-thumb'} onClick={() => setActiveSlideId(slide.id)}>
                  <span>{index + 1}</span><SlideCanvas slide={slide} workspace={workspace} materials={materials} small />
                </button>
              ))}
            </aside>
            <div className="studio-stage">
              {activeSlide !== null && <SlideCanvas slide={activeSlide} workspace={workspace} materials={materials} />}
            </div>
            <aside className="studio-inspector">
              <h3>{t('design.studio.edit')}</h3>
              {activeSlide !== null && <>
                <label className="design-field"><span>{t('design.studio.headline')}</span><textarea value={activeSlide.headline} rows={3} onChange={(event) => updateActive({ headline: event.target.value })} /></label>
                <label className="design-field"><span>{t('design.studio.body')}</span><textarea value={activeSlide.body} rows={9} onChange={(event) => updateActive({ body: event.target.value })} /></label>
                {activeSlide.role === 'cta' && <label className="design-field"><span>{t('design.studio.cta')}</span><input value={activeSlide.cta} onChange={(event) => updateActive({ cta: event.target.value })} /></label>}
                <label className="design-field"><span>{t('design.studio.image')}</span><select value={activeSlide.materialId ?? ''} onChange={(event) => updateActive({ materialId: event.target.value === '' ? null : event.target.value })}><option value="">{t('design.studio.noImage')}</option>{workspace.materials.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              </>}
              <div className="studio-lint"><h4>{t('design.studio.lint')}</h4>{current.lint.length === 0 ? <p>{t('design.studio.noLint')}</p> : current.lint.map((item, index) => <p key={`${item.code}-${index}`}>{item.message}</p>)}</div>
            </aside>
          </div>
          <p className="studio-render-hint">{t('design.studio.renderHint')}</p>
          {workspace.outputs[0] !== undefined && <OutputPreview output={workspace.outputs[0]} />}
          <details className="studio-recompose"><summary>{t('design.studio.setupTitle')}</summary><SourcePicker workspace={workspace} selectedMaterials={selectedMaterials} selectedKnowledge={selectedKnowledge} onMaterial={toggleMaterial} onKnowledge={toggleKnowledge} /><button type="button" className="design-btn" disabled={busy !== null} onClick={() => void compose()}>{t('design.studio.generate')}</button></details>
        </>
      )}
    </div>
  );
}

function SourcePicker({ workspace, selectedMaterials, selectedKnowledge, onMaterial, onKnowledge }: {
  workspace: ProjectCreativeWorkspace; selectedMaterials: string[] | null; selectedKnowledge: string[] | null;
  onMaterial: (id: string) => void; onKnowledge: (id: string) => void;
}) {
  return (
    <div className="source-picker">
      <section className="source-brand"><h3>{t('design.studio.brandRules')}</h3><strong>{workspace.brand.brandName}</strong><div className="source-brand__colors">{Object.entries(workspace.brand.colors).map(([role, color]) => <span key={role} style={{ background: color }} title={color} />)}</div><p>{workspace.brand.fonts.display}</p>{workspace.brand.pages.length === 0 && <small>{t('design.studio.noBrandRules')}</small>}</section>
      <section><h3>{t('design.studio.materials')}</h3>{workspace.materials.length === 0 ? <p>{t('design.studio.noMaterials')}</p> : <div className="source-materials">{workspace.materials.map((item) => <label key={item.id} className="source-material"><input type="checkbox" checked={selectedMaterials === null || selectedMaterials.includes(item.id)} onChange={() => onMaterial(item.id)} /><img src={item.previewUrl} alt="" /><span>{item.name}</span></label>)}</div>}</section>
      <section><h3>{t('design.studio.knowledge')}</h3>{workspace.knowledge.length === 0 ? <p>{t('design.studio.noKnowledge')}</p> : <div className="source-knowledge">{workspace.knowledge.map((item) => <label key={item.id}><input type="checkbox" checked={selectedKnowledge === null || selectedKnowledge.includes(item.id)} onChange={() => onKnowledge(item.id)} /><span><strong>{item.title}</strong><small>{item.current?.summary}</small></span></label>)}</div>}</section>
    </div>
  );
}

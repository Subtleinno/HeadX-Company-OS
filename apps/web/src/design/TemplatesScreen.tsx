import { useEffect, useState } from 'react';
import { t } from '@company-os/i18n';
import { fetchTemplates, type CarouselTemplate, type ProjectFormat } from '../api';

export function TemplatesScreen({ format = 'all' }: { format?: ProjectFormat | 'all' }) {
  const [templates, setTemplates] = useState<CarouselTemplate[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { void fetchTemplates().then((result) => { if (result.ok) setTemplates(result.data.templates); else setFailed(true); }); }, []);
  if (failed) return <p className="design-note design-note--error">{t('design.template.loadFailed')}</p>;
  if (templates === null) return <p className="design-empty">{t('design.common.loading')}</p>;
  const visibleTemplates = format === 'all' || format === 'carousel' ? templates : [];
  const title = format === 'all'
    ? t('design.template.title')
    : t('design.template.formatTitle', { format: t(`design.project.format.${format}`) });
  return <div className="templates-page" data-design-page="templates"><div className="library-hero"><div><h2>{title}</h2><p>{t('design.template.lead')}</p></div></div>{visibleTemplates.length === 0 ? <div className="design-empty"><p className="design-empty__title">{t('design.template.emptyFormat')}</p><p>{t('design.template.emptyFormatBody')}</p></div> : <div className="template-grid">{visibleTemplates.map((template) => <article className={`template-card template-card--${template.role}`} key={template.id}><div className="template-card__preview"><span>HeadX</span><strong>{t(`design.template.preview.${template.role}`)}</strong><i /></div><div className="template-card__body"><h2>{template.name}</h2><p>{template.summary}</p><dl><dt>ID</dt><dd>{template.id} · v{template.version}</dd></dl><h3>{t('design.template.slots')}</h3><ul>{template.slots.map((slot) => <li key={slot.key}><code>{slot.key}</code><span>{slot.required ? t('design.template.required') : t('design.template.optional')}{slot.maxChars === undefined ? '' : ` · ${slot.maxChars}`}</span></li>)}</ul><details><summary>{t('design.template.agent')}</summary><pre>{JSON.stringify({ id: template.id, version: template.version, role: template.role, slots: template.slots }, null, 2)}</pre></details></div></article>)}</div>}</div>;
}

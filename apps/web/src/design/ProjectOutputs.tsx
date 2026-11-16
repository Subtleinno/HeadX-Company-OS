import { useCallback, useEffect, useState } from 'react';
import { t } from '@company-os/i18n';
import { fetchOutputs, type CarouselOutput } from '../api';

export function ProjectOutputs({ projectId, brandId }: { projectId?: string; brandId?: string }) {
  const [outputs, setOutputs] = useState<CarouselOutput[] | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setError(false);
    const result = await fetchOutputs({ ...(projectId === undefined ? {} : { projectId }), ...(brandId === undefined ? {} : { brandId }) });
    if (result.ok) setOutputs(result.data.outputs);
    else setError(true);
  }, [projectId, brandId]);
  useEffect(() => { void load(); }, [load]);

  if (error) return <div className="design-empty"><p>{t('design.outputs.loadFailed')}</p><button type="button" className="design-btn" onClick={() => void load()}>{t('design.common.retry')}</button></div>;
  if (outputs === null) return <p className="design-empty">{t('design.common.loading')}</p>;
  if (outputs.length === 0) return <div className="design-empty"><p className="design-empty__title">{t('design.outputs.empty')}</p><p>{t('design.outputs.emptyBody')}</p></div>;

  return <div className="outputs-list">{outputs.map((output) => {
    const pages = output.files.filter((file) => file.kind === 'page');
    const archive = output.files.find((file) => file.kind === 'archive');
    return <article className="output-card" key={output.id}>
      <div className="output-card__head"><div><h2>Carousel · v{output.compositionVersionNo}</h2><p>{new Date(output.createdAt).toLocaleString('zh-HK')}</p></div>{archive !== undefined && <a className="design-btn design-btn--primary" href={archive.url} download>{t('design.studio.downloadZip')}</a>}</div>
      <div className="output-card__pages">{pages.map((file) => <a key={file.id} href={file.url} download><img src={file.url} alt={file.name} loading="lazy" /><span>{file.name}</span></a>)}</div>
      <details className="output-provenance"><summary>{t('design.studio.provenance')} · {output.provenance.length}</summary><ul>{output.provenance.map((item, index) => <li key={`${item.kind}-${item.objectId}-${index}`}><strong>{t(`design.studio.source.${item.kind}`)}</strong><span>{item.objectId}</span><small>{item.version}</small></li>)}</ul></details>
    </article>;
  })}</div>;
}

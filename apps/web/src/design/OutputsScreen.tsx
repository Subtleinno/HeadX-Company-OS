import { t } from '@company-os/i18n';
import { ProjectOutputs } from './ProjectOutputs';

export function OutputsScreen({ brandId }: { brandId: string | null }) {
  return <div className="outputs-page" data-design-page="outputs"><div className="library-hero"><div><h2>{t('design.outputs.title')}</h2><p>{t('design.outputs.lead')}</p></div></div>{brandId === null ? <div className="design-empty"><p>{t('design.outputs.empty')}</p></div> : <ProjectOutputs brandId={brandId} />}</div>;
}

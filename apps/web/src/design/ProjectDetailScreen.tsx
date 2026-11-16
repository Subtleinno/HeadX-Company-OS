import { useCallback, useEffect, useState } from 'react';
import { t } from '@company-os/i18n';
import { fetchProject, type ProjectBriefVersion, type ProjectDetail } from '../api';
import { navigatePath } from '../router';
import { failureMessage } from './apiFailure';
import { formatProjectTime, projectStateLabel } from './projectState';
import { CreativeWorkspace } from './CreativeWorkspace';
import { ProjectOutputs } from './ProjectOutputs';

type State = { kind: 'loading' } | { kind: 'ready'; project: ProjectDetail } | { kind: 'notFound' } | { kind: 'denied' } | { kind: 'failed'; message: string };
type Tab = 'studio' | 'brief' | 'outputs' | 'agent';

export function ProjectDetailScreen({ projectId }: { projectId: string | null }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [tab, setTab] = useState<Tab>('studio');
  const [selectedBriefId, setSelectedBriefId] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const load = useCallback(async () => {
    if (projectId === null) { setState({ kind: 'notFound' }); return; }
    const result = await fetchProject(projectId);
    if (result.ok) {
      setState({ kind: 'ready', project: result.data.project });
      setSelectedBriefId((selected) => selected ?? result.data.project.brief?.id ?? null);
    } else if (result.failure.kind === 'http' && result.failure.status === 404) setState({ kind: 'notFound' });
    else if (result.failure.kind === 'http' && (result.failure.status === 401 || result.failure.status === 403)) setState({ kind: 'denied' });
    else setState({ kind: 'failed', message: failureMessage(result.failure, t('design.project.detailFailed')) });
  }, [projectId]);

  useEffect(() => { setState({ kind: 'loading' }); setTab('studio'); void load(); }, [load]);

  if (state.kind === 'loading') return <p className="design-empty" role="status">{t('design.project.loading')}</p>;
  if (state.kind === 'notFound') return <p className="design-empty" role="alert">{t('design.project.notFound')}</p>;
  if (state.kind === 'denied') return <p className="design-note design-note--error" role="alert">{t('design.project.permissionDenied')}</p>;
  if (state.kind === 'failed') return <div className="design-empty" role="alert"><p>{state.message}</p><button type="button" className="design-btn" onClick={() => void load()}>{t('common.retry')}</button></div>;

  const { project } = state;
  const shownBrief = project.briefVersions.find((version) => version.id === selectedBriefId) ?? project.brief;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'studio', label: t('design.studio.tab') }, { id: 'brief', label: t('design.project.briefTab') },
    { id: 'outputs', label: t('design.studio.outputsTab') }, { id: 'agent', label: t('design.studio.agentTab') },
  ];

  return (
    <article className="project-detail project-workspace" data-design-page="project-detail">
      <div className="project-workspace__head">
        <div><button type="button" className="design-link" onClick={() => navigatePath('/design', 'create', project.format)}>{t('design.project.back')}</button><h2>{project.title}</h2><p>{project.brandName} · {t(`design.project.format.${project.format}`)}</p></div>
        <span className={`project-state project-state--${project.state}`}>{projectStateLabel(project.state)}</span>
      </div>
      <div className="project-tabs" role="tablist" aria-label={project.title}>
        {tabs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'project-tab project-tab--active' : 'project-tab'} onClick={() => setTab(item.id)}>{item.label}</button>)}
      </div>

      {tab === 'studio' && (project.format === 'carousel'
        ? <CreativeWorkspace project={project} onChanged={() => void load()} />
        : <div className="design-empty"><p className="design-empty__title">{t('design.studio.unsupportedTitle')}</p><p>{t('design.studio.unsupportedBody')}</p></div>)}
      {tab === 'outputs' && <ProjectOutputs projectId={project.id} />}
      {tab === 'brief' && <div className="project-brief-layout">
        <div className="project-brief-main">
          <section className="project-panel project-original"><div className="project-panel__heading"><div><h2>{t('design.project.originalRequest')}</h2><p>{t('design.project.originalRequestNote')}</p></div><button type="button" className="design-btn" onClick={() => { void navigator.clipboard.writeText(project.originalRequest.body).then(() => setCopyState('copied')).catch(() => setCopyState('failed')); }}>{t('design.project.copyRequest')}</button></div><p className="project-original__body">{project.originalRequest.body}</p><p className="project-meta">{t('design.project.createdAt')}：{formatProjectTime(project.originalRequest.createdAt)}</p>{copyState !== 'idle' && <p className="design-note">{t(copyState === 'failed' ? 'design.project.copyFailed' : 'design.project.copied')}</p>}</section>
          <section className="project-panel project-brief"><div className="project-panel__heading"><div><h2>{shownBrief === null ? t('design.project.briefEmpty') : t('design.project.currentBrief')}</h2>{shownBrief !== null && <p>{shownBrief.agentName}・{formatProjectTime(shownBrief.createdAt)}</p>}</div></div>{shownBrief === null ? <p className="project-brief__empty">{t('design.project.briefEmptyBody')}</p> : <BriefDocumentView version={shownBrief} />}</section>
        </div>
        <aside className="project-history"><h2>{t('design.project.briefVersions')}</h2>{project.briefVersions.length === 0 ? <p>{t('design.project.noBriefShort')}</p> : <ol className="project-history__list">{project.briefVersions.map((version) => <li key={version.id}><button type="button" className={version.id === shownBrief?.id ? 'project-history__version project-history__version--active' : 'project-history__version'} onClick={() => setSelectedBriefId(version.id)}><span>{t('design.project.version')} {version.versionNo}</span><small>{formatProjectTime(version.createdAt)}</small></button></li>)}</ol>}</aside>
      </div>}
      {tab === 'agent' && <AgentPanel project={project} />}
    </article>
  );
}

function AgentPanel({ project }: { project: ProjectDetail }) {
  const [copied, setCopied] = useState(false);
  const config = JSON.stringify({ mcpServers: { 'headx-creative': { url: `${window.location.origin}/api/mcp`, headers: { Authorization: 'Bearer ${HEADX_AGENT_TOKEN}' } } } }, null, 2);
  return <div className="agent-workspace">
    <section><h2>{t('design.studio.agentTitle')}</h2><p>{t('design.studio.agentBody')}</p><div className="agent-workspace__status"><strong>{project.agentRun === null ? t('design.project.agentWaiting') : t('design.project.agentClaimed')}</strong><span>{project.agentRun?.agentName ?? 'MCP'}</span></div></section>
    <section><h3>{t('design.studio.mcpEndpoint')}</h3><pre>{config}</pre><button type="button" className="design-btn" onClick={() => { void navigator.clipboard.writeText(config).then(() => setCopied(true)); }}>{t('design.studio.copyConfig')}</button>{copied && <p className="design-note">{t('design.studio.configCopied')}</p>}</section>
    <section><h3>{t('design.studio.mcpTools')}</h3><div className="agent-tools">{['create_map', 'brand_get_rules', 'asset_search', 'kb_search', 'kb_get', 'template_list', 'project_get', 'project_claim', 'brief_submit', 'composition_submit', 'job_submit', 'job_status', 'review_checklist'].map((tool) => <code key={tool}>{tool}</code>)}</div></section>
  </div>;
}

function BriefDocumentView({ version }: { version: ProjectBriefVersion }) {
  const fields = [
    ['design.project.objective', version.document.objective], ['design.project.audience', version.document.audience],
    ['design.project.channel', version.document.channel], ['design.project.format', version.document.format],
    ['design.project.language', version.document.language], ['design.project.dueDate', version.document.dueDate ?? t('design.project.noDueDate')],
  ] as const;
  return <div className="brief-document"><dl className="brief-document__grid">{fields.map(([labelKey, value]) => <div key={labelKey}><dt>{t(labelKey)}</dt><dd>{value}</dd></div>)}</dl><div className="brief-document__constraints"><h3>{t('design.project.constraints')}</h3>{version.document.constraints.length === 0 ? <p>{t('design.project.noConstraints')}</p> : <ul>{version.document.constraints.map((item) => <li key={item}>{item}</li>)}</ul>}</div><details className="project-provenance"><summary>{t('design.project.source')}</summary><dl><div><dt>{t('design.project.sourceAgent')}</dt><dd>{version.agentName}</dd></div><div><dt>{t('design.project.requestId')}</dt><dd>{version.requestId}</dd></div><div><dt>{t('design.project.submittedAt')}</dt><dd>{formatProjectTime(version.createdAt)}</dd></div></dl></details></div>;
}

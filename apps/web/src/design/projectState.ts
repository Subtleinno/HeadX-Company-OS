import { t, type MessageKey } from '@company-os/i18n';
import type { ProjectState } from '../api';

const STATE_KEY: Record<ProjectState, MessageKey> = {
  awaiting_agent: 'design.project.state.awaiting_agent',
  planning: 'design.project.state.planning',
  waiting_materials: 'design.project.state.waiting_materials',
  ready_to_render: 'design.project.state.ready_to_render',
  rendering: 'design.project.state.rendering',
  produced: 'design.project.state.produced',
  received: 'design.project.state.received',
};

export function projectStateLabel(state: ProjectState): string {
  return t(STATE_KEY[state]);
}

export function formatProjectTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString('zh-HK', { dateStyle: 'medium', timeStyle: 'short' });
}

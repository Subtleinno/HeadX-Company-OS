// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { CompositionView, ProjectCreativeWorkspace, ProjectDetail } from '@company-os/contracts';
import './helpers/rtl';
import { App } from '../src/App';
import { resetDirectoryCache } from '../src/frame/useDirectory';
import { installFakeApi, jsonResponse, resetBrowserState } from './helpers/fake-api';

const projectId = '2e0ab540-64b0-4e21-b0f2-e67a38d8d001';
const materialId = '0d88a56d-c246-4269-a4f8-4b4b73cdce01';
const docId = '56c49b02-9c9b-4f1f-a22f-b15cb30e9a6e';
const versionId = '0d1720e0-e69f-4fb3-a5dd-12ffcfad82e1';
const chunkId = '46eeaf8f-7046-4e3a-9ea0-dde5aa5a52f6';
const project: ProjectDetail = {
  id: projectId, brandId: 'b-moonic', brandName: 'Moonic', title: '經期前日常照顧', format: 'carousel', previewUrl: null, state: 'awaiting_agent', briefVersionNo: null, agentRun: null, createdAt: '2026-11-16T08:00:00.000Z',
  originalRequest: { id: '46eeaf8f-7046-4e3a-9ea0-dde5aa5a52f6', body: '做五頁 Carousel', createdBy: 'u-boss', createdAt: '2026-11-16T08:00:00.000Z' }, brief: null, briefVersions: [],
};
const slides = [
  { id: 'cover', role: 'cover' as const, headline: '經期前日常照顧', body: '由身體訊號開始', cta: '', materialId, knowledgeRefs: [{ docId, versionId, chunkId }] },
  ...[1, 2, 3].map((index) => ({ id: `point-${index}`, role: 'body' as const, headline: `重點 ${index}`, body: '實際知識內容', cta: '', materialId: null, knowledgeRefs: [{ docId, versionId, chunkId }] })),
  { id: 'cta', role: 'cta' as const, headline: '把重點留在日常', body: '由身體訊號開始', cta: '與我們聊聊', materialId: null, knowledgeRefs: [{ docId, versionId, chunkId }] },
];
const composition: CompositionView = {
  id: 'db9a82d0-c24e-4b62-96ee-3a8f5c332001', projectId, versionNo: 1, basedOnId: null, briefVersionId: null, brandReleaseId: null,
  slides, sourceRefs: { materialIds: [materialId], knowledge: [{ docId, versionId, chunkId }], templateIds: [] }, lint: [], actorType: 'human', actorId: 'u-boss', requestId: 'test', createdAt: '2026-11-16T10:00:00.000Z',
};
const workspace: ProjectCreativeWorkspace = {
  brand: { brandId: 'b-moonic', brandName: 'Moonic', releaseId: null, releaseNo: null, colors: { primary: '#7B5E57', ink: '#171717', paper: '#F7F6F3', accent: '#7B5E57' }, fonts: { display: 'Inter', body: 'Inter' }, tone: { traits: [], banned: [], languagePolicy: '' }, image: { composition: '', light: '', space: '' }, pages: [] },
  materials: [{ id: materialId, brandId: 'b-moonic', name: '香港日常', contentType: 'image/png', sizeBytes: 100, sha256: 'a'.repeat(64), width: 1080, height: 1350, source: 'human_shot', description: '日常', tags: [], versionNo: 1, previewUrl: '/api/materials/x/file', originalUrl: '/api/materials/x/file', createdAt: '2026-11-16T09:00:00.000Z' }],
  knowledge: [{ id: docId, brandId: 'b-moonic', title: '經期前照顧', status: 'verified', createdAt: '2026-11-16T09:00:00.000Z', current: { id: versionId, versionNo: 1, summary: '日常照顧', bodyMd: '## 重點\n內容', sources: [], jurisdiction: ['HK'], reviewBy: null, chunks: [{ id: chunkId, heading: '重點', body: '內容', ordinal: 0 }], createdAt: '2026-11-16T09:00:00.000Z' } }],
  templates: [], compositions: [], outputs: [],
};

describe('Carousel 創作工作台', () => {
  afterEach(() => { cleanup(); resetBrowserState(); resetDirectoryCache(); });
  it('選資料組稿、直接編輯、追加版本並顯示真 Output', async () => {
    let currentWorkspace = workspace;
    window.history.replaceState(null, '', `/#/design/create/projects/${projectId}/brief`);
    const api = installFakeApi({
      state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user: { id: 'u-boss', email: 'boss@example.com', displayName: '老闆', role: 'owner' } }),
      modules: () => jsonResponse(200, { modules: [{ id: 'design', title: 'Marketing Design', kind: 'department', department: 'design', order: 10, available: true, route: '/design' }] }),
      brands: () => jsonResponse(200, { items: [{ id: 'b-moonic', code: 'moonic', name: 'Moonic' }] }),
      brandFocus: () => jsonResponse(200, { brandId: 'b-moonic' }), brandPages: () => jsonResponse(200, { items: [], canEdit: true }),
      projectDetail: () => jsonResponse(200, { project }), projectCreative: () => jsonResponse(200, { workspace: currentWorkspace }),
      compositionCreate: () => {
        const saved = currentWorkspace.compositions.length === 0 ? composition : {
          ...composition,
          id: 'db9a82d0-c24e-4b62-96ee-3a8f5c332002',
          versionNo: 2,
          basedOnId: composition.id,
        };
        currentWorkspace = { ...currentWorkspace, compositions: [saved, ...currentWorkspace.compositions] };
        return jsonResponse(201, { composition: saved, created: true });
      },
      render: () => {
        const latest = currentWorkspace.compositions[0] ?? composition;
        const output = { id: 'output-1', projectId, compositionId: latest.id, compositionVersionNo: latest.versionNo, profile: 'carousel-png' as const, createdAt: '2026-11-16T10:10:00.000Z', files: [{ id: 'file-1', name: 'slide-01.png', kind: 'page' as const, contentType: 'image/png', sizeBytes: 1000, sha256: 'b'.repeat(64), width: 1080, height: 1350, url: '/api/output-files/file-1' }], provenance: [] };
        currentWorkspace = { ...currentWorkspace, outputs: [output, ...currentWorkspace.outputs] };
        return jsonResponse(201, { output, created: true });
      },
    });
    render(<App />);
    const compose = await screen.findByRole('button', { name: '由已選資料組稿' });
    const materialChoice = screen.getByRole('checkbox', { name: /香港日常/ });
    const knowledgeChoice = screen.getByRole('checkbox', { name: /經期前照顧/ });
    await userEvent.click(materialChoice);
    await userEvent.click(materialChoice);
    await userEvent.click(knowledgeChoice);
    await userEvent.click(knowledgeChoice);
    await userEvent.click(compose);
    await waitFor(() => expect(api.count('compositionCreate')).toBe(1));
    expect(JSON.parse(api.calls.find((call) => call.path.endsWith('/compositions'))?.body ?? '{}')).toMatchObject({ materialIds: [materialId], knowledgeIds: [docId] });
    expect(await screen.findByRole('button', { name: '用 HyperFrames 產生 PNG' })).toBeTruthy();
    const title = screen.getByLabelText('標題');
    await userEvent.clear(title); await userEvent.type(title, '新標題');
    await userEvent.click(screen.getByRole('button', { name: '儲存為新版本' }));
    await waitFor(() => expect(api.count('compositionCreate')).toBe(2));
    await userEvent.click(screen.getByRole('button', { name: '用 HyperFrames 產生 PNG' }));
    await waitFor(() => expect(api.count('render')).toBe(1));
    expect(await screen.findByText('Carousel 已產生，可預覽或下載。')).toBeTruthy();
  });
});

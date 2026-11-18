export { registerBrandGuide } from './routes.js';
export { registerBrandGuideAgent } from './agent-routes.js';
export {
  attachFile,
  getBlock,
  listBlocks,
  removeFile,
  saveDecision,
  savePrompt,
  saveRationale,
} from './blocks.js';
export type { DecisionActor, GuideBlock, GuideBlockFile, GuideBlockRevision } from './blocks.js';
export { getApproval, saveApproval } from './approval.js';
export type { ApprovalStatus, GuideApproval } from './approval.js';
export {
  getGuideBrief,
  getGuideState,
  listGuideAnswers,
  listGuideBriefs,
  listGuideMap,
  listGuideOptions,
  saveGuideAnswer,
  saveGuideState,
} from './store.js';
export type { GuideAnswer, GuideMapDimension, GuideOption } from './store.js';
export { GUIDE_STAGES } from './schema.js';
export type { GuideStage } from './schema.js';
export {
  buildDesignDoc,
  buildTokenFile,
  isLayerKind,
  projectLayer,
  LAYER_KINDS,
} from './layer.js';
export type { LayerKind, LayerProjection, LayerSection, TokenConflict } from './layer.js';

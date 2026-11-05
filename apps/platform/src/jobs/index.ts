/**
 * 背景工作隊列的對外介面（issue #85）。
 *
 * 第三段（其他平台模組）只可以經這裡使用隊列；`jobs/` 底下的其他檔案是內部實作。
 * 沒有任何 HTTP 路由：這一張明確不提供公開 enqueue，也不提供「執行任意工作」的入口。
 */

export { backoffDelayMs, DEFAULT_BACKOFF } from './backoff.js';
export type { BackoffConfig } from './backoff.js';

export { DEFAULT_JOBS_CONFIG, parseJobsConfig } from './config.js';
export type { JobsConfig } from './config.js';

export { createJobQueue, JobValidationError } from './queue.js';
export type { EnqueueInput, FailInput, FailOutcome, JobQueue, JobQueueOptions } from './queue.js';

export { createHandlerRegistry } from './registry.js';
export type { HandlerRegistry, JobHandler } from './registry.js';

export { createWorker } from './worker.js';
export type { JobWorker, WorkerEvent, WorkerOptions } from './worker.js';

export { JOB_STATES, JobFailure, TERMINAL_JOB_STATES } from './types.js';
export type { JobContext, JobRow, JobState } from './types.js';

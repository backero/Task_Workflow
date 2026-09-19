/**
 * Runtime configuration. `API_BASE_URL` is not a secret, so a plain
 * constant is sufficient (same reasoning as apps/admin-web/src/config.ts).
 * Override per-environment as part of the release process.
 *
 * Points at Task_Workflow's Node/Express + MongoDB Atlas backend
 * (backero-backend), not this repo's own Python backend/ — the latter is
 * being retired, all backend work happens on the Node side going forward.
 * Response-shape differences (envelope, camelCase fields) are absorbed by
 * api/nodeAdapters.ts, not by the page components.
 */
export const API_BASE_URL = import.meta.env.DEV ? 'http://localhost:5000' : 'https://api.backero.com';

export const API_V1_PREFIX = '/api';

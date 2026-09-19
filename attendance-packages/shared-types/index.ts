/**
 * Shared API contract types/Zod schemas, mirrored against the backend's
 * Pydantic schemas so validation rules don't drift between client and
 * server (spec §5). Populated starting Phase 2 as each domain module's
 * endpoints are built — intentionally empty in Phase 1, which has no
 * client-facing domain schemas beyond auth (kept backend-only for now
 * since no frontend consumes it yet).
 */
export {};

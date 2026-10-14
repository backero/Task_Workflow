// Imported first by index.ts so tables exist before any route module runs its
// top-level sqlite.prepare(...) — ES imports are evaluated in order, and a fresh
// database would otherwise crash the server on startup.
import { migrate } from './migrate.js'

migrate()

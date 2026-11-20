// Single source of truth for the backend base URL — the app previously had this
// hardcoded separately in five different files, pointed at a Render service that
// no longer exists (Render returns x-render-routing: no-server for it). This is
// the same production backend the web app (workflow.backero.in) actually uses.
export const API_BASE = 'https://api.backero.in/api';

// Single place to point the site at a different backend when deploying.
// Locally this defaults to the Express dev server; in production, set
// window.CATNAP_API_BASE to your deployed backend's URL (e.g. from a
// small inline <script> tag added by your host, or just edit the
// fallback below before deploying the frontend).
window.CATNAP_API_BASE = window.CATNAP_API_BASE || 'http://localhost:4000';

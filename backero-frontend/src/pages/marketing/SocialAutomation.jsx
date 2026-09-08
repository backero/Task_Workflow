import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';

const SOCIAL_AUTOMATION_URL = 'https://social.backero.in/dashboard/';

// Embeds the standalone social-media-automation app (Streamlit, on its own subdomain) inside
// Backero via iframe. That app sets no X-Frame-Options/CSP, so framing isn't blocked — but it's
// still a separate origin with its own login, so this is a viewport into it, not a merged app.
// ?embed=true is Streamlit's own built-in embed mode: it hides Streamlit's default toolbar/
// hamburger menu/"Made with Streamlit" footer so it reads as part of Backero, not a guest app.
export default function SocialAutomation() {
  const embedUrl = `${SOCIAL_AUTOMATION_URL}?embed=true`;

  return (
    // Fixed viewport-relative height, not h-full/flex-1 — Layout wraps <Outlet/> in a plain
    // (non-flex, auto-height) div, so percentage heights don't reliably resolve through it and
    // the iframe collapses to the browser's ~150px default. 56px = the top header's h-14.
    <div className="flex flex-col -m-4 lg:-m-6" style={{ height: 'calc(100vh - 56px)' }}>
      <div className="flex items-center justify-between px-4 lg:px-6 py-3 border-b border-gray-200 dark:border-[#1b2e4a] bg-white dark:bg-[#0b1220] flex-shrink-0">
        <div>
          <h1 className="text-base font-bold text-gray-900 dark:text-white">Social Media Automation</h1>
          <p className="text-xs text-gray-500">Runs on social.backero.in — sign in there if prompted below.</p>
        </div>
        <a
          href={SOCIAL_AUTOMATION_URL}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary text-xs"
        >
          Open in new tab
          <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 ml-1" />
        </a>
      </div>
      <iframe
        src={embedUrl}
        title="Social Media Automation"
        className="flex-1 w-full border-0"
        allow="clipboard-write"
      />
    </div>
  );
}

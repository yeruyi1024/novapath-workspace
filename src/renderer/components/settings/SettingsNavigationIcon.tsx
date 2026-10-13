import React from 'react';

// StarPath's settings glyphs are drawn here, independent of external icon sets.
// Rounded outlines, orbit shapes and star accents tie the family together.
const glyphs = {
  account: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="9" r="2.5" /><path d="M6.5 18a5.5 5.5 0 0 1 11 0" /></>,
  email: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></>,
  general: <><path d="M4.5 7.5h15M4.5 16.5h15" /><rect x="7" y="5" width="4" height="5" rx="2" /><rect x="13" y="14" width="4" height="5" rx="2" /></>,
  appearance: <><path d="M16 4.5a8 8 0 1 0 3.5 11.8M12 5v14M12 8a4 4 0 0 0 0 8" /><path d="m18.5 3.5.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" className="starpath-icon-accent" /></>,
  shortcuts: <><rect x="3.5" y="5.5" width="17" height="13" rx="3" /><path d="M7 9h1M11 9h1M15 9h2M7 12.5h1M11 12.5h1M15 12.5h2M8.5 15.5h7" /></>,
  model: <><path d="m4 7 8-3 8 3-8 3Zm0 5 8 3 8-3M4 17l8 3 8-3" /><path d="M12 10v3M12 15v3" /></>,
  plugins: <><path d="M10 4H6a2 2 0 0 0-2 2v4h4a2 2 0 0 1 0 4H4v4a2 2 0 0 0 2 2h4v-4a2 2 0 0 1 4 0v4h4a2 2 0 0 0 2-2v-4M14 4v4h4" /><path d="M17 4h3v3" className="starpath-icon-accent" /></>,
  coworkAgentEngine: <><rect x="3.5" y="5" width="17" height="14" rx="3" /><path d="M3.5 9h17M7 14h2l1.5-3 2.5 6 1.5-3H17" /></>,
  im: <><path d="M10 6H7a4 4 0 0 0-4 4v4a4 4 0 0 0 4 4h3M14 6h3a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4h-3M8 12h8m-2-2 2 2-2 2" /></>,
  browserWebAccess: <><circle cx="12" cy="12" r="8.5" /><path d="m15.5 8.5-2 5-5 2 2-5Z" /><path d="M12 3.5v2M20.5 12h-2M12 20.5v-2M3.5 12h2" /></>,
  coworkMemory: <><path d="M6 6h10a3 3 0 0 1 3 3v11l-4-2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2ZM8 6V3h8M8 10h6M8 14h4" /></>,
  about: <><path d="M8 5a8 8 0 1 0 8 14M11 10h2v7M10 17h5" /><circle cx="12" cy="6.5" r=".75" fill="currentColor" stroke="none" /><path d="m17.5 3.5.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7Z" className="starpath-icon-accent" /></>,
  advanced: <><path d="M5.5 9.5 12 16l6.5-6.5" /><path d="M8.5 5.5h7" className="starpath-icon-accent" /></>,
} satisfies Record<string, React.ReactNode>;

interface Props {
  name: keyof typeof glyphs;
  className?: string;
}

export default function SettingsNavigationIcon({ name, className }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"
      className={`starpath-settings-icon ${className ?? ''}`}>
      {glyphs[name]}
    </svg>
  );
}

export const Icon = ({ name, size = 18 }) => {
  const icons = {
    plus: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>,
    search: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>,
    edit: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>,
    trash: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
    tag: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>,
    book: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>,
    sparkle: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5L12 2z" /></svg>,
    check: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>,
    clock: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
    grid: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>,
    list: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>,
    back: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>,
    menu: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>,
    upload: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M20 16.5v2a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-2" /></svg>,
    download: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 4v12" /><path d="m7 11 5 5 5-5" /><path d="M20 20H4" /></svg>,
    play: <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8 5.14v13.72a1 1 0 0 0 1.53.85l10.73-6.86a1 1 0 0 0 0-1.7L9.53 4.29A1 1 0 0 0 8 5.14z" /></svg>,
    settings: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 8.92 4.6H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.36.49.56 1.08.57 1.69V11a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
    sun: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></svg>,
    moon: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3c0 5.24 4.25 9.49 9.49 9.79z" /></svg>,
  };

  return icons[name] || null;
};

export function FormatToolbarIcon({ type }) {
  const size = 16;
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" };

  const icons = {
    bold: <span className="format-toolbar-glyph format-toolbar-glyph-bold">B</span>,
    italic: <span className="format-toolbar-glyph format-toolbar-glyph-italic">I</span>,
    heading1: <span className="format-toolbar-glyph format-toolbar-glyph-heading">H1</span>,
    heading2: <span className="format-toolbar-glyph format-toolbar-glyph-heading">H2</span>,
    bulletList: (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="3" cy="4" r="1.2" fill="currentColor" />
        <circle cx="3" cy="8" r="1.2" fill="currentColor" />
        <circle cx="3" cy="12" r="1.2" fill="currentColor" />
        <line x1="6" y1="4" x2="13" y2="4" {...stroke} />
        <line x1="6" y1="8" x2="13" y2="8" {...stroke} />
        <line x1="6" y1="12" x2="13" y2="12" {...stroke} />
      </svg>
    ),
    numberedList: (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
        <text x="1.5" y="5.2" fontSize="4.2" fontWeight="700" fill="currentColor">1.</text>
        <text x="1.3" y="9.4" fontSize="4.2" fontWeight="700" fill="currentColor">2.</text>
        <text x="1.3" y="13.6" fontSize="4.2" fontWeight="700" fill="currentColor">3.</text>
        <line x1="6" y1="4" x2="13" y2="4" {...stroke} />
        <line x1="6" y1="8" x2="13" y2="8" {...stroke} />
        <line x1="6" y1="12" x2="13" y2="12" {...stroke} />
      </svg>
    ),
    checklist: (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
        <rect x="1.5" y="2.5" width="3" height="3" rx="0.5" {...stroke} />
        <polyline points="2.2,10 3.4,11.2 5.2,8.8" {...stroke} />
        <rect x="1.5" y="8.5" width="3" height="3" rx="0.5" {...stroke} />
        <line x1="7" y1="4" x2="14" y2="4" {...stroke} />
        <line x1="7" y1="10" x2="14" y2="10" {...stroke} />
      </svg>
    ),
    quote: (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
        <path d="M5.5 4.5H3.8c-.9 0-1.6.7-1.6 1.6v1.2c0 .9.7 1.6 1.6 1.6h1.1v2.6" {...stroke} />
        <path d="M11.8 4.5h-1.7c-.9 0-1.6.7-1.6 1.6v1.2c0 .9.7 1.6 1.6 1.6h1.1v2.6" {...stroke} />
      </svg>
    ),
    code: (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
        <polyline points="6,3 2,8 6,13" {...stroke} />
        <polyline points="10,3 14,8 10,13" {...stroke} />
      </svg>
    ),
    table: (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
        <rect x="1.5" y="2" width="13" height="11.5" rx="1" {...stroke} />
        <line x1="1.5" y1="6" x2="14.5" y2="6" {...stroke} />
        <line x1="1.5" y1="9.8" x2="14.5" y2="9.8" {...stroke} />
        <line x1="6" y1="2" x2="6" y2="13.5" {...stroke} />
        <line x1="10.2" y1="2" x2="10.2" y2="13.5" {...stroke} />
      </svg>
    ),
    link: (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
        <path d="M6.2 9.8 4.4 11.6a2.1 2.1 0 1 1-3-3L3.7 6.3a2.1 2.1 0 0 1 3 0" {...stroke} />
        <path d="M9.8 6.2 11.6 4.4a2.1 2.1 0 1 1 3 3L12.3 9.7a2.1 2.1 0 0 1-3 0" {...stroke} />
        <line x1="5.5" y1="10.5" x2="10.5" y2="5.5" {...stroke} />
      </svg>
    ),
    image: (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
        <rect x="1.5" y="2" width="13" height="11.5" rx="1" {...stroke} />
        <circle cx="5.2" cy="5.2" r="1.1" fill="currentColor" />
        <path d="M3 11 6.2 7.8 8.6 10.2 10.5 8.3 13 11" {...stroke} />
      </svg>
    ),
  };

  return icons[type] || null;
}

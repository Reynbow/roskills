/**
 * The site's small inline icons: one 12px grid, one 1.4 stroke, currentColor, so they sit in
 * text and buttons at any size. Used wherever a glyph (×, ‹, ▲, →, ♂) used to stand in.
 */

const svg = (body: string, extraClass = ""): string =>
  `<svg class="icon${extraClass ? ` ${extraClass}` : ""}" viewBox="0 0 12 12" width="1em" height="1em" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;

export const ICON = {
  close: svg('<path d="M3 3l6 6M9 3 3 9"/>'),
  minus: svg('<path d="M2.5 6h7"/>'),
  plus: svg('<path d="M2.5 6h7M6 2.5v7"/>'),
  chevronLeft: svg('<path d="M7.5 2.5 4 6l3.5 3.5"/>'),
  chevronRight: svg('<path d="M4.5 2.5 8 6l-3.5 3.5"/>'),
  caretUp: svg('<path d="M3 7.5 6 4.5l3 3"/>'),
  caretDown: svg('<path d="M3 4.5 6 7.5l3-3"/>'),
  arrowRight: svg('<path d="M2 6h8M7 3l3 3-3 3"/>'),
  arrowDown: svg('<path d="M6 2v8M3 7l3 3 3-3"/>'),
  external: svg('<path d="M5 2H2v8h8V7M7 2h3v3M10 2 5.5 6.5"/>'),
  male: svg('<circle cx="5" cy="7" r="2.6"/><path d="M7 5l3-3M7.5 2H10v2.5"/>'),
  female: svg('<circle cx="6" cy="4.6" r="2.6"/><path d="M6 7.2V11M4.3 9.3h3.4"/>'),
} as const;

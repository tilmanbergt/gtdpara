/**
 * In-app help (docs/dev/technical-design-in-app-help.md §3.2): which user-guide
 * page opens for which tab, and the "same tab → last page read" rule.
 * Pure; the pages themselves come from src/generated/userDocs.ts.
 */

export const HELP_OVERVIEW_PAGE = 'index';

/** Tab key (ui/TabBar.tsx AppTab) → docs/user page id. */
export const HELP_PAGE_FOR_TAB: Record<string, string> = {
  projects: 'projects-and-areas',
  areas: 'projects-and-areas',
  current: 'projects-and-areas',
  daily: 'daily',
  week: 'week-and-month',
  month: 'week-and-month',
  inbox: 'quick-add',
  review: 'review',
  settings: 'settings',
};

export interface LastHelpPage {
  tab: string;
  pageId: string;
}

/** The page to open when "?" is tapped on `tab`. `available` = the bundled page ids. */
export function helpStartPage(tab: string, last: LastHelpPage | null, available: ReadonlySet<string>): string {
  if (last && last.tab === tab && available.has(last.pageId)) {
    return last.pageId;
  }
  const mapped = HELP_PAGE_FOR_TAB[tab];
  return mapped && available.has(mapped) ? mapped : HELP_OVERVIEW_PAGE;
}

/** Drops the page's leading `# Title` line (the help header shows the title). */
export function stripLeadingTitle(markdown: string): string {
  return markdown.replace(/^\s*#\s+[^\n]*\n?/, '');
}

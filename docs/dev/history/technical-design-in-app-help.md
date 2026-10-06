# Technical design: in-app help

Status: **implemented 2026-09-30** (approved the same day). Not yet device-tested.

## 1. Requirements (decided in chat, 2026-09-30)

1. A **"?"** in the TabBar opens the help as an **overlay** below the TabBar. Everything behind it
   stays as it is (no tab switch, no remount, drafts untouched).
2. Simple layout: **left** the list of topics/pages, **right** the content of the selected page.
3. Closed with **✕** in the overlay. Tapping "?" again, or any tab, also closes it (a tab tap also
   selects that tab).
4. **Start page = the page for the current tab** (Daily → Daily, Review → Weekly Review, …); within
   a session, reopening from the same tab returns to the page last read there.
5. The content is the user guide in `docs/user/` - the same pages as on GitHub, no second copy.

Not in this version: tappable links inside a page (shown as text, as today), search, images.

## 2. Current state (checked)

- `docs/user/`: 16 pages in the device-safe markdown subset, guarded by
  `__tests__/docs/userDocs.test.ts`. `index.md` lists all pages in four groups
  (Start here, Daily use, Organizing, Setup and help).
- `domain/markdownBlocks.ts` + `ui/MarkdownBlocks.tsx` (`MarkdownPager`) render and page this subset
  without scrolling; used by Settings → About's "What's new".
- `scripts/gen-bundled-content.mjs` already bundles `CHANGELOG.md` into the gitignored
  `src/generated/changelog.ts` (dev: on `postinstall` / `npm run gen`; build: `buildPlugin.ps1` Step 1b).
- `App.tsx` `AppShell`: TabBar, then `StatusFrame` → body with the (kept-alive or active) tab screens.
- TabBar width budget (A5 X, 1404 px): 9 tab labels at `FONT.medium` + margins ≈ 830 px, profile
  marker ≈ 90, 🔄 ≈ 45, ✕ ≈ 50, paddings 32 → ≈ 1050 px. A "?" (≈ 40 px) fits.

## 3. Design

### 3.1 Bundling the pages

`gen-bundled-content.mjs` also writes `src/generated/userDocs.ts` (gitignored, like `changelog.ts`),
built by a small pure helper in `scripts/lib/userDocs.mjs`:

```
export const USER_DOCS = {
  groups: [{title: 'Start here', pageIds: ['getting-started', 'philosophy']}, ...],
  pages: {'getting-started': {title: 'Getting started', markdown: '...'}, ...},
};
```

- Groups and order come from `index.md`: each `## Heading` is a group, each list item
  `[Text](page.md)` adds that page. The page title is the page's own first `# ` line.
- `index.md` itself becomes the page `index` ("Overview"), listed first above the groups.
- Pages that exist but aren't in `index.md` are appended to a last group "More", so nothing is lost
  silently (the docs test additionally fails on such a page).
- About 35 KB of text in the JS bundle; parsed only when the help is opened.

### 3.2 Which page opens

Pure mapping in `domain/helpTopics.ts`:

| Tab | Page |
|---|---|
| Daily | daily |
| Week, Month | week-and-month |
| Inbox | quick-add (gets a short "The Inbox" section, see 3.6) |
| Projects, Areas, Current | projects-and-areas |
| Review | review |
| Settings | settings |

Unknown or missing page → `index`. App.tsx keeps `lastHelpPage: {tab, pageId}` in memory (not
persisted): opening from the same tab as last time shows that page again.

### 3.3 UI

```
[Projects Areas Daily Week Month Inbox Current Review Settings]  (?)  DEMO  🔄  ✕
[status slot]
┌───────────────────────┬──────────────────────────────────────────────┐
│ Help               ✕  │ Daily and focus mode              ‹ 1/2 ›    │
│ Overview              │                                              │
│ START HERE            │ (page content, paged)                        │
│  Getting started      │                                              │
│  Why gtdpara ...      │                                              │
│ DAILY USE             │                                              │
│ ▸Daily and focus mode │                                              │
│  ...                  │                                              │
└───────────────────────┴──────────────────────────────────────────────┘
```

- New `ui/HelpOverlay.tsx`: an absolutely positioned, fully opaque layer (theme background, no
  animation) over the body inside `StatusFrame`, so the tab screens stay mounted underneath and the
  status slot stays visible above it.
- Left column (≈ 30 % width): "Help" + ✕ Close, then Overview, group headings (small caps style), page
  titles; the selected page is bold with a marker. 21 rows fit on one screen; if the list ever grows
  beyond what fits, it switches to `PagedSection` (the docs test caps the page count so this is noticed).
- Right column: `MarkdownPager` with the page title and ‹ › in its header; the page's own leading
  `# Title` block is dropped because the header shows it. `resetKey` = page id, so a new page starts
  on page 1.
- TabBar: a "?" button between the tabs and the profile marker, drawn as active (underline) while
  the help is open. New props `helpOpen`, `onHelpPress`.
- App.tsx: `helpOpen` state; `?` toggles; `handleSelectTab` closes the help first; entering lasso
  capture or focus mode closes it too (those screens have no TabBar).

### 3.4 Behaviour details

- The status slot keeps working while help is open (e.g. a "Saved" message from before). A confirm
  prompt from the screen behind can in theory stay visible; acceptable, it belongs to that screen and
  acts on it as before.
- The shared 🔄 refreshes the screen behind, as before; the help itself needs no refresh.
- The Supernote's own back gesture/button is not intercepted (same as for the rest of the app).
- Perf: nothing is parsed or rendered while the help is closed; opening parses one page.

### 3.5 Files

New: `scripts/lib/userDocs.mjs`, `src/domain/helpTopics.ts`, `src/ui/HelpOverlay.tsx`,
`__tests__/domain/helpTopics.test.ts`, test cases for `userDocs.mjs` in `scripts/test-versioning.mjs`
(or a sibling `scripts/test-userdocs.mjs` run by `npm run test:scripts`).
Changed: `scripts/gen-bundled-content.mjs`, `src/ui/TabBar.tsx`, `App.tsx`,
`__tests__/docs/userDocs.test.ts` (every page is listed in `index.md`; every mapped page exists),
`docs/user/getting-started.md` + `quick-add.md` (the "?" and a short Inbox section), README / CHANGELOG /
`docs/dev/README.md` (drop "meant to be shown in the plugin later").

### 3.6 Docs changes

- `getting-started.md` → "The tabs": the "?" opens this help, starting at the page for the current tab.
- `quick-add.md` → new short "The Inbox" section (what lands there, filing with Refile / abbreviation,
  Inbox to zero in the Review), because the Inbox tab maps to this page.

## 4. Test plan

- Unit: index parsing (groups, order, titles, missing and unlisted pages), tab → page mapping,
  "last page per tab" rule.
- Docs test: every page reachable from `index.md`; mapping targets exist.
- Smoke render: App with help open over Daily; switching pages; ✕ closes; tab tap closes and selects.
- Device: open "?" from each tab (right start page), page through a long page (Quick Add), code block
  on Files and folders, close with ✕ / "?" / a tab, drafts in the tab behind still there, dark/light.

## 5. Open points

1. Step 2 (later): tappable links between pages, and a "‹ Overview" back link.

## 6. As built (2026-09-30)

- `scripts/lib/userDocs.mjs` (pure: `pageTitle`, `parseIndexGroups`, `buildUserDocs`,
  `renderUserDocsTs`), called by `gen-bundled-content.mjs` → `src/generated/userDocs.ts`
  (gitignored with the rest of `src/generated/`). Checks in `scripts/test-userdocs.mjs`, part of
  `npm run test:scripts`; one of them fails when a page is missing from `index.md`.
- `src/domain/helpTopics.ts`: `HELP_PAGE_FOR_TAB`, `helpStartPage`, `stripLeadingTitle`; tests in
  `__tests__/domain/helpTopics.test.ts` (incl. every mapped page is bundled, left list ≤ 26 rows).
- `src/ui/HelpOverlay.tsx`: absolute, opaque (`COLORS.background`) layer inside the body; left 30 %
  with "Help" + "✕ Close", Overview, groups (caps, dimmed) and pages (selected: bold + ▸); right
  `MarkdownPager` with the page title as header.
- `TabBar`: "?" left of the profile marker, underlined while open (the current tab loses its
  underline meanwhile). `App.tsx`: `helpPage` state + `lastHelpRef`; the help closes on "?"/✕, on
  any tab tap (also the same tab), on any change of `activeTab` (profile marker, reopening from a
  note) and when leaving 'tabs' mode (capture, focus). Closing requests an e-ink refresh, like
  showing a kept tab.
- Docs: "?" in Getting started, new "The Inbox" section in Quick Add; README, CHANGELOG and
  `docs/dev/README.md` point to the in-app help.

Verified off-device: tsc (no errors), 77 Jest tests, script checks, and a smoke test that opens the
help from Daily (Daily page), switches pages, closes with ✕, reopens on the last page read, and
closes on a tab tap.

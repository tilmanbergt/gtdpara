# gtdpara development policy

This is the one document that says **what has to be true after every change and before every
release**. It applies to everyone who changes the code - in practice mostly Claude, working with
Tilman - and it is checked, point by point, at the end of every feature, every bugfix and every
release. Where a topic has its own detailed document, this policy names it and states only the
rules; the detail lives there.

If a change can't follow a rule here, say so explicitly in the change (commit message, design
doc or code comment) and why. Silent exceptions are not allowed.

Like every living document (see §6), this policy states the rules as they apply now. Change it
in the same change that shows a rule is wrong or missing (§11).

## 1. How work is done

1. **Features: requirements, then design, then implementation.**
   - Requirements are clarified in conversation first: questions, edge cases, decisions.
   - Then a technical design in `docs/dev/technical-design-<topic>.md`: requirements as decided,
     current state, design, files, test plan, open points.
   - Implementation starts only after the design is approved. The design doc gets an
     **"As built"** section when it's done.
2. **Bugs: exact failure, then root cause, then fix.** Pin down the exact failure (steps, device,
   version, log), find the root cause in the code, then fix it. No fixes based on guesses. If
   diagnosis needs more data, add logging first.
3. **Small, verified steps.** Every step ends with the checks in §8 passing.
4. **Ideas that come up on the way** go to the internal backlog (the claude.ai project document
   `claude/next-improvements.md`), not into the current change.

## 2. Product principles (the filter for every feature)

Details: `docs/dev/design-philosophy.md` and `docs/user/philosophy.md`.

- **Your files, no lock-in.** Content lives in plain files in the user's folders. No second
  store for content, nothing that only the plugin can read.
- **Calm and made for e-ink.** Paged, not scrolled. No notifications, timers, streaks or
  auto-suggestions of "the next thing".
- **Built on Supernote features**: notes, templates, keywords, links, lasso - before building
  something of our own.
- **The whole life of a project**, from creation to close-out and archive.
- **Keeping your word clean**, and **room for rest**: features make commitments visible; they
  don't pile up more to do.
- **External services are experimental.** Anything depending on an outside service (Google,
  network) sits behind a switch in Settings → Advanced and is off by default.

## 3. Architecture rules

The full rules are in `docs/dev/design-overview.md` §3. They are binding; the most important:

- **Layers.** `src/domain/` is pure TypeScript - no React Native, no `sn-plugin-lib`, no I/O.
  I/O lives in `src/storage/`, device APIs in `src/supernote/`, UI in `src/ui/` and
  `src/screens/`.
- **Files are the source of truth.** `project.txt` / `area.txt` / `Inbox.txt` hold content;
  AsyncStorage holds configuration only. The cache must be rebuildable from the files at any time.
- **File format.** Changes are span-scoped (`getSpan`/`setSpan` in `domain/markdown.ts`) - never
  regenerate a whole file. Lines the parser doesn't understand survive. A format change needs
  parser + serializer + round-trip test, must read files written by older versions, and needs
  an **Upgrade note** in the CHANGELOG.
- **Write-through.** Mutations write the file first, then the cache (`storage/itemMutations.ts`,
  `notifyCacheChanged()`). Screens never poll.
- **Settings.** Every new setting gets a default in `DEFAULT_SETTINGS`, a migration if it
  replaces an older one, and a classification in `domain/profiles.ts`: per profile, device-wide
  or secret. The profiles test fails if one is missing.
- **Secrets** (passwords, private calendar links) are never written to a file, a log, a debug
  bundle or a profile file.
- **Everything gtdpara exports** goes under `EXPORT/gtdpara/` (`debug/`, `profiles/`), never
  under `Note/`.
- **Reuse the shared building blocks**: status slot for messages, `PagedSection` for lists, the
  PDF pipeline, wizard frame, operation journal for multi-step file moves
  (design-overview §3 "Reusable building blocks").
- **Known host limits** are respected and documented: for example, creating notes only works
  when the plugin was opened from a note.

## 4. UI rules

Details: `docs/dev/design-overview.md` §3 "Styling" and `docs/dev/design-device-rendering.md`.

- **Target device**: Supernote A5 X, 1404 × 1872 px. Every new screen is budgeted against
  design-device-rendering §5-6.
- **No scrolling lists.** Use `PagedSection` / the pager. Rows that can wrap must have their real
  height accounted for, so nothing is clipped.
- **Font sizes only from `FONT`** (`ui/theme.ts`). Grayscale only: color never carries meaning;
  use weight, underline, borders, icons.
- **Inputs and the buttons that belong to them** stay in the upper two thirds of the screen,
  above the keyboard/handwriting panel.
- **Messages** (errors, confirmations, success) go through the central status slot. No
  `Alert.alert`, no ad-hoc inline warning lines.
- **E-ink refresh.** Content that appears without a direct tap (after loading, on returning to a
  kept tab) calls `requestEinkRefresh()` or `useEinkRefreshOnLoad()`.
- **Labels** are short, English, and the same everywhere. A label that changes is also changed
  in the help pages (§6).
- **Navigation** follows the tab model; overlays (like the help) leave the screen behind as it is.

## 5. Logging and diagnostics

- **Log through `utils/log.ts` only**: `log` (info), `logWarn`, `logError`. Never call
  `console.*` directly. Format: `'<Module>: <what happened>'` plus data, e.g.
  `logError('ProfilesSection: listing profiles failed', message)`.
- **What must be logged**: every caught error (with enough context to find the cause), every
  file write that fails, every call to a device or network API that fails, and the key steps of
  any flow that can fail halfway (switch profile, archive, PDF, sync).
- **What must never be logged**: secrets (see §3), and no more personal content than needed.
  Prefer counts and ids over names and texts. Logs go into debug bundles that users attach to
  public issues; `domain/redact.ts` is the last safety net, not the plan.
- **Debug bundle** (`storage/debugBundle.ts`): when a feature adds state that matters for bug
  reports (a new mode, switch or integration), add one line to the bundle, as yes/no or counts.
- **Diagnosis before guessing**: when a bug can't be explained from the code, first add targeted
  logging, ship it, and ask for a debug bundle.

## 6. Documentation in the same change

A change is not done while the docs describe the old behavior.

- **Help pages** (`docs/user/*.md`) - shown on GitHub *and* in the app ("?" in the tab bar):
  - Update every page that describes the changed behavior; add a page for a new area of use and
    link it from `index.md`.
  - Use labels exactly as the app shows them; check every claim against the code.
  - Only the device-safe markdown subset (see `docs/dev/README.md` "Writing user docs"): no
    tables, images, HTML or deeper list nesting. `__tests__/docs/userDocs.test.ts` enforces this.
  - If a new tab or screen gets its own page, add the mapping in `domain/helpTopics.ts`.
- **CHANGELOG.md**: every user-visible change gets a line under `## [Unreleased]` (New, Changed,
  Fixed, Experimental, Removed, Upgrade notes), written for users. Settings or file-format
  changes always get an **Upgrade note**. This text becomes the GitHub release notes and the
  in-app "What's new".
- **README.md**: update "Features at a glance" when a feature is added, removed or becomes
  experimental. Screenshots are refreshed when a shown screen changes noticeably.
- **PRIVACY.md**: update whenever data is stored somewhere new, sent over the network, or
  exported.
- **Developer docs** come in two kinds (list in `docs/dev/README.md`):
  - **Living documents** (`design-overview.md`, `design-philosophy.md`,
    `design-device-rendering.md`, `DEVELOPMENT-POLICY.md`, `RELEASING.md`, `docs/dev/README.md`)
    describe the current state in present tense: no history ("previously", "superseded",
    "not yet verified"), no open questions, no plans. Each starts with a short "About this
    document" note saying what it is for and how it is kept. Update the affected one in the same
    change.
  - **Historical documents** (`technical-design-*.md`, spikes, requirement notes, release plans,
    device test records) are written for one feature or release, get their "As built" section,
    and are then left alone.
- **Open work lives in one place**: ideas, requirements under discussion, bugs, technical debt
  and housekeeping go to the internal backlog (the claude.ai project document
  `claude/next-improvements.md`), never into the repository's documents. Decisions and context
  that are not for the public repository go to the claude.ai project (documents and memory).

## 7. Testing

- **Automated, every change:**
  - `npx tsc --noEmit` - no new errors (the goal is zero).
  - `npm test` - all Jest tests pass. New pure logic in `domain/` (and testable parts of
    `storage/`) gets Jest tests in `__tests__/`, including edge cases and the bug that was fixed.
  - `npm run test:scripts` - when `scripts/` or `docs/user/` changed.
  - A smoke render of the changed screen where possible (`react-test-renderer`, mocks as in
    `docs/dev/README.md`), at minimum for changes to `App.tsx` and navigation.
- **On the device**, for every change that touches UI, files or device APIs:
  - build with `buildPlugin.ps1`, install over the previous build, test the changed flow;
  - for features, a short checklist in the design doc's test plan, ticked off on the device;
  - use the demo space (Settings → Advanced → Profiles) for tests that change data.
- A change is only reported as done when the checks above passed - and the report says what
  was verified off-device and what still needs a device test.

## 8. Definition of done - checklist for every change

- [ ] Requirements/design agreed (features) or root cause found (bugs) - §1
- [ ] Fits the product principles - §2
- [ ] Architecture rules kept; new settings classified; no secrets in files or logs - §3
- [ ] UI rules kept; checked against the A5 X budget - §4
- [ ] Errors and key steps logged; debug bundle extended if needed - §5
- [ ] Help pages, CHANGELOG `[Unreleased]`, README, PRIVACY, dev docs updated as needed - §6
- [ ] `tsc`, `npm test` (and `test:scripts` if relevant) pass; new logic has tests - §7
- [ ] Device test done, or explicitly listed as still open - §7
- [ ] Ideas found on the way are on the backlog, not half-built - §1
- [ ] Step-by-step guide for Tilman given (commit, build, test, push/merge, release?) - §10

## 9. Release checklist

Branches, commits, builds and the release steps themselves are in `docs/dev/RELEASING.md`.
Before running `scripts/release.ps1`:

- [ ] Everything since the last release meets §8; no open "still needs device test" items, or
      they are consciously accepted and named.
- [ ] **Version**: patch = fixes only; minor = new features or changed behavior (SemVer 0.x).
- [ ] **CHANGELOG `[Unreleased]`** read once more as a user: complete, correct, Upgrade notes
      present where settings or files changed. It becomes the release notes and "What's new".
- [ ] **Help pages** read once against the release: no page describes old behavior;
      `userDocs.test.ts` passes.
- [ ] **README** feature list and screenshots still true.
- [ ] **PRIVACY.md** still true.
- [ ] **Experimental**: anything not reliable enough is behind a switch and listed under
      Experimental.
- [ ] **Logging**: no debug-only noise left in hot paths; no secrets or excessive content logged.
- [ ] `tsc`, `npm test`, `npm run test:scripts` pass on a clean tree.
- [ ] Device checklist in RELEASING.md: install **over the previous release**, settings kept,
      main tabs work, Quick Add, Review, Help opens, Settings → About shows the new version.
- [ ] After publishing: release page has text and `.snplg`; InkHub/Reddit updated if it matters
      to users; new issues get triaged (labels `needs-info`, `confirmed`, `experimental`).

## 10. Step-by-step guide after every change

Git, builds, installs and releases run on Tilman's computer and device. At the end of every
change, build or release, Claude gives a short, numbered, copy-paste-ready guide: where we are
(branch, what was verified, what still needs the device), what to commit with which message,
whether and what to build and test, whether to push or merge, and whether a release is advisable
now. Details: `docs/dev/RELEASING.md` §8.

## 11. Keeping this policy alive

- When a rule turns out wrong or a new kind of mistake happens, update this document in the same
  change that fixes it, so it doesn't happen twice.
- `CLAUDE.md` in the repository root points here; keep it short and in sync.

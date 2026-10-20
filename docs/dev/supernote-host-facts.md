# Supernote host facts

> **About this document.** This is a living document. It collects how the Supernote and its
> plugin host behave where Ratta's SDK documentation (`sn-plugin-lib`, docs.supernote.com) says
> nothing, says it unclearly, or says something else - facts found by testing on the device or
> by tracing a bug. Each entry says what the host does, how it was found, and where gtdpara deals
> with it. It describes the current behavior in present tense; the bug or design that found a
> fact is named as its source in `docs/dev/history/`. Screen sizes, typography and space budgets
> are in `design-device-rendering.md`; the architecture rules that follow from these facts are in
> `design-overview.md`. When a new host fact turns up, add it here in the same change; when a
> firmware or library update changes one, update the entry.

Measured on: Supernote A5 X, plugin firmware Chauvet 2.27.42, `sn-plugin-lib` 0.2.3.

## 1. Keywords

- **At most 43 characters per keyword.** The keyword dialog cuts longer input silently;
  `PluginFileAPI.insertKeyWord` rejects it with "The keyword exceeds the maximum length limit.
  Cannot call the related API!". `sn-plugin-lib` neither documents nor checks the limit.
- **Characters, not bytes**: an umlaut counts as one, the same as JavaScript's `.length`.
  Measured by typing `1234567890` six times (43 kept) and `123456789ä` repeated (43 kept, four
  of them "ä").
- In gtdpara: every keyword is built through `fitKeyword` (`domain/keywordLength.ts`):
  unchanged up to 43, otherwise tags left out, then cut at a word boundary with "…". The page
  engine (`storage/sharedNotePages.ts`) refuses a longer keyword before it writes a page.
  Source: `docs/dev/history/technical-design-keyword-length.md`.
- `getKeyWords` returns each keyword with a 1-based `index` per page; `deleteKeyWord` takes that
  index, and deleting shifts the indexes after it. gtdpara reads the index right before it
  deletes and never computes it (`renameKeywordAt`, `syncPageKeywords`).

## 2. Notes and pages

- **Creating a note works only when the plugin was opened from a note.** From a document (PDF,
  EPUB) `PluginFileAPI.createNote` fails with "This app is not allowed to use this API", so
  creating a linked note or a notebook needs gtdpara to be opened from a note.
- `createNote` needs a fixed template name (`style_white`, or a MyStyle file path); a template
  reference from `getNoteSystemTemplates()` does not resolve there.
- Inserting a page and adding its keyword are two separate calls; nothing makes them atomic.
  gtdpara checks what it can (the keyword length) before the first call.

## 3. Coordinates

- With the plugin firmware above, every coordinate the SDK reads or takes is an Android pixel on
  the page's real size from `PluginFileAPI.getPageSize`; a `.note` page on the A5 X is
  1404 × 1872 px. Ratta changes such semantics without a major version, so `sn-plugin-lib` is
  pinned exactly (`design-overview.md` §4 "Page-size pixels everywhere").

## 4. Permissions

- The host's permission bridge can hang without answering. Every permission check goes through
  a wrapper with an 8-second timeout (`supernote/pluginPermissions.ts`).
- Network sockets are blocked ("has no NETWORK permission for: ip:port") until the runtime
  INTERNET permission is granted, also again after a reinstall. gtdpara checks it right before
  every network call (`ensureInternetPermission`).

## 5. Display and input

- The e-ink panel does not always show a change that arrives without a tap. gtdpara refreshes
  explicitly (`utils/screenRefresh.ts`'s `requestEinkRefresh()`, `useEinkRefreshOnLoad()`).
- Android's native text-selection toolbar does not work in the plugin host;
  `ui/ClipboardTextInput.tsx` has its own Select All/Copy/Cut/Paste strip.

## 6. Lasso

- On a cold plugin start the host can drop the lasso while the plugin is still reading it
  (error 904). gtdpara takes the lasso picture first, before the slower reads
  (`design-overview.md` §2.10, "Recognition").

## 7. Installing builds

- The host can install a new build into the running process instead of restarting it, so two
  builds end up loaded in one process. Every build gets a higher `versionCode`, and
  `supernote/pluginRuntime.ts` reports stale builds in the debug bundle. Source:
  `docs/dev/history/technical-design-host-update-crash.md`.

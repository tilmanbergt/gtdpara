# Contributing to gtdpara

Thanks for your interest! gtdpara is a hobby project, maintained by one person in spare time.
Response times vary, so please be patient.

## Reporting bugs

Open an issue using the **Bug report** form. The most helpful things to include:

- the gtdpara version (Settings → About)
- your device model and firmware version
- exact steps to reproduce, what you expected and what happened
- the debug info and log file, if you can (see `docs/user/troubleshooting.md`)

Please check existing issues first. Before attaching logs, look through them for anything
private.

## Ideas and feature requests

Ideas are welcome. Open a **Feature request** and describe the *problem* you want solved and how
you work today, not only the solution you have in mind. Questions and general discussion go to
GitHub Discussions.

Not every idea will be built. gtdpara follows a few principles that act as a filter:

- **Filesystem first.** Your data stays in plain files in your own folders, readable without the
  plugin. No hidden database, no lock-in.
- **Calm on e-ink.** No scrolling lists, no notifications, no timers. Fewer, clearer screens.
- **Your word, kept clean.** Features should help you see and keep (or consciously renegotiate)
  what you committed to, not pile up more to do.

See `docs/dev/design-philosophy.md` for the longer version.

## Code contributions

Please **open an issue first** and wait for a go before starting a pull request. This keeps the
product coherent and avoids wasted work on both sides. Small, obvious fixes (typos, broken links)
are fine without asking.

- Rules and checklists for every change: `docs/dev/DEVELOPMENT-POLICY.md`
- Build instructions and a tour of the code: `docs/dev/README.md`
- Keep `src/domain/` free of React Native and `sn-plugin-lib` imports.
- Add a line to `CHANGELOG.md` under `[Unreleased]` describing the change for users.
- Test on a real device if you can, and say which one in the PR.

By contributing you agree that your contribution is licensed under the MIT License of this project.

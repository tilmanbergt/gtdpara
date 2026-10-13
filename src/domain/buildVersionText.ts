/**
 * The version a build is, as the app shows it to the user
 * (docs/dev/history/technical-design-note-setups-finish.md §3): `version`
 * is the last released version until scripts/release.ps1 sets the new one,
 * so a build towards the next release names that release and its stage.
 * Pure; the caller passes generated/buildInfo.ts's BUILD_INFO.
 */

/** What `buildVersionText` reads of BUILD_INFO. */
export interface BuildVersionInfo {
  version: string;
  label: string;
  nextVersion: string | null;
  stage: string | null;
  release: boolean;
}

/** "0.15.0" for a release, "0.15.0 beta" towards a next version, else the build label ("0.14.0+dev.a1b2c3d"). */
export function buildVersionText(build: BuildVersionInfo): string {
  if (build.release) return build.version;
  if (build.nextVersion && build.stage) return `${build.nextVersion} ${build.stage}`;
  return build.label;
}

/**
 * Which profile files to copy from the export folder of gtdpara 0.19 and older into the
 * new one (docs/dev/history/technical-design-kept-gtd.md §3.3). Copies only while the new
 * folder has no profile file at all, so it happens once in effect and never overwrites a
 * profile saved in the new folder. The demo profile is not copied: it is written fresh
 * when the demo space is switched on.
 */

function isProfileFile(name: string): boolean {
  return name.toLowerCase().endsWith('.json');
}

/** File names in the old folder to copy; empty when the new folder already holds a profile. */
export function profilesToCopy(newNames: readonly string[], oldNames: readonly string[], demoProfileId: string): string[] {
  if (newNames.some(isProfileFile)) return [];
  const demoFile = `${demoProfileId}.json`.toLowerCase();
  return oldNames.filter(name => isProfileFile(name) && name.toLowerCase() !== demoFile);
}

/**
 * "Create demo space" (Settings → Advanced → Profiles,
 * docs/dev/technical-design-profiles-demo-space.md §3.5): writes the demo
 * folders under Note/gtdpara-demo and the demo profile file. Never
 * overwrites: an existing file (e.g. demo data you changed) is left alone.
 */
import {buildDemoFiles, DEMO_BASE_ROOT, DEMO_PROFILE_ID, DEMO_PROFILE_NAME, demoProfileSettings} from '../domain/demoSpace';
import {readTextFile, writeTextFile} from '../supernote/fileSystem';
import {log} from '../utils/log';
import {listProfiles, writeProfile} from './profiles';

export interface DemoSpaceResult {
  written: number;
  skipped: number;
  profileCreated: boolean;
}

export async function createDemoSpace(today: Date = new Date()): Promise<DemoSpaceResult> {
  let written = 0;
  let skipped = 0;
  for (const file of buildDemoFiles(today)) {
    const path = `${DEMO_BASE_ROOT}/${file.path}`;
    // readTextFile resolves null for a missing file (and works when the folder doesn't exist yet).
    if ((await readTextFile(path)) !== null) {
      skipped += 1;
      continue;
    }
    await writeTextFile(path, file.content);
    written += 1;
  }
  const profiles = await listProfiles();
  const profileCreated = !profiles.some(p => p.id === DEMO_PROFILE_ID);
  if (profileCreated) {
    await writeProfile(DEMO_PROFILE_ID, demoProfileSettings(), DEMO_PROFILE_NAME);
  }
  log('demoSpace: created', {written, skipped, profileCreated});
  return {written, skipped, profileCreated};
}

/**
 * The Engage panel's current todo (docs/dev/history/technical-design-engage.md
 * §3.5, D7): app state in the settings, per profile. The only module that
 * reads or writes `settings.engageCurrent`.
 */
import {EngageOwner, EngageTodoKey} from '../domain/engageOwner';
import {loadSettings, patchSettings} from './settingsStorage';

export interface EngageCurrent {
  owner: EngageOwner;
  key: EngageTodoKey;
}

export async function getEngageCurrent(): Promise<EngageCurrent | null> {
  const stored = (await loadSettings()).engageCurrent;
  if (!stored) return null;
  const {owner, ...key} = stored;
  return {owner, key};
}

/** Remembers `key` as the current todo of `owner`; null forgets it. */
export async function setEngageCurrent(owner: EngageOwner | null, key: EngageTodoKey | null): Promise<void> {
  await patchSettings({engageCurrent: owner && key ? {...key, owner} : null});
}

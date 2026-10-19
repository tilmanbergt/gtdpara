/**
 * Scenario tests read as a story (docs/dev/history/technical-design-quality-hardening.md §4.4):
 *
 *   scenario('Refile a todo with its note from the Inbox', {feature: 'Inbox'}, () => {
 *     given('Inbox.txt has "- [ ] Call Anna #next"', async () => …);
 *     when('I tap "Call Anna", tap Refile and pick "Website"', async () => …);
 *     then('Website/project.txt has the todo', async () => …);
 *   });
 *
 * The step texts are what the reviewer reads: scripts/scenario-catalog.mjs
 * collects them from the source into docs/dev/test-scenarios.md, so they must
 * be plain single-quoted string literals. Steps run in order inside one Jest
 * test; a failing step names itself in the error.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {clearCachedData} from '../../src/storage/dataCache';
import {resetDevice} from '../fakeDevice/device';
import {closeApp} from './app';

export interface ScenarioMeta {
  /** The feature or screen, as the help pages name it - the catalog groups by it. */
  feature: string;
  /** The design document the behavior comes from (file name under docs/dev/history/), if any. */
  design?: string;
}

type Step = {kind: 'Given' | 'When' | 'Then' | 'And'; text: string; run: () => unknown | Promise<unknown>};

let steps: Step[] | null = null;

function step(kind: Step['kind'], text: string, run: Step['run']): void {
  if (!steps) throw new Error(`${kind} "${text}" outside a scenario`);
  steps.push({kind, text, run});
}

export const given = (text: string, run: Step['run']) => step('Given', text, run);
export const when = (text: string, run: Step['run']) => step('When', text, run);
export const then = (text: string, run: Step['run']) => step('Then', text, run);
export const and = (text: string, run: Step['run']) => step('And', text, run);

export function scenario(title: string, _meta: ScenarioMeta, body: () => void): void {
  it(title, async () => {
    steps = [];
    body();
    const collected = steps;
    steps = null;
    // Each scenario starts on an empty device with no settings and no cache.
    resetDevice();
    await AsyncStorage.clear();
    clearCachedData();
    try {
      for (const s of collected) {
        try {
          await s.run();
        } catch (e) {
          if (e instanceof Error) e.message = `${s.kind} ${s.text}\n\n${e.message}`;
          throw e;
        }
      }
    } finally {
      await closeApp();
    }
  });
}

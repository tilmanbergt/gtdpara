/**
 * The page the user is on in the open note or document (0-based), for the
 * Engage panel's "which entry is this page" lookup
 * (docs/dev/history/technical-design-engage.md §3.4). Resolves null rather than
 * throwing: without a page the panel still works from the note's path.
 */
import {PluginCommAPI} from 'sn-plugin-lib';
import {errorMessage} from '../utils/errorMessage';
import {logWarn} from '../utils/log';
import {errText, SdkResponse} from './sdkElements';

export async function getCurrentPageNum(): Promise<number | null> {
  try {
    const r = (await PluginCommAPI.getCurrentPageNum()) as SdkResponse<number>;
    if (r?.success && typeof r.result === 'number') return r.result;
    logWarn('currentPage: no page', errText(r, 'no page'));
    return null;
  } catch (e) {
    logWarn('currentPage: reading the page failed', errorMessage(e));
    return null;
  }
}

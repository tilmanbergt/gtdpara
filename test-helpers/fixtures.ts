// Shared test fixtures (not a test suite itself - kept outside __tests__ so Jest doesn't run it).
import {deriveTaskFields} from '../src/domain/markdown';
import {ItemStatus, Meeting, Task} from '../src/domain/types';
import type {CachedItem} from '../src/storage/dataCache';

/** A Task as the parser would build it from `text`. */
export function task(text: string, extra: Partial<Task> = {}): Task {
  return {text, done: false, cancelled: false, notePath: '', linkedFile: '', ...deriveTaskFields(text), ...extra};
}

/** A Meeting with defaults; `time` '' = all day. */
export function meeting(date: string, title: string, extra: Partial<Meeting> = {}): Meeting {
  return {
    title,
    date,
    time: '',
    endTime: '',
    days: 1,
    tags: [],
    cancelled: false,
    notePath: '',
    linkedFile: '',
    ...extra,
  };
}

/** A CachedItem with defaults. */
export function item(
  kind: 'project' | 'area',
  name: string,
  extra: Partial<CachedItem> & {status?: ItemStatus} = {},
): CachedItem {
  return {
    kind,
    name,
    path: `/Note/${kind === 'project' ? '1 Projects' : '2 Areas'}/${name}`,
    rawContent: '',
    tasks: [],
    meetings: [],
    taskExtraLines: [],
    meetingExtraLines: [],
    scope: '',
    weeklyGoals: [],
    weeklyGoalsExtraLines: [],
    monthlyGoals: [],
    monthlyGoalsExtraLines: [],
    marks: [],
    marksExtraLines: [],
    status: 'active',
    dailyFocus: false,
    weeklyFocus: false,
    monthlyFocus: false,
    defaultResourceFolder: null,
    area: null,
    abbrev: null,
    frontMatterExtraLines: [],
    ...extra,
  };
}

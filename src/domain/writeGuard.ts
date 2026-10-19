/**
 * Decides how a save writes a data file that may have changed outside
 * gtdpara since the plugin read it (docs/dev/history/technical-design-quality-hardening.md
 * §3.2). A save owns some parts of the file (the frontmatter, `## ` sections)
 * and brings `apply`, which writes those parts into any version of the file.
 *
 * - The file is still what the save started from: write as always.
 * - An outside edit changed other parts only: write the save's parts into
 *   the file as it is now, so both changes are kept.
 * - An outside edit changed a part the save writes too: the user decides
 *   which version wins.
 * - The file is gone (deleted or moved outside): write nothing.
 */
import {GtdParaKind} from './types';
import {dataFilePartText, ensureSkeleton} from './markdown';

export interface DataFileChange {
  /** FRONT_MATTER_PART and/or `## ` headings this save writes. */
  parts: readonly string[];
  /** Writes those parts into `content` (already scaffolded with ensureSkeleton). Pure. */
  apply: (content: string) => string;
}

export type WriteDecision =
  | {kind: 'write'; content: string; merged: boolean}
  | {kind: 'conflict'; parts: string[]}
  | {kind: 'gone'};

/** `base` is the content the save started from, `current` the file as it is now ('' when missing). */
export function decideWrite(fileKind: GtdParaKind, base: string, current: string, change: DataFileChange): WriteDecision {
  if (current === base) return {kind: 'write', content: change.apply(ensureSkeleton(base, fileKind)), merged: false};
  // Deleted or moved outside: never rebuild it from a skeleton plus this save's parts.
  if (current === '') return {kind: 'gone'};
  const touched = change.parts.filter(part => dataFilePartText(base, part) !== dataFilePartText(current, part));
  if (touched.length > 0) return {kind: 'conflict', parts: touched};
  return {kind: 'write', content: change.apply(ensureSkeleton(current, fileKind)), merged: true};
}

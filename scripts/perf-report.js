#!/usr/bin/env node
/**
 * Summarizes utils/perf.ts trace files (docs/dev/history/technical-design-perf-tracing.md §8).
 *
 *   node scripts/perf-report.js <folder-with-.jsonl-files> [--timeline]
 *
 * Prints, per trace kind+label (e.g. "tab daily"): how many traces, median /
 * min / max of the total active time, median time per phase, render-pass
 * counts, rows drawn and console calls. With --timeline, also prints one full
 * event timeline per kind+label (the median trace).
 */
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
const showTimeline = process.argv.includes('--timeline');
if (!dir) {
  console.error('usage: node scripts/perf-report.js <folder> [--timeline]');
  process.exit(1);
}

function readTrace(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  const [header, ...events] = lines;
  events.sort((a, b) => a.t - b.t);
  return {file: path.basename(file), header, events};
}

const median = xs => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const fmt = x => (x == null ? '-' : Math.round(x).toString());

/** Phase buckets: span label prefix -> summed duration (overlapping spans are summed, so buckets can exceed wall time). */
function phaseOf(label) {
  if (label.startsWith('io:')) return label; // io:read, io:list, io:permission
  if (label.startsWith('agg:')) return 'agg (compute)';
  if (label.startsWith('parse:')) return 'parse';
  if (label.startsWith('cache:')) return label;
  if (label === 'load:settings') return 'load:settings';
  if (label === 'load:projectFile') return 'load:projectFile';
  if (label === 'screen:load') return 'screen:load';
  return 'other:' + label;
}

function analyze(trace) {
  const {header, events} = trace;
  const phases = {};
  const renders = {};
  let firstCommit = null;
  let lastCommit = null;
  let einkRequested = null;
  let einkFlush = null;
  // Frame gaps (tracer §13): split into "JS busy" (some JS event inside the
  // gap) and "native busy" (none - JS idle, frames still not produced).
  const jsEvents = events.filter(e => e.label !== 'frame:gap');
  let gapJs = 0;
  let gapNative = 0;
  let maxGap = 0;
  for (const g of events.filter(e => e.label === 'frame:gap')) {
    maxGap = Math.max(maxGap, g.dur);
    const inside = jsEvents.some(e => e.t > g.t + 1 && e.t < g.t + g.dur - 1);
    if (inside) gapJs += g.dur;
    else gapNative += g.dur;
  }
  for (const e of events) {
    if (e.label === 'frame:gap') continue;
    if (e.ev === 'span') {
      const p = phaseOf(e.label);
      phases[p] = (phases[p] ?? 0) + e.dur;
    } else if (e.label.startsWith('render:')) {
      const c = e.label.slice(7);
      renders[c] = (renders[c] ?? 0) + 1;
    } else if (e.label.startsWith('commit:')) {
      if (firstCommit == null) firstCommit = e.t;
      lastCommit = e.t;
    } else if (e.label === 'eink:requested') {
      einkRequested = e.t;
    } else if (e.label === 'eink:flush') {
      einkFlush = e.t;
    }
  }
  return {
    active: header.activeMs,
    firstCommit,
    lastCommit,
    einkRequested,
    einkFlush,
    gapJs,
    gapNative,
    maxGap,
    phases,
    renders,
    counters: header.counters ?? {},
  };
}

const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
const traces = files.map(f => readTrace(path.join(dir, f)));
const groups = new Map();
for (const t of traces) {
  const key = `${t.header.kind} ${t.header.label}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(t);
}

console.log(`# Perf report - ${traces.length} traces from ${dir}\n`);
const anyStats = traces.map(t => t.header.stats).find(s => s && s.tasks);
if (anyStats) {
  console.log('## Data volume (from the first trace with stats)\n');
  console.log('```json\n' + JSON.stringify({items: anyStats.items, tasks: anyStats.tasks, meetings: anyStats.meetings, files: anyStats.files}, null, 1) + '\n```\n');
}

for (const [key, list] of [...groups.entries()].sort()) {
  const complete = list.filter(t => !t.header.interrupted);
  const used = complete.length > 0 ? complete : list;
  const results = used.map(analyze);
  const note =
    complete.length === 0
      ? ' (all interrupted - shown anyway)'
      : complete.length < list.length
        ? ` (${list.length - complete.length} interrupted, skipped)`
        : '';
  console.log(`## ${key} - ${used.length} trace(s)${note}\n`);
  const col = f => results.map(f).filter(x => x != null);
  const actives = col(r => r.active);
  console.log(`- total active: median ${fmt(median(actives))} ms (min ${fmt(Math.min(...actives))}, max ${fmt(Math.max(...actives))})`);
  console.log(`- first commit: median ${fmt(median(col(r => r.firstCommit)))} ms, last commit: median ${fmt(median(col(r => r.lastCommit)))} ms`);
  console.log(`- e-ink requested: median ${fmt(median(col(r => r.einkRequested)))} ms, flushed: median ${fmt(median(col(r => r.einkFlush)))} ms`);
  console.log(`- frame gaps: JS busy median ${fmt(median(col(r => r.gapJs)))} ms, native busy (JS idle) median ${fmt(median(col(r => r.gapNative)))} ms, longest gap median ${fmt(median(col(r => r.maxGap)))} ms`);

  const phaseKeys = [...new Set(results.flatMap(r => Object.keys(r.phases)))].sort();
  if (phaseKeys.length) {
    console.log('\n| phase (summed span time) | median ms | max ms |\n|---|---:|---:|');
    for (const p of phaseKeys) {
      const xs = results.map(r => r.phases[p] ?? 0);
      console.log(`| ${p} | ${fmt(median(xs))} | ${fmt(Math.max(...xs))} |`);
    }
  }
  const compKeys = [...new Set(results.flatMap(r => Object.keys(r.renders)))].sort();
  if (compKeys.length) {
    console.log('\n| component | render passes (median) |\n|---|---:|');
    for (const c of compKeys) console.log(`| ${c} | ${fmt(median(results.map(r => r.renders[c] ?? 0)))} |`);
  }
  const counterKeys = [...new Set(results.flatMap(r => Object.keys(r.counters)))].sort();
  if (counterKeys.length) {
    console.log('\n| counter | median |\n|---|---:|');
    for (const c of counterKeys) console.log(`| ${c} | ${fmt(median(results.map(r => r.counters[c] ?? 0)))} |`);
  }

  if (showTimeline) {
    const sorted = [...used].sort((a, b) => a.header.activeMs - b.header.activeMs);
    const mid = sorted[Math.floor(sorted.length / 2)];
    console.log(`\nTimeline of the median trace (${mid.file}):\n\n\`\`\``);
    for (const e of mid.events) {
      const dur = e.ev === 'span' ? ` (${e.dur} ms)` : '';
      const meta = e.meta ? ' ' + JSON.stringify(e.meta) : '';
      console.log(`${String(e.t).padStart(8)}  ${e.label}${dur}${meta}`);
    }
    console.log('```');
  }
  console.log('');
}

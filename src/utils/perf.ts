/**
 * Lightweight performance tracing (docs/dev/technical-design-perf-tracing.md).
 *
 * Measurement only - records how long a tab switch / cold start / reopen
 * takes and where the time goes, then writes ONE small JSONL file per trace
 * to the debug log folder once things are quiet again.
 *
 * Design constraints (see the design doc §3/§7):
 * - While a trace is running, every call is just a timestamp + an array push.
 *   No console.log, no string building, no file I/O, no per-event timers (a
 *   setTimeout in RN is itself a bridge round-trip).
 * - A single 500 ms "is it quiet yet?" poll runs only while a trace is open.
 *   The trace ends after QUIET_MS without any new event (the screen stopped
 *   changing), or after MAX_TRACE_MS at the latest.
 * - Serializing + writing happens only after a trace has ended, deferred via
 *   InteractionManager, and never while another trace is running.
 * - Off by default (Settings -> "Performance tracing"). While the setting is
 *   still unknown (cold start, before settings have loaded) events ARE
 *   buffered, so the cold-start trace is not lost; perfEnable(false) then
 *   drops everything. Once disabled, every call returns after one check.
 *
 * Deliberately has no imports from storage/ or supernote/ (and not even
 * utils/log.ts, which itself imports this module): the file writer and the
 * data-statistics provider are injected by App.tsx via perfConfigure().
 */
import {useEffect, useLayoutEffect} from 'react';
import {InteractionManager} from 'react-native';

export type PerfTraceKind = 'cold' | 'reopen' | 'tab' | 'nav';
type Meta = Record<string, unknown>;

/** [t (ms since trace start), type, label, dur (ms, spans only), meta] */
type PerfEvent = [number, 'mark' | 'span', string, number, Meta | undefined];

interface Trace {
  seq: number;
  kind: PerfTraceKind;
  label: string;
  meta: Meta | undefined;
  t0: number;
  startedAtMs: number;
  lastEventAt: number;
  events: PerfEvent[];
  counters: Record<string, number>;
  /** An e-ink refresh was requested and has not been flushed yet - the trace does not end while this is true (up to MAX_TRACE_MS). */
  einkPending: boolean;
  /** Time of the last animation frame seen by the frame probe. */
  lastFrameAt: number;
  /** Filled in when the trace ends. */
  endedAt?: number;
  interrupted?: boolean;
  stats?: unknown;
}

export interface PerfConfig {
  /** Writes one finished trace file. `fileName` has no folder part. */
  writeFile: (fileName: string, content: string) => Promise<void>;
  /** Data-volume statistics for the trace header, computed at trace END (never during a trace). */
  collectStats?: () => unknown;
  /** Called on a failed write (optional, for logging). */
  onError?: (message: string) => void;
}

const QUIET_MS = 1500;
const MAX_TRACE_MS = 15000;
const POLL_MS = 500;
/** Safety cap so a stuck writer can never make memory grow without bound. */
const MAX_PENDING_TRACES = 20;

const perfClock = (globalThis as {performance?: {now(): number}}).performance;
const now: () => number =
  perfClock && typeof perfClock.now === 'function' ? () => perfClock.now() : () => Date.now();

const sessionId = Math.random().toString(36).slice(2, 6);

/** null = not known yet (settings not loaded) -> buffer; false -> off; true -> on. */
let enabled: boolean | null = null;
let config: PerfConfig | null = null;
let current: Trace | null = null;
let seqCounter = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;
const pending: Trace[] = [];
let writing = false;
let flushScheduled = false;

function round1(ms: number): number {
  return Math.round(ms * 10) / 10;
}

/** Turns tracing on/off. Called by App.tsx once settings are loaded, and by the Settings toggle. */
export function perfEnable(on: boolean): void {
  enabled = on;
  if (!on) {
    current = null;
    pending.length = 0;
    stopPoll();
    return;
  }
  scheduleFlush();
}

/** Wires the file writer + stats provider (App.tsx, once at startup). */
export function perfConfigure(next: PerfConfig): void {
  config = next;
  scheduleFlush();
}

/**
 * Starts a new trace. A still-running trace is ended first and kept, marked
 * `interrupted` (e.g. the user tapped the next tab before the last one was
 * quiet).
 */
export function perfBegin(kind: PerfTraceKind, label: string, meta?: Meta): void {
  if (enabled === false) return;
  const t = now();
  if (current) endTrace(current, t, true);
  current = {
    seq: ++seqCounter,
    kind,
    label,
    meta: writing ? {...meta, flushInProgress: true} : meta,
    t0: t,
    startedAtMs: Date.now(),
    lastEventAt: t,
    events: [],
    counters: {},
    einkPending: false,
    lastFrameAt: t,
  };
  startPoll();
  startFrameProbe(current);
}

/**
 * Frame probe (docs/dev/technical-design-perf-tracing.md §13): while a trace is
 * open, one requestAnimationFrame callback per frame. A gap between two
 * frames longer than FRAME_GAP_MS means frames were not being produced -
 * the JS thread was busy, or (when no JS event falls inside the gap) the
 * native side was busy creating/laying out views. Recorded as a
 * `frame:gap` span; it also counts as activity, so the trace does not end
 * while the native side is still working. Only runs while tracing is on.
 */
const FRAME_GAP_MS = 100;
function startFrameProbe(trace: Trace): void {
  if (typeof requestAnimationFrame !== 'function') return;
  const onFrame = () => {
    if (current !== trace) return;
    const t = now();
    const gap = t - trace.lastFrameAt;
    if (gap > FRAME_GAP_MS) {
      trace.events.push([trace.lastFrameAt - trace.t0, 'span', 'frame:gap', gap, undefined]);
      trace.lastEventAt = t;
    }
    trace.lastFrameAt = t;
    trace.counters.frames = (trace.counters.frames ?? 0) + 1;
    requestAnimationFrame(onFrame);
  };
  requestAnimationFrame(onFrame);
}

/** Instant event. */
export function perfMark(label: string, meta?: Meta): void {
  const trace = current;
  if (!trace) return;
  const t = now();
  trace.events.push([t - trace.t0, 'mark', label, 0, meta]);
  trace.lastEventAt = t;
  if (label === 'eink:requested') trace.einkPending = true;
  else if (label === 'eink:flush') trace.einkPending = false;
}

/** Start of a span for straight-line code; pass the returned token to perfEnd. Returns -1 when no trace is open. */
export function perfStart(): number {
  return current ? now() : -1;
}

/** End of a span started with perfStart(). */
export function perfEnd(label: string, token: number, meta?: Meta): void {
  const trace = current;
  if (!trace || token < 0) return;
  const t = now();
  // A span that began before this trace started (e.g. a background cache
  // rebuild still running) is clipped to the trace start and flagged.
  const start = Math.max(token, trace.t0);
  const fullMeta = token < trace.t0 ? {...meta, startedBeforeTrace: true} : meta;
  trace.events.push([start - trace.t0, 'span', label, t - start, fullMeta]);
  trace.lastEventAt = t;
}

/** Times a synchronous function. */
export function perfTime<T>(label: string, fn: () => T, meta?: Meta): T {
  if (!current) return fn();
  const token = now();
  try {
    return fn();
  } finally {
    perfEnd(label, token, meta);
  }
}

/** Cheap counter (e.g. rows rendered). Does not count as "activity" for the quiet-period detection. */
export function perfCount(label: string, n = 1): void {
  const trace = current;
  if (!trace) return;
  trace.counters[label] = (trace.counters[label] ?? 0) + n;
}

/** Adds the time since `token` (from perfStart) to a counter - total ms spent in something frequent and tiny (console calls, row renders), without one event per call. */
export function perfAccum(label: string, token: number): void {
  const trace = current;
  if (!trace || token < 0) return;
  trace.counters[label] = round1((trace.counters[label] ?? 0) + (now() - Math.max(token, trace.t0)));
}

/**
 * Per-screen render instrumentation: marks `render:<name>` in the component
 * body (every render pass), `commit:<name>` once React has committed it
 * (layout effect), and `effects:<name>` after its effects ran.
 */
export function usePerfRender(name: string): void {
  perfMark('render:' + name);
  useLayoutEffect(() => {
    perfMark('commit:' + name);
  });
  useEffect(() => {
    perfMark('effects:' + name);
  });
}

// --- trace lifecycle --------------------------------------------------------

function startPoll(): void {
  if (pollTimer) return;
  pollTimer = setInterval(checkQuiet, POLL_MS);
}

function stopPoll(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function checkQuiet(): void {
  const trace = current;
  if (!trace) {
    stopPoll();
    return;
  }
  const t = now();
  // A requested e-ink refresh that hasn't flushed yet keeps the trace open -
  // the flush is the last step of "the screen is done".
  const quiet = t - trace.lastEventAt >= QUIET_MS && !trace.einkPending;
  if (quiet || t - trace.t0 >= MAX_TRACE_MS) {
    endTrace(trace, t, false);
  }
}

function endTrace(trace: Trace, t: number, interrupted: boolean): void {
  if (current === trace) current = null;
  if (!current) stopPoll();
  trace.endedAt = t;
  trace.interrupted = interrupted;
  if (config?.collectStats) {
    try {
      trace.stats = config.collectStats();
    } catch (e) {
      trace.stats = {error: e instanceof Error ? e.message : String(e)};
    }
  }
  pending.push(trace);
  if (pending.length > MAX_PENDING_TRACES) pending.shift();
  scheduleFlush();
}

function scheduleFlush(): void {
  if (flushScheduled || writing || enabled !== true || !config || pending.length === 0 || current) return;
  flushScheduled = true;
  InteractionManager.runAfterInteractions(() => {
    flushScheduled = false;
    flush();
  });
}

async function flush(): Promise<void> {
  if (writing || enabled !== true || !config || current) return;
  writing = true;
  try {
    while (pending.length > 0 && !current && enabled === true) {
      const trace = pending.shift()!;
      try {
        await config.writeFile(fileNameOf(trace), serialize(trace));
      } catch (e) {
        config.onError?.(e instanceof Error ? e.message : String(e));
      }
    }
  } finally {
    writing = false;
  }
  // A trace may have ended while we were writing.
  scheduleFlush();
}

function safeLabel(label: string): string {
  return label.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 40);
}

function fileNameOf(trace: Trace): string {
  const seq = String(trace.seq).padStart(3, '0');
  return `${sessionId}-${seq}-${trace.kind}-${safeLabel(trace.label)}.jsonl`;
}

function serialize(trace: Trace): string {
  // Spans are recorded when they END, so events are not sorted by start
  // time - the latest end across all events is "last activity".
  let lastEnd = 0;
  for (const [t, , , dur] of trace.events) lastEnd = Math.max(lastEnd, t + dur);
  const header = {
    type: 'trace',
    version: 1,
    kind: trace.kind,
    label: trace.label,
    session: sessionId,
    seq: trace.seq,
    startedAt: new Date(trace.startedAtMs).toISOString(),
    /** ms from trace start to the last recorded event ("screen stopped changing" from JS's point of view). */
    activeMs: round1(lastEnd),
    interrupted: trace.interrupted ?? false,
    eventCount: trace.events.length,
    meta: trace.meta ?? {},
    counters: trace.counters,
    stats: trace.stats ?? null,
  };
  const lines = [JSON.stringify(header)];
  for (const [t, ev, label, dur, meta] of trace.events) {
    const line: Record<string, unknown> = {t: round1(t), ev, label};
    if (ev === 'span') line.dur = round1(dur);
    if (meta) line.meta = meta;
    lines.push(JSON.stringify(line));
  }
  return lines.join('\n') + '\n';
}

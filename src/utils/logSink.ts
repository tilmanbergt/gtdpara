/**
 * Where log lines go besides logcat (docs/dev/technical-design-about-debug-experimental.md §3.3):
 *
 * 1. Always: an in-memory ring buffer of the last MAX_LINES lines, used by
 *    the debug bundle (storage/debugBundle.ts). Cheap: one formatted string
 *    per log call.
 * 2. Only while "Debug logging" is on: the same lines are queued and
 *    appended to `EXPORT/gtdpara/debug/gtdpara-log.txt` every few seconds
 *    (rotated natively at LOG_FILE_MAX_BYTES), so they survive a crash.
 *
 * No imports from storage/ or supernote/ (utils/log.ts imports this module,
 * and almost everything imports log.ts): the file writer is injected once at
 * startup by App.tsx via configureLogFileSink, like perfConfigure.
 */

export type LogLevel = 'E' | 'W' | 'I';

export const MAX_LINES = 1000;
export const LOG_FILE_NAME = 'gtdpara-log.txt';
export const LOG_FILE_MAX_BYTES = 1_000_000;
const MAX_LINE_CHARS = 1000;
const MAX_ARG_CHARS = 300;
const FLUSH_DELAY_MS = 5000;
const FLUSH_AT_LINES = 200;

// Ring buffer: `ring` holds up to MAX_LINES entries, `next` is the slot the
// following line goes into once the buffer is full.
const ring: string[] = [];
let next = 0;

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

function timeStamp(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export function formatLogArg(arg: unknown): string {
  if (typeof arg === 'string') {return arg;}
  if (typeof arg === 'number' || typeof arg === 'boolean' || typeof arg === 'bigint') {return String(arg);}
  if (arg === null) {return 'null';}
  if (arg === undefined) {return 'undefined';}
  if (arg instanceof Error) {return `${arg.name}: ${arg.message}`;}
  try {
    const json = JSON.stringify(arg);
    if (json === undefined) {return String(arg);}
    return json.length > MAX_ARG_CHARS ? `${json.slice(0, MAX_ARG_CHARS)}…` : json;
  } catch {
    return '[unserializable]';
  }
}

export function formatLogLine(level: LogLevel, args: unknown[], now: Date = new Date()): string {
  const text = args.map(formatLogArg).join(' ');
  const line = `${timeStamp(now)} ${level} ${text}`;
  return line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)}…` : line;
}

function pushToRing(line: string): void {
  if (ring.length < MAX_LINES) {
    ring.push(line);
  } else {
    ring[next] = line;
    next = (next + 1) % MAX_LINES;
  }
}

/** Called by utils/log.ts for every log/logWarn/logError call. */
export function recordLogLine(level: LogLevel, args: unknown[]): void {
  const line = formatLogLine(level, args);
  pushToRing(line);
  if (fileLoggingOn) {enqueue(line);}
}

/** Oldest first. */
export function getRecentLogLines(): string[] {
  return ring.length < MAX_LINES ? ring.slice() : [...ring.slice(next), ...ring.slice(0, next)];
}

/** The last `n` error lines, oldest first. */
export function getRecentErrors(n: number): string[] {
  return getRecentLogLines()
    .filter(line => line.charAt(13) === 'E')
    .slice(-n);
}

// ---------------------------------------------------------------- file sink

export type LogFileWriter = (fileName: string, content: string, maxBytes: number) => Promise<number>;

let writer: LogFileWriter | null = null;
let sessionHeader = '';
let fileLoggingOn = false;
let headerWritten = false;
let queue: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing: Promise<void> | null = null;

/** App.tsx, once at startup: how to append to the log file, and the line that starts each session in it. */
export function configureLogFileSink(fileWriter: LogFileWriter, header: string): void {
  writer = fileWriter;
  sessionHeader = header;
}

export function isFileLoggingOn(): boolean {
  return fileLoggingOn;
}

/**
 * Turns the file sink on or off. The first time it is switched on in a
 * session, the session header and everything already in the ring buffer
 * (e.g. the startup lines logged before settings were loaded) go first.
 */
export function setFileLogging(on: boolean): void {
  if (on === fileLoggingOn) {return;}
  fileLoggingOn = on;
  if (!on) {
    void flushLogFile();
    return;
  }
  if (!headerWritten) {
    headerWritten = true;
    queue = [sessionHeader || `=== gtdpara session ${new Date().toISOString()} ===`, ...getRecentLogLines(), ...queue];
  }
  schedule();
}

function enqueue(line: string): void {
  queue.push(line);
  if (queue.length >= FLUSH_AT_LINES) {void flushLogFile();}
  else {schedule();}
}

function schedule(): void {
  if (timer !== null) {return;}
  timer = setTimeout(() => {
    timer = null;
    void flushLogFile();
  }, FLUSH_DELAY_MS);
}

/** Writes whatever is queued. Safe to call any time; concurrent calls share one write. */
export function flushLogFile(): Promise<void> {
  if (flushing) {return flushing;}
  if (queue.length === 0 || !writer) {return Promise.resolve();}
  const batch = queue;
  queue = [];
  const w = writer;
  flushing = w(LOG_FILE_NAME, batch.join('\n') + '\n', LOG_FILE_MAX_BYTES)
    .then(() => undefined)
    .catch((e: unknown) => {
      // Give up for this session rather than retry in a loop; the ring
      // buffer still has everything for an exported bundle.
      fileLoggingOn = false;
      pushToRing(formatLogLine('W', ['logSink: writing the log file failed, file logging stopped for this session', e]));
    })
    .finally(() => {
      flushing = null;
      if (fileLoggingOn && queue.length > 0) {schedule();}
    });
  return flushing;
}

/** Test helper: forget everything. */
export function resetLogSinkForTests(): void {
  ring.length = 0;
  next = 0;
  writer = null;
  sessionHeader = '';
  fileLoggingOn = false;
  headerWritten = false;
  queue = [];
  if (timer !== null) {clearTimeout(timer);}
  timer = null;
  flushing = null;
}

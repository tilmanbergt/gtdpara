/**
 * An in-memory stand-in for the native GtdParaFile module
 * (android/.../GtdParaFileModule.kt), so scenario tests run the real
 * supernote/fileSystem.ts and everything above it
 * (docs/dev/history/technical-design-quality-hardening.md §4.2).
 *
 * The rules are the native module's: listings are sorted case-insensitively and
 * hide dot files and `.mark` files; moves refuse an existing destination;
 * deleteEmptyFolder refuses a folder with anything in it; the private deletes
 * refuse paths outside their folder; writeTextFile replaces atomically.
 *
 * Faults for the tests: `failNext` makes the next matching call throw,
 * `crashAfter(n)` lets n more writes through and then throws SimulatedCrash
 * on every call (the plugin was killed), `editExternally` changes a file as
 * another app would.
 */

export const PRIVATE_DIR = '/data/user/0/host/files/plugins/gtdpara';

export class SimulatedCrash extends Error {
  constructor() {
    super('simulated crash: the plugin was stopped');
    this.name = 'SimulatedCrash';
  }
}

interface FakeFile {
  content: string;
  mtime: number;
}

type Method =
  | 'listFolderEntries'
  | 'readTextFile'
  | 'writeTextFile'
  | 'appendTextFile'
  | 'writeBinaryFile'
  | 'statFiles'
  | 'ensureFolder'
  | 'moveFile'
  | 'moveFolder'
  | 'moveFolderMerge'
  | 'deleteEmptyFolder'
  | 'deleteTempTree'
  | 'deletePrivateDataTree';

const WRITES: ReadonlySet<Method> = new Set([
  'writeTextFile',
  'appendTextFile',
  'writeBinaryFile',
  'ensureFolder',
  'moveFile',
  'moveFolder',
  'moveFolderMerge',
  'deleteEmptyFolder',
  'deleteTempTree',
  'deletePrivateDataTree',
]);

function parentOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/')) || '/';
}

function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function norm(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

function rejectWith(code: string, message: string): Error {
  const e = new Error(message) as Error & {code: string};
  e.code = code;
  return e;
}

export class FakeFs {
  private files = new Map<string, FakeFile>();
  private folders = new Set<string>(['/']);
  private clock = 1_700_000_000_000;
  private failures: Array<{method: Method; pattern?: RegExp; message: string}> = [];
  private writesLeft: number | null = null;
  private crashed = false;
  /** Every call, in order, for assertions. */
  readonly calls: Array<{method: Method; path: string}> = [];

  // ---- set-up and inspection (tests) ----

  /** Puts a file (and its folders) in place, as if it had always been there. */
  put(path: string, content: string): void {
    this.ensureParents(path);
    this.files.set(norm(path), {content, mtime: this.tick()});
  }

  /** Creates a folder (and its parents). */
  mkdir(path: string): void {
    this.ensureParents(`${norm(path)}/x`);
  }

  /** The file's content, or undefined. */
  get(path: string): string | undefined {
    return this.files.get(norm(path))?.content;
  }

  exists(path: string): boolean {
    return this.files.has(norm(path)) || this.folders.has(norm(path));
  }

  /** Changes a file as another app (Obsidian, a sync) would: new content, new time. */
  editExternally(path: string, edit: (content: string) => string): void {
    const file = this.files.get(norm(path));
    if (!file) throw new Error(`fakeFs: no file ${path} to edit`);
    this.files.set(norm(path), {content: edit(file.content), mtime: this.tick()});
  }

  /** Removes a file as another app would. */
  deleteExternally(path: string): void {
    this.files.delete(norm(path));
  }

  /** The next call of `method` (on a path matching `pattern`) throws `message`. */
  failNext(method: Method, pattern?: RegExp, message = `simulated failure of ${method}`): void {
    this.failures.push({method, pattern, message});
  }

  /** Lets `writes` more writing calls through; after that every call throws SimulatedCrash. */
  crashAfter(writes: number): void {
    this.writesLeft = writes;
  }

  /** The plugin starts again: calls work again, the files stay as the crash left them. */
  restart(): void {
    this.writesLeft = null;
    this.crashed = false;
  }

  /** Every file under `root` with its content, sorted - for readable assertions and failures. */
  tree(root = '/'): Record<string, string> {
    const prefix = root === '/' ? '/' : `${norm(root)}/`;
    const out: Record<string, string> = {};
    [...this.files.keys()]
      .filter(p => p.startsWith(prefix))
      .sort()
      .forEach(p => {
        out[p] = this.files.get(p)!.content;
      });
    return out;
  }

  /** Every path under `root` (files and folders), sorted. */
  paths(root = '/'): string[] {
    const prefix = root === '/' ? '/' : `${norm(root)}/`;
    return [...this.files.keys(), ...this.folders].filter(p => p.startsWith(prefix)).sort();
  }

  // ---- the native module ----

  /** The object installed as NativeModules.GtdParaFile. */
  readonly module = {
    listFolderEntries: (folderPath: string) =>
      this.call('listFolderEntries', folderPath, () => {
        const folder = norm(folderPath);
        if (this.files.has(folder)) throw rejectWith('E_NOT_DIRECTORY', `Path is not a folder: ${folderPath}`);
        if (!this.folders.has(folder)) return [];
        return this.children(folder)
          .filter(name => !name.startsWith('.') && !name.toLowerCase().endsWith('.mark'))
          .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
          .map(name => {
            const path = `${folder === '/' ? '' : folder}/${name}`;
            return {name, path, isFolder: this.folders.has(path) && !name.toLowerCase().endsWith('.note')};
          });
      }),
    readTextFile: (path: string) =>
      this.call('readTextFile', path, () => {
        if (this.folders.has(norm(path))) throw rejectWith('E_NOT_FILE', `Path is not a file: ${path}`);
        return this.files.get(norm(path))?.content ?? null;
      }),
    writeTextFile: (path: string, content: string) =>
      this.call('writeTextFile', path, () => {
        this.ensureParents(path);
        this.files.set(norm(path), {content, mtime: this.tick()});
        return 'atomic';
      }),
    appendTextFile: (path: string, content: string) =>
      this.call('appendTextFile', path, () => {
        this.ensureParents(path);
        const next = (this.files.get(norm(path))?.content ?? '') + content;
        this.files.set(norm(path), {content: next, mtime: this.tick()});
        return next.length;
      }),
    writeBinaryFile: (path: string, base64Content: string) =>
      this.call('writeBinaryFile', path, () => {
        this.ensureParents(path);
        this.files.set(norm(path), {content: `base64:${base64Content}`, mtime: this.tick()});
        return true;
      }),
    statFiles: (paths: string[]) =>
      this.call('statFiles', paths.join(','), () =>
        paths.map(path => {
          const file = this.files.get(norm(path));
          return {path, exists: !!file, lastModified: file?.mtime ?? 0, size: file ? file.content.length : -1};
        }),
      ),
    ensureFolder: (path: string) =>
      this.call('ensureFolder', path, () => {
        if (this.files.has(norm(path))) throw rejectWith('E_NOT_DIRECTORY', `Path exists and is not a folder: ${path}`);
        const existed = this.folders.has(norm(path));
        this.mkdir(path);
        return !existed;
      }),
    moveFile: (fromPath: string, toPath: string) =>
      this.call('moveFile', fromPath, () => {
        const file = this.files.get(norm(fromPath));
        if (!file) throw rejectWith('E_NOT_FILE', `Source is not a file: ${fromPath}`);
        if (this.exists(toPath)) throw rejectWith('E_DEST_EXISTS', `A file named "${nameOf(toPath)}" already exists at the destination`);
        this.ensureParents(toPath);
        this.files.delete(norm(fromPath));
        this.files.set(norm(toPath), file);
        return true;
      }),
    moveFolder: (fromPath: string, toPath: string) =>
      this.call('moveFolder', fromPath, () => {
        if (!this.folders.has(norm(fromPath))) throw rejectWith('E_NOT_DIRECTORY', `Source is not a folder: ${fromPath}`);
        if (this.exists(toPath)) throw rejectWith('E_DEST_EXISTS', `A folder named "${nameOf(toPath)}" already exists at the destination`);
        this.renameTree(norm(fromPath), norm(toPath));
        return true;
      }),
    moveFolderMerge: (fromPath: string, toPath: string) =>
      this.call('moveFolderMerge', fromPath, () => {
        const from = norm(fromPath);
        const to = norm(toPath);
        if (!this.folders.has(from)) throw rejectWith('E_NOT_DIRECTORY', `Source is not a folder: ${fromPath}`);
        if (!this.exists(to)) {
          this.renameTree(from, to);
          return true;
        }
        if (!this.folders.has(to)) throw rejectWith('E_NOT_DIRECTORY', `Destination exists and is not a folder: ${toPath}`);
        const children = this.children(from);
        const collisions = children.filter(name => this.exists(`${to}/${name}`));
        if (collisions.length > 0) throw rejectWith('E_COLLISION', `Already in the destination: ${collisions.join(', ')}`);
        children.forEach(name => this.renameTree(`${from}/${name}`, `${to}/${name}`));
        return true;
      }),
    deleteEmptyFolder: (path: string) =>
      this.call('deleteEmptyFolder', path, () => {
        const folder = norm(path);
        if (!this.exists(folder)) return true;
        if (!this.folders.has(folder)) throw rejectWith('E_NOT_DIRECTORY', `Not a folder: ${path}`);
        if (this.children(folder).length > 0) throw rejectWith('E_NOT_EMPTY', `Folder is not empty: ${path}`);
        this.folders.delete(folder);
        return true;
      }),
    getPrivateTempDir: async () => {
      this.mkdir(`${PRIVATE_DIR}/tmp`);
      return `${PRIVATE_DIR}/tmp`;
    },
    getPrivateDataDir: async () => {
      this.mkdir(`${PRIVATE_DIR}/data`);
      return `${PRIVATE_DIR}/data`;
    },
    deleteTempTree: (path: string) =>
      this.call('deleteTempTree', path, () => this.deleteTreeInside(path, `${PRIVATE_DIR}/tmp`, 'E_NOT_TEMP')),
    deletePrivateDataTree: (path: string) =>
      this.call('deletePrivateDataTree', path, () => this.deleteTreeInside(path, `${PRIVATE_DIR}/data`, 'E_NOT_PRIVATE_DATA')),
  };

  // ---- internals ----

  private tick(): number {
    this.clock += 1000;
    return this.clock;
  }

  private ensureParents(path: string): void {
    let parent = parentOf(norm(path));
    const missing: string[] = [];
    while (!this.folders.has(parent)) {
      if (this.files.has(parent)) throw rejectWith('E_NOT_DIRECTORY', `Path exists and is not a folder: ${parent}`);
      missing.push(parent);
      parent = parentOf(parent);
    }
    missing.forEach(f => this.folders.add(f));
  }

  private children(folder: string): string[] {
    const prefix = folder === '/' ? '/' : `${folder}/`;
    const names = new Set<string>();
    for (const p of [...this.files.keys(), ...this.folders]) {
      if (p !== folder && p.startsWith(prefix) && !p.slice(prefix.length).includes('/')) names.add(p.slice(prefix.length));
    }
    return [...names];
  }

  private renameTree(from: string, to: string): void {
    this.ensureParents(to);
    const move = (p: string) => to + p.slice(from.length);
    for (const p of [...this.files.keys()]) {
      if (p === from || p.startsWith(`${from}/`)) {
        this.files.set(move(p), this.files.get(p)!);
        this.files.delete(p);
      }
    }
    for (const p of [...this.folders]) {
      if (p === from || p.startsWith(`${from}/`)) {
        this.folders.delete(p);
        this.folders.add(move(p));
      }
    }
  }

  private deleteTreeInside(path: string, root: string, code: string): boolean {
    const target = norm(path);
    if (target !== root && !target.startsWith(`${root}/`)) throw rejectWith(code, `Refusing to delete outside ${root}: ${path}`);
    for (const p of [...this.files.keys()]) if (p === target || p.startsWith(`${target}/`)) this.files.delete(p);
    for (const p of [...this.folders]) if (p === target || p.startsWith(`${target}/`)) this.folders.delete(p);
    return true;
  }

  private async call<T>(method: Method, path: string, run: () => T): Promise<T> {
    this.calls.push({method, path});
    if (this.crashed) throw new SimulatedCrash();
    const failure = this.failures.findIndex(f => f.method === method && (!f.pattern || f.pattern.test(path)));
    if (failure >= 0) {
      const [f] = this.failures.splice(failure, 1);
      throw new Error(f.message);
    }
    if (WRITES.has(method) && this.writesLeft !== null) {
      if (this.writesLeft === 0) {
        this.crashed = true;
        throw new SimulatedCrash();
      }
      this.writesLeft -= 1;
    }
    return run();
  }
}

import fs from 'node:fs';
import path from 'node:path';

const openFiles = new Set<JsonFile<unknown>>();

function sleepSync(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * A JSON document on disk. Writes are debounced and atomic
 * (write temp file, then rename) so a crash never leaves a half-written file.
 */
export class JsonFile<T> {
  data: T;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly file: string,
    defaults: () => T,
  ) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
      this.data = { ...defaults(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        const backup = `${file}.corrupt-${Date.now()}`;
        console.warn(`[store] Could not read ${file}; backed it up to ${backup}`);
        try {
          fs.copyFileSync(file, backup);
        } catch {
          /* ignore */
        }
      }
      this.data = defaults();
    }
    openFiles.add(this as JsonFile<unknown>);
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 150);
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = undefined;
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    // OneDrive / antivirus can briefly lock files on Windows; retry the rename.
    for (let attempt = 0; ; attempt++) {
      try {
        fs.renameSync(tmp, this.file);
        return;
      } catch (err) {
        if (attempt >= 8) throw err;
        sleepSync(50 * (attempt + 1));
      }
    }
  }

  delete() {
    clearTimeout(this.timer);
    fs.rmSync(this.file, { force: true });
  }
}

export function flushAll() {
  for (const f of openFiles) {
    try {
      f.flush();
    } catch (err) {
      console.error('[store] flush failed', err);
    }
  }
}

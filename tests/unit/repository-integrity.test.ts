import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Is the repository actually buildable from a clone?
 *
 * This exists because the answer was twice "no", in the same way, and nothing
 * caught it: an unanchored `.gitignore` pattern matches at every depth, so
 * `storage/` silently excluded `src/server/storage/` and `build/` silently
 * excluded `src/app/admin/(dashboard)/build/`. Both times every local check
 * passed — the files were on disk — and both times the deployed build was
 * missing an entire feature.
 *
 * A clean clone is the only thing that tells the truth, and this is the cheap
 * form of it: no source file may be ignored, and no new ignore rule may be
 * written in a way that could quietly ignore one later.
 */

const ROOTS = ['src', 'prisma', 'e2e', 'tests', 'docs'];


/** Output of `prisma generate`, legitimately ignored. */
const ALLOWED_IGNORED = ['src/generated'];

/**
 * Patterns that *should* match at any depth: tool and editor directories that
 * never hold our source. Everything else must be anchored to the repository
 * root, so it cannot reach into src/.
 */
const ALLOWED_UNANCHORED = new Set(['node_modules/', '.vscode/', '.idea/']);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.css', '.prisma', '.sql', '.md', '.mjs']);

function collect(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);

    if (statSync(full).isDirectory()) {
      collect(full, found);
      continue;
    }

    if (SOURCE_EXTENSIONS.has(path.extname(entry))) found.push(full);
  }

  return found;
}

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: process.cwd(), encoding: 'utf8' });
}

describe('every source file reaches the repository', () => {
  const files = ROOTS.flatMap((root) => collect(root)).filter(
    (file) => !ALLOWED_IGNORED.some((prefix) => file.startsWith(prefix)),
  );

  it('finds source files to check', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('has no source file excluded by .gitignore', () => {
    // check-ignore exits 1 when nothing matches, which is the passing case.
    let ignored: string[] = [];

    try {
      ignored = git(['check-ignore', '--', ...files]).split('\n').filter(Boolean);
    } catch {
      ignored = [];
    }

    expect(ignored).toEqual([]);
  });

  it('has no directory pattern that could swallow one later', () => {
    // The failure mode is a pattern with no leading slash that names a
    // directory: it matches at every depth, so `build/` excludes both the
    // build output and any directory called `build` inside src.
    const patterns = readFileSync('.gitignore', 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#') && !line.startsWith('!'));

    const unanchored = patterns.filter(
      (pattern) =>
        pattern.endsWith('/') &&
        !pattern.startsWith('/') &&
        !pattern.includes('*') &&
        !ALLOWED_UNANCHORED.has(pattern),
    );

    expect(unanchored).toEqual([]);
  });
});

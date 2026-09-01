import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));
const WRITE_API_PATTERN = /\b(setDoc|addDoc|updateDoc|writeBatch|runTransaction)\b/;
const FIRESTORE_IMPORT_PATTERN = /import\s*\{([\s\S]*?)\}\s*from\s*['"]firebase\/firestore['"]/g;

const collectSourceFiles = (directory) => readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(path);
    return ['.js', '.jsx'].includes(extname(entry.name)) ? [path] : [];
  });

describe('Firestore write boundary contract', () => {
  it('routes every application write through config/firebase safety wrappers', () => {
    const offenders = collectSourceFiles(SOURCE_ROOT)
      .filter((path) => !path.endsWith(join('config', 'firebase.js')))
      .filter((path) => {
        const source = readFileSync(path, 'utf8');
        return [...source.matchAll(FIRESTORE_IMPORT_PATTERN)]
          .some((match) => WRITE_API_PATTERN.test(match[1]));
      })
      .map((path) => relative(SOURCE_ROOT, path));

    expect(offenders).toEqual([]);
  });
});

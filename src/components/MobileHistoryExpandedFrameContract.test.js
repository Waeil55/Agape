import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

describe('mobile history expanded-card frame contract', () => {
  it.each(['DriverPage.jsx', 'MobileReportsPage.jsx', 'ArchivesPage.jsx'])(
    'frames the complete expanded record in %s',
    (name) => {
      const source = read(name);
      expect(source).toContain('data-expanded-frame');
      expect(source).toContain('ring-2 ring-indigo-400 ring-offset-2 ring-offset-slate-50 shadow-md');
    },
  );
});

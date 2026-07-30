import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const functionsSourcePath = fileURLToPath(new URL('../../functions/index.js', import.meta.url));

describe('Cloud Functions secure configuration', () => {
  it('contains no deprecated functions.config access', () => {
    const source = readFileSync(functionsSourcePath, 'utf8');
    expect(source).not.toContain('functions.config()');
    expect(source).toContain('defineSecret("AGAPE_RUNTIME_CONFIG")');
  });

  it.each([
    'sendSms',
    'sendBulkSms',
    'handleInboundSms',
    'diagnoseTelnyx',
  ])('binds the runtime secret only to %s', (functionName) => {
    const source = readFileSync(functionsSourcePath, 'utf8');
    const declaration = source.indexOf(`exports.${functionName} = functions`);
    expect(declaration).toBeGreaterThanOrEqual(0);
    expect(source.slice(declaration, declaration + 180))
      .toContain('.runWith({ secrets: [runtimeConfigSecret] })');
  });
});

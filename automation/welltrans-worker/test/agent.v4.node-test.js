import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AGENT_ROLES, createCapabilityKernel } from '../src/agent.capability-kernel.js';
import { createAgentSupervisor } from '../src/agent.supervisor.js';
import { analyzeLocally } from '../src/agent.local-intelligence.js';
import { selectBrokerTransport } from '../src/broker.transport.js';

describe('Agent v4 enterprise kernel', () => {
  it('permits only the portal-writer role to stage and rejects forged capabilities', async () => {
    const kernel = createCapabilityKernel('test-instance');
    const writer = kernel.issue(AGENT_ROLES.WRITER);
    const verifier = kernel.issue(AGENT_ROLES.VERIFIER);
    assert.equal(await kernel.runExclusiveWrite(writer, '2026-08-01:1', async () => 'staged'), 'staged');
    await assert.rejects(() => kernel.runExclusiveWrite(verifier, '2026-08-01:1', async () => 'bad'), /denied/);
    await assert.rejects(() => kernel.runExclusiveWrite({ ...writer }, '2026-08-01:1', async () => 'bad'), /denied/);
  });

  it('enforces exactly one concurrent portal writer', async () => {
    const kernel = createCapabilityKernel('test-instance');
    const writer = kernel.issue(AGENT_ROLES.WRITER);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const first = kernel.runExclusiveWrite(writer, 'date:one', () => gate);
    await assert.rejects(() => kernel.runExclusiveWrite(writer, 'date:two', async () => null), /concurrency violation/);
    release('done');
    assert.equal(await first, 'done');
  });

  it('publishes component degradation without hiding failures', async () => {
    const supervisor = createAgentSupervisor([{ id: 'reviewer', role: 'verifier' }]);
    await assert.rejects(() => supervisor.run('reviewer', async () => { throw new Error('read-back failed'); }));
    const state = supervisor.snapshot();
    assert.equal(state.healthy, false);
    assert.equal(state.components[0].failures, 1);
    assert.match(state.components[0].lastError, /read-back failed/);
  });

  it('keeps local intelligence diagnostic-only and network-free', () => {
    const result = analyzeLocally(new Error('Booking row ambiguous'), { bookingId: '123' });
    assert.equal(result.networkUsed, false);
    assert.equal(result.modelAuthority, 'diagnostic_only');
    assert.equal(result.severity, 'critical');
  });

  it('fails closed for uncertified API and file-exchange transports', () => {
    assert.equal(selectBrokerTransport('playwright').parallelWrites, 1);
    assert.throws(() => selectBrokerTransport('tripspark_api'), /certified access/);
    assert.throws(() => selectBrokerTransport('tripspark_file_exchange'), /certified access/);
  });
});

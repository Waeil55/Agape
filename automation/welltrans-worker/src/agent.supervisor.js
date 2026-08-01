import { performance } from 'node:perf_hooks';

export function createAgentSupervisor(componentDefinitions) {
  const components = new Map(componentDefinitions.map(item => [item.id, {
    ...item, state: 'ready', runs: 0, failures: 0, lastDurationMs: 0, lastError: '', lastRunAt: null,
  }]));
  const run = async (id, operation) => {
    const component = components.get(id);
    if (!component) throw new Error(`Unregistered Agent component: ${id}`);
    component.state = 'running';
    const started = performance.now();
    try {
      const result = await operation();
      component.state = 'ready'; component.runs += 1; component.lastError = '';
      return result;
    } catch (error) {
      component.state = 'degraded'; component.failures += 1;
      component.lastError = String(error?.message || error).slice(0, 300);
      throw error;
    } finally {
      component.lastDurationMs = Math.round(performance.now() - started);
      component.lastRunAt = new Date().toISOString();
    }
  };
  const snapshot = () => ({
    architecture: 'capability_secured_specialists_v4',
    healthy: [...components.values()].every(item => item.state !== 'degraded'),
    components: [...components.values()].map(item => ({ ...item })),
  });
  return Object.freeze({ run, snapshot });
}

const CONSOLE_ID = 'agape-welltrans-operator-console';
const COMMAND_BINDING = '__agapeWellTransCommand';
const POSITION_KEY = 'agape-welltrans-toolbar-position-v2';

const consoleBootstrap = ({ consoleId, commandBinding, positionKey }) => {
  if (window.top !== window || document.getElementById(consoleId)) return;

  const host = document.createElement('div');
  host.id = consoleId;
  host.style.cssText = [
    'position:fixed',
    'top:8px',
    'left:50%',
    'transform:translateX(-50%)',
    'z-index:2147483647',
    'width:min(1780px, calc(100vw - 16px))',
    'max-width:calc(100vw - 16px)',
    'box-sizing:border-box',
    'font-family:Inter,Segoe UI,Arial,sans-serif',
  ].join(';');
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      *{box-sizing:border-box}
      .bar{display:flex;align-items:center;gap:6px;width:100%;height:42px;max-width:100%;
        padding:5px 7px;color:#eaf1ff;background:rgba(7,15,30,.97);border:1px solid #30476e;
        border-radius:12px;box-shadow:0 10px 32px rgba(0,0,0,.38);white-space:nowrap;overflow-x:auto;
        overflow-y:hidden;scrollbar-width:thin;backdrop-filter:blur(12px)}
      button,input,select{height:30px;flex:0 0 auto;border-radius:8px;font:700 10px Inter,Segoe UI,Arial,sans-serif}
      button{border:1px solid #31496f;padding:0 9px;color:#eaf1ff;background:#172944;cursor:pointer}
      button:hover{background:#213b61;border-color:#4b6f9f}
      button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #60a5fa;outline-offset:1px}
      button:disabled{cursor:wait;opacity:.5}
      .drag{width:27px;padding:0;cursor:grab;color:#91a4c8;font-size:15px;touch-action:none;user-select:none}
      .drag:active{cursor:grabbing}
      .brand{display:flex;align-items:center;gap:5px;font-size:10px;font-weight:900;letter-spacing:.06em}
      .mark{display:grid;place-items:center;width:22px;height:22px;border-radius:7px;background:#2563eb;color:white}
      .version{color:#7f94b8;font-size:8px;font-weight:800}
      .state{width:125px;flex:0 0 125px;overflow:hidden;text-overflow:ellipsis;padding:4px 7px;border-radius:999px;
        background:#123c2c;color:#6ee7b7;font-size:9px;font-weight:900}
      input{width:118px;border:1px solid #38517e;background:#0d1930;color:#fff;padding:0 7px;color-scheme:dark}
      select{width:164px;max-width:210px;border:1px solid #38517e;background:#0d1930;color:#fff;padding:0 7px}
      select:disabled{cursor:not-allowed;opacity:.55}
      .primary{background:#2563eb;border-color:#3b82f6;color:#fff}
      .primary:hover{background:#1d4ed8}
      .verify{background:#14532d;border-color:#23834a}
      .restart{background:#5b2230;border-color:#8f3d52}
      .restart[hidden],.verifier[hidden]{display:none}
      .metric{display:flex;align-items:baseline;gap:3px;padding:3px 6px;border-radius:7px;background:#101f37;
        color:#91a4c8;font-size:8px;text-transform:uppercase}
      .metric b{color:#fff;font-size:11px}
      .verifier[data-state="verified"]{background:#123c2c;color:#6ee7b7}
      .verifier[data-state="running"],.verifier[data-state="repairing"]{background:#3b2f0c;color:#fde68a}
      .verifier[data-state="blocked"]{background:#4c1d1d;color:#fecaca}
      .message{min-width:130px;flex:1 1 280px;overflow:hidden;text-overflow:ellipsis;color:#a9b8d2;
        font-size:9px;font-weight:600}
      .manual{padding:4px 7px;border-radius:7px;background:#3a1c1c;border:1px solid #713232;
        color:#fecaca;font-size:8px;font-weight:900}
      @media(max-width:900px){.message{min-width:140px;flex-basis:140px}.brandText{display:none}}
    </style>
    <section class="bar" role="toolbar" aria-label="Agape WellTrans controls">
      <button class="drag" data-role="drag" title="Drag toolbar" aria-label="Drag toolbar">&#8942;&#8942;</button>
      <span class="brand"><span class="mark">A</span><span class="brandText">WELLTRANS</span><span class="version" data-role="version"></span></span>
      <span class="state" data-role="state">CONNECTING</span>
      <input data-role="date" type="date" aria-label="Go to WellTrans service date" title="Choose a date; the Agent will navigate WellTrans and verify the exact schedule automatically">
      <select data-role="driver" aria-label="Driver scope" title="Fill all drivers or one authoritative driver">
        <option value="all">All drivers</option>
      </select>
      <button class="primary" data-action="fill-date" title="Reconcile and fill the selected date; the Agent verifies the opened WellTrans date before writing">Fill Date</button>
      <button class="verify" data-action="verify" title="Read every staged field back without clicking Apply">Review &amp; Verify</button>
      <button data-action="pause">Pause</button>
      <button class="restart" data-action="restart" title="Discard an unsafe unsaved session and start clean" hidden>Reset Session</button>
      <span class="metric"><b data-role="staged">0</b> filled</span>
      <span class="metric"><b data-role="pending">0</b> pending</span>
      <span class="metric"><b data-role="failed">0</b> blocked</span>
      <span class="metric verifier" data-role="verifier" data-state="idle" hidden><b data-role="verified">0/0</b> verified</span>
      <span class="message" data-role="message" title="Waiting for the itinerary workspace">Waiting for the itinerary workspace</span>
      <span class="manual" title="The Agent never clicks Apply or Close">HUMAN APPLY ONLY</span>
    </section>`;
  document.documentElement.appendChild(host);
  const hostGuard = new MutationObserver(() => {
    if (!host.isConnected && document.documentElement) document.documentElement.appendChild(host);
  });
  hostGuard.observe(document.documentElement, { childList: true });

  const $ = selector => shadow.querySelector(selector);
  const state = {
    busy: false, paused: false, commandSequence: 0, selectedDate: '', requestedDate: '',
    selectedDriverId: 'all', scopeLocked: false, dateSwitchPending: false,
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  try {
    const stored = JSON.parse(localStorage.getItem(positionKey) || 'null');
    if (Number.isFinite(stored?.top)) {
      host.style.top = `${clamp(stored.top, 0, Math.max(0, innerHeight - 42))}px`;
    }
  } catch {}

  const drag = $('[data-role="drag"]');
  drag.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const rect = host.getBoundingClientRect();
    const start = { x: event.clientX, y: event.clientY, top: rect.top };
    let dragging = false;
    drag.setPointerCapture(event.pointerId);
    const move = moveEvent => {
      const deltaX = moveEvent.clientX - start.x;
      const deltaY = moveEvent.clientY - start.y;
      if (!dragging && Math.hypot(deltaX, deltaY) < 8) return;
      if (!dragging) {
        dragging = true;
        host.style.top = `${rect.top}px`;
      }
      const top = clamp(start.top + moveEvent.clientY - start.y, 0, Math.max(0, innerHeight - 42));
      host.style.top = `${top}px`;
    };
    const end = endEvent => {
      drag.releasePointerCapture(endEvent.pointerId);
      drag.removeEventListener('pointermove', move);
      drag.removeEventListener('pointerup', end);
      drag.removeEventListener('pointercancel', end);
      if (dragging) {
        const finalRect = host.getBoundingClientRect();
        try {
          localStorage.setItem(positionKey, JSON.stringify({ top: finalRect.top }));
        } catch {}
      }
    };
    drag.addEventListener('pointermove', move);
    drag.addEventListener('pointerup', end);
    drag.addEventListener('pointercancel', end);
  });

  const setBusy = (busy, message = '') => {
    state.busy = busy;
    shadow.querySelectorAll('button[data-action]').forEach(button => { button.disabled = busy; });
    const driver = $('[data-role="driver"]');
    if (driver) driver.disabled = busy || state.scopeLocked;
    const date = $('[data-role="date"]');
    if (date) date.disabled = busy || state.scopeLocked;
    const fill = $('[data-action="fill-date"]');
    if (fill) fill.disabled = busy || state.dateSwitchPending;
    if (message) {
      $('[data-role="message"]').textContent = message;
      $('[data-role="message"]').title = message;
    }
  };

  const send = async (action, payload = {}) => {
    if (state.busy) return;
    const commandNumber = ++state.commandSequence;
    setBusy(true, `Command ${commandNumber}: sending ${action.replaceAll('-', ' ')}...`);
    try {
      if (typeof window[commandBinding] !== 'function') {
        throw new Error('Agent command channel is unavailable. Start a new safe session.');
      }
      const result = await Promise.race([
        window[commandBinding](action, payload),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Agent command acknowledgement timed out.')), 5000)),
      ]);
      if (!result?.accepted) throw new Error(result?.message || 'Agent did not accept the command.');
      const message = `Command ${commandNumber} accepted: ${result.message || action}`;
      $('[data-role="message"]').textContent = message;
      $('[data-role="message"]').title = message;
    } catch (error) {
      const message = `Command failed: ${error?.message || error}`;
      $('[data-role="message"]').textContent = message;
      $('[data-role="message"]').title = message;
    } finally {
      setBusy(false);
    }
  };

  shadow.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'fill-date') {
      const requestedDate = $('[data-role="date"]').value;
      if (requestedDate && requestedDate !== state.selectedDate && requestedDate !== state.requestedDate) {
        state.requestedDate = requestedDate;
        state.dateSwitchPending = true;
        send('switch-date', { serviceDate: requestedDate });
      } else if (!state.dateSwitchPending) {
        send('reconcile');
      }
      return;
    }
    send(action);
  });

  $('[data-role="date"]').addEventListener('change', event => {
    const serviceDate = String(event.target.value || '');
    if (!serviceDate || serviceDate === state.selectedDate || serviceDate === state.requestedDate) return;
    state.requestedDate = serviceDate;
    state.dateSwitchPending = true;
    const fill = $('[data-action="fill-date"]');
    if (fill) {
      fill.disabled = true;
      fill.textContent = 'Switching Date…';
    }
    send('switch-date', { serviceDate });
  });

  $('[data-role="driver"]').addEventListener('change', event => {
    const driverId = String(event.target.value || 'all');
    const option = event.target.selectedOptions[0];
    send('switch-driver', {
      type: driverId === 'all' ? 'all' : 'driver',
      driverId: driverId === 'all' ? '' : driverId,
      driverName: driverId === 'all' ? '' : String(option?.dataset.driverName || option?.textContent || '').trim(),
    });
  });

  window.__agapeWellTransPanel = {
    update(next = {}) {
      const set = (role, value) => {
        const element = $(`[data-role="${role}"]`);
        if (element && value !== undefined && value !== null) element.textContent = String(value);
      };
      if (next.selectedDate !== undefined) state.selectedDate = String(next.selectedDate || '');
      if (next.requestedDate !== undefined) state.requestedDate = String(next.requestedDate || '');
      const desiredDate = state.requestedDate || state.selectedDate;
      if (desiredDate) {
        $('[data-role="date"]').value = desiredDate;
      }
      state.dateSwitchPending = Boolean(
        state.requestedDate && state.selectedDate && state.requestedDate !== state.selectedDate,
      );
      const driver = $('[data-role="driver"]');
      if (driver && Array.isArray(next.driverOptions)) {
        const options = [{ id: 'all', name: `All drivers (${next.allDriverTripCount ?? next.expected ?? 0})` }, ...next.driverOptions];
        const signature = JSON.stringify(options);
        if (driver.dataset.options !== signature) {
          driver.replaceChildren(...options.map(item => {
            const option = document.createElement('option');
            option.value = String(item.id);
            option.textContent = item.id === 'all' ? item.name : `${item.name} (${item.tripCount ?? 0})${item.state === 'done' ? ' · DONE' : ''}`;
            option.dataset.driverName = item.name;
            return option;
          }));
          driver.dataset.options = signature;
        }
      }
      state.selectedDriverId = next.scopeType === 'driver' && next.scopeDriverId ? String(next.scopeDriverId) : 'all';
      if (driver) {
        driver.value = state.selectedDriverId;
        if (!driver.value) driver.value = 'all';
      }
      state.scopeLocked = Boolean(next.scopeLocked);
      if (driver) {
        driver.disabled = state.busy || state.scopeLocked;
        driver.title = state.scopeLocked
          ? 'Finish reviewing or close the current staged batch before changing drivers.'
          : 'Fill all drivers or one authoritative driver';
      }
      const date = $('[data-role="date"]');
      if (date) {
        date.disabled = state.busy || state.scopeLocked;
        date.title = state.scopeLocked
          ? 'Finish reviewing or close the current staged batch before changing dates.'
          : 'Service date';
      }
      const fill = $('[data-action="fill-date"]');
      if (fill) {
        fill.disabled = state.busy || state.dateSwitchPending;
        fill.textContent = state.dateSwitchPending ? 'Switching Date…' : 'Fill Date';
      }
      set('version', next.version ? `v${next.version}` : '');
      set('state', String(next.state || 'online').replaceAll('_', ' ').toUpperCase());
      set('staged', next.staged ?? 0);
      set('pending', next.pending ?? 0);
      set('failed', (next.failed ?? 0) + (next.blocked ?? 0) + (next.missing ?? 0));
      const verifierState = String(next.verifierState || 'idle').toLowerCase();
      const verifier = $('[data-role="verifier"]');
      if (verifier) {
        verifier.dataset.state = verifierState;
        verifier.hidden = verifierState === 'idle' && Number(next.verifierChecked || 0) === 0;
      }
      set('verified', `${next.verifierVerified ?? 0}/${next.verifierChecked ?? 0}`);
      const message = next.message || '';
      set('message', message);
      $('[data-role="message"]').title = message;
      state.paused = next.autoRun === false;
      const pause = $('[data-action="pause"]');
      if (pause) pause.textContent = state.paused ? 'Resume' : 'Pause';
      const restart = $('[data-action="restart"]');
      if (restart) restart.hidden = !/(error|blocked|unsafe|failed)/i.test(String(next.state || ''));
    },
  };
};

export async function installWellTransOperatorConsole(page, onCommand) {
  if (!page || page.isClosed()) return;
  const context = page.context();
  if (!context.__agapeOperatorBindingInstalled) {
    await context.exposeBinding(COMMAND_BINDING, async (_source, action, payload) =>
      onCommand(String(action || ''), payload || {}));
    context.__agapeOperatorBindingInstalled = true;
  }
  const options = {
    consoleId: CONSOLE_ID,
    commandBinding: COMMAND_BINDING,
    positionKey: POSITION_KEY,
  };
  if (!context.__agapeOperatorInitInstalled) {
    await context.addInitScript(consoleBootstrap, options);
    context.__agapeOperatorInitInstalled = true;
  }
  const attach = async (candidatePage) => {
    if (!candidatePage || candidatePage.isClosed() || candidatePage.__agapeOperatorConsoleAttached) return;
    candidatePage.__agapeOperatorConsoleAttached = true;
    const inject = () => candidatePage.evaluate(consoleBootstrap, options).catch(() => {});
    candidatePage.on('domcontentloaded', inject);
    candidatePage.on('load', inject);
    candidatePage.__agapeOperatorWatchdog = setInterval(inject, 1000);
    candidatePage.on('close', () => clearInterval(candidatePage.__agapeOperatorWatchdog));
    await inject();
  };
  if (!context.__agapeOperatorPageListenerInstalled) {
    context.on('page', candidatePage => attach(candidatePage).catch(() => {}));
    context.__agapeOperatorPageListenerInstalled = true;
  }
  await Promise.all(context.pages().map(attach));
}

export async function updateWellTransOperatorConsole(page, state) {
  if (!page || page.isClosed()) return;
  await page.evaluate(next => window.__agapeWellTransPanel?.update(next), state).catch(() => {});
}

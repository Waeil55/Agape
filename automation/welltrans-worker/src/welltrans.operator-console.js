const CONSOLE_ID = 'agape-welltrans-operator-console';
const COMMAND_BINDING = '__agapeWellTransCommand';
const POSITION_KEY = 'agape-welltrans-toolbar-position-v3';
const BOTTOM_ACTION_CLEARANCE = 96;

const consoleBootstrap = ({ consoleId, commandBinding, positionKey, bottomActionClearance }) => {
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
    'pointer-events:none',
  ].join(';');
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      *{box-sizing:border-box}
      .bar{display:flex;align-items:center;gap:6px;width:100%;height:42px;max-width:100%;pointer-events:none;
        padding:5px 7px;color:#0f172a;background:rgba(255,255,255,.98);border:1px solid #cbd5e1;
        border-radius:12px;box-shadow:0 10px 28px rgba(15,23,42,.2);white-space:nowrap;overflow-x:auto;
        overflow-y:hidden;scrollbar-width:thin;backdrop-filter:blur(12px)}
      button,input,select{height:30px;flex:0 0 auto;border-radius:8px;font:700 10px Inter,Segoe UI,Arial,sans-serif;pointer-events:auto}
      button{border:1px solid #cbd5e1;padding:0 9px;color:#334155;background:#fff;cursor:pointer}
      button:hover{background:#f1f5f9;border-color:#94a3b8}
      button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #60a5fa;outline-offset:1px}
      button:disabled{cursor:wait;opacity:.5}
      .drag{width:27px;padding:0;cursor:grab;color:#64748b;font-size:15px;touch-action:none;user-select:none}
      .collapse{width:30px;padding:0;font-size:15px}
      .drag:active{cursor:grabbing}
      .brand{display:flex;align-items:center;gap:5px;font-size:10px;font-weight:900;letter-spacing:.06em}
      .mark{display:grid;place-items:center;width:22px;height:22px;border-radius:7px;background:#2563eb;color:white}
      .version{color:#64748b;font-size:8px;font-weight:800}
      .state{width:125px;flex:0 0 125px;overflow:hidden;text-overflow:ellipsis;padding:4px 7px;border-radius:999px;
        background:#d1fae5;color:#047857;font-size:9px;font-weight:900}
      input{width:118px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;padding:0 7px;color-scheme:light}
      select{width:164px;max-width:210px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;padding:0 7px}
      select:disabled{cursor:not-allowed;opacity:.55}
      .primary{background:#2563eb;border-color:#3b82f6;color:#fff}
      .primary:hover{background:#1d4ed8}
      .verify{background:#047857;border-color:#059669;color:#fff}
      .restart{background:#fff1f2;border-color:#fda4af;color:#be123c}
      .restart[hidden]{display:none}
      .metric{display:flex;align-items:baseline;gap:3px;padding:3px 6px;border-radius:7px;background:#f1f5f9;
        color:#64748b;font-size:8px;text-transform:uppercase}
      .metric b{color:#0f172a;font-size:11px}
      .verifier[data-state="verified"]{background:#d1fae5;color:#047857}
      .verifier[data-state="running"],.verifier[data-state="repairing"]{background:#fef3c7;color:#92400e}
      .verifier[data-state="blocked"]{background:#ffe4e6;color:#be123c}
      .message{min-width:130px;flex:1 1 280px;overflow:hidden;text-overflow:ellipsis;color:#475569;
        font-size:9px;font-weight:600}
      .manual{padding:4px 7px;border-radius:7px;background:#fff1f2;border:1px solid #fda4af;
        color:#be123c;font-size:8px;font-weight:900}
      :host([data-collapsed="true"]){width:auto!important;max-width:calc(100vw - 16px)!important}
      :host([data-collapsed="true"]) .bar{overflow:hidden}
      :host([data-collapsed="true"]) .optional{display:none}
      @media(max-width:900px){.message{min-width:140px;flex-basis:140px}.brandText{display:none}}
    </style>
    <section class="bar" role="toolbar" aria-label="Agape WellTrans controls">
      <button class="drag" data-role="drag" title="Drag toolbar" aria-label="Drag toolbar">&#8942;&#8942;</button>
      <button class="collapse" data-role="collapse" title="Minimize toolbar" aria-label="Minimize toolbar">&#8722;</button>
      <span class="brand"><span class="mark">A</span><span class="brandText">WELLTRANS</span><span class="version" data-role="version"></span></span>
      <span class="state" data-role="state">CONNECTING</span>
      <input class="optional" data-role="date" type="date" aria-label="Go to WellTrans service date" title="Choose a date; the Agent will navigate WellTrans and verify the exact schedule automatically">
      <select class="optional" data-role="driver" aria-label="Driver scope" title="Fill all drivers or one authoritative driver">
        <option value="all">All drivers</option>
      </select>
      <button class="primary optional" data-action="fill-date" title="Reconcile and fill the selected date; the Agent verifies the opened WellTrans date before writing">Fill Date</button>
      <button class="optional" data-action="detect-date" title="Cancel a pending date switch and use the date currently open in WellTrans">Use Open Date</button>
      <button class="verify optional" data-action="verify" title="Independently read every staged field back without clicking Apply" disabled>Verify Review</button>
      <button class="optional" data-action="pause">Pause</button>
      <button class="restart optional" data-action="restart" title="Discard an unsafe unsaved session and start clean" hidden>Reset Session</button>
      <span class="metric"><b data-role="staged">0</b> filled</span>
      <span class="metric"><b data-role="pending">0</b> pending</span>
      <span class="metric"><b data-role="failed">0</b> blocked</span>
      <span class="metric verifier" data-role="verifier" data-state="idle" title="Independent deterministic reviewer integrated into this installed Agent"><b data-role="verified">0/0</b> reviewed</span>
      <span class="message optional" data-role="message" title="Waiting for the itinerary workspace">Waiting for the itinerary workspace</span>
      <span class="manual optional" title="The Agent never clicks Apply or Close">HUMAN APPLY ONLY</span>
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
    canVerifyReview: false,
    // Tracks whether the user currently has the date input focused.
    // When true, heartbeat updates must NOT overwrite the input value — that
    // would silently discard a date the user is typing or selecting.
    dateUserEditing: false,
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  try {
    const stored = JSON.parse(localStorage.getItem(positionKey) || 'null');
    if (Number.isFinite(stored?.top)) {
      host.style.top = `${clamp(stored.top, 0, Math.max(0, innerHeight - bottomActionClearance - 42))}px`;
    }
  } catch {}

  const drag = $('[data-role="drag"]');
  const collapse = $('[data-role="collapse"]');
  collapse.addEventListener('click', () => {
    const collapsed = host.dataset.collapsed !== 'true';
    host.dataset.collapsed = String(collapsed);
    collapse.innerHTML = collapsed ? '&#43;' : '&#8722;';
    collapse.title = collapsed ? 'Expand toolbar' : 'Minimize toolbar';
    collapse.setAttribute('aria-label', collapse.title);
  });
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
      const top = clamp(start.top + moveEvent.clientY - start.y, 0, Math.max(0, innerHeight - bottomActionClearance - 42));
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
    if (date) date.disabled = busy;
    const fill = $('[data-action="fill-date"]');
    if (fill) {
      fill.disabled = busy;
      if (!busy && state.dateSwitchPending) fill.textContent = 'Retry Date';
    }
    const verify = $('[data-action="verify"]');
    if (verify) verify.disabled = busy || !state.canVerifyReview;
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
      if (requestedDate && requestedDate !== state.selectedDate) {
        state.requestedDate = requestedDate;
        state.dateSwitchPending = true;
        send('switch-date', { serviceDate: requestedDate });
      } else {
        send('reconcile');
      }
      return;
    }
    send(action);
  });

  const dateInput = $('[data-role="date"]');

  // Mark the field as user-controlled while it is focused so that heartbeat
  // ticks (which call update()) do not clobber what the user is typing.
  dateInput.addEventListener('focus', () => { state.dateUserEditing = true; });

  dateInput.addEventListener('blur', () => {
    state.dateUserEditing = false;
    // Fire switch-date on blur so the user does not have to click Fill Date.
    const serviceDate = String(dateInput.value || '');
    if (serviceDate && /^\d{4}-\d{2}-\d{2}$/.test(serviceDate) && serviceDate !== state.requestedDate) {
      state.requestedDate = serviceDate;
      state.dateSwitchPending = true;
      send('switch-date', { serviceDate });
    }
  });

  // Also handle the native 'change' event (fired when the user picks from the
  // calendar picker or presses Enter/Tab while the field is focused).
  dateInput.addEventListener('change', event => {
    const serviceDate = String(event.target.value || '');
    if (!serviceDate || serviceDate === state.requestedDate) return;
    state.requestedDate = serviceDate;
    state.dateSwitchPending = true;
    const fill = $('[data-action="fill-date"]');
    if (fill) {
      fill.disabled = true;
      fill.textContent = 'Switching Date...';
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
      // Only sync the date field from the server if the user is not actively
      // editing it. Overwriting a focused input would silently discard any
      // date they are typing or selecting from the calendar picker.
      if (desiredDate && !state.dateUserEditing) {
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
            option.textContent = item.id === 'all' ? item.name : `${item.name} (${item.tripCount ?? 0})${item.state === 'done' ? ' - DONE' : ''}`;
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
        date.disabled = state.busy;
        date.title = state.scopeLocked
          ? 'Choose the next date now. It will switch automatically after you manually Apply or Close the current review batch.'
          : 'Service date';
      }
      const fill = $('[data-action="fill-date"]');
      if (fill) {
        fill.disabled = state.busy;
        fill.textContent = state.dateSwitchPending ? 'Retry Date' : 'Fill Date';
      }
      set('version', next.version ? `v${next.version}` : '');
      set('state', String(next.state || 'online').replaceAll('_', ' ').toUpperCase());
      set('staged', next.staged ?? 0);
      set('pending', next.pending ?? 0);
      const failed = Number(next.failed || 0);
      const blocked = Number(next.blocked || 0);
      const missing = Number(next.missing || 0);
      // Manifest blockers normally describe the same failed log records. Use
      // the larger set instead of reporting every failure twice.
      const blockedTotal = Math.max(failed, blocked) + missing;
      const expected = Number(next.expected || 0);
      const reviewed = Number(next.reviewed ?? ((next.staged || 0) + (next.completed || 0)));
      set('failed', blockedTotal);
      const coverageComplete = expected > 0 && reviewed === expected && blockedTotal === 0
        && Number(next.pending || 0) === 0;
      state.canVerifyReview = Number(next.staged || 0) > 0
        && blockedTotal === 0
        && Number(next.processing || 0) === 0
        && Number(next.staged || 0) + Number(next.completed || 0) + Number(next.pending || 0) === expected;
      const verify = $('[data-action="verify"]');
      if (verify) {
        verify.disabled = state.busy || !state.canVerifyReview;
        verify.title = state.canVerifyReview
          ? 'Independently read every staged field back without clicking Apply'
          : 'Verification is available only when a clean staged review batch is open';
      }
      const verifierState = blockedTotal > 0
        ? 'blocked'
        : String(coverageComplete ? (next.verifierState || 'verified') : (next.verifierState || 'idle')).toLowerCase();
      const verifier = $('[data-role="verifier"]');
      if (verifier) {
        verifier.dataset.state = verifierState;
        verifier.hidden = false;
      }
      set('verified', `${reviewed}/${expected}`);
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
    bottomActionClearance: BOTTOM_ACTION_CLEARANCE,
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

const CONSOLE_ID = 'agape-welltrans-operator-console';
const COMMAND_BINDING = '__agapeWellTransCommand';

const consoleBootstrap = ({ consoleId, commandBinding }) => {
  if (window.top !== window || document.getElementById(consoleId)) return;

  const host = document.createElement('div');
  host.id = consoleId;
  host.style.cssText = [
    'position:fixed',
    'bottom:12px',
    'right:12px',
    'z-index:2147483647',
    'width:286px',
    'font-family:Inter,Segoe UI,Arial,sans-serif',
  ].join(';');
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      *{box-sizing:border-box}
      .panel{color:#e8eefc;background:rgba(8,15,31,.97);border:1px solid #2b3f66;
        border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.38);overflow:hidden}
      .head{padding:9px 10px;background:linear-gradient(135deg,#12264b,#0a1429)}
      .brand{display:flex;align-items:center;justify-content:space-between;gap:10px}
      .title{font-size:11px;font-weight:800;letter-spacing:.03em;text-transform:uppercase}
      .badge{padding:3px 6px;border-radius:999px;background:#123c2c;color:#6ee7b7;font-size:9px;font-weight:800}
      .sub{margin-top:4px;color:#91a4c8;font-size:9px;line-height:1.3}
      .body{padding:9px 10px 10px}
      .dateRow{display:grid;grid-template-columns:1fr auto;gap:7px;margin-bottom:8px}
      input{width:100%;height:34px;border:1px solid #38517e;border-radius:8px;background:#0d1930;
        color:#fff;padding:0 9px;font:600 12px inherit}
      button{border:0;border-radius:8px;min-height:34px;padding:7px 10px;font:700 11px inherit;
        cursor:pointer;color:#eaf1ff;background:#20385f}
      button:hover{filter:brightness(1.16)}
      button:disabled{cursor:wait;opacity:.55}
      .primary{width:100%;min-height:42px;background:linear-gradient(135deg,#2563eb,#3b82f6);
        font-size:12px;letter-spacing:.02em}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:7px}
      .status{margin-top:10px;padding:9px;border-radius:9px;background:#0d1930;border:1px solid #263d64}
      .statusTop{display:flex;justify-content:space-between;gap:8px;font-size:11px;font-weight:800}
      .message{margin-top:4px;color:#a9b8d2;font-size:10px;line-height:1.35;max-height:42px;overflow:auto}
      .metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-top:9px}
      .metric{padding:7px 4px;text-align:center;border-radius:8px;background:#111f39}
      .metric b{display:block;font-size:13px}.metric span{font-size:8px;color:#91a4c8;text-transform:uppercase}
      .human{margin-top:9px;padding:7px 9px;border-radius:8px;background:#3a1c1c;color:#fecaca;
        border:1px solid #713232;font-size:9px;font-weight:800;line-height:1.35}
      .progress{height:4px;margin-top:8px;background:#172743;border-radius:99px;overflow:hidden}
      .bar{height:100%;width:0;background:linear-gradient(90deg,#22c55e,#60a5fa);transition:width .2s}
      .collapsed{width:210px}
      .collapsed .body,.collapsed .sub,.collapsed .badge{display:none}
      .collapse{min-height:25px;padding:2px 7px;background:#1b2b49}
    </style>
    <section class="panel collapsed">
      <header class="head">
        <div class="brand">
          <div class="title">Agape WellTrans Console</div>
          <div>
            <span class="badge" data-role="mode">AUTO</span>
            <button class="collapse" data-action="collapse" title="Open controls">+</button>
          </div>
        </div>
        <div class="sub">Exact Booking ID • selected-date fencing • field-by-field verification</div>
      </header>
      <div class="body">
        <div class="dateRow">
          <input data-role="date" type="date" aria-label="WellTrans service date">
          <button data-action="switch-date">Switch & Fill</button>
        </div>
        <button class="primary" data-action="reconcile">Reconcile & Fill Opened Date</button>
        <div class="grid">
          <button data-action="verify">Verify Every Field</button>
          <button data-action="reindex">Refresh Grid Index</button>
          <button data-action="detect-date">Use Opened Date</button>
          <button data-action="pause">Pause Auto</button>
        </div>
        <div class="status">
          <div class="statusTop">
            <span data-role="dateLabel">Detecting date…</span>
            <span data-role="state">CONNECTING</span>
          </div>
          <div class="message" data-role="message">Waiting for the itinerary workspace.</div>
          <div class="progress"><div class="bar" data-role="bar"></div></div>
          <div class="metrics">
            <div class="metric"><b data-role="expected">0</b><span>Expected</span></div>
            <div class="metric"><b data-role="staged">0</b><span>Filled</span></div>
            <div class="metric"><b data-role="pending">0</b><span>Pending</span></div>
            <div class="metric"><b data-role="failed">0</b><span>Blocked</span></div>
          </div>
        </div>
        <div class="human">HUMAN APPLY ONLY — this Agent never clicks Apply or Close. Review the green verified state, then apply yourself.</div>
      </div>
    </section>`;
  document.documentElement.appendChild(host);

  const $ = selector => shadow.querySelector(selector);
  const panel = $('.panel');
  const state = { busy: false, paused: false };

  const setBusy = (busy, message = '') => {
    state.busy = busy;
    shadow.querySelectorAll('button[data-action]:not([data-action="collapse"])')
      .forEach(button => { button.disabled = busy; });
    if (message) $('[data-role="message"]').textContent = message;
  };

  const send = async (action, payload = {}) => {
    if (state.busy) return;
    setBusy(true, `Requested: ${action.replaceAll('-', ' ')}…`);
    try {
      const result = await window[commandBinding](action, payload);
      if (result?.message) $('[data-role="message"]').textContent = result.message;
    } catch (error) {
      $('[data-role="message"]').textContent = `Command failed: ${error?.message || error}`;
    } finally {
      setBusy(false);
    }
  };

  shadow.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'collapse') {
      panel.classList.toggle('collapsed');
      button.textContent = panel.classList.contains('collapsed') ? '+' : '−';
      return;
    }
    if (action === 'switch-date') {
      send(action, { serviceDate: $('[data-role="date"]').value });
      return;
    }
    send(action);
  });

  window.__agapeWellTransPanel = {
    update(next = {}) {
      const set = (role, value) => {
        const element = $(`[data-role="${role}"]`);
        if (element && value !== undefined && value !== null) element.textContent = String(value);
      };
      if (next.selectedDate) {
        $('[data-role="date"]').value = next.selectedDate;
        set('dateLabel', next.selectedDate);
      }
      set('state', String(next.state || 'online').replaceAll('_', ' ').toUpperCase());
      set('message', next.message || '');
      set('expected', next.expected ?? 0);
      set('staged', next.staged ?? 0);
      set('pending', next.pending ?? 0);
      set('failed', (next.failed ?? 0) + (next.blocked ?? 0) + (next.missing ?? 0));
      state.paused = next.autoRun === false;
      const pause = shadow.querySelector('[data-action="pause"]');
      if (pause) pause.textContent = state.paused ? 'Resume Auto' : 'Pause Auto';
      set('mode', state.paused ? 'PAUSED' : 'AUTO');
      const total = Math.max(0, Number(next.expected) || 0);
      const done = Math.max(0, (Number(next.staged) || 0) + (Number(next.completed) || 0));
      $('[data-role="bar"]').style.width = `${total ? Math.min(100, (done / total) * 100) : 0}%`;
    },
  };
};

export async function installWellTransOperatorConsole(page, onCommand) {
  if (!page || page.isClosed()) return;
  if (!page.__agapeOperatorBindingInstalled) {
    await page.exposeBinding(COMMAND_BINDING, async (_source, action, payload) =>
      onCommand(String(action || ''), payload || {}));
    page.__agapeOperatorBindingInstalled = true;
  }
  await page.addInitScript(consoleBootstrap, {
    consoleId: CONSOLE_ID,
    commandBinding: COMMAND_BINDING,
  });
  const inject = () => page.evaluate(consoleBootstrap, {
    consoleId: CONSOLE_ID,
    commandBinding: COMMAND_BINDING,
  }).catch(() => {});
  page.on('domcontentloaded', inject);
  await inject();
}

export async function updateWellTransOperatorConsole(page, state) {
  if (!page || page.isClosed()) return;
  await page.evaluate(next => window.__agapeWellTransPanel?.update(next), state).catch(() => {});
}

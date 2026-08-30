const INTERACTIVE_SELECTOR = 'input, textarea, select, button, a, [contenteditable="true"], [role="button"], [role="link"]';

const navigableRows = (body) => Array.from(body?.children || []).filter((row) => (
  row.tagName === 'TR'
  && !row.hidden
  && row.getAttribute('aria-hidden') !== 'true'
));

const prepareTable = (table) => {
  table.querySelectorAll(':scope > tbody').forEach((body) => {
    const rows = navigableRows(body);
    const existingActive = rows.find((row) => row.tabIndex === 0);
    rows.forEach((row) => {
      row.dataset.agapeKeyboardRow = 'true';
      row.tabIndex = row === existingActive ? 0 : -1;
    });
    if (!existingActive && rows[0]) rows[0].tabIndex = 0;
  });
};

export const installTableKeyboardNavigation = (rootDocument = document) => {
  let activeRow = null;

  const prepareNode = (node) => {
    if (!(node instanceof rootDocument.defaultView.Element)) return;
    const ownerTable = node.closest('table');
    if (ownerTable) prepareTable(ownerTable);
    if (node.matches('table')) prepareTable(node);
    node.querySelectorAll('table').forEach(prepareTable);
  };

  const activateRow = (row, { focus = false } = {}) => {
    if (!row?.isConnected) return;
    const body = row.closest('tbody');
    const rows = navigableRows(body);
    activeRow?.removeAttribute('data-agape-selected');
    rows.forEach((candidate) => { candidate.tabIndex = candidate === row ? 0 : -1; });
    row.setAttribute('data-agape-selected', 'true');
    activeRow = row;
    if (focus) {
      row.focus({ preventScroll: true });
      row.scrollIntoView?.({ block: 'nearest' });
    }
  };

  const handleClick = (event) => {
    const row = event.target.closest?.('table tbody tr');
    if (row) {
      activateRow(row, { focus: !event.target.closest(INTERACTIVE_SELECTOR) });
      return;
    }
    if (!event.target.closest?.('table')) {
      activeRow?.removeAttribute('data-agape-selected');
      activeRow = null;
    }
  };

  const handleFocus = (event) => {
    const row = event.target.closest?.('table tbody tr');
    if (row) activateRow(row);
  };

  const handleKeyDown = (event) => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    if (event.target.closest?.(INTERACTIVE_SELECTOR)) return;
    const current = event.target.closest?.('table tbody tr') || (activeRow?.isConnected ? activeRow : null);
    if (!current) return;
    const rows = navigableRows(current.closest('tbody'));
    const currentIndex = rows.indexOf(current);
    if (currentIndex < 0) return;
    let nextIndex = currentIndex;
    if (event.key === 'ArrowUp') nextIndex = Math.max(0, currentIndex - 1);
    if (event.key === 'ArrowDown') nextIndex = Math.min(rows.length - 1, currentIndex + 1);
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = rows.length - 1;
    if (nextIndex === currentIndex) return;
    event.preventDefault();
    activateRow(rows[nextIndex], { focus: true });
  };

  rootDocument.querySelectorAll('table').forEach(prepareTable);
  rootDocument.addEventListener('click', handleClick, true);
  rootDocument.addEventListener('focusin', handleFocus, true);
  rootDocument.addEventListener('keydown', handleKeyDown);
  const observer = new rootDocument.defaultView.MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      prepareNode(mutation.target);
      mutation.addedNodes.forEach(prepareNode);
    });
  });
  observer.observe(rootDocument.body, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    rootDocument.removeEventListener('click', handleClick, true);
    rootDocument.removeEventListener('focusin', handleFocus, true);
    rootDocument.removeEventListener('keydown', handleKeyDown);
  };
};

/* @vitest-environment jsdom */
import React, { act } from 'react';
import ReactDOM from 'react-dom/client';
import { flushSync } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const chatSource = readFileSync('src/components/chat/ChatPage.jsx', 'utf8');
const toolsSource = readFileSync('src/components/DriverToolsPage.jsx', 'utf8');

const chatState = {
  currentUser: { id: 'driver-a', name: 'Driver A' },
  channels: [{ id: 'channel-a', participants: ['driver-a', 'dispatcher'], participantDetails: {} }],
  draftChannel: null,
  activeChannelId: 'channel-a',
  users: [{ id: 'dispatcher', name: 'Dispatcher' }],
  sendMessage: vi.fn(),
};

vi.mock('../hooks/useChat', () => ({
  useChat: () => ({
    ...chatState,
    draftChannel: chatState.draftChannel,
    messages: [],
    setActiveChannelId: vi.fn(),
    loading: false,
    sendMessage: chatState.sendMessage,
    startDirectChat: vi.fn(),
    startGroupChat: vi.fn(),
    unreadByChannel: {},
    unreadCount: 0,
    setTyping: vi.fn(),
    editMessage: vi.fn(),
    deleteMessage: vi.fn(),
    toggleReaction: vi.fn(),
    togglePin: vi.fn(),
    forwardMessage: vi.fn(),
    contactPresence: {},
    toggleMute: vi.fn(),
    loadOlderMessages: vi.fn(),
    hasOlderMessages: false,
    loadingOlderMessages: false,
  }),
}));

vi.mock('../config/firebase', () => ({
  storage: {},
  storageRef: vi.fn(),
  uploadBytesResumable: vi.fn(),
  getDownloadURL: vi.fn(),
}));

vi.mock('./PlacesAutocompleteInput', () => ({
  default: ({ value, onChange, placeholder }) => React.createElement('input', { value, onChange: (event) => onChange(event.target.value), placeholder }),
}));

vi.mock('../hooks/useGoogleMaps', () => ({
  default: () => ({ ready: false }),
  loadGoogleMapsApi: vi.fn(),
  GOOGLE_MAPS_AUTH_FAILURE_EVENT: 'agape:google-maps-auth-failure',
}));
vi.mock('../services/secureAi', () => ({ generateAiText: vi.fn() }));

const { ChatPage } = await import('./chat/ChatPage.jsx');
const { RoutePlanSection } = await import('./DriverToolsPage.jsx');
const { purgeLegacyChatStorage, purgeLegacyRoutePlanStorage } = await import('../utils/sensitiveSessionStorage');

const mountedRoots = [];

const mount = async (element) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);
  mountedRoots.push({ root, container });
  await act(async () => root.render(element));
  return { root, container };
};

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = vi.fn();
  localStorage.clear();
  sessionStorage.clear();
  chatState.currentUser = { id: 'driver-a', name: 'Driver A' };
  chatState.channels = [{ id: 'channel-a', participants: ['driver-a', 'dispatcher'], participantDetails: {} }];
  chatState.activeChannelId = 'channel-a';
  chatState.draftChannel = null;
  chatState.sendMessage = vi.fn();
});

afterEach(async () => {
  while (mountedRoots.length) {
    const { root, container } = mountedRoots.pop();
    await act(async () => root.unmount());
    container.remove();
  }
});

describe('sensitive current-session memory contract', () => {
  it('removes only exact legacy PHI keys from both Web Storage areas', () => {
    for (const storageArea of [localStorage, sessionStorage]) {
      storageArea.setItem('agape_chat_outbox', 'message body');
      storageArea.setItem('agape_chat_draft_channel-a', 'draft body');
      storageArea.setItem('agape_routePlan_driver-a', JSON.stringify([{ label: 'route address' }]));
      storageArea.setItem('agape_routePlan_driver-a:expanded', '1');
      storageArea.setItem('agape_routePlan_theme', 'keep unrelated lookalike');
      storageArea.setItem('agape_chat_theme', 'keep preference');
    }

    purgeLegacyChatStorage();
    purgeLegacyRoutePlanStorage();

    for (const storageArea of [localStorage, sessionStorage]) {
      expect(storageArea.getItem('agape_chat_outbox')).toBeNull();
      expect(storageArea.getItem('agape_chat_draft_channel-a')).toBeNull();
      expect(storageArea.getItem('agape_routePlan_driver-a')).toBeNull();
      expect(storageArea.getItem('agape_routePlan_driver-a:expanded')).toBeNull();
      expect(storageArea.getItem('agape_routePlan_theme')).toBe('keep unrelated lookalike');
      expect(storageArea.getItem('agape_chat_theme')).toBe('keep preference');
    }
  });

  it('never reads or writes message or route payloads in Web Storage', () => {
    expect(chatSource).not.toMatch(/(?:localStorage|sessionStorage)\.(?:getItem|setItem)\(/);
    expect(toolsSource).not.toMatch(/(?:localStorage|sessionStorage)\.(?:getItem|setItem)\(/);
    expect(chatSource).toContain('Message kept in memory for this open session.');
    expect(chatSource).toContain('<ChatSession key={sessionIdentity}');
    expect(chatSource).toContain('if (!sessionActiveRef.current) return;');
    expect(toolsSource).toContain('<RoutePlanSession key={sessionIdentity}');
    expect(toolsSource).toContain('if (!routeSessionActiveRef.current) return;');
  });

  it('does not expose a prior user chat draft during an identity transition', async () => {
    const { root, container } = await mount(React.createElement(ChatPage));
    const composer = container.querySelector('input[placeholder="Aa"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(composer, 'Sensitive message for driver A');
      composer.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(container.querySelector('input[placeholder="Aa"]').value).toBe('Sensitive message for driver A');

    chatState.currentUser = { id: 'driver-b', name: 'Driver B' };
    chatState.channels = [{ id: 'channel-a', participants: ['driver-b', 'dispatcher'], participantDetails: {} }];
    await act(async () => root.render(React.createElement(ChatPage)));

    expect(container.querySelector('input[placeholder="Aa"]').value).toBe('');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('discards a late failed send after the authenticated identity changes', async () => {
    let rejectSend;
    chatState.sendMessage = vi.fn(() => new Promise((_, reject) => { rejectSend = reject; }));
    const { root, container } = await mount(React.createElement(ChatPage));
    await act(async () => {
      container.querySelector('button.agape-messenger-like-btn').click();
    });
    expect(chatState.sendMessage).toHaveBeenCalledTimes(1);

    chatState.currentUser = { id: 'driver-b', name: 'Driver B' };
    chatState.channels = [{ id: 'channel-a', participants: ['driver-b', 'dispatcher'], participantDetails: {} }];
    await act(async () => root.render(React.createElement(ChatPage)));
    await act(async () => { rejectSend(new Error('offline')); });

    expect(container.textContent).not.toContain('kept in memory');
    expect(container.textContent).not.toContain('Retry pending');
    expect(container.querySelector('input[placeholder="Aa"]').value).toBe('');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('does not render another user\'s stale draft channel', async () => {
    chatState.currentUser = { id: 'driver-b', name: 'Driver B' };
    chatState.channels = [];
    chatState.activeChannelId = 'old-draft';
    chatState.draftChannel = {
      id: 'old-draft',
      isDraft: true,
      participants: ['driver-a', 'private-passenger'],
      participantDetails: { 'private-passenger': { name: 'Private Passenger' } },
    };

    const { container } = await mount(React.createElement(ChatPage));

    expect(container.textContent).not.toContain('Private Passenger');
    expect(container.textContent).toContain('Select a Chat');
  });

  it('does not render a prior driver route on the first identity-change render', async () => {
    const commonProps = {
      appSettings: {},
      driverPosition: null,
      onSetRoutePlanStops: vi.fn(),
      onSendToSequencer: vi.fn(),
      onOpenSequencer: vi.fn(),
    };
    const { root, container } = await mount(React.createElement(RoutePlanSection, {
      ...commonProps,
      currentUser: { id: 'driver-a' },
      routePlanStops: [{ address: '1100 Private Health Street', tripId: 'trip-a', bookingId: 'secret-booking' }],
    }));
    expect(Array.from(container.querySelectorAll('input')).some((input) => input.value === '1100 Private Health Street')).toBe(true);

    flushSync(() => root.render(React.createElement(RoutePlanSection, {
        ...commonProps,
        currentUser: { id: 'driver-b' },
        routePlanStops: null,
      })));
    expect(Array.from(container.querySelectorAll('input')).some((input) => input.value === '1100 Private Health Street')).toBe(false);
    await act(async () => {});
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});

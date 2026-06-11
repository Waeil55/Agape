# Chat Page Rebuild Specification

## Purpose

The Chat page is the unified communication workspace for Agape Care operations. It supports internal team messaging for admins, dispatchers, and drivers, plus client/SMS-style conversations for operations staff.

## User Roles

- Admin: can view and create team and client conversations, inspect conversation details, and delete conversations.
- Dispatcher: can coordinate with drivers and clients, create team and client conversations, and inspect details.
- Driver: can participate in assigned/available team conversations with a simplified inbox and message composer.

## Main Workflows

- Load all conversations for the signed-in user in real time.
- Select a conversation and subscribe to its messages.
- Page older messages without blocking the latest real-time listener.
- Send team messages to `chat_messages`.
- Send client/SMS-style messages through the callable SMS function when available and log the message to `smsLogs`.
- Mark opened conversations as read.
- Broadcast and observe typing state.
- Show contact/presence context for participants.
- Create team or client conversations.

## Firebase Interactions

- `chatData/conversations`: conversation metadata, participants, unread counts, last message, and client flags.
- `chat_messages`: internal team messages keyed by `conversationId`.
- `smsLogs`: client/SMS-style messages keyed by `conversationId`.
- `chat_typing`: short-lived typing state keyed by conversation and user.
- `presence`: best-effort user availability state.
- `users`: read-only contact enrichment.

## Real-Time Behavior

- Conversations are watched through a single document snapshot.
- The active conversation watches the latest message page with `limitToLast`.
- Older pages are fetched on demand and merged with the live window.
- Read counts are cleared shortly after the user opens a conversation.
- Typing updates are debounced and expire visually after a few seconds.

## Error And Offline Handling

- Conversation and message errors are displayed in-context.
- Sending failures restore the draft text.
- Presence changes are best effort and never block chat.
- Existing Firestore local persistence handles offline reads/writes where available.

## Performance Requirements

- Contacts are normalized once through memoized maps.
- Message listeners subscribe only to the active conversation.
- Latest messages are windowed to a fixed page size.
- Older pages are loaded explicitly.
- UI components are presentational and receive normalized data.

## UI Requirements

- Mobile-first messenger layout.
- Inbox and message pane switch on small screens.
- Desktop shows inbox and conversation side by side, with optional details panel.
- Composer stays compact and anchored above safe-area and bottom navigation.
- Message bubbles group by sender and time.
- No nested cards, excessive padding, hidden content, or overlapping controls.

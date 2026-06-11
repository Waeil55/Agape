import React, { useMemo, useState } from 'react';
import { AlertCircle, MessageCircle, Plus, Users } from 'lucide-react';
import useChat from '../hooks/useChat';
import ChatSidebar from './chat/Sidebar';
import MessagePane from './chat/MessagePane';
import InfoPanel from './chat/InfoPanel';
import NewChatModal from './chat/NewChatModal';
import NewSmsModal from './chat/NewSmsModal';
import { buildConversationSubtitle, buildConversationTitle, normalizeEmail, readableName } from '../utils/chatUtils';

export default function ChatPage({
  user,
  currentUser,
  drivers = [],
  dispatchers = [],
  role = 'admin',
  trips = [],
}) {
  const userEmail = normalizeEmail(user?.email || currentUser || '');
  const [mobileView, setMobileView] = useState('inbox');
  const [infoOpen, setInfoOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newSmsOpen, setNewSmsOpen] = useState(false);

  const chat = useChat({ userEmail, role, drivers, dispatchers, trips });

  const activeTitle = useMemo(
    () => buildConversationTitle(chat.activeConversation, chat.contactsByEmail, userEmail),
    [chat.activeConversation, chat.contactsByEmail, userEmail]
  );

  const activeSubtitle = useMemo(
    () => buildConversationSubtitle(chat.activeConversation, chat.contactsByEmail, userEmail),
    [chat.activeConversation, chat.contactsByEmail, userEmail]
  );

  const handleSelectConversation = (conversationId) => {
    chat.setActiveConversationId(conversationId);
    setMobileView('messages');
    setInfoOpen(false);
  };

  const handleBackToInbox = () => {
    setMobileView('inbox');
    setInfoOpen(false);
  };

  const isDriver = role === 'driver';

  return (
    <section className="h-full min-h-0 w-full bg-[#f6f7fb] text-slate-950 flex overflow-hidden">
      <div className={`${mobileView === 'inbox' ? 'flex' : 'hidden'} md:flex w-full md:w-[360px] lg:w-[390px] shrink-0 min-h-0 border-r border-slate-200 bg-white`}>
        <ChatSidebar
          conversations={chat.filteredConversations}
          allConversationCount={chat.conversations.length}
          activeConversationId={chat.activeConversationId}
          contactsByEmail={chat.contactsByEmail}
          currentUserEmail={userEmail}
          filter={chat.filter}
          onFilterChange={chat.setFilter}
          onSelectConversation={handleSelectConversation}
          onNewChat={() => setNewChatOpen(true)}
          onNewSms={() => setNewSmsOpen(true)}
          loading={chat.loadingConversations}
          error={chat.error}
          isDriver={isDriver}
          unreadTotal={chat.unreadTotal}
        />
      </div>

      <div className={`${mobileView === 'messages' ? 'flex' : 'hidden'} md:flex flex-1 min-w-0 min-h-0`}>
        {chat.activeConversation ? (
          <MessagePane
            conversation={chat.activeConversation}
            messages={chat.messages}
            currentUserEmail={userEmail}
            contactsByEmail={chat.contactsByEmail}
            title={activeTitle}
            subtitle={activeSubtitle}
            typingUsers={chat.typingUsers}
            loading={chat.loadingMessages}
            loadingOlder={chat.loadingOlder}
            hasOlderMessages={chat.hasOlderMessages}
            sending={chat.sending}
            error={chat.messageError}
            onBack={handleBackToInbox}
            onInfo={() => setInfoOpen(true)}
            onSend={chat.sendMessage}
            onTyping={chat.setTyping}
            onLoadOlder={chat.loadOlderMessages}
          />
        ) : (
          <div className="flex-1 min-h-0 flex items-center justify-center p-6">
            <div className="max-w-sm text-center">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/20">
                <MessageCircle size={26} />
              </div>
              <h2 className="mt-5 text-lg font-black text-slate-950">No conversation selected</h2>
              <p className="mt-2 text-sm font-medium text-slate-500">
                Choose a thread from the inbox or start a new conversation.
              </p>
              <div className="mt-5 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setNewChatOpen(true)}
                  className="h-11 px-4 rounded-xl bg-blue-600 text-white text-sm font-bold inline-flex items-center gap-2"
                >
                  <Plus size={16} /> New Chat
                </button>
                {!isDriver && (
                  <button
                    type="button"
                    onClick={() => setNewSmsOpen(true)}
                    className="h-11 px-4 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-bold inline-flex items-center gap-2"
                  >
                    <Users size={16} /> Client
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={`${infoOpen ? 'fixed inset-0 z-[90] md:relative md:inset-auto md:z-auto md:flex' : 'hidden'} md:w-[320px] lg:w-[360px] shrink-0 min-h-0 border-l border-slate-200 bg-white`}>
        <InfoPanel
          conversation={chat.activeConversation}
          title={activeTitle}
          subtitle={activeSubtitle}
          contactsByEmail={chat.contactsByEmail}
          currentUserEmail={userEmail}
          presenceByEmail={chat.presenceByEmail}
          onClose={() => setInfoOpen(false)}
          onDelete={chat.deleteConversation}
          canDelete={!isDriver}
        />
      </div>

      {chat.error && (
        <div className="absolute left-4 right-4 bottom-[calc(92px+env(safe-area-inset-bottom,0px))] md:left-auto md:right-5 md:bottom-5 md:w-96 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 shadow-lg flex gap-2">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{chat.error}</span>
        </div>
      )}

      {newChatOpen && (
        <NewChatModal
          contacts={chat.contacts}
          currentUserEmail={userEmail}
          onClose={() => setNewChatOpen(false)}
          onCreate={async (payload) => {
            await chat.createConversation(payload);
            setNewChatOpen(false);
            setMobileView('messages');
          }}
        />
      )}

      {newSmsOpen && !isDriver && (
        <NewSmsModal
          currentUserName={readableName(userEmail)}
          currentUserEmail={userEmail}
          onClose={() => setNewSmsOpen(false)}
          onCreate={async (payload) => {
            await chat.createConversation(payload);
            setNewSmsOpen(false);
            setMobileView('messages');
          }}
        />
      )}
    </section>
  );
}

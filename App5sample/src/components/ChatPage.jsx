import React, { useState } from 'react';
import { MessageCircle, Send, Plus, Users, Search, Paperclip } from 'lucide-react';

const ChatPage = ({ currentUser }) => {
  const [selectedChat, setSelectedChat] = useState(null);
  const [message, setMessage] = useState('');
  const [chatList, setChatList] = useState([]);
  const [messages, setMessages] = useState({});

  const handleSendMessage = () => {
    if (!message.trim() || !selectedChat) return;
    const newMessage = {
      id: Date.now(),
      sender: 'me',
      name: currentUser || 'You',
      message,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages({ ...messages, [selectedChat.id]: [...(messages[selectedChat.id] || []), newMessage] });
    setChatList(chatList.map(chat => chat.id === selectedChat.id ? { ...chat, lastMessage: message, timestamp: 'now' } : chat));
    setMessage('');
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[calc(100vh-200px)]">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-200">
          <div className="flex gap-2 mb-3">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-lg">
              <Search size={16} className="text-slate-600" />
              <input type="text" placeholder="Search chats..." className="bg-transparent outline-none flex-1" />
            </div>
            <button className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><Plus size={18} /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {chatList.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No conversations yet. Click + to start one.</div>
          ) : (
            chatList.map(chat => (
              <button key={chat.id} onClick={() => setSelectedChat(chat)}
                className={`w-full text-left p-4 border-b border-slate-100 hover:bg-slate-50 transition ${selectedChat?.id === chat.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold ${chat.type === 'group' ? 'bg-emerald-500' : 'bg-blue-500'}`}>
                    {chat.type === 'group' ? <Users size={18} /> : chat.name?.[0] || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{chat.name}</p>
                    <p className="text-xs text-slate-600 truncate">{chat.lastMessage}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {selectedChat ? (
        <div className="md:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-200">
            <h3 className="font-bold text-slate-900">{selectedChat.name}</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {(messages[selectedChat.id] || []).length === 0 ? (
              <div className="text-center text-slate-400 text-sm mt-8">No messages yet. Start the conversation.</div>
            ) : (
              (messages[selectedChat.id] || []).map(msg => (
                <div key={msg.id} className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs px-4 py-2 rounded-lg ${msg.sender === 'me' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-slate-100 text-slate-900 rounded-bl-none'}`}>
                    <p className="text-sm">{msg.message}</p>
                    <p className={`text-xs mt-1 ${msg.sender === 'me' ? 'text-blue-100' : 'text-slate-600'}`}>{msg.timestamp}</p>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="p-4 border-t border-slate-200">
            <div className="flex gap-2">
              <button className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition"><Paperclip size={20} /></button>
              <input type="text" placeholder="Type a message..." value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500" />
              <button onClick={handleSendMessage} className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"><Send size={20} /></button>
            </div>
          </div>
        </div>
      ) : (
        <div className="md:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 flex items-center justify-center">
          <div className="text-center">
            <MessageCircle size={48} className="mx-auto text-slate-400 mb-4" />
            <p className="text-slate-600">Select a chat to start messaging</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPage;

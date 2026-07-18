import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Phone, Video, Info, Search, Plus, Smile, ThumbsUp, Send,
  Camera, Image as ImageIcon
} from 'lucide-react';

const INITIAL_CHANNELS = [
  {
    id: 'ch_1',
    name: 'Sarah Connor',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80',
    active: true,
    activeTime: 'Active now',
    unread: true,
    time: '2m',
    lastMessage: 'Let me know when the dispatcher assigns the trip.',
    messages: [
      { id: 'm1', text: 'Hey there! Just wanted to check if you are available today.', sender: 'received', time: '10:30 AM' },
      { id: 'm2', text: 'Yes! I am ready to start my shift as soon as the manifest is ready.', sender: 'sent', time: '10:32 AM' },
      { id: 'm3', text: 'Awesome, thank you.', sender: 'received', time: '10:33 AM' },
      { id: 'm4', text: 'Let me know when the dispatcher assigns the trip.', sender: 'received', time: '10:34 AM' }
    ]
  },
  {
    id: 'ch_2',
    name: 'James Carter (Dispatcher)',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80',
    active: true,
    activeTime: 'Active now',
    unread: false,
    time: '1h',
    lastMessage: 'Got it. Stay safe on the road!',
    messages: [
      { id: 'm5', text: 'Is vehicle 402 clear for operations?', sender: 'received', time: '9:15 AM' },
      { id: 'm6', text: 'Yes, pre-trip inspection complete. Odometer entered.', sender: 'sent', time: '9:18 AM' },
      { id: 'm7', text: 'Got it. Stay safe on the road!', sender: 'received', time: '9:20 AM' }
    ]
  },
  {
    id: 'ch_3',
    name: 'Elena Rostova',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&auto=format&fit=crop&q=80',
    active: false,
    activeTime: 'Active 15m ago',
    unread: false,
    time: '3h',
    lastMessage: 'The address was updated on the manifest.',
    messages: [
      { id: 'm8', text: 'Hey, did you arrive at the clinic yet?', sender: 'received', time: '8:02 AM' },
      { id: 'm9', text: 'Arrived at pickup. Waiting for member now.', sender: 'sent', time: '8:05 AM' },
      { id: 'm10', text: 'The address was updated on the manifest.', sender: 'received', time: '8:10 AM' }
    ]
  },
  {
    id: 'ch_4',
    name: 'Michael Vance (Supervisor)',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80',
    active: true,
    activeTime: 'Active now',
    unread: false,
    time: '1d',
    lastMessage: 'Please submit your timesheet before 5 PM.',
    messages: [
      { id: 'm11', text: 'Please submit your timesheet before 5 PM.', sender: 'received', time: 'Yesterday' }
    ]
  },
  {
    id: 'ch_5',
    name: 'Clinical Dispatch Hub',
    avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=100&auto=format&fit=crop&q=80',
    active: false,
    activeTime: 'Active 2h ago',
    unread: false,
    time: '2d',
    lastMessage: 'All routes optimized for tomorrow morning.',
    messages: [
      { id: 'm12', text: 'All routes optimized for tomorrow morning.', sender: 'received', time: '2 days ago' }
    ]
  }
];

const ACTIVE_STORIES = [
  { id: 'st_1', name: 'Sarah', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80', active: true },
  { id: 'st_2', name: 'James', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80', active: true },
  { id: 'st_3', name: 'Michael', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80', active: true },
  { id: 'st_4', name: 'David', avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=100&auto=format&fit=crop&q=80', active: true },
  { id: 'st_5', name: 'Jessie', avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&auto=format&fit=crop&q=80', active: true }
];

export const ChatPage = ({ onBack, onThreadActive }) => {
  const [channels, setChannels] = useState(() => {
    const saved = localStorage.getItem('agape_messenger_channels');
    return saved ? JSON.parse(saved) : INITIAL_CHANNELS;
  });
  
  const [activeChannelId, setActiveChannelId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [composerText, setComposerText] = useState('');
  const [isTypingReply, setIsTypingReply] = useState(false);

  const messagesEndRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('agape_messenger_channels', JSON.stringify(channels));
  }, [channels]);

  const activeChannel = channels.find(c => c.id === activeChannelId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChannelId, activeChannel?.messages, isTypingReply]);

  const handleSendMessage = (textToSend = null) => {
    const text = (textToSend || composerText).trim();
    if (!text && !textToSend) return;

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newMessage = {
      id: `msg_${Date.now()}`,
      text: text || '👍',
      sender: 'sent',
      time: timestamp
    };

    setChannels(prev => prev.map(ch => {
      if (ch.id === activeChannelId) {
        return {
          ...ch,
          lastMessage: newMessage.text,
          time: 'now',
          messages: [...ch.messages, newMessage]
        };
      }
      return ch;
    }));

    if (!textToSend) {
      setComposerText('');
    }

    setIsTypingReply(true);
    setTimeout(() => {
      setIsTypingReply(false);
      const replyTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const mockReply = {
        id: `msg_reply_${Date.now()}`,
        text: getMockReplyText(activeChannel?.name || 'Contact'),
        sender: 'received',
        time: replyTimestamp
      };

      setChannels(prev => prev.map(ch => {
        if (ch.id === activeChannelId) {
          return {
            ...ch,
            unread: false,
            lastMessage: mockReply.text,
            time: 'now',
            messages: [...ch.messages, mockReply]
          };
        }
        return ch;
      }));
    }, 2000);
  };

  const getMockReplyText = (name) => {
    const replies = [
      `Thanks for the message! I'm reviewing the active manifest details now.`,
      `Got it. I will keep you posted as soon as the updates land.`,
      `Sounds good. Have a safe drive!`,
      `Understood. Let me double check with dispatch.`,
      `Perfect. See you at the clinic shortly!`
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  };

  const filteredChannels = channels.filter(ch =>
    ch.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ch.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectChannel = (channelId) => {
    setActiveChannelId(channelId);
    if (onThreadActive) onThreadActive(true);
    setChannels(prev => prev.map(ch => {
      if (ch.id === channelId) {
        return { ...ch, unread: false };
      }
      return ch;
    }));
  };

  if (activeChannel) {
    return (
      <div className="agape-messenger-thread h-full flex flex-col">
        {/* Header */}
        <div className="agape-messenger-thread-header flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setActiveChannelId(null); if (onThreadActive) onThreadActive(false); }}
              className="w-10 h-10 flex items-center justify-center text-blue-600 rounded-full hover:bg-slate-100 transition"
              aria-label="Back to chat list"
            >
              <ArrowLeft size={20} strokeWidth={2.5} />
            </button>
            
            <div className="agape-messenger-avatar-wrap">
              <img src={activeChannel.avatar} alt={activeChannel.name} className="agape-messenger-avatar" />
              {activeChannel.active && <div className="agape-messenger-status-dot" />}
            </div>

            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 truncate leading-tight">{activeChannel.name}</h3>
              <p className="text-[11px] font-semibold text-slate-500">{activeChannel.activeTime}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-blue-600">
            <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100"><Phone size={18} strokeWidth={2.2} /></button>
            <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100"><Video size={18} strokeWidth={2.2} /></button>
            <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100"><Info size={18} strokeWidth={2.2} /></button>
          </div>
        </div>

        {/* Messages list */}
        <div className="agape-messenger-thread-messages flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-white">
          <div className="agape-messenger-date-divider">Today</div>
          
          {activeChannel.messages.map((msg, index) => {
            const isSent = msg.sender === 'sent';
            return (
              <div key={msg.id || index} className={`agape-messenger-bubble-row ${isSent ? 'is-sent' : 'is-received'}`}>
                {!isSent && (
                  <img src={activeChannel.avatar} alt={activeChannel.name} className="agape-messenger-bubble-avatar" />
                )}
                <div className={`agape-messenger-bubble-group ${isSent ? 'is-sent' : 'is-received'}`}>
                  <div className="agape-messenger-bubble">
                    {msg.text}
                  </div>
                </div>
              </div>
            );
          })}

          {isTypingReply && (
            <div className="agape-messenger-bubble-row is-received">
              <img src={activeChannel.avatar} alt={activeChannel.name} className="agape-messenger-bubble-avatar" />
              <div className="agape-messenger-typing">
                <span className="agape-messenger-typing-dot"></span>
                <span className="agape-messenger-typing-dot"></span>
                <span className="agape-messenger-typing-dot"></span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Bottom Composer bar */}
        <div className="agape-messenger-composer border-t border-slate-100 bg-white px-4 py-3 flex items-center gap-3">
          <button className="text-blue-600 hover:text-blue-700 transition flex-shrink-0">
            <Plus size={20} strokeWidth={2.5} />
          </button>
          <button className="text-blue-600 hover:text-blue-700 transition flex-shrink-0">
            <Camera size={20} strokeWidth={2.2} />
          </button>
          <button className="text-blue-600 hover:text-blue-700 transition flex-shrink-0">
            <ImageIcon size={20} strokeWidth={2.2} />
          </button>

          <div className="agape-messenger-input-wrap flex-1 bg-slate-100 rounded-full px-4 py-2 flex items-center">
            <input
              type="text"
              placeholder="Aa"
              value={composerText}
              onChange={e => setComposerText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
            />
          </div>

          <div className="flex-shrink-0">
            {composerText.trim() ? (
              <button
                onClick={() => handleSendMessage()}
                className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white hover:bg-blue-700 transition active:scale-90"
              >
                <Send size={14} strokeWidth={2.5} className="ml-0.5" />
              </button>
            ) : (
              <button
                onClick={() => handleSendMessage('👍')}
                className="agape-messenger-like-btn text-blue-600 hover:text-blue-700 transition"
              >
                <ThumbsUp size={22} strokeWidth={2.2} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="agape-messenger-wrapper flex flex-col h-full bg-white animate-fade-in">
      {/* Top Header */}
      <div className="px-4 pt-5 pb-2 flex items-center justify-between bg-white shrink-0">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="w-9 h-9 flex items-center justify-center text-slate-600 rounded-full hover:bg-slate-100 transition mr-1"
            >
              <ArrowLeft size={18} strokeWidth={2.5} />
            </button>
          )}
          <h1 className="text-2xl font-black text-slate-900 leading-none tracking-tight">Chats</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-800 hover:bg-slate-200 transition">
            <Camera size={16} strokeWidth={2.2} />
          </button>
          <button className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-800 hover:bg-slate-200 transition">
            <Plus size={16} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="agape-messenger-search-bar flex items-center bg-slate-100 rounded-full px-4 py-2 mx-4 my-2 shrink-0">
        <Search size={16} className="text-slate-400 mr-2 flex-shrink-0" />
        <input
          type="text"
          placeholder="Search"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Stories / Active contacts */}
      <div className="agape-messenger-stories flex gap-4 overflow-x-auto px-4 py-2 scrollbar-none border-b border-slate-100 bg-white shrink-0">
        {ACTIVE_STORIES.map(story => (
          <div key={story.id} className="agape-messenger-story flex flex-col items-center gap-1.5 flex-shrink-0 cursor-pointer">
            <div className="agape-messenger-avatar-wrap">
              <img src={story.avatar} alt={story.name} className="agape-messenger-avatar w-12 h-12 rounded-full object-cover" />
              {story.active && <div className="agape-messenger-status-dot" />}
            </div>
            <span className="text-[11px] font-semibold text-slate-500 truncate w-14 text-center">{story.name}</span>
          </div>
        ))}
      </div>

      {/* Conversations feed */}
      <div className="agape-messenger-list flex-1 overflow-y-auto bg-white">
        {filteredChannels.map(channel => (
          <div
            key={channel.id}
            onClick={() => selectChannel(channel.id)}
            className={`agape-messenger-row flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition border-b border-slate-50 ${channel.unread ? 'is-unread' : ''}`}
          >
            <div className="agape-messenger-avatar-wrap flex-shrink-0">
              <img src={channel.avatar} alt={channel.name} className="agape-messenger-avatar" />
              {channel.active && <div className="agape-messenger-status-dot" />}
            </div>

            <div className="agape-messenger-row-content flex-1 min-w-0">
              <div className="agape-messenger-row-header flex justify-between items-baseline mb-0.5">
                <span className="agape-messenger-row-name text-sm font-bold text-slate-900 truncate">{channel.name}</span>
                <span className="agape-messenger-row-time text-[11px] text-slate-400 font-semibold">{channel.time}</span>
              </div>
              <div className="agape-messenger-row-snippet text-xs text-slate-500 font-semibold flex items-center justify-between gap-2">
                <span className="truncate">{channel.lastMessage}</span>
                {channel.unread && <div className="agape-messenger-unread-dot" />}
              </div>
            </div>
          </div>
        ))}

        {filteredChannels.length === 0 && (
          <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400">
            <p className="text-sm font-semibold">No chats found</p>
            <p className="text-xs mt-1">Try searching for another team member</p>
          </div>
        )}
      </div>
    </div>
  );
};

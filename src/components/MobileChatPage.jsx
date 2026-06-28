import React from 'react';
import { ChevronLeft, User, Phone, Video, Info, PlusCircle, Camera, ImageIcon, Mic, Send, CheckCircle2 } from 'lucide-react';

const MobileChatPage = () => {
  return (
    <div className="w-full flex-1 flex flex-col bg-white overflow-hidden pb-16">
      {/* Chat Header */}
      <div className="bg-white border-b border-gray-200 px-3 py-3 flex items-center justify-between shrink-0 shadow-sm z-10 sticky top-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
              <User className="w-6 h-6 text-gray-500" />
            </div>
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
          </div>
          
          <div className="flex flex-col">
            <span className="font-bold text-gray-900 text-sm">All Drivers</span>
            <span className="text-[11px] text-gray-500">Active Now</span>
          </div>
        </div>
        
        <div className="flex items-center gap-4 text-[#0084ff]">
          <Phone className="w-6 h-6" />
          <Video className="w-6 h-6" />
          <Info className="w-6 h-6" />
        </div>
      </div>

      {/* Chat Messages Area */}
      <div className="flex-1 overflow-y-auto bg-white p-4 space-y-5">
        
        {/* Timestamp */}
        <div className="text-center">
          <span className="text-xs font-medium text-gray-400">Today 8:42 AM</span>
        </div>

        {/* Incoming Message Block */}
        <div className="flex items-end gap-2">
          <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center shrink-0 overflow-hidden mb-1">
            <User className="w-4 h-4 text-gray-500" />
          </div>
          <div className="flex flex-col gap-1 max-w-[70%]">
            <div className="bg-gray-100 text-black px-4 py-2.5 rounded-2xl rounded-bl-sm text-[15px] leading-snug">
              Hey Waeil, are you heading to the pickup for Denae Kelley?
            </div>
          </div>
        </div>

        {/* Outgoing Message Block */}
        <div className="flex flex-col items-end gap-1 w-full">
          <div className="bg-[#0084ff] text-white px-4 py-2.5 rounded-2xl rounded-br-sm text-[15px] leading-snug max-w-[70%]">
            Yes, I'm about 5 minutes away. Traffic is a bit heavy on 91st.
          </div>
          <span className="text-[11px] text-gray-400 pr-1 flex items-center gap-1">
            Delivered <CheckCircle2 className="w-3 h-3 text-gray-400" />
          </span>
        </div>

        {/* Incoming Message Block */}
        <div className="flex items-end gap-2">
          <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center shrink-0 overflow-hidden mb-1">
            <User className="w-4 h-4 text-gray-500" />
          </div>
          <div className="flex flex-col gap-1 max-w-[70%]">
            <div className="bg-gray-100 text-black px-4 py-2.5 rounded-2xl rounded-bl-sm text-[15px] leading-snug">
              Okay perfect. Let me know when you have her in the vehicle.
            </div>
          </div>
        </div>

        {/* Outgoing Message Block */}
        <div className="flex flex-col items-end gap-1 w-full">
          <div className="bg-[#0084ff] text-white px-4 py-2.5 rounded-2xl rounded-br-sm text-[15px] leading-snug max-w-[70%]">
            Will do. Pulling up now.
          </div>
          <span className="text-[11px] text-gray-400 pr-1 flex items-center gap-1">
            Read <div className="w-3 h-3 rounded-full bg-gray-300"></div>
          </span>
        </div>
        
      </div>

      {/* Chat Input Bar */}
      <div className="bg-white border-t border-gray-200 px-2 py-3 flex items-end gap-2 shrink-0">
        <div className="flex gap-2 text-[#0084ff] pb-2 px-1">
          <PlusCircle className="w-6 h-6" />
          <Camera className="w-6 h-6 hidden sm:block" />
          <ImageIcon className="w-6 h-6 hidden sm:block" />
          <Mic className="w-6 h-6" />
        </div>
        
        <div className="flex-1 bg-gray-100 rounded-3xl flex items-center px-4 py-2 border border-transparent focus-within:border-gray-300 focus-within:bg-white transition-colors">
          <input 
            type="text" 
            placeholder="Aa" 
            className="w-full bg-transparent outline-none text-[15px]"
          />
          <div className="text-[#0084ff] pl-2 cursor-pointer">
            <Send className="w-5 h-5" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobileChatPage;

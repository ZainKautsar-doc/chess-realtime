import React, { useState, useEffect, useRef } from 'react';

interface ChatMessage {
  message: string;
  sender: string;
  role: string;
}

interface ChatBoxProps {
  messages: ChatMessage[];
  onSendMessage: (msg: string) => void;
  myRole: string;
  myDisplayName: string;
}

export default function ChatBox({ messages, onSendMessage, myRole, myDisplayName }: ChatBoxProps) {
  const [input, setInput] = useState('');
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() !== '') {
      onSendMessage(input);
      setInput('');
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'White': return 'text-blue-400';
      case 'Black': return 'text-red-400';
      case 'System': return 'text-slate-600';
      default: return 'text-slate-500';
    }
  };

  return (
    <div className="glass rounded-2xl flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-white/10 flex justify-between items-center flex-shrink-0">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Live Chat</h2>
        <span className={`text-xs ${getRoleColor(myRole)}`}>
          You: {myDisplayName}
        </span>
      </div>
      
      <div className="flex-1 p-4 overflow-y-auto space-y-3 custom-scrollbar">
        {messages.map((msg, i) => (
          <div key={i} className="text-xs leading-relaxed">
            {msg.role === 'System' ? (
               <span className="text-slate-500 italic">{msg.message}</span>
            ) : (
               <>
                 <span className={`${getRoleColor(msg.role)} font-bold mr-2`}>
                   [{msg.sender}]
                 </span>
                 <span className="text-slate-300">{msg.message}</span>
               </>
            )}
          </div>
        ))}
        <div ref={endOfMessagesRef} />
      </div>

      <div className="p-3">
        <form onSubmit={handleSubmit} className="bg-white/5 border border-white/10 rounded-lg flex px-3 py-2 items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="bg-transparent text-xs text-white outline-none flex-1"
          />
          <button
            type="submit"
            className="text-blue-400 font-bold text-xs ml-2 disabled:opacity-50 tracking-wider"
            disabled={!input.trim()}
          >
            SEND
          </button>
        </form>
      </div>
    </div>
  );
}

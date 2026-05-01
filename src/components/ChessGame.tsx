import React, { useState, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import ChatBox from './ChatBox';

interface ChatMessage {
  message: string;
  sender: string;
  role: string;
}

export default function ChessGame() {
  const [game, setGame] = useState(new Chess());
  const [role, setRole] = useState<string>('Spectator');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Connect to WebSocket server on port 3000
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    // We assume the game is hosted on port 3000 locally or injected by platform via same hostname
    const port = window.location.port ? `:${window.location.port}` : ':3000'; // Defaulting to 3000 for local proxy or direct access
    const wsUrl = `${protocol}//${host}${port}`;
    
    // Sometimes window.location.port is empty in prod, meaning 80/443. 
    // In our Dev environment it will hit the Vite proxy / Nginx which proxies WS seamlessly.
    // In many hosted setups, standard wss://domain.com/ works if standard HTTP proxies it.
    // Let's use standard URL logic:
    const wsUrlResolved = `${protocol}//${window.location.host}`;
    
    const ws = new WebSocket(wsUrlResolved);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'init':
            setRole(data.role);
            if (data.fen) {
              const newGame = new Chess(data.fen);
              setGame(newGame);
            }
            break;
            
          case 'updateBoard':
            if (data.fen) {
              const newGame = new Chess(data.fen);
              setGame(newGame);
            }
            break;
            
          case 'chat':
            setMessages((prev) => [...prev, {
              message: data.message,
              sender: data.sender,
              role: data.role
            }]);
            break;
        }
      } catch (err) {
        console.error('Failed to parse incoming message', err);
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  function makeAMove(move: any) {
    // Only White and Black can move
    if (role !== 'White' && role !== 'Black') {
      return false; // Spectators cannot move
    }

    try {
      const gameCopy = new Chess(game.fen());
      
      // Ensure it's the correct player's turn
      const turn = gameCopy.turn(); // 'w' or 'b'
      if ((role === 'White' && turn !== 'w') || (role === 'Black' && turn !== 'b')) {
        return false;
      }

      const result = gameCopy.move(move);

      if (result) {
        setGame(gameCopy);
        
        // Broadcast new FEN
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'move',
            fen: gameCopy.fen()
          }));
        }
        return true;
      }
    } catch (e) {
      return false;
    }
    return false;
  }

  function onDrop(sourceSquare: string, targetSquare: string, piece: string) {
    const move = makeAMove({
      from: sourceSquare,
      to: targetSquare,
      promotion: piece[1].toLowerCase() ?? 'q',
    });
    return move;
  }

  const handleSendMessage = (msg: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'chat',
        message: msg
      }));
    }
  };

  const getStatusText = () => {
    if (game.isCheckmate()) return "Checkmate!";
    if (game.isDraw()) return "Draw";
    if (role === 'Spectator') return `${game.turn() === 'w' ? 'White' : 'Black'}'s Turn`;
    
    const isMyTurn = (role === 'White' && game.turn() === 'w') || (role === 'Black' && game.turn() === 'b');
    return isMyTurn ? "Your Turn" : "Opponent's Turn";
  };

  return (
    <div className="flex justify-center gap-8 w-full max-w-[1024px] p-4 lg:p-10">
      {/* Chess Board Area */}
      <div className="flex flex-col gap-6 w-full lg:w-[560px]">
        {/* Opponent Info panel if desired, or Top status (Glassmorphism) */}
        <div className="flex items-center justify-between glass rounded-xl px-6 py-3">
          <div>
             <p className="text-sm text-slate-400 leading-none">Game Status</p>
             <h2 className="text-lg font-semibold text-white mt-1">
               {getStatusText()}
             </h2>
          </div>
          
          <div className="text-right">
             <p className="text-sm text-slate-400 mb-1">Current Turn</p>
             <div className={`text-xs font-semibold uppercase ${game.turn() === 'w' ? 'text-green-400 turn-indicator' : 'text-slate-400 pl-6'}`}>
               {game.turn() === 'w' ? 'WHITE TURN' : 'BLACK TURN'}
             </div>
          </div>
        </div>

        {/* Board Container */}
        <div className="rounded shadow-2xl shadow-black border-4 border-[#1a1a1a]">
           {/* Disable pointer events if not your turn or if spectator to prevent visual drag */}
          <div className={`${(role === 'Spectator' || ((role === 'White' && game.turn() === 'b') || (role === 'Black' && game.turn() === 'w'))) ? 'pointer-events-none' : ''}`}>
            <Chessboard
              position={game.fen()}
              onPieceDrop={onDrop}
              boardOrientation={role === 'Black' ? 'black' : 'white'}
              customDarkSquareStyle={{ backgroundColor: '#475569' }}
              customLightSquareStyle={{ backgroundColor: '#e2e8f0' }}
              customDropSquareStyle={{ boxShadow: 'inset 0 0 1px 6px rgba(0,0,0,0.3)' }}
            />
          </div>
        </div>
        
        {/* Player Info panel */}
        <div className="flex items-center justify-between glass rounded-xl px-6 py-3">
          <div className="flex items-center gap-4">
             <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold
                ${role === 'White' ? 'bg-slate-200 border-2 border-white text-slate-900' : 
                  role === 'Black' ? 'bg-slate-800 border-2 border-slate-600 text-white' : 
                  'bg-slate-600 border-2 border-slate-500 text-white'}
             `}>
               {role === 'White' ? 'W' : role === 'Black' ? 'B' : 'S'}
             </div>
             <div>
               <p className="text-sm text-slate-400 leading-none">You</p>
               <p className="text-lg font-semibold text-white">{role}</p>
             </div>
          </div>
        </div>
      </div>

      {/* Side Area */}
      <div className="flex flex-col gap-4 w-full lg:w-[320px] h-[500px] lg:h-[672px]">
        <div className="h-full flex flex-col">
          <ChatBox 
            messages={messages} 
            onSendMessage={handleSendMessage}
            myRole={role}
          />
        </div>
      </div>
    </div>
  );
}

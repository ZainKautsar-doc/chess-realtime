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
  const [spectatorNumber, setSpectatorNumber] = useState<number | null>(null);
  const [spectators, setSpectators] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [moveSquares, setMoveSquares] = useState<any>({});
  const [optionSquares, setOptionSquares] = useState<any>({});
  const [moveFrom, setMoveFrom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrlResolved = `${protocol}//${window.location.host}`;
    
    const ws = new WebSocket(wsUrlResolved);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'init':
            setRole(data.role);
            setSpectatorNumber(data.spectatorNumber);
            if (data.spectators) setSpectators(data.spectators);
            if (data.fen) {
              setGame(new Chess(data.fen));
            }
            break;
            
          case 'updateBoard':
            if (data.fen) {
              setGame(new Chess(data.fen));
              setMoveFrom(null);
              setOptionSquares({});
              if (data.lastMove) {
                setMoveSquares({
                  [data.lastMove.from]: { backgroundColor: 'rgba(255, 255, 0, 0.4)' },
                  [data.lastMove.to]: { backgroundColor: 'rgba(255, 255, 0, 0.4)' },
                });
              }
            }
            break;
            
          case 'spectatorUpdate':
            if (data.spectators) {
              setSpectators(data.spectators);
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
    if (role !== 'White' && role !== 'Black') {
      showError("Spectators cannot move pieces.");
      return false;
    }

    try {
      const gameCopy = new Chess(game.fen());
      
      const turn = gameCopy.turn();
      if ((role === 'White' && turn !== 'w') || (role === 'Black' && turn !== 'b')) {
        showError("It's not your turn.");
        return false;
      }

      const result = gameCopy.move(move);

      if (result) {
        setGame(gameCopy);
        setMoveSquares({
          [move.from]: { backgroundColor: 'rgba(255, 255, 0, 0.4)' },
          [move.to]: { backgroundColor: 'rgba(255, 255, 0, 0.4)' },
        });
        
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'move',
            fen: gameCopy.fen(),
            move: { from: move.from, to: move.to }
          }));
        }
        return true;
      } else {
        showError("Invalid move.");
        return false;
      }
    } catch (e) {
      showError("Invalid move.");
      return false;
    }
  }

  function showError(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 3000);
  }

  function onDrop(sourceSquare: string, targetSquare: string, piece: string) {
    // Keep onDrop but it will be disabled by arePiecesDraggable={false}
    // unless the user decides to keep both. The request said "bukan dengan dihold"
    // so we'll disable dragging in the component props.
    const move = makeAMove({
      from: sourceSquare,
      to: targetSquare,
      promotion: piece[1]?.toLowerCase() ?? 'q',
    });
    return move;
  }

  function getMoveOptions(square: string) {
    const moves = game.moves({
      square: square as any,
      verbose: true,
    });
    if (moves.length === 0) {
      return false;
    }

    const newSquares: any = {};
    moves.map((move) => {
      newSquares[move.to] = {
        background:
          game.get(move.to as any) && game.get(move.to as any).color !== game.get(square as any).color
            ? 'radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)'
            : 'radial-gradient(circle, rgba(0,0,0,.1) 20%, transparent 20%)',
        borderRadius: '50%',
      };
      return move;
    });
    newSquares[square] = {
      background: 'rgba(255, 255, 0, 0.4)',
    };
    setOptionSquares(newSquares);
    return true;
  }

  function onSquareClick(square: string) {
    if (role !== 'White' && role !== 'Black') {
      showError("Spectators cannot move pieces.");
      return;
    }

    const turn = game.turn();
    if ((role === 'White' && turn !== 'w') || (role === 'Black' && turn !== 'b')) {
      showError("It's not your turn.");
      return;
    }

    // if no moveFrom, check if we can select
    if (!moveFrom) {
      const hasMoveOptions = getMoveOptions(square);
      if (hasMoveOptions) setMoveFrom(square);
      return;
    }

    // if moveFrom, try to move
    const move = makeAMove({
      from: moveFrom,
      to: square,
      promotion: 'q', // always promote to queen for simplicity
    });

    if (move) {
      setMoveFrom(null);
      setOptionSquares({});
    } else {
      // If move failed, check if we're clicking another of our own pieces to change selection
      const piece = game.get(square as any);
      if (piece && ((role === 'White' && piece.color === 'w') || (role === 'Black' && piece.color === 'b'))) {
        const hasMoveOptions = getMoveOptions(square);
        if (hasMoveOptions) {
          setMoveFrom(square);
        } else {
          setMoveFrom(null);
          setOptionSquares({});
        }
      } else {
        setMoveFrom(null);
        setOptionSquares({});
      }
    }
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

  const myDisplayName = role === 'Spectator' ? `Spectator ${spectatorNumber}` : role;

  return (
    <div className="flex flex-col lg:flex-row justify-center gap-8 w-full max-w-[1024px] p-4 lg:p-10">
      {/* Chess Board Area */}
      <div className="flex flex-col gap-6 w-full lg:w-[560px]">
        {/* Top Panel: Game Status & Spectators */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between glass rounded-xl px-6 py-3 relative overflow-hidden">
            {error && (
              <div className="absolute inset-0 bg-red-500/90 flex items-center justify-center text-white font-bold text-sm z-10 animate-pulse">
                {error}
              </div>
            )}
            <div>
               <p className="text-sm text-slate-400 leading-none">Game Status</p>
               <h2 className="text-lg font-semibold text-white mt-1">
                 {getStatusText()}
               </h2>
            </div>
            
            <div className="text-right">
               <p className="text-sm text-slate-400 mb-1">Current Turn</p>
               <div className={`text-xs font-semibold uppercase ${game.turn() === 'w' ? 'text-green-400' : 'text-slate-400'}`}>
                 {game.turn() === 'w' ? 'WHITE TURN' : 'BLACK TURN'}
               </div>
            </div>
          </div>

          {spectators.length > 0 && (
            <div className="glass rounded-xl px-6 py-2 text-xs text-slate-300 flex items-center gap-2">
              <span className="text-slate-500">👁️ Spectators:</span>
              <div className="flex flex-wrap gap-x-2">
                {spectators.map((s, idx) => (
                  <span key={s} className="font-medium text-slate-200">
                    {s}{idx < spectators.length - 1 ? ',' : ''}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Board Container */}
        <div className="rounded shadow-2xl shadow-black border-4 border-[#1a1a1a]">
          <Chessboard
            options={{
              position: game.fen(),
              onPieceDrop: ({ sourceSquare, targetSquare, piece }) => {
                return onDrop(sourceSquare, targetSquare ?? '', piece.pieceType);
              },
              onSquareClick: ({ square }) => {
                onSquareClick(square);
              },
              allowDragging: false,
              boardOrientation: (role === 'Black' ? 'black' : 'white') as 'black' | 'white',
              darkSquareStyle: { backgroundColor: '#475569' },
              lightSquareStyle: { backgroundColor: '#e2e8f0' },
              dropSquareStyle: { boxShadow: 'inset 0 0 1px 6px rgba(0,0,0,0.3)' },
              squareStyles: {
                ...moveSquares,
                ...optionSquares,
              },
              animationDurationInMs: 300,
            }}
          />
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
               <p className="text-lg font-semibold text-white">{myDisplayName}</p>
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
            myDisplayName={myDisplayName}
          />
        </div>
      </div>
    </div>
  );
}

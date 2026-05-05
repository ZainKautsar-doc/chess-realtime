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
  const [gameOverMsg, setGameOverMsg] = useState<string | null>(null);
  const [drawOfferFrom, setDrawOfferFrom] = useState<string | null>(null);
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [restartOfferFrom, setRestartOfferFrom] = useState<string | null>(null);
  const [waitingForRestart, setWaitingForRestart] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const PIECE_ICONS: Record<string, string> = {
    p: '♟',
    n: '♞',
    b: '♝',
    r: '♜',
    q: '♛',
    k: '♚',
  };

  const captured = (() => {
    const board = game.board();
    const wCounts = { p: 0, n: 0, b: 0, r: 0, q: 0 };
    const bCounts = { p: 0, n: 0, b: 0, r: 0, q: 0 };
    
    board.forEach(row => {
      row.forEach(piece => {
        if (piece) {
          if (piece.color === 'w') wCounts[piece.type as keyof typeof wCounts]++;
          else bCounts[piece.type as keyof typeof bCounts]++;
        }
      });
    });

    const init = { p: 8, n: 2, b: 2, r: 2, q: 1 };
    const caps = { w: [] as string[], b: [] as string[] };
    
    for (const t of ['q', 'r', 'b', 'n', 'p']) {
      const type = t as keyof typeof init;
      const wMiss = init[type] - wCounts[type];
      for (let i = 0; i < wMiss; i++) caps.w.push(type);
      
      const bMiss = init[type] - bCounts[type];
      for (let i = 0; i < bMiss; i++) caps.b.push(type);
    }
    
    return caps;
  })();

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
            setGameOverMsg(null);
            setDrawOfferFrom(null);
            setRestartOfferFrom(null);
            setWaitingForRestart(false);
            setMoveFrom(null);
            setOptionSquares({});
            setMoveSquares({});
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

          case 'drawOffer':
            if (data.sender !== role && role !== 'Spectator') {
              setDrawOfferFrom(data.sender);
            }
            break;

          case 'drawAccept':
            setGameOverMsg('Game ended in a draw.');
            setDrawOfferFrom(null);
            break;

          case 'drawReject':
            if (data.sender !== role && role !== 'Spectator') {
              showError(`${data.sender} declined the draw.`);
            }
            setDrawOfferFrom(null);
            break;

          case 'resign':
            const winner = data.sender === 'White' ? 'Black' : 'White';
            setGameOverMsg(`${data.sender} resigned. ${winner} wins!`);
            break;

          case 'restartOffer':
            if (data.sender !== role && role !== 'Spectator') {
              setRestartOfferFrom(data.sender);
            }
            break;

          case 'restartGame':
            setGame(new Chess(data.fen));
            setGameOverMsg(null);
            setRestartOfferFrom(null);
            setWaitingForRestart(false);
            setMoveFrom(null);
            setOptionSquares({});
            setMoveSquares({});
            break;

          case 'restartReject':
            if (data.sender !== role && role !== 'Spectator') {
              showError(`${data.sender} declined the restart.`);
            }
            setRestartOfferFrom(null);
            setWaitingForRestart(false);
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
    if (gameOverMsg || game.isGameOver()) return false;
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
    if (gameOverMsg || game.isGameOver()) return;
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
    if (gameOverMsg) return gameOverMsg;
    if (game.isCheckmate()) {
      const winner = game.turn() === 'w' ? 'Black' : 'White';
      return `Checkmate! ${winner} wins.`;
    }
    if (game.isDraw()) return "Draw";
    if (role === 'Spectator') return `${game.turn() === 'w' ? 'White' : 'Black'}'s Turn`;
    
    const isMyTurn = (role === 'White' && game.turn() === 'w') || (role === 'Black' && game.turn() === 'b');
    return isMyTurn ? "Your Turn" : "Opponent's Turn";
  };

  const isGameOver = game.isGameOver() || !!gameOverMsg;
  let endStatusText = "";
  if (game.isCheckmate()) {
    const winner = game.turn() === 'w' ? 'Black' : 'White';
    endStatusText = `Checkmate! ${winner} wins.`;
  } else if (game.isDraw() || game.isStalemate()) {
    endStatusText = "Game ended in a draw.";
  } else if (gameOverMsg) {
    endStatusText = gameOverMsg;
  }

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

          {(role === 'White' || role === 'Black') && !gameOverMsg && !game.isGameOver() && (
            <div className="flex gap-3">
              <button 
                onClick={() => {
                  if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ type: 'drawOffer' }));
                    showError("Draw offer sent.");
                  }
                }}
                className="flex-1 glass bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-xl text-sm font-semibold transition-colors border-slate-600"
              >
                🤝 Offer Draw
              </button>
              <button 
                onClick={() => setShowResignConfirm(true)}
                className="flex-1 glass bg-red-900/30 hover:bg-red-800/40 text-red-300 py-2 rounded-xl text-sm font-semibold transition-colors border-red-900/50"
              >
                🏳️ Resign
              </button>
            </div>
          )}

          {drawOfferFrom && (
            <div className="glass rounded-xl p-4 flex flex-col gap-3 border-yellow-500/30 bg-yellow-500/10 shadow-lg">
              <p className="text-sm font-medium text-yellow-100 text-center">🤝 {drawOfferFrom} offered a draw.</p>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    wsRef.current?.send(JSON.stringify({ type: 'drawAccept' }));
                    setDrawOfferFrom(null);
                  }}
                  className="flex-1 bg-green-600/80 hover:bg-green-500/80 text-white py-1.5 rounded-lg text-sm font-semibold border border-green-500"
                >
                  Accept
                </button>
                <button 
                  onClick={() => {
                    wsRef.current?.send(JSON.stringify({ type: 'drawReject' }));
                    setDrawOfferFrom(null);
                  }}
                  className="flex-1 bg-slate-700/80 hover:bg-slate-600/80 text-white py-1.5 rounded-lg text-sm font-semibold border border-slate-600"
                >
                  Reject
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Opponent Info */}
        <div className="flex items-center justify-between glass rounded-xl px-4 py-2">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs
                ${role === 'White' ? 'bg-slate-800 border-2 border-slate-600 text-white' : 
                  'bg-slate-200 border-2 border-white text-slate-900'}
            `}>
              {role === 'White' ? 'B' : 'W'}
            </div>
            <div className="flex items-center gap-3">
              <p className="text-sm font-medium text-slate-300">
                {role === 'White' ? 'Black Player' : role === 'Black' ? 'White Player' : 'Black Player'}
              </p>
              <div className="flex gap-0.5">
                {(role === 'White' || role === 'Spectator' ? captured.w : captured.b).map((p, i) => (
                  <span 
                    key={i} 
                    className={`text-lg leading-none ${ (role === 'White' || role === 'Spectator') ? 'text-white' : 'text-slate-900'}`}
                    style={{ filter: (role === 'White' || role === 'Spectator') ? 'drop-shadow(0 0 1px black)' : 'none' }}
                  >
                    {PIECE_ICONS[p]}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Board Container */}
        <div className="relative rounded shadow-2xl shadow-black border-4 border-[#1a1a1a]">
          {showResignConfirm && !isGameOver && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded">
              <div className="glass bg-slate-900/90 p-6 rounded-xl border border-slate-700 max-w-[80%] w-full mx-4 shadow-2xl flex flex-col items-center text-center">
                <div className="text-4xl mb-3">🏳️</div>
                <h3 className="text-xl font-bold text-white mb-2">Resign Game?</h3>
                <p className="text-sm text-slate-300 mb-6">Are you sure you want to resign? You will immediately lose the game.</p>
                <div className="flex gap-3 w-full">
                  <button 
                    onClick={() => setShowResignConfirm(false)}
                    className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => {
                      wsRef.current?.send(JSON.stringify({ type: 'resign' }));
                      setShowResignConfirm(false);
                    }}
                    className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg font-medium transition-colors shadow-lg shadow-red-900/20"
                  >
                    Yes, Resign
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Game Over Popup */}
          {isGameOver && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded">
              <div className="glass bg-slate-900/90 p-6 rounded-xl border border-slate-700 max-w-[85%] w-full mx-4 shadow-2xl flex flex-col items-center text-center">
                <div className="text-5xl mb-4">🏆</div>
                <h3 className="text-2xl font-bold text-white mb-2">Game Over</h3>
                <p className="text-lg text-slate-300 mb-6">{endStatusText}</p>
                
                {(role === 'White' || role === 'Black') && (
                  <div className="w-full flex flex-col gap-3">
                    {restartOfferFrom ? (
                      <>
                        <p className="text-sm text-yellow-200">{restartOfferFrom} wants a rematch.</p>
                        <div className="flex gap-2 w-full">
                          <button 
                            onClick={() => {
                              wsRef.current?.send(JSON.stringify({ type: 'restartAccept' }));
                            }}
                            className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg font-medium transition-colors"
                          >
                            Accept
                          </button>
                          <button 
                            onClick={() => {
                              wsRef.current?.send(JSON.stringify({ type: 'restartReject' }));
                              setRestartOfferFrom(null);
                            }}
                            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg font-medium transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      </>
                    ) : waitingForRestart ? (
                      <div className="py-2 bg-slate-800/50 rounded-lg border border-slate-700">
                        <p className="text-sm text-slate-300">Waiting for opponent...</p>
                      </div>
                    ) : (
                      <button 
                        onClick={() => {
                          wsRef.current?.send(JSON.stringify({ type: 'restartOffer' }));
                          setWaitingForRestart(true);
                        }}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-bold transition-colors shadow-lg shadow-blue-900/20"
                      >
                        🔄 Offer Rematch
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          
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
        <div className="flex items-center justify-between glass rounded-xl px-4 py-2">
          <div className="flex items-center gap-3">
             <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs
                ${role === 'White' ? 'bg-slate-200 border-2 border-white text-slate-900' : 
                  role === 'Black' ? 'bg-slate-800 border-2 border-slate-600 text-white' : 
                  'bg-slate-200 border-2 border-white text-slate-900'}
             `}>
               {role === 'White' ? 'W' : role === 'Black' ? 'B' : 'W'}
             </div>
             <div className="flex items-center gap-3">
               <div>
                 <p className="text-xs text-slate-500 leading-none mb-0.5">{role === 'Spectator' ? 'Player' : 'You'}</p>
                 <p className="text-sm font-semibold text-white">
                   {role === 'Spectator' ? 'White Player' : myDisplayName}
                 </p>
               </div>
               <div className="flex gap-0.5">
                {(role === 'White' || role === 'Spectator' ? captured.b : captured.w).map((p, i) => (
                  <span 
                    key={i} 
                    className={`text-lg leading-none ${ (role === 'White' || role === 'Spectator') ? 'text-slate-900' : 'text-white'}`}
                    style={{ filter: (role === 'White' || role === 'Spectator') ? 'none' : 'drop-shadow(0 0 1px black)' }}
                  >
                    {PIECE_ICONS[p]}
                  </span>
                ))}
              </div>
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

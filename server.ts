import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';

async function startServer() {
  const app = express();
  const server = createServer(app);
  const PORT = 3000;

  // Real-time Chat and Chess Logic Settings
  let clients: { ws: WebSocket; role: string; id: number; spectatorNumber: number | null }[] = [];
  let connectionCount = 0;
  let spectatorCount = 0; // Total count of spectators ever joined
  
  // Game State
  // Default start FEN
  let currentFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    connectionCount++;
    const id = connectionCount;
    
    let role = 'Spectator';
    let spectatorNumber: number | null = null;

    // Count current active White/Black
    const hasWhite = clients.some(c => c.role === 'White');
    const hasBlack = clients.some(c => c.role === 'Black');

    if (!hasWhite) {
      role = 'White';
    } else if (!hasBlack) {
      role = 'Black';
    } else {
      spectatorCount++;
      spectatorNumber = spectatorCount;
    }
    
    // Add to clients
    clients.push({ ws, role, id, spectatorNumber });
    
    // Send initial state to the newly connected client
    ws.send(JSON.stringify({
      type: 'init',
      role,
      spectatorNumber,
      fen: currentFen,
      spectators: getSpectatorList()
    }));

    // Broadcast system message
    const displayName = role === 'Spectator' ? `Spectator ${spectatorNumber}` : role;
    broadcast({
      type: 'chat',
      message: `${displayName} joined the game.`,
      sender: 'System',
      role: 'System'
    });

    // Notify everyone of updated spectator list
    broadcastSpectatorUpdate();

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        switch (data.type) {
          case 'move':
            // Only White or Black can move
            if (role === 'White' || role === 'Black') {
              currentFen = data.fen;
              // Broadcast move to all
              broadcast({
                type: 'updateBoard',
                fen: currentFen,
                lastMove: data.move // Include move details for highlighting
              });
            }
            break;
            
          case 'chat':
            broadcast({
              type: 'chat',
              message: data.message,
              sender: role === 'Spectator' ? `Spectator ${spectatorNumber}` : role,
              role,
              spectatorNumber
            });
            break;

          case 'drawOffer':
            if (role === 'White' || role === 'Black') {
              broadcast({ type: 'drawOffer', sender: role });
            }
            break;

          case 'drawAccept':
            if (role === 'White' || role === 'Black') {
              broadcast({ type: 'drawAccept' });
              broadcast({
                type: 'chat',
                message: 'Game ended in a draw by agreement.',
                sender: 'System',
                role: 'System'
              });
            }
            break;

          case 'drawReject':
            if (role === 'White' || role === 'Black') {
              broadcast({ type: 'drawReject', sender: role });
            }
            break;

          case 'resign':
            if (role === 'White' || role === 'Black') {
              broadcast({ type: 'resign', sender: role });
              const winner = role === 'White' ? 'Black' : 'White';
              broadcast({
                type: 'chat',
                message: `${role} resigned. ${winner} wins!`,
                sender: 'System',
                role: 'System'
              });
            }
            break;

          case 'restartOffer':
            if (role === 'White' || role === 'Black') {
              broadcast({ type: 'restartOffer', sender: role });
            }
            break;

          case 'restartAccept':
            if (role === 'White' || role === 'Black') {
              currentFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
              broadcast({
                type: 'restartGame',
                fen: currentFen
              });
              broadcast({
                type: 'chat',
                message: 'Game restarted by agreement.',
                sender: 'System',
                role: 'System'
              });
            }
            break;

          case 'restartReject':
            if (role === 'White' || role === 'Black') {
              broadcast({ type: 'restartReject', sender: role });
            }
            break;
        }
      } catch (err) {
        console.error('Failed to parse WS message', err);
      }
    });

    ws.on('close', () => {
      clients = clients.filter(c => c.ws !== ws);
      const displayName = role === 'Spectator' ? `Spectator ${spectatorNumber}` : role;
      broadcast({
        type: 'chat',
        message: `${displayName} has left the game.`,
        sender: 'System',
        role: 'System'
      });
      
      broadcastSpectatorUpdate();
    });
  });

  function getSpectatorList() {
    return clients
      .filter(c => c.role === 'Spectator')
      .map(c => `Spectator ${c.spectatorNumber}`)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  function broadcastSpectatorUpdate() {
    broadcast({
      type: 'spectatorUpdate',
      spectators: getSpectatorList()
    });
  }

  function broadcast(data: any) {
    const message = JSON.stringify(data);
    clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    });
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // For Production / start script
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

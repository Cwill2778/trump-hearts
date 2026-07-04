const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const HeartsGame = require('./game');
const TournamentManager = require('./tournament');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});
const prisma = new PrismaClient({});

app.use(cors());
app.use(express.json());

// Serve static frontend files in production
app.use(express.static(path.join(__dirname, '../frontend/dist')));

const JWT_SECRET = process.env.JWT_SECRET || 'tremendous_secret_key_nobody_knows';

// --- AUTHENTICATION ROUTES ---

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required. Come on!' });
    }
    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already taken. Pick a better one, believe me.' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { username, password: hashedPassword, coins: 25000 }
    });
    res.json({ message: 'Registration tremendous! User created successfully.', userId: user.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error. Very sad!' });
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return res.status(401).json({ error: 'Wrong credentials. Fake news!' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Wrong credentials. Fake news!' });
    }
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, username: user.username, wins: user.wins, losses: user.losses, coins: user.coins });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error. Very sad!' });
  }
});

// Middleware for JWT auth on routes
const auth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) return res.sendStatus(403);
      req.user = user;
      next();
    });
  } else {
    res.sendStatus(401);
  }
};

// --- PROFILE & STORE ROUTES ---

app.get('/profile', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    const friends = await prisma.friendship.findMany({
      where: { userId: user.id, status: 'ACCEPTED' },
      include: { friend: { select: { id: true, username: true, wins: true, losses: true } } }
    });
    const requests = await prisma.friendship.findMany({
      where: { friendId: user.id, status: 'PENDING' },
      include: { user: { select: { id: true, username: true } } }
    });
    res.json({ user, friends, requests });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/store/buy_coins', auth, async (req, res) => {
  try {
    // Mocking $0.99 purchase of 25,000 coins
    const updated = await prisma.user.update({
      where: { id: req.user.userId },
      data: { coins: { increment: 25000 } }
    });
    res.json({ success: true, coins: updated.coins });
  } catch (err) {
    res.status(500).json({ error: 'Transaction failed' });
  }
});

app.post('/friends/request', auth, async (req, res) => {
  const { friendUsername } = req.body;
  try {
    const target = await prisma.user.findUnique({ where: { username: friendUsername } });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.id === req.user.userId) return res.status(400).json({ error: 'Cannot add yourself' });
    
    // Check existing
    const existing = await prisma.friendship.findFirst({
      where: { userId: req.user.userId, friendId: target.id }
    });
    if (existing) return res.status(400).json({ error: 'Request already exists or is accepted' });

    await prisma.friendship.create({
      data: { userId: req.user.userId, friendId: target.id, status: 'PENDING' }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error sending request' });
  }
});

app.post('/friends/accept', auth, async (req, res) => {
  const { requestId } = req.body;
  try {
    const reqObj = await prisma.friendship.findUnique({ where: { id: requestId } });
    if (!reqObj || reqObj.friendId !== req.user.userId) return res.status(403).json({ error: 'Invalid request' });
    
    // Accept it
    await prisma.friendship.update({
      where: { id: requestId },
      data: { status: 'ACCEPTED' }
    });
    // Create reciprocal
    await prisma.friendship.create({
      data: { userId: req.user.userId, friendId: reqObj.userId, status: 'ACCEPTED' }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error accepting request' });
  }
});

// --- SOCKET.IO GAME LOGIC ---

// Simple state for lobbies
const lobbies = {};

// We pass the lobbies reference so TournamentManager can register its games
const tournamentManager = new TournamentManager(io, lobbies);

const getGameStateForPlayer = (game, playerId) => {
  return {
    gameState: game.gameState,
    roundNumber: game.roundNumber,
    players: game.players.map(p => ({
      id: p.id,
      username: p.username,
      isBot: p.isBot
    })),
    hand: game.hands[playerId] || [],
    scores: game.scores,
    roundScores: game.roundScores,
    currentTrick: game.currentTrick,
    turnIndex: game.turnIndex,
    heartsBroken: game.heartsBroken,
    trickLeaderIndex: game.trickLeaderIndex,
    passDir: game.roundNumber % 4
  };
};

const broadcastGameState = (game, roomId) => {
  game.players.forEach(p => {
    if (!p.isBot) {
      io.to(p.id).emit('game_update', getGameStateForPlayer(game, p.id));
    }
  });
  handleBotTurns(game, roomId);
};

// Also expose it so TournamentManager can trigger bot turns
tournamentManager.broadcastGameState = broadcastGameState;

const handleBotTurns = (game, roomId) => {
  if (game.gameState === 'PASSING') {
    game.players.filter(p => p.isBot).forEach(bot => {
      if (!game.passedCards[bot.id]) {
        const hand = game.hands[bot.id];
        const cardsToPass = hand.slice(0, 3);
        const res = game.passCards(bot.id, cardsToPass);
        if (res) {
          io.to(roomId).emit('chat_message', { system: true, text: 'Cards passed. The art of the deal!' });
          broadcastGameState(game, roomId);
        }
      }
    });
  } else if (game.gameState === 'PLAYING' && game.currentTrick.length < 4) {
    const activePlayer = game.players[game.turnIndex];
    if (activePlayer && activePlayer.isBot) {
      setTimeout(() => {
        if (game.gameState !== 'PLAYING' || !game.players[game.turnIndex] || game.players[game.turnIndex].id !== activePlayer.id) return;
        const hand = game.hands[activePlayer.id];
        const validCards = hand.filter(c => game.isValidPlay(activePlayer.id, c));
        const cardToPlay = validCards[Math.floor(Math.random() * validCards.length)];
        
        if (cardToPlay) {
          const res = game.playCard(activePlayer.id, cardToPlay);
          broadcastGameState(game, roomId);

          if (res === 'TRICK_OVER') {
            setTimeout(() => {
              if (game.gameState === 'ROUND_OVER') {
                io.to(roomId).emit('chat_message', { system: true, text: 'Round over! Tremendous plays.' });
                setTimeout(() => {
                  game.startRound();
                  broadcastGameState(game, roomId);
                }, 5000);
              } else if (game.gameState === 'GAME_OVER') {
                io.to(roomId).emit('chat_message', { system: true, text: 'Game over! We won bigly!' });
                broadcastGameState(game, roomId);
              } else {
                game.currentTrick = [];
                broadcastGameState(game, roomId);
              }
            }, 2000);
          }
        }
      }, 1000);
    }
  }
};

const emitLobbyList = (socketOrIo) => {
  const lobbyList = Object.keys(lobbies).map(id => ({
    roomId: id,
    players: lobbies[id].players.length,
    status: lobbies[id].gameState
  })).filter(l => l.players > 0 && l.players < 4 && l.status === 'LOBBY'); 
  
  socketOrIo.emit('lobby_list_update', lobbyList);
};

io.on('connection', (socket) => {
  console.log('A tremendous user connected:', socket.id);

  socket.on('get_lobbies', () => {
    emitLobbyList(socket);
  });

  socket.on('join_lobby', ({ roomId, username }) => {
    if (!lobbies[roomId]) {
      lobbies[roomId] = new HeartsGame(roomId);
    }
    const game = lobbies[roomId];
    if (game.players.length >= 4) {
      return socket.emit('error_message', 'Lobby is full. Sad!');
    }
    if (game.gameState !== 'LOBBY') {
      return socket.emit('error_message', 'Game already started!');
    }

    const joined = game.addPlayer({ id: socket.id, username });
    if (joined) {
      socket.join(roomId);
      socket.roomId = roomId;
      socket.username = username;
      io.to(roomId).emit('lobby_update', game.players.map(p => ({ id: p.id, username: p.username, isBot: p.isBot })));
      io.to(roomId).emit('chat_message', { system: true, text: `${username} joined! We have the best players, don't we folks?` });
      emitLobbyList(io);
    }
  });

  socket.on('play_now', ({ username }) => {
    const availableLobby = Object.values(lobbies).find(l => l.players.length < 4 && l.gameState === 'LOBBY');
    const roomId = availableLobby ? availableLobby.roomId : `table_${Math.floor(Math.random()*10000)}`;
    
    if (!lobbies[roomId]) {
      lobbies[roomId] = new HeartsGame(roomId);
    }
    
    const game = lobbies[roomId];
    game.addPlayer({ id: socket.id, username });
    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;
    
    socket.emit('room_joined', roomId);
    io.to(roomId).emit('lobby_update', game.players.map(p => ({ id: p.id, username: p.username, isBot: p.isBot })));
    emitLobbyList(io);
  });

  socket.on('join_tournament', async ({ userId }) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        socket.user = user;
        tournamentManager.joinQueue(socket, user);
      }
    } catch(e) {
      console.error(e);
    }
  });

  socket.on('leave_tournament', () => {
    tournamentManager.leaveQueue(socket);
  });

  socket.on('fill_tournament_bots', () => {
    const botsNeeded = 16 - tournamentManager.queue.length;
    for (let i = 0; i < botsNeeded; i++) {
      const botSocket = {
        id: `bot_t_${Math.random()}`,
        emit: () => {}, // mock emit
        join: () => {},
        leave: () => {}
      };
      const botUser = {
        id: `bot_user_${Math.random()}`,
        username: `MAGA Bot ${Math.floor(Math.random() * 1000)}`,
        isBot: true
      };
      tournamentManager.joinQueue(botSocket, botUser);
    }
  });

  socket.on('add_bot', () => {
    const roomId = socket.roomId;
    if (!roomId) return;
    const game = lobbies[roomId];
    if (game && game.players.length < 4) {
      const botNames = ['J.D. Vance', 'Elon Musk', 'Kid Rock', 'Hulk Hogan', 'Rudy G'];
      const name = botNames[game.players.length % botNames.length] + ' (Bot)';
      game.addPlayer({ id: `bot_${Math.random()}`, username: name, isBot: true });
      io.to(roomId).emit('lobby_update', game.players.map(p => ({ id: p.id, username: p.username, isBot: p.isBot })));
      io.to(roomId).emit('chat_message', { system: true, text: `${name} joined. A tremendous machine!` });
      emitLobbyList(io);
    }
  });

  socket.on('start_game', () => {
    const roomId = socket.roomId;
    if (!roomId) return;
    const game = lobbies[roomId];
    if (game && game.startGame()) {
      io.to(roomId).emit('chat_message', { system: true, text: 'The game has started. It will be a tremendous game, believe me.' });
      broadcastGameState(game, roomId);
      emitLobbyList(io);
    } else {
      socket.emit('error_message', 'Need 4 players to start. We need more winners!');
    }
  });

  socket.on('pass_cards', (cards) => {
    const roomId = socket.roomId;
    if (!roomId) return;
    const game = lobbies[roomId];
    if (!game) return;
    
    if (game.passCards(socket.id, cards)) {
      if (game.gameState === 'PLAYING') {
         io.to(roomId).emit('chat_message', { system: true, text: 'Cards passed. The art of the deal!' });
         broadcastGameState(game, roomId);
      } else {
         socket.emit('chat_message', { system: true, text: 'Waiting for others to pass. Slow!' });
         handleBotTurns(game, roomId);
      }
    } else {
      socket.emit('error_message', 'Invalid pass. Fake news!');
    }
  });

  socket.on('play_card', (card) => {
    const roomId = socket.roomId;
    if (!roomId) return;
    const game = lobbies[roomId];
    if (!game) return;
    
    if (game.currentTrick.length < 4) {
      const res = game.playCard(socket.id, card);
      if (res === false) {
        socket.emit('error_message', 'Invalid play. Read the rules, folks!');
      } else {
        broadcastGameState(game, roomId);

        if (res === 'TRICK_OVER') {
          setTimeout(() => {
             if (game.gameState === 'ROUND_OVER') {
                io.to(roomId).emit('chat_message', { system: true, text: 'Round over! Tremendous plays.' });
                setTimeout(() => {
                  game.startRound();
                  broadcastGameState(game, roomId);
                }, 3000);
             } else if (game.gameState === 'GAME_OVER') {
                io.to(roomId).emit('chat_message', { system: true, text: 'Game over! We won bigly!' });
                broadcastGameState(game, roomId); // Force game_over broadcast update
             } else {
                game.currentTrick = [];
                broadcastGameState(game, roomId);
             }
          }, 2000);
        }
      }
    }
  });

  socket.on('chat_message', (text) => {
    const roomId = socket.roomId;
    if (roomId) {
      io.to(roomId).emit('chat_message', { username: socket.username, text });
    }
  });

  socket.on('leave_game', () => {
    const roomId = socket.roomId;
    if (roomId && lobbies[roomId]) {
       lobbies[roomId].removePlayer(socket.id);
       io.to(roomId).emit('lobby_update', lobbies[roomId].players.map(p => ({ id: p.id, username: p.username, isBot: p.isBot })));
       io.to(roomId).emit('chat_message', { system: true, text: `${socket.username} left the game. Sad!` });
       if (lobbies[roomId].players.length === 0) {
         delete lobbies[roomId];
       }
       socket.leave(roomId);
       socket.roomId = null;
       emitLobbyList(io);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected. Loser!', socket.id);
    tournamentManager.leaveQueue(socket);
    
    const roomId = socket.roomId;
    if (roomId && lobbies[roomId]) {
       lobbies[roomId].removePlayer(socket.id);
       io.to(roomId).emit('lobby_update', lobbies[roomId].players.map(p => ({ id: p.id, username: p.username, isBot: p.isBot })));
       io.to(roomId).emit('chat_message', { system: true, text: `${socket.username} left the game. Sad!` });
       if (lobbies[roomId].players.length === 0) {
         delete lobbies[roomId];
       }
       emitLobbyList(io);
    }
  });
});

// Catch-all to serve React app
app.use((req, res, next) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Great American Hearts Server listening on port ${PORT}`);
});

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const { getCardsToPass, getCardToPlay } = require('./botLogic');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
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
app.use(express.json({ limit: '10mb' }));

// Serve static frontend files in production
app.use(express.static(path.join(__dirname, '../frontend/dist')));

const JWT_SECRET = process.env.JWT_SECRET || 'tremendous_secret_key_nobody_knows';

// --- AUTHENTICATION ROUTES ---

app.post('/auth/google', async (req, res) => {
  const { credential, clientId } = req.body;
  try {
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, name: username, picture: avatarUrl } = payload;
    
    // find or create user
    let user = await prisma.user.findUnique({ where: { googleId } });
    if (!user) {
      // check if username exists
      let finalUsername = username;
      let counter = 1;
      while(await prisma.user.findUnique({ where: { username: finalUsername } })) {
         finalUsername = `${username}${counter}`;
         counter++;
      }
      user = await prisma.user.create({
        data: { username: finalUsername, googleId, avatarUrl, coins: 25000 }
      });
    } else if (user.avatarUrl !== avatarUrl) {
      user = await prisma.user.update({ where: { id: user.id }, data: { avatarUrl } });
    }
    
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, username: user.username, wins: user.wins, losses: user.losses, coins: user.coins, avatarUrl: user.avatarUrl });
  } catch(error) {
    console.error(error);
    res.status(401).json({ error: 'Google Auth failed' });
  }
});

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
    if (!user || !user.password) {
      return res.status(401).json({ error: 'Wrong credentials. Fake news!' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Wrong credentials. Fake news!' });
    }
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, username: user.username, wins: user.wins, losses: user.losses, coins: user.coins, avatarUrl: user.avatarUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error. Very sad!' });
  }
});

app.post('/upload-avatar', async (req, res) => {
  const { token, avatarUrl } = req.body;
  try {
    if (!token || !avatarUrl) return res.status(400).json({ error: 'Missing data' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.update({
      where: { id: decoded.userId },
      data: { avatarUrl }
    });
    res.json({ message: 'Avatar updated successfully', avatarUrl: user.avatarUrl });
  } catch (error) {
    console.error(error);
    res.status(401).json({ error: 'Unauthorized or server error' });
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

app.get('/leaderboard', async (req, res) => {
  try {
    const topPlayers = await prisma.user.findMany({
      take: 20,
      orderBy: [
        { wins: 'desc' },
        { coins: 'desc' }
      ],
      select: { id: true, username: true, wins: true, losses: true, coins: true, avatarUrl: true }
    });
    res.json(topPlayers);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/history', auth, async (req, res) => {
  try {
    const history = await prisma.matchPlayer.findMany({
      where: { userId: req.user.userId },
      include: { 
        match: {
          include: { players: true }
        }
      },
      orderBy: { match: { playedAt: 'desc' } },
      take: 10
    });
    res.json(history);
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
    console.error('Buy coins error:', err);
    res.status(500).json({ error: 'Transaction failed', details: err.message });
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
      isBot: p.isBot,
      avatarUrl: p.avatarUrl
    })),
    handCounts: Object.fromEntries(Object.entries(game.hands).map(([k, v]) => [k, v.length])),
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

const handleGameOver = async (game, roomId) => {
  const minScore = Math.min(...game.players.map(p => game.scores[p.id]));
  let winnerUsername = null;
  
  // Update wins/losses and build match player data
  const matchPlayersData = [];
  for (const p of game.players) {
    const isWinner = game.scores[p.id] === minScore;
    if (isWinner && !winnerUsername) winnerUsername = p.username;

    let dbUserId = null;
    if (!p.isBot) {
      try {
        const user = await prisma.user.findUnique({ where: { username: p.username } });
        if (user) {
          dbUserId = user.id;
          if (isWinner) {
            await prisma.user.update({ where: { id: dbUserId }, data: { wins: { increment: 1 } } });
          } else {
            await prisma.user.update({ where: { id: dbUserId }, data: { losses: { increment: 1 } } });
          }
        }
      } catch(e) { console.error('Win/loss update error:', e); }
    }
    
    matchPlayersData.push({
      userId: dbUserId,
      username: p.username,
      score: game.scores[p.id],
      isWinner
    });
  }

  // Save match history
  try {
    await prisma.matchHistory.create({
      data: {
        roomId,
        winnerUsername,
        players: {
          create: matchPlayersData
        }
      }
    });
  } catch(e) {
    console.error('Match history save error:', e);
  }
};

const handleBotTurns = (game, roomId) => {
  if (game.gameState === 'PASSING') {
      game.players.filter(p => p.isBot || p.isDisconnected).forEach(bot => {
        if (!game.passedCards[bot.id]) {
          const hand = game.hands[bot.id];
          const cardsToPass = getCardsToPass(hand);
          const res = game.passCards(bot.id, cardsToPass);
          if (res) {
            io.to(roomId).emit('chat_message', { system: true, text: 'Cards passed. The art of the deal!' });
            broadcastGameState(game, roomId);
          }
        }
      });
    } else if (game.gameState === 'PLAYING' && game.currentTrick.length < 4) {
      const activePlayer = game.players[game.turnIndex];
      if (activePlayer && (activePlayer.isBot || activePlayer.isDisconnected)) {
        setTimeout(() => {
          if (game.gameState !== 'PLAYING' || !game.players[game.turnIndex] || game.players[game.turnIndex].id !== activePlayer.id) return;
          const hand = game.hands[activePlayer.id];
          const validCards = hand.filter(c => game.isValidPlay(activePlayer.id, c));
          const cardToPlay = getCardToPlay(hand, validCards, game.currentTrick, game.heartsBroken);
          
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
                handleGameOver(game, roomId);
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

  socket.on('join_lobby', ({ roomId, username, avatarUrl }) => {
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

    const joined = game.addPlayer({ id: socket.id, username, avatarUrl });
    if (joined) {
      socket.join(roomId);
      socket.roomId = roomId;
      socket.username = username;
      io.to(roomId).emit('lobby_update', game.players.map(p => ({ id: p.id, username: p.username, isBot: p.isBot, avatarUrl: p.avatarUrl })));
      io.to(roomId).emit('chat_message', { system: true, text: `${username} joined! We have the best players, don't we folks?` });
      emitLobbyList(io);
    }
  });

  socket.on('play_now', ({ username, avatarUrl }) => {
    const availableLobby = Object.values(lobbies).find(l => l.players.length < 4 && l.gameState === 'LOBBY');
    const roomId = availableLobby ? availableLobby.roomId : `table_${Math.floor(Math.random()*10000)}`;
    
    if (!lobbies[roomId]) {
      lobbies[roomId] = new HeartsGame(roomId);
    }
    
    const game = lobbies[roomId];
    game.addPlayer({ id: socket.id, username, avatarUrl });
    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;
    
    socket.emit('room_joined', roomId);
    io.to(roomId).emit('lobby_update', game.players.map(p => ({ id: p.id, username: p.username, isBot: p.isBot, avatarUrl: p.avatarUrl })));
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
      const botNames = ['Jesse', 'Jason', 'Logan', 'Steve', 'Terry', 'Justin', 'Marissa', 'Chelsea', 'Amy', 'Jessica', 'Jennifer'];
      const botName = botNames[Math.floor(Math.random() * botNames.length)];
      const botUser = {
        id: `bot_user_${Math.random()}`,
        username: botName,
        isBot: true,
        avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${botName}`
      };
      tournamentManager.joinQueue(botSocket, botUser);
    }
  });

  socket.on('add_bot', () => {
    const roomId = socket.roomId;
    if (!roomId) return;
    const game = lobbies[roomId];
    if (game && game.players.length < 4) {
      const botNames = ['Jesse', 'Jason', 'Logan', 'Steve', 'Terry', 'Justin', 'Marissa', 'Chelsea', 'Amy', 'Jessica', 'Jennifer'];
      const name = botNames[Math.floor(Math.random() * botNames.length)];
      game.addPlayer({ id: `bot_${Math.random()}`, username: name, isBot: true, avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${name.replace(' ', '')}` });
      io.to(roomId).emit('lobby_update', game.players.map(p => ({ id: p.id, username: p.username, isBot: p.isBot, avatarUrl: p.avatarUrl })));
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
    
    const p = game.players.find(pl => pl.id === socket.id || pl.currentSocketId === socket.id);
    if (!p) return;

    const result = game.passCards(p.id, cards);
    if (result === false) {
      // passCards returns false ONLY if validation fails (wrong count, cards not in hand)
      socket.emit('error_message', 'Invalid pass. Fake news!');
    } else if (result === true) {
      // All 4 players have passed, game transitions to PLAYING
      io.to(roomId).emit('chat_message', { system: true, text: 'Cards passed. The art of the deal!' });
      broadcastGameState(game, roomId);
    } else {
      // This player's pass was accepted, waiting for others
      socket.emit('chat_message', { system: true, text: 'Cards passed! Waiting for others. Slow!' });
      handleBotTurns(game, roomId);
    }
  });

  socket.on('play_card', (card) => {
    const roomId = socket.roomId;
    if (!roomId) return;
    const game = lobbies[roomId];
    if (!game) return;
    
    const p = game.players.find(pl => pl.id === socket.id || pl.currentSocketId === socket.id);
    if (!p) return;

    if (game.currentTrick.length < 4) {
      const res = game.playCard(p.id, card);
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
                broadcastGameState(game, roomId);
                handleGameOver(game, roomId);
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

  socket.on('webrtc_signal', ({ to, signal }) => {
    // Forward the WebRTC signal to the specific peer
    io.to(to).emit('webrtc_signal', {
      from: socket.id,
      signal
    });
  });

  socket.on('webrtc_ready', () => {
    const roomId = socket.roomId;
    if (roomId) {
      socket.to(roomId).emit('webrtc_ready', socket.id);
    }
  });

  socket.on('ptt_active', (isActive) => {
    const roomId = socket.roomId;
    if (roomId) {
      socket.to(roomId).emit('ptt_active', { socketId: socket.id, isActive });
    }
  });

  socket.on('leave_game', () => {
    const roomId = socket.roomId;
    if (roomId && lobbies[roomId]) {
       const game = lobbies[roomId];
       const p = game.players.find(player => player.id === socket.id || player.currentSocketId === socket.id);
       
       if (game.gameState === 'LOBBY' || game.players.length < 4) {
         // Still in lobby, safe to remove
         game.removePlayer(p ? p.id : socket.id);
         io.to(roomId).emit('lobby_update', game.players.map(pl => ({ id: pl.id, username: pl.username, isBot: pl.isBot, avatarUrl: pl.avatarUrl })));
         if (p) io.to(roomId).emit('chat_message', { system: true, text: `${p.username} left the game. Sad!` });
         if (game.players.length === 0) {
           delete lobbies[roomId];
         }
       } else if (p) {
         // Game is active — mark as disconnected, bot takes over
         p.isDisconnected = true;
         io.to(roomId).emit('chat_message', { system: true, text: `${p.username} left. A temporary bot is filling in!` });
         handleBotTurns(game, roomId);
       }
       socket.leave(roomId);
       socket.roomId = null;
       emitLobbyList(io);
    }
  });

  socket.on('check_reconnect', (data) => {
    const { username } = data;
    if (!username) return;

    let foundRoomId = null;
    let foundPlayerId = null;

    for (const [roomId, game] of Object.entries(lobbies)) {
      if (game.gameState !== 'LOBBY') {
        const p = game.players.find(pl => pl.username === username && pl.isDisconnected);
        if (p) {
          foundRoomId = roomId;
          foundPlayerId = p.id;
          break;
        }
      }
    }

    if (foundRoomId) {
      socket.emit('reconnect_available', { roomId: foundRoomId, originalId: foundPlayerId });
    }
  });

  socket.on('rejoin_game', (data) => {
    const { roomId, originalId } = data;
    if (lobbies[roomId]) {
      const game = lobbies[roomId];
      const p = game.players.find(pl => pl.id === originalId);
      if (p && p.isDisconnected) {
        p.isDisconnected = false;
        p.currentSocketId = socket.id;
        socket.roomId = roomId;
        socket.join(roomId);
        socket.join(originalId); // Join the old socket ID room to receive direct messages
        socket.emit('room_joined', roomId);
        
        io.to(roomId).emit('chat_message', { system: true, text: `${p.username} has reconnected! The bot is fired!` });
        broadcastGameState(game, roomId);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected. Loser!', socket.id);
    tournamentManager.leaveQueue(socket);
    
    const roomId = socket.roomId;
    if (roomId && lobbies[roomId]) {
       const game = lobbies[roomId];
       const p = game.players.find(player => player.id === socket.id || player.currentSocketId === socket.id);
       
       if (game.gameState === 'LOBBY' || game.players.length < 4) {
         // Still in lobby, just remove them
         game.removePlayer(p ? p.id : socket.id);
         io.to(roomId).emit('lobby_update', game.players.map(pl => ({ id: pl.id, username: pl.username, isBot: pl.isBot, avatarUrl: pl.avatarUrl })));
         if (p) io.to(roomId).emit('chat_message', { system: true, text: `${p.username} left the game. Sad!` });
         
         if (game.players.length === 0) {
           delete lobbies[roomId];
         }
       } else if (p) {
         // Game has started! Mark as disconnected and let the bot take over
         p.isDisconnected = true;
         io.to(roomId).emit('chat_message', { system: true, text: `${p.username} disconnected. A temporary bot is filling in!` });
         handleBotTurns(game, roomId); // Trigger bot takeover
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

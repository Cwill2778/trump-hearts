const HeartsGame = require('./game');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class TournamentManager {
  constructor(io, lobbies) {
    this.io = io;
    this.lobbies = lobbies;
    this.queue = []; // Array of { socket, user }
    this.activeTournaments = new Map();
    this.tournamentCounter = 1;
  }

  broadcastQueueUpdate() {
    const timeLeft = this.queueTimer ? Math.max(0, Math.floor((this.queueTimer - Date.now()) / 1000)) : null;
    const update = { 
      count: this.queue.length, 
      required: 16, 
      timeLeft,
      players: this.queue.map(p => ({ id: p.socket.id, username: p.user.username }))
    };
    this.queue.forEach(p => p.socket.emit('tournament_queue_update', update));
  }

  fillWithBotsAndStart() {
    this.timerInterval = null;
    this.queueTimer = null;
    const botsNeeded = 16 - this.queue.length;
    for (let i = 0; i < botsNeeded; i++) {
      const botSocket = {
        id: `bot_t_${Math.random()}`,
        emit: () => {}, join: () => {}, leave: () => {}
      };
      const botNames = ['Jesse', 'Jason', 'Logan', 'Steve', 'Terry', 'Justin', 'Marissa', 'Chelsea', 'Amy', 'Jessica', 'Jennifer'];
      const botName = botNames[Math.floor(Math.random() * botNames.length)];
      const botUser = {
        id: `bot_user_${Math.random()}`,
        username: botName,
        isBot: true,
        avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${botName}`
      };
      this.queue.push({ socket: botSocket, user: botUser });
    }
    this.startTournament();
  }

  async joinQueue(socket, user) {
    // Check if player has enough coins
    if (user.coins < 10000 && !user.isBot) {
      socket.emit('tournament_error', 'Not enough coins. Tremendous losers cannot afford this!');
      return;
    }

    // Check if already in queue
    if (this.queue.find(p => p.user.id === user.id)) {
      socket.emit('tournament_error', 'Already in the tournament queue.');
      return;
    }

    // Deduct coins (Skip for bots)
    let updatedUser = user;
    if (!user.isBot) {
      updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { coins: { decrement: 10000 } }
      });
    }

    this.queue.push({ socket, user: updatedUser });
    
    // Start 30 sec timer on first real player
    if (this.queue.length === 1 && !user.isBot) {
      this.queueTimer = Date.now() + 30000;
      this.timerInterval = setTimeout(() => {
        this.fillWithBotsAndStart();
      }, 30000);
    }
    
    this.broadcastQueueUpdate();

    // Check if tournament should start immediately (16 players)
    if (this.queue.length >= 16) {
      if (this.timerInterval) {
         clearTimeout(this.timerInterval);
         this.timerInterval = null;
         this.queueTimer = null;
      }
      this.startTournament();
    }
  }

  leaveQueue(socket) {
    const idx = this.queue.findIndex(p => p.socket.id === socket.id);
    if (idx !== -1) {
      // Refund
      const user = this.queue[idx].user;
      if (!user.isBot) {
        prisma.user.update({
          where: { id: user.id },
          data: { coins: { increment: 10000 } }
        }).catch(e => console.error(e));
      }
      
      this.queue.splice(idx, 1);
      
      if (this.queue.length === 0 && this.timerInterval) {
        clearTimeout(this.timerInterval);
        this.timerInterval = null;
        this.queueTimer = null;
      }
      
      this.broadcastQueueUpdate();
    }
  }

  startTournament() {
    const players = this.queue.splice(0, 16);
    const tId = `tourney_${this.tournamentCounter++}`;
    
    const tournament = {
      id: tId,
      round: 1,
      players: players, // All 16 initially
      tables: [], // Array of HeartsGame
      completedTables: 0,
      advancingPlayers: [] // Array of { socket, user }
    };

    this.activeTournaments.set(tId, tournament);
    
    players.forEach(p => {
      p.socket.join(tId);
      p.socket.emit('tournament_started', { tournamentId: tId, round: 1 });
    });

    this.startRound(tId);
  }

  startRound(tId) {
    const t = this.activeTournaments.get(tId);
    t.tables = [];
    t.completedTables = 0;
    t.advancingPlayers = [];

    const numTables = t.players.length / 4;

    for (let i = 0; i < numTables; i++) {
      const tablePlayers = t.players.slice(i * 4, i * 4 + 4);
      const roomId = `${tId}_table_${i+1}`;
      
      const game = new HeartsGame(roomId);
      this.lobbies[roomId] = game; // Expose for pass/play events
      
      tablePlayers.forEach((p, idx) => {
        p.socket.leave('lobby');
        p.socket.join(roomId);
        p.socket.roomId = roomId; // Need to set this!
        p.socket.emit('room_joined', roomId);
        game.addPlayer({ id: p.socket.id, username: p.user.username, isBot: p.user.isBot });
        // Map user object for later lookup
        game.players[idx].user = p.user;
        game.players[idx].socket = p.socket;
      });

      // Start game automatically since table is full
      game.startGame();
      this.broadcastGameState(game, roomId);

      // Wrap game's evaluateRound to intercept round/game end
      const originalEvaluateRound = game.evaluateRound.bind(game);
      game.evaluateRound = () => {
        originalEvaluateRound();
        this.broadcastGameState(game, roomId);
        this.broadcastBracketState(tId);
        
        // Check if game is completely over (someone reached 100 points)
        if (game.gameState === 'GAME_OVER') {
          this.handleTableComplete(tId, game);
        }
      };

      t.tables.push(game);
    }
    
    this.broadcastBracketState(tId);
  }

  broadcastBracketState(tId) {
    const t = this.activeTournaments.get(tId);
    if (!t) return;
    
    const bracketData = {
       tournamentId: tId,
       round: t.round,
       tables: t.tables.map(g => ({
          roomId: g.roomId,
          state: g.gameState,
          players: g.players.map(p => ({ 
             id: p.id, 
             username: p.username, 
             score: g.scores[p.id] || 0,
             isAdvancing: t.advancingPlayers.find(a => a.socket.id === p.id) ? true : false,
             isEliminated: g.gameState === 'GAME_OVER' && !t.advancingPlayers.find(a => a.socket.id === p.id)
          }))
       })),
    };
    
    this.io.to(tId).emit('tournament_bracket_update', bracketData);
  }

  handleTableComplete(tId, game) {
    const t = this.activeTournaments.get(tId);
    
    // Sort players by score ascending (lowest score wins)
    const sorted = [...game.players].sort((a, b) => game.scores[a.id] - game.scores[b.id]);
    
    // Top 2 advance
    const top2 = sorted.slice(0, 2);
    top2.forEach(p => {
      t.advancingPlayers.push({ socket: p.socket, user: p.user });
      p.socket.emit('tournament_message', 'You advanced to the next round! Tremendous!');
    });
    
    // Bottom 2 eliminated
    const bottom2 = sorted.slice(2, 4);
    bottom2.forEach(p => {
      p.socket.emit('tournament_eliminated', 'You have been eliminated. Sad!');
      p.socket.leave(game.roomId);
      p.socket.roomId = null;
    });

    delete this.lobbies[game.roomId];
    t.completedTables++;
    this.broadcastBracketState(tId);

    if (t.completedTables === t.tables.length) {
      this.advanceRound(tId);
    }
  }

  async advanceRound(tId) {
    const t = this.activeTournaments.get(tId);
    t.players = t.advancingPlayers;
    t.round++;

    if (t.round > 3) {
      // Tournament is over! The advancing players from the final table are our winners.
      const winner = t.players[0];
      const runnerUp = t.players[1];

      // Payouts — only update real users, skip bots
      if (winner && !winner.user.isBot) {
        try {
          await prisma.user.update({ where: { id: winner.user.id }, data: { coins: { increment: 100000 }, wins: { increment: 1 } } });
        } catch(e) { console.error('Winner payout error:', e); }
      }
      if (runnerUp && !runnerUp.user.isBot) {
        try {
          await prisma.user.update({ where: { id: runnerUp.user.id }, data: { coins: { increment: 25000 } } });
        } catch(e) { console.error('Runner-up payout error:', e); }
      }

      // Update losses for all eliminated real players
      // (They were already removed from t.players in previous rounds)

      if (winner) winner.socket.emit('tournament_won', { prize: 100000, message: 'YOU WON THE TOURNAMENT! YUGE WIN!' });
      if (runnerUp) runnerUp.socket.emit('tournament_won', { prize: 25000, message: 'You got 2nd place. Not bad.' });
      
      this.io.to(tId).emit('tournament_ended');
      this.activeTournaments.delete(tId);
      
    } else {
      // Next round
      this.io.to(tId).emit('tournament_message', `Round ${t.round} is starting!`);
      setTimeout(() => {
        this.startRound(tId);
      }, 5000);
    }
  }
}

module.exports = TournamentManager;

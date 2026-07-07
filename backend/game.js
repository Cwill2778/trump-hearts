class HeartsGame {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = []; // Array of { id: socketId, username: string, wins: 0, losses: 0 }
    this.gameState = 'LOBBY'; // LOBBY, PASSING, PLAYING, ROUND_OVER, GAME_OVER
    this.roundNumber = 0;
    this.hands = {}; // socketId -> Array of cards (e.g., '2C', 'AS')
    this.scores = {}; // socketId -> total score
    this.roundScores = {}; // socketId -> score for current round
    this.currentTrick = []; // Array of { player: socketId, card: '2C' }
    this.turnIndex = 0; // Index of player in this.players array
    this.heartsBroken = false;
    this.passedCards = {}; // socketId -> Array of cards to pass
    this.firstTrick = true;
    this.trickLeaderIndex = 0;
  }

  addPlayer(player) {
    if (this.players.length < 4 && !this.players.find(p => p.id === player.id)) {
      this.players.push(player);
      this.scores[player.id] = 0;
      return true;
    }
    return false;
  }

  removePlayer(playerId) {
    this.players = this.players.filter(p => p.id !== playerId);
    if (this.players.length === 0) {
      // Game should be destroyed if empty
    }
  }

  startGame() {
    if (this.players.length !== 4) return false;
    this.roundNumber = 1;
    this.startRound();
    return true;
  }

  startRound() {
    this.gameState = this.roundNumber % 4 === 0 ? 'PLAYING' : 'PASSING';
    this.hands = {};
    this.roundScores = {};
    this.penaltyPoints = {}; // To correctly track moon shooting independent of JD
    this.players.forEach(p => {
      this.roundScores[p.id] = 0;
      this.penaltyPoints[p.id] = 0;
      this.hands[p.id] = [];
    });
    this.currentTrick = [];
    this.playedCards = [];
    this.heartsBroken = false;
    this.passedCards = {};
    this.firstTrick = true;
    this.dealCards();
    
    if (this.gameState === 'PLAYING') {
      this.determineFirstTurn();
    }
  }

  dealCards() {
    const suits = ['C', 'D', 'S', 'H'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    let deck = [];
    for (let s of suits) {
      for (let r of ranks) {
        deck.push(r + s);
      }
    }
    // Shuffle
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    // Deal 13 to each
    for (let i = 0; i < 4; i++) {
      this.hands[this.players[i].id] = deck.slice(i * 13, (i + 1) * 13);
    }
  }

  passCards(playerId, cards) {
    if (this.gameState !== 'PASSING') return false;
    if (cards.length !== 3) return false;
    
    // Verify player has these cards
    const hand = this.hands[playerId];
    if (!cards.every(c => hand.includes(c))) return false;

    this.passedCards[playerId] = cards;

    // Remove passed cards from hand
    this.hands[playerId] = hand.filter(c => !cards.includes(c));

    // If everyone passed, execute pass
    if (Object.keys(this.passedCards).length === 4) {
      this.executePass();
      this.gameState = 'PLAYING';
      this.determineFirstTurn();
      return true; // passing complete
    }
    return 'WAITING'; // accepted, waiting for others
  }

  executePass() {
    const passDir = this.roundNumber % 4; // 1: Left, 2: Right, 3: Across
    let offsets = [0, 1, 3, 2]; // 1 -> index+1, 2 -> index+3 (which is right), 3 -> index+2
    const offset = offsets[passDir];

    for (let i = 0; i < 4; i++) {
      const fromPlayerId = this.players[i].id;
      const toIndex = (i + offset) % 4;
      const toPlayerId = this.players[toIndex].id;

      this.hands[toPlayerId] = [...this.hands[toPlayerId], ...this.passedCards[fromPlayerId]];
    }
  }

  determineFirstTurn() {
    // Player with 2 of Clubs starts
    for (let i = 0; i < 4; i++) {
      if (this.hands[this.players[i].id].includes('2C')) {
        this.turnIndex = i;
        this.trickLeaderIndex = i;
        break;
      }
    }
  }

  isValidPlay(playerId, card) {
    if (this.gameState !== 'PLAYING') return false;
    if (this.currentTrick.length >= 4) return false;
    if (this.players[this.turnIndex].id !== playerId) return false;
    const hand = this.hands[playerId];
    if (!hand.includes(card)) return false;

    const suit = card[1];
    
    if (this.currentTrick.length === 0) {
      if (this.firstTrick && card !== '2C') {
        // Must play 2C if it's the first trick
        if (hand.includes('2C')) return false; // This shouldn't happen by rules, person with 2C MUST lead it.
      }
      if (suit === 'H' && !this.heartsBroken) {
        // Can't lead hearts unless broken or only have hearts
        if (hand.some(c => c[1] !== 'H')) return false;
      }
      return true;
    }

    const leadSuit = this.currentTrick[0].card[1];
    const hasLeadSuit = hand.some(c => c[1] === leadSuit);

    if (hasLeadSuit && suit !== leadSuit) return false; // Must follow suit

    if (this.firstTrick && (suit === 'H' || card === 'QS')) {
      // Cannot play penalty cards on first trick, unless that's all you have
      const hasSafeCards = hand.some(c => c[1] !== 'H' && c !== 'QS');
      if (hasSafeCards) return false;
    }

    return true;
  }

  playCard(playerId, card) {
    if (!this.isValidPlay(playerId, card)) return false;

    // Remove from hand
    this.hands[playerId] = this.hands[playerId].filter(c => c !== card);
    
    // Add to trick
    this.currentTrick.push({ player: playerId, card: card });

    if (card[1] === 'H') this.heartsBroken = true;

    // Next turn
    this.turnIndex = (this.turnIndex + 1) % 4;

    if (this.currentTrick.length === 4) {
      // Evaluate trick
      this.evaluateTrick();
      return 'TRICK_OVER';
    }

    return 'CONTINUE';
  }

  evaluateTrick() {
    this.playedCards = (this.playedCards || []).concat(this.currentTrick.map(t => t.card));
    const leadSuit = this.currentTrick[0].card[1];
    let highestRank = -1;
    let winnerId = null;
    let trickPoints = 0;

    const ranks = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

    let trickPenaltyPoints = 0;

    this.currentTrick.forEach(play => {
      const suit = play.card[1];
      const rank = ranks[play.card[0]];

      if (suit === leadSuit && rank > highestRank) {
        highestRank = rank;
        winnerId = play.player;
      }

      if (suit === 'H') { trickPoints += 1; trickPenaltyPoints += 1; }
      if (play.card === 'QS') { trickPoints += 13; trickPenaltyPoints += 13; }
      if (play.card === 'JD') { trickPoints -= 10; }
    });

    this.roundScores[winnerId] += trickPoints;
    this.penaltyPoints[winnerId] += trickPenaltyPoints;

    // Set next turn to winner
    this.turnIndex = this.players.findIndex(p => p.id === winnerId);
    this.trickLeaderIndex = this.turnIndex;

    this.firstTrick = false;

    // Check if round over — ALL players' hands empty (not just player 0)
    if (this.players.every(p => this.hands[p.id].length === 0)) {
      this.evaluateRound();
    }
  }

  evaluateRound() {
    // Check for shooting the moon
    let moonShooter = null;
    this.players.forEach(p => {
      if (this.penaltyPoints[p.id] === 26) moonShooter = p.id;
    });

    if (moonShooter) {
      this.players.forEach(p => {
        let jdPoints = this.roundScores[p.id] - this.penaltyPoints[p.id]; // Extract JD points
        if (p.id === moonShooter) {
          this.scores[p.id] += jdPoints; // Shooter gets 0 penalty + their JD points
        } else {
          this.scores[p.id] += 26 + jdPoints; // Others get 26 + their JD points (usually 0)
        }
      });
    } else {
      this.players.forEach(p => {
        this.scores[p.id] += this.roundScores[p.id];
      });
    }

    // Check if game over — any player at 100+
    const gameOver = this.players.some(p => this.scores[p.id] >= 100);
    if (gameOver) {
      const minScore = Math.min(...this.players.map(p => this.scores[p.id]));
      const playersWithMinScore = this.players.filter(p => this.scores[p.id] === minScore);
      // Allow at most 1 tiebreaker round; if still tied (or any score still 100+), end it
      if (playersWithMinScore.length > 1 && !this.tieBreakerUsed) {
        this.tieBreakerUsed = true;
        this.gameState = 'ROUND_OVER';
        this.roundNumber++;
      } else {
        // Game definitely over — lowest score wins, ties resolved by first listed
        this.gameState = 'GAME_OVER';
      }
    } else {
      this.tieBreakerUsed = false;
      this.gameState = 'ROUND_OVER';
      this.roundNumber++;
    }
  }
}

module.exports = HeartsGame;

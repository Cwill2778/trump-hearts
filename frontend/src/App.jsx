import { useState, useEffect } from 'react';
import io from 'socket.io-client';
import './index.css';
import Dashboard from './Dashboard';

const API_URL = import.meta.env.DEV ? `http://${window.location.hostname}:3001` : '';
const SOCKET_URL = import.meta.env.DEV ? `http://${window.location.hostname}:3001` : window.location.origin;
const socket = io(SOCKET_URL, { autoConnect: false });

const cardSuits = { 'C': '♣', 'D': '♦', 'H': '♥', 'S': '♠' };
const cardColors = { 'C': 'black', 'D': 'red', 'H': 'red', 'S': 'black' };

// Trump Soundboard Quotes
const trumpQuotes = [
  { label: "Fake News!", url: 'https://www.myinstants.com/media/sounds/donald-trump-fake-news-sound-effect.mp3' },
  { label: "Great Wall", url: 'https://www.myinstants.com/media/sounds/i_will_build_a_great_great_wall_on_our_southern_bo.mp3' },
  { label: "Obamna", url: 'https://www.myinstants.com/media/sounds/obamna.mp3' },
  { label: "Don't Be Rude", url: 'https://www.myinstants.com/media/sounds/trump-dont-be-rude.mp3' },
  { label: "China", url: 'https://www.myinstants.com/media/sounds/china_pH6AIw0.mp3' },
  { label: "You Don't Have The Cards", url: '/sounds/YouDontHaveTheCards.m4r' },
  { label: "I Can Be So Tough", url: '/sounds/iCannBeSoTough.m4r' },
  { label: "Don't Tell Us", url: '/sounds/DontTellUsWhatWereGonnaFeel.m4r' }
];

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  const [coins, setCoins] = useState(Number(localStorage.getItem('coins')) || 0);
  const [view, setView] = useState(token ? 'LOBBY' : 'LOGIN'); // LOGIN, LOBBY (Dashboard), GAME
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Game State
  const [roomId, setRoomId] = useState('');
  const [lobbyPlayers, setLobbyPlayers] = useState([]);
  const [gameState, setGameState] = useState(null); // The game object from server
  const [prevGameState, setPrevGameState] = useState(null);
  const [showGlassShatter, setShowGlassShatter] = useState(false);
  const [showQSAnimation, setShowQSAnimation] = useState(false);
  const [isDealing, setIsDealing] = useState(false);
  const [dealCards, setDealCards] = useState([]);
  const [isPassingAnim, setIsPassingAnim] = useState(false);
  const [passAnimCards, setPassAnimCards] = useState([]);
  const [animatingCard, setAnimatingCard] = useState(null);
  const [isClearingTrick, setIsClearingTrick] = useState(null);
  const [chat, setChat] = useState([]);
  const [chatInput, setChatInput] = useState('');
  
  // Local Game interaction state
  const [selectedCards, setSelectedCards] = useState([]);

  useEffect(() => {
    if (token && view !== 'LOGIN') {
      socket.connect();
    }
    
    socket.on('lobby_update', (players) => {
      setLobbyPlayers(players);
    });

    socket.on('chat_message', (msg) => {
      if (msg.text && msg.text.startsWith('🔊 [Soundboard]')) {
        const parts = msg.text.split('|');
        if (parts.length > 1) {
          const url = parts[1];
          const audio = new Audio(url);
          audio.play().catch(e => console.error(e));
          msg.text = parts[0]; // just show the label part in chat
        }
      }
      setChat(prev => [...prev, msg]);
    });

    socket.on('game_update', (state) => {
      setGameState(state);
      if (state.gameState === 'LOBBY') {
        setView('TABLE_WAITING');
      } else {
        setView('GAME');
      }
      setSelectedCards([]); // Clear selection on update
    });

    socket.on('room_joined', (id) => {
      setRoomId(id);
      setView('TABLE_WAITING');
    });

    socket.on('tournament_started', () => {
      setView('GAME');
    });

    socket.on('error_message', (err) => {
      alert("Error: " + err);
    });

    return () => {
      socket.off('lobby_update');
      socket.off('chat_message');
      socket.off('game_update');
      socket.off('error_message');
      socket.off('room_joined');
      socket.off('tournament_started');
    };
  }, [token, view]);

  useEffect(() => {
    if (gameState && prevGameState) {
      if ((gameState.gameState === 'PASSING' || gameState.gameState === 'PLAYING') && 
          (prevGameState.gameState === 'LOBBY' || prevGameState.gameState === 'ROUND_OVER' || prevGameState.gameState === 'GAME_OVER')) {
        const audio = new Audio('https://www.myinstants.com/media/sounds/card-shuffle.mp3');
        audio.play().catch(e => console.error(e));

        setIsDealing(true);
        const newDealCards = [];
        for (let i = 0; i < 52; i++) {
           let targetX = i % 4 === 0 ? '0px' : i % 4 === 1 ? '-40vw' : i % 4 === 2 ? '0px' : '40vw';
           let targetY = i % 4 === 0 ? '40vh' : i % 4 === 1 ? '0px' : i % 4 === 2 ? '-40vh' : '0px';
           newDealCards.push({ id: i, delay: i * 0.05, tx: targetX, ty: targetY });
        }
        setDealCards(newDealCards);
        setTimeout(() => setIsDealing(false), 52 * 50 + 500);
      }

      if (gameState.gameState === 'PLAYING' && prevGameState.gameState === 'PASSING') {
        setIsPassingAnim(true);
        const dir = gameState.passDir;
        if (dir !== 0 && dir !== undefined) {
           const newPassCards = [];
           const positions = [
             {x: '0px', y: '40vh'}, // bottom
             {x: '-40vw', y: '0px'}, // left
             {x: '0px', y: '-40vh'}, // top
             {x: '40vw', y: '0px'}  // right
           ];
           let offsets = [0, 1, 3, 2];
           for (let i=0; i<4; i++) {
              let from = positions[i];
              let toIndex = (i + offsets[dir]) % 4;
              let to = positions[toIndex];
              for (let j=0; j<3; j++) {
                 newPassCards.push({ id: `p_${i}_${j}`, startX: from.x, startY: from.y, endX: to.x, endY: to.y, delay: j * 0.2 });
              }
           }
           setPassAnimCards(newPassCards);
        }
        setTimeout(() => setIsPassingAnim(false), 1500);
      }
      
      if (gameState.currentTrick && prevGameState.currentTrick && 
          gameState.currentTrick.length === 4 && prevGameState.currentTrick.length < 4) {
        
        // Wait 1.2s, then start sweep animation to the winner
        setTimeout(() => {
          setIsClearingTrick(gameState.trickLeaderIndex);
        }, 1200);

        // It clears on backend after 2s, so we clear our animation state after 2s
        setTimeout(() => {
          setIsClearingTrick(null);
        }, 2000);
      }
      
      if (gameState.currentTrick && prevGameState.currentTrick && 
          gameState.currentTrick.length > prevGameState.currentTrick.length) {
        const audio = new Audio('https://www.myinstants.com/media/sounds/card-draw.mp3');
        audio.play().catch(e => console.error(e));
      }

      // Check Hearts Broken
      if (gameState.heartsBroken && !prevGameState.heartsBroken) {
        const audio = new Audio('https://www.myinstants.com/media/sounds/glass-shattering.mp3');
        audio.play().catch(e => console.error(e));
        setShowGlassShatter(true);
        setTimeout(() => setShowGlassShatter(false), 2000);
      }

      // Check QS Played
      const qsInTrick = gameState.currentTrick && gameState.currentTrick.find(t => t.card === 'QS');
      const qsInPrevTrick = prevGameState.currentTrick && prevGameState.currentTrick.find(t => t.card === 'QS');
      if (qsInTrick && !qsInPrevTrick) {
        const audio = new Audio('https://www.myinstants.com/media/sounds/trump-dont-be-rude.mp3');
        audio.play().catch(e => console.error(e));
        setShowQSAnimation(true);
        setTimeout(() => setShowQSAnimation(false), 3000);
      }
    }
    setPrevGameState(gameState);
  }, [gameState]);

  const handleAuth = async (action) => {
    const user = prompt("Enter username:");
    if (!user) return;
    const pass = prompt("Enter password:");
    if (!pass) return;

    try {
      const res = await fetch(`${API_URL}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass })
      });
      const data = await res.json();
      if (data.token) {
        setToken(data.token);
        setUsername(data.username);
        setCoins(data.coins);
        localStorage.setItem('token', data.token);
        localStorage.setItem('username', data.username);
        localStorage.setItem('coins', data.coins);
        setView('LOBBY');
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert("Server error. Sad!");
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    setToken(null);
    setView('LOGIN');
  };

  const startGame = () => {
    socket.emit('start_game');
  };

  const sendChat = (e) => {
    e.preventDefault();
    if (chatInput) {
      socket.emit('chat_message', chatInput);
      setChatInput('');
    }
  };

  const sendSoundboard = (quote) => {
    socket.emit('chat_message', `🔊 [Soundboard] ${quote.label}|${quote.url}`);
  };

  const toggleCardSelection = (card) => {
    if (selectedCards.includes(card)) {
      setSelectedCards(selectedCards.filter(c => c !== card));
    } else {
      setSelectedCards([...selectedCards, card]);
    }
  };

  const passCards = () => {
    if (selectedCards.length !== 3) {
      alert("Select exactly 3 cards to pass. No more, no less!");
      return;
    }
    socket.emit('pass_cards', selectedCards);
    setSelectedCards([]);
  };

  const leaveGame = () => {
    socket.emit('leave_game');
    setView('LOBBY');
  };

  const playCard = (card) => {
    if (gameState?.gameState !== 'PLAYING') return;
    setAnimatingCard(card);
    setTimeout(() => {
      socket.emit('play_card', card);
      setAnimatingCard(null);
    }, 300);
  };

  const renderCard = (card, isMine, onClick = null, isSelected = false) => {
    if (card === 'BACK') {
      return (
        <div key={Math.random()} className={`playing-card card-back`} style={{ color: 'transparent' }}>
          *
        </div>
      );
    }
    const suit = card[1];
    const rank = card[0];
    const isRed = suit === 'H' || suit === 'D';
    const suitSymbol = { 'H': '♥', 'D': '♦', 'C': '♣', 'S': '♠' }[suit];
    
    return (
      <div 
        key={card} 
        className={`playing-card ${isRed ? 'red' : 'black'} ${isSelected ? 'selected' : ''}`}
        onClick={onClick}
      >
        <div>{rank === 'T' ? '10' : rank}</div>
        <div style={{ fontSize: '2rem' }}>{suitSymbol}</div>
      </div>
    );
  };

  if (view === 'LOGIN') {
    return (
      <div className="header">
        <h1>Great American Hearts</h1>
        <div className="card-container">
          <h2>Welcome, Winners</h2>
          <button className="tremendous-btn" style={{width: '100%', marginBottom: 10}} onClick={() => handleAuth('login')}>Login</button>
          <button className="tremendous-btn" style={{width: '100%'}} onClick={() => handleAuth('register')}>Register</button>
        </div>
      </div>
    );
  }

  if (view === 'LOBBY') {
    return (
      <Dashboard 
        socket={socket} 
        username={username} 
        coins={coins} 
        setCoins={(c) => {
          setCoins(c);
          localStorage.setItem('coins', c);
        }}
        onLogout={handleLogout} 
      />
    );
  }

  if (view === 'TABLE_WAITING') {
    return (
      <div className="header">
        <h1>Great American Hearts</h1>
        <div className="card-container" style={{maxWidth: 600}}>
          <h2 style={{color: 'var(--gold)'}}>Table: {roomId}</h2>
          <p>Waiting for players...</p>
          
          <div style={{marginTop: 20}}>
            <h3>Players at Table:</h3>
            <ul>
              {lobbyPlayers.map(p => <li key={p.id}>{p.username} {p.isBot ? '(Bot)' : ''}</li>)}
            </ul>
            {lobbyPlayers.length < 4 && (
              <button className="tremendous-btn" style={{marginBottom: 10, width: '100%'}} onClick={() => socket.emit('add_bot')}>Add AI Bot</button>
            )}
            {lobbyPlayers.length === 4 ? (
              <button className="tremendous-btn" style={{width: '100%', background: 'green'}} onClick={startGame}>Start Game Now</button>
            ) : (
              <p>Waiting for 4 players... ({lobbyPlayers.length}/4)</p>
            )}
            
            <button className="tremendous-btn" style={{marginTop: 20, width: '100%', background: 'var(--red)'}} onClick={leaveGame}>Leave Table</button>
          </div>
        </div>
      </div>
    );
  }

  // --- GAME VIEW ---
  
  // Find my index
  const myIndex = gameState?.players.findIndex(p => p.username === username);
  const getPlayer = (offset) => {
    if (myIndex === -1 || !gameState) return null;
    const index = (myIndex + offset) % 4;
    return gameState.players[index];
  };

  const getTrickCardForPlayer = (playerId) => {
    if (!gameState) return null;
    const play = gameState.currentTrick.find(p => p.player === playerId);
    return play ? play.card : null;
  };

  return (
    <div className="game-layout">
      <div className="game-board">
        {showGlassShatter && <div className="glass-shatter-overlay" />}
        {showQSAnimation && <div className="qs-animation-overlay">DON'T BE RUDE!</div>}
        
        {/* Top Player (Across) */}
        {getPlayer(2) && (
          <div className={`player-area ${gameState?.turnIndex === ((myIndex + 2) % 4) ? 'active-player' : ''}`} style={{ borderBottom: '1px solid var(--gold)' }}>
            <h3>{getPlayer(2).username} | Round: {gameState.roundScores[getPlayer(2).id] || 0} | Total: {gameState.scores[getPlayer(2).id] || 0}</h3>
          </div>
        )}
        
        {/* Middle Area (Left, Center Table, Right) */}
        <div style={{ display: 'flex', flexGrow: 1 }}>
          {/* Left Player */}
          {getPlayer(1) && (
             <div className={`player-area ${gameState?.turnIndex === ((myIndex + 1) % 4) ? 'active-player' : ''}`} style={{ borderRight: '1px solid var(--gold)', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
               <h3>{getPlayer(1).username} | Round: {gameState.roundScores[getPlayer(1).id] || 0} | Total: {gameState.scores[getPlayer(1).id] || 0}</h3>
             </div>
          )}
          
          <div className="table-center">
          {gameState && (
            <button className="mobile-menu-btn" onClick={() => setIsSidebarOpen(true)}>
              ☰ Menu
            </button>
          )}

          {isDealing && dealCards.map(c => (
             <div key={c.id} className="playing-card dealing-animation card-back" style={{ '--deal-x': c.tx, '--deal-y': c.ty, animationDelay: `${c.delay}s` }} />
          ))}
          {isPassingAnim && passAnimCards.map(c => (
             <div key={c.id} className="playing-card passing-animation card-back" style={{ '--pass-start-x': c.startX, '--pass-start-y': c.startY, '--pass-end-x': c.endX, '--pass-end-y': c.endY, animationDelay: `${c.delay}s` }} />
          ))}
          {(!isDealing && !isPassingAnim) && gameState?.currentTrick.map((play, index) => {
            const positions = [
              { top: 'auto', bottom: '-40px', left: '50%', transform: 'translateX(-50%)' }, // Bottom
              { top: '50%', left: '-20px', transform: 'translateY(-50%) rotate(90deg)' }, // Left
              { top: '-40px', bottom: 'auto', left: '50%', transform: 'translateX(-50%)' }, // Top
              { top: '50%', right: '-20px', left: 'auto', transform: 'translateY(-50%) rotate(-90deg)' } // Right
            ];
            
            // Map player ID to position index (0=me, 1=left, 2=across, 3=right)
            const pIndex = gameState.players.findIndex(p => p.id === play.player);
            let posIndex = (pIndex - myIndex + 4) % 4;
            
            // Sweep target if clearing trick
            let sweepStyle = {};
            if (isClearingTrick !== null) {
              const winnerPos = (isClearingTrick - myIndex + 4) % 4;
              const winCoords = [
                {x: '50vw', y: '90vh'}, // Bottom
                {x: '10vw', y: '50vh'}, // Left
                {x: '50vw', y: '10vh'}, // Top
                {x: '90vw', y: '50vh'}  // Right
              ];
              sweepStyle = {
                '--sweep-x': winCoords[winnerPos].x,
                '--sweep-y': winCoords[winnerPos].y,
              };
            }

            return (
              <div key={index} className={isClearingTrick !== null ? 'trick-sweep-anim' : ''} style={{ position: 'absolute', ...positions[posIndex], zIndex: index, ...sweepStyle }}>
                {renderCard(play.card, false)}
              </div>
            );
          })}
             
             {gameState?.gameState === 'PASSING' && (
               <div style={{position: 'absolute', top: 20, color: 'var(--gold)'}}>
                 <h2>Select 3 cards to pass!</h2>
                 <button className="tremendous-btn" onClick={passCards}>Confirm Pass</button>
               </div>
             )}
             {gameState?.gameState === 'ROUND_OVER' && (
               <div style={{position: 'absolute', top: 20, color: 'var(--red)', background: 'rgba(0,0,0,0.8)', padding: 20, borderRadius: 8, border: '2px solid var(--gold)', zIndex: 100, textAlign: 'center'}}>
                 <h2>Round Over! Tremendous!</h2>
                 <h3 style={{color: 'white', marginTop: 10, borderBottom: '1px solid var(--gold)'}}>Round Points</h3>
                 {gameState.players.map(p => (
                   <div key={`rnd-${p.id}`} style={{color: 'white', margin: '5px 0'}}>
                     {p.username}: <strong>{gameState.roundScores[p.id] || 0}</strong>
                   </div>
                 ))}
                 <h3 style={{color: 'white', marginTop: 15, borderBottom: '1px solid var(--gold)'}}>Total Points</h3>
                 {gameState.players.map(p => (
                   <div key={`tot-${p.id}`} style={{color: 'white', margin: '5px 0'}}>
                     {p.username}: <strong>{gameState.scores[p.id] || 0}</strong>
                   </div>
                 ))}
               </div>
             )}
             {gameState?.gameState === 'GAME_OVER' && (
               <div style={{position: 'absolute', top: 20, color: 'var(--gold)'}}>
                 <h1>GAME OVER!</h1>
                 <h2>Look at these scores, folks. Huge numbers!</h2>
               </div>
             )}
          </div>

          {/* Right Player */}
          {getPlayer(3) && (
              <div className={`player-area ${gameState?.turnIndex === ((myIndex + 3) % 4) ? 'active-player' : ''}`} style={{ borderLeft: '1px solid var(--gold)', writingMode: 'vertical-rl' }}>
               <h3>{getPlayer(3).username} | Round: {gameState.roundScores[getPlayer(3).id] || 0} | Total: {gameState.scores[getPlayer(3).id] || 0}</h3>
             </div>
          )}
        </div>

        {/* Bottom Player (Me) */}
        <div className={`my-area ${gameState?.turnIndex === myIndex ? 'active-player' : ''}`}>
          <div className="my-info">
            <h3>{username} | Round: {gameState?.roundScores[getPlayer(0)?.id] || 0} | Total: {gameState?.scores[getPlayer(0)?.id] || 0}</h3>
            {gameState?.gameState === 'PLAYING' && gameState?.players[gameState?.turnIndex]?.username === username && (
              <div style={{color: 'var(--gold)', fontWeight: 'bold'}}>YOUR TURN!</div>
            )}
          </div>
          <div className="my-hand">
            {(!isDealing && !isPassingAnim) && gameState?.hand.slice().sort((a, b) => {
              const suitOrder = { 'H': 1, 'S': 2, 'D': 3, 'C': 4 };
              const rankOrder = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
              if (suitOrder[a[1]] !== suitOrder[b[1]]) return suitOrder[a[1]] - suitOrder[b[1]];
              return rankOrder[a[0]] - rankOrder[b[0]];
            }).map(card => (
              <div key={card} className={animatingCard === card ? 'play-card-anim' : ''}>
                {renderCard(
                  card, 
                  true, 
                  () => {
                    if (gameState.gameState === 'PASSING') {
                      toggleCardSelection(card);
                    } else if (gameState.gameState === 'PLAYING') {
                      playCard(card);
                    }
                  },
                  selectedCards.includes(card)
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="card-container" style={{padding: 10, margin: 0, height: '100%', display: 'flex', flexDirection: 'column'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 0}}>
            <h3 style={{margin: 0}}>Lobby Chat</h3>
            <button className="mobile-menu-btn" style={{position: 'static', display: 'block'}} onClick={() => setIsSidebarOpen(false)}>✕</button>
          </div>
          
          <button className="tremendous-btn" style={{padding: '5px 10px', marginBottom: 10, fontSize: '0.9rem', background: 'var(--red)', width: '100%'}} onClick={leaveGame}>
            Leave Table
          </button>
          <div className="chat-box">
            {chat.map((msg, i) => (
              <div key={i} className={`chat-message ${msg.system ? 'system' : 'user'}`}>
                {!msg.system && <span className="author">{msg.username}:</span>}
                {msg.text}
              </div>
            ))}
          </div>
          <form onSubmit={sendChat} style={{display: 'flex', marginTop: 10}}>
            <input 
              className="input-field" 
              style={{margin: 0, borderRadius: '4px 0 0 4px'}}
              value={chatInput} 
              onChange={e => setChatInput(e.target.value)} 
            />
            <button type="submit" className="tremendous-btn" style={{padding: '10px', borderRadius: '0 4px 4px 0'}}>Send</button>
          </form>

          <h3 style={{marginTop: 20}}>Trump Soundboard (Push-to-Talk)</h3>
          <div style={{display: 'flex', flexWrap: 'wrap'}}>
            {trumpQuotes.map((q, i) => (
              <button 
                key={i} 
                className="soundboard-btn" 
                onClick={() => sendSoundboard(q)}
                title={q.label}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

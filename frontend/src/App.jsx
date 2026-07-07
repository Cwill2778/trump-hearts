import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import Peer from 'simple-peer/simplepeer.min.js';
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

const PlayerAvatar = ({ player, position, isActive, roundScore, totalScore, speechBubble, isPttActive, customStyle, hideScore }) => {
  if (!player) return null;
  const isTop = position === 'top';
  
  if (isTop) {
    return (
      <div className={`spades-avatar-container ${position} ${isActive ? 'active' : ''}`} style={{ ...customStyle, flexDirection: 'row', alignItems: 'center', gap: '15px' }}>
        <div className="score-bubble" style={{ marginTop: 0 }}>
          <span style={{color: 'var(--gold)'}}>R:</span> {roundScore} <br/>
          <span style={{color: 'var(--gold)'}}>T:</span> {totalScore}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {speechBubble && <div className="speech-bubble">{speechBubble}</div>}
          <div className="avatar-wrapper">
            <img src={player.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${player.username.replace(' ','')}`} alt={player.username} className="avatar-img" />
            {isPttActive && <div className="ptt-indicator">🎤</div>}
            <div className="avatar-name">{player.username}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`spades-avatar-container ${position} ${isActive ? 'active' : ''}`} style={customStyle}>
      {speechBubble && (
        <div className="speech-bubble">
          {speechBubble}
        </div>
      )}
      <div className="avatar-wrapper">
        <img src={player.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${player.username.replace(' ','')}`} alt={player.username} className="avatar-img" />
        {isPttActive && <div className="ptt-indicator">🎤</div>}
        <div className="avatar-name">{player.username}</div>
      </div>
      {!hideScore && (
        <div className="score-bubble">
          <span style={{color: 'var(--gold)'}}>R:</span> {roundScore} <br/>
          <span style={{color: 'var(--gold)'}}>T:</span> {totalScore}
        </div>
      )}
    </div>
  );
};

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
  
  // UI Overlays State
  const [speechBubbles, setSpeechBubbles] = useState({}); // { username: string }
  const [pttActivePlayers, setPttActivePlayers] = useState({}); // { socketId: boolean }
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [chatModalOpen, setChatModalOpen] = useState(false);
  const [soundboardModalOpen, setSoundboardModalOpen] = useState(false);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  
  // Local Game interaction state
  const [selectedCards, setSelectedCards] = useState([]);

  // WebRTC Voice Chat State
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [isPTTActive, setIsPTTActive] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState({});
  const localStreamRef = useRef(null);
  const peersRef = useRef({});

  useEffect(() => {
    socket.on('webrtc_ready', (peerSocketId) => {
      if (voiceConnected && peerSocketId > socket.id) {
        // We act as initiator
        const peer = createPeer(peerSocketId, socket.id, localStreamRef.current, true);
        peersRef.current[peerSocketId] = peer;
      }
    });

    socket.on('webrtc_signal', ({ from, signal }) => {
      if (!voiceConnected) return; // Ignore if we haven't joined voice
      let peer = peersRef.current[from];
      if (!peer) {
        // They are initiating
        peer = createPeer(from, socket.id, localStreamRef.current, false);
        peersRef.current[from] = peer;
      }
      peer.signal(signal);
    });

    return () => {
      socket.off('webrtc_ready');
      socket.off('webrtc_signal');
    };
  }, [voiceConnected]);

  const createPeer = (userToSignal, callerID, stream, initiator) => {
    const peer = new Peer({
      initiator: initiator,
      trickle: true,
      stream: stream,
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] }
    });

    peer.on('signal', signal => {
      socket.emit('webrtc_signal', { to: userToSignal, signal });
    });

    peer.on('stream', remoteStream => {
      setRemoteStreams(prev => ({ ...prev, [userToSignal]: remoteStream }));
    });

    peer.on('close', () => {
      setRemoteStreams(prev => {
        const next = {...prev};
        delete next[userToSignal];
        return next;
      });
      delete peersRef.current[userToSignal];
    });

    return peer;
  };

  const connectVoice = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      // Start muted
      stream.getAudioTracks().forEach(t => t.enabled = false);
      localStreamRef.current = stream;
      setVoiceConnected(true);
      socket.emit('webrtc_ready');
    } catch (err) {
      alert("Microphone permission denied or not found. Cannot join voice chat.");
      console.error(err);
    }
  };

  const startPTT = (e) => {
    if (e && e.cancelable) e.preventDefault();
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => t.enabled = true);
      setIsPTTActive(true);
      socket.emit('ptt_active', true);
      setPttActivePlayers(prev => ({ ...prev, [socket.id]: true }));
    }
  };

  const stopPTT = (e) => {
    if (e && e.cancelable) e.preventDefault();
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => t.enabled = false);
      setIsPTTActive(false);
      socket.emit('ptt_active', false);
      setPttActivePlayers(prev => ({ ...prev, [socket.id]: false }));
    }
  };

  useEffect(() => {
    if (token && view !== 'LOGIN') {
      socket.connect();
    }

    const onConnect = () => {
      if (username) {
        socket.emit('check_reconnect', { username });
      }
    };
    
    socket.on('connect', onConnect);
    
    socket.on('reconnect_available', ({ roomId, originalId }) => {
      if (window.confirm("You have an active game in progress! Reconnect now?")) {
        socket.emit('rejoin_game', { roomId, originalId });
      }
    });
    socket.on('lobby_update', (players) => {
      setLobbyPlayers(players);
    });

    socket.on('ptt_active', ({ socketId, isActive }) => {
      setPttActivePlayers(prev => ({ ...prev, [socketId]: isActive }));
    });

    socket.on('chat_message', (msg) => {
      if (msg.system) return; // Ignore system messages for bubbles
      
      let text = msg.text;
      if (text && text.startsWith('🔊 [Soundboard]')) {
        const parts = text.split('|');
        if (parts.length > 1) {
          const url = parts[1];
          const audio = new Audio(url);
          audio.play().catch(e => console.error(e));
          text = '🎺 ' + parts[0].replace('🔊 [Soundboard] ', '');
        }
      }
      
      setSpeechBubbles(prev => ({ ...prev, [msg.username]: text }));
      setTimeout(() => {
        setSpeechBubbles(prev => {
          const next = { ...prev };
          if (next[msg.username] === text) delete next[msg.username];
          return next;
        });
      }, 8000);
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
      socket.off('connect', onConnect);
      socket.off('reconnect_available');
    };
  }, [token, view, username]);

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
        <div style={{ fontSize: '1.2em', fontWeight: '900' }}>{rank === 'T' ? '10' : rank}</div>
        <div style={{ fontSize: '2em', marginTop: '-5px' }}>{suitSymbol}</div>
      </div>
    );
  };

  if (view === 'LOGIN') {
    return (
      <div className="header" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', justifyContent: 'center' }}>
        <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <h1>Great American Hearts</h1>
          <div className="card-container">
            <h2>Welcome, Winners</h2>
            <button className="tremendous-btn" style={{width: '100%', marginBottom: 10}} onClick={() => handleAuth('login')}>Login</button>
            <button className="tremendous-btn" style={{width: '100%'}} onClick={() => handleAuth('register')}>Register</button>
          </div>
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
            
            <div style={{marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--gold)'}}>
              {!voiceConnected ? (
                <button className="tremendous-btn" onClick={connectVoice} style={{width: '100%', background: 'var(--navy)'}}>
                  Connect Voice Chat
                </button>
              ) : (
                <div style={{color: 'green', fontWeight: 'bold', textAlign: 'center'}}>✓ Voice Chat Connected</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- GAME VIEW ---
  
  // Find my index
  const myIndex = gameState?.players.findIndex(p => p.username === username);
  const renderOpponentHand = (player, position) => {
    if (!gameState?.handCounts || !player) return null;
    const count = gameState.handCounts[player.id] || 0;
    if (count === 0) return null;

    let containerStyle = { position: 'absolute', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10 };
    if (position === 'top') { containerStyle.top = '140px'; containerStyle.left = '50%'; containerStyle.transform = 'translateX(-50%)'; }
    if (position === 'left') { containerStyle.left = '160px'; containerStyle.top = '50%'; containerStyle.transform = 'translateY(-50%)'; }
    if (position === 'right') { containerStyle.right = '160px'; containerStyle.top = '50%'; containerStyle.transform = 'translateY(-50%)'; }

    return (
      <div className={`opponent-hand fan-${position}`} style={containerStyle}>
        {Array.from({length: count}).map((_, i) => {
          const offset = (i - (count - 1) / 2);
          let rotation, translateX, translateY;
          if (position === 'top') { rotation = 180 + offset * 5; translateX = offset * 12; translateY = Math.abs(offset) * 3; }
          else if (position === 'left') { rotation = 90 + offset * 5; translateX = -Math.abs(offset) * 3; translateY = offset * 12; }
          else if (position === 'right') { rotation = -90 + offset * 5; translateX = Math.abs(offset) * 3; translateY = offset * 12; }
          
          let style = { position: 'absolute', transform: `translate(${translateX}px, ${translateY}px) rotate(${rotation}deg)` };
          return <div key={i} className="playing-card card-back mini-card" style={style} />;
        })}
      </div>
    );
  };

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
      <div className="game-board" style={{ zoom: 0.75 }}>
        {showGlassShatter && <div className="glass-shatter-overlay" />}
        {showQSAnimation && <div className="qs-animation-overlay">DON'T BE RUDE!</div>}
        
        {/* Table Felt Background handled by CSS */}
        
        {/* Top Player (Across) */}
        <PlayerAvatar 
          player={getPlayer(2)} 
          position="top" 
          isActive={gameState?.turnIndex === ((myIndex + 2) % 4)} 
          roundScore={gameState?.roundScores[getPlayer(2)?.id] || 0} 
          totalScore={gameState?.scores[getPlayer(2)?.id] || 0}
          speechBubble={speechBubbles[getPlayer(2)?.username]}
          isPttActive={pttActivePlayers[getPlayer(2)?.id]}
        />
        
        {/* Left Player */}
        <PlayerAvatar 
          player={getPlayer(1)} 
          position="left" 
          isActive={gameState?.turnIndex === ((myIndex + 1) % 4)} 
          roundScore={gameState?.roundScores[getPlayer(1)?.id] || 0} 
          totalScore={gameState?.scores[getPlayer(1)?.id] || 0}
          speechBubble={speechBubbles[getPlayer(1)?.username]}
          isPttActive={pttActivePlayers[getPlayer(1)?.id]}
        />

        {/* Right Player */}
        <PlayerAvatar 
          player={getPlayer(3)} 
          position="right" 
          isActive={gameState?.turnIndex === ((myIndex + 3) % 4)} 
          roundScore={gameState?.roundScores[getPlayer(3)?.id] || 0} 
          totalScore={gameState?.scores[getPlayer(3)?.id] || 0}
          speechBubble={speechBubbles[getPlayer(3)?.username]}
          isPttActive={pttActivePlayers[getPlayer(3)?.id]}
        />
        
        {/* Winner Celebration Overlay */}
        {gameState?.gameState === 'GAME_OVER' && (() => {
          const minScore = Math.min(...gameState.players.map(p => gameState.scores[p.id]));
          const myScore = gameState.scores[gameState.players[myIndex].id];
          const isWinner = myScore === minScore;
          const winnerNames = gameState.players.filter(p => gameState.scores[p.id] === minScore).map(p => p.username).join(' & ');

          return (
            <div className="celebration-overlay">
              <div className="fireworks"></div>
              <div className="fireworks"></div>
              <div className="fireworks"></div>
              <div className={`celebration-card ${isWinner ? 'winner' : 'loser'}`}>
                {isWinner ? (
                  <>
                    <div style={{fontSize: '5rem', marginBottom: 20}}>🏆</div>
                    <h1 style={{fontSize: '3rem', color: '#FFD700', textShadow: '0 0 20px rgba(255, 215, 0, 0.8)', margin: 0}}>VICTORY!</h1>
                    <h2 style={{color: 'white', marginTop: 10}}>You won with {myScore} points!</h2>
                    <p style={{fontSize: '1.2rem', color: 'rgba(255,255,255,0.8)'}}>Tremendous job. Everyone says so.</p>
                  </>
                ) : (
                  <>
                    <div style={{fontSize: '4rem', marginBottom: 20, opacity: 0.8}}>💀</div>
                    <h1 style={{fontSize: '3rem', color: 'var(--red)', margin: 0}}>GAME OVER</h1>
                    <h2 style={{color: 'white', marginTop: 10}}>{winnerNames} won bigly.</h2>
                    <p style={{fontSize: '1.2rem', color: 'rgba(255,255,255,0.8)'}}>You scored {myScore} points. Sad!</p>
                  </>
                )}
                
                <button className="tremendous-btn" style={{marginTop: 30, fontSize: '1.3rem', padding: '15px 30px'}} onClick={leaveGame}>
                  Return to Lobby
                </button>
              </div>
            </div>
          );
        })()}

        {/* Center Trick Area */}
        <div className="table-center spades-table-center">
          <div className="waving-flag"></div>
          {gameState && (
            <button className="mobile-menu-btn spades-menu-btn" onClick={() => setIsSidebarOpen(true)}>
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
              { top: 'auto', bottom: '15%', left: '50%', transform: 'translateX(-50%)' }, // Bottom
              { top: '50%', left: '15%', transform: 'translateY(-50%) rotate(90deg)' }, // Left
              { top: '15%', bottom: 'auto', left: '50%', transform: 'translateX(-50%)' }, // Top
              { top: '50%', right: '15%', left: 'auto', transform: 'translateY(-50%) rotate(-90deg)' } // Right
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
               <div style={{position: 'absolute', top: 20, color: 'var(--gold)', textAlign: 'center'}}>
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

        {/* Hidden Remote Audio Streams */}
        {Object.entries(remoteStreams).map(([peerId, stream]) => (
          <audio key={peerId} autoPlay ref={el => { if (el && el.srcObject !== stream) el.srcObject = stream; }} />
        ))}

        {/* Bottom Player (Me) */}
        <div className={`spades-my-area ${gameState?.turnIndex === myIndex ? 'active-player' : ''}`} style={{ zoom: 0.85 }}>
          <PlayerAvatar 
            player={getPlayer(0)} 
            position="bottom" 
            isActive={gameState?.turnIndex === myIndex} 
            roundScore={gameState?.roundScores[getPlayer(0)?.id] || 0} 
            totalScore={gameState?.scores[getPlayer(0)?.id] || 0} 
            speechBubble={speechBubbles[getPlayer(0)?.username]}
            isPttActive={pttActivePlayers[getPlayer(0)?.id]}
            hideScore={true}
            customStyle={{
              bottom: 20,
              right: actionMenuOpen ? 180 : 90,
              left: 'auto',
              transform: 'none',
              transition: 'right 0.3s ease',
              zIndex: 100
            }}
          />
          {gameState?.gameState === 'PLAYING' && gameState?.players[gameState?.turnIndex]?.username === username && (
            <div className="your-turn-text">YOUR TURN!</div>
          )}
          <div className={`my-hand ${gameState?.gameState === 'PLAYING' && gameState?.players[gameState?.turnIndex]?.username === username ? 'my-turn-glow' : ''}`}>
            {(!isDealing && !isPassingAnim) && gameState?.hand.slice().sort((a, b) => {
              const suitOrder = { 'H': 1, 'S': 2, 'D': 3, 'C': 4 };
              const rankOrder = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
              if (suitOrder[a[1]] !== suitOrder[b[1]]) return suitOrder[a[1]] - suitOrder[b[1]];
              return rankOrder[a[0]] - rankOrder[b[0]];
            }).map((card, idx, arr) => {
              const totalCards = arr.length;
              const offset = idx - (totalCards - 1) / 2;
              const rotation = offset * 3.5; 
              const translateY = Math.abs(offset) * 2;
              return (
              <div key={card} className={`my-hand-card-wrapper ${animatingCard === card ? 'play-card-anim' : ''}`} style={{ 
                margin: '0px -15px',
                transform: `rotate(${rotation}deg) translateY(${translateY}px)`,
                transformOrigin: 'bottom center',
                transition: 'transform 0.2s ease, z-index 0s'
              }}>
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
            );
            })}
          </div>
        </div>

        {/* Radial Action Menu */}
        <div className="action-menu-container">
          <div className={`radial-menu-container ${actionMenuOpen ? 'open' : ''}`}>
            <button className="action-fab" onClick={() => setActionMenuOpen(!actionMenuOpen)}>
              {actionMenuOpen ? '✕' : '💬'}
            </button>
            <div className="radial-menu-item radial-item-1" title="Type Msg" onClick={() => { setChatModalOpen(true); setActionMenuOpen(false); }}>
              ✏️
            </div>
            <div className="radial-menu-item radial-item-2" title="Speak Now" 
                 onMouseDown={startPTT} onMouseUp={stopPTT} onMouseLeave={stopPTT} onTouchStart={startPTT} onTouchEnd={stopPTT}
                 style={{ background: isPTTActive ? 'var(--gold)' : 'var(--red)' }}>
              🎙️
            </div>
            <div className="radial-menu-item radial-item-3" title="Feeling Trumped" onClick={() => { setSoundboardModalOpen(true); setActionMenuOpen(false); }}>
              🎺
            </div>
          </div>
        </div>
        
        {/* Chat Modal */}
        {chatModalOpen && (
          <div style={{position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0,0,0,0.9)', padding: 20, borderRadius: 10, zIndex: 1000, border: '2px solid var(--gold)', width: '300px'}}>
            <h3 style={{marginTop: 0, color: 'var(--gold)'}}>Send Message</h3>
            <form onSubmit={(e) => { e.preventDefault(); sendChat(e); setChatModalOpen(false); }}>
              <input className="input-field" autoFocus value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Type..." />
              <div style={{display: 'flex', gap: 10, marginTop: 10}}>
                <button type="submit" className="tremendous-btn" style={{flex: 1}}>Send</button>
                <button type="button" className="tremendous-btn" style={{flex: 1, background: 'var(--navy)'}} onClick={() => setChatModalOpen(false)}>Cancel</button>
              </div>
            </form>
          </div>
        )}
        
        {/* Card Tracker Button & Player 1 Score */}
        <button 
          className="tremendous-btn" 
          onClick={() => setTrackerOpen(!trackerOpen)}
          style={{
            position: 'absolute', left: 20, bottom: 40, width: 50, height: 50, borderRadius: 25, 
            fontSize: '1.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center',
            padding: 0, zIndex: 100
          }}
          title="Card Tracker"
        >
          🃏
        </button>
        {gameState && (
          <div className="score-bubble" style={{ position: 'absolute', left: 80, bottom: 40, margin: 0, padding: '5px 15px', zIndex: 100, fontSize: '0.9rem', background: 'rgba(0,0,0,0.8)', border: '2px solid var(--gold)', borderRadius: '15px', width: 'auto' }}>
            <span style={{color: 'var(--gold)'}}>R:</span> {gameState.roundScores[getPlayer(0)?.id] || 0} <br/>
            <span style={{color: 'var(--gold)'}}>T:</span> {gameState.scores[getPlayer(0)?.id] || 0}
          </div>
        )}

        {/* Card Tracker Modal */}
        {trackerOpen && (
          <div style={{
            position: 'absolute', bottom: 100, left: 20,
            background: 'rgba(0,0,0,0.95)', padding: '15px', borderRadius: 10, border: '2px solid var(--gold)',
            zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 10
          }}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <h4 style={{margin: 0, color: 'var(--gold)'}}>Played Cards</h4>
              <button className="tremendous-btn" onClick={() => setTrackerOpen(false)} style={{padding: '2px 8px', fontSize: '0.8rem'}}>✕</button>
            </div>
            <div style={{display: 'flex', flexDirection: 'column', gap: 5}}>
              {['C', 'D', 'S', 'H'].map(suit => (
                <div key={suit} style={{display: 'flex', gap: 4, background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: 5, alignItems: 'center'}}>
                  <div style={{width: 20, color: cardColors[suit], fontWeight: 'bold'}}>{cardSuits[suit]}</div>
                  {['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'].map(rank => {
                    const card = rank + suit;
                    const isPlayed = (gameState?.playedCards || []).includes(card);
                    return (
                      <div key={card} style={{
                        width: 15, textAlign: 'center', fontSize: '0.85rem',
                        color: isPlayed ? 'rgba(255,255,255,0.2)' : (cardColors[suit] === 'black' ? '#FFFFFF' : '#FF4444'),
                        textDecoration: isPlayed ? 'line-through' : 'none',
                        fontWeight: isPlayed ? 'normal' : 'bold'
                      }}>
                        {rank === 'T' ? '10' : rank}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Soundboard Modal */}
        {soundboardModalOpen && (
          <div style={{position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0,0,0,0.9)', padding: 20, borderRadius: 10, zIndex: 1000, border: '2px solid var(--gold)', width: '300px'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--gold)', paddingBottom: 10, marginBottom: 10}}>
               <h3 style={{margin: 0, color: 'var(--gold)'}}>Trump Soundboard</h3>
               <button onClick={() => setSoundboardModalOpen(false)} style={{background: 'transparent', color: 'white', border: 'none', cursor: 'pointer', fontSize: '1.2rem'}}>✕</button>
            </div>
            <div style={{display: 'flex', flexWrap: 'wrap', gap: 10}}>
              {trumpQuotes.map((q, i) => (
                <button key={i} className="soundboard-btn" onClick={() => { sendSoundboard(q); setSoundboardModalOpen(false); }}>
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        )}
        
        {/* Exit Button */}
        <button onClick={leaveGame} style={{position: 'absolute', top: 20, right: 20, background: 'var(--red)', color: 'white', border: '2px solid white', borderRadius: '50%', width: 40, height: 40, cursor: 'pointer', zIndex: 200, fontWeight: 'bold'}}>
          ✕
        </button>

      </div>
    </div>
  );
}

export default App;

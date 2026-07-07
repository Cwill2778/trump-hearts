import React, { useState, useEffect } from 'react';
import TournamentBracket from './TournamentBracket';
import './index.css';

const API_URL = import.meta.env.DEV ? `http://${window.location.hostname}:3001` : '';

export default function Dashboard({ socket, username, coins, setCoins, onLogout }) {
  const [activeTab, setActiveTab] = useState('LOBBY');
  const [lobbies, setLobbies] = useState([]);
  const [profile, setProfile] = useState(null);
  const [tournamentQueue, setTournamentQueue] = useState(0);
  const [queueTimeLeft, setQueueTimeLeft] = useState(null);
  const [queuePlayers, setQueuePlayers] = useState([]);
  const [tournamentBracket, setTournamentBracket] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    socket.emit('get_lobbies');
    
    socket.on('lobby_list_update', (list) => {
      setLobbies(list);
    });

    socket.on('tournament_queue_update', (data) => {
      setTournamentQueue(data.count);
      setQueueTimeLeft(data.timeLeft);
      setQueuePlayers(data.players || []);
    });

    socket.on('tournament_bracket_update', (data) => {
      setTournamentBracket(data);
    });

    socket.on('tournament_message', (msg) => {
      alert(msg);
    });

    socket.on('tournament_won', (data) => {
      alert(data.message + " You won " + data.prize + " coins!");
      setCoins(prev => prev + data.prize);
    });

    socket.on('tournament_eliminated', (msg) => {
      alert(msg);
    });

    fetchProfile();

    return () => {
      socket.off('lobby_list_update');
      socket.off('tournament_queue_update');
      socket.off('tournament_message');
      socket.off('tournament_won');
      socket.off('tournament_eliminated');
      socket.off('tournament_bracket_update');
    };
  }, []);

  const fetchProfile = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401 || res.status === 403) {
        onLogout();
        return;
      }
      const data = await res.json();
      setProfile(data);
      fetchHistory();
    } catch (e) {
      console.error(e);
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch(`${API_URL}/leaderboard`);
      const data = await res.json();
      setLeaderboard(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchHistory = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401 || res.status === 403) {
        onLogout();
        return;
      }
      const data = await res.json();
      setHistory(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (activeTab === 'LEADERBOARD') {
      fetchLeaderboard();
    }
  }, [activeTab]);

  const buyCoins = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_URL}/store/buy_coins`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401 || res.status === 403) {
        onLogout();
        return;
      }
      const data = await res.json();
      if (data.success) {
        setCoins(data.coins);
        alert('Purchase tremendous! You got 25,000 coins.');
      } else {
        alert(data.error || 'Failed to buy coins');
      }
    } catch (e) {
      console.error('Buy coins error:', e);
      alert('Network error while buying coins.');
    }
  };

  const handlePlayNow = () => {
    const avatarUrl = localStorage.getItem('avatarUrl') || `https://api.dicebear.com/7.x/initials/svg?seed=${username}`;
    socket.emit('play_now', { username, avatarUrl });
  };

  const handleCreateTable = () => {
    const roomId = prompt("Enter a name for your table:");
    if (roomId) {
      const avatarUrl = localStorage.getItem('avatarUrl') || `https://api.dicebear.com/7.x/initials/svg?seed=${username}`;
      socket.emit('join_lobby', { roomId, username, avatarUrl });
    }
  };

  const joinTable = (roomId) => {
    const avatarUrl = localStorage.getItem('avatarUrl') || `https://api.dicebear.com/7.x/initials/svg?seed=${username}`;
    socket.emit('join_lobby', { roomId, username, avatarUrl });
  };

  const joinTournament = () => {
    if (coins < 10000) {
      alert("You need 10,000 coins to join. Sad!");
      return;
    }
    const token = localStorage.getItem('token');
    // We decode token or just get userId from profile
    if (profile?.user?.id) {
      socket.emit('join_tournament', { userId: profile.user.id });
      setCoins(c => c - 10000);
    }
  };

  const addFriend = async () => {
    const friendUsername = prompt("Enter username of friend to add:");
    if (!friendUsername) return;
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/friends/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ friendUsername })
    });
    const data = await res.json();
    if (data.success) alert("Friend request sent!");
    else alert(data.error);
    fetchProfile();
  };

  const acceptFriend = async (requestId) => {
    const token = localStorage.getItem('token');
    try {
      await fetch(`${API_URL}/friends/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ requestId })
      });
      fetchProfile();
    } catch(e) {
      console.error(e);
    }
  };

  const handleAvatarUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target.result;
      const token = localStorage.getItem('token');
      try {
        const res = await fetch(`${API_URL}/upload-avatar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, avatarUrl: base64 })
        });
        const data = await res.json();
        if (data.avatarUrl) {
          setProfile(prev => ({...prev, user: {...prev.user, avatarUrl: data.avatarUrl}}));
          localStorage.setItem('avatarUrl', data.avatarUrl);
          alert('Avatar updated successfully!');
        }
      } catch(err) {
        console.error(err);
      }
    };
    reader.readAsDataURL(file);
  };

  const getPreviewBracket = () => {
    const tables = [];
    for (let i = 0; i < 4; i++) {
      const p = queuePlayers.slice(i * 4, (i + 1) * 4).map(pl => ({
        id: pl.id, username: pl.username, score: 0
      }));
      tables.push({
        roomId: `queue_table_${i}`,
        state: 'WAITING',
        players: p
      });
    }
    return {
      round: 1,
      tables: tables
    };
  };

  return (
    <div className="dashboard-layout">
      <div className="dashboard-sidebar">
        <h2 style={{color: 'var(--gold)', textAlign: 'center', fontSize: '1.4rem', marginBottom: 5}}>♠ TRUMP HEARTS ♥</h2>
        <div style={{color: 'white', textAlign: 'center', marginBottom: 20, padding: '10px 0', borderBottom: '1px solid rgba(212,175,55,0.3)', borderTop: '1px solid rgba(212,175,55,0.3)'}}>
          <div style={{fontSize: '1.1rem', fontWeight: 600}}>{username}</div>
          <div style={{fontSize: '1.2rem', color: 'var(--gold)', fontWeight: 700, marginTop: 4}}>💰 {coins?.toLocaleString()}</div>
        </div>
        <button className={`sidebar-btn ${activeTab === 'LOBBY' ? 'active' : ''}`} onClick={() => setActiveTab('LOBBY')}>🃏 Lobby Browser</button>
        <button className={`sidebar-btn ${activeTab === 'TOURNAMENT' ? 'active' : ''}`} onClick={() => setActiveTab('TOURNAMENT')}>🏆 Tournaments</button>
        <button className={`sidebar-btn ${activeTab === 'LEADERBOARD' ? 'active' : ''}`} onClick={() => setActiveTab('LEADERBOARD')}>👑 Leaderboard</button>
        <button className={`sidebar-btn ${activeTab === 'STORE' ? 'active' : ''}`} onClick={() => setActiveTab('STORE')}>💰 Coin Store</button>
        <button className={`sidebar-btn ${activeTab === 'PROFILE' ? 'active' : ''}`} onClick={() => setActiveTab('PROFILE')}>👤 Profile & Friends</button>
        
        <button className="sidebar-btn" style={{marginTop: 'auto', background: 'var(--red)', borderColor: 'var(--red)'}} onClick={onLogout}>Logout</button>
      </div>

      <div className="dashboard-content">
        {activeTab === 'LOBBY' && (
          <div style={{maxWidth: '900px', margin: '0 auto'}}>
            <h1 style={{textAlign: 'center', marginBottom: 30}}>🃏 LOBBY BROWSER</h1>
            
            <div style={{display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '30px'}}>
              <button className="tremendous-btn" onClick={handlePlayNow} style={{fontSize: '1.3rem', padding: '16px 36px'}}>
                ▶ PLAY NOW
              </button>
              <button className="tremendous-btn" onClick={handleCreateTable} style={{fontSize: '1.1rem', padding: '16px 28px', background: 'linear-gradient(135deg, var(--navy), #0d4a8a)', color: 'white', borderColor: 'var(--gold)'}}>
                + CREATE TABLE
              </button>
            </div>
            
            {lobbies.length === 0 ? (
              <div style={{textAlign: 'center', padding: '40px 20px', background: 'rgba(0,0,0,0.4)', borderRadius: 12, border: '1px dashed rgba(212,175,55,0.3)'}}>
                <p style={{fontSize: '1.2rem', color: 'rgba(255,255,255,0.7)', margin: 0}}>No open tables right now. Create one or hit Play Now!</p>
              </div>
            ) : (
              <div className="lobbies-grid">
                {lobbies.map(l => (
                  <div key={l.roomId} style={{background: 'rgba(0,0,0,0.5)', border: '1px solid var(--gold)', borderRadius: 12, padding: 20, textAlign: 'center'}}>
                    <h3 style={{margin: '0 0 8px 0', fontSize: '1.1rem'}}>{l.roomId}</h3>
                    <div style={{fontSize: '1.1rem', marginBottom: 12, color: 'rgba(255,255,255,0.9)'}}>
                      <span style={{color: 'var(--gold)', fontWeight: 700}}>{l.players}</span> / 4 Players
                    </div>
                    <button className="tremendous-btn" onClick={() => joinTable(l.roomId)} style={{fontSize: '1rem', padding: '10px 20px', width: '100%'}}>Join Table</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'TOURNAMENT' && (
          <div style={{maxWidth: '1100px', margin: '0 auto'}}>
            <h1 style={{textAlign: 'center', marginBottom: 10}}>🏆 GRAND TOURNAMENT</h1>
            
            {tournamentBracket ? (
              <TournamentBracket bracket={tournamentBracket} />
            ) : (
              <>
                <p style={{textAlign: 'center', fontSize: '1.2rem', color: 'rgba(255,255,255,0.85)', marginBottom: 25}}>
                  16 Players. 4 Tables. Only the best survive.
                </p>
                
                {/* Prize Info Cards */}
                <div style={{display: 'flex', justifyContent: 'center', gap: 20, marginBottom: 30, flexWrap: 'wrap'}}>
                  <div style={{background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(212,175,55,0.4)', borderRadius: 12, padding: '18px 28px', textAlign: 'center', minWidth: 180}}>
                    <div style={{fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6}}>Entry Fee</div>
                    <div style={{fontSize: '1.6rem', fontWeight: 800, color: 'var(--gold)'}}>💰 10,000</div>
                  </div>
                  <div style={{background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(212,175,55,0.6)', borderRadius: 12, padding: '18px 28px', textAlign: 'center', minWidth: 180}}>
                    <div style={{fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6}}>1st Place</div>
                    <div style={{fontSize: '1.6rem', fontWeight: 800, color: '#FFD700'}}>🥇 100,000</div>
                  </div>
                  <div style={{background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(192,192,192,0.4)', borderRadius: 12, padding: '18px 28px', textAlign: 'center', minWidth: 180}}>
                    <div style={{fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6}}>2nd Place</div>
                    <div style={{fontSize: '1.6rem', fontWeight: 800, color: '#C0C0C0'}}>🥈 25,000</div>
                  </div>
                </div>

                {/* Queue Status */}
                <div style={{textAlign: 'center', marginBottom: 25}}>
                  <div style={{display: 'inline-block', background: 'rgba(0,0,0,0.6)', border: '2px solid var(--gold)', borderRadius: 16, padding: '20px 40px'}}>
                    <div style={{fontSize: '2rem', fontWeight: 800, color: 'var(--gold)', marginBottom: 5}}>
                      {tournamentQueue} / 16
                    </div>
                    <div style={{fontSize: '1rem', color: 'rgba(255,255,255,0.7)'}}>Players in Queue</div>
                    {queueTimeLeft !== null && (
                      <div style={{fontSize: '1.4rem', fontWeight: 700, color: 'var(--red)', marginTop: 10, animation: 'turn-pulse 1s infinite alternate'}}>
                        ⏱ Starts in {queueTimeLeft}s
                      </div>
                    )}
                  </div>
                </div>

                <div style={{textAlign: 'center', marginBottom: 30}}>
                  <button className="tremendous-btn" onClick={joinTournament} style={{fontSize: '1.5rem', padding: '18px 50px', letterSpacing: 1}}>
                    🏆 JOIN QUEUE
                  </button>
                </div>

                {/* Preview bracket */}
                <TournamentBracket bracket={getPreviewBracket()} />
              </>
            )}
          </div>
        )}

        {activeTab === 'LEADERBOARD' && (
          <div style={{maxWidth: '800px', margin: '0 auto'}}>
            <h1 style={{textAlign: 'center', marginBottom: 30}}>👑 GLOBAL LEADERBOARD</h1>
            <div style={{background: 'rgba(0,0,0,0.6)', border: '2px solid var(--gold)', borderRadius: 16, overflow: 'hidden'}}>
              <div style={{display: 'flex', padding: '15px 20px', background: 'rgba(212,175,55,0.2)', borderBottom: '2px solid var(--gold)', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--gold)'}}>
                <div style={{width: '60px'}}>Rank</div>
                <div style={{flex: 1}}>Player</div>
                <div style={{width: '100px', textAlign: 'center'}}>Wins</div>
                <div style={{width: '100px', textAlign: 'center'}}>Losses</div>
                <div style={{width: '150px', textAlign: 'right'}}>Coins</div>
              </div>
              {leaderboard.length === 0 ? (
                <div style={{padding: 30, textAlign: 'center'}}>No players ranked yet.</div>
              ) : (
                leaderboard.map((user, idx) => (
                  <div key={user.id} style={{display: 'flex', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.03)'}}>
                    <div style={{width: '60px', fontSize: '1.2rem', fontWeight: 800, color: idx === 0 ? '#FFD700' : idx === 1 ? '#C0C0C0' : idx === 2 ? '#CD7F32' : 'white'}}>
                      #{idx + 1}
                    </div>
                    <div style={{flex: 1, display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700}}>
                      <img src={user.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${user.username}`} alt="" style={{width: 30, height: 30, borderRadius: '50%', border: '1px solid var(--gold)'}} />
                      {user.username}
                    </div>
                    <div style={{width: '100px', textAlign: 'center', color: '#4CAF50', fontWeight: 'bold'}}>{user.wins}</div>
                    <div style={{width: '100px', textAlign: 'center', color: 'var(--red)', fontWeight: 'bold'}}>{user.losses}</div>
                    <div style={{width: '150px', textAlign: 'right', color: 'var(--gold)', fontWeight: 'bold'}}>{user.coins.toLocaleString()}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'STORE' && (
          <div style={{maxWidth: '600px', margin: '0 auto', textAlign: 'center'}}>
            <h1>💰 COIN STORE</h1>
            <p style={{fontSize: '1.1rem', color: 'rgba(255,255,255,0.8)', marginBottom: 30}}>Buy coins to enter tournaments and assert dominance.</p>
            
            <div style={{background: 'rgba(0,0,0,0.5)', border: '2px solid var(--gold)', borderRadius: 16, padding: '30px', maxWidth: 320, margin: '0 auto'}}>
              <div style={{fontSize: '3rem', marginBottom: 10}}>💰</div>
              <h2 style={{margin: '0 0 5px 0'}}>25,000 Coins</h2>
              <p style={{fontSize: '1.3rem', color: 'rgba(255,255,255,0.7)', margin: '0 0 20px 0'}}>Just $0.99</p>
              <button className="tremendous-btn" onClick={buyCoins} style={{width: '100%', fontSize: '1.2rem', padding: '14px'}}>Buy Now</button>
            </div>
          </div>
        )}

        {activeTab === 'PROFILE' && profile && (
          <div style={{maxWidth: '800px', margin: '0 auto'}}>
            <h1 style={{textAlign: 'center'}}>👤 PROFILE</h1>
            <div style={{display: 'flex', gap: 40, flexWrap: 'wrap', justifyContent: 'center'}}>
              
              {/* Left: Avatar & Stats */}
              <div style={{background: 'rgba(0,0,0,0.5)', border: '1px solid var(--gold)', borderRadius: 16, padding: 30, textAlign: 'center', minWidth: 250}}>
                <img src={profile.user.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${username}`} alt="Avatar" style={{width: 120, height: 120, borderRadius: '50%', border: '3px solid var(--gold)', objectFit: 'cover', marginBottom: 15}} />
                <div style={{marginBottom: 15}}>
                  <label className="tremendous-btn" style={{fontSize: '0.9rem', padding: '8px 16px', cursor: 'pointer', display: 'inline-block'}}>
                    📷 Change Photo
                    <input type="file" accept="image/*" onChange={handleAvatarUpload} style={{display: 'none'}} />
                  </label>
                </div>
                
                <h3 style={{marginBottom: 10}}>Stats</h3>
                <div style={{display: 'flex', justifyContent: 'center', gap: 20}}>
                  <div style={{background: 'rgba(0,100,0,0.3)', border: '1px solid green', borderRadius: 10, padding: '10px 20px'}}>
                    <div style={{fontSize: '1.6rem', fontWeight: 800, color: '#4CAF50'}}>{profile.user.wins}</div>
                    <div style={{fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)'}}>Wins</div>
                  </div>
                  <div style={{background: 'rgba(100,0,0,0.3)', border: '1px solid var(--red)', borderRadius: 10, padding: '10px 20px'}}>
                    <div style={{fontSize: '1.6rem', fontWeight: 800, color: 'var(--red)'}}>{profile.user.losses}</div>
                    <div style={{fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)'}}>Losses</div>
                  </div>
                </div>
              </div>

              {/* Middle: Recent Matches */}
              <div style={{background: 'rgba(0,0,0,0.5)', border: '1px solid var(--gold)', borderRadius: 16, padding: 30, minWidth: 280, flex: 1}}>
                <h3 style={{marginBottom: 15, color: 'var(--gold)'}}>Recent Matches</h3>
                {history.length === 0 ? (
                  <p style={{color: 'rgba(255,255,255,0.5)', fontStyle: 'italic'}}>No games played yet. Get out there!</p>
                ) : (
                  <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
                    {history.map(hp => {
                      const m = hp.match;
                      return (
                        <div key={hp.id} style={{background: hp.isWinner ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${hp.isWinner ? 'var(--gold)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, padding: '10px 15px'}}>
                          <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 5}}>
                            <span style={{fontWeight: 'bold', color: hp.isWinner ? 'var(--gold)' : 'white'}}>
                              {hp.isWinner ? '🏆 VICTORY' : '💀 DEFEAT'}
                            </span>
                            <span style={{fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)'}}>{new Date(m.playedAt).toLocaleDateString()}</span>
                          </div>
                          <div style={{fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)'}}>
                            Table: {m.roomId} <br/>
                            Your Score: {hp.score} pts
                          </div>
                          {m.winnerUsername && !hp.isWinner && (
                            <div style={{fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginTop: 4}}>
                              Won by: {m.winnerUsername}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right: Friends */}
              <div style={{background: 'rgba(0,0,0,0.5)', border: '1px solid var(--gold)', borderRadius: 16, padding: 30, minWidth: 280, flex: 1}}>
                <h3 style={{marginBottom: 15}}>Friends</h3>
                <button className="tremendous-btn" onClick={addFriend} style={{padding: '8px 16px', fontSize: '0.95rem', marginBottom: 20}}>+ Add Friend</button>
                
                {profile.requests.length > 0 && (
                  <div style={{marginBottom: 20}}>
                    <h4 style={{color: 'var(--gold)', marginBottom: 10}}>Pending Requests</h4>
                    {profile.requests.map(req => (
                      <div key={req.id} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, marginBottom: 6}}>
                        <span style={{fontWeight: 600}}>{req.user.username}</span>
                        <button className="tremendous-btn" onClick={() => acceptFriend(req.id)} style={{padding: '5px 14px', fontSize: '0.85rem', background: 'green', borderColor: 'green', color: 'white'}}>Accept</button>
                      </div>
                    ))}
                  </div>
                )}

                <h4 style={{color: 'var(--gold)', marginBottom: 10}}>My Friends</h4>
                {profile.friends.length === 0 ? (
                  <p style={{color: 'rgba(255,255,255,0.5)', fontStyle: 'italic'}}>No friends yet. Sad!</p>
                ) : (
                  profile.friends.map(f => (
                    <div key={f.id} style={{padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between'}}>
                      <span style={{fontWeight: 600}}>{f.friend.username}</span>
                      <span style={{color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem'}}>W:{f.friend.wins} L:{f.friend.losses}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

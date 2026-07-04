import React, { useState, useEffect } from 'react';
import './index.css';

const API_URL = import.meta.env.DEV ? `http://${window.location.hostname}:3001` : '';

export default function Dashboard({ socket, username, coins, setCoins, onLogout }) {
  const [activeTab, setActiveTab] = useState('LOBBY');
  const [lobbies, setLobbies] = useState([]);
  const [profile, setProfile] = useState(null);
  const [tournamentQueue, setTournamentQueue] = useState(0);

  useEffect(() => {
    socket.emit('get_lobbies');
    
    socket.on('lobby_list_update', (list) => {
      setLobbies(list);
    });

    socket.on('tournament_queue_update', (data) => {
      setTournamentQueue(data.count);
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
    };
  }, []);

  const fetchProfile = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setProfile(data);
    } catch (e) {
      console.error(e);
    }
  };

  const buyCoins = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_URL}/store/buy_coins`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setCoins(data.coins);
        alert('Purchase tremendous! You got 25,000 coins.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handlePlayNow = () => {
    socket.emit('play_now', { username });
  };

  const handleCreateTable = () => {
    const roomId = prompt("Enter a name for your table:");
    if (roomId) {
      socket.emit('join_lobby', { roomId, username });
    }
  };

  const joinTable = (roomId) => {
    socket.emit('join_lobby', { roomId, username });
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
    const res = await fetch(`${API_URL}/friends/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ requestId })
    });
    const data = await res.json();
    if (data.success) fetchProfile();
  };

  return (
    <div className="dashboard-layout">
      <div className="dashboard-sidebar">
        <h2 style={{color: 'var(--gold)', textAlign: 'center'}}>TRUMP HEARTS</h2>
        <div style={{color: 'white', textAlign: 'center', marginBottom: 20}}>
          User: {username} <br/>
          Coins: 💰 {coins}
        </div>
        <button className={`sidebar-btn ${activeTab === 'LOBBY' ? 'active' : ''}`} onClick={() => setActiveTab('LOBBY')}>Lobby Browser</button>
        <button className={`sidebar-btn ${activeTab === 'TOURNAMENT' ? 'active' : ''}`} onClick={() => setActiveTab('TOURNAMENT')}>Tournaments</button>
        <button className={`sidebar-btn ${activeTab === 'STORE' ? 'active' : ''}`} onClick={() => setActiveTab('STORE')}>Coin Store</button>
        <button className={`sidebar-btn ${activeTab === 'PROFILE' ? 'active' : ''}`} onClick={() => setActiveTab('PROFILE')}>Profile & Friends</button>
        
        <button className="sidebar-btn" style={{marginTop: 'auto', background: 'var(--red)'}} onClick={onLogout}>Logout</button>
      </div>

      <div className="dashboard-content">
        {activeTab === 'LOBBY' && (
          <div className="card-container" style={{maxWidth: '800px', margin: '0 auto'}}>
            <h1 style={{color: 'var(--gold)', textAlign: 'center'}}>LOBBY BROWSER</h1>
            <div style={{display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '20px'}}>
              <button className="tremendous-btn" onClick={handlePlayNow}>PLAY NOW</button>
              <button className="tremendous-btn" onClick={handleCreateTable} style={{background: 'var(--navy)'}}>Create Table</button>
            </div>
            
            <div className="lobbies-grid">
              {lobbies.length === 0 ? <p style={{textAlign: 'center'}}>No open tables right now. Create one!</p> : lobbies.map(l => (
                <div key={l.roomId} className="lobby-card">
                  <h3>Table: {l.roomId}</h3>
                  <p>Players: {l.players} / 4</p>
                  <button className="tremendous-btn" onClick={() => joinTable(l.roomId)}>Join Table</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'TOURNAMENT' && (
          <div className="card-container" style={{maxWidth: '600px', margin: '0 auto', textAlign: 'center'}}>
            <h1 style={{color: 'var(--gold)'}}>GRAND TOURNAMENT</h1>
            <p>16 Players. 4 Tables. Only the best survive.</p>
            <div style={{background: 'rgba(0,0,0,0.3)', padding: 20, borderRadius: 10, margin: '20px 0'}}>
              <h3>Entry Fee: 10,000 Coins</h3>
              <h3>1st Place: 100,000 Coins | 2nd Place: 25,000 Coins</h3>
            </div>
            <h2>Queue: {tournamentQueue} / 16</h2>
            <button className="tremendous-btn" onClick={joinTournament} style={{fontSize: '1.5rem', padding: '15px 30px'}}>
              JOIN QUEUE
            </button>
            <div style={{marginTop: 20}}>
              <button className="tremendous-btn" onClick={() => socket.emit('fill_tournament_bots')} style={{fontSize: '1rem', padding: '10px 20px', background: 'var(--navy)'}}>
                [TEMP] Fill With Bots
              </button>
            </div>
          </div>
        )}

        {activeTab === 'STORE' && (
          <div className="card-container" style={{maxWidth: '600px', margin: '0 auto', textAlign: 'center'}}>
            <h1 style={{color: 'var(--gold)'}}>COIN STORE</h1>
            <p>Buy coins to enter tournaments and assert dominance.</p>
            
            <div className="lobby-card" style={{margin: '20px auto', maxWidth: '300px'}}>
              <h2>💰 25,000 Coins</h2>
              <p>Just $0.99</p>
              <button className="tremendous-btn" onClick={buyCoins}>Buy Now</button>
            </div>
          </div>
        )}

        {activeTab === 'PROFILE' && profile && (
          <div className="card-container" style={{maxWidth: '800px', margin: '0 auto'}}>
            <h1 style={{color: 'var(--gold)', textAlign: 'center'}}>PROFILE</h1>
            <div style={{display: 'flex', justifyContent: 'space-around'}}>
              <div>
                <h2>Stats</h2>
                <p>Wins: {profile.user.wins}</p>
                <p>Losses: {profile.user.losses}</p>
              </div>
              <div>
                <h2>Friends</h2>
                <button className="tremendous-btn" onClick={addFriend} style={{padding: '5px 10px', fontSize: '1rem'}}>+ Add Friend</button>
                
                {profile.requests.length > 0 && (
                  <div style={{marginTop: 20}}>
                    <h3 style={{color: 'var(--gold)'}}>Friend Requests</h3>
                    {profile.requests.map(req => (
                      <div key={req.id} style={{display: 'flex', justifyContent: 'space-between', padding: 5, background: 'rgba(0,0,0,0.2)'}}>
                        <span>{req.user.username}</span>
                        <button onClick={() => acceptFriend(req.id)} style={{background: 'green', color: 'white'}}>Accept</button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{marginTop: 20}}>
                  <h3 style={{color: 'var(--gold)'}}>My Friends</h3>
                  {profile.friends.map(f => (
                    <div key={f.id} style={{padding: 5, borderBottom: '1px solid gray'}}>
                      {f.friend.username} (W: {f.friend.wins} L: {f.friend.losses})
                    </div>
                  ))}
                  {profile.friends.length === 0 && <p>No friends yet. Sad!</p>}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

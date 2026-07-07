import React from 'react';
import './index.css';

export default function TournamentBracket({ bracket }) {
  if (!bracket) return null;

  const renderSeat = (player, index) => {
    if (!player) {
      return (
        <li key={`empty-${index}`} className="bracket-seat empty">
          <span style={{color: 'rgba(255,255,255,0.3)', fontStyle: 'italic'}}>— Empty Seat —</span>
        </li>
      );
    }
    return (
      <li key={player.id} className={`bracket-seat ${player.isEliminated ? 'eliminated' : player.isAdvancing ? 'advancing' : ''}`}>
        <span className="bracket-player-name">{player.username}</span>
        <span className="bracket-player-score">{player.score} pts</span>
      </li>
    );
  };

  const renderTable = (tableInfo, label, roundLabel) => {
    const seats = [0, 1, 2, 3];
    
    if (!tableInfo || tableInfo.players.length === 0) {
      return (
        <div className="bracket-table empty">
          <div className="bracket-table-header">{label}</div>
          <ul className="bracket-players">
            {seats.map(i => renderSeat(null, i))}
          </ul>
        </div>
      );
    }

    const isLive = tableInfo.state !== 'GAME_OVER' && tableInfo.state !== 'WAITING';
    const isFinished = tableInfo.state === 'GAME_OVER';

    return (
      <div className={`bracket-table ${isLive ? 'live' : ''} ${isFinished ? 'finished' : ''}`}>
        <div className="bracket-table-header">{label}</div>
        {isLive && <span className="status-badge live">● LIVE</span>}
        {isFinished && <span className="status-badge over">FINISHED</span>}
        <ul className="bracket-players">
          {seats.map(i => renderSeat(tableInfo.players[i], i))}
        </ul>
      </div>
    );
  };

  return (
    <div className="bracket-container">
      <div className="bracket-layout">
        {/* Quarterfinals */}
        <div className="bracket-col">
          <div className="bracket-round-label">QUARTERFINALS</div>
          {renderTable(bracket.round === 1 ? bracket.tables[0] : null, "Table 1")}
          {renderTable(bracket.round === 1 ? bracket.tables[1] : null, "Table 2")}
          {renderTable(bracket.round === 1 ? bracket.tables[2] : null, "Table 3")}
          {renderTable(bracket.round === 1 ? bracket.tables[3] : null, "Table 4")}
        </div>
        
        {/* Connector */}
        <div className="bracket-connector">
          <div className="connector-line"></div>
          <div className="connector-line"></div>
        </div>

        {/* Semifinals */}
        <div className="bracket-col">
          <div className="bracket-round-label">SEMIFINALS</div>
          {renderTable(bracket.round === 2 ? bracket.tables[0] : null, "Semi 1")}
          {renderTable(bracket.round === 2 ? bracket.tables[1] : null, "Semi 2")}
        </div>
        
        {/* Connector */}
        <div className="bracket-connector">
          <div className="connector-line"></div>
        </div>

        {/* Championship */}
        <div className="bracket-col">
          <div className="bracket-round-label">🏆 CHAMPIONSHIP</div>
          {renderTable(bracket.round === 3 ? bracket.tables[0] : null, "Final Table")}
        </div>
      </div>
    </div>
  );
}

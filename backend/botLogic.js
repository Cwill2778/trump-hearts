const ranks = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

const getMoonPotential = (hand) => {
  let score = 0;
  hand.forEach(c => {
    const r = ranks[c[0]];
    if (r >= 12) score += 3; // Face cards
    else if (r >= 10) score += 1; // Tens, Jacks
    if (c === 'QS' || c === 'KS' || c === 'AS') score += 2;
    if (c[1] === 'H' && r >= 10) score += 1;
  });
  return score > 22; // Arbitrary threshold for shooting the moon
};

const getCardsToPass = (hand) => {
  const isShootingMoon = getMoonPotential(hand);
  let sortedHand = [...hand].sort((a, b) => ranks[a[0]] - ranks[b[0]]);
  
  if (isShootingMoon) {
    // Pass lowest cards
    return sortedHand.slice(0, 3);
  } else {
    // Try to pass dangerous cards: QS, AS, KS, AH, KH
    const dangerous = ['QS', 'AS', 'KS', 'AH', 'KH', 'QH'];
    let toPass = [];
    
    // 1. Pass dangerous cards
    dangerous.forEach(d => {
      if (hand.includes(d) && toPass.length < 3) toPass.push(d);
    });
    
    // 2. Try to void a suit if we have 1 or 2 cards in it (and they aren't safe low spades if we hold QS)
    if (toPass.length < 3) {
      const suits = { 'C': [], 'D': [], 'H': [], 'S': [] };
      hand.forEach(c => { if (!toPass.includes(c)) suits[c[1]].push(c); });
      
      const suitCounts = Object.entries(suits).sort((a, b) => a[1].length - b[1].length);
      for (const [suit, cards] of suitCounts) {
        if (cards.length > 0 && cards.length <= 3 && toPass.length < 3) {
          // Don't bleed spades if we hold QS
          if (suit === 'S' && hand.includes('QS')) continue; 
          cards.sort((a, b) => ranks[b[0]] - ranks[a[0]]); // Pass highest of the short suit
          for (const c of cards) {
            if (toPass.length < 3) toPass.push(c);
          }
        }
      }
    }
    
    // 3. Just pass the highest remaining cards
    sortedHand.reverse();
    for (const c of sortedHand) {
      if (toPass.length < 3 && !toPass.includes(c)) {
        toPass.push(c);
      }
    }
    return toPass;
  }
};

const getCardToPlay = (hand, validCards, currentTrick, isHeartsBroken) => {
  const isShootingMoon = getMoonPotential(hand);
  
  // If first to play
  if (currentTrick.length === 0) {
    if (validCards.length === 1) return validCards[0];
    
    // Lead low if playing safe, lead high if shooting moon
    let sorted = [...validCards].sort((a, b) => ranks[a[0]] - ranks[b[0]]);
    if (isShootingMoon) {
      return sorted[sorted.length - 1]; // highest valid
    } else {
      // Avoid leading dangerous suits if playing safe
      const safeLeads = sorted.filter(c => c[1] !== 'H' && c !== 'QS');
      return safeLeads.length > 0 ? safeLeads[0] : sorted[0];
    }
  }

  // If following
  const leadSuit = currentTrick[0].card[1];
  let highestRankInTrick = -1;
  currentTrick.forEach(p => {
    if (p.card[1] === leadSuit && ranks[p.card[0]] > highestRankInTrick) {
      highestRankInTrick = ranks[p.card[0]];
    }
  });

  const hasLeadSuit = validCards.some(c => c[1] === leadSuit);

  if (hasLeadSuit) {
    if (isShootingMoon) {
      // Try to win the trick
      let sorted = [...validCards].sort((a, b) => ranks[a[0]] - ranks[b[0]]);
      return sorted[sorted.length - 1]; 
    } else {
      // Try to duck (play highest card that is still lower than the highest in trick)
      let duckingCards = validCards.filter(c => ranks[c[0]] < highestRankInTrick);
      if (duckingCards.length > 0) {
        duckingCards.sort((a, b) => ranks[a[0]] - ranks[b[0]]);
        return duckingCards[duckingCards.length - 1]; // highest safe card
      } else {
        // Can't duck, must take the trick. Play the highest card to dump it!
        // (Wait, actually play highest to not win future tricks, but it wins this trick anyway)
        let sorted = [...validCards].sort((a, b) => ranks[a[0]] - ranks[b[0]]);
        return sorted[sorted.length - 1];
      }
    }
  } else {
    // Void in lead suit!
    if (isShootingMoon) {
      // Dump lowest non-point cards
      let sorted = [...validCards].sort((a, b) => ranks[a[0]] - ranks[b[0]]);
      const nonPoints = sorted.filter(c => c[1] !== 'H' && c !== 'QS');
      return nonPoints.length > 0 ? nonPoints[0] : sorted[0];
    } else {
      // Dump QS!
      if (validCards.includes('QS')) return 'QS';
      // Dump highest Heart
      const hearts = validCards.filter(c => c[1] === 'H').sort((a, b) => ranks[b[0]] - ranks[a[0]]);
      if (hearts.length > 0) return hearts[0];
      // Dump highest card otherwise
      let sorted = [...validCards].sort((a, b) => ranks[b[0]] - ranks[a[0]]);
      return sorted[0];
    }
  }
};

module.exports = {
  getCardsToPass,
  getCardToPlay
};

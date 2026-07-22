const fs = require("fs");
const path = require("path");
const gameEngine = require("../web_play/game.js");

const scoringPath = path.join(__dirname, "..", "web_play", "scoring_overrides.json");
if (fs.existsSync(scoringPath)) {
  gameEngine.applyCardOverrides(JSON.parse(fs.readFileSync(scoringPath, "utf8")));
}

const args = new Map(process.argv.slice(2).map(arg => {
  const [key, value = ""] = arg.replace(/^--/, "").split("=");
  return [key, value];
}));

const gamesPerCount = Number(args.get("games") || 1000);
const playerCounts = String(args.get("players") || "2,3,4").split(",").map(Number).filter(Number.isFinite);
let seedState = Number(args.get("seed") || 130013);
const originalRandom = Math.random;

function seededRandom() {
  seedState = (seedState * 1664525 + 1013904223) >>> 0;
  return seedState / 0x100000000;
}

Math.random = seededRandom;

const cardStats = new Map(gameEngine.CARDS.map(card => [card.id, {
  id: card.id,
  name: card.name,
  type: card.type,
  qty: card.qty,
  played: 0,
  active: 0,
  destroyed: 0,
  points: 0,
  winnerBoards: 0,
  winsWithCard: 0,
}]));

const global = {
  version: "V13",
  generatedAt: new Date().toISOString(),
  gamesPerPlayerCount: gamesPerCount,
  playerCounts,
  deckTotal: gameEngine.deckTotal(),
  handSize: gameEngine.HAND_SIZE,
  totalGames: 0,
  byPlayerCount: {},
};

for (const playersCount of playerCounts) {
  global.byPlayerCount[playersCount] = runBatch(playersCount, gamesPerCount);
}

const totalGames = global.totalGames;
global.cards = [...cardStats.values()]
  .map(stat => ({
    id: stat.id,
    name: stat.name,
    type: stat.type,
    qty: stat.qty,
    played: stat.played,
    playedPerGame: round(stat.played / totalGames),
    destroyedPct: pct(stat.destroyed, stat.played),
    avgPointsWhenPlayed: round(stat.points / Math.max(1, stat.played)),
    winnerBoardPct: pct(stat.winnerBoards, totalGames),
    winRateWhenPlayed: pct(stat.winsWithCard, stat.played),
  }))
  .sort((a, b) => b.avgPointsWhenPlayed - a.avgPointsWhenPlayed || b.played - a.played);

global.signals = {
  strongestAvgPoints: global.cards.filter(card => card.played >= Math.max(20, totalGames * 0.03)).slice(0, 12),
  weakestAvgPoints: [...global.cards]
    .filter(card => card.played >= Math.max(20, totalGames * 0.03))
    .sort((a, b) => a.avgPointsWhenPlayed - b.avgPointsWhenPlayed || b.played - a.played)
    .slice(0, 12),
  mostPresentOnWinningBoards: [...global.cards]
    .sort((a, b) => b.winnerBoardPct - a.winnerBoardPct || b.avgPointsWhenPlayed - a.avgPointsWhenPlayed)
    .slice(0, 12),
};

const outputDir = path.join(__dirname, "..", "outputs");
fs.mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, "balance_stats_v13.json");
fs.writeFileSync(outputPath, `${JSON.stringify(global, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  version: global.version,
  totalGames: global.totalGames,
  deckTotal: global.deckTotal,
  byPlayerCount: global.byPlayerCount,
  strongestAvgPoints: global.signals.strongestAvgPoints.slice(0, 8),
  weakestAvgPoints: global.signals.weakestAvgPoints.slice(0, 8),
  mostPresentOnWinningBoards: global.signals.mostPresentOnWinningBoards.slice(0, 8),
  outputPath,
}, null, 2));

Math.random = originalRandom;

function runBatch(playersCount, games) {
  const stats = {
    games,
    offerSize: gameEngine.offerSizeForPlayers(playersCount),
    usedCardsPerGame: gameEngine.HAND_SIZE * playersCount,
    scoreWins: 0,
    immediateWins: 0,
    grailWinnerWins: 0,
    avgWinnerScore: 0,
    avgScore: 0,
    avgDestroyedCards: 0,
    winReasons: {},
    seatWins: Array(playersCount).fill(0),
    winnerScores: [],
    allScores: [],
  };

  for (let index = 0; index < games; index++) {
    const game = simulateGame(playersCount);
    global.totalGames++;
    const winner = game.players.find(player => player.id === game.winnerId)
      || [...game.players].sort((a, b) => b.score - a.score || a.index - b.index)[0];
    const reason = game.winReason || "score";
    stats.winReasons[reason] = (stats.winReasons[reason] || 0) + 1;
    if (reason === "score") stats.scoreWins++;
    else stats.immediateWins++;
    if (winner?.grail) stats.grailWinnerWins++;
    if (winner) stats.seatWins[winner.index]++;

    const destroyed = game.players.reduce((sum, player) => sum + player.board.filter(cell => cell.destroyed).length, 0);
    stats.avgDestroyedCards += destroyed;
    stats.avgWinnerScore += winner?.score || 0;
    stats.winnerScores.push(winner?.score || 0);
    for (const player of game.players) {
      stats.avgScore += player.score;
      stats.allScores.push(player.score);
      collectCards(player, winner?.id);
    }
  }

  stats.avgWinnerScore = round(stats.avgWinnerScore / games);
  stats.avgScore = round(stats.avgScore / (games * playersCount));
  stats.avgDestroyedCards = round(stats.avgDestroyedCards / games);
  stats.immediateWinPct = pct(stats.immediateWins, games);
  stats.scoreWinPct = pct(stats.scoreWins, games);
  stats.grailWinnerWinPct = pct(stats.grailWinnerWins, games);
  stats.seatWinPct = stats.seatWins.map(value => pct(value, games));
  stats.winnerScoreP10P50P90 = quantiles(stats.winnerScores);
  stats.allScoreP10P50P90 = quantiles(stats.allScores);
  delete stats.winnerScores;
  delete stats.allScores;
  return stats;
}

function simulateGame(playersCount) {
  const players = Array.from({ length: playersCount }, (_, index) => ({
    id: `ai-${index}`,
    name: `IA ${index + 1}`,
    isBot: true,
    botProfile: "best",
  }));
  const game = gameEngine.makeGame(players);
  let steps = 0;
  while (!game.over && steps < 500) {
    const player = gameEngine.currentTurnPlayer(game);
    if (!player) throw new Error(`No current player in phase ${game.phase}.`);
    if (game.phase === "hide") {
      gameEngine.hideCard(game, player.id, chooseHideIndex(game, player));
    } else if (game.phase === "pick") {
      gameEngine.takeCard(game, player.id, chooseTakeIndex(game, player));
    } else if (game.phase === "place") {
      const card = game.pendingPlacement?.card;
      const placement = choosePlacement(game, player, card);
      gameEngine.placeCard(game, player.id, placement.x, placement.y);
    } else {
      throw new Error(`Unknown phase ${game.phase}.`);
    }
    steps++;
  }
  if (steps >= 500) throw new Error("Simulation stopped after 500 steps.");
  return game;
}

function collectCards(player, winnerId) {
  const winner = player.id === winnerId;
  const seenInBoard = new Set();
  for (const cell of player.board) {
    const stat = cardStats.get(cell.card.id);
    if (!stat) continue;
    const points = cell.destroyed ? 0 : gameEngine.scoreCard(player, cell.card);
    stat.played++;
    stat.points += points;
    if (!cell.destroyed) stat.active++;
    else stat.destroyed++;
    if (winner) {
      stat.winsWithCard++;
      seenInBoard.add(cell.card.id);
    }
  }
  for (const id of seenInBoard) cardStats.get(id).winnerBoards++;
}

function chooseHideIndex(game, player) {
  const pickOrder = pickOrderAfterHide(game).filter(index => game.players[index]?.id !== player.id);
  return bestIndex(game.offer.map((card, index) => ({
    index,
    score: hideCardValue(game, player, card, index, pickOrder),
  })));
}

function pickOrderAfterHide(game) {
  if (game.players.length === 2) return [1 - game.active, game.active];
  const order = [];
  for (let i = 1; i < game.players.length; i++) order.push((game.active + i) % game.players.length);
  order.push(game.active);
  return order;
}

function hideCardValue(game, player, card, cardIndex, pickOrder) {
  const myValues = game.offer.map(item => cardValue(game, player, item));
  const myValue = myValues[cardIndex] ?? 0;
  const myBest = Math.max(...myValues);
  const keeperBonus = myValue >= myBest - 2 ? 5 : 0;
  const threats = pickOrder
    .map((playerIndex, orderIndex) => {
      const opponent = game.players[playerIndex];
      if (!opponent) return 0;
      return opponentCardThreat(game, opponent, card, cardIndex, orderIndex);
    })
    .filter(Number.isFinite)
    .sort((a, b) => b - a);
  const biggestThreat = threats[0] || 0;
  const sharedThreat = threats.slice(1).reduce((sum, value) => sum + value, 0) * 0.22;
  return myValue * 0.2 + keeperBonus + biggestThreat * 1.45 + sharedThreat;
}

function opponentCardThreat(game, opponent, card, cardIndex, orderIndex) {
  const values = game.offer.map(item => cardValue(game, opponent, item));
  const value = values[cardIndex] ?? 0;
  const sorted = [...values].sort((a, b) => b - a);
  const best = sorted[0] ?? value;
  const second = sorted.find((_, index) => index > 0) ?? value;
  const average = values.reduce((sum, item) => sum + item, 0) / Math.max(1, values.length);
  const nextPlayerWeight = Math.max(0.9, 1.35 - orderIndex * 0.15);
  let threat = value;
  threat += Math.max(0, value - average) * 0.8;
  if (value >= best - 1) threat += 18;
  if (value - second >= 5) threat += 8;
  if (makesImmediateWin(opponent, card)) threat += 900;
  return threat * nextPlayerWeight;
}

function chooseTakeIndex(game, player) {
  const visibleScores = game.offer
    .map((card, index) => {
      const known = index !== game.hiddenIndex || game.hiddenBy === player.id;
      return known ? cardValue(game, player, card) : null;
    })
    .filter(Number.isFinite);
  const bestVisibleScore = visibleScores.length ? Math.max(...visibleScores) : -Infinity;

  return bestIndex(game.offer.map((card, index) => {
    const known = index !== game.hiddenIndex || game.hiddenBy === player.id;
    return {
      index,
      score: known ? cardValue(game, player, card) : hiddenCardValue(game, player, bestVisibleScore),
    };
  }));
}

function choosePlacement(game, player, card) {
  return bestPlacement(game, player, card).pos || gameEngine.legalPlacements(player)[0] || { x: 0, y: 0 };
}

function bestIndex(items) {
  return items
    .filter(item => Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.index ?? 0;
}

function bestPlacement(game, player, card) {
  const placements = gameEngine.legalPlacements(player);
  return placements
    .map(pos => ({ pos, score: placementValue(game, player, card, pos) }))
    .sort((a, b) => b.score - a.score || a.pos.y - b.pos.y || a.pos.x - b.pos.x)[0] || { pos: placements[0], score: 0 };
}

function placementValue(game, player, card, pos) {
  let value = gameEngine.placementDelta(player, card, pos);
  if (makesImmediateWin(player, card)) value += 1000;
  if (card.id === "tresor") value += treasureBonus(game, player);
  value += strategicBonus(player, card);
  value += birdBonus(player, card);
  value += prudentAdjustment(player, card);
  return value;
}

function cardValue(game, player, card) {
  return bestPlacement(game, player, card).score;
}

function hiddenCardValue(game, player, bestVisibleScore) {
  const unknown = [...game.deck];
  if (game.hiddenIndex >= 0 && game.offer[game.hiddenIndex]) unknown.push(game.offer[game.hiddenIndex]);
  const values = unknown
    .map(card => cardValue(game, player, card))
    .filter(Number.isFinite)
    .sort((a, b) => b - a);
  if (!values.length) return 0;
  const bestSlice = values.slice(0, Math.max(1, Math.ceil(values.length * 0.12)));
  const bestAverage = bestSlice.reduce((sum, value) => sum + value, 0) / bestSlice.length;
  const globalAverage = values.reduce((sum, value) => sum + value, 0) / values.length;
  const hasVisibleOption = Number.isFinite(bestVisibleScore);
  const visibleIsWeak = hasVisibleOption && bestVisibleScore <= globalAverage + 1;
  const upsideWeight = visibleIsWeak ? 0.32 : 0.18;
  let riskPenalty = 4.5 + Math.min(3.5, visibleCards(player).length * 0.35);
  if (!hasVisibleOption) riskPenalty -= 2.5;
  else if (bestVisibleScore >= bestAverage - 1) riskPenalty += 3;
  else if (bestVisibleScore >= globalAverage + 5) riskPenalty += 1.5;
  else if (visibleIsWeak) riskPenalty -= 1;
  return bestAverage * upsideWeight + globalAverage * (1 - upsideWeight) - riskPenalty;
}

function visibleCards(player) {
  return player.board.filter(cell => !cell.destroyed).map(cell => cell.card);
}

function cardMatches(card, token) {
  if (token === "Carte au tresor") return card.id === "tresor";
  return card.type === token || card.name === token || card.id === token;
}

function countMatching(player, token) {
  return visibleCards(player).filter(card => cardMatches(card, token)).length;
}

function countAfterCard(player, token, card) {
  return countMatching(player, token) + (cardMatches(card, token) ? 1 : 0);
}

function countType(player, type) {
  return visibleCards(player).filter(card => card.type === type).length;
}

function makesImmediateWin(player, card) {
  return countType(player, "Oiseau") + (card.type === "Oiseau" ? 1 : 0) >= 4;
}

function treasureBonus(game, player) {
  const mine = countMatching(player, "Carte au tresor") + 1;
  const otherMax = Math.max(0, ...game.players.filter(item => item.id !== player.id).map(item => countMatching(item, "Carte au tresor")));
  return mine > otherMax ? 10 : 2;
}

function synergyBonus(player, card) {
  let bonus = 0;
  for (const existing of visibleCards(player)) {
    for (const token of existing.pos || []) {
      if (cardMatches(card, token)) bonus += 1.5;
    }
  }
  if (card.mode === "threshold" && card.pos?.length && countAfterCard(player, card.pos[0], card) >= card.threshold) bonus += 6;
  if (card.mode === "minCount" && card.pos?.length && countMatching(player, card.pos[0]) >= card.threshold) bonus += 6;
  return bonus;
}

function strategicBonus(player, card) {
  let bonus = synergyBonus(player, card) * 0.8;
  if (card.mode === "kingdom") {
    for (const token of card.pos || []) bonus += Math.min(6, countAfterCard(player, token, card) * 1.4);
  }
  if (card.mode === "adjacent") {
    for (const token of card.pos || []) bonus += Math.min(4, countAfterCard(player, token, card));
  }
  if (card.mode === "threshold" && card.pos?.length) {
    const missing = card.threshold - countAfterCard(player, card.pos[0], card);
    if (missing <= 0) bonus += 8;
    else if (missing === 1) bonus += 5;
    else if (missing === 2) bonus += 2;
  }
  if (card.id === "bouffon") bonus += countMatching(player, "Barde") >= 2 ? 8 : countMatching(player, "Barde") * 2;
  if (card.id === "barde" && countMatching(player, "Bouffon")) bonus += 8;
  if (card.type === "Batiment" && countMatching(player, "Temple")) bonus += 3;
  if (card.type === "Oiseau" && countMatching(player, "magicien")) bonus += 3;
  return bonus;
}

function birdBonus(player, card) {
  if (card.type !== "Oiseau") return card.antiHeron ? 4 : 0;
  const birds = countType(player, "Oiseau") + 1;
  return birds >= 4 ? 500 : 28 + birds * 4;
}

function prudentAdjustment(player, card) {
  let penalty = 0;
  for (const token of card.neg || []) penalty += 3 + countMatching(player, token) * 2;
  if (card.type === "Oiseau" && !makesImmediateWin(player, card)) penalty += 4;
  return -penalty;
}

function pct(value, total) {
  return round((value / Math.max(1, total)) * 100);
}

function round(value) {
  return Number(Number(value || 0).toFixed(2));
}

function quantiles(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p10: sorted[Math.floor(sorted.length * 0.1)] ?? 0,
    p50: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
    p90: sorted[Math.floor(sorted.length * 0.9)] ?? 0,
  };
}

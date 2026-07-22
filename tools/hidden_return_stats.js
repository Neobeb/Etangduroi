const gameEngine = require("../web_play/game.js");
const {
  chooseHideIndex,
  chooseTakeIndex,
  choosePlacement,
  isBotReservation,
  cardValue,
} = require("../server.js");

function bestKnownIndex(game, player) {
  return game.offer
    .map((card, index) => ({ index, score: cardValue(game, player, card) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.index ?? 0;
}

function playDiagnosticGame(playersCount) {
  const players = Array.from({ length: playersCount }, (_, index) => ({
    id: index === 0 ? "human" : `bot-${index}`,
    name: index === 0 ? "Humain" : `IA ${index}`,
    isBot: index !== 0,
  }));
  const game = gameEngine.makeGame(players, { startingPlayerIndex: 0 });
  let firstHiddenResolved = false;
  let firstHiddenRecovered = false;

  while (!game.over) {
    const player = gameEngine.currentTurnPlayer(game);
    if (!player) break;

    if (game.phase === "hide") {
      if (player.id === "human") {
        gameEngine.hideCard(game, player.id, bestKnownIndex(game, player));
      } else {
        const index = chooseHideIndex(game, player);
        gameEngine.hideCard(game, player.id, index, {
          reservedForHider: isBotReservation(game, player, index),
        });
      }
      continue;
    }

    if (game.phase === "pick") {
      let index;
      if (player.id === "human") {
        index = game.hiddenBy === player.id && game.hiddenIndex >= 0
          ? game.hiddenIndex
          : bestKnownIndex(game, player);
      } else {
        index = chooseTakeIndex(game, player);
      }
      if (game.round === 0 && game.hiddenBy === "human" && game.hiddenIndex === index) {
        firstHiddenResolved = true;
        firstHiddenRecovered = player.id === "human";
      }
      gameEngine.takeCard(game, player.id, index);
      continue;
    }

    if (game.phase === "place") {
      const card = game.pendingPlacement.card;
      const placement = choosePlacement(game, player, card);
      gameEngine.placeCard(game, player.id, placement.x, placement.y);
      continue;
    }

    throw new Error(`Phase inattendue: ${game.phase}`);
  }

  return { stats: game.draftStats, firstHiddenResolved, firstHiddenRecovered };
}

function measure(playersCount, games) {
  let hidden = 0;
  let recovered = 0;
  let firstResolved = 0;
  let firstRecovered = 0;
  for (let index = 0; index < games; index++) {
    const result = playDiagnosticGame(playersCount);
    const stats = result.stats;
    hidden += stats.humanHiddenCards;
    recovered += stats.humanHiddenRecovered;
    if (result.firstHiddenResolved) firstResolved++;
    if (result.firstHiddenRecovered) firstRecovered++;
  }
  return {
    players: playersCount,
    games,
    hidden,
    recovered,
    rate: hidden ? recovered / hidden : 0,
    firstResolved,
    firstRecovered,
    firstRate: firstResolved ? firstRecovered / firstResolved : 0,
  };
}

const games = Math.max(1, Number(process.argv[2] || 1000));
const results = [2, 3, 4].map(playersCount => measure(playersCount, games));

console.table(results.map(result => ({
  joueurs: result.players,
  parties: result.games,
  cachees: result.hidden,
  recuperees: result.recovered,
  taux: `${(result.rate * 100).toFixed(1)}%`,
  premiereRecuperee: `${result.firstRecovered}/${result.firstResolved}`,
  premiereTaux: `${(result.firstRate * 100).toFixed(1)}%`,
})));

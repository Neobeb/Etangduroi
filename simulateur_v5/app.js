const BOARD_W = 4;
const BOARD_H = 3;

const BASE_RULES = {
  handSize: 12,
  roseauxImmediate: 0,
  oiseauxImmediate: 4,
  grailPoints: 10,
  grailStrict: true,
  bardeScores: [10, 6, 3, 1, 0],
  royalPairBonus: 6,
  royalKingBonus: 4,
};

const HIDDEN_RISK_BASE = 7;
const HIDDEN_OPENING_RISK = 2;

const HERON_TARGETS = [
  { id: "topLeft", label: "coin haut gauche", relX: 0, relY: 0 },
  { id: "topRight", label: "coin haut droit", relX: BOARD_W - 1, relY: 0 },
  { id: "bottomLeft", label: "coin bas gauche", relX: 0, relY: BOARD_H - 1 },
  { id: "bottomRight", label: "coin bas droit", relX: BOARD_W - 1, relY: BOARD_H - 1 },
  { id: "centerLeft", label: "centre gauche", relX: 1, relY: 1 },
];

const V14_TYPE_LABELS = { Batiment: "Bâtiment" };
const V14_TOKEN_LABELS = {
  Batiment: "Bâtiment",
  "Carte au tresor": "Carte au trésor",
  "Roseaux fortifies": "Roseaux fortifiés",
};
const V14_CARD_NAMES = {
  tresor: "Carte au trésor",
  roseaux: "Roseaux fortifiés",
  heron: "Héron",
  revolutionnaire: "Révolutionnaire",
  nenuphar: "Nénuphar",
  temple: "Temple",
  gros_oeuf: "Gros Œuf",
};

function simulatorV14Card(card) {
  const mode = card.mode === "barde" ? "set" : card.mode === "royal" ? "presence" : card.mode;
  return {
    ...structuredClone(card),
    name: V14_CARD_NAMES[card.id] || card.name,
    type: V14_TYPE_LABELS[card.type] || card.type,
    mode,
    pos: (card.pos || []).map(token => V14_TOKEN_LABELS[token] || token),
    neg: (card.neg || []).map(token => V14_TOKEN_LABELS[token] || token),
    heronTargets: mode === "heron" && card.heronTarget ? [card.heronTarget] : [...(card.heronTargets || [])],
  };
}

const BASE_CARDS = (globalThis.EtangGame?.CARDS || []).map(simulatorV14Card);
if (!BASE_CARDS.length) throw new Error("Le catalogue V14 n'a pas pu être chargé.");

const BASE_DECK_TOTAL = BASE_CARDS.reduce((sum, card) => sum + Number(card.qty || 0), 0);

const PENALTY_FREE_CARD_TEXT = {
  revolutionnaire: "+15 si 5+ Grenouilles.",
  magicien: "+15 si 2+ Oiseaux.",
  moine: "+15 si 2+ Cartes au trésor.",
  temple: "+15 si 5+ Bâtiments.",
};

function removePerCardPenalty(card) {
  return {
    ...card,
    neg: [],
    negValue: 0,
    text: PENALTY_FREE_CARD_TEXT[card.id] || card.text,
  };
}

const state = {
  cards: migrateCards(structuredClone(BASE_CARDS)),
  rules: structuredClone(BASE_RULES),
  game: null,
  selectedCard: null,
  lastSimulation: null,
  lastBenchmark: null,
};

const BENCH_STRATEGIES = [
  { id: "balanced", label: "Equilibree" },
  { id: "buildings", label: "Batiments" },
  { id: "nobles", label: "Nobles" },
  { id: "treasures", label: "Objets / Tresors" },
  { id: "birds", label: "Oiseaux / Chevaliers" },
  { id: "reeds", label: "Roseaux" },
  { id: "frogs", label: "Grenouilles / Bardes" },
];

const FAMILY_ORDER = ["Bâtiment", "Objet", "Oiseau", "Grenouille", "Noble"];

const COMBO_RULES = [
  { id: "barde_bouffon", label: "Barde + Bouffon", test: deck => deck.ids.bouffon >= 1 && deck.ids.barde >= 3 },
  { id: "oiseaux_chevalier", label: "Oiseaux + Chevalier/Capitaine", test: deck => (deck.ids.chevalier >= 1 || deck.ids.capitaine >= 1) && deck.families.oiseau >= 2 },
  { id: "tresors_moteur", label: "Tresors + moteur", test: deck => deck.ids.tresor >= 2 && (deck.ids.coffre >= 1 || deck.ids.carpographe >= 1 || deck.ids.roi >= 1 || deck.ids.moine >= 1) },
  { id: "grenouilles_revolutionnaire", label: "Grenouilles + Revolutionnaire", test: deck => deck.ids.revolutionnaire >= 1 && deck.families.grenouille >= 5 },
  { id: "batiments_moteur", label: "Batiments + moteur", test: deck => deck.families.batiment >= 5 && (deck.ids.architecte >= 1 || deck.ids.temple >= 1) },
  { id: "oiseaux_magicienne", label: "Oiseaux + Magicienne", test: deck => deck.ids.magicien >= 1 && deck.families.oiseau >= 2 },
];

function numericRule(key, fallback = BASE_RULES[key]) {
  const value = Number(state.rules?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

function intRule(key, fallback = BASE_RULES[key]) {
  return Math.max(0, Math.round(numericRule(key, fallback)));
}

function handSize() {
  return Math.max(1, intRule("handSize", BASE_RULES.handSize));
}

function offerSizeForPlayers(playersCount) {
  return playersCount === 2 ? 3 : playersCount;
}

function immediateThreshold(kind) {
  return Math.max(0, intRule(kind === "roseaux" ? "roseauxImmediate" : "oiseauxImmediate", 4));
}

function immediateEnabled(kind) {
  return immediateThreshold(kind) > 0;
}

function immediateLabel(kind) {
  const threshold = immediateThreshold(kind);
  return threshold > 0 ? `${threshold} ${kind === "roseaux" ? "Roseaux" : "Oiseaux"}` : "désactivée";
}

function isRoseauxWin(win) {
  return String(win || "").includes("Roseaux");
}

function isOiseauxWin(win) {
  return String(win || "").includes("Oiseaux");
}

function isImmediateWin(win) {
  return isRoseauxWin(win) || isOiseauxWin(win);
}

function scoreByCount(values, count) {
  if (!Array.isArray(values) || !values.length || count <= 0) return 0;
  return Number(values[Math.min(count - 1, values.length - 1)] || 0);
}

function parseScoreList(value, fallback) {
  const parsed = String(value)
    .split(/[\/,;\s]+/)
    .map(part => Number(part.trim()))
    .filter(Number.isFinite);
  return parsed.length ? parsed : fallback.slice();
}

function formatScoreList(values) {
  return (values || []).join("/");
}

function signedNumber(value) {
  return `${value >= 0 ? "+" : ""}${value}`;
}

function cardRulesText(card) {
  card = hydrateCard(card);
  if (card.id === "barde") return `1/2/3/4/5+ Bardes: ${formatScoreList(state.rules.bardeScores)}.`;
  if (card.id === "tresor") {
    return `Majorité ${state.rules.grailStrict ? "stricte" : "partagée"}: Graal ${signedNumber(numericRule("grailPoints", BASE_RULES.grailPoints))} global.`;
  }
  if (card.id === "prince") {
    return `${signedNumber(numericRule("royalPairBonus", 6))} si Princesse, ${signedNumber(numericRule("royalKingBonus", 4))} si Roi.`;
  }
  if (card.id === "princesse") {
    return `${signedNumber(numericRule("royalPairBonus", 6))} si Prince, ${signedNumber(numericRule("royalKingBonus", 4))} si Roi.`;
  }
  if (card.mode === "grandDuc") {
    return `1/2/3+ Oiseaux: ${formatScoreList(card.birdScores || [10, 5, 0])} PV.`;
  }
  if (card.mode === "heron") {
    const target = heronTargetLabel(card);
    const targetText = target ? ` Détruit: ${target}.` : " Les exemplaires ciblent les cases indiquées.";
    return `${Number(card.base || 0)} PV.${targetText} Annulé par Chevalier/Capitaine adjacent. Victoire si ${immediateLabel("oiseaux")}.`;
  }
  let text = card.text || "Effet non renseigné.";
  if (card.immediate === "roseaux") text = text.replace(/4 Roseaux/g, immediateLabel("roseaux"));
  if (card.immediate === "oiseaux") text = text.replace(/4 Oiseaux/g, immediateLabel("oiseaux"));
  return text;
}

function hydrateCard(card) {
  if (!card?.id) return card;
  const live = state.cards.find(item => item.id === card.id);
  return live ? {
    ...live,
    uid: card.uid,
    copyIndex: card.copyIndex,
    heronTarget: card.heronTarget,
  } : card;
}

function syncMajorityCardFromRules() {
  const tresor = state.cards.find(card => card.id === "tresor");
  if (tresor) tresor.value = numericRule("grailPoints", BASE_RULES.grailPoints);
}

function migrateCards(cards) {
  return cards.map(card => {
    if (card.id === "chevalier") return { ...card, antiHeron: true };
    if (card.id === "capitaine") return { ...card, antiHeron: true };
    if (card.mode === "heron") return {
      ...card,
      qty: Math.max(0, Number(card.qty || 0)),
      type: "Oiseau",
      base: Number(card.base || 0),
      mode: "heron",
      immediate: "oiseaux",
      heronTargets: card.heronTargets?.length
        ? [...card.heronTargets]
        : card.heronTarget
          ? [card.heronTarget]
          : HERON_TARGETS.map(target => target.id),
    };
    if (["revolutionnaire", "magicien", "moine"].includes(card.id)) return removePerCardPenalty(card);
    if (card.id !== "temple") return card;
    return removePerCardPenalty({
      ...card,
      name: "Temple",
      type: "Bâtiment",
      mode: "threshold",
      pos: ["Bâtiment"],
      value: Number(card.value || 0) || 15,
      threshold: Number(card.threshold || 0) || 5,
    });
  });
}

function cloneCard(card, copyIndex = 0) {
  const copy = { ...card, uid: `${card.id}-${copyIndex}-${Math.random().toString(36).slice(2)}`, copyIndex };
  if (card.mode === "heron") {
    copy.heronTarget = card.heronTarget || card.heronTargets?.[copyIndex] || HERON_TARGETS[copyIndex % HERON_TARGETS.length].id;
  }
  return copy;
}

function deckFromCards(cards) {
  const deck = [];
  for (const card of cards) {
    for (let i = 0; i < Number(card.qty || 0); i++) deck.push(cloneCard(card, i));
  }
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function prepareDeck(cards, players, mode) {
  syncMajorityCardFromRules();
  const full = shuffle(deckFromCards(cards));
  const needed = offerSizeForPlayers(players) * handSize();
  if (mode !== "secure") return full.slice(0, needed);
  const mandatory = [];
  const rest = [];
  let roseaux = 0;
  let oiseaux = 0;
  const roseauxNeeded = immediateThreshold("roseaux");
  const oiseauxNeeded = immediateThreshold("oiseaux");
  for (const card of full) {
    if (roseauxNeeded > 0 && card.id === "roseaux" && roseaux < roseauxNeeded) {
      mandatory.push(card); roseaux++;
    } else if (oiseauxNeeded > 0 && card.type === "Oiseau" && oiseaux < oiseauxNeeded) {
      mandatory.push(card); oiseaux++;
    } else {
      rest.push(card);
    }
  }
  return shuffle([...mandatory, ...rest.slice(0, Math.max(0, needed - mandatory.length))]);
}

function makePlayer(index, human = false, agent = "balanced") {
  return {
    index,
    name: human ? "Vous" : `Agent ${index + 1}`,
    human,
    agent,
    board: [],
    score: 0,
    grail: false,
    win: null,
  };
}

function newGame(playersCount, agent, prep, counterDraft = false) {
  const deck = prepareDeck(state.cards, playersCount, prep);
  const players = Array.from({ length: playersCount }, (_, i) => makePlayer(i, i === 0, agent));
  state.game = {
    players,
    deck,
    round: 0,
    active: 0,
    phase: "draft",
    offer: [],
    hiddenIndex: -1,
    hiddenBy: null,
    pickOrder: [],
    pickCursor: 0,
    pendingPlacement: null,
    counterDraft,
    over: false,
    log: [],
  };
  log(`Nouvelle partie ${playersCount} joueurs, ${deck.length} cartes utilisees sur ${deckTotalCards()}.`);
  log(counterDraft ? "Contre-draft adverse actif." : "Contre-draft adverse inactif.");
  nextDraft();
  renderGame();
}

function log(text) {
  if (!state.game) return;
  state.game.log.unshift(text);
  state.game.log = state.game.log.slice(0, 80);
}

function nextDraft() {
  const g = state.game;
  if (g.over) return;
  if (g.round >= handSize() || g.deck.length === 0) {
    finishGame();
    return;
  }
  const n = offerSizeForPlayers(g.players.length);
  g.offer = g.deck.splice(0, n);
  g.hiddenIndex = -1;
  g.hiddenBy = g.active;
  g.phase = "hide";
  log(`Tour ${g.round + 1}: ${g.players[g.active].name} revele une offre.`);
  const hider = g.players[g.active];
  if (hider.human) {
    renderGame();
    return;
  }
  const human = g.players.find(p => p.human);
  const humanStrategy = human ? inferHumanStrategy(human) : "balanced";
  const hideIdx = g.counterDraft && human && hider.index !== human.index
    ? chooseCounterDraftHiddenIndex(hider, g.offer, human, humanStrategy)
    : chooseHiddenIndex(hider, g.offer, hider.agent);
  hideOfferCard(hideIdx);
}

function beginDraftPick() {
  const g = state.game;
  if (g.players.length === 2) {
    const other = 1 - g.active;
    g.pickOrder = [other, g.active];
  } else {
    g.pickOrder = [];
    for (let i = 1; i < g.players.length; i++) g.pickOrder.push((g.active + i) % g.players.length);
    g.pickOrder.push(g.active);
  }
  g.pickCursor = 0;
  g.phase = "draft";
  proceedAgents();
}

function currentPicker() {
  const g = state.game;
  return g.players[g.pickOrder[g.pickCursor]];
}

function hideOfferCard(offerIdx) {
  const g = state.game;
  if (!g || g.phase !== "hide" || offerIdx < 0 || offerIdx >= g.offer.length) return;
  g.hiddenIndex = offerIdx;
  const hider = g.players[g.active];
  const reservation = !hider.human && hider.agent !== "random"
    ? hiddenReservationDecision(hider.index, g.offer, offerIdx, card => agentKnownCardScore(hider, card, hider.agent))
    : null;
  recordHiddenOffer(g, reservation);
  log(`${g.players[g.active].name} met une carte face cachee.`);
  beginDraftPick();
}

function proceedAgents() {
  const g = state.game;
  if (g.phase === "hide") {
    const hider = g.players[g.active];
    if (hider.human) {
      renderGame();
      return;
    }
    const human = g.players.find(p => p.human);
    const humanStrategy = human ? inferHumanStrategy(human) : "balanced";
    const hideIdx = g.counterDraft && human && hider.index !== human.index
      ? chooseCounterDraftHiddenIndex(hider, g.offer, human, humanStrategy)
      : chooseHiddenIndex(hider, g.offer, hider.agent);
    hideOfferCard(hideIdx);
    return;
  }
  while (!g.over && g.phase === "draft" && g.pickCursor < g.pickOrder.length) {
    const player = currentPicker();
    if (player.human) break;
    const human = g.players.find(p => p.human);
    const humanStrategy = human ? inferHumanStrategy(human) : "balanced";
    const idx = g.counterDraft && human && player.index !== human.index
      ? chooseCounterDraftOfferIndex(player, visibleOfferForPlayer(player.index), human, humanStrategy)
      : chooseOfferIndex(player, visibleOfferForPlayer(player.index), player.agent);
    takeOffer(idx);
  }
  renderGame();
}

function visibleOffer() {
  return visibleOfferForPlayer(null);
}

function visibleOfferForPlayer(playerIndex = null) {
  const g = state.game;
  return g.offer.map((card, idx) => ({
    card,
    idx,
    hidden: idx === g.hiddenIndex && playerIndex !== g.hiddenBy,
  }));
}

function createDraftStats() {
  return {
    hiddenOffered: 0,
    hiddenTaken: 0,
    hiddenTakenByHider: 0,
    unknownHiddenOpportunities: 0,
    unknownHiddenTaken: 0,
    reservations: 0,
    reservationsRecovered: 0,
    hiddenOfferedByPlayer: {},
    hiddenRecoveredByPlayer: {},
  };
}

function draftStats(game) {
  if (!game.draftStats) game.draftStats = createDraftStats();
  return game.draftStats;
}

function hiddenReservationDecision(playerIndex, offerCards, hiddenIndex, scoreCard) {
  if (hiddenIndex < 0 || hiddenIndex >= offerCards.length) return null;
  const values = offerCards.map(scoreCard);
  const selectedValue = values[hiddenIndex];
  const bestValue = Math.max(...values);
  if (!Number.isFinite(selectedValue) || selectedValue < bestValue - 2) return null;
  return { playerIndex, cardUid: offerCards[hiddenIndex].uid };
}

function recordHiddenOffer(game, reservation = null) {
  const stats = draftStats(game);
  stats.hiddenOffered++;
  const hiderKey = String(game.hiddenBy);
  stats.hiddenOfferedByPlayer[hiderKey] = Number(stats.hiddenOfferedByPlayer[hiderKey] || 0) + 1;
  game.hiddenReservation = reservation;
  if (reservation) stats.reservations++;
}

function recordOfferTake(game, playerIndex, offerIndex) {
  const stats = draftStats(game);
  const wasHidden = game.hiddenIndex === offerIndex;
  const unknownHiddenAvailable = game.hiddenIndex >= 0 && game.hiddenBy !== playerIndex;
  if (unknownHiddenAvailable) stats.unknownHiddenOpportunities++;
  if (!wasHidden) return;
  stats.hiddenTaken++;
  if (game.hiddenBy === playerIndex) {
    stats.hiddenTakenByHider++;
    const hiderKey = String(playerIndex);
    stats.hiddenRecoveredByPlayer[hiderKey] = Number(stats.hiddenRecoveredByPlayer[hiderKey] || 0) + 1;
  }
  else stats.unknownHiddenTaken++;
  if (game.hiddenReservation?.playerIndex === playerIndex
    && game.hiddenReservation?.cardUid === game.offer[offerIndex]?.uid) {
    stats.reservationsRecovered++;
  }
  game.hiddenReservation = null;
}

function takeOffer(offerIdx) {
  const g = state.game;
  const player = currentPicker();
  const card = g.offer[offerIdx];
  const offerBefore = g.offer.slice();
  const hiddenBefore = g.hiddenIndex;
  recordOfferTake(g, player.index, offerIdx);
  g.offer.splice(offerIdx, 1);
  if (g.hiddenIndex === offerIdx) g.hiddenIndex = -1;
  if (g.hiddenIndex > offerIdx) g.hiddenIndex--;
  log(`${player.name} prend ${card.name}.`);
  g.phase = "placement";
  g.pendingPlacement = { playerIndex: player.index, card, offerBefore, hiddenBefore };
  if (!player.human) {
    autoPlace(player, card);
    afterPlacement(player, card);
  } else {
    renderGame();
  }
}

function afterPlacement(player, card) {
  const g = state.game;
  const immediate = checkImmediate(player);
  if (immediate) {
    player.win = immediate;
    g.over = true;
    log(`${player.name} gagne immédiatement (${immediate}).`);
    scoreAll();
    renderGame();
    return;
  }
  g.pendingPlacement = null;
  g.pickCursor++;
  g.phase = "draft";
  if (g.pickCursor >= g.pickOrder.length) {
    discardRemainingOffer();
    g.round++;
    g.active = (g.active + 1) % g.players.length;
    nextDraft();
  } else {
    proceedAgents();
  }
}

function discardRemainingOffer() {
  const g = state.game;
  if (!g?.offer?.length) return;
  const discarded = g.offer.splice(0);
  g.hiddenIndex = -1;
  const names = discarded.map(card => card.name).join(", ");
  log(`${names} ${discarded.length > 1 ? "sont defaussees" : "est defaussee"}.`);
}

function cancelHumanChoice() {
  const g = state.game;
  const pending = g?.pendingPlacement;
  if (!pending) return;
  const player = g.players[pending.playerIndex];
  if (!player?.human) return;
  g.offer = pending.offerBefore.slice();
  g.hiddenIndex = pending.hiddenBefore;
  g.pendingPlacement = null;
  g.phase = "draft";
  log(`${player.name} annule son choix.`);
  renderGame();
}

function countInKingdom(player, token) {
  return boardCards(player).filter(c => matches(c, token)).length;
}

function matches(card, token) {
  if (!card || !token) return false;
  if (token === "Trésor") return card.id === "tresor";
  if (token === "Carte au trésor") return card.id === "tresor";
  if (token === "Graal") return false;
  if (token === "Coin" || token === "Centre") return false;
  return card.type === token || card.name === token || card.id === normalizeId(token);
}

function normalizeId(name) {
  return String(name).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function boardEntries(player, { includeDestroyed = false } = {}) {
  return player.board
    .filter(cell => includeDestroyed || !cell.destroyed)
    .map(cell => ({ ...cell, card: hydrateCard(cell.card) }));
}

function boardCards(player, options) {
  return boardEntries(player, options).map(cell => cell.card);
}

function getBoardEntry(player, x, y, { includeDestroyed = false } = {}) {
  const cell = player.board.find(entry => entry.x === x && entry.y === y && (includeDestroyed || !entry.destroyed));
  return cell ? { ...cell, card: hydrateCard(cell.card) } : null;
}

function getBoardCard(player, x, y, options) {
  return getBoardEntry(player, x, y, options)?.card || null;
}

function placeBoardCard(player, x, y, card) {
  player.board.push({ x, y, card });
}

function removeBoardCard(player, x, y) {
  const index = player.board.findIndex(cell => cell.x === x && cell.y === y);
  if (index >= 0) player.board.splice(index, 1);
}

function neighbors(player, x, y) {
  const coords = [[x+1,y], [x-1,y], [x,y+1], [x,y-1]];
  return coords.map(([cx, cy]) => getBoardCard(player, cx, cy)).filter(Boolean);
}

function findCard(player, uid) {
  const cell = player.board.find(entry => entry.card.uid === uid && !entry.destroyed);
  return cell ? { x: cell.x, y: cell.y } : null;
}

function boardBoundsFromCells(cells) {
  const occupied = cells.map(cell => ({ x: cell.x, y: cell.y }));
  if (!occupied.length) return null;
  return {
    minX: Math.min(...occupied.map(p => p.x)),
    maxX: Math.max(...occupied.map(p => p.x)),
    minY: Math.min(...occupied.map(p => p.y)),
    maxY: Math.max(...occupied.map(p => p.y)),
  };
}

function boardBounds(player) {
  return boardBoundsFromCells(player.board);
}

function fitsBoardLimit(cells) {
  const bounds = boardBoundsFromCells(cells);
  if (!bounds) return true;
  return (bounds.maxX - bounds.minX + 1) <= BOARD_W && (bounds.maxY - bounds.minY + 1) <= BOARD_H;
}

function legalPlacements(player) {
  if (player.board.length === 0) return [{ x: 0, y: 0 }];
  const candidates = new Map();
  for (const cell of player.board) {
    for (const [x, y] of [[cell.x + 1, cell.y], [cell.x - 1, cell.y], [cell.x, cell.y + 1], [cell.x, cell.y - 1]]) {
      if (getBoardCard(player, x, y)) continue;
      candidates.set(`${x},${y}`, { x, y });
    }
  }
  return [...candidates.values()].filter(pos => fitsBoardLimit([...player.board, { x: pos.x, y: pos.y, card: null }]));
}

function isDynamicCorner(player, pos) {
  const bounds = boardBounds(player);
  if (!bounds || !pos) return false;
  return (pos.x === bounds.minX || pos.x === bounds.maxX) && (pos.y === bounds.minY || pos.y === bounds.maxY);
}

function isDynamicCenter(player, pos) {
  const bounds = boardBounds(player);
  if (!bounds || !pos) return false;
  const width = bounds.maxX - bounds.minX + 1;
  const height = bounds.maxY - bounds.minY + 1;
  const centerXs = width % 2 === 1
    ? [bounds.minX + Math.floor(width / 2)]
    : [bounds.minX + width / 2 - 1, bounds.minX + width / 2];
  const centerYs = height % 2 === 1
    ? [bounds.minY + Math.floor(height / 2)]
    : [bounds.minY + height / 2 - 1, bounds.minY + height / 2];
  return centerXs.includes(pos.x) && centerYs.includes(pos.y);
}

function heronTargetById(targetId) {
  return HERON_TARGETS.find(target => target.id === targetId) || null;
}

function heronTargetLabel(card) {
  return heronTargetById(card?.heronTarget)?.label || "";
}

function heronTargetCoord(bounds, targetId) {
  const target = heronTargetById(targetId);
  if (!bounds || !target) return null;
  return { x: bounds.minX + target.relX, y: bounds.minY + target.relY };
}

function isAntiHeronCard(card) {
  return card?.antiHeron || card?.id === "chevalier" || card?.id === "capitaine";
}

function isHeronBlocked(player, cell) {
  return neighbors(player, cell.x, cell.y).some(isAntiHeronCard);
}

function countCornerMatches(player, token) {
  return boardEntries(player).filter(cell => matches(cell.card, token) && isDynamicCorner(player, cell)).length;
}

function applyHeronDestruction(player) {
  const bounds = boardBounds(player);
  if (!bounds) return [];
  const toDestroy = new Map();
  const herons = boardEntries(player).filter(cell => cell.card.mode === "heron");
  for (const heron of herons) {
    if (isHeronBlocked(player, heron)) continue;
    const target = heronTargetCoord(bounds, heron.card.heronTarget);
    if (!target) continue;
    const targetEntry = getBoardEntry(player, target.x, target.y);
    if (!targetEntry) continue;
    toDestroy.set(`${target.x},${target.y}`, {
      target,
      card: targetEntry.card,
      heron,
    });
  }
  const destructions = [];
  for (const entry of toDestroy.values()) {
    const cell = player.board.find(item => item.x === entry.target.x && item.y === entry.target.y);
    if (!cell || cell.destroyed) continue;
    cell.destroyed = true;
    cell.destroyedBy = entry.heron.card.uid;
    destructions.push(entry);
  }
  return destructions;
}

function applyEndOfGameEffects(game) {
  if (!game || game.heronDestructionApplied) return;
  game.heronDestructions = [];
  for (const player of game.players) {
    const destructions = applyHeronDestruction(player);
    game.heronDestructions.push(...destructions.map(entry => ({
      player: player.name,
      card: entry.card.name,
      target: heronTargetLabel(entry.heron.card),
    })));
  }
  game.heronDestructionApplied = true;
  if (game.heronDestructions.length) {
    log(`Oiseaux: ${game.heronDestructions.length} carte(s) détruite(s) avant scoring.`);
  }
}

function autoPlace(player, card) {
  const spots = legalPlacements(player);
  let best = spots[0];
  let bestScore = -Infinity;
  const before = playerBoardScore(player);
  for (const spot of spots) {
    placeBoardCard(player, spot.x, spot.y, card);
    const val = playerBoardScore(player) - before;
    removeBoardCard(player, spot.x, spot.y);
    if (val > bestScore) {
      bestScore = val;
      best = spot;
    }
  }
  if (best) {
    placeBoardCard(player, best.x, best.y, card);
    log(`${player.name} place ${card.name}.`);
  }
}

function playerBoardScore(player) {
  return boardCards(player).reduce((sum, card) => sum + scoreCard(player, card), 0);
}

function bestPlacementDelta(player, card) {
  const spots = legalPlacements(player);
  if (!spots.length) return 0;
  const before = playerBoardScore(player);
  let best = -Infinity;
  for (const spot of spots) {
    placeBoardCard(player, spot.x, spot.y, card);
    best = Math.max(best, playerBoardScore(player) - before);
    removeBoardCard(player, spot.x, spot.y);
  }
  return best;
}

function scoreCard(player, card) {
  card = hydrateCard(card);
  const pos = findCard(player, card.uid);
  const adj = pos ? neighbors(player, pos.x, pos.y) : [];
  let score = Number(card.base || 0);
  switch (card.mode) {
    case "position":
      if (card.pos.includes("Coin") && isDynamicCorner(player, pos)) score += Number(card.value || 0);
      if (card.pos.includes("Centre") && isDynamicCenter(player, pos)) score += Number(card.value || 0);
      break;
    case "cornerSet":
      for (const token of card.pos) score += countCornerMatches(player, token) * Number(card.value || 0);
      break;
    case "kingdom":
      for (const token of card.pos) score += countInKingdom(player, token) * Number(card.value || 0);
      break;
    case "adjacent":
      for (const token of card.pos) score += adj.filter(c => matches(c, token)).length * Number(card.value || 0);
      break;
    case "mixed":
      for (const token of card.pos) score += adj.filter(c => matches(c, token)).length * Number(card.value || 0);
      for (const token of card.neg) score -= adj.filter(c => matches(c, token)).length * Number(card.negValue || card.value || 0);
      break;
    case "mixedKingdomAdj":
      for (const token of card.pos) score += countInKingdom(player, token) * Number(card.value || 0);
      for (const token of card.neg) score -= adj.filter(c => matches(c, token)).length * Number(card.negValue || 0);
      break;
    case "threshold":
      if (countInKingdom(player, card.pos[0]) >= Number(card.threshold || 0)) score += Number(card.value || 0);
      for (const token of card.neg) score -= countInKingdom(player, token) * Number(card.negValue || 0);
      break;
    case "grail":
      if (player.grail) score += Number(card.value || 0);
      for (const token of card.neg) score -= countInKingdom(player, token) * Number(card.negValue || 0);
      break;
    case "presence":
      if (card.id === "prince") {
        if (countInKingdom(player, "Princesse")) score += numericRule("royalPairBonus", 6);
        if (countInKingdom(player, "Roi")) score += numericRule("royalKingBonus", 4);
      } else if (card.id === "princesse") {
        if (countInKingdom(player, "Prince")) score += numericRule("royalPairBonus", 6);
        if (countInKingdom(player, "Roi")) score += numericRule("royalKingBonus", 4);
      }
      break;
    case "set": {
      const n = countInKingdom(player, "Barde");
      score += scoreByCount(state.rules.bardeScores, n);
      break;
    }
    case "minCount":
      if (countInKingdom(player, card.pos[0]) >= Number(card.threshold || 0)) score += Number(card.value || 0);
      break;
    case "grandDuc":
      score += scoreByCount(card.birdScores || [10, 5, 0], countInKingdom(player, "Oiseau"));
      break;
    case "heron":
      break;
    case "majority":
      break;
  }
  return card.floor ? Math.max(score, Number(card.floor || 0)) : score;
}

function assignGrail(players) {
  let max = -1;
  let winners = [];
  for (const p of players) {
    p.grail = false;
    const count = countInKingdom(p, "Carte au trésor");
    if (count > max) { max = count; winners = [p]; }
    else if (count === max) winners.push(p);
  }
  if (max > 0 && (!state.rules.grailStrict || winners.length === 1)) {
    for (const winner of winners) winner.grail = true;
  }
}

function scoreAll() {
  const players = state.game.players;
  assignGrail(players);
  for (const p of players) {
    let total = 0;
    for (const card of boardCards(p)) total += scoreCard(p, card);
    if (p.grail) total += numericRule("grailPoints", BASE_RULES.grailPoints);
    p.score = total;
  }
}

function finishGame(render = true) {
  const g = state.game;
  applyEndOfGameEffects(g);
  scoreAll();
  g.over = true;
  g.phase = "done";
  const best = Math.max(...g.players.map(p => p.score));
  for (const p of g.players.filter(p => p.score === best)) p.win = p.win || "score";
  log(`Fin de partie. Meilleur score: ${best}.`);
  if (render) renderGame();
}

function checkImmediate(player) {
  if (immediateEnabled("roseaux") && countInKingdom(player, "Roseaux fortifiés") >= immediateThreshold("roseaux")) return immediateLabel("roseaux");
  if (immediateEnabled("oiseaux") && countInKingdom(player, "Oiseau") >= immediateThreshold("oiseaux")) return immediateLabel("oiseaux");
  return null;
}

function cardPotential(card) {
  let v = Number(card.base || 0);
  v += Number(card.floor || 0) || 0;
  v += Number(card.value || 0) * (card.mode === "majority" ? 0.35 : 1.5);
  if (card.immediate) v += 5;
  if (card.neg?.length) v -= 2;
  if (card.id === "barde") v += Math.max(...state.rules.bardeScores, 0) * 0.3;
  if (card.mode === "grandDuc") v += Math.max(...(card.birdScores || [10, 5, 0]), 0) * 0.6;
  return v;
}

function agentKnownCardScore(player, card, agent) {
  let score = cardPotential(card);
  const placement = bestPlacementDelta(player, card);
  score = placement * 1.4 + cardPotential(card) * 0.35;
  if (agent === "greedy") score = placement;
  if (agent === "combo") {
    if (immediateEnabled("roseaux") && card.id === "roseaux" && countInKingdom(player, "Roseaux fortifiés") >= immediateThreshold("roseaux") - 1) score += 100;
    if (immediateEnabled("oiseaux") && card.type === "Oiseau" && countInKingdom(player, "Oiseau") >= immediateThreshold("oiseaux") - 1) score += 100;
    for (const c of boardCards(player)) {
      if (c.pos?.some(t => matches(card, t) || card.name === t)) score += 3;
    }
  }
  return score;
}

function publicCardCounts(visibleItems = []) {
  const counts = new Map(state.cards.map(card => [card.id, Number(card.qty || 0)]));
  const seen = [];
  const g = state.game;
  if (g) {
    for (const player of g.players) seen.push(...boardCards(player));
    for (const item of visibleItems) {
      if (!item.hidden) seen.push(item.card);
    }
  }
  for (const card of seen) counts.set(card.id, Math.max(0, (counts.get(card.id) || 0) - 1));
  return counts;
}

function estimateHiddenScore(player, agent, visibleItems) {
  const counts = publicCardCounts(visibleItems);
  let total = 0;
  let weight = 0;
  for (const card of state.cards) {
    const qty = counts.get(card.id) || 0;
    if (!qty) continue;
    total += cardPotential(card) * qty;
    weight += qty;
  }
  const openingPenalty = boardCards(player).length === 0 ? HIDDEN_OPENING_RISK : 0;
  const uncertaintyPenalty = agent === "random" ? 0 : HIDDEN_RISK_BASE + openingPenalty;
  return weight ? (total / weight) - uncertaintyPenalty : 0;
}

function chooseHiddenIndex(player, offerCards, agent) {
  if (agent === "random") return Math.floor(Math.random() * offerCards.length);
  let best = 0;
  let bestScore = -Infinity;
  for (let idx = 0; idx < offerCards.length; idx++) {
    const card = offerCards[idx];
    const denial = cardPotential(card);
    const selfUse = agentKnownCardScore(player, card, agent);
    const score = denial - selfUse * 0.35;
    if (score > bestScore) {
      bestScore = score;
      best = idx;
    }
  }
  return best;
}

function chooseOfferIndex(player, offerItems, agent) {
  const options = offerItems.map(o => o.idx);
  if (agent === "random") return options[Math.floor(Math.random() * options.length)];
  let best = options[0];
  let bestScore = -Infinity;
  for (const idx of options) {
    const item = offerItems.find(o => o.idx === idx);
    if (item.hidden) {
      const score = estimateHiddenScore(player, agent, offerItems);
      if (score > bestScore) {
        bestScore = score;
        best = idx;
      }
      continue;
    }
    const card = item.card;
    const score = agentKnownCardScore(player, card, agent);
    if (score > bestScore) {
      bestScore = score;
      best = idx;
    }
  }
  return best;
}

function countFamily(player, family) {
  return boardCards(player).filter(card => card.type === family).length;
}

function countBuildingStrategyCards(player) {
  return boardCards(player).filter(card => card.type === "Bâtiment" || card.id === "temple").length;
}

function isTreasureStrategyCard(card) {
  return (card.type === "Objet" && card.id !== "temple") || ["carpographe", "roi", "moine"].includes(card.id);
}

function countTreasureStrategyObjects(player) {
  return boardCards(player).filter(card => card.type === "Objet" && card.id !== "temple").length;
}

function countTreasureStrategyCards(player) {
  return boardCards(player).filter(isTreasureStrategyCard).length;
}

function isFrogStrategyCard(card) {
  return card.type === "Grenouille" || card.id === "revolutionnaire";
}

function countFrogStrategyCards(player) {
  return boardCards(player).filter(isFrogStrategyCard).length;
}

function strategyCardScore(player, item, strategy, offerItems) {
  if (item.hidden) {
    return estimateHiddenScore(player, "balanced", offerItems);
  }
  const card = item.card;
  let score = agentKnownCardScore(player, card, "balanced");
  if (strategy === "balanced") return score;

  if (strategy === "buildings") {
    if (card.type === "Bâtiment") score += 12;
    if (card.id === "architecte") score += 10;
    if (card.id === "temple") score += countFamily(player, "Bâtiment") >= Number(card.threshold || 5) - 2 ? 20 : 9;
    if (card.pos?.includes("Bâtiment")) score += 5;
  }

  if (strategy === "nobles") {
    if (card.type === "Noble") score += 10;
    if (["prince", "princesse", "roi"].includes(card.id)) score += 9;
    if (card.pos?.includes("Noble")) score += 4;
  }

  if (strategy === "treasures") {
    const currentTreasures = countInKingdom(player, "Carte au trésor");
    if (card.id === "tresor") score += currentTreasures >= 3 ? 45 : 220 - currentTreasures * 35;
    if (card.type === "Objet" && card.id !== "tresor" && card.id !== "temple") score += currentTreasures >= 2 ? 12 : 3;
    if (card.id === "temple" && card.neg?.length) score -= 18 + countTreasureStrategyObjects(player) * 3;
    if (card.id === "moine") score += currentTreasures >= 2 ? 24 : 6;
    if (["coffre", "carpographe", "roi"].includes(card.id)) score += currentTreasures >= 2 ? 8 : 3;
  }

  if (strategy === "birds") {
    if (card.type === "Oiseau") score += immediateEnabled("oiseaux") && countFamily(player, "Oiseau") >= immediateThreshold("oiseaux") - 2 ? 28 : 12;
    if (card.id === "chevalier") score += 13;
    if (card.id === "capitaine") score += 14;
    if (card.pos?.includes("Oiseau")) score += 6;
  }

  if (strategy === "reeds") {
    if (card.id === "roseaux") score += 16 + countCornerMatches(player, "Roseaux fortifiés") * 4;
  }

  if (strategy === "frogs") {
    if (isFrogStrategyCard(card)) score += 9;
    if (card.id === "barde") score += Math.max(...state.rules.bardeScores, 0) * 1.2;
    if (card.id === "bouffon") score += countInKingdom(player, "Barde") >= Number(card.threshold || 3) - 1 ? 24 : 10;
    if (card.id === "revolutionnaire") score += countFamily(player, "Grenouille") >= Number(card.threshold || 5) - 2 ? 24 : 8;
  }

  return score;
}

function chooseStrategyOfferIndex(player, offerItems, strategy) {
  let best = offerItems[0]?.idx ?? 0;
  let bestScore = -Infinity;
  for (const item of offerItems) {
    const score = strategyCardScore(player, item, strategy, offerItems);
    if (score > bestScore) {
      bestScore = score;
      best = item.idx;
    }
  }
  return best;
}

function chooseStrategyHiddenIndex(player, offerCards, strategy) {
  let best = 0;
  let bestScore = -Infinity;
  for (let idx = 0; idx < offerCards.length; idx++) {
    const card = offerCards[idx];
    const selfUse = strategyCardScore(player, { card, idx, hidden: false }, strategy, []);
    const denial = cardPotential(card);
    const score = denial - selfUse * 0.45;
    if (score > bestScore) {
      bestScore = score;
      best = idx;
    }
  }
  return best;
}

function blockingValue(targetPlayer, card, targetStrategy) {
  let value = Math.max(0, strategyCardScore(targetPlayer, { card, idx: 0, hidden: false }, targetStrategy, []) - agentKnownCardScore(targetPlayer, card, "balanced"));
  if (targetStrategy === "buildings" && (card.type === "Bâtiment" || card.id === "temple")) value += 8;
  if (targetStrategy === "nobles" && card.type === "Noble") value += 8;
  if (targetStrategy === "treasures" && isTreasureStrategyCard(card)) value += 8;
  if (targetStrategy === "frogs" && isFrogStrategyCard(card)) value += 8;
  return value;
}

function immediateThreatValue(targetPlayer, card) {
  const roseauxCount = countInKingdom(targetPlayer, "Roseaux fortifiés");
  const oiseauxCount = countFamily(targetPlayer, "Oiseau");
  if (immediateEnabled("roseaux") && card.id === "roseaux" && roseauxCount >= immediateThreshold("roseaux") - 1) return 1000;
  if (immediateEnabled("oiseaux") && card.type === "Oiseau" && oiseauxCount >= immediateThreshold("oiseaux") - 1) return 1000;
  if (immediateEnabled("roseaux") && card.id === "roseaux" && roseauxCount >= immediateThreshold("roseaux") - 2) return 12;
  if (immediateEnabled("oiseaux") && card.type === "Oiseau" && oiseauxCount >= immediateThreshold("oiseaux") - 2) return 12;
  return 0;
}

function inferHumanStrategy(player) {
  if (countInKingdom(player, "Roseaux fortifiés") >= 2) return "reeds";
  if (immediateEnabled("oiseaux") && countFamily(player, "Oiseau") >= Math.max(1, immediateThreshold("oiseaux") - 2)) return "birds";
  const families = [
    ["buildings", countBuildingStrategyCards(player)],
    ["nobles", countFamily(player, "Noble")],
    ["treasures", countTreasureStrategyCards(player)],
    ["frogs", countFrogStrategyCards(player)],
  ].sort((a, b) => b[1] - a[1]);
  return families[0][1] >= 2 ? families[0][0] : "balanced";
}

function chooseCounterDraftOfferIndex(player, offerItems, targetPlayer, targetStrategy) {
  const normalChoice = chooseOfferIndex(player, offerItems, "balanced");
  let normalScore = -Infinity;
  let best = normalChoice;
  let bestScore = -Infinity;
  for (const item of offerItems) {
    if (item.idx !== normalChoice) continue;
    normalScore = item.hidden ? estimateHiddenScore(player, "balanced", offerItems) : agentKnownCardScore(player, item.card, "balanced");
  }
  for (const item of offerItems) {
    const own = item.hidden ? estimateHiddenScore(player, "balanced", offerItems) : agentKnownCardScore(player, item.card, "balanced");
    const immediateThreat = item.hidden ? 0 : immediateThreatValue(targetPlayer, item.card);
    const block = item.hidden ? 0 : blockingValue(targetPlayer, item.card, targetStrategy);
    const acceptableLoss = immediateThreat >= 1000 ? Infinity : Math.min(3, Math.max(0, block * 0.15));
    if (own < normalScore - acceptableLoss) continue;
    const score = immediateThreat + own + block * 0.15;
    if (score > bestScore) {
      bestScore = score;
      best = item.idx;
    }
  }
  return best;
}

function chooseCounterDraftHiddenIndex(hider, offerCards, targetPlayer, targetStrategy) {
  const normalChoice = chooseStrategyHiddenIndex(hider, offerCards, "balanced");
  const normalOwn = agentKnownCardScore(hider, offerCards[normalChoice], "balanced");
  let best = normalChoice;
  let bestScore = -Infinity;
  for (let idx = 0; idx < offerCards.length; idx++) {
    const card = offerCards[idx];
    const own = agentKnownCardScore(hider, card, "balanced");
    const immediateThreat = immediateThreatValue(targetPlayer, card);
    const block = blockingValue(targetPlayer, card, targetStrategy);
    const acceptableLoss = immediateThreat >= 1000 ? Infinity : Math.min(2, Math.max(0, block * 0.1));
    if (own > normalOwn + acceptableLoss) continue;
    const score = immediateThreat + block * 0.15 - own * 0.15;
    if (score > bestScore) {
      bestScore = score;
      best = idx;
    }
  }
  return best;
}

const SIMPLE_PROFILES = {
  realistic: {
    label: "Table realiste",
    strategies: ["birds", "treasures", "buildings", "frogs"],
    blockImmediate: true,
    opportunisticBirds: true,
  },
  birdHunter: {
    label: "1 chasseur Oiseaux",
    strategies: ["birds", "treasures", "buildings", "frogs"],
    blockImmediate: false,
    opportunisticBirds: false,
  },
  birds: {
    label: "Tout le monde chasse Oiseaux",
    strategies: ["birds"],
    blockImmediate: true,
    opportunisticBirds: true,
  },
  balanced: {
    label: "Standard",
    strategies: ["balanced"],
    blockImmediate: false,
    opportunisticBirds: false,
  },
  combo: {
    label: "Cherche combos",
    strategies: ["combo"],
    blockImmediate: true,
    opportunisticBirds: true,
  },
  random: {
    label: "Hasard",
    strategies: ["random"],
    blockImmediate: false,
    opportunisticBirds: false,
  },
};

function simpleProfileConfig(profile) {
  return SIMPLE_PROFILES[profile] || SIMPLE_PROFILES.realistic;
}

function simpleProfileLabel(profile) {
  return simpleProfileConfig(profile).label;
}

function simpleProfileStrategies(profile, playersCount) {
  const config = simpleProfileConfig(profile);
  if (profile === "realistic" || profile === "birdHunter") {
    if (playersCount === 2) return ["birds", "treasures"];
    if (playersCount === 3) return ["birds", "treasures", "frogs"];
    return ["birds", "treasures", "buildings", "frogs"].slice(0, playersCount);
  }
  return Array.from({ length: playersCount }, (_, index) => config.strategies[index % config.strategies.length]);
}

function profileOfferScore(player, item, strategy, offerItems, profile) {
  if (strategy === "random") return item.hidden ? estimateHiddenScore(player, "random", offerItems) : cardPotential(item.card);
  if (strategy === "combo") {
    const score = item.hidden
      ? estimateHiddenScore(player, "combo", offerItems)
      : agentKnownCardScore(player, item.card, "combo");
    return score + realisticBirdBonus(player, item, profile);
  }
  return strategyCardScore(player, item, strategy, offerItems)
    + realisticBirdBonus(player, item, profile)
    + dedicatedBirdHunterBonus(player, item, strategy, profile);
}

function realisticBirdBonus(player, item, profile = "realistic") {
  if (!simpleProfileConfig(profile).opportunisticBirds || item.hidden || !item.card || !immediateEnabled("oiseaux")) return 0;
  const currentBirds = countFamily(player, "Oiseau");
  if (item.card.type === "Oiseau") {
    if (currentBirds >= immediateThreshold("oiseaux") - 1) return 250;
    if (currentBirds >= immediateThreshold("oiseaux") - 2) return 52;
    if (currentBirds >= 1) return 20;
    return 5;
  }
  if (["chevalier", "capitaine"].includes(item.card.id) && currentBirds >= 1) return 9;
  return 0;
}

function dedicatedBirdHunterBonus(player, item, strategy, profile) {
  if (profile !== "birdHunter" || strategy !== "birds" || item.hidden || !item.card) return 0;
  const currentBirds = countFamily(player, "Oiseau");
  if (item.card.type === "Oiseau") return 80 + currentBirds * 28;
  if (["chevalier", "capitaine"].includes(item.card.id) && currentBirds >= 1) return 14;
  return 0;
}

function maxOpponentImmediateThreat(players, playerIndex, card) {
  let threat = 0;
  for (let i = 0; i < players.length; i++) {
    if (i === playerIndex) continue;
    threat = Math.max(threat, immediateThreatValue(players[i], card));
  }
  return threat;
}

function visibleImmediateWinningMove(player, offerItems) {
  let best = null;
  let bestScore = -Infinity;
  for (const item of offerItems) {
    if (item.hidden || immediateThreatValue(player, item.card) < 1000) continue;
    const score = agentKnownCardScore(player, item.card, "combo");
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}

function visibleForcedBlock(players, playerIndex, offerItems, strategy, profile) {
  let best = null;
  let bestScore = -Infinity;
  const player = players[playerIndex];
  for (const item of offerItems) {
    if (item.hidden) continue;
    const threat = maxOpponentImmediateThreat(players, playerIndex, item.card);
    if (threat < 1000) continue;
    const ownScore = profileOfferScore(player, item, strategy, offerItems, profile);
    const score = threat + ownScore;
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}

function chooseProfileOfferIndex(player, offerItems, strategy, players, playerIndex, profile) {
  const config = simpleProfileConfig(profile);
  if (strategy === "random") return chooseOfferIndex(player, offerItems, "random");

  const immediate = visibleImmediateWinningMove(player, offerItems);
  if (immediate) return immediate.idx;

  if (config.blockImmediate) {
    const forcedBlock = visibleForcedBlock(players, playerIndex, offerItems, strategy, profile);
    if (forcedBlock) return forcedBlock.idx;
  }

  let best = offerItems[0]?.idx ?? 0;
  let bestScore = -Infinity;
  for (const item of offerItems) {
    const ownScore = profileOfferScore(player, item, strategy, offerItems, profile);
    const softBlock = config.blockImmediate && !item.hidden ? maxOpponentImmediateThreat(players, playerIndex, item.card) * 0.35 : 0;
    const score = ownScore + softBlock;
    if (score > bestScore) {
      bestScore = score;
      best = item.idx;
    }
  }
  return best;
}

function chooseProfileHiddenIndex(hider, offerCards, strategy, players, playerIndex, profile) {
  const config = simpleProfileConfig(profile);
  if (strategy === "random") return chooseHiddenIndex(hider, offerCards, "random");

  let best = 0;
  let bestScore = -Infinity;
  for (let idx = 0; idx < offerCards.length; idx++) {
    const card = offerCards[idx];
    const item = { card, idx, hidden: false };
    const selfUse = profileOfferScore(hider, item, strategy, [], profile);
    const ownImmediate = immediateThreatValue(hider, card);
    const opponentThreat = config.blockImmediate ? maxOpponentImmediateThreat(players, playerIndex, card) : 0;
    const denial = cardPotential(card) + opponentThreat * 0.85;
    const keepForSelf = ownImmediate >= 1000 ? 140 : (profile === "birdHunter" && strategy === "birds" && card.type === "Oiseau" ? 115 : 0);
    const score = denial + keepForSelf - selfUse * 0.35;
    if (score > bestScore) {
      bestScore = score;
      best = idx;
    }
  }
  return best;
}

function simulateProfileGame(playersCount, profile, prep) {
  const previous = state.game;
  const deck = prepareDeck(state.cards, playersCount, prep);
  const strategies = simpleProfileStrategies(profile, playersCount);
  const players = Array.from({ length: playersCount }, (_, i) => makePlayer(i, false, strategies[i]));
  state.game = { players, deck, round: 0, active: 0, offer: [], hiddenIndex: -1, hiddenBy: null, pickOrder: [], pickCursor: 0, phase: "draft", pendingPlacement: null, over: false, log: [], profile };

  while (!state.game.over) {
    const g = state.game;
    if (g.round >= handSize() || g.deck.length === 0) {
      finishGame(false);
      break;
    }
    const n = offerSizeForPlayers(playersCount);
    g.offer = g.deck.splice(0, n);
    g.hiddenBy = g.active;
    g.hiddenIndex = chooseProfileHiddenIndex(players[g.active], g.offer, strategies[g.active], players, g.active, profile);
    const reservation = strategies[g.active] !== "random"
      ? hiddenReservationDecision(g.active, g.offer, g.hiddenIndex, card => profileOfferScore(players[g.active], { card, idx: 0, hidden: false }, strategies[g.active], [], profile))
      : null;
    recordHiddenOffer(g, reservation);
    if (playersCount === 2) {
      g.pickOrder = [1 - g.active, g.active];
    } else {
      g.pickOrder = [];
      for (let i = 1; i < playersCount; i++) g.pickOrder.push((g.active + i) % playersCount);
      g.pickOrder.push(g.active);
    }

    for (g.pickCursor = 0; g.pickCursor < g.pickOrder.length; g.pickCursor++) {
      const playerIndex = g.pickOrder[g.pickCursor];
      const player = players[playerIndex];
      const idx = chooseProfileOfferIndex(player, visibleOfferForPlayer(playerIndex), strategies[playerIndex], players, playerIndex, profile);
      const card = g.offer[idx];
      recordOfferTake(g, playerIndex, idx);
      g.offer.splice(idx, 1);
      if (g.hiddenIndex === idx) g.hiddenIndex = -1;
      if (g.hiddenIndex > idx) g.hiddenIndex--;
      autoPlace(player, card);
      const immediate = checkImmediate(player);
      if (immediate) {
        player.win = immediate;
        g.over = true;
        scoreAll();
        break;
      }
    }
    g.offer = [];
    g.hiddenIndex = -1;
    g.round++;
    g.active = (g.active + 1) % playersCount;
  }

  scoreAll();
  const result = summarizeGame(state.game);
  state.game = previous;
  return result;
}

function simulateGame(playersCount, agent, prep) {
  const previous = state.game;
  const deck = prepareDeck(state.cards, playersCount, prep);
  const players = Array.from({ length: playersCount }, (_, i) => makePlayer(i, false, agent));
  state.game = { players, deck, round: 0, active: 0, offer: [], hiddenIndex: -1, hiddenBy: null, pickOrder: [], pickCursor: 0, phase: "draft", pendingPlacement: null, over: false, log: [] };
  while (!state.game.over) {
    const g = state.game;
    if (g.round >= handSize() || g.deck.length === 0) { finishGame(false); break; }
    const n = offerSizeForPlayers(playersCount);
    g.offer = g.deck.splice(0, n);
    g.hiddenBy = g.active;
    g.hiddenIndex = chooseHiddenIndex(players[g.active], g.offer, agent);
    const reservation = agent !== "random"
      ? hiddenReservationDecision(g.active, g.offer, g.hiddenIndex, card => agentKnownCardScore(players[g.active], card, agent))
      : null;
    recordHiddenOffer(g, reservation);
    if (playersCount === 2) g.pickOrder = [1 - g.active, g.active];
    else {
      g.pickOrder = [];
      for (let i = 1; i < playersCount; i++) g.pickOrder.push((g.active + i) % playersCount);
      g.pickOrder.push(g.active);
    }
    for (g.pickCursor = 0; g.pickCursor < g.pickOrder.length; g.pickCursor++) {
      const p = players[g.pickOrder[g.pickCursor]];
      const idx = chooseOfferIndex(p, visibleOfferForPlayer(g.pickOrder[g.pickCursor]), agent);
      const card = g.offer[idx];
      recordOfferTake(g, p.index, idx);
      g.offer.splice(idx, 1);
      if (g.hiddenIndex === idx) g.hiddenIndex = -1;
      if (g.hiddenIndex > idx) g.hiddenIndex--;
      autoPlace(p, card);
      const immediate = checkImmediate(p);
      if (immediate) {
        p.win = immediate;
        g.over = true;
        scoreAll();
        break;
      }
    }
    g.offer = [];
    g.hiddenIndex = -1;
    g.round++;
    g.active = (g.active + 1) % playersCount;
  }
  scoreAll();
  const result = summarizeGame(state.game);
  state.game = previous;
  return result;
}

function summarizeGame(g) {
  const scores = g.players.map(p => p.score);
  const hiddenStats = { ...draftStats(g) };
  const immediateWinner = g.players.find(p => isImmediateWin(p.win));
  const bestScore = Math.max(...scores);
  const scoreWinners = g.players.filter(p => p.score === bestScore);
  const winners = immediateWinner ? [immediateWinner] : scoreWinners;
  return {
    scores,
    maxScore: bestScore,
    minScore: Math.min(...scores),
    immediate: immediateWinner?.win || null,
    roseauxWin: isRoseauxWin(immediateWinner?.win) ? 1 : 0,
    oiseauxWin: isOiseauxWin(immediateWinner?.win) ? 1 : 0,
    winnerGrail: winners.some(p => p.grail) ? 1 : 0,
    firstScore: g.players[0].score,
    draftStats: hiddenStats,
  };
}

function simulateBenchmarkGame(playersCount, strategy, prep, counterDraft) {
  const previous = state.game;
  const deck = prepareDeck(state.cards, playersCount, prep);
  const players = Array.from({ length: playersCount }, (_, i) => makePlayer(i, false, "balanced"));
  const strategies = players.map((_, i) => i === 0 ? strategy : "balanced");
  state.game = { players, deck, round: 0, active: 0, offer: [], hiddenIndex: -1, hiddenBy: null, pickOrder: [], pickCursor: 0, phase: "draft", pendingPlacement: null, over: false, log: [] };

  while (!state.game.over) {
    const g = state.game;
    if (g.round >= handSize() || g.deck.length === 0) {
      finishGame(false);
      break;
    }
    const n = offerSizeForPlayers(playersCount);
    g.offer = g.deck.splice(0, n);
    g.hiddenBy = g.active;
    g.hiddenIndex = counterDraft && g.active !== 0
      ? chooseCounterDraftHiddenIndex(players[g.active], g.offer, players[0], strategy)
      : chooseStrategyHiddenIndex(players[g.active], g.offer, strategies[g.active]);
    const reservation = hiddenReservationDecision(
      g.active,
      g.offer,
      g.hiddenIndex,
      card => strategyCardScore(players[g.active], { card, idx: 0, hidden: false }, strategies[g.active], []),
    );
    recordHiddenOffer(g, reservation);
    if (playersCount === 2) {
      g.pickOrder = [1 - g.active, g.active];
    } else {
      g.pickOrder = [];
      for (let i = 1; i < playersCount; i++) g.pickOrder.push((g.active + i) % playersCount);
      g.pickOrder.push(g.active);
    }

    for (g.pickCursor = 0; g.pickCursor < g.pickOrder.length; g.pickCursor++) {
      const playerIndex = g.pickOrder[g.pickCursor];
      const player = players[playerIndex];
      const idx = counterDraft && playerIndex !== 0
        ? chooseCounterDraftOfferIndex(player, visibleOfferForPlayer(playerIndex), players[0], strategy)
        : chooseStrategyOfferIndex(player, visibleOfferForPlayer(playerIndex), strategies[playerIndex]);
      const card = g.offer[idx];
      recordOfferTake(g, playerIndex, idx);
      g.offer.splice(idx, 1);
      if (g.hiddenIndex === idx) g.hiddenIndex = -1;
      if (g.hiddenIndex > idx) g.hiddenIndex--;
      autoPlace(player, card);
      const immediate = checkImmediate(player);
      if (immediate) {
        player.win = immediate;
        g.over = true;
        scoreAll();
        break;
      }
    }
    g.offer = [];
    g.hiddenIndex = -1;
    g.round++;
    g.active = (g.active + 1) % playersCount;
  }

  scoreAll();
  const scores = players.map(p => p.score);
  const bestScore = Math.max(...scores);
  const winnerIndexes = players.map((p, i) => p.score === bestScore ? i : -1).filter(i => i >= 0);
  const immediateWinnerIndex = players.findIndex(p => isImmediateWin(p.win));
  const effectiveWinnerIndexes = immediateWinnerIndex >= 0 ? [immediateWinnerIndex] : winnerIndexes;
  const winnerGrail = effectiveWinnerIndexes.some(index => players[index].grail) ? 1 : 0;
  const p1Cards = boardCards(players[0]).map(card => ({ id: card.id, name: card.name, type: card.type, points: scoreCard(players[0], card) }));
  const playerCards = players.map(player => boardCards(player).map(card => ({ id: card.id, name: card.name, type: card.type, points: scoreCard(player, card) })));
  const winningCards = winnerIndexes.flatMap(index => playerCards[index]);
  const p1Immediate = isImmediateWin(players[0].win) ? players[0].win : null;
  const oppImmediateWins = players.slice(1).map(p => p.win).filter(isImmediateWin);
  const result = {
    score: players[0].score,
    oppScore: avg(scores.slice(1)),
    win: winnerIndexes.includes(0) ? 1 : 0,
    soloWin: winnerIndexes.length === 1 && winnerIndexes[0] === 0 ? 1 : 0,
    immediate: p1Immediate ? 1 : 0,
    roseauxImmediate: isRoseauxWin(p1Immediate) ? 1 : 0,
    oiseauxImmediate: isOiseauxWin(p1Immediate) ? 1 : 0,
    oppImmediate: oppImmediateWins.length ? 1 : 0,
    oppRoseauxImmediate: oppImmediateWins.some(isRoseauxWin) ? 1 : 0,
    oppOiseauxImmediate: oppImmediateWins.some(isOiseauxWin) ? 1 : 0,
    winnerGrail,
    p1Grail: players[0].grail ? 1 : 0,
    p1GrailWin: winnerIndexes.includes(0) && players[0].grail ? 1 : 0,
    families: Object.fromEntries(FAMILY_ORDER.map(family => [family, countFamily(players[0], family)])),
    p1Cards,
    scores,
    maxScore: bestScore,
    winnerIndexes,
    playerCards,
    winningCards,
    draftStats: { ...draftStats(state.game) },
  };
  state.game = previous;
  return result;
}

function deckTotalCards() {
  return state.cards.reduce((sum, card) => sum + Number(card.qty || 0), 0);
}

function expectedPresenceForCopies(qty, total, handSizeValue = handSize()) {
  if (qty <= 0 || total <= 0 || handSizeValue <= 0) return 0;
  const hand = Math.min(handSizeValue, total);
  let miss = 1;
  for (let i = 0; i < hand; i++) {
    miss *= Math.max(0, total - qty - i) / Math.max(1, total - i);
  }
  return 1 - miss;
}

function summarizeCardList(cards) {
  const ids = {};
  const families = { batiment: 0, objet: 0, oiseau: 0, grenouille: 0, noble: 0 };
  for (const card of cards) {
    ids[card.id] = (ids[card.id] || 0) + 1;
    const family = normalizeId(card.type);
    families[family] = (families[family] || 0) + 1;
  }
  return { ids, families };
}

function summarizeBenchmarkStrategy(strategy, playersCount, games, prep, counterDraft) {
  const rows = [];
  for (let i = 0; i < games; i++) rows.push(simulateBenchmarkGame(playersCount, strategy.id, prep, counterDraft));

  const totalDeck = deckTotalCards();
  const cardStats = new Map(state.cards.map(card => [card.id, {
    id: card.id,
    name: card.name,
    type: card.type,
    qty: Number(card.qty || 0),
    winDecks: 0,
    allDecks: 0,
    copies: 0,
    allCopies: 0,
    points: 0,
    allPoints: 0,
    maxPoints: 0,
  }]));
  const comboStats = new Map(COMBO_RULES.map(rule => [rule.id, {
    id: rule.id,
    label: rule.label,
    winDecks: 0,
    allDecks: 0,
    winScore: 0,
    allScore: 0,
  }]));
  let allDeckCount = 0;
  let winningDeckCount = 0;

  for (const row of rows) {
    row.playerCards.forEach((cards, playerIndex) => {
      allDeckCount++;
      const seen = new Set();
      const deckScore = row.scores[playerIndex] || 0;
      for (const card of cards) {
        const stat = cardStats.get(card.id);
        if (!stat) continue;
        stat.allCopies++;
        stat.allPoints += card.points;
        stat.maxPoints = Math.max(stat.maxPoints, card.points);
        seen.add(card.id);
      }
      for (const id of seen) cardStats.get(id).allDecks++;
      const deck = summarizeCardList(cards);
      for (const rule of COMBO_RULES) {
        if (!rule.test(deck)) continue;
        const combo = comboStats.get(rule.id);
        combo.allDecks++;
        combo.allScore += deckScore;
      }
    });

    for (const playerIndex of row.winnerIndexes) {
      const cards = row.playerCards[playerIndex] || [];
      winningDeckCount++;
      const seen = new Set();
      const deckScore = row.scores[playerIndex] || 0;
      for (const card of cards) {
        const stat = cardStats.get(card.id);
        if (!stat) continue;
        stat.copies++;
        stat.points += card.points;
        stat.maxPoints = Math.max(stat.maxPoints, card.points);
        seen.add(card.id);
      }
      for (const id of seen) cardStats.get(id).winDecks++;
      const deck = summarizeCardList(cards);
      for (const rule of COMBO_RULES) {
        if (!rule.test(deck)) continue;
        const combo = comboStats.get(rule.id);
        combo.winDecks++;
        combo.winScore += deckScore;
      }
    }
  }

  const allPlayerCards = rows.flatMap(r => r.playerCards.flat());
  const winningCards = rows.flatMap(r => r.winningCards);
  const maxCard = [...allPlayerCards].sort((a, b) => b.points - a.points)[0] || { name: "-", type: "-", points: 0 };
  const maxWinningCard = [...winningCards].sort((a, b) => b.points - a.points)[0] || { name: "-", type: "-", points: 0 };
  const immediateCount = rows.reduce((sum, r) => sum + r.immediate + r.oppImmediate, 0);
  const roseauxImmediateCount = rows.reduce((sum, r) => sum + r.roseauxImmediate + r.oppRoseauxImmediate, 0);
  const oiseauxImmediateCount = rows.reduce((sum, r) => sum + r.oiseauxImmediate + r.oppOiseauxImmediate, 0);
  const strategyWins = rows.reduce((sum, r) => sum + r.win, 0);
  const strategyGrailWins = rows.reduce((sum, r) => sum + r.p1GrailWin, 0);
  const unknownHiddenOpportunities = rows.reduce((sum, r) => sum + Number(r.draftStats?.unknownHiddenOpportunities || 0), 0);
  const unknownHiddenTaken = rows.reduce((sum, r) => sum + Number(r.draftStats?.unknownHiddenTaken || 0), 0);
  const reservations = rows.reduce((sum, r) => sum + Number(r.draftStats?.reservations || 0), 0);
  const reservationsRecovered = rows.reduce((sum, r) => sum + Number(r.draftStats?.reservationsRecovered || 0), 0);
  const hiddenOffered = rows.reduce((sum, r) => sum + Number(r.draftStats?.hiddenOffered || 0), 0);
  const hiddenReturned = rows.reduce((sum, r) => sum + Number(r.draftStats?.hiddenTakenByHider || 0), 0);

  return {
    id: strategy.id,
    label: strategy.label,
    games,
    totalDeck,
    allDeckCount,
    winningDeckCount,
    score: avg(rows.map(r => r.score)),
    oppScore: avg(rows.map(r => r.oppScore)),
    avgScoreAll: avg(rows.flatMap(r => r.scores)),
    maxScore: Math.max(...rows.map(r => r.maxScore)),
    avgMaxScore: avg(rows.map(r => r.maxScore)),
    avgCardPoints: avg(allPlayerCards.map(c => c.points)),
    maxCardPoints: maxCard.points,
    maxCardName: maxCard.name,
    maxCardType: maxCard.type,
    avgWinningCardPoints: avg(winningCards.map(c => c.points)),
    maxWinningCardPoints: maxWinningCard.points,
    maxWinningCardName: maxWinningCard.name,
    delta: avg(rows.map(r => r.score - r.oppScore)),
    win: avg(rows.map(r => r.win)),
    soloWin: avg(rows.map(r => r.soloWin)),
    strategyWins,
    strategyGrailWins,
    unknownHiddenOpportunities,
    unknownHiddenTaken,
    unknownHiddenTakeRate: unknownHiddenTaken / Math.max(1, unknownHiddenOpportunities),
    reservations,
    reservationsRecovered,
    reservationRecoveryRate: reservationsRecovered / Math.max(1, reservations),
    hiddenOffered,
    hiddenReturned,
    hiddenReturnRate: hiddenReturned / Math.max(1, hiddenOffered),
    winnerGrail: avg(rows.map(r => r.winnerGrail)),
    strategyGrailWinRate: strategyGrailWins / Math.max(1, strategyWins),
    p1Grail: avg(rows.map(r => r.p1Grail)),
    avgP1Treasures: avg(rows.map(r => r.p1Cards.filter(card => card.id === "tresor").length)),
    immediate: avg(rows.map(r => r.immediate)),
    roseauxImmediate: avg(rows.map(r => r.roseauxImmediate)),
    oiseauxImmediate: avg(rows.map(r => r.oiseauxImmediate)),
    oppImmediate: avg(rows.map(r => r.oppImmediate)),
    oppRoseauxImmediate: avg(rows.map(r => r.oppRoseauxImmediate)),
    oppOiseauxImmediate: avg(rows.map(r => r.oppOiseauxImmediate)),
    totalImmediateRate: immediateCount / Math.max(1, rows.length),
    totalRoseauxImmediateRate: roseauxImmediateCount / Math.max(1, rows.length),
    totalOiseauxImmediateRate: oiseauxImmediateCount / Math.max(1, rows.length),
    families: Object.fromEntries(FAMILY_ORDER.map(family => [family, avg(rows.map(r => r.families[family]))])),
    cards: [...cardStats.values()].map(stat => {
      const expectedPresence = expectedPresenceForCopies(stat.qty, totalDeck);
      const expectedCopies = handSize() * stat.qty / Math.max(1, totalDeck);
      const winPresence = stat.winDecks / Math.max(1, winningDeckCount);
      const allPresence = stat.allDecks / Math.max(1, allDeckCount);
      return {
        ...stat,
        avgPoints: stat.points / Math.max(1, stat.copies),
        avgAllPoints: stat.allPoints / Math.max(1, stat.allCopies),
        winPresence,
        allPresence,
        expectedPresence,
        expectedCopies,
        presenceDelta: winPresence - expectedPresence,
        quantityLift: winPresence / Math.max(0.01, expectedPresence),
        winnerLift: winPresence / Math.max(0.01, allPresence),
        avgCopiesInWinningDecks: stat.copies / Math.max(1, winningDeckCount),
        avgCopiesInAllDecks: stat.allCopies / Math.max(1, allDeckCount),
      };
    }),
    combos: [...comboStats.values()].map(stat => ({
      ...stat,
      winPresence: stat.winDecks / Math.max(1, winningDeckCount),
      allPresence: stat.allDecks / Math.max(1, allDeckCount),
      winnerLift: (stat.winDecks / Math.max(1, winningDeckCount)) / Math.max(0.01, stat.allDecks / Math.max(1, allDeckCount)),
      avgWinningScore: stat.winScore / Math.max(1, stat.winDecks),
      avgAllScore: stat.allScore / Math.max(1, stat.allDecks),
    })),
  };
}

function runBenchmark() {
  const players = Number(document.querySelector("#benchPlayers").value);
  const games = Number(document.querySelector("#benchGames").value || 50);
  const prep = document.querySelector("#benchPrep").value;
  const counterDraft = document.querySelector("#benchCounter").value === "on";
  const button = document.querySelector("#runBenchmark");
  const quickButton = document.querySelector("#quickBenchmark");
  if (button.disabled) return;
  button.disabled = true;
  if (quickButton) quickButton.disabled = true;
  button.textContent = "Calcul...";
  if (quickButton) quickButton.textContent = "Benchmark...";
  const results = [];
  let index = 0;
  const restoreButtons = () => {
    button.disabled = false;
    if (quickButton) quickButton.disabled = false;
    button.textContent = "Lancer benchmark";
    if (quickButton) quickButton.textContent = "Benchmark maintenant";
  };
  const runNextStrategy = () => {
    try {
      const strategy = BENCH_STRATEGIES[index];
      button.textContent = `Calcul ${index + 1}/${BENCH_STRATEGIES.length}`;
      if (quickButton) quickButton.textContent = button.textContent;
      results.push(summarizeBenchmarkStrategy(strategy, players, games, prep, counterDraft));
      index++;
      if (index < BENCH_STRATEGIES.length) {
        setTimeout(runNextStrategy, 0);
        return;
      }
      state.lastBenchmark = { players, games, prep, counterDraft, rules: structuredClone(state.rules), results };
      renderBenchmark();
      restoreButtons();
    } catch (error) {
      console.error(error);
      restoreButtons();
    }
  };
  setTimeout(runNextStrategy, 20);
}

function runSimulation() {
  const games = Number(document.querySelector("#simGames").value || 1000);
  const players = Number(document.querySelector("#simPlayers").value);
  const agent = document.querySelector("#simAgent").value;
  const prep = document.querySelector("#simPrep").value;
  const results = [];
  for (let i = 0; i < games; i++) results.push(simulateGame(players, agent, prep));
  state.lastSimulation = { games, players, agent, prep, results };
  renderSimulation();
}

function avg(arr) { return arr.reduce((s, x) => s + x, 0) / Math.max(1, arr.length); }
function pct(x) { return `${(x * 100).toFixed(1)}%`; }

function comb(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= k; i++) result = result * (n - k + i) / i;
  return result;
}

function exactImmediateAvailability(deckTotal, birds, playersCount, handSizeValue = handSize()) {
  const memo = new Map();
  function safeProbability(playerIndex, birdsLeft, cardsLeft) {
    if (playerIndex === playersCount) return 1;
    const key = `${playerIndex}|${birdsLeft}|${cardsLeft}`;
    if (memo.has(key)) return memo.get(key);
    const nonBirdsLeft = cardsLeft - birdsLeft;
    const denom = comb(cardsLeft, handSizeValue);
    let safe = 0;
    for (let birdCount = 0; birdCount <= Math.min(3, birdsLeft, handSizeValue); birdCount++) {
      const nonBirdCount = handSizeValue - birdCount;
      if (nonBirdCount > nonBirdsLeft) continue;
      safe += comb(birdsLeft, birdCount)
        * comb(nonBirdsLeft, nonBirdCount)
        / denom
        * safeProbability(playerIndex + 1, birdsLeft - birdCount, cardsLeft - handSizeValue);
    }
    memo.set(key, safe);
    return safe;
  }
  return 1 - safeProbability(0, birds, deckTotal);
}

function exactAtLeastInDraws(deckTotal, successCount, draws, threshold) {
  const denom = comb(deckTotal, draws);
  let probability = 0;
  for (let count = threshold; count <= Math.min(successCount, draws); count++) {
    probability += comb(successCount, count) * comb(deckTotal - successCount, draws - count) / denom;
  }
  return probability;
}

function visibleCardsCount(playersCount) {
  return Math.max(0, cardsDrawnIntoOffers(playersCount) - handSize());
}

function cardsDrawnIntoOffers(playersCount, handSizeValue = handSize()) {
  return offerSizeForPlayers(playersCount) * handSizeValue;
}

function cardsTakenByPlayers(playersCount, handSizeValue = handSize()) {
  return playersCount * handSizeValue;
}

function setBirdCount(count) {
  const birds = state.cards.filter(card => card.mode === "heron");
  if (!birds.length) return;
  const total = Math.max(0, Math.round(Number(count) || 0));
  const copiesPerBird = Math.floor(total / birds.length);
  const extraCopies = total % birds.length;
  birds.forEach((bird, index) => {
    bird.qty = copiesPerBird + (index < extraCopies ? 1 : 0);
    bird.heronTargets = bird.heronTarget ? [bird.heronTarget] : bird.heronTargets;
  });
  refreshAfterDesignChange({ cards: Boolean(document.querySelector("#cards.active")) });
}

function levelForImmediate(rate) {
  if (rate >= 0.10) return "bad";
  if (rate >= 0.05) return "warn";
  return "good";
}

function levelForScore(maxSeen, avgWinner) {
  if (maxSeen >= 110 || avgWinner >= 90) return "bad";
  if (maxSeen >= 95 || avgWinner >= 80) return "warn";
  return "good";
}

function renderSimpleVerdict(lines) {
  document.querySelector("#simpleVerdict").innerHTML = lines.map(line => `
    <div class="simple-line">
      ${simpleLevel(line.level)}
      <span>${line.text}</span>
    </div>
  `).join("");
}

function runSimpleStats() {
  const players = Number(document.querySelector("#simplePlayers").value || 3);
  const games = Number(document.querySelector("#simpleGames").value || 200);
  const birds = Number(document.querySelector("#simpleBirds").value || 5);
  const profile = document.querySelector("#simpleAgent").value || "realistic";
  const button = document.querySelector("#runSimple");
  button.disabled = true;
  button.textContent = "Calcul...";
  setTimeout(() => {
    try {
      setBirdCount(birds);
      const results = [];
      for (let i = 0; i < games; i++) results.push(simulateProfileGame(players, profile, "full"));
      const allScores = results.flatMap(row => row.scores);
      const winnerScores = results.map(row => row.maxScore);
      const scoreRanges = results.map(row => row.maxScore - row.minScore);
      const oiseauxWins = results.reduce((sum, row) => sum + row.oiseauxWin, 0);
      const grailWins = results.reduce((sum, row) => sum + row.winnerGrail, 0);
      const unknownHiddenOpportunities = results.reduce((sum, row) => sum + Number(row.draftStats?.unknownHiddenOpportunities || 0), 0);
      const unknownHiddenTaken = results.reduce((sum, row) => sum + Number(row.draftStats?.unknownHiddenTaken || 0), 0);
      const reservations = results.reduce((sum, row) => sum + Number(row.draftStats?.reservations || 0), 0);
      const reservationsRecovered = results.reduce((sum, row) => sum + Number(row.draftStats?.reservationsRecovered || 0), 0);
      const hiddenOffered = results.reduce((sum, row) => sum + Number(row.draftStats?.hiddenOffered || 0), 0);
      const hiddenReturned = results.reduce((sum, row) => sum + Number(row.draftStats?.hiddenTakenByHider || 0), 0);
      const referenceHiddenOffered = results.reduce((sum, row) => sum + Number(row.draftStats?.hiddenOfferedByPlayer?.["0"] || 0), 0);
      const referenceHiddenReturned = results.reduce((sum, row) => sum + Number(row.draftStats?.hiddenRecoveredByPlayer?.["0"] || 0), 0);
      const tightGames = scoreRanges.filter(range => range <= 10).length;
      const maxSeen = Math.max(...winnerScores);
      const avgWinner = avg(winnerScores);
      const avgAll = avg(allScores);
      const deckTotal = deckTotalCards();
      const drawnCards = cardsDrawnIntoOffers(players);
      const takenCards = cardsTakenByPlayers(players);
      const visibleCards = visibleCardsCount(players);
      const hiddenOfferCards = handSize();
      const discardedCards = Math.max(0, drawnCards - takenCards);
      const untouchedCards = Math.max(0, deckTotal - drawnCards);
      const exact = exactImmediateAvailability(deckTotal, birds, players);
      const offeredFourBirds = exactAtLeastInDraws(deckTotal, birds, drawnCards, 4);
      const playerCardsWithFourBirds = exactAtLeastInDraws(deckTotal, birds, players * handSize(), 4);
      const visibleFourBirds = exactAtLeastInDraws(deckTotal, birds, visibleCardsCount(players), 4);
      const immediateRate = oiseauxWins / games;
      const tightRate = tightGames / games;
      const grailRate = grailWins / games;
      const unknownHiddenTakeRate = unknownHiddenTaken / Math.max(1, unknownHiddenOpportunities);
      const reservationRecoveryRate = reservationsRecovered / Math.max(1, reservations);
      const hiddenReturnRate = hiddenReturned / Math.max(1, hiddenOffered);
      const referenceHiddenReturnRate = referenceHiddenReturned / Math.max(1, referenceHiddenOffered);

      const stats = [
        ["Victoire Oiseaux", pct(immediateRate), levelForImmediate(immediateRate)],
        ["Sans chasse", pct(exact), levelForImmediate(exact)],
        ["4+ Oiseaux en offre", pct(offeredFourBirds), offeredFourBirds >= 0.50 ? "warn" : ""],
        ["4+ Oiseaux pris", pct(playerCardsWithFourBirds), playerCardsWithFourBirds >= 0.50 ? "warn" : ""],
        ["4+ Oiseaux visibles", pct(visibleFourBirds), visibleFourBirds >= 0.25 ? "warn" : ""],
        ["Cartes prises", `${takenCards}/${deckTotal}`, ""],
        ["Cartes visibles", `${visibleCards}/${deckTotal}`, ""],
        ["Score gagnant moy.", avgWinner.toFixed(1), levelForScore(maxSeen, avgWinner)],
        ["Score moyen", avgAll.toFixed(1), ""],
        ["Score max vu", maxSeen.toFixed(0), levelForScore(maxSeen, avgWinner)],
        ["Graal chez gagnant", pct(grailRate), grailRate > 0.55 ? "warn" : ""],
        ["Cachée prise à l'aveugle", pct(unknownHiddenTakeRate), unknownHiddenTakeRate > 0.30 ? "warn" : "good"],
        ["Réservation récupérée", pct(reservationRecoveryRate), ""],
        ["Cachée revenue au cacheur", pct(hiddenReturnRate), ""],
        ["Parties serrées", pct(tightRate), tightRate < 0.25 ? "warn" : "good"],
      ];
      document.querySelector("#simpleStats").innerHTML = stats.map(([label, value, cls]) => metric(label, value, cls)).join("");

      renderSimpleVerdict([
        {
          level: levelForImmediate(immediateRate),
          text: `Victoire immédiate Oiseaux simulée: ${pct(immediateRate)}. Si personne ne les chasse, la base mathématique est ${pct(exact)}.`,
        },
        {
          level: offeredFourBirds >= 0.50 ? "warn" : "good",
          text: `${pct(offeredFourBirds)} des parties ont 4+ Oiseaux qui entrent dans les offres, et ${pct(playerCardsWithFourBirds)} les ont dans les cartes prises. Si les joueurs les concentrent, le taux réel peut monter beaucoup plus haut.`,
        },
        {
          level: levelForScore(maxSeen, avgWinner),
          text: `Score gagnant moyen: ${avgWinner.toFixed(1)} PV. Plus gros score vu: ${maxSeen.toFixed(0)} PV.`,
        },
        {
          level: grailRate > 0.55 ? "warn" : "good",
          text: `Le gagnant a le Graal dans ${pct(grailRate)} des parties.`,
        },
        {
          level: unknownHiddenTakeRate > 0.30 ? "warn" : "good",
          text: `Les IA prennent une carte cachée qu'elles n'ont pas préparée dans ${pct(unknownHiddenTakeRate)} des occasions (${unknownHiddenTaken}/${unknownHiddenOpportunities}).`,
        },
        {
          level: "good",
          text: `Une carte cachée utile au cacheur lui revient dans ${pct(reservationRecoveryRate)} des cas (${reservationsRecovered}/${reservations}).`,
        },
        {
          level: "good",
          text: `Toutes cartes confondues, la carte cachée revient au cacheur dans ${pct(hiddenReturnRate)} des cas. Pour le joueur de référence face aux IA: ${pct(referenceHiddenReturnRate)} (${referenceHiddenReturned}/${referenceHiddenOffered}).`,
        },
        {
          level: tightRate < 0.25 ? "warn" : "good",
          text: `${pct(tightRate)} des parties finissent avec 10 PV ou moins d'écart entre premier et dernier.`,
        },
      ]);

      document.querySelector("#simpleTable").innerHTML = `
        <thead><tr><th>Point regardé</th><th>Résultat</th><th>Lecture</th></tr></thead>
        <tbody>
          <tr><td>Configuration</td><td>${players} joueurs, ${birds} Oiseaux, ${deckTotal} cartes, profil ${simpleProfileLabel(profile)}</td><td>${games} parties</td></tr>
          <tr><td>Contrôle simulation</td><td>${takenCards} cartes prises, ${visibleCards} visibles, ${hiddenOfferCards} cachées dans les offres</td><td>${discardedCards} défaussées, ${untouchedCards} jamais sorties</td></tr>
          <tr><td>Victoire immédiate Oiseaux</td><td>${oiseauxWins} / ${games}</td><td>${pct(immediateRate)}</td></tr>
          <tr><td>Sans chasse active</td><td>Au moins un joueur reçoit 4+ Oiseaux</td><td>${pct(exact)}</td></tr>
          <tr><td>Disponibilité en offre</td><td>4+ Oiseaux entrent dans les offres</td><td>${pct(offeredFourBirds)}</td></tr>
          <tr><td>Disponibilité prise</td><td>4+ Oiseaux sont dans les cartes prises</td><td>${pct(playerCardsWithFourBirds)}</td></tr>
          <tr><td>Visibilité publique</td><td>4+ Oiseaux apparaissent face visible</td><td>${pct(visibleFourBirds)}</td></tr>
          <tr><td>Score gagnant</td><td>${avgWinner.toFixed(1)} PV en moyenne</td><td>max ${maxSeen.toFixed(0)}</td></tr>
          <tr><td>Écart de score</td><td>${avg(scoreRanges).toFixed(1)} PV en moyenne</td><td>${pct(tightRate)} parties serrées</td></tr>
          <tr><td>Graal</td><td>${grailWins} gagnants avec Graal</td><td>${pct(grailRate)}</td></tr>
          <tr><td>Choix caché à l'aveugle</td><td>${unknownHiddenTaken} prises sur ${unknownHiddenOpportunities} occasions</td><td>${pct(unknownHiddenTakeRate)}</td></tr>
          <tr><td>Carte réservée récupérée</td><td>${reservationsRecovered} récupérations sur ${reservations} réservations</td><td>${pct(reservationRecoveryRate)}</td></tr>
          <tr><td>Carte cachée revenue au cacheur</td><td>${hiddenReturned} retours sur ${hiddenOffered} cartes cachées</td><td>${pct(hiddenReturnRate)}</td></tr>
          <tr><td>Retour au joueur de référence</td><td>${referenceHiddenReturned} retours sur ${referenceHiddenOffered} cartes cachées</td><td>${pct(referenceHiddenReturnRate)}</td></tr>
        </tbody>`;
    } finally {
      button.disabled = false;
      button.textContent = "Lancer les stats";
    }
  }, 20);
}

function renderSimulation() {
  const sim = state.lastSimulation;
  if (!sim) return;
  const immediates = sim.results.filter(r => r.immediate).length;
  const roseaux = sim.results.reduce((s, r) => s + r.roseauxWin, 0);
  const oiseaux = sim.results.reduce((s, r) => s + r.oiseauxWin, 0);
  const winnerGrail = sim.results.reduce((s, r) => s + r.winnerGrail, 0);
  const hiddenOpportunities = sim.results.reduce((sum, row) => sum + Number(row.draftStats?.unknownHiddenOpportunities || 0), 0);
  const hiddenTaken = sim.results.reduce((sum, row) => sum + Number(row.draftStats?.unknownHiddenTaken || 0), 0);
  const reservations = sim.results.reduce((sum, row) => sum + Number(row.draftStats?.reservations || 0), 0);
  const reservationsRecovered = sim.results.reduce((sum, row) => sum + Number(row.draftStats?.reservationsRecovered || 0), 0);
  const hiddenOffered = sim.results.reduce((sum, row) => sum + Number(row.draftStats?.hiddenOffered || 0), 0);
  const hiddenReturned = sim.results.reduce((sum, row) => sum + Number(row.draftStats?.hiddenTakenByHider || 0), 0);
  const scores = sim.results.flatMap(r => r.scores);
  const summary = [
    ["Parties", sim.games, "good"],
    ["Score moyen", avg(scores).toFixed(1), ""],
    ["Victoire immédiate", pct(immediates / sim.games), immediates ? "warn" : ""],
    ["Roseaux", pct(roseaux / sim.games), roseaux ? "warn" : ""],
    ["Oiseaux", pct(oiseaux / sim.games), oiseaux ? "warn" : ""],
    ["Gagnant Graal", pct(winnerGrail / sim.games), ""],
    ["Cachée à l'aveugle", pct(hiddenTaken / Math.max(1, hiddenOpportunities)), hiddenTaken / Math.max(1, hiddenOpportunities) > 0.30 ? "warn" : "good"],
    ["Réservation récupérée", pct(reservationsRecovered / Math.max(1, reservations)), ""],
    ["Cachée revenue", pct(hiddenReturned / Math.max(1, hiddenOffered)), ""],
    ["Score max moyen", avg(sim.results.map(r => r.maxScore)).toFixed(1), ""],
  ];
  document.querySelector("#simSummary").innerHTML = summary.map(([label, value, cls]) => metric(label, value, cls)).join("");
  drawSimulationChart(sim);
}

function metric(label, value, cls = "") {
  return `<div class="metric ${cls}"><div>${label}</div><div class="value">${value}</div></div>`;
}

function drawSimulationChart(sim) {
  const canvas = document.querySelector("#simChart");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = 260;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  const buckets = new Array(12).fill(0);
  for (const r of sim.results) {
    const v = Math.max(0, Math.min(11, Math.floor(r.maxScore / 10)));
    buckets[v]++;
  }
  const max = Math.max(...buckets, 1);
  const barW = (width - 60) / buckets.length;
  ctx.fillStyle = "#17313a";
  ctx.font = "12px Arial";
  ctx.fillText("Distribution des scores max", 12, 18);
  buckets.forEach((b, i) => {
    const h = (height - 60) * b / max;
    const x = 40 + i * barW;
    const y = height - 32 - h;
    ctx.fillStyle = "#1f5b68";
    ctx.fillRect(x, y, barW - 4, h);
    ctx.fillStyle = "#64757c";
    ctx.fillText(`${i * 10}`, x, height - 12);
  });
}

function renderBenchmark() {
  const bench = state.lastBenchmark;
  if (!bench) return;
  const baseline = bench.results.find(r => r.id === "balanced") || bench.results[0];
  const best = [...bench.results].sort((a, b) => b.win - a.win)[0];
  const highestDelta = [...bench.results].sort((a, b) => b.delta - a.delta)[0];
  const mostImmediate = [...bench.results].sort((a, b) => b.totalImmediateRate - a.totalImmediateRate)[0];
  const mostGrailWinner = [...bench.results].sort((a, b) => b.winnerGrail - a.winnerGrail)[0];
  const mostHidden = [...bench.results].sort((a, b) => b.unknownHiddenTakeRate - a.unknownHiddenTakeRate)[0];
  const benchmarkReservations = bench.results.reduce((sum, row) => sum + row.reservations, 0);
  const benchmarkReservationsRecovered = bench.results.reduce((sum, row) => sum + row.reservationsRecovered, 0);
  const benchmarkReservationRate = benchmarkReservationsRecovered / Math.max(1, benchmarkReservations);
  const benchmarkHiddenOffered = bench.results.reduce((sum, row) => sum + row.hiddenOffered, 0);
  const benchmarkHiddenReturned = bench.results.reduce((sum, row) => sum + row.hiddenReturned, 0);
  const benchmarkHiddenReturnRate = benchmarkHiddenReturned / Math.max(1, benchmarkHiddenOffered);
  const highestScore = [...bench.results].sort((a, b) => b.avgScoreAll - a.avgScoreAll)[0];
  const maxScore = Math.max(...bench.results.map(r => r.maxScore));
  const maxCardRow = [...bench.results].sort((a, b) => b.maxCardPoints - a.maxCardPoints)[0];
  const maxCard = maxCardRow.maxCardPoints;
  const cardRows = cardBalanceRows(bench);
  const strongestCard = cardRows.find(row => row.presenceDelta > 0.06 && row.id !== "barde")
    || cardRows.find(row => row.presenceDelta > 0.06);
  const weakCard = cardRows.find(row => cardVerdict(row).cls === "faible");
  const alerts = [
    metric("Parties", `${bench.games} x ${bench.results.length}`, "good"),
    metric("Contre-draft", bench.counterDraft ? "Actif" : "Inactif", bench.counterDraft ? "warn" : ""),
    metric("Victoire immediate", `${mostImmediate.label} ${pct(mostImmediate.totalImmediateRate)}`, mostImmediate.totalImmediateRate > 0.12 ? "warn" : ""),
    metric("Gagnant avec Graal", `${mostGrailWinner.label} ${pct(mostGrailWinner.winnerGrail)}`, ""),
    metric("Carte cachée à l'aveugle", `${mostHidden.label} ${pct(mostHidden.unknownHiddenTakeRate)}`, mostHidden.unknownHiddenTakeRate > 0.30 ? "warn" : "good"),
    metric("Réservation récupérée", pct(benchmarkReservationRate), ""),
    metric("Cachée revenue au cacheur", pct(benchmarkHiddenReturnRate), ""),
    metric("PV moyen", `${highestScore.label} ${highestScore.avgScoreAll.toFixed(1)}`, ""),
    metric("PV max", maxScore.toFixed(0), maxScore >= 100 ? "warn" : ""),
    metric("PV max par carte", `${maxCardRow.maxCardName} ${maxCard.toFixed(0)}`, maxCard >= 25 ? "warn" : ""),
    metric("Meilleure strategie", `${best.label} ${pct(best.win)}`, best.win > baseline.win + 0.08 ? "warn" : ""),
    metric("Plus gros ecart PV", `${highestDelta.label} ${highestDelta.delta.toFixed(1)}`, highestDelta.delta > 6 ? "warn" : ""),
    strongestCard ? metric("Carte au-dessus du normal", `${strongestCard.name} ${signedPct(strongestCard.presenceDelta)}`, cardVerdict(strongestCard).cls === "bad" ? "bad" : "warn") : "",
    weakCard ? metric("Carte faible possible", weakCard.name, "warn") : "",
  ];
  document.querySelector("#benchAlerts").innerHTML = alerts.filter(Boolean).join("");
  renderSimpleReadout(bench, { baseline, best, highestDelta, mostImmediate, mostGrailWinner, highestScore, maxScore, maxCard, maxCardRow });
  renderStrategyTable(bench, baseline);
  renderCardBalanceTable(bench);
  renderCardPointsTable(bench);
  renderComboTable(bench);
  renderFamilyTable(bench);
  drawBenchmarkCharts(bench);
}

function simpleLevel(kind) {
  return `<span class="simple-level ${kind}">${kind === "bad" ? "Rouge" : kind === "warn" ? "Orange" : "Vert"}</span>`;
}

function signedPct(x) {
  return `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
}

function strategyVerdict(row, baseline) {
  if (row.win > baseline.win + 0.12 || row.delta > 8 || row.totalImmediateRate > 0.18) return { label: "Trop fort ?", cls: "bad" };
  if (row.win > baseline.win + 0.08 || row.delta > 6 || row.totalImmediateRate > 0.10) return { label: "A surveiller", cls: "warn" };
  if (row.win < baseline.win - 0.10) return { label: "Faible", cls: "faible" };
  return { label: "OK", cls: "ok" };
}

function cardVerdict(card) {
  if (card.id === "barde" && card.qty >= 7 && card.quantityLift < 1.25 && card.maxPoints <= 10) {
    return { label: "Normal: 7 ex.", cls: "ok", rank: 0 };
  }
  if (card.maxPoints >= 30 || (card.presenceDelta > 0.18 && card.avgPoints >= 10) || (card.quantityLift >= 1.7 && card.winPresence > 0.12 && card.avgPoints >= 8)) {
    return { label: "Trop forte ?", cls: "bad", rank: 3 };
  }
  if (card.presenceDelta > 0.10 || (card.winnerLift > 1.35 && card.winPresence > 0.18)) {
    return { label: "A surveiller", cls: "warn", rank: 2 };
  }
  if ((card.allPresence > 0.15 && card.winPresence < card.allPresence - 0.12) || card.presenceDelta < -0.18) {
    return { label: "Faible ?", cls: "faible", rank: 2 };
  }
  if (card.qty >= 5 && Math.abs(card.presenceDelta) < 0.12) {
    return { label: "Normal: beaucoup d'ex.", cls: "ok", rank: 0 };
  }
  return { label: "OK", cls: "ok", rank: 0 };
}

function comboVerdict(combo) {
  if (combo.winPresence > 0.35 || combo.winnerLift > 1.8) return { label: "A tester", cls: "warn" };
  if (combo.avgWinningScore >= 85) return { label: "Score haut", cls: "warn" };
  return { label: "OK", cls: "ok" };
}

function signal(text, cls) {
  return `<span class="signal ${cls}">${text}</span>`;
}

function cardBalanceRows(bench) {
  return bench.results.flatMap(strategy => strategy.cards
    .filter(card => card.qty > 0)
    .map(card => ({ strategy: strategy.label, strategyId: strategy.id, ...card })))
    .sort((a, b) => {
      const av = cardVerdict(a);
      const bv = cardVerdict(b);
      const aWeight = av.rank * 100 + Math.abs(a.presenceDelta) * 100 + Math.max(0, a.maxPoints - 20);
      const bWeight = bv.rank * 100 + Math.abs(b.presenceDelta) * 100 + Math.max(0, b.maxPoints - 20);
      return bWeight - aWeight;
    });
}

function renderSimpleReadout(bench, facts) {
  const { baseline, best, highestDelta, mostImmediate, mostGrailWinner, highestScore, maxScore, maxCard, maxCardRow } = facts;
  const topScoringCards = topScoringCardsByMax(bench).slice(0, 5);
  const cardRows = cardBalanceRows(bench);
  const barde = cardRows.find(card => card.id === "barde");
  const topCards = cardRows
    .filter(card => card.presenceDelta > 0.06 || cardVerdict(card).rank > 0)
    .slice(0, 3);
  const lines = [];

  const bestGap = best.win - baseline.win;
  lines.push({
    level: bestGap > 0.12 ? "bad" : bestGap > 0.07 ? "warn" : "good",
    text: `${best.label} gagne ${pct(best.win)} des parties au score. ${bestGap > 0.07 ? "C'est plus haut que la strategie equilibree: il faut tester cette voie a la table." : "Aucune strategie ne semble ecraser les autres."}`,
  });

  lines.push({
    level: mostImmediate.totalImmediateRate > 0.18 ? "bad" : mostImmediate.totalImmediateRate > 0.10 ? "warn" : "good",
    text: `Les victoires immediates montent au maximum a ${pct(mostImmediate.totalImmediateRate)}, surtout avec ${mostImmediate.label}. Roseaux: ${pct(mostImmediate.totalRoseauxImmediateRate)}, Oiseaux: ${pct(mostImmediate.totalOiseauxImmediateRate)}.`,
  });

  lines.push({
    level: mostGrailWinner.winnerGrail > 0.45 ? "warn" : "good",
    text: `Le gagnant a la majorite des cartes au tresor dans jusqu'a ${pct(mostGrailWinner.winnerGrail)} des parties, surtout avec ${mostGrailWinner.label}.`,
  });

  lines.push({
    level: highestScore.avgScoreAll >= 85 ? "warn" : "good",
    text: `Les joueurs marquent en moyenne jusqu'a ${highestScore.avgScoreAll.toFixed(1)} PV avec ${highestScore.label}. Le plus gros score vu est ${maxScore.toFixed(0)} PV.`,
  });

  lines.push({
    level: maxCard >= 30 ? "bad" : maxCard >= 22 ? "warn" : "good",
    text: `${maxCardRow.maxCardName} est la carte qui monte le plus haut: ${maxCard.toFixed(0)} PV avec ${maxCardRow.label}. Si une carte depasse souvent 25 PV, elle merite une verification.`,
  });

  if (topScoringCards.length) {
    lines.push({
      level: topScoringCards[0].points >= 25 ? "warn" : "good",
      text: `Top 5 des cartes qui scorent le plus: ${topScoringCards.map(card => `${card.name} ${card.points.toFixed(0)} PV`).join(", ")}.`,
    });
  }

  if (barde) {
    const bardeOk = barde.quantityLift < 1.25;
    lines.push({
      level: bardeOk ? "good" : "warn",
      text: `Le Barde revient souvent car il y en a ${barde.qty}. Observe chez les gagnants: ${pct(barde.winPresence)}. Attendu avec ${barde.qty} exemplaires: ${pct(barde.expectedPresence)}. ${bardeOk ? "Donc ce n'est pas un probleme tout seul." : "Il faut surtout regarder le duo Barde + Bouffon."}`,
    });
  }

  if (highestDelta.delta > 6) {
    lines.push({
      level: "warn",
      text: `${highestDelta.label} fait environ ${highestDelta.delta.toFixed(1)} PV de plus que ses adversaires. C'est un signal d'ecart possible.`,
    });
  }

  if (topCards.length) {
    lines.push({
      level: cardVerdict(topCards[0]).cls === "bad" ? "bad" : "warn",
      text: `Cartes a lire en premier apres correction par quantite: ${topCards.map(card => `${card.name} (${signedPct(card.presenceDelta)})`).join(", ")}.`,
    });
  }

  document.querySelector("#simpleReadout").innerHTML = lines.map(line => `
    <div class="simple-line">
      ${simpleLevel(line.level)}
      <span>${line.text}</span>
    </div>
  `).join("");
}

function renderStrategyTable(bench, baseline) {
  const rows = [...bench.results].sort((a, b) => b.win - a.win);
  document.querySelector("#strategyTable").innerHTML = `
    <thead><tr><th>Strategie</th><th>Gagne au score</th><th>Graal si gagne</th><th>Graal obtenu</th><th>Trésors moy.</th><th>PV moyen</th><th>Ecart adv.</th><th>PV max moyen</th><th>PV max</th><th>Immediate</th><th>Roseaux</th><th>Oiseaux</th><th>Cachée inconnue</th><th>Réservation récupérée</th><th>Retour cacheur</th><th>PV / carte</th><th>Verdict</th></tr></thead>
    <tbody>
      ${rows.map(row => {
        const verdict = strategyVerdict(row, baseline);
        return `<tr>
          <td>${row.label}</td>
          <td>${pct(row.win)}</td>
          <td>${row.strategyWins > 0 ? pct(row.strategyGrailWinRate) : "-"}</td>
          <td>${pct(row.p1Grail)}</td>
          <td>${row.avgP1Treasures.toFixed(1)}</td>
          <td>${row.avgScoreAll.toFixed(1)}</td>
          <td>${row.delta >= 0 ? "+" : ""}${row.delta.toFixed(1)}</td>
          <td>${row.avgMaxScore.toFixed(1)}</td>
          <td>${row.maxScore.toFixed(0)}</td>
          <td>${pct(row.totalImmediateRate)}</td>
          <td>${pct(row.totalRoseauxImmediateRate)}</td>
          <td>${pct(row.totalOiseauxImmediateRate)}</td>
          <td>${pct(row.unknownHiddenTakeRate)}</td>
          <td>${pct(row.reservationRecoveryRate)}</td>
          <td>${pct(row.hiddenReturnRate)}</td>
          <td>${row.avgCardPoints.toFixed(1)}</td>
          <td>${signal(verdict.label, verdict.cls)}</td>
        </tr>`;
      }).join("")}
    </tbody>`;
}

function topScoringCardsByMax(bench) {
  const byCard = new Map();
  for (const row of bench.results) {
    for (const card of row.cards) {
      const current = byCard.get(card.id);
      if (!current || card.maxPoints > current.points || card.avgPoints > current.avgPoints) {
        byCard.set(card.id, {
          id: card.id,
          name: card.name,
          type: card.type,
          qty: card.qty,
          points: card.maxPoints,
          avgPoints: card.avgPoints,
          strategy: row.label,
          winPresence: card.winPresence,
          expectedPresence: card.expectedPresence,
          presenceDelta: card.presenceDelta,
        });
      }
    }
  }
  return [...byCard.values()].sort((a, b) => b.points - a.points);
}

function renderCardBalanceTable(bench) {
  const rows = cardBalanceRows(bench)
    .filter(row => cardVerdict(row).rank > 0 || row.winDecks >= Math.max(2, bench.games * 0.02) || row.id === "barde")
    .slice(0, 40);
  document.querySelector("#cardBalanceTable").innerHTML = `
    <thead><tr><th>Carte</th><th>Strategie</th><th>Qte</th><th>Gagnants</th><th>Attendu</th><th>Ecart</th><th>Indice</th><th>PV moy.</th><th>PV max</th><th>Verdict</th></tr></thead>
    <tbody>
      ${rows.map(row => {
        const verdict = cardVerdict(row);
        return `<tr>
          <td><strong>${row.name}</strong><br><span class="muted">${row.type}</span></td>
          <td>${row.strategy}</td>
          <td>${row.qty}</td>
          <td>${pct(row.winPresence)}</td>
          <td>${pct(row.expectedPresence)}</td>
          <td>${signedPct(row.presenceDelta)}</td>
          <td>${row.quantityLift.toFixed(2)}x</td>
          <td>${row.avgPoints.toFixed(1)}</td>
          <td>${row.maxPoints.toFixed(0)}</td>
          <td>${signal(verdict.label, verdict.cls)}</td>
        </tr>`;
      }).join("")}
    </tbody>`;
}

function renderCardPointsTable(bench) {
  const topCards = topScoringCardsByMax(bench).slice(0, 8);
  const rows = [...bench.results].sort((a, b) => b.avgCardPoints - a.avgCardPoints);
  document.querySelector("#cardPointsTable").innerHTML = `
    <thead><tr><th>Carte / Strategie</th><th>Type</th><th>Qte</th><th>PV max observe</th><th>PV moyen</th><th>Presence gagnants</th><th>Ecart attendu</th></tr></thead>
    <tbody>
      ${topCards.map(card => `<tr>
        <td><strong>${card.name}</strong><br><span class="muted">${card.strategy}</span></td>
        <td>${card.type}</td>
        <td>${card.qty}</td>
        <td>${card.points.toFixed(0)}</td>
        <td>${card.avgPoints.toFixed(1)}</td>
        <td>${pct(card.winPresence)}</td>
        <td>${signedPct(card.presenceDelta)}</td>
      </tr>`).join("")}
      <tr><th colspan="7">Resume par strategie</th></tr>
      ${rows.map(row => `<tr>
        <td>${row.label}</td>
        <td>-</td>
        <td>-</td>
        <td>${row.maxCardPoints.toFixed(0)} (${row.maxCardName})</td>
        <td>${row.avgCardPoints.toFixed(1)}</td>
        <td>-</td>
        <td>-</td>
      </tr>`).join("")}
    </tbody>`;
}

function renderComboTable(bench) {
  const rows = bench.results.flatMap(strategy => strategy.combos.map(combo => ({ strategy: strategy.label, ...combo })))
    .filter(combo => combo.allDecks >= 2 || combo.winDecks >= 1)
    .sort((a, b) => (b.winnerLift * b.winPresence) - (a.winnerLift * a.winPresence));
  document.querySelector("#comboTable").innerHTML = `
    <thead><tr><th>Strategie</th><th>Combo</th><th>Tous les decks</th><th>Decks gagnants</th><th>Indice gagnant</th><th>Score gagnant</th><th>Verdict</th></tr></thead>
    <tbody>
      ${rows.map(row => `<tr>
        <td>${row.strategy}</td>
        <td>${row.label}</td>
        <td>${pct(row.allPresence)}</td>
        <td>${pct(row.winPresence)}</td>
        <td>${row.winnerLift.toFixed(2)}x</td>
        <td>${row.avgWinningScore.toFixed(1)}</td>
        <td>${signal(comboVerdict(row).label, comboVerdict(row).cls)}</td>
      </tr>`).join("")}
    </tbody>`;
}

function renderFamilyTable(bench) {
  document.querySelector("#familyTable").innerHTML = `
    <thead><tr><th>Strategie</th>${FAMILY_ORDER.map(family => `<th>${family}</th>`).join("")}<th>Famille dominante</th><th>Lecture</th></tr></thead>
    <tbody>
      ${bench.results.map(row => {
        const families = FAMILY_ORDER.map(family => ({ family, value: row.families[family] || 0 }));
        const top = [...families].sort((a, b) => b.value - a.value)[0];
        const spread = top.value - Math.min(...families.map(f => f.value));
        const verdict = spread > 4.5 ? { label: "Tres marquee", cls: "warn" } : { label: "Lisible", cls: "ok" };
        return `<tr>
          <td>${row.label}</td>
          ${families.map(family => `<td>${family.value.toFixed(1)}</td>`).join("")}
          <td>${top.family} (${top.value.toFixed(1)})</td>
          <td>${signal(verdict.label, verdict.cls)}</td>
        </tr>`;
      }).join("")}
    </tbody>`;
}

function drawBenchmarkCharts(bench) {
  drawBarChart("#benchStrategyChart", "Qui gagne au score ?", bench.results.map(r => ({
    label: r.label,
    value: r.win * 100,
    color: "#1f5b68",
    suffix: "%",
  })));
  drawGroupedBarChart("#benchScoreChart", "PV moyens et max", bench.results.map(r => ({
    label: r.label,
    values: [
      { label: "Moyen", value: r.avgScoreAll, color: "#1f5b68" },
      { label: "Max", value: r.avgMaxScore, color: "#d66bc5" },
    ],
  })));
  drawGroupedBarChart("#benchImmediateChart", "Victoires immediates", bench.results.map(r => ({
    label: r.label,
    values: [
      { label: "Roseaux", value: r.totalRoseauxImmediateRate * 100, color: "#b7791f" },
      { label: "Oiseaux", value: r.totalOiseauxImmediateRate * 100, color: "#4b94c9" },
    ],
  })), "%");
  const cardLiftRows = cardBalanceRows(bench)
    .filter(row => row.presenceDelta > 0.02)
    .sort((a, b) => b.presenceDelta - a.presenceDelta)
    .slice(0, 8);
  drawBarChart("#benchCardLiftChart", "Cartes au-dessus de l'attendu", cardLiftRows.map(row => ({
    label: `${row.name} (${row.strategy})`,
    value: row.presenceDelta * 100,
    color: cardVerdict(row).cls === "bad" ? "#b83232" : "#b7791f",
    suffix: "%",
  })));
  const familyColors = ["#7b6d56", "#c84c9b", "#4b94c9", "#167a4a", "#c79b2b"];
  drawGroupedBarChart("#benchFamilyChart", "Familles prises par strategie", bench.results.map(r => ({
    label: r.label,
    values: FAMILY_ORDER.map((family, i) => ({ label: family, value: r.families[family], color: familyColors[i] })),
  })));
}

function setupCanvas(selector, height = 260) {
  const canvas = document.querySelector(selector);
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(320, canvas.clientWidth || 640);
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  return { canvas, ctx, width, height };
}

function drawBarChart(selector, title, rows) {
  const { ctx, width, height } = setupCanvas(selector);
  if (!rows.length) {
    ctx.fillStyle = "#17313a";
    ctx.font = "12px Arial";
    ctx.fillText(title, 12, 18);
    ctx.fillStyle = "#64757c";
    ctx.fillText("Aucun signal net", 12, 48);
    return;
  }
  const max = Math.max(...rows.map(r => r.value), 1);
  const left = 44;
  const bottom = 42;
  const top = 30;
  const barW = (width - left - 16) / rows.length;
  ctx.fillStyle = "#17313a";
  ctx.font = "12px Arial";
  ctx.fillText(title, 12, 18);
  rows.forEach((row, i) => {
    const h = (height - top - bottom) * row.value / max;
    const x = left + i * barW;
    const y = height - bottom - h;
    ctx.fillStyle = row.color;
    ctx.fillRect(x, y, Math.max(8, barW - 8), h);
    ctx.fillStyle = "#17313a";
    ctx.font = "11px Arial";
    ctx.fillText(`${row.value.toFixed(row.suffix === "%" ? 1 : 0)}${row.suffix}`, x, Math.max(28, y - 4));
    ctx.save();
    ctx.translate(x + 4, height - 12);
    ctx.rotate(-0.45);
    ctx.fillStyle = "#64757c";
    ctx.fillText(row.label.slice(0, 14), 0, 0);
    ctx.restore();
  });
}

function drawGroupedBarChart(selector, title, rows, suffix = "") {
  const { ctx, width, height } = setupCanvas(selector);
  if (!rows.length || !rows[0].values.length) {
    ctx.fillStyle = "#17313a";
    ctx.font = "12px Arial";
    ctx.fillText(title, 12, 18);
    ctx.fillStyle = "#64757c";
    ctx.fillText("Aucune donnee", 12, 48);
    return;
  }
  const max = Math.max(...rows.flatMap(r => r.values.map(v => v.value)), 1);
  const left = 44;
  const bottom = 46;
  const top = 46;
  const groupW = (width - left - 16) / rows.length;
  const barW = Math.max(6, (groupW - 10) / rows[0].values.length);
  ctx.fillStyle = "#17313a";
  ctx.font = "12px Arial";
  ctx.fillText(title, 12, 18);
  rows[0].values.forEach((serie, i) => {
    const x = 12 + i * 86;
    ctx.fillStyle = serie.color;
    ctx.fillRect(x, 28, 9, 9);
    ctx.fillStyle = "#64757c";
    ctx.font = "10px Arial";
    ctx.fillText(serie.label.slice(0, 12), x + 13, 37);
  });
  rows.forEach((row, i) => {
    row.values.forEach((serie, j) => {
      const h = (height - top - bottom) * serie.value / max;
      const x = left + i * groupW + j * barW;
      const y = height - bottom - h;
      ctx.fillStyle = serie.color;
      ctx.fillRect(x, y, barW - 2, h);
      if (suffix && serie.value >= max * 0.18) {
        ctx.fillStyle = "#17313a";
        ctx.font = "10px Arial";
        ctx.fillText(`${serie.value.toFixed(0)}${suffix}`, x, Math.max(48, y - 3));
      }
    });
    ctx.save();
    ctx.translate(left + i * groupW + 2, height - 12);
    ctx.rotate(-0.45);
    ctx.fillStyle = "#64757c";
    ctx.font = "11px Arial";
    ctx.fillText(row.label.slice(0, 14), 0, 0);
    ctx.restore();
  });
}

function normalizeRules(rules = {}) {
  const merged = { ...structuredClone(BASE_RULES), ...rules };
  merged.handSize = Math.max(1, Math.round(Number(merged.handSize) || BASE_RULES.handSize));
  merged.roseauxImmediate = Number.isFinite(Number(merged.roseauxImmediate)) ? Math.max(0, Math.round(Number(merged.roseauxImmediate))) : BASE_RULES.roseauxImmediate;
  merged.oiseauxImmediate = Number.isFinite(Number(merged.oiseauxImmediate)) ? Math.max(0, Math.round(Number(merged.oiseauxImmediate))) : BASE_RULES.oiseauxImmediate;
  merged.grailPoints = Number.isFinite(Number(merged.grailPoints)) ? Number(merged.grailPoints) : BASE_RULES.grailPoints;
  merged.grailStrict = merged.grailStrict === true || merged.grailStrict === "true";
  merged.royalPairBonus = Number.isFinite(Number(merged.royalPairBonus)) ? Number(merged.royalPairBonus) : BASE_RULES.royalPairBonus;
  merged.royalKingBonus = Number.isFinite(Number(merged.royalKingBonus)) ? Number(merged.royalKingBonus) : BASE_RULES.royalKingBonus;
  merged.bardeScores = parseScoreList(Array.isArray(merged.bardeScores) ? merged.bardeScores.join("/") : merged.bardeScores, BASE_RULES.bardeScores);
  return merged;
}

function serializeDesign() {
  syncMajorityCardFromRules();
  return {
    version: 2,
    rules: state.rules,
    cards: state.cards,
  };
}

function loadDesign(data) {
  if (Array.isArray(data)) {
    state.cards = migrateCards(data);
    const tresor = state.cards.find(card => card.id === "tresor");
    state.rules = normalizeRules({
      ...BASE_RULES,
      grailPoints: Number.isFinite(Number(tresor?.value)) ? Number(tresor.value) : BASE_RULES.grailPoints,
    });
  } else {
    state.cards = migrateCards(Array.isArray(data?.cards) ? data.cards : structuredClone(BASE_CARDS));
    state.rules = normalizeRules(data?.rules || BASE_RULES);
  }
  syncMajorityCardFromRules();
}

function refreshAfterDesignChange({ rules = false, cards = false } = {}) {
  syncMajorityCardFromRules();
  renderDeckStats();
  if (rules) renderRulesEditor();
  if (cards) renderCardsEditor();
  if (state.game) renderGame();
}

function renderRulesEditor() {
  const editor = document.querySelector("#rulesEditor");
  if (!editor) return;
  editor.innerHTML = `
    <label>Cartes / joueur
      <input data-rule="handSize" type="number" min="1" max="30" step="1" value="${handSize()}">
    </label>
    <label>Victoire Roseaux (0 = inactive)
      <input data-rule="roseauxImmediate" type="number" min="0" max="12" step="1" value="${immediateThreshold("roseaux")}">
    </label>
    <label>Victoire Oiseaux
      <input data-rule="oiseauxImmediate" type="number" min="1" max="12" step="1" value="${immediateThreshold("oiseaux")}">
    </label>
    <label>PV majorité Graal
      <input data-rule="grailPoints" type="number" step="1" value="${numericRule("grailPoints", BASE_RULES.grailPoints)}">
    </label>
    <label>Prince / Princesse
      <input data-rule="royalPairBonus" type="number" step="1" value="${numericRule("royalPairBonus", BASE_RULES.royalPairBonus)}">
    </label>
    <label>Prince-Roi
      <input data-rule="royalKingBonus" type="number" step="1" value="${numericRule("royalKingBonus", BASE_RULES.royalKingBonus)}">
    </label>
    <label>Barde 1/2/3/4/5+
      <input data-rule-list="bardeScores" type="text" value="${formatScoreList(state.rules.bardeScores)}">
    </label>
    <label class="check-control">
      <input data-rule="grailStrict" type="checkbox" ${state.rules.grailStrict ? "checked" : ""}>
      Majorité stricte
    </label>
  `;

  editor.querySelectorAll("[data-rule]").forEach(input => {
    const updateRule = () => {
      const key = input.dataset.rule;
      if (input.type !== "checkbox" && !Number.isFinite(Number(input.value))) return;
      state.rules[key] = input.type === "checkbox" ? input.checked : Number(input.value);
      state.rules = normalizeRules(state.rules);
      refreshAfterDesignChange({ cards: key === "grailPoints" });
    };
    const eventName = input.type === "checkbox" ? "change" : "input";
    input.addEventListener(eventName, updateRule);
    if (eventName !== "change") input.addEventListener("change", updateRule);
  });
  editor.querySelectorAll("[data-rule-list]").forEach(input => {
    input.addEventListener("change", () => {
      const key = input.dataset.ruleList;
      state.rules[key] = parseScoreList(input.value, BASE_RULES[key]);
      refreshAfterDesignChange({ rules: true });
    });
  });
}

function renderCardsEditor() {
  const table = document.querySelector("#cardsTable");
  table.innerHTML = `
    <thead><tr><th>Carte</th><th>Qté</th><th>Type</th><th>Base</th><th>Bonus</th><th>Malus</th><th>Seuil</th><th>Plancher</th><th>Série</th><th>Effet</th></tr></thead>
    <tbody>
      ${state.cards.map((card, i) => `
        <tr>
          <td>${card.name}</td>
          <td><input data-card="${i}" data-field="qty" type="number" min="0" value="${card.qty}"></td>
          <td>
            <select data-card="${i}" data-field="type">
              ${["Bâtiment","Grenouille","Noble","Oiseau","Objet"].map(t => `<option ${card.type === t ? "selected" : ""}>${t}</option>`).join("")}
            </select>
          </td>
          <td><input data-card="${i}" data-field="base" type="number" value="${card.base || 0}"></td>
          <td><input data-card="${i}" data-field="value" type="number" value="${card.value || 0}"></td>
          <td><input data-card="${i}" data-field="negValue" type="number" value="${card.negValue ?? ""}"></td>
          <td><input data-card="${i}" data-field="threshold" type="number" min="0" value="${card.threshold ?? ""}"></td>
          <td><input data-card="${i}" data-field="floor" type="number" value="${card.floor ?? ""}"></td>
          <td>${card.birdScores?.length ? `<input data-card="${i}" data-field="birdScores" type="text" value="${card.birdScores.join("/")}">` : "-"}</td>
          <td>${cardRulesText(card)}</td>
        </tr>
      `).join("")}
    </tbody>`;
  table.querySelectorAll("input,select").forEach(input => {
    const updateCard = () => {
      const card = state.cards[Number(input.dataset.card)];
      const field = input.dataset.field;
      if (field === "type") {
        card[field] = input.value;
      } else if (field === "birdScores") {
        card[field] = parseScoreList(input.value, card[field] || [10, 5, 0]);
      } else if (["negValue", "threshold", "floor"].includes(field) && input.value === "") {
        delete card[field];
      } else {
        if (!Number.isFinite(Number(input.value))) return;
        card[field] = Number(input.value);
      }
      if (card.id === "tresor" && field === "value") {
        state.rules.grailPoints = Number(card.value || 0);
        state.rules = normalizeRules(state.rules);
        refreshAfterDesignChange({ rules: true });
      } else {
        refreshAfterDesignChange();
      }
    };
    const eventName = input.tagName === "SELECT" ? "change" : "input";
    input.addEventListener(eventName, updateCard);
    if (eventName !== "change") input.addEventListener("change", updateCard);
  });
}

function renderDeckStats() {
  const total = state.cards.reduce((s, c) => s + Number(c.qty || 0), 0);
  const types = {};
  for (const c of state.cards) types[c.type] = (types[c.type] || 0) + Number(c.qty || 0);
  document.querySelector("#deckStatus").textContent = `Deck courant: ${total} cartes`;
  document.querySelector("#deckStats").innerHTML = [
    metric("Total", total, total === BASE_DECK_TOTAL ? "good" : "warn"),
    metric("Cartes / joueur", handSize(), ""),
    metric("Graal", `${numericRule("grailPoints", BASE_RULES.grailPoints)} PV`, ""),
    metric("Roseaux", state.cards.find(c => c.id === "roseaux")?.qty || 0, ""),
    metric("Oiseaux", state.cards.filter(c => c.type === "Oiseau").reduce((s,c)=>s+Number(c.qty||0),0), ""),
    ...Object.entries(types).map(([k,v]) => metric(k, v, "")),
  ].join("");
}

function renderGame() {
  renderDeckStats();
  const g = state.game;
  document.querySelector("#offer").innerHTML = "";
  document.querySelector("#boards").innerHTML = "";
  if (!g) return;
  scoreAll();
  document.querySelector("#turnInfo").textContent = g.over
    ? "Partie terminée."
    : g.phase === "draft"
      ? `Tour ${g.round + 1}, choix de ${currentPicker()?.name || ""}`
      : "Choisis une case de placement.";
  if (!g.over && g.phase === "hide") {
    document.querySelector("#turnInfo").textContent = `Tour ${g.round + 1}, ${g.players[g.active].name} choisit la carte face cachee.`;
  }
  document.querySelector("#log").innerHTML = g.log.map(x => `<div>${x}</div>`).join("");
  renderOffer();
  renderBoards();
}

function renderOffer() {
  const g = state.game;
  const offer = document.querySelector("#offer");
  if (g && g.phase === "hide" && !g.over) {
    const hider = g.players[g.active];
    offer.innerHTML = g.offer.map((card, idx) => {
      const disabled = !hider.human ? "disabled" : "";
      return `<div class="card">
        <div class="card-title">${card.name}</div>
        <div class="tag-row">${tags(card)}</div>
        <div class="muted">${cardRulesText(card)}</div>
        <button ${disabled} data-hide="${idx}">Mettre face cachee</button>
      </div>`;
    }).join("");
    offer.querySelectorAll("button[data-hide]").forEach(btn => {
      btn.addEventListener("click", () => hideOfferCard(Number(btn.dataset.hide)));
    });
    return;
  }
  if (g.phase === "placement" && g.pendingPlacement) {
    const player = g.players[g.pendingPlacement.playerIndex];
    const card = g.pendingPlacement.card;
    const currentScore = scoreCard(player, card);
    const sign = currentScore > 0 ? "+" : "";
    const cancelButton = player.human ? `<button class="secondary" data-cancel-choice>Annuler le choix</button>` : "";
    offer.innerHTML = `<div class="card card-pending">
      <div class="card-title">Carte revelee: ${card.name}</div>
      <div class="tag-row">${tags(card)}<span class="tag score-tag">${sign}${currentScore} PV avant pose</span></div>
      <div class="muted">${cardRulesText(card)}</div>
      ${cancelButton}
    </div>`;
    offer.querySelector("[data-cancel-choice]")?.addEventListener("click", cancelHumanChoice);
    return;
  }
  if (!g || g.phase !== "draft" || g.over) return;
  const picker = currentPicker();
  offer.innerHTML = visibleOfferForPlayer(picker?.index).map(item => {
    const label = item.hidden ? "Carte cachée" : item.card.name;
    const disabled = !picker?.human ? "disabled" : "";
    return `<div class="card">
      <div class="card-title">${label}</div>
      <div class="tag-row">${item.hidden ? `<span class="tag">?</span>` : tags(item.card)}</div>
      <div class="muted">${item.hidden ? "Effet inconnu pour le joueur." : cardRulesText(item.card)}</div>
      <button ${disabled} data-offer="${item.idx}">Prendre</button>
    </div>`;
  }).join("");
  offer.querySelectorAll("button[data-offer]").forEach(btn => {
    btn.addEventListener("click", () => takeOffer(Number(btn.dataset.offer)));
  });
}

function tags(card) {
  return `<span class="tag ${normalizeId(card.type)}">${card.type}</span>${card.immediate ? `<span class="tag">victoire</span>` : ""}`;
}

function cardSummaryInBoard(player, card) {
  const points = scoreCard(player, card);
  const sign = points > 0 ? "+" : "";
  return {
    points: `${sign}${points} PV`,
    text: cardRulesText(card),
  };
}

function previewPlacementScore(player, card, x, y) {
  placeBoardCard(player, x, y, card);
  const points = scoreCard(player, card);
  removeBoardCard(player, x, y);
  return points;
}

function renderBoards() {
  const g = state.game;
  const pending = g.pendingPlacement;
  const boards = document.querySelector("#boards");
  boards.innerHTML = g.players.map(player => {
    const legal = pending && pending.playerIndex === player.index && player.human ? legalPlacements(player) : [];
    const renderCells = [...player.board.map(cell => ({ x: cell.x, y: cell.y })), ...legal];
    const renderBounds = boardBoundsFromCells(renderCells.map(cell => ({ ...cell, card: true }))) || { minX: 0, minY: 0, maxX: BOARD_W - 1, maxY: BOARD_H - 1 };
    const originX = renderBounds.minX;
    const originY = renderBounds.minY;
    const renderW = Math.max(BOARD_W, renderBounds.maxX - renderBounds.minX + 1);
    const renderH = Math.max(BOARD_H, renderBounds.maxY - renderBounds.minY + 1);
    const cells = [];
    for (let gy = 0; gy < renderH; gy++) {
      for (let gx = 0; gx < renderW; gx++) {
        const x = originX + gx;
        const y = originY + gy;
        const entry = getBoardEntry(player, x, y, { includeDestroyed: true });
        const card = entry?.card || null;
        const playable = legal.some(p => p.x === x && p.y === y);
        let content = "";
        if (card && entry.destroyed) {
          content = `<div class="cell-name">${card.name}</div>
            <div class="cell-line">
              <span class="cell-type ${normalizeId(card.type)}">${card.type}</span>
              <span class="cell-score">0 PV</span>
            </div>
            <div class="cell-effect">Détruite par un Oiseau.</div>`;
        } else if (card) {
          const summary = cardSummaryInBoard(player, card);
          content = `<div class="cell-name">${card.name}</div>
            <div class="cell-line">
              <span class="cell-type ${normalizeId(card.type)}">${card.type}</span>
              <span class="cell-score">${summary.points}</span>
            </div>
            <div class="cell-effect">${summary.text}</div>`;
        } else if (playable && pending?.card) {
          const preview = previewPlacementScore(player, pending.card, x, y);
          const sign = preview > 0 ? "+" : "";
          content = `<div class="cell-preview">Poser ici</div><div class="cell-score">${sign}${preview} PV</div>`;
        }
        cells.push(`<div class="cell ${card ? "" : "empty"} ${entry?.destroyed ? "destroyed" : ""} ${playable ? "playable" : ""}" data-player="${player.index}" data-x="${x}" data-y="${y}">${content}</div>`);
      }
    }
    return `<div class="board-panel">
      <div class="board-meta"><strong>${player.name}</strong><span>${player.score.toFixed(0)} pts</span></div>
      <div class="muted">Roseaux ${countInKingdom(player,"Roseaux fortifiés")} · Oiseaux ${countInKingdom(player,"Oiseau")} ${player.grail ? "· Graal" : ""}</div>
      <div class="board" style="grid-template-columns: repeat(${renderW}, 1fr);">${cells.join("")}</div>
    </div>`;
  }).join("");
  boards.querySelectorAll(".cell.playable").forEach(cell => {
    cell.addEventListener("click", () => {
      const p = g.players[Number(cell.dataset.player)];
      const { card } = g.pendingPlacement;
      placeBoardCard(p, Number(cell.dataset.x), Number(cell.dataset.y), card);
      log(`${p.name} place ${card.name}.`);
      afterPlacement(p, card);
    });
  });
}

function activateView(viewId) {
  document.querySelectorAll(".tab,.view").forEach(el => el.classList.remove("active"));
  document.querySelector(`.tab[data-view="${viewId}"]`)?.classList.add("active");
  document.querySelector(`#${viewId}`)?.classList.add("active");
  renderDeckStats();
}

function bindUI() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      activateView(btn.dataset.view);
    });
  });
  document.querySelector("#newGame").addEventListener("click", () => {
    setBirdCount(Number(document.querySelector("#playBirds")?.value || 5));
    newGame(
      Number(document.querySelector("#playPlayers").value),
      document.querySelector("#playAgent").value,
      document.querySelector("#playPrep").value,
      document.querySelector("#playCounter").value === "on"
    );
  });
  document.querySelector("#autoTurn").addEventListener("click", () => {
    if (!state.game) return;
    proceedAgents();
  });
  document.querySelector("#runSimple").addEventListener("click", runSimpleStats);
  document.querySelector("#runSim").addEventListener("click", runSimulation);
  document.querySelector("#runBenchmark").addEventListener("click", runBenchmark);
  document.querySelector("#quickBenchmark").addEventListener("click", () => {
    const quickGames = Number(document.querySelector("#quickBenchGames").value || 10);
    document.querySelector("#benchGames").value = quickGames;
    activateView("fine");
    runBenchmark();
  });
  document.querySelector("#resetCards").addEventListener("click", () => {
    state.cards = structuredClone(BASE_CARDS);
    state.cards = migrateCards(state.cards);
    state.rules = structuredClone(BASE_RULES);
    syncMajorityCardFromRules();
    renderRulesEditor();
    renderCardsEditor();
    renderDeckStats();
  });
  document.querySelector("#exportCards").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(serializeDesign(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "etang-du-roi-v14-reglages.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });
  document.querySelector("#importCards").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    loadDesign(JSON.parse(await file.text()));
    renderRulesEditor();
    renderCardsEditor();
    renderDeckStats();
  });
}

bindUI();
renderRulesEditor();
renderCardsEditor();
renderDeckStats();

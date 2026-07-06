(function initEtangGame(root) {
  const BOARD_W = 4;
  const BOARD_H = 3;
  const HAND_SIZE = 12;

  const HERON_TARGETS = [
    { id: "topLeft", label: "coin haut gauche", relX: 0, relY: 0 },
    { id: "topRight", label: "coin haut droit", relX: BOARD_W - 1, relY: 0 },
    { id: "bottomLeft", label: "coin bas gauche", relX: 0, relY: BOARD_H - 1 },
    { id: "bottomRight", label: "coin bas droit", relX: BOARD_W - 1, relY: BOARD_H - 1 },
  ];

  const HERON_ASSETS = {
    topLeft: "heron_top_left.png",
    topRight: "heron_top_right.png",
    bottomLeft: "heron_bottom_left.png",
  };

  const CARDS = [
    { id: "roseaux", name: "Roseaux fortifies", qty: 5, type: "Batiment", base: 0, mode: "cornerSet", value: 4, text: "+4 par Roseaux fortifies dans un coin.", asset: "roseaux.png" },
    { id: "coffre", name: "Coffre", qty: 2, type: "Objet", base: 0, mode: "kingdom", pos: ["Objet"], value: 3, text: "+3 par Objet dans le royaume.", asset: "coffre.png" },
    { id: "moulin", name: "Moulin", qty: 1, type: "Batiment", base: 2, mode: "kingdom", pos: ["Paysan", "Grange"], value: 3, text: "+3 par Paysan et Grange.", asset: "moulin.png" },
    { id: "barde", name: "Barde", qty: 7, type: "Grenouille", base: 0, mode: "barde", text: "1/2/3/4/5+ Bardes: 10/6/3/1/0 par Barde.", asset: "barde.png" },
    { id: "chevalier", name: "Chevalier", qty: 3, type: "Grenouille", base: 2, mode: "adjacent", pos: ["Oiseau"], value: 5, antiHeron: true, text: "+5 par Oiseau adjacent. Annule un Heron adjacent.", asset: "chevalier.png" },
    { id: "carpographe", name: "Carpographe", qty: 1, type: "Noble", base: 3, mode: "kingdom", pos: ["Carte au tresor"], value: 3, text: "+3 par Carte au tresor.", asset: "carpographe.png" },
    { id: "prince", name: "Prince", qty: 1, type: "Noble", base: 4, mode: "royal", text: "+6 si Princesse, +4 si Roi.", asset: "prince.png" },
    { id: "princesse", name: "Princesse", qty: 1, type: "Noble", base: 4, mode: "royal", text: "+6 si Prince, +4 si Roi.", asset: "princesse.png" },
    { id: "heron", name: "Heron", qty: 4, type: "Oiseau", base: 6, mode: "heron", immediate: "oiseaux", text: "6 PV. Si 4 Oiseaux: victoire immediate. Detruit sa case marquee en fin de partie.", asset: "heron.png" },
    { id: "tresor", name: "Carte au tresor", qty: 5, type: "Objet", base: 3, mode: "majority", text: "3 PV. Majorite stricte: Graal +10.", asset: "tresor.png" },
    { id: "paysan", name: "Paysan", qty: 3, type: "Grenouille", base: 0, mode: "kingdom", pos: ["Algues"], value: 4, text: "+4 par Algues.", asset: "paysan.png" },
    { id: "algues", name: "Algues", qty: 3, type: "Batiment", base: 0, mode: "adjacent", pos: ["Grenouille"], value: 3, text: "+3 par Grenouille adjacente.", asset: "algues.png" },
    { id: "roi", name: "Roi", qty: 1, type: "Noble", base: 2, mode: "kingdom", pos: ["Carte au tresor", "Noble"], value: 2, text: "+2 par Carte au tresor et Noble.", asset: "roi.png" },
    { id: "donjon", name: "Donjon", qty: 1, type: "Batiment", base: 3, mode: "adjacent", pos: ["Noble", "Oiseau"], value: 3, text: "+3 par Noble/Oiseau adjacent.", asset: "donjon.png" },
    { id: "temple", name: "Temple", qty: 1, type: "Objet", base: 0, mode: "threshold", pos: ["Batiment"], neg: ["Objet"], value: 15, negValue: 1, threshold: 5, text: "+15 si 5+ Batiments, -1 par Objet.", asset: "temple.png" },
    { id: "moine", name: "Moine", qty: 1, type: "Noble", base: 0, mode: "threshold", pos: ["Carte au tresor"], neg: ["Grenouille"], value: 15, negValue: 1, threshold: 2, text: "+15 si 2+ Cartes au tresor, -1 par Grenouille.", asset: "moine.png" },
    { id: "revolutionnaire", name: "Revolutionnaire", qty: 1, type: "Grenouille", base: 0, mode: "threshold", pos: ["Grenouille"], neg: ["Noble"], value: 15, negValue: 1, threshold: 5, text: "+15 si 5+ Grenouilles, -1 par Noble.", asset: "revolutionnaire.png" },
    { id: "capitaine", name: "Capitaine", qty: 1, type: "Noble", base: 2, mode: "adjacent", pos: ["Oiseau"], value: 6, antiHeron: true, text: "+6 par Oiseau adjacent. Annule un Heron adjacent.", asset: "capitaine.png" },
    { id: "grange", name: "Grange", qty: 2, type: "Batiment", base: 2, mode: "kingdom", pos: ["Paysan", "Algues"], value: 2, text: "+2 par Paysan et Algues.", asset: "grange.png" },
    { id: "bouffon", name: "Bouffon", qty: 1, type: "Grenouille", base: 0, mode: "minCount", pos: ["Barde"], value: 20, threshold: 3, text: "+20 si 3+ Bardes.", asset: "bouffon.png" },
    { id: "antiquaire", name: "Antiquaire", qty: 1, type: "Grenouille", base: 0, mode: "adjacent", pos: ["Objet"], value: 4, text: "+4 par Objet adjacent.", asset: "antiquaire.png" },
    { id: "magicien", name: "Magicien", qty: 1, type: "Noble", base: 0, mode: "threshold", pos: ["Oiseau"], neg: ["Batiment"], value: 15, negValue: 1, threshold: 2, text: "+15 si 2+ Oiseaux, -1 par Batiment.", asset: "magicien.png" },
    { id: "architecte", name: "Architecte", qty: 1, type: "Noble", base: 2, mode: "kingdom", pos: ["Batiment"], value: 2, text: "+2 par Batiment.", asset: "architecte.png" },
    { id: "dame_lac", name: "Dame du lac", qty: 1, type: "Noble", base: 2, mode: "adjacent", pos: ["Objet", "Noble"], value: 3, text: "+3 par Objet/Noble adjacent.", asset: "dame_lac.png" },
    { id: "nenuphar", name: "Nenuphar", qty: 1, type: "Batiment", base: 0, mode: "kingdom", pos: ["Grenouille"], value: 3, text: "+3 par Grenouille.", asset: "nenuphar.png" },
    { id: "grand_duc", name: "Grand Duc", qty: 1, type: "Oiseau", base: 0, mode: "grandDuc", immediate: "oiseaux", text: "Score selon Oiseaux: 1=10, 2=5, 3+=0. Si 4 Oiseaux: victoire immediate.", asset: "grand_duc.png" },
    { id: "forum", name: "Forum", qty: 1, type: "Batiment", base: 4, mode: "position", pos: ["Centre"], value: 5, text: "+5 si case centrale.", asset: "forum.png" },
    { id: "pont_levis", name: "Pont-levis", qty: 1, type: "Batiment", base: 3, mode: "adjacent", pos: ["Batiment"], value: 3, text: "+3 par Batiment adjacent.", asset: "pont_levis.png" },
  ];

  const CARD_BY_ID = Object.fromEntries(CARDS.map(card => [card.id, card]));

  function cardDef(cardOrId) {
    return CARD_BY_ID[typeof cardOrId === "string" ? cardOrId : cardOrId.id];
  }

  function cardAsset(card, def) {
    if (def.id === "heron") return HERON_ASSETS[card.heronTarget] || def.asset;
    return def.asset;
  }

  function deckTotal() {
    return CARDS.reduce((sum, card) => sum + card.qty, 0);
  }

  function offerSizeForPlayers(playersCount) {
    return playersCount === 2 ? 3 : playersCount;
  }

  function createDeck() {
    const deck = [];
    for (const card of CARDS) {
      for (let copyIndex = 0; copyIndex < card.qty; copyIndex++) {
        const copy = { ...card, copyIndex, uid: `${card.id}-${copyIndex}-${Math.random().toString(36).slice(2)}` };
        if (card.id === "heron") copy.heronTarget = HERON_TARGETS[copyIndex]?.id || HERON_TARGETS[copyIndex % HERON_TARGETS.length].id;
        deck.push(copy);
      }
    }
    return shuffle(deck);
  }

  function shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  function makeGame(players) {
    const gamePlayers = players.map((player, index) => ({
      id: player.id,
      name: player.name,
      isBot: Boolean(player.isBot),
      botProfile: player.botProfile || "",
      index,
      board: [],
      score: 0,
      grail: false,
      win: null,
    }));
    const game = {
      players: gamePlayers,
      deck: createDeck(),
      round: 0,
      active: 0,
      offer: [],
      hiddenIndex: -1,
      hiddenBy: null,
      pickOrder: [],
      pickCursor: 0,
      phase: "draft",
      pendingPlacement: null,
      over: false,
      winnerId: null,
      winReason: "",
      log: [],
      heronDestructions: [],
    };
    addLog(game, `Partie lancee: ${players.length} joueurs, ${deckTotal()} cartes.`);
    nextDraft(game);
    return game;
  }

  function addLog(game, text) {
    game.log.unshift(text);
    game.log = game.log.slice(0, 80);
  }

  function nextDraft(game) {
    if (game.over) return;
    if (game.round >= HAND_SIZE || game.deck.length === 0) {
      finishGame(game, "score");
      return;
    }
    const count = Math.min(offerSizeForPlayers(game.players.length), game.deck.length);
    game.offer = game.deck.splice(0, count);
    game.hiddenIndex = -1;
    game.hiddenBy = game.players[game.active].id;
    game.pickOrder = [];
    game.pickCursor = 0;
    game.pendingPlacement = null;
    game.phase = "hide";
    addLog(game, `Tour ${game.round + 1}: ${game.players[game.active].name} prepare l'offre.`);
  }

  function beginPick(game) {
    if (game.players.length === 2) {
      game.pickOrder = [1 - game.active, game.active];
    } else {
      game.pickOrder = [];
      for (let i = 1; i < game.players.length; i++) game.pickOrder.push((game.active + i) % game.players.length);
      game.pickOrder.push(game.active);
    }
    game.pickCursor = 0;
    game.phase = "pick";
  }

  function currentPicker(game) {
    return game.players[game.pickOrder[game.pickCursor]] || null;
  }

  function currentTurnPlayer(game) {
    if (!game || game.over) return null;
    if (game.phase === "hide") return game.players[game.active] || null;
    if (game.phase === "pick") return currentPicker(game);
    if (game.phase === "place") return game.players.find(player => player.id === game.pendingPlacement?.playerId) || null;
    return null;
  }

  function assertTurn(game, playerId, phase) {
    if (!game || game.over) throw new Error("La partie est terminee.");
    if (game.phase !== phase) throw new Error("Ce n'est pas le bon moment.");
    if (phase === "hide" && game.players[game.active].id !== playerId) throw new Error("Ce n'est pas a vous de cacher.");
    if (phase === "pick" && currentPicker(game)?.id !== playerId) throw new Error("Ce n'est pas a vous de choisir.");
    if (phase === "place" && game.pendingPlacement?.playerId !== playerId) throw new Error("Ce n'est pas a vous de poser.");
  }

  function hideCard(game, playerId, index) {
    assertTurn(game, playerId, "hide");
    if (index < 0 || index >= game.offer.length) throw new Error("Carte invalide.");
    game.hiddenIndex = index;
    game.hiddenBy = playerId;
    addLog(game, `${playerName(game, playerId)} met une carte face cachee.`);
    beginPick(game);
  }

  function takeCard(game, playerId, index) {
    assertTurn(game, playerId, "pick");
    if (index < 0 || index >= game.offer.length) throw new Error("Carte invalide.");
    const player = currentPicker(game);
    const card = game.offer[index];
    game.offer.splice(index, 1);
    if (game.hiddenIndex === index) game.hiddenIndex = -1;
    if (game.hiddenIndex > index) game.hiddenIndex--;
    game.pendingPlacement = { playerId, card };
    game.phase = "place";
    addLog(game, `${player.name} prend ${card.name}.`);
  }

  function placeCard(game, playerId, x, y) {
    assertTurn(game, playerId, "place");
    const player = game.players.find(item => item.id === playerId);
    const card = game.pendingPlacement.card;
    const legal = legalPlacements(player);
    if (!legal.some(pos => pos.x === x && pos.y === y)) throw new Error("Placement impossible.");
    player.board.push({ x, y, card });
    game.pendingPlacement = null;
    assignGrail(game.players);
    scoreAll(game.players);
    addLog(game, `${player.name} pose ${card.name}.`);
    const immediate = checkImmediate(player);
    if (immediate) {
      player.win = immediate;
      game.over = true;
      game.phase = "done";
      game.winnerId = player.id;
      game.winReason = immediate;
      addLog(game, `${player.name} gagne immediatement (${immediate}).`);
      return;
    }
    game.pickCursor++;
    if (game.pickCursor >= game.pickOrder.length) {
      discardRemainingOffer(game);
      game.round++;
      game.active = (game.active + 1) % game.players.length;
      nextDraft(game);
      return;
    }
    game.phase = "pick";
  }

  function discardRemainingOffer(game) {
    if (!game.offer.length) return;
    const names = game.offer.map(card => card.name).join(", ");
    addLog(game, `${names} ${game.offer.length > 1 ? "sont defaussees" : "est defaussee"}.`);
    game.offer = [];
    game.hiddenIndex = -1;
  }

  function finishGame(game, reason) {
    applyHeronDestruction(game);
    assignGrail(game.players);
    scoreAll(game.players);
    const best = Math.max(...game.players.map(player => player.score));
    const winners = game.players.filter(player => player.score === best);
    for (const winner of winners) winner.win = "score";
    game.over = true;
    game.phase = "done";
    game.winnerId = winners[0]?.id || null;
    game.winReason = reason || "score";
    addLog(game, `Fin de partie. Meilleur score: ${best}.`);
  }

  function playerName(game, playerId) {
    return game.players.find(player => player.id === playerId)?.name || "Joueur";
  }

  function boardEntries(player, { includeDestroyed = false } = {}) {
    return player.board.filter(cell => includeDestroyed || !cell.destroyed).map(cell => ({ ...cell, card: cell.card }));
  }

  function boardCards(player, options) {
    return boardEntries(player, options).map(cell => cell.card);
  }

  function getBoardEntry(player, x, y, { includeDestroyed = false } = {}) {
    return player.board.find(cell => cell.x === x && cell.y === y && (includeDestroyed || !cell.destroyed)) || null;
  }

  function boardBoundsFromCells(cells) {
    if (!cells.length) return null;
    return {
      minX: Math.min(...cells.map(cell => cell.x)),
      maxX: Math.max(...cells.map(cell => cell.x)),
      minY: Math.min(...cells.map(cell => cell.y)),
      maxY: Math.max(...cells.map(cell => cell.y)),
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
    if (!player.board.length) return [{ x: 0, y: 0 }];
    const candidates = new Map();
    for (const cell of player.board) {
      for (const [x, y] of [[cell.x + 1, cell.y], [cell.x - 1, cell.y], [cell.x, cell.y + 1], [cell.x, cell.y - 1]]) {
        if (getBoardEntry(player, x, y, { includeDestroyed: true })) continue;
        candidates.set(`${x},${y}`, { x, y });
      }
    }
    return [...candidates.values()].filter(pos => fitsBoardLimit([...player.board, { x: pos.x, y: pos.y }]));
  }

  function findCard(player, uid) {
    const cell = player.board.find(entry => entry.card.uid === uid && !entry.destroyed);
    return cell ? { x: cell.x, y: cell.y } : null;
  }

  function neighbors(player, x, y) {
    return [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]
      .map(([cx, cy]) => getBoardEntry(player, cx, cy)?.card)
      .filter(Boolean);
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

  function matches(card, token) {
    const def = cardDef(card);
    if (token === "Carte au tresor") return def.id === "tresor";
    return def.type === token || def.name === token || def.id === token;
  }

  function countInKingdom(player, token) {
    return boardCards(player).filter(card => matches(card, token)).length;
  }

  function countFamily(player, family) {
    return boardCards(player).filter(card => cardDef(card).type === family).length;
  }

  function countCornerMatches(player, token) {
    return boardEntries(player).filter(cell => matches(cell.card, token) && isDynamicCorner(player, cell)).length;
  }

  function scoreCard(player, card) {
    const def = cardDef(card);
    const pos = findCard(player, card.uid);
    const adj = pos ? neighbors(player, pos.x, pos.y) : [];
    let score = Number(def.base || 0);
    switch (def.mode) {
      case "cornerSet":
        score += countCornerMatches(player, "Roseaux fortifies") * def.value;
        break;
      case "kingdom":
        for (const token of def.pos || []) score += countInKingdom(player, token) * def.value;
        break;
      case "adjacent":
        for (const token of def.pos || []) score += adj.filter(item => matches(item, token)).length * def.value;
        break;
      case "royal":
        if (def.id === "prince") {
          if (countInKingdom(player, "Princesse")) score += 6;
          if (countInKingdom(player, "Roi")) score += 4;
        } else {
          if (countInKingdom(player, "Prince")) score += 6;
          if (countInKingdom(player, "Roi")) score += 4;
        }
        break;
      case "barde":
        score += [10, 6, 3, 1, 0][Math.min(Math.max(0, countInKingdom(player, "Barde") - 1), 4)] || 0;
        break;
      case "minCount":
        if (countInKingdom(player, def.pos[0]) >= def.threshold) score += def.value;
        break;
      case "threshold":
        if (countInKingdom(player, def.pos[0]) >= def.threshold) score += def.value;
        for (const token of def.neg || []) score -= countInKingdom(player, token) * def.negValue;
        break;
      case "position":
        if ((def.pos || []).includes("Centre") && isDynamicCenter(player, pos)) score += def.value;
        break;
      case "grandDuc": {
        const birds = countFamily(player, "Oiseau");
        score += birds <= 1 ? 10 : birds === 2 ? 5 : 0;
        break;
      }
      case "heron":
      case "majority":
      default:
        break;
    }
    return score;
  }

  function assignGrail(players) {
    let max = -1;
    let winners = [];
    for (const player of players) {
      player.grail = false;
      const treasures = countInKingdom(player, "Carte au tresor");
      if (treasures > max) {
        max = treasures;
        winners = [player];
      } else if (treasures === max) {
        winners.push(player);
      }
    }
    if (max > 0 && winners.length === 1) winners[0].grail = true;
  }

  function rawBoardScore(player) {
    return boardCards(player).reduce((sum, card) => sum + scoreCard(player, card), 0);
  }

  function scorePlayerBoard(player) {
    return rawBoardScore(player) + (player.grail ? 10 : 0);
  }

  function previewPlacementScore(player, card, pos) {
    const preview = {
      ...player,
      grail: false,
      board: [...player.board, { x: pos.x, y: pos.y, card }],
    };
    return rawBoardScore(preview);
  }

  function placementDelta(player, card, pos) {
    return previewPlacementScore(player, card, pos) - rawBoardScore(player);
  }

  function scoreAll(players) {
    for (const player of players) player.score = scorePlayerBoard(player);
  }

  function checkImmediate(player) {
    return countFamily(player, "Oiseau") >= 4 ? "4 Oiseaux" : null;
  }

  function heronTargetCoord(bounds, targetId) {
    const target = HERON_TARGETS.find(item => item.id === targetId);
    if (!bounds || !target) return null;
    return { x: bounds.minX + target.relX, y: bounds.minY + target.relY };
  }

  function isAntiHeronCard(card) {
    return Boolean(cardDef(card).antiHeron);
  }

  function isHeronBlocked(player, cell) {
    return neighbors(player, cell.x, cell.y).some(isAntiHeronCard);
  }

  function applyHeronDestruction(game) {
    game.heronDestructions = [];
    for (const player of game.players) {
      const bounds = boardBounds(player);
      if (!bounds) continue;
      const targets = new Map();
      for (const cell of boardEntries(player)) {
        if (cardDef(cell.card).id !== "heron" || isHeronBlocked(player, cell)) continue;
        const target = heronTargetCoord(bounds, cell.card.heronTarget);
        if (!target) continue;
        const targetEntry = getBoardEntry(player, target.x, target.y);
        if (!targetEntry) continue;
        targets.set(`${target.x},${target.y}`, { target, heron: cell, card: targetEntry.card });
      }
      for (const entry of targets.values()) {
        const cell = player.board.find(item => item.x === entry.target.x && item.y === entry.target.y);
        if (!cell || cell.destroyed) continue;
        cell.destroyed = true;
        cell.destroyedBy = entry.heron.card.uid;
        game.heronDestructions.push({ player: player.name, card: cardDef(entry.card).name });
      }
    }
    if (game.heronDestructions.length) addLog(game, `${game.heronDestructions.length} carte(s) detruite(s) par les Herons.`);
  }

  function publicCard(card) {
    const def = cardDef(card);
    return {
      id: def.id,
      uid: card.uid,
      name: def.name,
      type: def.type,
      text: def.text,
      asset: cardAsset(card, def),
      copyIndex: card.copyIndex,
      heronTarget: card.heronTarget || "",
    };
  }

  function publicState(room, viewerId) {
    const game = room.game;
    const viewerIndex = game?.players.findIndex(player => player.id === viewerId) ?? -1;
    const pendingVisible = game?.pendingPlacement && game.pendingPlacement.playerId === viewerId;
    return {
      code: room.code,
      hostId: room.hostId,
      status: room.game ? "playing" : "lobby",
      players: room.players.map(player => ({
        id: player.id,
        name: player.name,
        isBot: Boolean(player.isBot),
        botProfile: player.botProfile || "",
      })),
      you: viewerId ? { id: viewerId, index: viewerIndex } : null,
      game: game ? {
        round: game.round,
        phase: game.phase,
        active: game.active,
        over: game.over,
        winnerId: game.winnerId,
        winReason: game.winReason,
        deckCount: game.deck.length,
        hiddenBy: game.hiddenBy,
        currentPickerId: currentPicker(game)?.id || null,
        pendingPlacement: game.pendingPlacement ? {
          playerId: game.pendingPlacement.playerId,
          card: pendingVisible ? publicCard(game.pendingPlacement.card) : null,
        } : null,
        offer: game.offer.map((card, index) => {
          const hidden = index === game.hiddenIndex && viewerId !== game.hiddenBy;
          return hidden ? { index, hidden: true } : { index, hidden: false, card: publicCard(card) };
        }),
        players: game.players.map(player => ({
          id: player.id,
          name: player.name,
          isBot: Boolean(player.isBot),
          botProfile: player.botProfile || "",
          index: player.index,
          score: player.score,
          grail: player.grail,
          win: player.win,
          birds: countFamily(player, "Oiseau"),
          treasures: countInKingdom(player, "Carte au tresor"),
          board: player.board.map(cell => ({
            x: cell.x,
            y: cell.y,
            destroyed: Boolean(cell.destroyed),
            card: publicCard(cell.card),
            points: cell.destroyed ? 0 : scoreCard(player, cell.card),
          })),
          legalPlacements: game.phase === "place" && game.pendingPlacement?.playerId === viewerId && player.id === viewerId ? legalPlacements(player) : [],
        })),
        log: game.log,
        heronDestructions: game.heronDestructions,
      } : null,
      cardCatalog: CARDS.map(publicCard),
      rules: {
        handSize: HAND_SIZE,
        deckTotal: deckTotal(),
        offerSizes: { two: 3, three: 3, four: 4 },
      },
    };
  }

  const api = {
    BOARD_W,
    BOARD_H,
    HAND_SIZE,
    CARDS,
    HERON_TARGETS,
    deckTotal,
    offerSizeForPlayers,
    makeGame,
    currentTurnPlayer,
    hideCard,
    takeCard,
    placeCard,
    publicState,
    legalPlacements,
    scoreCard,
    scorePlayerBoard,
    previewPlacementScore,
    placementDelta,
    scoreAll,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.EtangGame = api;
})(typeof globalThis !== "undefined" ? globalThis : window);

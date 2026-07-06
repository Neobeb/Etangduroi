const els = {
  joinView: document.querySelector("#joinView"),
  tableView: document.querySelector("#tableView"),
  joinForm: document.querySelector("#joinForm"),
  joinTitle: document.querySelector("#joinTitle"),
  joinRoom: document.querySelector("#joinRoom"),
  createRoom: document.querySelector("#createRoom"),
  playerName: document.querySelector("#playerName"),
  roomCode: document.querySelector("#roomCode"),
  roomHint: document.querySelector("#roomHint"),
  joinError: document.querySelector("#joinError"),
  roomPill: document.querySelector("#roomPill"),
  roomTitle: document.querySelector("#roomTitle"),
  playersLine: document.querySelector("#playersLine"),
  copyLink: document.querySelector("#copyLink"),
  leaveRoom: document.querySelector("#leaveRoom"),
  botProfile: document.querySelector("#botProfile"),
  addBot: document.querySelector("#addBot"),
  startGame: document.querySelector("#startGame"),
  phaseLine: document.querySelector("#phaseLine"),
  offer: document.querySelector("#offer"),
  pending: document.querySelector("#pending"),
  log: document.querySelector("#log"),
  boards: document.querySelector("#boards"),
  cardTemplate: document.querySelector("#cardTemplate"),
};

const app = {
  state: null,
  playerId: localStorage.getItem("etang.playerId") || "",
  roomCode: localStorage.getItem("etang.roomCode") || "",
  events: null,
};

const HERON_ASSETS = {
  topLeft: "heron_top_left.png",
  topRight: "heron_top_right.png",
  bottomLeft: "heron_bottom_left.png",
};

const params = new URLSearchParams(location.search);
if (params.get("room")) app.roomCode = params.get("room").toUpperCase();
els.roomCode.value = app.roomCode;
els.playerName.value = localStorage.getItem("etang.name") || "";
updateEntryUi();

if (app.roomCode && app.playerId) loadState(app.roomCode, app.playerId);

els.joinForm.addEventListener("submit", event => {
  event.preventDefault();
  joinRoom();
});

els.roomCode.addEventListener("input", () => {
  els.roomCode.value = normalizeRoomCode(els.roomCode.value);
  app.roomCode = els.roomCode.value;
  updateEntryUi();
});

els.playerName.addEventListener("input", () => {
  if (els.playerName.value.trim()) clearError();
});

els.createRoom.addEventListener("click", () => createRoom());
els.startGame.addEventListener("click", () => startGame());
els.copyLink.addEventListener("click", () => copyLink());
els.leaveRoom.addEventListener("click", () => returnToEntry());
els.addBot.addEventListener("click", () => addBot());

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error || "Erreur serveur.");
  return payload;
}

async function createRoom() {
  clearError();
  setEntryBusy(true);
  try {
    const name = cleanName();
    const payload = await request("/api/rooms", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    enterRoom(payload.state, payload.playerId, name);
  } catch (error) {
    showError(error);
  } finally {
    setEntryBusy(false);
  }
}

async function joinRoom() {
  clearError();
  setEntryBusy(true);
  try {
    const name = cleanName();
    const code = normalizeRoomCode(els.roomCode.value);
    if (!code) throw new Error("Code partie manquant.");
    const knownPlayerId = localStorage.getItem(seatKey(code, name));
    if (knownPlayerId) {
      try {
        const payload = await request(`/api/rooms/${encodeURIComponent(code)}?playerId=${encodeURIComponent(knownPlayerId)}`);
        enterRoom(payload.state, knownPlayerId, name);
        return;
      } catch {
        localStorage.removeItem(seatKey(code, name));
      }
    }
    const payload = await request(`/api/rooms/${encodeURIComponent(code)}/join`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    enterRoom(payload.state, payload.playerId, name);
  } catch (error) {
    showError(error);
  } finally {
    setEntryBusy(false);
  }
}

async function loadState(code, playerId) {
  try {
    const payload = await request(`/api/rooms/${encodeURIComponent(code)}?playerId=${encodeURIComponent(playerId)}`);
    enterRoom(payload.state, playerId, localStorage.getItem("etang.name") || "");
  } catch {
    localStorage.removeItem("etang.playerId");
    app.playerId = "";
    updateEntryUi();
  }
}

function enterRoom(state, playerId, name) {
  app.state = state;
  app.playerId = playerId;
  app.roomCode = state.code;
  els.roomCode.value = state.code;
  localStorage.setItem("etang.playerId", playerId);
  localStorage.setItem("etang.roomCode", state.code);
  if (name) localStorage.setItem("etang.name", name);
  if (name) localStorage.setItem(seatKey(state.code, name), playerId);
  history.replaceState(null, "", `?room=${state.code}`);
  connectEvents();
  render();
}

function connectEvents() {
  if (app.events) app.events.close();
  app.events = new EventSource(`/api/rooms/${encodeURIComponent(app.roomCode)}/events?playerId=${encodeURIComponent(app.playerId)}`);
  app.events.addEventListener("state", event => {
    app.state = JSON.parse(event.data);
    render();
  });
  app.events.onerror = () => {
    els.roomPill.textContent = `${app.roomCode} - reconnexion`;
  };
}

async function startGame() {
  try {
    const payload = await request(`/api/rooms/${app.roomCode}/start`, {
      method: "POST",
      body: JSON.stringify({ playerId: app.playerId }),
    });
    app.state = payload.state;
    render();
  } catch (error) {
    alert(error.message);
  } finally {
    if (app.state) renderPlayers(app.state);
  }
}

async function addBot() {
  try {
    els.addBot.disabled = true;
    const payload = await request(`/api/rooms/${app.roomCode}/bots`, {
      method: "POST",
      body: JSON.stringify({ playerId: app.playerId, profile: els.botProfile.value }),
    });
    app.state = payload.state;
    render();
  } catch (error) {
    alert(error.message);
  } finally {
    if (app.state) renderPlayers(app.state);
  }
}

async function action(type, data = {}) {
  try {
    const payload = await request(`/api/rooms/${app.roomCode}/action`, {
      method: "POST",
      body: JSON.stringify({ playerId: app.playerId, type, ...data }),
    });
    app.state = payload.state;
    render();
  } catch (error) {
    alert(error.message);
  }
}

function cleanName() {
  const name = els.playerName.value.trim();
  if (!name) throw new Error("Nom manquant.");
  return name.slice(0, 24);
}

function normalizeRoomCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
}

function seatKey(code, name) {
  return `etang.seat.${normalizeRoomCode(code)}.${String(name || "").trim().toLowerCase()}`;
}

function updateEntryUi() {
  const code = normalizeRoomCode(els.roomCode.value || app.roomCode);
  els.roomCode.value = code;
  if (code) {
    els.joinTitle.textContent = "Rejoindre la partie";
    els.roomHint.textContent = `Code ${code}`;
    els.joinRoom.textContent = `Entrer dans ${code}`;
    els.roomPill.textContent = `Salon ${code}`;
  } else {
    els.joinTitle.textContent = "Entrer a table";
    els.roomHint.textContent = "";
    els.joinRoom.textContent = "Rejoindre";
    els.roomPill.textContent = "Hors salon";
  }
}

function setEntryBusy(isBusy) {
  els.joinRoom.disabled = isBusy;
  els.createRoom.disabled = isBusy;
}

function returnToEntry() {
  if (app.events) app.events.close();
  app.events = null;
  const code = app.roomCode;
  app.state = null;
  app.playerId = "";
  localStorage.removeItem("etang.playerId");
  if (code) {
    localStorage.setItem("etang.roomCode", code);
    app.roomCode = code;
    els.roomCode.value = code;
    history.replaceState(null, "", `?room=${code}`);
  }
  els.tableView.classList.add("hidden");
  els.joinView.classList.remove("hidden");
  updateEntryUi();
}

function showError(error) {
  els.joinError.textContent = error.message || "Erreur.";
}

function clearError() {
  els.joinError.textContent = "";
}

async function copyLink() {
  const link = `${location.origin}${location.pathname}?room=${app.roomCode}`;
  try {
    await navigator.clipboard.writeText(link);
    els.copyLink.textContent = "Copie";
    setTimeout(() => { els.copyLink.textContent = "Copier le lien"; }, 1200);
  } catch {
    prompt("Lien du salon", link);
  }
}

function render() {
  const state = app.state;
  if (!state) return;
  els.joinView.classList.add("hidden");
  els.tableView.classList.remove("hidden");
  els.roomPill.textContent = `Salon ${state.code}`;
  els.roomTitle.textContent = `Salon ${state.code}`;
  renderPlayers(state);
  renderFocus(state);
  renderBoards(state);
  renderLog(state);
}

function renderPlayers(state) {
  els.playersLine.innerHTML = state.players.map(player => `
    <span class="player-chip ${player.id === app.playerId ? "me" : ""} ${player.isBot ? "bot" : ""}">
      ${escapeHtml(player.name)}${player.isBot ? '<span class="bot-tag">IA</span>' : ""}
    </span>
  `).join("");
  els.startGame.disabled = state.hostId !== app.playerId || Boolean(state.game) || state.players.length < 2;
  const canAddBot = state.hostId === app.playerId && !state.game && state.players.length < 4;
  els.addBot.disabled = !canAddBot;
  els.botProfile.disabled = !canAddBot;
}

function renderFocus(state) {
  const game = state.game;
  els.offer.innerHTML = "";
  els.pending.innerHTML = "";
  if (!game) {
    els.phaseLine.textContent = "En attente des joueurs";
    return;
  }
  if (game.over) {
    const winner = game.players.find(player => player.id === game.winnerId);
    els.phaseLine.innerHTML = `<div class="done-banner">${escapeHtml(winner?.name || "Victoire")} - ${escapeHtml(game.winReason || "score")}</div>`;
    return;
  }
  const active = game.players[game.active];
  const picker = game.players.find(player => player.id === game.currentPickerId);
  if (game.phase === "hide") {
    els.phaseLine.textContent = active.id === app.playerId ? "Choisissez la carte cachee" : `${active.name} prepare l'offre`;
    renderOffer(game.offer, active.id === app.playerId ? "Cacher" : "", index => action("hide", { index }));
    return;
  }
  if (game.phase === "pick") {
    els.phaseLine.textContent = picker?.id === app.playerId ? "A vous de choisir" : `${picker?.name || "Un joueur"} choisit`;
    renderOffer(game.offer, picker?.id === app.playerId ? "Prendre" : "", index => action("take", { index }));
    return;
  }
  if (game.phase === "place") {
    const owner = game.players.find(player => player.id === game.pendingPlacement?.playerId);
    els.phaseLine.textContent = owner?.id === app.playerId ? "Posez la carte" : `${owner?.name || "Un joueur"} pose sa carte`;
    if (game.pendingPlacement?.card) {
      const tile = cardTile(game.pendingPlacement.card, "");
      els.pending.append(tile);
    }
  }
}

function renderOffer(offer, label, handler) {
  els.offer.innerHTML = "";
  for (const item of offer) {
    if (item.hidden) {
      const tile = document.createElement("article");
      tile.className = "card-tile hidden-card";
      tile.innerHTML = `<strong>Carte cachee</strong>`;
      if (label) {
        const button = document.createElement("button");
        button.textContent = label;
        button.addEventListener("click", () => handler(item.index));
        tile.append(button);
      }
      els.offer.append(tile);
      continue;
    }
    els.offer.append(cardTile(item.card, label, () => handler(item.index)));
  }
}

function cardTile(card, actionLabel, onAction) {
  const fragment = els.cardTemplate.content.cloneNode(true);
  const tile = fragment.querySelector(".card-tile");
  const img = fragment.querySelector(".card-image");
  img.src = `assets/cards/${cardAsset(card)}`;
  img.alt = card.name;
  fragment.querySelector(".card-name").textContent = card.name;
  fragment.querySelector(".card-type").textContent = card.type;
  fragment.querySelector(".card-text").textContent = card.text || "";
  const button = fragment.querySelector(".card-action");
  if (actionLabel) {
    button.textContent = actionLabel;
    button.addEventListener("click", onAction);
  } else {
    button.remove();
  }
  return tile;
}

function renderBoards(state) {
  const game = state.game;
  if (!game) {
    els.boards.innerHTML = "";
    return;
  }
  els.boards.innerHTML = game.players.map(player => boardHtml(player, game.phase)).join("");
  els.boards.querySelectorAll("button[data-place]").forEach(button => {
    button.addEventListener("click", () => {
      const [x, y] = button.dataset.place.split(",").map(Number);
      action("place", { x, y });
    });
  });
}

function boardHtml(player) {
  const cells = player.board.map(cell => ({ x: cell.x, y: cell.y }));
  for (const pos of player.legalPlacements || []) cells.push(pos);
  const bounds = boundsFor(cells) || { minX: 0, minY: 0, maxX: 3, maxY: 2 };
  const width = Math.max(4, bounds.maxX - bounds.minX + 1);
  const height = Math.max(3, bounds.maxY - bounds.minY + 1);
  const legal = new Set((player.legalPlacements || []).map(pos => `${pos.x},${pos.y}`));
  const board = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const realX = bounds.minX + x;
      const realY = bounds.minY + y;
      const cell = player.board.find(item => item.x === realX && item.y === realY);
      const key = `${realX},${realY}`;
      if (cell) board.push(cardCell(cell));
      else if (legal.has(key)) board.push(`<div class="cell"><button data-place="${key}">Poser</button></div>`);
      else board.push(`<div class="cell"></div>`);
    }
  }
  return `
    <article class="board-panel">
      <div class="board-head">
        <div>
          <strong>${escapeHtml(player.name)}</strong>
          <div class="board-stats">Oiseaux ${player.birds} - Tresors ${player.treasures}${player.grail ? " - Graal" : ""}</div>
        </div>
        <span class="score-pill">${player.score} PV</span>
      </div>
      <div class="board" style="grid-template-columns: repeat(${width}, minmax(0, 1fr));">${board.join("")}</div>
    </article>
  `;
}

function cardCell(cell) {
  return `
    <div class="cell filled ${cell.destroyed ? "destroyed" : ""}">
      <div class="cell-card">
        <img src="assets/cards/${cardAsset(cell.card)}" alt="">
        <div>
          <div class="cell-name">${escapeHtml(cell.card.name)}</div>
          <div class="cell-points">${cell.points} PV</div>
        </div>
      </div>
    </div>
  `;
}

function boundsFor(cells) {
  if (!cells.length) return null;
  return {
    minX: Math.min(...cells.map(cell => cell.x)),
    maxX: Math.max(...cells.map(cell => cell.x)),
    minY: Math.min(...cells.map(cell => cell.y)),
    maxY: Math.max(...cells.map(cell => cell.y)),
  };
}

function renderLog(state) {
  const log = state.game?.log || [];
  els.log.innerHTML = log.map(line => `<div class="log-entry">${escapeHtml(line)}</div>`).join("");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function cardAsset(card) {
  if (card?.id === "heron") return HERON_ASSETS[card.heronTarget] || card.asset;
  return card.asset;
}

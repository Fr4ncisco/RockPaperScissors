const path = require('path');
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const MOVES = ['piedra', 'papel', 'tijera'];

// piedra > tijera, tijera > papel, papel > piedra
const BEATS = { piedra: 'tijera', tijera: 'papel', papel: 'piedra' };

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const httpServer = createServer(app);
const io = new Server(httpServer);

/** @type {Map<string, Room>} */
const rooms = new Map();

function makeRoomCode() {
  let code;
  do {
    code = Math.random().toString(36).slice(2, 6).toUpperCase();
  } while (rooms.has(code));
  return code;
}

function createRoom(code) {
  const room = {
    code,
    players: new Map(), // socketId -> { name, eliminated, ready, move, lastMove, connected }
    wins: new Map(), // socketId -> victorias acumuladas en la sala
    round: 1,
    status: 'lobby', // lobby | playing | finished
    log: [],
  };
  rooms.set(code, room);
  return room;
}

function publicState(room) {
  return {
    code: room.code,
    status: room.status,
    round: room.round,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    log: room.log.slice(-8),
    players: [...room.players.entries()].map(([id, p]) => ({
      id,
      name: p.name,
      eliminated: p.eliminated,
      ready: p.ready,
      hasMoved: room.status === 'playing' && !p.eliminated ? p.move !== null : false,
      lastMove: p.lastMove || null,
      wins: room.wins.get(id) || 0,
      connected: p.connected,
    })),
  };
}

function maybeStartGame(room) {
  if (room.status !== 'lobby') return;
  if (room.players.size < MIN_PLAYERS) return;
  const allReady = [...room.players.values()].every((p) => p.ready);
  if (!allReady) return;
  room.status = 'playing';
  room.round = 1;
  room.log = [];
  for (const p of room.players.values()) {
    p.eliminated = false;
    p.move = null;
    p.lastMove = null;
    p.ready = false;
  }
}

function broadcastState(room) {
  io.to(room.code).emit('state', publicState(room));
}

function activePlayers(room) {
  return [...room.players.entries()].filter(([, p]) => !p.eliminated && p.connected);
}

function resetMoves(room) {
  for (const p of room.players.values()) {
    if (p.move !== null) p.lastMove = p.move;
    p.move = null;
  }
}

function tryResolveRound(room) {
  const active = activePlayers(room);
  if (active.length === 0) return;
  const allMoved = active.every(([, p]) => p.move !== null);
  if (!allMoved) return;

  const movesChosen = new Set(active.map(([, p]) => p.move));
  const roundMoves = active.map(([id, p]) => ({ id, name: p.name, move: p.move }));

  if (movesChosen.size === 1 || movesChosen.size === 3) {
    room.log.push({
      round: room.round,
      moves: roundMoves,
      result: 'empate',
    });
    resetMoves(room);
    room.round += 1;
    broadcastState(room);
    io.to(room.code).emit('round-result', {
      round: room.round - 1,
      moves: roundMoves,
      result: 'empate',
      eliminated: [],
    });
    return;
  }

  // Exactly two distinct moves: figure out which move wins.
  const [moveA, moveB] = [...movesChosen];
  const winningMove = BEATS[moveA] === moveB ? moveA : moveB;
  const eliminated = [];
  for (const [id, p] of active) {
    if (p.move !== winningMove) {
      p.eliminated = true;
      eliminated.push({ id, name: p.name, move: p.move });
    }
  }

  resetMoves(room);
  room.log.push({
    round: room.round,
    moves: roundMoves,
    result: `gana ${winningMove}`,
  });

  const survivors = activePlayers(room);
  if (survivors.length <= 1) {
    room.status = 'finished';
    const winner = survivors[0];
    if (winner) {
      const [winnerId] = winner;
      room.wins.set(winnerId, (room.wins.get(winnerId) || 0) + 1);
    }
    io.to(room.code).emit('round-result', {
      round: room.round,
      moves: roundMoves,
      result: `gana ${winningMove}`,
      eliminated,
    });
    io.to(room.code).emit('game-over', {
      winner: winner ? { id: winner[0], name: winner[1].name } : null,
    });
    broadcastState(room);
    return;
  }

  room.round += 1;
  io.to(room.code).emit('round-result', {
    round: room.round - 1,
    moves: roundMoves,
    result: `gana ${winningMove}`,
    eliminated,
  });
  broadcastState(room);
}

io.on('connection', (socket) => {
  let currentRoomCode = null;

  socket.on('create-room', ({ name }, cb) => {
    const code = makeRoomCode();
    const room = createRoom(code);
    joinRoom(room, socket, name, cb);
  });

  socket.on('join-room', ({ name, code }, cb) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room) return cb?.({ error: 'Esa sala no existe.' });
    if (room.status === 'playing') return cb?.({ error: 'La partida ya comenzó.' });
    if (room.players.size >= MAX_PLAYERS) return cb?.({ error: 'La sala está llena (máx. 6).' });
    joinRoom(room, socket, name, cb);
  });

  function joinRoom(room, socket, name, cb) {
    currentRoomCode = room.code;
    socket.join(room.code);
    room.players.set(socket.id, {
      name: (name || 'Jugador').slice(0, 20),
      eliminated: false,
      ready: false,
      move: null,
      lastMove: null,
      connected: true,
    });
    // La composición de la sala cambió: todos vuelven a confirmar que están listos.
    for (const p of room.players.values()) p.ready = false;
    cb?.({ ok: true, code: room.code, playerId: socket.id });
    broadcastState(room);
  }

  socket.on('toggle-ready', () => {
    const room = rooms.get(currentRoomCode);
    if (!room) return;
    if (room.status !== 'lobby') return;
    const player = room.players.get(socket.id);
    if (!player) return;
    player.ready = !player.ready;
    maybeStartGame(room);
    broadcastState(room);
  });

  socket.on('leave-room', (cb) => {
    const room = rooms.get(currentRoomCode);
    if (room) removePlayerFromRoom(room, socket, { intentional: true });
    currentRoomCode = null;
    cb?.({ ok: true });
  });

  socket.on('play-move', ({ move }) => {
    const room = rooms.get(currentRoomCode);
    if (!room || room.status !== 'playing') return;
    if (!MOVES.includes(move)) return;
    const player = room.players.get(socket.id);
    if (!player || player.eliminated) return;
    player.move = move;
    broadcastState(room);
    tryResolveRound(room);
  });

  socket.on('play-again', () => {
    const room = rooms.get(currentRoomCode);
    if (!room) return;
    room.status = 'lobby';
    room.round = 1;
    room.log = [];
    for (const p of room.players.values()) {
      p.eliminated = false;
      p.ready = false;
      p.move = null;
      p.lastMove = null;
    }
    broadcastState(room);
  });

  socket.on('disconnect', () => {
    const room = rooms.get(currentRoomCode);
    if (room) removePlayerFromRoom(room, socket, { intentional: false });
    currentRoomCode = null;
  });
});

function removePlayerFromRoom(room, socket, { intentional }) {
  const player = room.players.get(socket.id);
  if (!player) return;
  socket.leave(room.code);

  if (room.status === 'lobby' || intentional) {
    room.players.delete(socket.id);
  } else {
    player.connected = false;
  }

  if (room.players.size === 0 || [...room.players.values()].every((p) => !p.connected)) {
    rooms.delete(room.code);
    return;
  }

  if (room.status === 'lobby') maybeStartGame(room);
  if (room.status === 'playing') tryResolveRound(room);
  broadcastState(room);
}

httpServer.listen(PORT, () => {
  console.log(`Cachipún online escuchando en el puerto ${PORT}`);
});

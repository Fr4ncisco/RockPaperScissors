const socket = io();

const MOVE_EMOJI = { piedra: '✊', papel: '✋', tijera: '✌️' };

const screenHome = document.getElementById('screen-home');
const screenRoom = document.getElementById('screen-room');

const inputName = document.getElementById('input-name');
const inputCode = document.getElementById('input-code');
const btnCreate = document.getElementById('btn-create');
const btnJoin = document.getElementById('btn-join');
const homeError = document.getElementById('home-error');

const roomCodeEl = document.getElementById('room-code');
const btnCopy = document.getElementById('btn-copy');
const btnLeave = document.getElementById('btn-leave');

const lobbyInfo = document.getElementById('lobby-info');
const playersCount = document.getElementById('players-count');
const playerList = document.getElementById('player-list');
const btnReady = document.getElementById('btn-ready');

const gameInfo = document.getElementById('game-info');
const roundLabel = document.getElementById('round-label');
const playerListGame = document.getElementById('player-list-game');
const moveButtons = document.getElementById('move-buttons');
const myMoveStatus = document.getElementById('my-move-status');
const lastResult = document.getElementById('last-result');

const finishedInfo = document.getElementById('finished-info');
const winnerLabel = document.getElementById('winner-label');
const btnPlayAgain = document.getElementById('btn-play-again');

let myId = null;
let myMove = null;

function nameFromStorage() {
  return localStorage.getItem('cachipun-name') || '';
}

inputName.value = nameFromStorage();

function showError(msg) {
  homeError.textContent = msg || '';
}

btnCreate.addEventListener('click', () => {
  const name = inputName.value.trim() || 'Jugador';
  localStorage.setItem('cachipun-name', name);
  socket.emit('create-room', { name }, (res) => {
    if (res?.error) return showError(res.error);
    myId = res.playerId;
    enterRoom(res.code);
  });
});

btnJoin.addEventListener('click', () => {
  const name = inputName.value.trim() || 'Jugador';
  const code = inputCode.value.trim().toUpperCase();
  if (!code) return showError('Ingresa un código de sala.');
  localStorage.setItem('cachipun-name', name);
  socket.emit('join-room', { name, code }, (res) => {
    if (res?.error) return showError(res.error);
    myId = res.playerId;
    enterRoom(res.code);
  });
});

function enterRoom(code) {
  showError('');
  screenHome.classList.add('hidden');
  screenRoom.classList.remove('hidden');
  roomCodeEl.textContent = code;
  const url = new URL(window.location.href);
  url.searchParams.set('sala', code);
  window.history.replaceState({}, '', url);
}

function goHome() {
  screenRoom.classList.add('hidden');
  screenHome.classList.remove('hidden');
  [...moveButtons.children].forEach((b) => {
    b.classList.remove('selected');
    b.disabled = false;
  });
  const url = new URL(window.location.href);
  url.searchParams.delete('sala');
  window.history.replaceState({}, '', url);
  myId = null;
  myMove = null;
}

btnCopy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    btnCopy.textContent = '¡Copiado!';
    setTimeout(() => (btnCopy.textContent = 'Copiar enlace'), 1500);
  } catch {
    // clipboard not available, ignore silently
  }
});

btnLeave.addEventListener('click', () => {
  socket.emit('leave-room', () => goHome());
});

socket.on('kicked', ({ reason }) => {
  goHome();
  showError(reason || 'Fuiste expulsado de la sala.');
});

btnReady.addEventListener('click', () => socket.emit('toggle-ready'));
btnPlayAgain.addEventListener('click', () => socket.emit('play-again'));

moveButtons.addEventListener('click', (e) => {
  const btn = e.target.closest('.move-btn');
  if (!btn || btn.disabled) return;
  myMove = btn.dataset.move;
  [...moveButtons.children].forEach((b) => b.classList.toggle('selected', b === btn));
  socket.emit('play-move', { move: myMove });
});

function withLeaderFlag(players) {
  const maxWins = Math.max(0, ...players.map((p) => p.wins));
  return players.map((p) => ({ ...p, isLeader: maxWins > 0 && p.wins === maxWins }));
}

function buildScoreGroup(p) {
  const left = document.createElement('span');
  left.className = 'player-left';

  const scoreSpan = document.createElement('span');
  scoreSpan.className = 'score';
  scoreSpan.textContent = (p.isLeader ? '🏆 ' : '') + p.wins;
  left.appendChild(scoreSpan);

  const nameSpan = document.createElement('span');
  nameSpan.className = 'name';
  nameSpan.textContent = p.name + (p.id === myId ? ' (tú)' : '');
  left.appendChild(nameSpan);

  return left;
}

socket.on('state', (state) => {
  const players = withLeaderFlag(state.players);
  const isLobby = state.status === 'lobby';
  const isPlaying = state.status === 'playing';
  const isFinished = state.status === 'finished';

  lobbyInfo.classList.toggle('hidden', !isLobby);
  gameInfo.classList.toggle('hidden', !isPlaying);
  finishedInfo.classList.toggle('hidden', !isFinished);

  if (isLobby) {
    playersCount.textContent = `${players.length} / ${state.maxPlayers} jugadores`;
    playerList.innerHTML = '';
    players.forEach((p) => {
      const li = document.createElement('li');
      li.classList.toggle('leader', p.isLeader);
      li.appendChild(buildScoreGroup(p));
      const tag = document.createElement('span');
      tag.className = 'tag' + (p.ready ? ' ready' : '');
      tag.textContent = p.ready ? 'Listo' : 'Esperando';
      li.appendChild(tag);
      playerList.appendChild(li);
    });
    const me = players.find((p) => p.id === myId);
    btnReady.disabled = players.length < state.minPlayers;
    btnReady.classList.toggle('selected', !!me?.ready);
    btnReady.textContent = me?.ready ? 'Cancelar' : 'Estoy listo';
    myMove = null;
  }

  if (isPlaying) {
    roundLabel.textContent = `Ronda ${state.round}`;
    playerListGame.innerHTML = '';
    players.forEach((p) => {
      const li = document.createElement('li');
      li.classList.toggle('eliminated', p.eliminated);
      li.classList.toggle('leader', p.isLeader);
      li.appendChild(buildScoreGroup(p));
      if (!p.eliminated) {
        const tag = document.createElement('span');
        if (p.id === myId && myMove) {
          tag.className = 'tag lastmove';
          tag.textContent = MOVE_EMOJI[myMove];
          tag.title = 'Tu jugada de esta ronda';
        } else if (p.hasMoved) {
          tag.className = 'tag ready';
          tag.textContent = 'Listo';
        } else if (p.lastMove) {
          tag.className = 'tag lastmove';
          tag.textContent = MOVE_EMOJI[p.lastMove];
          tag.title = 'Su jugada de la ronda anterior';
        } else {
          tag.className = 'tag';
          tag.textContent = 'Pensando…';
        }
        li.appendChild(tag);
      }
      playerListGame.appendChild(li);
    });

    const me = players.find((p) => p.id === myId);
    const iAmEliminated = me?.eliminated;
    [...moveButtons.children].forEach((b) => (b.disabled = iAmEliminated || me?.hasMoved));
    if (iAmEliminated) {
      myMoveStatus.textContent = 'Fuiste eliminado. Puedes seguir viendo la partida.';
    } else if (me?.hasMoved) {
      myMoveStatus.textContent = 'Jugada enviada, esperando al resto…';
    } else {
      myMoveStatus.textContent = 'Elige tu jugada. Tienes 5 segundos.';
    }
  }

  if (isFinished) {
    // handled by game-over event for the winner name; keep board static here.
  }
});

socket.on('round-result', (data) => {
  const parts = data.moves.map((m) => `${m.name}: ${MOVE_EMOJI[m.move]}`);
  let text = `Ronda ${data.round} — ${parts.join(' · ')} — ${data.result}.`;
  if (data.eliminated.length) {
    text += ` Eliminados: ${data.eliminated.map((e) => e.name).join(', ')}.`;
  }
  lastResult.textContent = text;
  myMove = null;
  [...moveButtons.children].forEach((b) => b.classList.remove('selected'));
});

socket.on('game-over', ({ winner }) => {
  winnerLabel.textContent = winner ? `🏆 ¡${winner.name} gana la partida!` : 'La partida terminó sin ganador.';
});

// Auto-fill room code from URL (?sala=XXXX) for shared invite links.
const params = new URLSearchParams(window.location.search);
const sharedCode = params.get('sala');
if (sharedCode) inputCode.value = sharedCode.toUpperCase();

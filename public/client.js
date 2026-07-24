const socket = io();

const MOVE_EMOJI = { piedra: '🪨', papel: '📄', tijera: '✂️' };

const screenHome = document.getElementById('screen-home');
const screenRoom = document.getElementById('screen-room');

const inputName = document.getElementById('input-name');
const inputCode = document.getElementById('input-code');
const btnCreate = document.getElementById('btn-create');
const btnJoin = document.getElementById('btn-join');
const homeError = document.getElementById('home-error');

const roomCodeEl = document.getElementById('room-code');
const btnCopy = document.getElementById('btn-copy');

const lobbyInfo = document.getElementById('lobby-info');
const playersCount = document.getElementById('players-count');
const playerList = document.getElementById('player-list');
const btnStart = document.getElementById('btn-start');

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

btnCopy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    btnCopy.textContent = '¡Copiado!';
    setTimeout(() => (btnCopy.textContent = 'Copiar enlace'), 1500);
  } catch {
    // clipboard not available, ignore silently
  }
});

btnStart.addEventListener('click', () => socket.emit('start-game'));
btnPlayAgain.addEventListener('click', () => socket.emit('play-again'));

moveButtons.addEventListener('click', (e) => {
  const btn = e.target.closest('.move-btn');
  if (!btn || btn.disabled) return;
  myMove = btn.dataset.move;
  [...moveButtons.children].forEach((b) => b.classList.toggle('selected', b === btn));
  socket.emit('play-move', { move: myMove });
});

socket.on('state', (state) => {
  const isLobby = state.status === 'lobby';
  const isPlaying = state.status === 'playing';
  const isFinished = state.status === 'finished';

  lobbyInfo.classList.toggle('hidden', !isLobby);
  gameInfo.classList.toggle('hidden', !isPlaying);
  finishedInfo.classList.toggle('hidden', !isFinished);

  if (isLobby) {
    playersCount.textContent = `${state.players.length} / ${state.maxPlayers} jugadores`;
    playerList.innerHTML = '';
    state.players.forEach((p) => {
      const li = document.createElement('li');
      li.textContent = p.name + (p.id === myId ? ' (tú)' : '');
      playerList.appendChild(li);
    });
    btnStart.disabled = state.players.length < state.minPlayers;
    myMove = null;
  }

  if (isPlaying) {
    roundLabel.textContent = `Ronda ${state.round}`;
    playerListGame.innerHTML = '';
    state.players.forEach((p) => {
      const li = document.createElement('li');
      li.classList.toggle('eliminated', p.eliminated);
      const nameSpan = document.createElement('span');
      nameSpan.textContent = p.name + (p.id === myId ? ' (tú)' : '');
      li.appendChild(nameSpan);
      if (!p.eliminated) {
        const tag = document.createElement('span');
        tag.className = 'tag' + (p.hasMoved ? ' ready' : '');
        tag.textContent = p.hasMoved ? 'Listo' : 'Pensando…';
        li.appendChild(tag);
      }
      playerListGame.appendChild(li);
    });

    const me = state.players.find((p) => p.id === myId);
    const iAmEliminated = me?.eliminated;
    [...moveButtons.children].forEach((b) => (b.disabled = iAmEliminated || me?.hasMoved));
    if (iAmEliminated) {
      myMoveStatus.textContent = 'Fuiste eliminado. Puedes seguir viendo la partida.';
    } else if (me?.hasMoved) {
      myMoveStatus.textContent = 'Jugada enviada, esperando al resto…';
    } else {
      myMoveStatus.textContent = 'Elige tu jugada.';
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

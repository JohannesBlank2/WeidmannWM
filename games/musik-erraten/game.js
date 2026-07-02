'use strict';

const TARGET_SCORE = 5;
const SONGS = [
  {
    title: 'Skandal im Sperrbezirk',
    spotifyUrl: 'https://open.spotify.com/track/3CrDI3SXsq0sGzNDL8gQw6',
    coverImageUrl: 'https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e029c884c1f2cdd0988fafaa53a',
  },
  {
    title: "Gangsta's Paradise",
    spotifyUrl: 'https://open.spotify.com/track/1DIXPcTDzTj8ZMHt3PDt8p',
    coverImageUrl: 'https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e027438996f6fe67c59d75d4e43',
  },
  {
    title: 'The Fate of Ophelia',
    spotifyUrl: 'https://open.spotify.com/track/53iuhJlwXhSER5J2IYYv1W',
    coverImageUrl: 'https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02d7812467811a7da6e6a44902',
  },
  {
    title: 'The Code',
    spotifyUrl: 'https://open.spotify.com/track/1EjIXKhNHI00ZLMRpS8iz8',
    coverImageUrl: 'https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e028b736cc468fee080a0e8dad0',
  },
  {
    title: '99 Luftballons',
    spotifyUrl: 'https://open.spotify.com/track/4ZhPLoMzZwewHLLjV1J15c',
    coverImageUrl: 'https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e027e51ffd6a2e8f77ffd56bb8f',
  },
  {
    title: 'Tau mich auf',
    spotifyUrl: 'https://open.spotify.com/track/5M5CCI3zRRnVpMzNiwrGaJ',
    coverImageUrl: 'https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e02dda9143dc6f5794eb40704d1',
  },
  {
    title: 'Lose Yourself',
    spotifyUrl: 'https://open.spotify.com/track/7MJQ9Nfxzh8LPZ9e9u68Fq',
    coverImageUrl: 'https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e02b6ef2ebd34efb08cb76f6eec',
  },
  {
    title: 'Poker Face',
    spotifyUrl: 'https://open.spotify.com/track/1QV6tiMFM6fSOKOGLMHYYg',
    coverImageUrl: 'https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02613aaa3ae566d9f36008aed0',
  },
  {
    title: 'Umbrella',
    spotifyUrl: 'https://open.spotify.com/track/49FYlytm3dAAraYgpoJZux',
    coverImageUrl: 'https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02f9f27162ab1ed45b8d7a7e98',
  },
  {
    title: 'Einmal um die Welt',
    spotifyUrl: 'https://open.spotify.com/track/6gQAyT7B7cYGTRBOiFdQUS',
    coverImageUrl: 'https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e02435e1248d84f52709c56654b',
  },
  {
    title: 'Unwritten',
    spotifyUrl: 'https://open.spotify.com/track/3U5JVgI2x4rDyHGObzJfNf',
    coverImageUrl: 'https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e02b337e1ca6629a53c66a3b0d4',
  },
  {
    title: 'Lemon Tree',
    spotifyUrl: 'https://open.spotify.com/track/1yN2z5XVtaAOYGdeEqEuqd',
    coverImageUrl: 'https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e0277a50cb765eef114e8ce488c',
  },
  {
    title: 'Beauty and the Beast',
    spotifyUrl: 'https://open.spotify.com/track/7wMPhUSe6CZga1vOMpLTJP',
    coverImageUrl: 'https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e02c19927fe015cd4357ee45c95',
  },
  {
    title: 'Major Tom',
    spotifyUrl: 'https://open.spotify.com/track/6oVrUqf9JNY9esOOhzGtNk',
    coverImageUrl: 'https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e02e0c0f8d0671a11be87319f5a',
  },
  {
    title: 'Erfolg ist kein Glück',
    spotifyUrl: 'https://open.spotify.com/track/1F97y3AVyeTm1RRFovA0k6',
    coverImageUrl: 'https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e0214086a38996232891d407bb0',
  },
  {
    title: 'Schüsse in die Luft',
    spotifyUrl: 'https://open.spotify.com/track/0ZtOSLwLq2dm8u5HscsCZu',
    coverImageUrl: 'https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e0295feac370520bcd71e4b9d8a',
  },
  {
    title: 'Toxic',
    spotifyUrl: 'https://open.spotify.com/track/6I9VzXrHxO9rA9A5euc8Ak',
    coverImageUrl: 'https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e02efc6988972cb04105f002cd4',
  },
  {
    title: 'Dai Dai',
    spotifyUrl: 'https://open.spotify.com/track/0kosUz0jePvjiz4ctmR6wL',
    coverImageUrl: 'https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e0203cadf1b3fe324c1dc710ed4',
  },
  {
    title: 'Bangarang',
    spotifyUrl: 'https://open.spotify.com/track/6VRhkROS2SZHGlp0pxndbJ',
    coverImageUrl: 'https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e026081278cb62df2757d55633b',
  },
  {
    title: 'Stressed Out',
    spotifyUrl: 'https://open.spotify.com/track/3CRDbSIZ4r5MsZ0YwxuEkn',
    coverImageUrl: 'https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e02ae1f56dbc14d331f5ed454a5',
  },
];

module.exports = {
  id: 'musik-erraten',
  mode: 'single',
  category: 'quiz',
  title: 'Shazam',
  responsiblePerson: 'Admin',
  description: 'Extern abgespielte Songs werden per Buzzer erraten. Die App zeigt Status, Buzzer-Reihenfolge, Songtitel und Punkte.',
  rules: 'Musik läuft extern. Spieler buzzern, der Admin entscheidet die Antwort und vergibt pro richtig erkanntem Lied genau einen Punkt. Bei 5 Punkten ist das Spiel gewonnen.',
  materials: ['Musikclips', 'Lautsprecher', 'Spieler-Handys', 'TV-Display'],
  hasBeenPlayed: false,
  selectable: true,
  interaktionstyp: 'buzzer',
  built: true,

  onStart(ctx) {
    ctx.lockBuzzer();
    ctx.setGameState(defaultGameState(ctx.state.players));
  },

  onStop(ctx) {
    ctx.resetBuzzer();
    ctx.setGameState({});
  },

  onAction(ctx, client, action = {}) {
    if (!isAdminClient(ctx.state, client.clientId)) return;

    const state = ensureGameState(ctx.state.gameState, ctx.state.players);

    if (action.type === 'musik:set-song-title') {
      setSongTitle(ctx, state, action.title);
      return;
    }

    if (action.type === 'musik:select-song') {
      selectSong(ctx, state, action.index);
      return;
    }

    if (action.type === 'musik:next-song') {
      selectSong(ctx, state, state.currentSongIndex + 1);
      return;
    }

    if (action.type === 'musik:previous-song') {
      selectSong(ctx, state, state.currentSongIndex - 1);
      return;
    }

    if (action.type === 'musik:reveal-song') {
      const nextTitle = normalizeTitle(action.title != null ? action.title : state.currentSongTitle);
      if (!nextTitle) {
        ctx.setGameState({
          ...state,
          adminWarning: 'Bitte zuerst einen Songtitel eintragen.',
        });
        return;
      }
      ctx.setGameState({
        ...state,
        currentSongTitle: nextTitle,
        isSongRevealed: true,
        adminWarning: '',
      });
      return;
    }

    if (action.type === 'musik:hide-song') {
      ctx.setGameState({
        ...state,
        isSongRevealed: false,
        adminWarning: '',
      });
      return;
    }

    if (action.type === 'musik:add-point') {
      updatePlayerScore(ctx, state, action.playerId, 1);
      return;
    }

    if (action.type === 'musik:remove-point') {
      updatePlayerScore(ctx, state, action.playerId, -1);
      return;
    }

    if (action.type === 'musik:reset') {
      ctx.resetBuzzer();
      ctx.setGameState(defaultGameState(ctx.state.players));
    }
  },
};

function defaultGameState(players = []) {
  const currentSongIndex = 0;
  const currentSong = SONGS[currentSongIndex];
  return {
    songs: SONGS,
    currentSongIndex,
    currentSongTitle: currentSong.title,
    currentSongCoverImageUrl: currentSong.coverImageUrl,
    currentSongSpotifyUrl: currentSong.spotifyUrl,
    isSongRevealed: false,
    playerScores: Object.fromEntries(players.map((player) => [player.id, 0])),
    winnerPlayerId: null,
    targetScore: TARGET_SCORE,
    adminWarning: '',
  };
}

function ensureGameState(value, players = []) {
  const base = defaultGameState(players);
  const saved = value && typeof value === 'object' ? value : {};
  const savedScores = saved.playerScores && typeof saved.playerScores === 'object'
    ? saved.playerScores
    : {};
  const playerScores = Object.fromEntries(
    players.map((player) => [
      player.id,
      clampInt(savedScores[player.id], 0, TARGET_SCORE),
    ])
  );
  const winnerPlayerId = players.some((player) => player.id === saved.winnerPlayerId)
    ? saved.winnerPlayerId
    : findWinner(playerScores);
  const currentSongIndex = clampInt(saved.currentSongIndex, 0, SONGS.length - 1);
  const currentSong = SONGS[currentSongIndex];
  const currentSongTitle = normalizeTitle(saved.currentSongTitle) || currentSong.title;

  return {
    ...base,
    ...saved,
    songs: SONGS,
    currentSongIndex,
    currentSongTitle,
    currentSongCoverImageUrl: saved.currentSongCoverImageUrl || currentSong.coverImageUrl,
    currentSongSpotifyUrl: saved.currentSongSpotifyUrl || currentSong.spotifyUrl,
    isSongRevealed: saved.isSongRevealed === true,
    playerScores,
    winnerPlayerId,
    targetScore: TARGET_SCORE,
    adminWarning: String(saved.adminWarning || '').slice(0, 120),
  };
}

function setSongTitle(ctx, state, title) {
  ctx.setGameState({
    ...state,
    currentSongTitle: normalizeTitle(title),
    adminWarning: '',
  });
}

function selectSong(ctx, state, index) {
  const currentSongIndex = clampInt(index, 0, SONGS.length - 1);
  const currentSong = SONGS[currentSongIndex];
  ctx.resetBuzzer();
  ctx.setGameState({
    ...state,
    currentSongIndex,
    currentSongTitle: currentSong.title,
    currentSongCoverImageUrl: currentSong.coverImageUrl,
    currentSongSpotifyUrl: currentSong.spotifyUrl,
    isSongRevealed: false,
    adminWarning: '',
  });
}

function updatePlayerScore(ctx, state, playerId, delta) {
  const player = ctx.state.players.find((entry) => entry.id === playerId);
  if (!player) return;

  const playerScores = {
    ...state.playerScores,
    [player.id]: clampInt((state.playerScores[player.id] || 0) + Number(delta || 0), 0, TARGET_SCORE),
  };

  ctx.setGameState({
    ...state,
    playerScores,
    winnerPlayerId: findWinner(playerScores),
    adminWarning: '',
  });
}

function findWinner(playerScores) {
  const winner = Object.entries(playerScores).find(([, score]) => Number(score) >= TARGET_SCORE);
  return winner ? winner[0] : null;
}

function normalizeTitle(value) {
  return String(value || '').trim().slice(0, 120);
}

function clampInt(value, min, max) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function isAdminClient(state, clientId) {
  const client = state.clients && state.clients[clientId];
  return client && client.role === 'admin';
}

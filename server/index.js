'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

const ROOT = path.join(__dirname, '..');

// .env.local und .env laden, damit GOOGLE_MAPS_API_KEY lokal funktioniert.
// Wichtig: .env.local darf NICHT auf GitHub landen.
try {
  const dotenv = require('dotenv');

  const envLocalPath = path.join(ROOT, '.env.local');
  const envPath = path.join(ROOT, '.env');

  if (fs.existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath });
  }

  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
} catch (err) {
  // dotenv ist optional, aber für lokale API-Keys empfohlen.
  // Wenn es nicht installiert ist, läuft der Server weiter.
  console.warn('[config] dotenv konnte nicht geladen werden. Falls der Google Maps Key fehlt: npm install dotenv ausführen.');
}

const { getLocalIp } = require('./network');
const { GameState } = require('./state');
const { Registry } = require('./registry');
const { attachSockets } = require('./sockets');

const PORT = process.env.PORT || 3000;

// ---- Kern-Komponenten -------------------------------------------------------
const gameState = new GameState();
gameState.load();

const registry = new Registry();
registry.loadAll();

// Registry in den State injizieren -> Pick-Ablauf kann 3 Spiele zusammenstellen.
gameState.setRegistry(registry);

// ---- Express ----------------------------------------------------------------
const app = express();

// Statische Auslieferung der drei Ansichten + gemeinsame Assets + Spiel-Module.
app.use('/shared', express.static(path.join(ROOT, 'public', 'shared')));
app.use('/display', express.static(path.join(ROOT, 'public', 'display')));
app.use('/play', express.static(path.join(ROOT, 'public', 'play')));
app.use('/admin', express.static(path.join(ROOT, 'public', 'admin')));
app.use('/games', express.static(path.join(ROOT, 'games')));
app.use('/assets', express.static(path.join(ROOT, 'assets')));

// REST: Liste der registrierten Spiele (für Admin, falls ohne Socket gebraucht).
app.get('/api/games', (req, res) => res.json(registry.list()));

app.get('/api/config', (req, res) => {
  res.json({
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '',
  });
});

// QR-Code als PNG (data wird per Query übergeben).
app.get('/qr', async (req, res) => {
  const data = String(req.query.data || '');
  if (!data) return res.status(400).send('missing data');

  try {
    res.type('png');
    const png = await QRCode.toBuffer(data, { width: 320, margin: 1 });
    res.send(png);
  } catch (err) {
    res.status(500).send('qr error');
  }
});

// Startseite: Übersicht + QR-Codes für /play und /admin.
app.get('/', (req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

// ---- HTTP + Socket.IO -------------------------------------------------------
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*' },
  // Socket.IO macht automatischen Reconnect; großzügige Timeouts für Handy-Standby.
  pingTimeout: 30000,
  pingInterval: 10000,
});

attachSockets(io, gameState, registry);

// ---- Start ------------------------------------------------------------------
server.listen(PORT, '0.0.0.0', async () => {
  const ip = getLocalIp();
  const base = `http://${ip}:${PORT}`;

  const urls = {
    start: `${base}/`,
    display: `${base}/display/`,
    play: `${base}/play/`,
    admin: `${base}/admin/`,
  };

  /* eslint-disable no-console */
  console.log('\n========================================================');
  console.log('   WEIDMANN WM Poker Edition  -  Spieleshow Server läuft');
  console.log('========================================================');
  console.log(`   Lokale IP : ${ip}`);
  console.log(`   Port      : ${PORT}`);
  console.log('--------------------------------------------------------');
  console.log(`   Startseite : ${urls.start}`);
  console.log(`   DISPLAY/TV : ${urls.display}`);
  console.log(`   HANDYS     : ${urls.play}      (Spieler)`);
  console.log(`   ADMIN      : ${urls.admin}     (Steuerung)`);
  console.log('--------------------------------------------------------');

  const hasGoogleMapsKey = Boolean(process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY);

  if (hasGoogleMapsKey) {
    console.log('   Google Maps API Key: gefunden');
  } else {
    console.log('   Google Maps API Key: FEHLT');
    console.log('   Lege eine .env.local im Projektordner an mit:');
    console.log('   GOOGLE_MAPS_API_KEY=dein_key_hier');
  }

  console.log('--------------------------------------------------------');

  // QR-Codes direkt im Terminal (zum Abscannen mit Handy oder Admin-Gerät).
  try {
    console.log('\n   QR  ->  HANDY-SPIELER  (' + urls.play + ')\n');
    console.log(await QRCode.toString(urls.play, { type: 'terminal', small: true }));

    console.log('\n   QR  ->  ADMIN    (' + urls.admin + ')\n');
    console.log(await QRCode.toString(urls.admin, { type: 'terminal', small: true }));
  } catch (err) {
    console.log('   (QR-Code-Erzeugung übersprungen: ' + err.message + ')');
  }

  console.log('========================================================');
  console.log('   Beenden: stop.bat  oder  Strg+C');
  console.log('========================================================\n');
  /* eslint-enable no-console */
});

// Sauberes Speichern beim Beenden.
function shutdown() {
  console.log('\n[server] Beende, speichere State ...');
  gameState.saveNow();

  server.close(() => process.exit(0));

  // Falls close hängt, hart nach 1.5s.
  setTimeout(() => process.exit(0), 1500);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
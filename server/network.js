'use strict';

const os = require('os');

/**
 * Liefert die erste nicht-interne IPv4-Adresse (das WLAN/LAN-Interface),
 * damit iPads & Handys den Server im lokalen Netz erreichen.
 * Faellt auf 127.0.0.1 zurueck, falls nichts gefunden wird.
 */
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        candidates.push({ name, address: net.address });
      }
    }
  }

  // Bevorzuge typische private LAN-Bereiche (192.168.x, 10.x), danach Rest.
  const preferred = candidates.find((c) => c.address.startsWith('192.168.'))
    || candidates.find((c) => c.address.startsWith('10.'))
    || candidates.find((c) => c.address.startsWith('172.'))
    || candidates[0];

  return preferred ? preferred.address : '127.0.0.1';
}

module.exports = { getLocalIp };

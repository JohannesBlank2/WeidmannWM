'use strict';

const { MAP_VIEWS, getMapView } = require('./whereIsWhatMapViews');
const MAP_CONFIGS = MAP_VIEWS;

function getMapConfig(mapView = 'germany') {
  return getMapView(mapView);
}

function latLonToMapPosition(latitude, longitude, mapView = 'germany') {
  const config = legacyBounds(getMapConfig(mapView));
  return {
    x: clampNumber(((Number(longitude) - config.lonMin) / (config.lonMax - config.lonMin)) * 100, 0, 100),
    y: clampNumber(((config.latMax - Number(latitude)) / (config.latMax - config.latMin)) * 100, 0, 100),
  };
}

function mapPositionToLatLon(xPercent, yPercent, mapView = 'germany') {
  const config = legacyBounds(getMapConfig(mapView));
  const x = clampNumber(xPercent, 0, 100);
  const y = clampNumber(yPercent, 0, 100);
  const lng = config.lonMin + (x / 100) * (config.lonMax - config.lonMin);
  const lat = config.latMax - (y / 100) * (config.latMax - config.latMin);
  return {
    lat,
    lng,
    latitude: lat,
    longitude: lng,
  };
}

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const rawValues = [lat1, lon1, lat2, lon2];
  if (rawValues.some((value) => !isFiniteCoordinate(value))) return null;
  const values = rawValues.map(Number);

  const earthRadiusKm = 6371;
  const dLat = toRadians(values[2] - values[0]);
  const dLon = toRadians(values[3] - values[1]);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(values[0])) *
      Math.cos(toRadians(values[2])) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getRoundWinner(pins, target, mapView = 'germany') {
  if (!hasValidTarget(target)) return { winnerPlayerIds: [], tie: false, results: [] };
  const entries = Array.isArray(pins) ? pins : Object.values(pins || {});
  const results = entries
    .filter((pin) => pin && pin.playerId && pinCoordinates(pin, mapView))
    .map((pin) => {
      const coords = pinCoordinates(pin, mapView);
      const distanceKm = calculateDistanceKm(
        coords.lat,
        coords.lng,
        target.targetLatitude,
        target.targetLongitude,
      );
      return {
        playerId: pin.playerId,
        distanceKm: distanceKm == null ? null : Math.round(distanceKm),
      };
    })
    .sort((a, b) => {
      if (a.distanceKm == null && b.distanceKm == null) return 0;
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm;
    });
  const valid = results.filter((row) => row.distanceKm != null);
  if (!valid.length) return { winnerPlayerIds: [], tie: false, results };
  const bestDistance = valid[0].distanceKm;
  const winnerPlayerIds = valid.filter((row) => row.distanceKm === bestDistance).map((row) => row.playerId);
  return {
    winnerPlayerIds,
    tie: winnerPlayerIds.length > 1,
    results,
  };
}

function hasValidTarget(question) {
  return Boolean(
    question &&
      isFiniteCoordinate(question.targetLatitude) &&
      isFiniteCoordinate(question.targetLongitude),
  );
}

function pinCoordinates(pin, mapView = 'germany') {
  if (!pin) return null;
  if (isFiniteCoordinate(pin.lat) && isFiniteCoordinate(pin.lng)) {
    return { lat: Number(pin.lat), lng: Number(pin.lng) };
  }
  if (isFiniteCoordinate(pin.latitude) && isFiniteCoordinate(pin.longitude)) {
    return { lat: Number(pin.latitude), lng: Number(pin.longitude) };
  }
  if (pin.x != null && pin.y != null) {
    return mapPositionToLatLon(pin.x, pin.y, mapView);
  }
  return null;
}

function legacyBounds(view) {
  const bounds = view && view.bounds ? view.bounds : MAP_VIEWS.germany.bounds;
  return {
    latMin: bounds.south,
    latMax: bounds.north,
    lonMin: bounds.west,
    lonMax: bounds.east,
  };
}

function isFiniteCoordinate(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function toRadians(value) {
  return (Number(value) * Math.PI) / 180;
}

module.exports = {
  MAP_CONFIGS,
  MAP_VIEWS,
  getMapConfig,
  getMapView,
  latLonToMapPosition,
  mapPositionToLatLon,
  calculateDistanceKm,
  getRoundWinner,
  hasValidTarget,
  pinCoordinates,
};

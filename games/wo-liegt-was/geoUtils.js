(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const fs = require('fs');
    const path = require('path');
    module.exports = factory(require('./regionConfigs'), {
      fs,
      mapsDir: path.join(__dirname, '..', '..', 'assets', 'maps'),
      joinPath: path.join,
    });
  } else if (root) {
    root.WlwGeoUtils = factory(root.WlwRegionConfigs || null, null);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (regionConfigsApi, nodeEnv) {
  'use strict';

  const configsApi = regionConfigsApi || {
    REGION_CONFIGS: {},
    getRegionConfig: () => null,
  };

  // regionId -> { geoJson, polygons: [{ outer, holes }], bounds }
  const regionCache = new Map();
  // regionId -> Promise (nur Browser, verhindert doppelte Fetches)
  const loadPromises = new Map();
  const boundsFallbackWarned = new Set();

  function getRegionConfig(regionId) {
    return configsApi.getRegionConfig(regionId);
  }

  // ---- GeoJSON-Parsing ------------------------------------------------------

  function geometriesOf(geoJson) {
    if (!geoJson || typeof geoJson !== 'object') return [];
    if (geoJson.type === 'FeatureCollection') {
      return (geoJson.features || []).flatMap((feature) => geometriesOf(feature));
    }
    if (geoJson.type === 'Feature') {
      return geometriesOf(geoJson.geometry);
    }
    if (geoJson.type === 'GeometryCollection') {
      return (geoJson.geometries || []).flatMap((geometry) => geometriesOf(geometry));
    }
    return [geoJson];
  }

  // Liefert [{ outer: [{lat,lng},...], holes: [[{lat,lng},...], ...] }, ...]
  function parseGeoJsonPolygons(geoJson) {
    const polygons = [];
    geometriesOf(geoJson).forEach((geometry) => {
      if (!geometry) return;
      if (geometry.type === 'Polygon') {
        pushPolygon(polygons, geometry.coordinates);
      } else if (geometry.type === 'MultiPolygon') {
        (geometry.coordinates || []).forEach((rings) => pushPolygon(polygons, rings));
      }
    });
    return polygons;
  }

  function pushPolygon(list, rings) {
    if (!Array.isArray(rings) || !rings.length) return;
    const outer = ringToLatLng(rings[0]);
    if (outer.length < 3) return;
    list.push({
      outer,
      holes: rings.slice(1).map(ringToLatLng).filter((ring) => ring.length >= 3),
    });
  }

  function ringToLatLng(ring) {
    if (!Array.isArray(ring)) return [];
    return ring
      .map((pair) => ({ lat: Number(pair[1]), lng: Number(pair[0]) }))
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  }

  function computePolygonsBounds(polygons) {
    let south = 90;
    let north = -90;
    let west = 180;
    let east = -180;
    (polygons || []).forEach((polygon) => {
      polygon.outer.forEach((point) => {
        if (point.lat < south) south = point.lat;
        if (point.lat > north) north = point.lat;
        if (point.lng < west) west = point.lng;
        if (point.lng > east) east = point.lng;
      });
    });
    if (south > north || west > east) return null;
    return { south, west, north, east };
  }

  // ---- Punkt-in-Polygon (Ray-Casting, inkl. Löcher) ---------------------------

  function pointInRing(lat, lng, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const yi = ring[i].lat;
      const xi = ring[i].lng;
      const yj = ring[j].lat;
      const xj = ring[j].lng;
      const intersects = (yi > lat) !== (yj > lat)
        && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function pointInPolygons(lat, lng, polygons) {
    return (polygons || []).some((polygon) =>
      pointInRing(lat, lng, polygon.outer)
      && !polygon.holes.some((hole) => pointInRing(lat, lng, hole)));
  }

  // ---- Laden & Cache ----------------------------------------------------------

  function cacheRegion(regionId, geoJson) {
    const polygons = parseGeoJsonPolygons(geoJson);
    if (!polygons.length) {
      throw new Error(`GeoJSON für Region "${regionId}" enthält keine Polygone.`);
    }
    const entry = { geoJson, polygons, bounds: computePolygonsBounds(polygons) };
    regionCache.set(regionId, entry);
    return entry;
  }

  // Node: alle Regionen einmalig synchron einlesen, damit der Server
  // Pins ohne async-Umbau validieren kann.
  if (nodeEnv && nodeEnv.fs) {
    Object.keys(configsApi.REGION_CONFIGS || {}).forEach((regionId) => {
      const config = configsApi.REGION_CONFIGS[regionId];
      const filePath = nodeEnv.joinPath(nodeEnv.mapsDir, config.geoJsonFile || `${regionId}.geojson`);
      try {
        cacheRegion(regionId, JSON.parse(nodeEnv.fs.readFileSync(filePath, 'utf8')));
      } catch (err) {
        console.warn(`[wo-liegt-was] GeoJSON für Region "${regionId}" konnte nicht geladen werden (${filePath}): ${err.message} — Fallback auf Bounds-Prüfung.`);
      }
    });
  }

  function loadRegionGeoJson(regionId) {
    const config = getRegionConfig(regionId);
    if (!config) {
      return Promise.reject(new Error(`Unbekannte Region: ${regionId}`));
    }
    const cached = regionCache.get(config.id);
    if (cached) return Promise.resolve(cached.geoJson);
    if (loadPromises.has(config.id)) return loadPromises.get(config.id);
    if (typeof fetch !== 'function') {
      return Promise.reject(new Error(`GeoJSON für Region "${config.id}" ist nicht geladen.`));
    }
    const promise = fetch(config.geoJsonPath)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`GeoJSON-Datei fehlt oder ist nicht erreichbar (${response.status}): ${config.geoJsonPath}`);
        }
        return response.json();
      })
      .then((geoJson) => cacheRegion(config.id, geoJson).geoJson)
      .catch((err) => {
        loadPromises.delete(config.id);
        throw err;
      });
    loadPromises.set(config.id, promise);
    return promise;
  }

  function getRegionPolygons(regionId) {
    const config = getRegionConfig(regionId);
    const entry = config ? regionCache.get(config.id) : null;
    return entry ? entry.polygons : null;
  }

  function getRegionBounds(regionId) {
    const config = getRegionConfig(regionId);
    if (config && config.bounds) return config.bounds;
    const entry = config ? regionCache.get(config.id) : null;
    return entry ? entry.bounds : null;
  }

  function isPointInsideRegion(lat, lng, regionId) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
    const config = getRegionConfig(regionId);
    if (!config) return false;
    const entry = regionCache.get(config.id);
    if (entry) {
      return pointInPolygons(latitude, longitude, entry.polygons);
    }
    // Notlösung: Wenn kein Umriss verfügbar ist, wenigstens die Bounds prüfen.
    if (config.bounds) {
      if (!boundsFallbackWarned.has(config.id)) {
        boundsFallbackWarned.add(config.id);
        console.warn(`[wo-liegt-was] Kein Umriss für Region "${config.id}" geladen — Punkt-Prüfung läuft nur über Bounds.`);
      }
      return latitude >= config.bounds.south && latitude <= config.bounds.north
        && longitude >= config.bounds.west && longitude <= config.bounds.east;
    }
    return false;
  }

  function hasRegionPolygons(regionId) {
    const config = getRegionConfig(regionId);
    return Boolean(config && regionCache.has(config.id));
  }

  return {
    getRegionConfig,
    parseGeoJsonPolygons,
    computePolygonsBounds,
    pointInPolygons,
    loadRegionGeoJson,
    getRegionPolygons,
    getRegionBounds,
    hasRegionPolygons,
    isPointInsideRegion,
  };
});

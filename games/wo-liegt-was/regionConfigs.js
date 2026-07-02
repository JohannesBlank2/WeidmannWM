(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.WlwRegionConfigs = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // Zentrale Region-Definitionen für "WO LIEGT WAS?".
  // Jede Region hat einen exakten Umriss als GeoJSON (Quelle: OpenStreetMap/Nominatim, ODbL).
  // bounds = Kartenausschnitt zum Fitten/Beschränken (leicht größer als der Umriss).
  const REGION_CONFIGS = {
    germany: {
      id: 'germany',
      label: 'Ganz Deutschland',
      geoJsonPath: '/assets/maps/germany.geojson',
      geoJsonFile: 'germany.geojson',
      center: { lat: 51.1657, lng: 10.4515 },
      zoom: 6,
      mobileZoom: 6,
      bounds: { south: 47.25, west: 5.84, north: 55.12, east: 15.06 },
      mapTypeId: 'satellite',
    },
    spain: {
      id: 'spain',
      label: 'Ganz Spanien',
      geoJsonPath: '/assets/maps/spain.geojson',
      geoJsonFile: 'spain.geojson',
      center: { lat: 40.4168, lng: -3.7038 },
      zoom: 6,
      mobileZoom: 6,
      // Festland + Balearen; die Kanaren sind bewusst nicht Teil des Umrisses.
      bounds: { south: 35.9, west: -9.6, north: 44.02, east: 4.62 },
      mapTypeId: 'satellite',
    },
    hebertshausen: {
      id: 'hebertshausen',
      label: 'Ganz Hebertshausen',
      geoJsonPath: '/assets/maps/hebertshausen.geojson',
      geoJsonFile: 'hebertshausen.geojson',
      center: { lat: 48.295, lng: 11.476 },
      zoom: 13,
      mobileZoom: 13,
      bounds: { south: 48.256, west: 11.408, north: 48.335, east: 11.543 },
      mapTypeId: 'satellite',
    },
    erding: {
      id: 'erding',
      label: 'Ganz Erding',
      geoJsonPath: '/assets/maps/erding.geojson',
      geoJsonFile: 'erding.geojson',
      center: { lat: 48.31, lng: 11.91 },
      zoom: 13,
      mobileZoom: 13,
      bounds: { south: 48.247, west: 11.849, north: 48.374, east: 11.973 },
      mapTypeId: 'satellite',
    },
  };

  function getRegionConfig(regionId = 'germany') {
    return REGION_CONFIGS[regionId] || REGION_CONFIGS.germany;
  }

  return {
    REGION_CONFIGS,
    getRegionConfig,
  };
});

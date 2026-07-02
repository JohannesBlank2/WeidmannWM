(function (root, factory) {
  let regionConfigs = null;
  if (typeof module === 'object' && module.exports) {
    regionConfigs = require('./regionConfigs');
  } else if (root) {
    regionConfigs = root.WlwRegionConfigs || null;
  }
  const api = factory(regionConfigs);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.WhereIsWhatMapViews = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function (regionConfigs) {
  'use strict';

  // Kompatibilitäts-Wrapper: Die Regionen sind in regionConfigs.js definiert
  // (inkl. GeoJSON-Umriss-Pfaden). MAP_VIEWS/getMapView bleiben als API erhalten.
  const FALLBACK_VIEWS = {
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
  };

  const MAP_VIEWS = regionConfigs && regionConfigs.REGION_CONFIGS
    ? regionConfigs.REGION_CONFIGS
    : FALLBACK_VIEWS;

  function getMapView(mapView = 'germany') {
    return MAP_VIEWS[mapView] || MAP_VIEWS.germany;
  }

  return {
    MAP_VIEWS,
    getMapView,
  };
});

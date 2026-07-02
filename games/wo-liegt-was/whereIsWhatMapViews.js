(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.WhereIsWhatMapViews = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const MAP_VIEWS = {
    germany: {
      label: 'Ganz Deutschland',
      center: { lat: 51.1657, lng: 10.4515 },
      zoom: 6,
      mobileZoom: 6,
      bounds: {
        south: 47.2,
        west: 5.8,
        north: 55.1,
        east: 15.1,
      },
    },
    spain: {
      label: 'Ganz Spanien',
      center: { lat: 40.4168, lng: -3.7038 },
      zoom: 6,
      mobileZoom: 6,
      bounds: {
        south: 36.0,
        west: -9.5,
        north: 43.9,
        east: 4.5,
      },
    },
    hebertshausen: {
      label: 'Ganz Hebertshausen',
      center: { lat: 48.29, lng: 11.46 },
      zoom: 13,
      mobileZoom: 13,
      bounds: {
        south: 48.27,
        west: 11.43,
        north: 48.33,
        east: 11.5,
      },
    },
    erding: {
      label: 'Ganz Erding',
      center: { lat: 48.31, lng: 11.91 },
      zoom: 13,
      mobileZoom: 13,
      bounds: {
        south: 48.27,
        west: 11.86,
        north: 48.34,
        east: 11.96,
      },
    },
  };

  function getMapView(mapView = 'germany') {
    return MAP_VIEWS[mapView] || MAP_VIEWS.germany;
  }

  return {
    MAP_VIEWS,
    getMapView,
  };
});

(function () {
  'use strict';

  // Maskiert auf einer Google Map alles außerhalb eines Regions-Umrisses.
  // Technik: ein Welt-Rechteck als äußerer Ring, die Regions-Ringe als "Löcher";
  // die Even-Odd-Füllregel lässt nur die Region frei.

  const DEFAULT_FILL_COLOR = '#07130f';
  const DEFAULT_OUTLINE_COLOR = '#ffd15c';

  function worldRing() {
    // Google Maps zieht Kanten immer über den kürzesten Längengrad-Weg.
    // Ohne Zwischenpunkte würde das Welt-Rechteck an der Datumsgrenze kollabieren,
    // daher Stützpunkte alle 60 Grad.
    const ring = [];
    for (let lng = -179.9; lng < 179.9; lng += 59.966) {
      ring.push({ lat: 85, lng });
    }
    ring.push({ lat: 85, lng: 179.9 });
    for (let lng = 179.9; lng > -179.9; lng -= 59.966) {
      ring.push({ lat: -85, lng });
    }
    ring.push({ lat: -85, lng: -179.9 });
    return ring;
  }

  function signedArea(ring) {
    let sum = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      sum += ring[j].lng * ring[i].lat - ring[i].lng * ring[j].lat;
    }
    return sum / 2;
  }

  function withWinding(ring, clockwise) {
    const isClockwise = signedArea(ring) < 0;
    return isClockwise === clockwise ? ring : ring.slice().reverse();
  }

  function applyRegionMask(map, regionId, geoJson, options = {}) {
    if (!map || !window.google || !window.google.maps) return null;
    if (!window.WlwGeoUtils) {
      console.error('[wo-liegt-was] WlwGeoUtils fehlt — Region-Maske kann nicht gebaut werden.');
      return null;
    }
    const polygons = Array.isArray(geoJson)
      ? geoJson
      : window.WlwGeoUtils.parseGeoJsonPolygons(geoJson);
    if (!polygons || !polygons.length) {
      console.error(`[wo-liegt-was] Region "${regionId}": GeoJSON enthält keine Polygone, Maske wird nicht angewendet.`);
      return null;
    }

    clearRegionMask(map);
    const google = window.google;

    const paths = [withWinding(worldRing(), true)];
    polygons.forEach((polygon) => {
      paths.push(withWinding(polygon.outer, false));
      polygon.holes.forEach((hole) => paths.push(withWinding(hole, true)));
    });

    const mask = new google.maps.Polygon({
      paths,
      map,
      fillColor: options.fillColor || DEFAULT_FILL_COLOR,
      fillOpacity: options.fillOpacity != null ? options.fillOpacity : 1,
      strokeOpacity: 0,
      strokeWeight: 0,
      clickable: false,
      zIndex: 1,
    });

    const outlines = polygons.map((polygon) => new google.maps.Polyline({
      path: polygon.outer.concat([polygon.outer[0]]),
      map,
      strokeColor: options.outlineColor || DEFAULT_OUTLINE_COLOR,
      strokeOpacity: 0.95,
      strokeWeight: options.outlineWeight || 2.5,
      clickable: false,
      zIndex: 2,
    }));

    const handle = { regionId, mask, outlines };
    map.__wlwRegionMask = handle;
    return handle;
  }

  function clearRegionMask(map) {
    if (!map || !map.__wlwRegionMask) return;
    const handle = map.__wlwRegionMask;
    if (handle.mask) handle.mask.setMap(null);
    (handle.outlines || []).forEach((line) => line.setMap(null));
    map.__wlwRegionMask = null;
  }

  window.WlwRegionMask = {
    applyRegionMask,
    clearRegionMask,
  };
})();

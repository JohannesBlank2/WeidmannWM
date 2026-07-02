# Regions-Umrisse für „WO LIEGT WAS?“

GeoJSON-Umrisse der Spielregionen, verwendet von `games/wo-liegt-was/`:

| Datei | Region | OSM-Relation |
| --- | --- | --- |
| `germany.geojson` | Deutschland (Staatsgrenze) | 51477 |
| `spain.geojson` | Spanien (Festland + Balearen, ohne Kanaren) | 1311341 |
| `hebertshausen.geojson` | Gemeinde Hebertshausen | 934469 |
| `erding.geojson` | Stadt Erding | 934743 |

Quelle: OpenStreetMap über Nominatim (`polygon_geojson=1`), Lizenz ODbL.
Länder sind mit `polygon_threshold=0.01` vereinfacht, Gemeinden mit `0.0003`;
Koordinaten auf 5 Nachkommastellen gerundet.

Jede Datei ist ein einzelnes `Feature` mit `MultiPolygon`-Geometrie.
In `properties.bounds` liegt die berechnete Bounding-Box.
Die im Spiel verwendeten Kartenausschnitte sind in
`games/wo-liegt-was/regionConfigs.js` definiert.

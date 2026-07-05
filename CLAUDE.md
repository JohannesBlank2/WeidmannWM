# Projektanweisungen

- Sichtbare deutsche Texte immer mit echten Umlauten schreiben: Ä, Ö, Ü, ä, ö, ü. Keine Umschreibungen wie ae/oe/ue in UI-Texten, Kommentaren oder Dokumentation verwenden.
- Technische IDs, Routen, Enum-Werte, Socket-Events, Phase-Namen und bestehende Dateinamen unverändert lassen, wenn sie bereits ASCII-Umschreibungen enthalten.
- Branding in sichtbaren Texten: `WEIDMANN WM Poker Edition`.
- Sounds und Musik werden immer auf dem Display abgespielt, nie in der Admin-Konsole. Die Admin-Konsole sendet nur Steuer-Events per Socket (Muster: `admin:*` → Server → `fx:*` ans Display).

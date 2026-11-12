# Ansitzplaner – Projektgedächtnis

## Projektziel
Mobile Web-App (PWA) für einen Jäger, die im Revier auf dem iPhone genutzt wird.
Leitgedanke (vom Opa des Nutzers): **Erfolgreich wird nur, wer kombinieren kann** –
Wetter, Wind, Mond, Sonnenauf-/-untergang und der gewählte Sitz werden mit dem
Verhalten der Wildarten verknüpft. Die App lernt aus dem Ansitz-Tagebuch.

Vier Bereiche: **Revierkarte**, **Wildsichtungen**, **Ansitz-Tagebuch**, **Kombinations-Assistent**.

Der Nutzer hat Grundkenntnisse im Programmieren: Schritte kurz und verständlich
erklären, nach jeder Phase genau sagen, wie man startet und testet. Antworten auf Deutsch.

## Phasen
- [x] Phase 0: Grundgerüst, CLAUDE.md, GitHub-Pages-Workflow
- [x] Phase 1: Revierkarte, Reviereinrichtungen, Witterungskegel
- [ ] Phase 2: Ansitz-Tagebuch mit Wetter/Sonne/Mond (Open-Meteo + SunCalc), Offline-Warteschlange
- [ ] Phase 3: Wildsichtungen, Wildkamera-Import (EXIF), Filter/Heatmap
- [ ] Phase 4: Kombinations-Assistent, Regelwerk, Statistik, ~40 Test-Ansitze
- [ ] Phase 5: PWA/Offline, Kachel-Vorabspeicherung, JSON-Export/-Import, Jagdzeiten, Feinschliff

## Fachbegriffe (Jagd)
| Begriff | Bedeutung |
|---|---|
| Ansitz | Jagdart: Warten auf einem Sitz auf Wild |
| Pirsch | Jagdart: langsames Anschleichen |
| Drückjagd | Gesellschaftsjagd, Wild wird zu den Schützen gedrückt |
| Hochsitz / Kanzel / Leiter | Ansitzeinrichtungen (Kanzel = geschlossen, Leiter = einfacher offener Sitz) |
| Drückjagdbock | niedriger Sitz für Drückjagden |
| Kirrung | Lockfütterung (v. a. Schwarzwild) in kleinen Mengen |
| Salzlecke | Salzstelle für Schalenwild |
| Suhle | Schlammbad (Schwarz-/Rotwild) |
| Wechsel | regelmäßig genutzter Pfad des Wildes |
| Einstand | Rückzugs-/Ruhebereich des Wildes (z. B. Dickung) |
| Dickung | dichter Jungwald, typischer Einstand |
| Äsung / Äsungsfläche | Nahrung / Fläche, auf der Wild frisst (Wildacker) |
| Witterung | Geruch des Jägers (bzw. Geruchssinn des Wildes) |
| Witterungskegel | Bereich, in den der Wind die Witterung trägt (Windrichtung + 180°) |
| Anblick | Wild gesehen |
| Strecke / Erfolg | erlegtes Wild |
| aufgebrochen | Gewicht nach Entfernen der Innereien |
| Bock, Ricke, Kitz | Rehwild: männlich, weiblich, Jungtier |
| Keiler, Bache, Überläufer, Frischling | Schwarzwild: männlich, weiblich, 1–2 Jahre, Jungtier |
| Thermik | tageszeitliche Hangwinde (Revier ist flach → vorerst nicht berücksichtigt) |
| Schonzeit / Jagdzeit | Zeiten, in denen eine Wildart nicht/bejagt werden darf |

## Architektur
- **React 19 + Vite 8 + TypeScript 6**, Tailwind CSS 4 (Theme-Farben in `src/index.css`)
- **Karte:** Leaflet 1.9 + react-leaflet 5
  - `src/map/providers.ts`: Registry aller Kartenanbieter (`TileProvider`). Neuer Anbieter = neues Objekt.
  - `src/map/googleTiles.ts`: Google Map Tiles API (Session-Token, Attribution über Viewport-API).
    Schlüssel nur aus `VITE_GOOGLE_MAPS_API_KEY`. Nie offline cachen (`offlineCacheable: false`).
  - `src/map/MapLayers.tsx`: Ebenen (Grundkarte, Einrichtungen, Grenze, Zeichen-Entwurf, Kegel, Standort)
- **Daten:** Dexie 4 (IndexedDB), `src/db/db.ts`. Geometrien als GeoJSON (`[lng, lat]`!).
  Schema-Versionen nur ergänzen, nie ändern. Einstellungen als Key/Value in `settings` (`src/db/settings.ts`).
- **Fachlogik ohne UI** in `src/domain/` (z. B. `scent.ts` Witterungskegel) – mit Vitest getestet.
- **Hilfen:** `src/lib/geo.ts` (ebene Näherung in Metern um Bezugspunkt), `src/lib/time.ts` (Europe/Berlin), `src/lib/sun.ts`
- **Wetter:** `src/services/openMeteo.ts` – Forecast-API (≈3 Monate zurück, 15 Tage voraus), sonst Archiv-API.
- **Routing:** Hash-Routing (`#/karte`, …) in `src/lib/router.ts` – funktioniert auf GitHub Pages.
- **Testdaten:** `src/demo/` – alles mit `demo: true`, löschbar über „Mehr → Testdaten löschen“.
- **Deployment:** `.github/workflows/deploy.yml` → GitHub Pages. `base: './'` in `vite.config.ts`.

## Getroffene Entscheidungen
- Ein Nutzer, ein Gerät, keine Cloud. Nur Koordinaten + Datum gehen an Open-Meteo.
- Zielgerät **iPhone** (Safari): `navigator.storage.persist()` anfragen; Backup-Erinnerung in Phase 5 wichtig.
- Revier ist **flach** → keine Thermik-/Höhenlogik.
- Witterungskegel: Standard 300 m lang, 40° Öffnung (einstellbar). Warnung bei Wechsel, Kirrung,
  Salzlecke, Suhle, Dickung, Einstand; Hinweis bei Äsungsfläche. Zusätzlich Wind relativ zur Blickrichtung.
- Wind < 4 km/h gilt als „umlaufend“ (Hinweis), Böen ≥ 40 km/h als Unruhe-Hinweis.
- Fotos werden auf max. 1600 px verkleinert (JPEG) und als Blob in IndexedDB gespeichert.
- Eigene Zeichenwerkzeuge statt Plugin: Tippen setzt Punkte, große Buttons (Rückgängig/Fertig),
  „Hier, wo ich stehe“ per GPS.
- Änderungen im Bearbeiten-Panel werden sofort gespeichert (kein Speichern-Knopf).
- `crypto.randomUUID` hat einen Fallback (`src/lib/id.ts`), weil http:// im WLAN kein sicherer Kontext ist.
- Assistent (Phase 4): Mischung `Punkte = (1−a)·Regelwerk + a·eigene Daten`, `a = n/(n+10)`,
  n = Zahl ähnlicher Ansitze. Keine ML-Bibliothek, nachvollziehbare Statistik.
- Startregeln im Regelwerk sind als „Vorschlag, bitte prüfen“ markiert.
- Jagd-/Schonzeiten pflegt der Nutzer selbst (keine fest einprogrammierten Rechtsdaten).
- Offline-Kacheln (Phase 5): nur Esri/OSM/Topo, Google nie. OSM-Nutzungsregeln beachten (keine großen Downloads ab Zoom 17).

## Repository & Veröffentlichung
- GitHub: `paulberning1-oss/Jagdtagebuch` (Branch `main`)
- GitHub Pages: https://paulberning1-oss.github.io/Jagdtagebuch/ (Workflow `.github/workflows/deploy.yml`)

## Befehle
- `npm run dev` – Entwicklungsserver (http://localhost:5173)
- `npm run dev:handy` – mit HTTPS im WLAN (für iPhone-Test mit Standort)
- `npm test` – Unit-Tests (Vitest)
- `npm run build` – Typprüfung + Produktions-Build nach `dist/`

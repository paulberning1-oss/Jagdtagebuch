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
- [x] Phase 2: Ansitz-Tagebuch mit Wetter/Sonne/Mond (Open-Meteo + SunCalc), Offline-Warteschlange
- [x] Phase 3: Wildsichtungen, Wildkamera-Import (EXIF), Filter/Heatmap, Wildarten-Editor, Revierkarte aus Foto
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
- **Fachlogik ohne UI** in `src/domain/` – mit Vitest getestet:
  `scent.ts` (Witterungskegel), `environment.ts` (Wetter aus Stundenwerten, Sonne, Mond, Kalender),
  `hunt.ts` (Typen Ansitz/Sichtung/Bedingungen), `species.ts` (Startliste Wildarten, Verhalten)
- **Tagebuch:** `src/journal/` (`huntActions.ts` = Starten/Beenden/Nachtragen, `HuntForm`, `HuntDetail`,
  `SightingEditor`, `StartHuntSheet`), Seite `src/pages/JournalPage.tsx`. Routen `#/tagebuch/<id>[/bearbeiten]`.
- **Wetter-Warteschlange:** `src/services/weatherSync.ts` (App-Start, `online`, alle 5 min; max. 5 Auto-Versuche)
- **Kartenauswahl:** `src/map/MapPicker.tsx` (Vollbild, für Sichtungs-/Erlegungsort)
- **Sichtungen:** Seite `src/pages/SightingsPage.tsx`, `src/sightings/` (Punkte/Heatmap-Layer, Filter-Sheet,
  `CameraImport`), Logik `src/domain/sightings.ts` (Filter, Heatmap-Raster, Tageszeit nach Sonnenstand)
- **Revierkarte aus Foto:** `src/map/PhotoOverlay.tsx` + `src/lib/homography.ts` (4 Ecken → CSS matrix3d,
  eigenes Leaflet-Pane `photoPane` z-index 350). Tabelle `overlays`. Danach Grenze mit normalem Zeichenwerkzeug.
- **Wildarten-Editor:** `src/pages/SpeciesEditor.tsx` (unter „Mehr“)
- **EXIF:** `src/lib/exifTime.ts` (exifr, dynamisch geladen)
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
- DB-Schema v2: Tabellen `hunts`, `sightings`, `species`. Wildarten per `upgrade()` und `on('populate')`.
- Ansitz wird sofort lokal gespeichert; Sonne/Mond/Kalender lokal (SunCalc), nur Wetter braucht Internet
  (`weatherStatus` pending/ok/error). Zeit-/Ortsänderung → Bedingungen neu.
- Wetter: Werte zur Startstunde; Wind zusätzlich als Kreismittel über den Ansitz; Böen = Maximum;
  Drucktendenz aus Δ3 h (±1 hPa Schwelle) und Δ12 h; Niederschlag Open-Meteo = Summe der Vorstunde.
- Tageszeit: Morgen = Sonnenaufgang −2 h … +3 h, Abend = Sonnenuntergang −3 h … +2 h.
- Mondauf-/-untergang: SunCalc rechnet in UTC-Tagen → beide überlappenden UTC-Tage abfragen.
- Ansitze an Demo-Sitzen erben `demo: true` (werden mit den Testdaten gelöscht).
- Dezimalfelder als `type="text" inputMode="decimal"` (`DecimalInput`), da iOS bei `type="number"` das Komma verschluckt.
- DB-Schema v3: `overlays`, Index `cameraId` in `sightings`, Farben der Wildarten.
- Sichtungen außerhalb eines Ansitzes haben eigene `env` + `weatherStatus` (Warteschlange lädt nach;
  Anfragen werden je Ort+Tagesbereich zusammengefasst). Sichtungen im Ansitz nutzen die Bedingungen des Ansitzes.
- Heatmap = einfaches Quadratraster (25/50/100/250 m je nach Zoom), Wert = Anzahl Stück, Farbe log-skaliert.
- Tageszeit-Filter aus Sonnenstand am Ort/zur Zeit der Sichtung (nicht aus Uhrzeit).
- Jagdjahr beginnt am 1. April.
- EXIF-Zeit ohne Zeitzone = Berliner Ortszeit; OffsetTimeOriginal wird beachtet.
- Wildkamera-Serien (gleiche Wildart, ≤ 2 min) → eine Sichtung, Anzahl = Maximum (nicht Summe).
- Revier-Foto bleibt auf dem Gerät; keine automatische Linienerkennung. Eckgriffe mit 3 Modi
  (`src/lib/overlayTransform.ts`): „Größe“ (Standard, nur skalieren), „Größe + Drehen“ (Form bleibt),
  „Frei“ (perspektivisch). „Form zurücksetzen“ = Rechteck im Bild-Seitenverhältnis. „Foto einpassen“ zoomt auf alle Ecken.
  Hinweisleiste oben ist `pointer-events-none`, damit Ecken darunter greifbar bleiben.
- Wildart nur löschbar, wenn nirgends verwendet.
- Speicher ist pro Browser-Kontext getrennt (Safari, privater Tab, In-App-Browser anderer Apps, Home-Bildschirm-Symbol).
  „Mehr“ zeigt die Zahl eigener Einträge auf diesem Gerät (`src/db/ownData.ts`); Übersicht hat „Mein Revier anzeigen“;
  nach „Testdaten löschen“ springt die Karte zurück zum eigenen Revier.
- Karte: Knopf „Revier“ (oben rechts, gelb) passt das Revier formatfüllend ein (`revierBounds`). Beim App-Start
  wird einmal aufs Revier gezoomt (`FitOnStart`), danach bleibt der zuletzt gesehene Ausschnitt. `zoomSnap 0.25`,
  damit das Einpassen nah genug ist. Ordner `sicherung/` (gitignored) für lokale GeoJSON-Sicherungen.
- Demo-Sichtungen mit erfundenem Wetter (`source: 'demo'`, `src/demo/demoSightings.ts`, Zufall mit festem Startwert).
- Offline-Kacheln (Phase 5): nur Esri/OSM/Topo, Google nie. OSM-Nutzungsregeln beachten (keine großen Downloads ab Zoom 17).

## Repository & Veröffentlichung
- GitHub: `paulberning1-oss/Jagdtagebuch` (Branch `main`)
- GitHub Pages: https://paulberning1-oss.github.io/Jagdtagebuch/ (Workflow `.github/workflows/deploy.yml`)

## Befehle
- `npm run dev` – Entwicklungsserver (http://localhost:5173)
- `npm run dev:handy` – mit HTTPS im WLAN (für iPhone-Test mit Standort)
- `npm test` – Unit-Tests (Vitest)
- `npm run build` – Typprüfung + Produktions-Build nach `dist/`

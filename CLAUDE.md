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
- [x] Phase 4: Kombinations-Assistent, Regelwerk, Statistik, ~40 Test-Ansitze
- [ ] Phase 5: PWA/Offline, Kachel-Vorabspeicherung, JSON-Export/-Import, Jagdzeiten, Feinschliff

## Laufende Erweiterung „Tagebuch, Karte und KI-Jagdassistent“ (Branch `erweiterung-ki`)
Vom Nutzer freigegebener Plan in 8 Teilschritten. Nach jedem Teilschritt: lauffähig, Commit, kurze Testanleitung,
dann auf „weiter“ warten. Vorhandenes erweitern statt neu bauen. Bestehende Einträge und Testdaten müssen weiter funktionieren.
Entscheidungen des Nutzers: KI-Modell **`claude-opus-5-5`** (als Einstellung änderbar), bisherige Einrichtungstypen
**im Kategorien-System zusammengeführt**, Reihenfolge **A → B → C → D**.

- [x] 1 Schussfeld: Sektor von–bis + Reichweite oder rundum, halbtransparent auf der Karte
- [x] 2 Eigene Objekte & Kategorien (Startliste Fluss/Bach, Graben, Agrarfläche mit Feldfrucht, Neuanpflanzung, Zaun, Dickung, Einstand, Weg, Störquelle)
- [x] 3 Anmarschwege je Sitz mit Wind-Check entlang des Wegs + Empfehlung des besseren Wegs
- [x] (Zusatz) Kompass auf der Karte, per Knopf ein-/ausblendbar, unten rechts
- [x] 4 Tagebuch erweitern (umgesetzt: `routeId`, `overrides` + `effectiveEnv`, `phases` mit Vorschlägen aus
  `src/domain/phases.ts`, `activity` 1–5, `successDetails`, `conclusion`, `mistakes`, Sichtung `ageEstimate`;
  `src/journal/ConditionsEditor.tsx`, `src/components/SpeechTextarea.tsx`). Ursprünglicher Auftrag:
  Datum, von–bis, Sitz, **gewählter Anmarschweg**; automatisch (vorausgefüllt, änderbar):
  Sonnenauf-/-untergang, Mondbeleuchtung %, Mond am Himmel, Temperatur, Wind Richtung/Stärke, Luftfeuchtigkeit,
  Luftdruck + Tendenz, Niederschlag; **jagdliche Phase/Besonderheit** (Vorschlag aus Jagdkalender, ab Schritt 5; änderbar, eigene ergänzbar);
  Anblick je Sichtung: Wildart, Anzahl, Geschlecht, **Altersschätzung (optional)**, Uhrzeit, Verhalten, Ort;
  **Wildaktivität 5 Stufen** („sehr ruhig“ … „sehr rege“); Erfolg ja/nein mit Details; **Fazit** und **Fehler/nächstes Mal anders**
  per **Spracheingabe** (Web Speech API, `de-DE`, wo unterstützt; sonst Hinweis auf iPhone-Diktierfunktion; Tippen geht immer).
  Sterne-Bewertung bleibt als Gesamteindruck. DB-Migration nur ergänzend.
- [x] 5 Jagdwissen-Seite: je Wildart Jahreskalender + Verhaltenswissen (Brunft/Blattzeit/Rauschzeit, Setz-/Frischzeit,
  Abwurf, Schieben, Fegen, Haarwechsel, Äsung je Jahreszeit, Reaktion auf Wetter/Mond/Luftdruck/Störungen, Feldfrüchte/Ernte).
  Jeder Abschnitt Status „Vorschlag – ungeprüft“, bearbeitbar, eigene Ergänzungen (auch Wissen des Opas), auf „geprüft“ setzbar.
  Daraus Jagdkalender → schlägt jagdliche Phase in Tagebuch und Assistent vor. **Jagd-/Schonzeiten: eigene Tabelle, nur der Nutzer pflegt sie, nie KI-erzeugt.**
  Umgesetzt: Seite `src/pages/KnowledgePage.tsx` (Route `#/wissen[/aktuell|wissen|kalender|jagdzeiten[/<wildart>|allg|alle]]`,
  eigener Knopf **„Aktuell“ in der unteren Leiste** (nicht mehr unter „Mehr“), Links aus Tagebuch-Formular und Assistent), Logik `src/domain/knowledge.ts`,
  Startwissen `src/domain/knowledgeDefaults.ts`, Start-Kalender `DEFAULT_PHASES` in `src/domain/phases.ts`,
  Hooks `src/knowledge/hooks.ts`, `YearBar`, `MonthDayInput`.
- [x] (Zusatz) Reiter **„Aktuell“** (`src/knowledge/CurrentTab.tsx`, Standard-Reiter von `#/wissen`): zum gewählten Tag (Heute, ‹ › Woche,
  Monatsleiste ab jetzt 12 Monate vorwärts) „Jagdzeit – frei“ je Wildart/Klasse (bis wann, noch n Tage), „Was gerade läuft“ (Phasen),
  „Demnächst“ (30 Tage: letzter Jagdtag, Jagdbeginn, Phasenbeginn), Schonzeit, „keine Jagdzeit“. Logik `seasonOverview`/`classStateText`.
  Jagdzeiten-Vorlage Niedersachsen auf ausdrücklichen Wunsch des Nutzers (`src/domain/seasonsNiedersachsen.ts`, Quelle schonzeiten.de,
  abgerufen 21.11.2026), per Knopf `NdsImport` übernommen (feste Kennungen `nds:…`, vorhandene Zeilen bleiben). Im Konto des Nutzers
  am 21.11.2026 übernommen (76 Zeilen).
- [x] 6 KI-Grundlage: Supabase Edge Function ruft Claude (offizielles Anthropic-SDK) auf; API-Schlüssel NUR als Supabase-Secret,
  nie im Frontend/Repo; nur eingeloggte Nutzer; Tageslimit (einstellbar, Start 30/Tag); Modellname als Konfiguration;
  einmalige, deutliche Datenschutz-Zustimmung in der App (Revier-/Tagebuchdaten gehen an die Anthropic API);
  Schritt-für-Schritt-Anleitung: API-Schlüssel anlegen, als Secret hinterlegen, Ausgabenlimit setzen. Prompt-Caching für den stabilen Teil.
  Umgesetzt: Edge Function `supabase/functions/ki/index.ts` (Deno, `npm:@anthropic-ai/sdk@1.12.0`, `client.beta.messages.create`
  mit `fallbacks: 'default'` außer Haiku, `effort` low/medium), Prüfung `validate.ts` (in Vitest getestet: `src/ai/ki.test.ts`).
  Secrets in Supabase: `ANTHROPIC_API_KEY`, `KI_NUTZER` (freigeschaltete Konto-Kennungen; leer = niemand), `KI_TAGESLIMIT` (30),
  `KI_MODELL`. Tageslimit: Tabelle `ki_usage` + RPC `ki_usage_today`/`ki_count_use` (`supabase/ki.sql`, security definer);
  vorher prüfen, erst nach Antwort zählen. Prompt: feste Regeln `RULES` (Cache-Marke) → stabiler `context` aus der App (Cache-Marke)
  → Aufgabe → Nachrichten. Bereitstellung: `.github/workflows/deploy-ki.yml` (Secret `SUPABASE_ACCESS_TOKEN`, `--no-verify-jwt`,
  Funktion prüft selbst per `auth.getUser`). App: `src/ai/ki.ts` (`askKi` prüft Zustimmung, `kiStatus`, Fehlercodes → Text),
  `src/ai/KiSection.tsx` unter „Mehr“ (Zustimmung `kiConsent` mit `KI_CONSENT_VERSION`, Modell `kiModel`, Verbindungstest,
  Konto-Kennung). Anleitung `docs/KI-EINRICHTUNG.md`. Zustimmung nie stellvertretend in der Vorschau erteilen (synchronisiert!).
- [x] 7 KI-Ansitzempfehlung: Kontext = Datum, Zeitfenster, Wettervorhersage, Sonne/Mond, jagdliche Phase, geprüftes Jagdwissen
  (ungeprüftes nur auf Wunsch, gekennzeichnet), Revier (Sitze mit Schussfeld, Anmarschwege, eigene Objekte, Wechsel, Flächen –
  mit Richtungen und Entfernungen), passendste Tagebucheinträge inkl. Fazit/Fehler + Statistik, bisherige Punktbewertung;
  Testdaten nur, wenn ausdrücklich eingeschaltet. Antwort: Sitz, Anmarschweg, Erwartung (Wildart, Uhrzeit), worauf achten, warum.
  Umgesetzt: Kontext `src/ai/planContext.ts` (`buildPlanContext` → `context` stabil/gecacht: Revier relativ zur Reviermitte,
  je Sitz Schussfeld + Objekte bis 400 m mit Richtung/Entfernung/„im Schussfeld“, Anmarschwege, Jagdwissen, Jagdzeiten-Tabelle,
  Statistik – OHNE Plan-Datum; `question`: Zeit, Sonne/Mond, Wetter, Phasen, Jagdzeit am Tag, Punktbewertung mit Gründen +
  Wegprüfung bei diesem Wind, 12 ähnlichste Ansitze mit Fazit/Fehlern). Antwort als Structured Output `EMPFEHLUNG_SCHEMA`
  (`supabase/functions/ki/schemas.ts`, Server legt das Format fest; App liest mit `parseEmpfehlung`). Anzeige
  `src/ai/KiRecommendation.tsx` im Assistenten (Herkunft je Aussage farbig, unbekannte Sitz-/Weg-Kennungen werden gewarnt,
  „Was wird gesendet?“ auch vor der Zustimmung). Settings `kiUnverified`, `kiDemo` (Standard aus).
- [x] (Zusatz) **Aus Foto nachtragen** (handschriftliches Tagebuch): Seite `src/journal/PhotoImportPage.tsx` (Route `#/tagebuch/foto`,
  Knopf im Tagebuch), bis 4 Fotos (2000 px JPEG) → Aufgabe `foto` der KI-Funktion (Bilder nur bei dieser Aufgabe, `validate.ts` prüft
  Typ/Größe/Base64), Antwort `TAGEBUCH_SCHEMA` (`parseTagebuch`). Logik `src/journal/photoImport.ts`: `toDrafts` (Sitz per Kennung/Name,
  fehlende Zeiten → Annahme + Hinweis, Zukunft/Datum ungültig sperrt, mögliche Doppelte nicht vorausgewählt), `draftToRecords`
  (Ansitz + Sichtungen + Erlegungen, Wind/Temperatur als `overrides`, Unzuordnbares wörtlich in `notes`, Wetter lädt aus dem Archiv).
  Fotos werden nicht gespeichert. Nutzer prüft Datum/Zeit/Sitz vor dem Übernehmen.
- [ ] 8 KI-Chat zu Revier und Daten + Rückmeldung nach dem Ansitz (zu Fazit und Fehlern, konkrete Tipps).
  System-Prompt-Regeln: nur mitgeschicktes Wissen und eigene Daten, nichts erfinden; jede Aussage kennzeichnen
  („aus deinem Tagebuch (n Ansitze)“ / „aus dem Jagdwissen“ / „Vermutung“); offen sagen, wenn Daten nicht reichen;
  keine Aussagen zu Jagd-/Schonzeiten oder Recht außer aus der eigenen Tabelle, bei Rechts-/Sicherheitsfragen auf
  Jagdgesetz, Behörde oder erfahrene Jäger verweisen; Deutsch, kurz, praxisnah, Fachsprache der Jagd.

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
- **Kombinations-Assistent:** Seite `src/pages/AssistantPage.tsx` (Reiter Empfehlung / Statistik / Regelwerk),
  Regeln + Wildarten-Profile in `src/domain/rules.ts` (`evaluateRules`, `RULES`, `SPECIES_PROFILES`),
  Mischung mit eigenen Daten + Statistik in `src/domain/assistant.ts` (`rateStands`, `outcomeOf`, `similarity`, `huntStats`),
  Wettervorhersage für den Plan in `src/assistant/usePlanConditions.ts` (Mittelpunkt der eigenen Sitze, Wind auch von Hand).
- **Testdaten:** `src/demo/` – alles mit `demo: true`, löschbar über „Mehr → Testdaten löschen“.
  `demoHunts.ts`: 42 Test-Ansitze mit bewussten Mustern (Eichenkanzel Rehwild bei Wind von vorn, Kirrungssitz Sauen bei hellem Mond, nie bei NW).
- **Deployment:** `.github/workflows/deploy.yml` → GitHub Pages. `base: './'` in `vite.config.ts`.
- **Konto + Cloud (Supabase):** `src/cloud/` – `supabase.ts` (Client, nur mit `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`),
  `auth.tsx` (`AuthGate`: Anmeldeseite E-Mail+Passwort, `useAccount`), `sync.ts` (Abgleich), `AccountSection.tsx` („Mehr → Mein Konto“).
  Schema: `supabase/schema.sql` (Tabelle `records`, Bucket `photos`, RLS je `user_id`). Wach-Ping: `.github/workflows/supabase-keepalive.yml`.

## Getroffene Entscheidungen
- **Konto in der Cloud (Supabase, Region Frankfurt)**, damit nichts verloren geht und alle Geräte denselben Stand haben.
  Offline zuerst: App schreibt nur lokal (Dexie), `sync.ts` gleicht im Hintergrund ab (Start, alle 60 s, nach Änderungen, `online`).
  Eine generische Tabelle `records (user_id, tbl, id, data jsonb, deleted, updated_at)`; `updated_at` setzt der Server.
  Änderungserkennung über Fingerabdruck je Eintrag (`syncState`, DB v4); Löschen = `deleted: true`. Konflikt: lokale Änderung gewinnt;
  ist ein Eintrag lokal noch nie abgeglichen, gewinnt die Cloud. Fotos im privaten Bucket `photos/<user_id>/<photoId>`.
  Nicht hochgeladen: Testdaten (`demo: true`) und die Geräte-Einstellung `mapView`. Meldet sich auf einem Gerät ein anderes Konto an,
  werden die lokalen Kontodaten gelöscht. Später mehrere Jäger: jeder hat sein eigenes Konto, RLS trennt die Daten (gemeinsame Reviere = späterer Schritt).
  Ohne Supabase-Konfiguration läuft die App wie früher nur lokal. Nur Koordinaten + Datum gehen an Open-Meteo.
  **Neue Dexie-Tabelle mit Nutzerdaten → in `SYNCED_TABLES` (`src/cloud/sync.ts`) eintragen**, sonst wird sie nicht gesichert.
  Neue Geräte-Einstellungen (nur dieses Gerät) → in `DEVICE_SETTINGS`. Binärdaten (Blobs) nur in `photos` – sonst Sync erweitern.
- Zielgerät **iPhone** (Safari): `navigator.storage.persist()` anfragen; Backup-Erinnerung in Phase 5 wichtig.
- Revier ist **flach** → keine Thermik-/Höhenlogik.
- Schussfeld (`src/domain/shootingField.ts`, Editor `src/map/ShootingFieldEditor.tsx`): gespeichert als `bearing` (Mitte)
  + `fieldWidth` (Breite, 360 = rundum) + `fieldRange` (m, Standard 150). Start-/Endwinkel sind nur Darstellung
  (`fromStartEnd`) → alte Sitze ohne Umbau gültig. Bei „Rundum“ kein Wind von vorn/hinten (`standFacing`).
- Kategorien (`src/domain/facilityTypes.ts`): feste Kategorien im Code (Sitze, Kirrung, Wechsel … + Startliste
  Fluss/Bach, Graben, Weg, Zaun, Neuanpflanzung, Störquelle; „Feld / Agrarfläche“ mit Feldfrucht) + eigene Kategorien
  in Tabelle `categories` (DB v5, Kennung `k_…`), zur Laufzeit per `registerCustomCategories` (in `App.tsx`) eingehängt.
  `FacilityType` ist deshalb `string`; `typeInfo` unbekannter Kategorien → „Unbekannte Kategorie“, nie Sitz.
  Eine Kategorie kann mehrere Geometrien erlauben (`kinds`). Objekte: optional eigene `color`, `crop`.
  Kategorie nur löschbar, wenn kein Objekt sie nutzt. Störquelle bis 200 m → Abzug in Regel „Ruhe“.
- Anmarschwege (`src/domain/approach.ts`): Objekt mit Kategorie `anmarsch` (versteckt im Hinzufügen-Menü, `hidden`)
  + `standId`. Angelegt aus dem Sitz-Dialog; letzter Punkt wird an den Sitz gehängt (`attachToStand`).
  Check läuft den Weg in 25-m-Schritten ab: Witterungskegel über warn/hint-Objekte und ins Schussfeld (letzte 30 m ausgenommen),
  windunabhängig: Wechsel kreuzen, durch Dickung/Einstand, durchs Schussfeld. Bewertung warn 3 / Hinweis 1, bester Weg zuerst.
  Anzeige im Wind-Panel (Abschnitt „Anmarschwege“), Kegel entlang des Wegs auf der Karte (`RouteConeLayer`).
- „Zuletzt gelöscht“ (`src/db/trash.ts`, Tabelle `trash`, DB v6, synchronisiert; Anzeige `src/pages/TrashSection.tsx` unter „Mehr“):
  **Jedes Löschen geht dorthin** – Objekte, Grenzen, Ansitze, Sichtungen, Wildarten, Kategorien, Revier-Fotos
  (`trashFacilities/Boundaries/Hunts/Sightings/Species/Category/Overlay`; Eintrag = unveränderte Kopie, gleiche ID beim Wiederherstellen).
  Zugehöriges geht mit (gleiche `batch`, `parentId`): Sitz → Anmarschwege, Ansitz → Sichtungen; kommt beim Wiederherstellen mit zurück
  (`childrenOf`). Fotos erst beim endgültigen Löschen weg. Nach 30 Tagen endgültig (`purgeOldTrash` beim App-Start).
  „Testdaten löschen“ leert auch Demo-Einträge. Neue Löschfunktionen → immer über den Papierkorb, nie direkt `delete`.
- Mehrfachauswahl in allen Listen über `src/components/Selection.tsx` (`useSelection`, `SelectButton`, `SelectToolbar` mit
  „Alles auswählen“/„Alle Beispiel-Einträge“, `SelectCheck`, `SelectActions`, `confirmTrash`): Revier-Übersicht, Tagebuch,
  Sichtungsliste, Zuletzt gelöscht (dort „Zurück“/„Endgültig“). Hook vor jedem frühen `return` aufrufen (Hook-Reihenfolge!).
- Jagdwissen (Teilschritt 5): Vorschläge (Wissen `w:<wildart|allg>:<thema>`, Kalender `p:<wildart|allg>:<name>`) stehen
  **im Code** und sind „Vorschlag – ungeprüft“. In DB v7 (`knowledge`, `calendar`, `seasons`, alle synchronisiert) stehen nur
  Änderungen und eigene Einträge; `mergeWithDefaults` legt sie über die Vorschläge (gleiche Kennung ersetzt). So kommen verbesserte
  Vorschläge bei App-Updates an, solange der Nutzer den Abschnitt nicht geändert hat. Geändert = Vorschlags-Kennung + `updatedAt`.
  „Auf Vorschlag zurücksetzen“ und Löschen gehen über den Papierkorb (`trashKnowledge/CalendarPhase/Season`).
  Abschnitt: `text` (Vorschlag, änderbar) + `addition` (eigene Ergänzung, z. B. Opa) + `source`; eigene Abschnitte `own`.
  Kalender-Phasen: `active: false` = wird nicht vorgeschlagen. `suggestPhases(time, species, calendar, names)`.
  **Jagdzeiten (`seasons`) gelten nie automatisch aus dem Code** – einzige Vorlage: Niedersachsen (vom Nutzer gewünscht, nur per Knopf).
  `Season.name` = Wildart ohne Eintrag in der Wildarten-Liste (Kennung `nds:…`/`x:…`, z. B. Steinmarder), `closed` = keine Jagdzeit.
  Mehrere Zeiträume einer Klasse = mehrere Zeilen mit gleichem `label`. Zeile = Zeitraum, in dem bejagt werden darf; außerhalb „Schonzeit laut
  deiner Tabelle“. Anzeige immer mit Hinweis „nur aus deiner Tabelle – maßgeblich ist das Landesjagdrecht“.
  Die KI (Schritt 7/8) bekommt nur geprüftes Wissen (ungeprüftes nur auf Wunsch, gekennzeichnet) und Jagdzeiten nur aus `seasons`.
- **Rückfragen nie mit `window.confirm()`**, sondern `await ask('…', { ok, cancel, danger })` aus `src/components/ConfirmDialog.tsx`
  (`ConfirmHost` in `App.tsx`). Grund: manche Umgebungen (Vorschau-Fenster der Claude-App, In-App-Browser) beantworten
  `confirm()` sofort mit „Nein“ → Löschen tat nichts. Lösch-/Verwerfen-Fragen bekommen automatisch einen roten „Löschen“-Knopf.
- Wind-Knopf = **Wind im ganzen Revier** (`src/map/RevierWindPanel.tsx`, Logik `src/domain/revierWind.ts`, Ebene `RevierWindLayer`):
  Karte zeigt das ganze Revier (Ausschnitt mit Rand für das Kürzel), rotes Kürzel (8 Richtungen) auf der Seite, aus der der
  Wind kommt, weiße Pfeile (Raster innerhalb der eigenen Grenze) in Windrichtung. Darunter alle Sitze geprüft (✓/⚠ mit Grund,
  geeignete zuerst). Sitz antippen → **Sitz-Check** (`WindPanel`, Kegel + Anmarschwege) mit „← Ganzes Revier“.
  Sitz-Check auch direkt aus dem Sitz-Dialog („Wind & Witterung prüfen“). Wind für die Reviermitte (Open-Meteo) oder von Hand.
- Tagebuch-Erweiterung: Neue Felder sind **optional** (alte Einträge gültig, keine DB-Version nötig). Handkorrekturen der
  Bedingungen in `hunt.overrides` – `env` (Messwerte) bleibt unverändert; Anzeige, Statistik und Assistent nutzen
  **`effectiveEnv(h)`** (nie `h.env` direkt für Auswertungen). Jagdliche Phasen: `suggestPhases(start, targetSpecies)` aus
  `DEFAULT_PHASES` (Verhaltenskalender, „Vorschlag – ungeprüft“, KEINE Jagd-/Schonzeiten) – wird in Schritt 5 bearbeitbar.
  Spracheingabe `SpeechTextarea`: Web Speech API `de-DE` (`webkitSpeechRecognition`), sonst Hinweis auf Tastatur-Diktat.
  Das Browser-Fenster der Claude-App blockiert das Mikrofon → dort nur der Hinweis; auf dem iPhone nach Freigabe.
  Test-Ansitze haben Aktivität/Fazit/Fehler über eigenen Zufallsstrang (`rng(4242)`), Muster von `rng(815)` unverändert.
- Kompass (`src/map/CompassRose.tsx`): Knopf in der rechten Kartenleiste, Rose unten rechts (über „Hinzufügen“).
  Karte ist eingenordet → N oben. Nadel = Blickrichtung des Handys (iOS `webkitCompassHeading` nach
  `DeviceOrientationEvent.requestPermission()` beim Tippen, Android `deviceorientationabsolute`). Setting `compassOpen` nur je Gerät.
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
- Assistent: Start 50 Punkte, Regeln geben ± Punkte (Stärke je Regel 0/0,5/1/1,5 in Setting `ruleSettings`, wird synchronisiert).
  Erfolg eines Ansitzes (`outcomeOf`): erlegt 100 · Anblick Zielwildart 70 (ab 3 Stück 80) · anderes Wild 35 · nichts 10; Sterne zu 30 %.
  Ähnlichkeit = Produkt aus Tageszeit, Wind (≤45° / ≤90°), Jahreszeit, Mondhelligkeit (abends/nachts), Drucktendenz.
  Nur Ansitze VOR dem geplanten Beginn zählen. „Bester Wind“ nur mit mind. 2 Ansitzen und Anblick-Quote > 0.
  Zielwildart im Setting `assistantSpecies` ('alle' = jede Wildart).
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

## Arbeitsweise: PC = Werkstatt, Handy = Endverbraucher
- Gebaut wird immer auf einem **Arbeits-Branch**, nie direkt auf `main` committen. Jeder Push auf `main` geht sofort aufs Handy.
- **Der Nutzer will immer die neueste Version auf dem Handy** (Entscheidung vom 14.11.2026): Nach jedem **fertigen, getesteten**
  Teilschritt bzw. jeder fertigen Änderung automatisch: Commit → Push des Arbeits-Branches → veröffentlichen mit
  `npm run veroeffentlichen` (Rückfrage per `echo j |` beantworten) → Ergebnis des GitHub-Baus prüfen und dem Nutzer melden.
  **Nie halbfertige Zwischenstände** veröffentlichen. Nur in einem Chat arbeiten (sonst Konflikte beim Push).
- Veröffentlichen = `scripts/veroeffentlichen.mjs` (auch per Doppelklick auf `Veröffentlichen.cmd`). Prüft: alles committet,
  baut auf `origin/main` auf (nur vorwärts, nie überschreiben), Tests, Build, Rückfrage j/n → `git push origin HEAD:main`.
- GitHub-Workflow bricht ohne Supabase-Secrets und bei roten Tests ab → die alte Version bleibt online.
- „Mehr“ zeigt ganz unten Stand (Bauzeit + Commit), damit man auf dem Handy sieht, ob die neue Version da ist.

## Repository & Veröffentlichung
- GitHub: `paulberning1-oss/Jagdtagebuch` (Branch `main`)
- GitHub Pages: https://paulberning1-oss.github.io/Jagdtagebuch/ (Workflow `.github/workflows/deploy.yml`)
- Supabase-Projekt: `https://isjgjssrjbzedqcoxcyu.supabase.co` (Region Frankfurt, Schema aus `supabase/schema.sql` ist eingespielt,
  „Confirm email“ aus, Konto des Nutzers angelegt). URL + Publishable Key stehen nur in der lokalen `.env` (nicht im Repo)
  bzw. als GitHub-Secrets `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. Ohne `.env` läuft die App lokal ohne Konto.
- Branches: `main` = veröffentlicht (Handy). Neuere Arbeit liegt auf `erweiterung-ki` (enthält auch `revier-knopf`,
  `cloud-konto`, Phase 4 und den Veröffentlichen-Knopf); offene PRs #1 und #2 erledigen sich mit dem Veröffentlichen.

## Befehle
- `npm run dev` – Entwicklungsserver (http://localhost:5173)
- `npm run dev:handy` – mit HTTPS im WLAN (für iPhone-Test mit Standort)
- `npm test` – Unit-Tests (Vitest)
- `npm run build` – Typprüfung + Produktions-Build nach `dist/`

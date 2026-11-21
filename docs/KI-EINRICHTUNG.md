# KI-Jagdassistent einrichten (Claude)

Die App spricht **nie direkt** mit der KI. Sie fragt deine Supabase-Funktion `ki`, und nur diese kennt den
Claude-API-Schlüssel. Der Schlüssel steht **nie** in der App, im Repository oder auf GitHub.

```
Handy-App ──(angemeldet)──▶ Supabase-Funktion „ki“ ──(API-Schlüssel)──▶ Claude-API (Anthropic)
                                 │ prüft: angemeldet? freigeschaltet? Tageslimit?
```

Dauer: etwa 20 Minuten. Du brauchst: Zugang zu Supabase, GitHub und ein Anthropic-Konto mit Zahlungsmittel.

---

## Schritt 1 – Anthropic-Konto und Guthaben

1. Öffne **https://platform.claude.com** (früher console.anthropic.com) und melde dich an bzw. lege ein Konto an.
2. Links **Billing** → Zahlungsmittel hinterlegen und **Guthaben aufladen** (z. B. 10 €).
   Tipp: **Automatisches Nachladen (Auto-reload) aus** lassen – dann kann nie mehr ausgegeben werden als aufgeladen.

## Schritt 2 – Ausgabenlimit setzen

1. **Settings → Limits** öffnen.
2. Ein **monatliches Ausgabenlimit** (Spend limit) eintragen, z. B. 10 €.
   Wird es erreicht, lehnt Anthropic weitere Anfragen ab – die App zeigt dann „kein Guthaben oder Ausgabenlimit erreicht“.

Zur Orientierung (Schätzung): ein Verbindungstest kostet weniger als 1 Cent, eine Ansitzempfehlung mit Claude Opus 5.5
grob 5–20 Cent (mit Zwischenspeicher/Cache weniger). Mit Sonnet 5.5 etwa die Hälfte, mit Haiku 5.5 deutlich weniger.

## Schritt 3 – API-Schlüssel anlegen

1. **Settings → API Keys → Create Key**, Name z. B. `Ansitzplaner`.
2. Den Schlüssel (beginnt mit `sk-ant-…`) **kopieren** – er wird nur einmal angezeigt.
3. **Nirgendwo anders einfügen** als in Schritt 5 (nicht in die App, nicht in den Chat, nicht in Dateien).

## Schritt 4 – Tabelle für das Tageslimit anlegen (Supabase)

1. **https://supabase.com/dashboard** → dein Projekt öffnen.
2. Links **SQL Editor** → **New query**.
3. Den kompletten Inhalt der Datei [`supabase/ki.sql`](../supabase/ki.sql) einfügen → **Run**.
   Es erscheint „Success. No rows returned“. (Mehrfach ausführen schadet nicht.)

## Schritt 5 – Secrets in Supabase hinterlegen

1. In Supabase links **Edge Functions** → **Secrets** (bzw. Project Settings → Edge Functions → Secrets).
2. Diese Einträge anlegen (**Name** genau so schreiben):

| Name | Wert | Pflicht |
|---|---|---|
| `ANTHROPIC_API_KEY` | der Schlüssel aus Schritt 3 | ja |
| `KI_NUTZER` | deine Konto-Kennung – steht in der App unter **Mehr → KI-Assistent** (Knopf zum Kopieren). Mehrere Konten mit Komma trennen. | ja |
| `KI_TAGESLIMIT` | Anfragen pro Tag und Konto, Standard `30` | nein |
| `KI_MODELL` | Standardmodell, Standard `claude-opus-5-5` | nein |

Ohne `KI_NUTZER` bedient die Funktion **niemanden** – so kann niemand Fremdes auf deine Kosten fragen.
Die Kennung zeigt die App, sobald du dort der Datenübertragung zugestimmt hast (Schritt 8, Punkt 1–2 einfach vorziehen).

## Schritt 6 – Funktion bereitstellen (automatisch über GitHub)

Einmalig einen Zugangsschlüssel für GitHub anlegen:

1. **https://supabase.com/dashboard/account/tokens** → **Generate new token**, Name `GitHub Deploy` → kopieren.
2. GitHub → Repository **Jagdtagebuch** → **Settings → Secrets and variables → Actions → New repository secret**:
   Name `SUPABASE_ACCESS_TOKEN`, Wert = der Token.
3. GitHub → **Actions** → links **„KI-Funktion bereitstellen“** → **Run workflow** → grüner Haken abwarten.

Danach wird die Funktion bei jeder Änderung automatisch mit dem Veröffentlichen neu bereitgestellt.

## Schritt 7 – Neue Anmeldungen sperren (empfohlen)

Supabase → **Authentication → Sign In / Providers** → **„Allow new users to sign up“ ausschalten**.
Dein Konto bleibt, aber Fremde können sich kein neues anlegen. (Für weitere Jäger später kurz wieder einschalten.)

## Schritt 8 – In der App testen

1. App neu laden → **Mehr → KI-Assistent**.
2. **Lesen und zustimmen** → Text lesen → **Zustimmen**.
3. **Verbindung testen** → nach einigen Sekunden erscheint „✓ Verbindung steht“ mit einem Satz von Claude.

### Fehlermeldungen

| Meldung in der App | Lösung |
|---|---|
| „noch nicht bereitgestellt“ | Schritt 6 (Workflow laufen lassen) |
| „Tabelle für das Tageslimit fehlt“ | Schritt 4 |
| „Konto noch nicht freigeschaltet“ | Kennung (wird angezeigt) als `KI_NUTZER` eintragen, Schritt 5 |
| „API-Schlüssel fehlt“ / „ungültig“ | `ANTHROPIC_API_KEY` prüfen, ggf. neuen Schlüssel anlegen |
| „kein Guthaben oder Ausgabenlimit erreicht“ | Guthaben/Limit bei Anthropic prüfen (Schritt 1–2) |
| „Tageslimit erreicht“ | morgen wieder, oder `KI_TAGESLIMIT` erhöhen |

## Schlüssel wechseln oder KI abschalten

- **Neuer Schlüssel:** in Anthropic neuen Schlüssel anlegen, in Supabase `ANTHROPIC_API_KEY` ersetzen, alten Schlüssel bei Anthropic löschen.
- **KI sofort abschalten:** Secret `ANTHROPIC_API_KEY` in Supabase löschen (oder den Schlüssel bei Anthropic deaktivieren).
- **Zustimmung widerrufen:** in der App unter Mehr → KI-Assistent → „Widerrufen“.

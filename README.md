# Ansitzplaner

Jagd-App fürs Handy: Revierkarte, Wildsichtungen, Ansitz-Tagebuch und ein
Kombinations-Assistent, der aus deinen Ansitzen lernt. Alle Revierdaten bleiben
auf deinem Gerät.

## Auf dem PC starten

Einmalig: [Node.js](https://nodejs.org) (Version 22 oder neuer) installieren.

```bash
git clone https://github.com/paulberning1-oss/Jagdtagebuch.git
cd Jagdtagebuch
npm install
npm run dev
```

Dann im Browser **http://localhost:5173** öffnen. Tipp: In Chrome mit `F12` →
Handy-Symbol (Geräte-Symbolleiste) die Handyansicht simulieren.

Beenden: im Terminal `Strg + C`.

## Auf dem iPhone testen (im selben WLAN)

```bash
npm run dev:handy
```

Im Terminal steht eine Zeile wie `Network: https://192.168.178.23:5173/`.
Diese Adresse in Safari auf dem iPhone öffnen. Safari warnt vor dem Zertifikat
(es ist selbst erstellt) → „Details einblenden“ → „Diese Website besuchen“.
Über https funktioniert auch „Mein Standort“.

## Veröffentlichen mit GitHub Pages (für die Nutzung im Revier)

1. Code liegt auf GitHub: https://github.com/paulberning1-oss/Jagdtagebuch (Branch `main`).
2. Auf GitHub: **Settings → Pages → Source: „GitHub Actions“** auswählen.
3. Nach jedem Push baut GitHub die App automatisch (Reiter **Actions**).
   Die Adresse lautet **https://paulberning1-oss.github.io/Jagdtagebuch/**

Auf GitHub liegt nur der Programmcode – deine Revierdaten bleiben im Browser
deines Handys.

## Konto: Daten in der Cloud sichern (Supabase)

Damit alles unter deinem Namen gespeichert ist und auf jedem Gerät gleich aussieht:

1. Auf [supabase.com](https://supabase.com) kostenlos ein Projekt anlegen (Region Frankfurt).
2. **SQL Editor → New query**: Inhalt von `supabase/schema.sql` einfügen → **Run**.
3. **Authentication → Sign In / Providers → Email**: „Confirm email“ ausschalten.
4. **Project Settings → API Keys**: „Project URL“ und „anon / publishable key“ in die `.env` eintragen
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, Vorlage: `.env.example`). Den *secret/service_role*-Key nie verwenden.
5. Für GitHub Pages dieselben zwei Werte als Repository-Secrets anlegen (Settings → Secrets and variables → Actions).
   Damit hält auch der Workflow „Supabase wach halten“ das kostenlose Projekt wach.
6. App öffnen → **Neues Konto** → Name, E-Mail, Passwort. Unter „Mehr → Mein Konto“ siehst du, ob alles gesichert ist.

Tipp: Solange nur du die App nutzen sollst, in Supabase unter **Authentication → Sign In / Providers**
„Allow new users to sign up“ ausschalten, sobald dein Konto angelegt ist.

## Reviergrenze aus einem Foto übertragen

Karte → **Hinzufügen → „Aus Foto einer Revierkarte übertragen“**. Das Foto wird
halb durchsichtig über das Luftbild gelegt. Ziehe die Ecken 1–4, bis Wege und
Waldränder passen (✥ verschiebt das ganze Bild), dann **„Grenze zeichnen“** und
die Grenzpunkte nachtippen. Das Foto bleibt auf deinem Gerät und lässt sich unter
„Kartenebene“ ein- und ausblenden.

## Google-Satellitenbild (optional)

1. In der [Google Cloud Console](https://console.cloud.google.com/) ein Projekt
   anlegen und die **Map Tiles API** aktivieren (Abrechnungskonto nötig; es gibt
   ein monatliches Freikontingent).
2. Unter **APIs & Dienste → Anmeldedaten** einen API-Schlüssel erstellen.
3. **Schlüssel einschränken** (wichtig!):
   - Anwendungseinschränkung: **Websites** → `https://paulberning1-oss.github.io/*`
     sowie `http://localhost:5173/*` eintragen
   - API-Einschränkung: nur **Map Tiles API**
4. Lokal: Datei `.env.example` nach `.env` kopieren und den Schlüssel eintragen.
   Die `.env` wird nie ins Git-Repository übernommen.
5. Für GitHub Pages: **Settings → Secrets and variables → Actions → New repository
   secret**, Name `VITE_GOOGLE_MAPS_API_KEY`, Wert = dein Schlüssel.

Hinweis: Eine reine Web-App hat keinen eigenen Server. Der Schlüssel ist daher in
der fertigen App für Fachleute auslesbar – genau deshalb muss er auf deine Adresse
beschränkt sein. Ohne Schlüssel oder ohne Internet wird die Ebene ausgeblendet.

## Tests

```bash
npm test
```

// „Veröffentlichen“: bringt den aktuellen Stand sicher auf GitHub Pages (→ Handy).
// Start: Doppelklick auf Veröffentlichen.cmd  oder  npm run veroeffentlichen
//
// Sicherheitsprüfungen – bei jedem Problem wird abgebrochen und NICHTS veröffentlicht:
//   1. Alle Änderungen sind committet
//   2. Der Stand enthält alles, was schon veröffentlicht ist (kein Überschreiben)
//   3. Tests laufen durch
//   4. Die App lässt sich bauen
//   5. Du bestätigst mit „j“
// Danach baut GitHub die App (und testet noch einmal) und stellt sie online.
import { execSync, spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'

const PAGES_URL = 'https://paulberning1-oss.github.io/Jagdtagebuch/'
const ACTIONS_URL = 'https://github.com/paulberning1-oss/Jagdtagebuch/actions'

const git = (args) => execSync(`git ${args}`, { encoding: 'utf8' }).replace(/\s+$/, '')
const ok = (msg) => console.log(`  ✔ ${msg}`)
const step = (msg) => console.log(`\n▶ ${msg}`)

function stop(msg) {
  console.log(`\n✘ ${msg}\n\nEs wurde NICHTS veröffentlicht. Auf dem Handy bleibt die bisherige Version.\n`)
  process.exit(1)
}

function run(cmd) {
  const r = spawnSync(cmd, { stdio: 'inherit', shell: true })
  return r.status === 0
}

console.log('\n=== Ansitzplaner veröffentlichen ===')

// 1. Alles gespeichert?
step('Prüfe, ob alle Änderungen gespeichert (committet) sind…')
// Auch neue, noch nie committete Dateien zählen – sonst fehlten sie in der veröffentlichten Version
const dirty = git('status --porcelain')
if (dirty) {
  stop(
    'Es gibt noch nicht committete Änderungen:\n' +
      dirty
        .split('\n')
        .map((l) => `    ${l}`)
        .join('\n') +
      '\n\nSag Claude: „Committe die Änderungen“ – danach noch einmal veröffentlichen.',
  )
}
const branch = git('branch --show-current') || '(kein Branch)'
ok(`Alles committet (Branch: ${branch})`)

// 2. Aktuell mit GitHub? Nichts überschreiben, was schon veröffentlicht ist.
step('Hole den veröffentlichten Stand von GitHub…')
if (!run('git fetch --quiet origin main')) stop('GitHub ist nicht erreichbar. Internet prüfen und noch einmal versuchen.')
try {
  git('merge-base --is-ancestor origin/main HEAD')
} catch {
  stop(
    'Auf GitHub (main) gibt es Änderungen, die in deinem Stand fehlen.\n' +
      'Sag Claude: „Hol die Änderungen von main in meinen Branch“ – danach noch einmal veröffentlichen.',
  )
}
const neu = git('log --oneline --no-decorate origin/main..HEAD')
if (!neu) {
  console.log('\nℹ Es gibt nichts Neues – dieser Stand ist bereits veröffentlicht.')
  console.log(`  Handy: ${PAGES_URL}\n`)
  process.exit(0)
}
ok('Dein Stand baut auf der veröffentlichten Version auf')

// 3. Tests
step('Führe die Tests aus…')
if (!run('npm test --silent')) stop('Mindestens ein Test schlägt fehl. Sag Claude: „Die Tests schlagen fehl, bitte reparieren.“')
ok('Alle Tests bestanden')

// 4. Bauen
step('Baue die App probehalber…')
if (!run('npm run build --silent')) stop('Die App lässt sich nicht bauen. Sag Claude: „Der Build schlägt fehl, bitte reparieren.“')
ok('Build erfolgreich')

// 5. Bestätigen
console.log('\nDiese Änderungen gehen online:')
neu.split('\n').forEach((l) => console.log(`    • ${l.replace(/^\w+ /, '')}`))
const rl = createInterface({ input: process.stdin, output: process.stdout })
const answer = (await rl.question('\nJetzt veröffentlichen? (j/n) ')).trim().toLowerCase()
rl.close()
if (answer !== 'j' && answer !== 'ja') stop('Abgebrochen.')

// 6. Hochladen: main wird nur vorwärts bewegt (nie überschrieben)
step('Lade auf GitHub hoch…')
if (!run('git push origin HEAD:main')) stop('Hochladen fehlgeschlagen (Anmeldung bei GitHub? Internet?).')
if (branch !== 'main' && branch !== '(kein Branch)') run(`git push --quiet -u origin ${branch}`)
ok('Hochgeladen')

console.log(`
✅ Fertig! GitHub baut die App jetzt (dauert ca. 2–3 Minuten).
   Fortschritt: ${ACTIONS_URL}
   Danach auf dem Handy öffnen bzw. neu laden: ${PAGES_URL}
   Unter „Mehr“ steht ganz unten der Stand der Version.
`)

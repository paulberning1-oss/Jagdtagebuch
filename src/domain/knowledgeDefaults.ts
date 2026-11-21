// Startwissen je Wildart – VORSCHLAG, UNGEPRÜFT.
// Allgemeines Wissen aus der Jagdpraxis, regional verschieden. Der Nutzer prüft, ändert und ergänzt es
// in der App („Jagdwissen“). Bewusst KEINE Jagd-/Schonzeiten und keine Rechtsaussagen.
import type { KnowledgeEntry } from './knowledge'

type Topic = [topic: string, title: string, text: string]

const SECTIONS: Record<string, Topic[]> = {
  rehwild: [
    [
      'fortpflanzung',
      'Blattzeit (Brunft)',
      'Etwa Mitte Juli bis Mitte August, Höhepunkt meist Ende Juli/Anfang August. Schwüle, warme Tage gelten als besonders lebhaft.\n' +
        'Der Bock treibt die Ricke oft im Kreis („Hexenringe“). Böcke reagieren auf Fiep- und Sprengfieplaute → Blattjagd, auch tagsüber und um die Mittagszeit.\n' +
        'Eiruhe: Das befruchtete Ei ruht bis etwa Dezember, deshalb setzt die Ricke erst im Mai/Juni.',
    ],
    [
      'jungtiere',
      'Setzzeit und Kitze',
      'Ricken setzen meist im Mai bis Anfang Juni ein bis zwei (selten drei) Kitze.\n' +
        'Kitze werden in Wiesen, Getreide oder am Waldrand abgelegt und drücken sich bei Gefahr – Gefahr durch die Mahd (Kitzrettung vor dem Mähen).\n' +
        'Die Ricke bleibt in dieser Zeit sehr standorttreu und kehrt mehrmals am Tag zum Säugen zurück.',
    ],
    [
      'geweih',
      'Gehörn: Abwurf, Schieben, Fegen',
      'Ältere Böcke werfen etwa Oktober bis Dezember ab, junge Böcke später.\n' +
        'Über den Winter schiebt das neue Gehörn im Bast.\n' +
        'Gefegt wird ab März/April (ältere Böcke zuerst), Jährlinge oft erst bis Juni. Frische Fegestellen an jungen Bäumen zeigen Einstand und Revier eines Bocks.',
    ],
    [
      'sozial',
      'Revierverhalten',
      'Böcke sind vom Frühjahr bis nach der Blattzeit territorial und verteidigen ihren Einstand. Im Winter schließt sich Rehwild auf Feldern zu Sprüngen zusammen, im Frühjahr lösen sie sich wieder auf.',
    ],
    [
      'haarwechsel',
      'Haarwechsel',
      'Frühjahr (etwa April bis Juni): ins rote Sommerhaar – kräftige, junge Stücke früher, alte oder schwache später.\n' +
        'Herbst (etwa September bis Oktober): ins graubraune Winterhaar.\n' +
        'Der Stand des Verfärbens kann beim Ansprechen helfen (Kondition, Alter).',
    ],
    [
      'aesung',
      'Äsung im Jahreslauf',
      'Rehwild ist ein „Konzentratselektierer“: Knospen, Triebe, Kräuter, wenig Gras.\n' +
        'Frühjahr: erste Kräuter, Wintergetreide, Raps, Knospen.\n' +
        'Sommer: Kräuter, Klee, Getreide, Waldränder.\n' +
        'Herbst: Eicheln, Bucheckern, Brombeere, Zwischenfrüchte.\n' +
        'Winter: Brombeere, Knospen, Raps, Wintergetreide – der Stoffwechsel ist gedrosselt, wenig Bewegung.',
    ],
    [
      'tagesrhythmus',
      'Tagesrhythmus',
      'Viele kurze Äsungsphasen über Tag und Nacht, Schwerpunkt in der Morgen- und Abenddämmerung. Bei Jagddruck stärker nachtaktiv, in ruhigen Revieren auch tagsüber draußen.',
    ],
    [
      'wetter',
      'Wetter und Wind',
      'Nach längerem Regen und bei aufklarendem Wetter oft früh auf den Flächen.\n' +
        'Bei Sturm und starkem Wind meist in Deckung und unruhig, weil Gehör und Nase gestört sind.\n' +
        'Bei großer Hitze vor allem früh morgens und spät abends aktiv.',
    ],
    [
      'mond',
      'Mond und Licht',
      'Der Einfluss ist umstritten. Viele Jäger beobachten, dass Rehwild bei hellem Mond nachts mehr äst und abends dann später oder weniger austritt. Eigene Tagebuchdaten prüfen.',
    ],
    [
      'luftdruck',
      'Luftdruck',
      'Praxiserfahrung: Vor einem Wetterumschwung (fallender Luftdruck) wird oft verstärkt geäst, bei stabilem Hochdruck ist die Aktivität gleichmäßiger. Wissenschaftlich nicht eindeutig – eigene Daten auswerten.',
    ],
    [
      'stoerungen',
      'Störungen',
      'Rehwild gewöhnt sich an regelmäßige, berechenbare Störungen (feste Wege, Landwirtschaft), aber nicht an unberechenbare (freilaufende Hunde, Leute querfeldein).\n' +
        'Nach einer Störung bleibt es oft länger im Einstand. Es schreckt (bellt) und warnt damit anderes Wild.',
    ],
    [
      'feldfruechte',
      'Feldfrüchte und Ernte',
      'Raps und Wintergetreide sind im Winter und Frühjahr wichtige Äsung.\n' +
        'Im Sommer stehen „Feldrehe“ in hohem Getreide und Mais als Einstand.\n' +
        'Nach der Ernte verlagert sich das Rehwild in Deckung, Zwischenfrüchte und an die Waldränder.',
    ],
  ],

  schwarzwild: [
    [
      'fortpflanzung',
      'Rauschzeit',
      'Hauptrauschzeit etwa November bis Januar. Je nach Mast und Bestand rauschen Bachen heute aber fast das ganze Jahr.\n' +
        'Keiler suchen dann die Rotten auf, ziehen weit umher und sind leichter anzutreffen als sonst.',
    ],
    [
      'jungtiere',
      'Frischzeit',
      'Hauptfrischzeit etwa Februar bis April, Frischlinge gibt es aber oft fast ganzjährig.\n' +
        'Die Bache baut einen Wurfkessel und sondert sich kurz von der Rotte ab. Frischlinge tragen ihre Streifen etwa drei bis vier Monate.\n' +
        'Beim Ansprechen besonders sorgfältig prüfen, ob eine Bache Frischlinge führt.',
    ],
    [
      'sozial',
      'Rotte und Einstand',
      'Die Rotte führt eine erfahrene Leitbache. Überläufer-Keiler verlassen sie, alte Keiler leben meist allein.\n' +
        'Einstände sind ruhige Dickungen, Schilf, Maisschläge im Sommer. Sauen wechseln oft über weite Strecken.',
    ],
    [
      'haarwechsel',
      'Schwarte im Jahreslauf',
      'Im Frühjahr wird die dichte Winterschwarte mit Unterwolle abgelegt, im Herbst wächst sie wieder. In der Sommerschwarte wirken Sauen schmaler und dunkler.',
    ],
    [
      'aesung',
      'Fraß im Jahreslauf',
      'Allesfresser.\n' +
        'Frühjahr: Wurzeln, Engerlinge, Mäuse – Wühlschäden im Grünland.\n' +
        'Sommer: Getreide in der Milchreife, Raps, später Mais.\n' +
        'Herbst: Eicheln und Bucheckern (Mast), Mais.\n' +
        'Winter: Mast, Kirrung, Grünland.',
    ],
    [
      'tagesrhythmus',
      'Tagesrhythmus',
      'Überwiegend nachtaktiv. Sauen ziehen meist erst bei Dunkelheit aus dem Einstand, in ruhigen Revieren auch in der Dämmerung. Im Sommer im Feld manchmal auch tagsüber.',
    ],
    [
      'wetter',
      'Wetter und Wind',
      'Sauen haben eine sehr feine Nase – der Wind ist entscheidend, auch beim Anmarsch.\n' +
        'Bei Regen und Wind oft rege, weil Geräusche gedämpft sind.\n' +
        'Neuschnee zeigt Fährten (Abfährten), bei hohem Schnee und Frost ziehen sie weniger.',
    ],
    [
      'mond',
      'Mond und Licht',
      'Heller Mond gibt dem Jäger Sicht: Mondansitz an Kirrung, Suhle oder Feld ist eine klassische Jagdart. Bei Vollmond kommen Sauen nach vielen Beobachtungen eher später in der Nacht, bei bedecktem Himmel oft früher.',
    ],
    [
      'luftdruck',
      'Luftdruck',
      'Praxiserfahrung: vor Wetterumschwüngen und bei fallendem Druck oft rege. Die Erfahrungen sind widersprüchlich – eigene Daten auswerten.',
    ],
    [
      'stoerungen',
      'Störungen und Jagddruck',
      'Sehr lernfähig: Sauen meiden Orte mit Jagddruck schnell und verschieben ihre Zeiten. Deshalb Sitze wechseln, die Kirrung nicht „überjagen“ und Anmarsch und Wind genau beachten.',
    ],
    [
      'feldfruechte',
      'Feldfrüchte und Ernte',
      'Weizen und Hafer in der Milchreife (etwa Juni/Juli), dann Mais ab Juli als Einstand und Fraß bis zur Ernte (etwa September/Oktober).\n' +
        'Schadensschwerpunkte am Feldrand bejagen. Nach der Maisernte ziehen die Sauen wieder in den Wald.',
    ],
  ],

  rotwild: [
    [
      'fortpflanzung',
      'Brunft',
      'Etwa Mitte September bis Mitte Oktober, Höhepunkt meist Ende September. Hirsche melden (röhren), der Platzhirsch hält ein Kahlwildrudel.\n' +
        'Kalte, klare Nächte gelten als besonders lebhaft. Brunftplätze werden oft über Jahre genutzt.',
    ],
    ['jungtiere', 'Setzzeit', 'Etwa Ende Mai bis Juni setzt das Alttier ein Kalb. Das Kalb wird in den ersten Tagen abgelegt, dann folgt es dem Alttier.'],
    [
      'geweih',
      'Geweih: Abwurf, Kolben, Fegen',
      'Abwurf etwa Februar bis April (ältere Hirsche zuerst).\n' + 'Danach wächst das neue Geweih im Bast (Kolbenzeit) bis in den Sommer.\n' + 'Gefegt wird etwa Juli bis August.',
    ],
    [
      'haarwechsel',
      'Haarwechsel',
      'Etwa Mai/Juni ins rötliche Sommerhaar, September/Oktober ins graubraune Winterhaar. Hirsche tragen zur Brunft eine Mähne.',
    ],
    [
      'aesung',
      'Äsung im Jahreslauf',
      'Mischäser: Gräser, Kräuter, Triebe, Rinde.\n' + 'Frühjahr/Sommer: Grünland, Kräuter, Getreide.\n' + 'Herbst: Mast, Brombeere.\n' + 'Winter: Knospen, Brombeere, Rinde (Schälschäden).',
    ],
    [
      'tagesrhythmus',
      'Tagesrhythmus',
      'In ruhigen Gebieten auch tagaktiv. Bei Jagddruck fast nur in der Dämmerung und nachts auf offenen Flächen. Rotwild lebt in Rudeln und nutzt große Streifgebiete.',
    ],
    ['stoerungen', 'Störungen', 'Sehr vorsichtig und großräumig. Rotwild meidet gestörte Flächen oft für lange Zeit und reagiert stark auf Witterung des Menschen.'],
  ],

  damwild: [
    [
      'fortpflanzung',
      'Brunft',
      'Etwa Mitte Oktober bis Mitte November. Der Hirsch „rölpst“ (grunzt) auf traditionellen Brunftplätzen und schlägt Brunftkuhlen.',
    ],
    ['jungtiere', 'Setzzeit', 'Etwa Juni, meist ein Kalb.'],
    [
      'geweih',
      'Geweih: Abwurf, Fegen',
      'Ältere Hirsche werfen etwa April/Mai ab, gefegt wird etwa August bis September. Ab einem gewissen Alter tragen Hirsche ein Schaufelgeweih.',
    ],
    ['haarwechsel', 'Haarwechsel', 'Im Sommer gefleckte, rotbraune Decke, im Herbst dunklere, graubraune Winterdecke mit kaum sichtbaren Flecken.'],
    ['aesung', 'Äsung', 'Überwiegend Gräser und Kräuter, gern auf Feldern und Wiesen. Im Herbst Mast, im Winter auch Knospen und Brombeere.'],
    ['tagesrhythmus', 'Tagesrhythmus', 'Lebt in Rudeln. Bei Ruhe auch tagsüber auf offenen Flächen, bei Jagddruck dämmerungs- und nachtaktiv.'],
  ],

  fuchs: [
    ['fortpflanzung', 'Ranz', 'Etwa Januar bis Februar. Füchse bellen nachts, Rüden sind auch tagsüber unterwegs – gute Zeit für die Lockjagd.'],
    [
      'jungtiere',
      'Jungfüchse',
      'Die Fähe wölft etwa im März/April im Bau. Ab etwa Mai spielen die Jungfüchse vor dem Bau, ab Sommer streifen sie umher.',
    ],
    ['haarwechsel', 'Balg', 'Der Winterbalg ist etwa ab Ende November bis Februar am besten. Im Sommer wirkt der Fuchs dünn und struppig.'],
    [
      'aesung',
      'Nahrung',
      'Vor allem Mäuse, dazu Aas, Insekten, Obst, Abfälle, Niederwild. Nach der Mahd oder Ernte mausen Füchse gern auf den frischen Flächen.',
    ],
    ['tagesrhythmus', 'Tagesrhythmus', 'Dämmerungs- und nachtaktiv. Im Winter, bei Schnee und in der Ranz auch tagsüber.'],
    [
      'wetter',
      'Wetter, Mond, Schnee',
      'Ruhige, kalte Nächte mit Schnee und Mond geben gute Sicht. Bei Sturm und Regen sind Füchse weniger unterwegs. Mauspfeifen und Hasenklage wirken besonders in der Ranz.',
    ],
  ],

  dachs: [
    [
      'fortpflanzung',
      'Paarung und Junge',
      'Paarung vor allem im Frühjahr, mit Keimruhe. Die Jungen kommen etwa Februar/März im Bau zur Welt und erscheinen ab etwa April/Mai vor dem Bau.',
    ],
    ['winterruhe', 'Winterruhe', 'Bei Frost hält der Dachs Winterruhe im Bau, an milden Tagen ist er auch im Winter draußen.'],
    ['aesung', 'Nahrung', 'Regenwürmer, Insekten, Larven, Mäuse, Obst, Mais. Typisch sind kleine Gruben (Stechen) im Grünland.'],
    ['tagesrhythmus', 'Tagesrhythmus', 'Nachtaktiv, oft erst bei völliger Dunkelheit. Milde, feuchte Nächte (viele Regenwürmer) sind günstig.'],
  ],

  waschbaer: [
    ['fortpflanzung', 'Paarung und Junge', 'Paarung etwa Januar bis März, Junge etwa April/Mai, meist in Baumhöhlen oder Gebäuden.'],
    ['aesung', 'Nahrung', 'Allesfresser: Amphibien, Insekten, Vogelgelege, Obst, Mais, Abfälle. Oft an Gewässern und Bachläufen.'],
    ['tagesrhythmus', 'Tagesrhythmus', 'Nachtaktiv. Bei starkem Frost Winterruhe, an milden Tagen aktiv.'],
  ],

  hase: [
    ['fortpflanzung', 'Rammelzeit', 'Etwa Januar bis März (teils bis in den Sommer). Häsinnen setzen mehrmals im Jahr Junghasen.'],
    [
      'jungtiere',
      'Junghasen',
      'Junghasen kommen behaart und sehend zur Welt und liegen einzeln in der Sasse. Nasskaltes Wetter im Frühjahr kostet viele Junghasen.',
    ],
    ['tagesrhythmus', 'Tagesrhythmus', 'Dämmerungs- und nachtaktiv. Tagsüber drückt sich der Hase in der Sasse.'],
    ['aesung', 'Äsung', 'Kräuter, Gräser, Wintergetreide, Raps, im Winter auch Rinde und Knospen.'],
  ],

  wildgaense: [
    [
      'zug',
      'Zug und Rast',
      'Rastende Gänse etwa Oktober bis Februar/März. Sie schlafen auf Gewässern und fliegen morgens zu den Äsungsflächen, abends zurück.',
    ],
    ['aesung', 'Äsung', 'Wintergetreide, Raps, Grünland, Maisstoppel und Ernterückstände.'],
    ['wetter', 'Wind und Wetter', 'Gänse landen gegen den Wind. Bei Wind und schlechter Sicht fliegen sie niedriger.'],
  ],

  wildenten: [
    ['fortpflanzung', 'Balz und Brut', 'Balz im Herbst und Winter, Brut etwa März bis Juni.'],
    ['mauser', 'Mauser', 'Im Sommer mausern die Erpel und sind einige Wochen flugunfähig (Schlichtkleid).'],
    ['tagesrhythmus', 'Strich', 'Morgen- und Abendstrich zwischen Ruhegewässern und Äsungsflächen (Stoppeln, Getreide).'],
  ],
}

/** Allgemeines Wissen (für alle Wildarten) */
const GENERAL: Topic[] = [
  [
    'wind',
    'Wind ist das Wichtigste',
    'Schalenwild verlässt sich vor allem auf die Nase. Der Sitz muss so gewählt sein, dass der Wind vom Wild zum Jäger steht, und der Anmarsch darf die Witterung nicht über Wechsel, Einstand oder Äsungsfläche tragen.\n' +
      'Umlaufender Wind (sehr schwach, wechselnd) ist besonders ungünstig.',
  ],
  [
    'mond',
    'Mond',
    'Heller Mond verbessert die Sicht für den Jäger nachts. Ob das Wild seine Zeiten nach dem Mond richtet, ist umstritten – die eigenen Tagebuchdaten sind hier aussagekräftiger als Faustregeln.',
  ],
  [
    'luftdruck',
    'Luftdruck und Wetterumschwung',
    'Verbreitete Praxiserfahrung: Vor einem Wetterumschwung ist das Wild oft rege. Auch nach längerem Regen oder Sturm tritt es häufig früh aus. Eigene Daten prüfen.',
  ],
  [
    'jagddruck',
    'Jagddruck',
    'Je häufiger ein Sitz bejagt wird, desto vorsichtiger wird das Wild dort. Sitze abwechseln, Ruhezonen lassen und nicht bei falschem Wind ansitzen.',
  ],
  [
    'landwirtschaft',
    'Landwirtschaft im Jahreslauf',
    'Mahd (etwa Mai/Juni), Getreideernte (etwa Juli/August), Rapsaussaat (etwa August/September) und Maisernte (etwa September/Oktober) verändern Deckung und Äsung schlagartig. Das Wild verlagert dann seine Einstände und Wechsel.',
  ],
]

const build = (speciesId: string | null, list: Topic[]): KnowledgeEntry[] =>
  list.map(([topic, title, text], i) => ({ id: `w:${speciesId ?? 'allg'}:${topic}`, speciesId, title, text, status: 'ungeprueft', order: i }))

export const DEFAULT_KNOWLEDGE: KnowledgeEntry[] = [
  ...build(null, GENERAL),
  ...Object.entries(SECTIONS).flatMap(([speciesId, list]) => build(speciesId, list)),
]

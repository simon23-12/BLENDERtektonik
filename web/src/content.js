// Inhalte der Annotationen und Phasen (Deutsch, Erdkunde Sek. I/II).
// Blockbild schematisch nach dem Vorbild Ostpazifischer Rücken – Nazca-Platte – Peru-Chile-Graben – Anden.

export const GROUPS = [
  { label: 'Aufbau der Erde', ids: ['kern_innen', 'kern_aussen', 'mantel', 'kruste', 'lithosphaere', 'asthenosphaere'] },
  { label: 'Platten & Grenzen', ids: ['platten', 'ruecken', 'magnetstreifen', 'transform', 'graben', 'subduktion', 'erdbeben'] },
  { label: 'Vulkanismus & Antrieb', ids: ['vulkan', 'magma', 'hotspot', 'kontinent', 'konvektion'] },
];

const G = 15; // ab hier ist das Blockbild zu sehen

export const ANNOTATIONS = [
  {
    id: 'kern_innen',
    title: 'Innerer Kern',
    kicker: 'fest · Eisen und Nickel',
    color: '#ffe08a',
    parts: ['^Kern_innen'],
    markers: [{ anchor: 'ANCHOR_Kern_innen', label: 'Innerer Kern', to: G }],
    focus: { anchor: 'ANCHOR_Globus_Mitte', distance: 70, moving: true },
    text:
      'Im Zentrum der Erde ist es etwa so heiß wie an der Sonnenoberfläche. Trotzdem ist der innere Kern fest: Der enorme Druck presst das Eisen-Nickel-Gemisch zusammen, sodass es nicht schmelzen kann.',
    facts: [
      ['Tiefe', '5.150–6.371 km'],
      ['Radius', '≈ 1.220 km'],
      ['Temperatur', '≈ 5.000–6.000 °C'],
      ['Zustand', 'fest'],
    ],
  },
  {
    id: 'kern_aussen',
    title: 'Äußerer Kern',
    kicker: 'flüssig · Geodynamo',
    color: '#ff9a3c',
    parts: ['^Kern_aussen'],
    markers: [{ anchor: 'ANCHOR_Kern_aussen', label: 'Äußerer Kern', to: G }],
    focus: { anchor: 'ANCHOR_Kern_aussen', distance: 50, moving: true },
    text:
      'Flüssiges Eisen strömt hier in großen Wirbeln. Diese Strömungen erzeugen das Magnetfeld der Erde. Es hat sich in der Erdgeschichte immer wieder umgepolt – die Spuren davon findet man im Ozeanboden (Magnetstreifen).',
    facts: [
      ['Tiefe', '2.900–5.150 km'],
      ['Material', 'flüssiges Eisen, Nickel'],
      ['Temperatur', '≈ 4.000–5.000 °C'],
      ['Bedeutung', 'erzeugt das Erdmagnetfeld'],
    ],
  },
  {
    id: 'mantel',
    title: 'Erdmantel',
    kicker: 'fest – aber fließfähig',
    color: '#e07b3c',
    parts: ['^Mantel_oben_Globus', '^Mantel_unten_Globus', '^Mantel_Globus'],
    markers: [{ anchor: 'ANCHOR_Mantel', label: 'Mantel', to: G }],
    focus: { anchor: 'ANCHOR_Mantel', distance: 50, moving: true },
    text:
      'Der Mantel macht über 80 % des Erdvolumens aus. Sein Gestein (Peridotit) ist fest, verhält sich aber über Millionen Jahre wie eine extrem zähe Masse: Heißes Gestein steigt langsam auf, kühleres sinkt ab (Konvektion).',
    facts: [
      ['Tiefe', '≈ 35–2.900 km'],
      ['Anteil am Volumen', '≈ 84 %'],
      ['Gestein', 'Peridotit'],
      ['Fließgeschwindigkeit', 'wenige cm pro Jahr'],
    ],
  },
  {
    id: 'kruste',
    title: 'Erdkruste',
    kicker: 'die dünne Haut',
    color: '#c7d0d9',
    parts: ['^Kruste_Globus', '^Ozean_Globus', '^Gradnetz'],
    markers: [{ anchor: 'ANCHOR_Kruste_Globus', label: 'Kruste', to: G }],
    focus: { anchor: 'ANCHOR_Lith_Globus', distance: 6, moving: true },
    text:
      'Im richtigen Maßstab ist die Kruste dünner als die Schale eines Apfels. Ozeanische Kruste besteht aus dunklem, schwerem Basalt, kontinentale Kruste aus leichterem Granit und Gneis – deshalb „schwimmen“ die Kontinente höher.',
    facts: [
      ['ozeanisch', '5–10 km, Basalt, ≈ 3,0 g/cm³'],
      ['kontinental', '30–70 km, Granit, ≈ 2,7 g/cm³'],
      ['Anteil am Radius', '< 1 %'],
    ],
  },
  {
    id: 'lithosphaere',
    title: 'Lithosphäre',
    kicker: 'starre Gesteinshülle · die Platten',
    color: '#a07a5c',
    parts: ['^Lithosphaere_Globus', '^Lith_', '^Kontinent_Lith'],
    markers: [
      { anchor: 'ANCHOR_Lith_Globus', label: 'Lithosphäre', to: G },
      { anchor: 'ANCHOR_Lith_Ozean', label: 'Lithosphäre', from: G },
    ],
    focus: { anchor: 'ANCHOR_Lith_Ozean', distance: 45 },
    text:
      'Kruste und oberster Mantel bilden zusammen die starre Lithosphäre. Sie ist in etwa ein Dutzend große und viele kleine Platten zerbrochen. Ozeanische Lithosphäre ist am Rücken dünn und wird beim Abkühlen dicker und schwerer.',
    facts: [
      ['Dicke', '≈ 10 km (am Rücken) bis 100 km, unter Kontinenten bis 200 km'],
      ['große Platten', '7 (plus viele kleine)'],
      ['Verhalten', 'starr, bricht'],
    ],
  },
  {
    id: 'asthenosphaere',
    title: 'Asthenosphäre',
    kicker: 'zähplastische Gleitschicht',
    color: '#f0a050',
    parts: ['^Asthenosphaere_Globus', '^Mantel_Block'],
    markers: [
      { anchor: 'ANCHOR_Asth_Globus', label: 'Asthenosphäre', to: G },
      { anchor: 'ANCHOR_Asthenosphaere', label: 'Asthenosphäre', from: G },
    ],
    focus: { anchor: 'ANCHOR_Asthenosphaere', distance: 70 },
    text:
      'Unter der Lithosphäre ist der Mantel so heiß, dass ein kleiner Teil des Gesteins geschmolzen ist. Er ist dadurch weicher und plastisch verformbar – auf dieser Schicht gleiten die Lithosphärenplatten.',
    facts: [
      ['Tiefe', '≈ 100–250 km'],
      ['Schmelzanteil', 'wenige Prozent'],
      ['Temperatur', '≈ 1.300 °C und mehr'],
    ],
  },
  {
    id: 'platten',
    title: 'Drei Platten',
    kicker: 'Pazifik · Nazca · Südamerika',
    color: '#e6eef8',
    parts: ['^Pfeil_Platte'],
    markers: [
      { anchor: 'ANCHOR_Platte_Pazifik', label: 'Pazifische Platte', from: G },
      { anchor: 'ANCHOR_Platte_Nazca', label: 'Nazca-Platte', from: G },
      { anchor: 'ANCHOR_Platte_Suedamerika', label: 'Südamerikanische Platte', from: G },
    ],
    focus: { anchor: 'ANCHOR_Block_Mitte', distance: 190 },
    live: 'time',
    text:
      'Die Pfeile zeigen, wohin sich die Platten bewegen: Am Rücken weichen Pazifische und Nazca-Platte auseinander, die Nazca-Platte schiebt sich gegen Südamerika und taucht unter den Kontinent. Die Südamerikanische Platte driftet dabei nach Westen.',
    facts: [
      ['Geschwindigkeit hier', '5 cm/Jahr je Seite'],
      ['zum Vergleich', 'so schnell wachsen Fingernägel'],
      ['in 1 Mio. Jahren', '50 km'],
    ],
  },
  {
    id: 'ruecken',
    title: 'Mittelozeanischer Rücken',
    kicker: 'divergente Plattengrenze',
    color: '#ff8a3d',
    parts: ['^Magma_Ruecken'],
    markers: [{ anchor: 'ANCHOR_Ruecken', label: 'Mittelozean. Rücken', from: G }],
    focus: { anchor: 'ANCHOR_Ruecken', distance: 40 },
    text:
      'Hier weichen zwei Platten auseinander. Heißes Mantelgestein steigt auf, schmilzt teilweise, und das Magma füllt die Spalte: Es erstarrt zu neuem Ozeanboden aus Basalt. Die Rücken bilden ein Gebirge von über 60.000 km Länge – größtenteils unter Wasser.',
    facts: [
      ['Plattengrenze', 'divergent (auseinander)'],
      ['Neue Kruste', 'Basalt aus Magma'],
      ['Länge weltweit', '> 60.000 km'],
      ['Beispiel', 'Ostpazifischer Rücken, Mittelatlantischer Rücken'],
    ],
  },
  {
    id: 'magnetstreifen',
    title: 'Magnetstreifen',
    kicker: 'Beweis für die Ozeanbodenspreizung',
    color: '#e0582b',
    parts: ['^Kruste_'],
    markers: [{ anchor: 'ANCHOR_Magnetstreifen', label: 'Magnetstreifen', from: G }],
    focus: { anchor: 'ANCHOR_Magnetstreifen', distance: 40 },
    live: 'mag',
    text:
      'Wenn Basalt abkühlt, richten sich magnetische Minerale nach dem Erdmagnetfeld aus und „frieren“ dessen Richtung ein. Weil sich das Feld immer wieder umpolt, entsteht ein Streifenmuster, das auf beiden Seiten des Rückens spiegelgleich ist. ' +
      'Orange = normale Polung wie heute, hell = umgekehrte Polung. Die Abfolge folgt hier der echten Zeitskala der letzten Millionen Jahre.',
    facts: [
      ['Letzte Umpolung', 'vor ≈ 780.000 Jahren'],
      ['Entdeckt', '1963 (Vine & Matthews)'],
      ['Bedeutung', 'Ozeanboden wird am Rücken neu gebildet'],
    ],
  },
  {
    id: 'transform',
    title: 'Transformstörung',
    kicker: 'konservative Plattengrenze',
    color: '#9fd4ff',
    parts: [],
    markers: [{ anchor: 'ANCHOR_Transform', label: 'Transformstörung', from: G }],
    focus: { anchor: 'ANCHOR_Transform', distance: 35 },
    text:
      'Der Rücken ist in Abschnitte versetzt. Dazwischen gleiten die Platten aneinander vorbei – Kruste wird weder gebildet noch vernichtet. Die Reibung entlädt sich in flachen Erdbeben. An Land bekanntestes Beispiel ist die San-Andreas-Verwerfung in Kalifornien.',
    facts: [
      ['Bewegung', 'seitlich aneinander vorbei'],
      ['Erdbeben', 'flach, oft stark'],
      ['Beispiel', 'San-Andreas-Verwerfung'],
    ],
  },
  {
    id: 'graben',
    title: 'Tiefseegraben',
    kicker: 'Peru-Chile-Graben',
    color: '#4db3ff',
    parts: [],
    markers: [{ anchor: 'ANCHOR_Graben', label: 'Tiefseegraben', from: G }],
    focus: { anchor: 'ANCHOR_Graben', distance: 40 },
    text:
      'Wo die ozeanische Platte abknickt und abtaucht, entsteht eine lange, schmale Rinne – die tiefsten Stellen der Ozeane. Der Peru-Chile-Graben vor Südamerika ist rund 5.900 km lang.',
    facts: [
      ['Tiefe Peru-Chile-Graben', 'bis ≈ 8.000 m'],
      ['tiefster Graben', 'Marianengraben, ≈ 11.000 m'],
      ['Relief hier', '5-fach überhöht'],
    ],
  },
  {
    id: 'subduktion',
    title: 'Subduktionszone',
    kicker: 'konvergente Plattengrenze',
    color: '#c38b62',
    parts: ['^Lith_Nazca'],
    markers: [{ anchor: 'ANCHOR_Subduktion', label: 'Subduktion', from: G }],
    focus: { anchor: 'ANCHOR_Subduktion', distance: 50 },
    live: 'trench',
    text:
      'Die alte, abgekühlte ozeanische Platte ist schwerer als die kontinentale und taucht unter sie ab. Ihr Gewicht zieht die ganze Platte hinterher („Plattenzug“) – heute gilt das als wichtigster Antrieb der Plattenbewegung. In der Tiefe wird sie aufgeheizt und vom Mantel aufgenommen.',
    facts: [
      ['Plattengrenze', 'konvergent (aufeinander zu)'],
      ['Grund', 'ozeanische Platte ist dichter'],
      ['Folgen', 'Graben, Erdbeben, Vulkane, Gebirge'],
    ],
  },
  {
    id: 'erdbeben',
    title: 'Erdbebenherde',
    kicker: 'Wadati-Benioff-Zone',
    color: '#ffd166',
    parts: [],
    markers: [{ anchor: 'ANCHOR_Benioff', label: 'Erdbebenherde', from: 34 }],
    focus: { anchor: 'ANCHOR_Benioff', distance: 45 },
    live: 'quakes',
    text:
      'Die Platten verhaken sich, Spannung baut sich auf und entlädt sich ruckartig. Die Erdbebenherde (Hypozentren) liegen entlang der abtauchenden Platte – je weiter landeinwärts, desto tiefer. Über dem Herd an der Oberfläche liegt das Epizentrum.',
    facts: [
      ['Herdtiefe', 'bis ≈ 700 km'],
      ['stärkstes gemessenes Beben', 'Chile 1960, Magnitude 9,5'],
      ['Folge am Meer', 'Tsunamis'],
    ],
  },
  {
    id: 'vulkan',
    title: 'Vulkan der Anden',
    kicker: 'Schichtvulkan',
    color: '#ff5a1f',
    parts: ['^Vulkan', '^Schlot', '^Magmakammer'],
    markers: [{ anchor: 'ANCHOR_Vulkan', label: 'Vulkan', from: G }],
    focus: { anchor: 'ANCHOR_Vulkan', distance: 30 },
    text:
      'Das zähflüssige, gasreiche Magma der Subduktionszonen staut sich in der Magmakammer und bricht explosiv aus. Asche und Lava lagern sich Schicht für Schicht ab: Es entstehen steile Kegel wie der Cotopaxi in Ecuador. Das typische Gestein heißt nach den Anden „Andesit“.',
    facts: [
      ['Typ', 'Schichtvulkan (Stratovulkan)'],
      ['Ausbrüche', 'explosiv, Aschewolken'],
      ['Beispiel', 'Cotopaxi, 5.897 m'],
    ],
  },
  {
    id: 'magma',
    title: 'Schmelze aus der Tiefe',
    kicker: 'Wie Magma entsteht',
    color: '#ff9b4a',
    parts: [],
    markers: [
      { anchor: 'ANCHOR_Magma_Schmelze', label: 'Schmelze ≈ 100 km', from: 34 },
      { anchor: 'ANCHOR_Magmakammer', label: 'Magmakammer', from: G },
    ],
    focus: { anchor: 'ANCHOR_Magma_Schmelze', distance: 35 },
    text:
      'Die abtauchende Platte bringt Wasser mit in die Tiefe. In etwa 100 km Tiefe wird es frei und senkt den Schmelzpunkt des heißen Mantelgesteins darüber. Es entstehen Schmelztröpfchen, die leichter sind als ihre Umgebung und aufsteigen.',
    facts: [
      ['Tiefe', '≈ 100 km'],
      ['Auslöser', 'Wasser aus der Platte'],
      ['Weg', 'aufsteigen → Magmakammer → Vulkan'],
    ],
  },
  {
    id: 'hotspot',
    title: 'Hotspot & Inselkette',
    kicker: 'Mantelplume',
    color: '#ff7a2a',
    parts: ['^Plume', '^Insel_'],
    markers: [
      { anchor: 'ANCHOR_Hotspot', label: 'Mantelplume', from: G },
      { anchor: 'ANCHOR_Inselkette', label: 'Inselkette', from: G },
    ],
    focus: { anchor: 'ANCHOR_Inselkette', distance: 45 },
    text:
      'Ein Schlot aus heißem Mantelgestein steigt mitten unter einer Platte auf und bleibt ortsfest. Die Platte wandert darüber hinweg: Über dem Hotspot wächst ein Vulkan, wird weggetragen, erlischt, verwittert und sinkt ab – dahinter entsteht der nächste. So bilden sich Inselketten wie Hawaii, deren Alter in Bewegungsrichtung zunimmt.',
    facts: [
      ['Beispiel', 'Hawaii-Emperor-Kette'],
      ['jüngste Insel', 'direkt über dem Hotspot'],
      ['zeigt', 'Richtung und Tempo der Platte'],
    ],
  },
  {
    id: 'kontinent',
    title: 'Kontinent & Anden',
    kicker: 'kontinentale Kruste',
    color: '#b89c86',
    parts: ['^Kontinent_Kruste', '^Kontinent_Oberflaeche'],
    markers: [
      { anchor: 'ANCHOR_Kontinent', label: 'Kontinentale Kruste', from: G },
      { anchor: 'ANCHOR_Anden', label: 'Anden', from: G },
    ],
    focus: { anchor: 'ANCHOR_Anden', distance: 45 },
    text:
      'Kontinentale Kruste ist zu leicht, um abzutauchen. Wo die ozeanische Platte gegen sie drückt, wird sie gestaucht und verdickt; zusammen mit dem Vulkanismus entsteht ein Gebirge. Unter den Anden ist die Kruste bis zu 70 km dick.',
    facts: [
      ['Anden', '≈ 7.000 km lang'],
      ['höchster Berg', 'Aconcagua, 6.961 m'],
      ['Krustendicke', 'bis ≈ 70 km'],
    ],
  },
  {
    id: 'konvektion',
    title: 'Konvektionsströme',
    kicker: 'Wärme aus dem Erdinneren',
    color: '#ffb36b',
    parts: ['^Pfeil_Konvektion'],
    markers: [
      { anchor: 'ANCHOR_Konvektion', label: 'Konvektion', from: G },
      { anchor: 'ANCHOR_Konvektion_A', label: 'Konvektion', from: G },
    ],
    focus: { anchor: 'ANCHOR_Konvektion', distance: 90 },
    text:
      'Das Erdinnere gibt Wärme ab. Im Mantel steigt heißes, leichteres Gestein auf, kühlt unter der Lithosphäre ab und sinkt wieder – ganz langsam, wie in einem Topf mit zähem Brei. Diese Wärmeströmung hält die Plattenbewegung in Gang; den größten Anteil haben aber die abtauchenden Platten selbst (Plattenzug).',
    facts: [
      ['Geschwindigkeit', 'wenige cm pro Jahr'],
      ['Wärmequelle', 'Restwärme + radioaktiver Zerfall'],
      ['Hier', 'schematisch, zwei Zellen'],
    ],
  },
];

export const PHASES = {
  schalen: {
    title: 'Der Schalenbau der Erde',
    text: 'Unter der dünnen Kruste liegen Mantel, äußerer und innerer Kern. Je tiefer, desto heißer und desto höher der Druck.',
  },
  lithosphaere: {
    title: 'Lithosphäre und Asthenosphäre',
    text: 'Ganz außen bildet die starre Lithosphäre eine Schale aus Platten. Darunter liegt die zähplastische Asthenosphäre, auf der die Platten gleiten.',
  },
  konvektion: {
    title: 'Wärme bewegt den Mantel',
    text: 'Im Blockbild sieht man die Schichten im Schnitt. Im Mantel steigt heißes Gestein langsam auf und kühleres sinkt ab – Konvektion.',
  },
  spreizung: {
    title: 'Der Ozeanboden wächst',
    text: 'Am Mittelozeanischen Rücken weichen die Platten auseinander. Magma steigt auf und erstarrt zu neuem Ozeanboden – mit eingefrorenen Magnetstreifen, die nach außen wandern.',
  },
  subduktion: {
    title: 'Abtauchen unter den Kontinent',
    text: 'Die ozeanische Nazca-Platte ist schwerer als der Kontinent. Am Tiefseegraben taucht sie schräg in den Mantel ab – entlang der Platte entstehen Erdbeben.',
  },
  vulkan: {
    title: 'Vulkane an der Subduktionszone',
    text: 'In rund 100 km Tiefe setzt die abtauchende Platte Wasser frei, der Mantel darüber schmilzt. Das Magma steigt in eine Kammer auf und bricht explosiv aus.',
  },
  erdbeben: {
    title: 'Ein Starkbeben',
    text: 'Die Platten haben sich verhakt. Plötzlich entlädt sich die Spannung: Vom Erdbebenherd in der Tiefe breiten sich Erdbebenwellen aus, über ihm liegt das Epizentrum.',
  },
  hotspot: {
    title: 'Hotspot: Inseln am Fließband',
    text: 'Ein ortsfester Mantelplume brennt sich durch die Pazifische Platte. Sie wandert darüber: Vulkaninseln entstehen, driften weg, erlöschen und versinken.',
  },
  transform: {
    title: 'Aneinander vorbei',
    text: 'Zwischen den versetzten Rückenabschnitten gleiten die Platten an einer Transformstörung seitlich aneinander vorbei. Es bebt – aber es entsteht und verschwindet keine Kruste.',
  },
};

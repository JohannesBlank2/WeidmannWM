'use strict';

// Nachgebaute Fragen aus dem 1%-Quiz. Kein Video mehr: Die Spielleitung deckt
// die Bausteine nacheinander auf, liest die Frage vor und startet den Timer.
// correctAnswer steuert die automatische Auszahlung beim Aufdecken der Lösung.

const DEFAULT_TIMER_SECONDS = 30;

const PERCENT_QUIZ_QUESTIONS = [
  {
    id: 'percent-25',
    label: '25% Frage',
    percent: 25,
    multiplier: 2,
    visual: 'diagram',
    answerType: 'choice',
    options: [
      { value: '1', label: '1' },
      { value: '2', label: '2' },
      { value: '3', label: '3' },
      { value: '4', label: '4' },
      { value: '5', label: '5' },
    ],
    correctAnswer: '3',
    questionText:
      'Die Ziffern 1, 2, 3, 4 und 5 sollen in dieses Diagramm eingetragen werden. ' +
      'Sie sollen sowohl senkrecht als auch waagerecht die Summe 9 ergeben. ' +
      'Welche Ziffer gehört dann in den blauen Kreis in der Mitte?',
    subQuestionText: '',
    explanation:
      '1 + 2 + 3 + 4 + 5 = 15. Waagerecht und senkrecht ergeben zusammen 9 + 9 = 18. ' +
      'Die Mitte zählt doppelt: 18 - 15 = 3.',
    revealSteps: ['Fragetext', 'Diagramm'],
    adminTitle: '25% Frage · Ziffern-Diagramm',
    playerInstruction: 'Welche Ziffer gehört in den blauen Kreis in der Mitte?',
  },
  {
    id: 'percent-10',
    label: '10% Frage',
    percent: 10,
    multiplier: 3,
    visual: 'note',
    answerType: 'choice',
    options: [
      { value: 'A', label: 'Anke' },
      { value: 'B', label: 'Bert' },
      { value: 'C', label: 'Dora' },
      { value: 'D', label: 'Leon' },
      { value: 'E', label: 'Tina' },
      { value: 'F', label: 'Mark' },
    ],
    correctAnswer: 'B',
    questionText:
      'Ein Kommissar befragt sechs Verdächtige zu einem Tathergang: ' +
      'Anke, Bert, Dora, Leon, Tina und Mark. ' +
      'Eine Zeugin steckt ihm heimlich einen Zettel zu. ' +
      'Erst nach einigem Hin und Her kann er ihre Nachricht entschlüsseln.',
    subQuestionText: 'Über welche Person erfährt er, dass sie nicht die Wahrheit sagte?',
    explanation:
      'Auf dem Zettel stehen die Farben GELB und ROT. Aus den Buchstaben von ' +
      'GELB + ROT lässt sich "BERT LOG" legen.',
    revealSteps: ['Einleitung + Zettel', 'Frage + Antworten'],
    adminTitle: '10% Frage · Kommissar',
    playerInstruction: 'Über welche Person erfährt er, dass sie nicht die Wahrheit sagte?',
  },
  {
    id: 'percent-1',
    label: '1% Frage',
    percent: 1,
    multiplier: 4,
    visual: 'photo',
    imageSrc: '/assets/games/prozentquiz/wuerfel.jpg',
    answerType: 'number',
    options: [],
    correctAnswer: '26',
    questionText:
      'Wie jeder Spieler weiß, hat ein Würfel insgesamt 21 Augen. ' +
      'Wie viele Augen sind demnach auf diesem Bild nicht zu sehen?',
    subQuestionText: '',
    explanation:
      'Würfel links: 14 Augen nicht sichtbar. Würfel rechts: 10 Augen nicht sichtbar. ' +
      'Dazu die 2 Augen hinter der Sonnenbrille: 14 + 10 + 2 = 26.',
    // Lösungs-Einblendungen wie im Original: einzeln vom Admin aufdeckbar.
    // x/y in Prozent der Bildfläche.
    solutionSteps: [
      {
        id: 'die-left',
        adminLabel: 'Würfel links',
        lines: ['sichtbar: 7 Augen', 'nicht sichtbar: 14 Augen'],
        x: 22,
        y: 74,
      },
      {
        id: 'die-right',
        adminLabel: 'Würfel rechts',
        lines: ['sichtbar: 11 Augen', 'nicht sichtbar: 10 Augen'],
        x: 66,
        y: 90,
      },
      {
        id: 'eyes',
        adminLabel: 'Sonnenbrille',
        lines: ['nicht sichtbar: 2 Augen'],
        x: 57,
        y: 5,
      },
    ],
    revealSteps: ['Fragetext', 'Würfelbild'],
    adminTitle: '1% Frage · Würfel',
    playerInstruction: 'Wie viele Augen sind auf dem Bild nicht zu sehen?',
  },
];

module.exports = {
  DEFAULT_TIMER_SECONDS,
  PERCENT_QUIZ_QUESTIONS,
};

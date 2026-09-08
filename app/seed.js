// estudar – Startinhalt: Deck „Probe (löschbar)" mit 20 Karten pt-BR auf
// A2-Niveau. Prüfmaterial, damit die App ohne Tippen getestet werden kann.

export const PROBE_DECK_ID = 'deck-probe';
export const PROBE_DECK_NAME = 'Probe (löschbar)';

const VOCAB = [
  ['der Schlaf', 'o sono', 'O sono também é treino.'],
  ['die Reise', 'a viagem', 'A viagem foi longa, mas valeu a pena.'],
  ['das Frühstück', 'o café da manhã', 'Tomei café da manhã bem cedo.'],
  ['die Rechnung (im Restaurant)', 'a conta', 'A conta, por favor!'],
  ['der Bahnhof', 'a estação', 'A estação fica perto daqui.'],
  ['das Wochenende', 'o fim de semana', 'No fim de semana eu descanso.'],
  ['die Erkältung', 'o resfriado', 'Peguei um resfriado na semana passada.'],
  ['das Geschenk', 'o presente', 'Comprei um presente para ela.'],
  ['der Nachbar', 'o vizinho', 'Meu vizinho é muito simpático.'],
  ['die Prüfung', 'a prova', 'A prova de ontem foi difícil.'],
  ['vergessen', 'esquecer', 'Esqueci a chave em casa.'],
  ['anfangen', 'começar', 'Começamos a aula às oito.'],
  ['sich beeilen', 'se apressar', 'Precisamos nos apressar.'],
  ['beschäftigt', 'ocupado', 'Hoje estou muito ocupado.'],
  ['gestern Abend', 'ontem à noite', 'Ontem à noite jantei fora.'],
];

const CLOZE = [
  ['Ontem eu {{c1::fui}} ao mercado.', 'ir · pretérito perfeito · eu'],
  ['Nós {{c1::comemos}} feijoada no domingo.', 'comer · pretérito perfeito · nós'],
  ['Ela {{c1::fez}} um bolo para a festa.', 'fazer · pretérito perfeito · ela'],
  ['Vocês {{c1::chegaram}} atrasados ontem?', 'chegar · pretérito perfeito · vocês'],
  ['Eu não {{c1::tive}} tempo para estudar.', 'ter · pretérito perfeito · eu'],
];

/** Deck und Karten des Probe-Decks. Kennungen sind fest, damit ein Import sie erkennt. */
export function probeDeck(now = new Date()) {
  const ts = now.toISOString();
  const deck = { id: PROBE_DECK_ID, name: PROBE_DECK_NAME, createdAt: ts, updatedAt: ts };
  const base = { deckId: PROBE_DECK_ID, hint: '', tags: ['probe'], updatedAt: ts, suspended: false };
  // createdAt steigt je Karte um eine Millisekunde: neue Karten kommen in Eingabereihenfolge dran.
  const stamp = (i) => new Date(now.getTime() + i).toISOString();
  const cards = [];
  VOCAB.forEach(([front, back, example], i) => {
    const id = `probe-v${String(i + 1).padStart(2, '0')}`;
    cards.push({ ...base, id, noteId: id, type: 'vocab', direction: 'de-pt', front, back, example, createdAt: stamp(i) });
  });
  CLOZE.forEach(([front, hint], i) => {
    const id = `probe-c${String(i + 1).padStart(2, '0')}`;
    cards.push({ ...base, id, noteId: id, type: 'cloze', front, back: '', example: '', hint, tags: ['probe', 'preterito-perfeito'], createdAt: stamp(VOCAB.length + i) });
  });
  return { deck, cards };
}

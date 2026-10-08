// The marks the sheets name equipment, loops, cables and conduit by. A mark
// is a label, the same in every language, never a number.

export const MARK = {
  panel: 'A',
  display: 'B',
  frontCamera: 'C',
  pay: 'D',
  backCamera: 'E',
  intercom: 'F',
  scanner: 'G',
  L1: 'L1',
  L2: 'L2',
  L3: 'L3',
  L4: 'L4',
  L5: 'L5',
  N1: 'N1',
  N2: 'N2',
  N3: 'N3',
  N4: 'N4',
  N5: 'N5',
  N6: 'N6',
  N7: 'N7',
  N8: 'N8',
  S1: 'S1',
  S2: 'S2',
  K1: 'K1',
  K2: 'K2',
  W1: 'W1',
  W2: 'W2',
  W3: 'W3',
  W4: 'W4',
  C1: 'C1',
  C2: 'C2',
  C3: 'C3',
  C4: 'C4',
  C5: 'C5',
};

/** What a mark looks like: one capital letter, with a digit after it or not. The entry types 2A and 2B are marks too. */
export const MARK_SHAPE = /^(?:[A-Z]\d?|2[AB])$/;

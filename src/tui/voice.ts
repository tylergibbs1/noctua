export const voice = {
  principles: {
    tone:       'confident but not arrogant',
    warmth:     'warm but not casual',
    clarity:    'clear but not simplistic',
  },

  casing: 'lowercase',
  casingExceptions: [
    // proper nouns and acronyms keep their case
  ],

  punctuation: {
    periods:     'never',
    exclamation: 'never',
    ellipsis:    'sparingly',
    emDash:      'preferred',
    colon:       'for labels',
  },

  numbers: {
    currency: '$0.00',
    counts:   'digits',
    percent:  '0.0%',
    dates:    'YYYY-MM-DD',
  },

  headlines: {
    style:    'short, declarative',
    avoid:    ['questions', 'exclamation marks'],
  },

  body: {
    style:    'concrete over abstract',
    approach: 'break dense info into pieces',
    register: 'use the operator\'s language, not marketing speak',
  },

  banned: [
    'revolutionary', 'game-changing', 'cutting-edge',
    'powerful', 'best-in-class', 'next-gen',
    'just', 'simply', 'obviously', 'basically',
    'please note that', 'it should be noted',
    'in order to', 'as a matter of fact',
    'successfully', 'was able to', 'went ahead and',
  ],
} as const;

export type Voice = typeof voice;

export const theme = {
  bg: {
    primary:   '#1F1D1B',
    muted:     '#2A2725',
    subtle:    '#3D3835',
  },

  fg: {
    primary:   '#F5F0EA',
    secondary: '#A69B91',
    muted:     '#7A6F66',
    disabled:  '#4A4541',
  },

  accent: {
    primary:   '#C65D3D',  // terracotta
    secondary: '#3D9A8E',  // muted teal
    tertiary:  '#8B7355',  // warm brown
  },

  border: {
    standard:  '#3D3835',
    muted:     '#2A2725',
    focus:     '#C65D3D',
  },
} as const;

export type Theme = typeof theme;

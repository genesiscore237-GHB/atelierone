export const themeModes = ['light', 'dark', 'system', 'pos', 'high-contrast', 'sepia', 'corporate'] as const;
export type ThemeMode = typeof themeModes[number];

export function oklch(l: number, c: number, h: number): string {
  return `oklch(${l} ${c} ${h})`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '');
  if (clean.length !== 3 && clean.length !== 6) return null;
  const full = clean.length === 3
    ? clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2]
    : clean;
  const num = parseInt(full, 16);
  if (isNaN(num)) return null;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

const lightnessScale = [0.95, 0.90, 0.82, 0.72, 0.62, 0.55, 0.47, 0.38, 0.28, 0.20, 0.13] as const;
const shadeKeys = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

function defaultChromaCurve(baseChroma: number): number[] {
  const factors = [0.65, 0.72, 0.82, 0.92, 1, 1, 0.95, 0.85, 0.72, 0.60, 0.50];
  return factors.map(f => Math.round(baseChroma * f * 100) / 100);
}

function generatePalette(hue: number, baseChroma: number, chromaCurve?: number[]): Record<number, string> {
  const chromas = chromaCurve ?? defaultChromaCurve(baseChroma);
  const palette: Record<number, string> = {};
  shadeKeys.forEach((key, i) => {
    palette[key] = oklch(lightnessScale[i], chromas[i], hue);
  });
  return palette;
}

export const palettes = {
  primary: generatePalette(250, 0.20),
  secondary: generatePalette(80, 0.28),
  success: generatePalette(150, 0.25),
  warning: generatePalette(90, 0.25),
  danger: generatePalette(30, 0.30),
  info: generatePalette(220, 0.20),
  neutral: generatePalette(0, 0, [0.003, 0.004, 0.005, 0.006, 0.007, 0.008, 0.008, 0.007, 0.006, 0.005, 0.004]),
  accent: generatePalette(45, 0.18),
};

export type Palette = typeof palettes;

export const primaryPalette = palettes.primary;
export const secondaryPalette = palettes.secondary;
export const successPalette = palettes.success;
export const warningPalette = palettes.warning;
export const dangerPalette = palettes.danger;
export const infoPalette = palettes.info;
export const neutralPalette = palettes.neutral;

export type ThemeTokens = {
  background: string;
  foreground: string;
  card: string;
  'card-foreground': string;
  popover: string;
  'popover-foreground': string;
  primary: string;
  'primary-foreground': string;
  secondary: string;
  'secondary-foreground': string;
  muted: string;
  'muted-foreground': string;
  accent: string;
  'accent-foreground': string;
  destructive: string;
  'destructive-foreground': string;
  success: string;
  'success-foreground': string;
  warning: string;
  'warning-foreground': string;
  info: string;
  'info-foreground': string;
  border: string;
  input: string;
  ring: string;
  radius: string;
};

export const lightTokens: ThemeTokens = {
  background: 'oklch(0.97 0.005 260)',
  foreground: 'oklch(0.12 0.01 260)',
  card: 'oklch(1 0 0)',
  'card-foreground': 'oklch(0.12 0.01 260)',
  popover: 'oklch(1 0 0)',
  'popover-foreground': 'oklch(0.12 0.01 260)',
  primary: 'oklch(0.42 0.18 250)',
  'primary-foreground': 'oklch(1 0 0)',
  secondary: 'oklch(0.50 0.28 80)',
  'secondary-foreground': 'oklch(1 0 0)',
  muted: 'oklch(0.92 0.01 260)',
  'muted-foreground': 'oklch(0.50 0.02 260)',
  accent: 'oklch(0.93 0.04 45)',
  'accent-foreground': 'oklch(0.29 0.12 45)',
  destructive: 'oklch(0.55 0.30 30)',
  'destructive-foreground': 'oklch(1 0 0)',
  success: 'oklch(0.50 0.25 150)',
  'success-foreground': 'oklch(1 0 0)',
  warning: 'oklch(0.55 0.25 90)',
  'warning-foreground': 'oklch(0.16 0.02 90)',
  info: 'oklch(0.55 0.20 220)',
  'info-foreground': 'oklch(1 0 0)',
  border: 'oklch(0.88 0 0)',
  input: 'oklch(0.94 0 0)',
  ring: 'oklch(0.60 0.18 250)',
  radius: '0.75rem',
};

export const darkTokens: ThemeTokens = {
  background: 'oklch(0.13 0.015 260)',
  foreground: 'oklch(0.95 0.005 260)',
  card: 'oklch(0.17 0.015 260)',
  'card-foreground': 'oklch(0.95 0.005 260)',
  popover: 'oklch(0.17 0.015 260)',
  'popover-foreground': 'oklch(0.95 0.005 260)',
  primary: 'oklch(0.60 0.18 250)',
  'primary-foreground': 'oklch(0.10 0 0)',
  secondary: 'oklch(0.60 0.25 80)',
  'secondary-foreground': 'oklch(0.10 0 0)',
  muted: 'oklch(0.22 0.015 260)',
  'muted-foreground': 'oklch(0.65 0.02 260)',
  accent: 'oklch(0.29 0.12 45)',
  'accent-foreground': 'oklch(0.93 0.04 45)',
  destructive: 'oklch(0.62 0.24 30)',
  'destructive-foreground': 'oklch(1 0 0)',
  success: 'oklch(0.62 0.22 150)',
  'success-foreground': 'oklch(1 0 0)',
  warning: 'oklch(0.62 0.22 90)',
  'warning-foreground': 'oklch(0.16 0.02 90)',
  info: 'oklch(0.62 0.17 220)',
  'info-foreground': 'oklch(1 0 0)',
  border: 'oklch(0.40 0 0)',
  input: 'oklch(0.30 0 0)',
  ring: 'oklch(0.60 0.18 250)',
  radius: '0.75rem',
};

export const posTokens: ThemeTokens = {
  background: 'oklch(1 0 0)',
  foreground: 'oklch(0 0 0)',
  card: 'oklch(0.98 0 0)',
  'card-foreground': 'oklch(0 0 0)',
  popover: 'oklch(1 0 0)',
  'popover-foreground': 'oklch(0 0 0)',
  primary: 'oklch(0.34 0.15 250)',
  'primary-foreground': 'oklch(1 0 0)',
  secondary: 'oklch(0.42 0.25 80)',
  'secondary-foreground': 'oklch(1 0 0)',
  muted: 'oklch(0.95 0 0)',
  'muted-foreground': 'oklch(0.50 0 0)',
  accent: 'oklch(0.93 0.04 45)',
  'accent-foreground': 'oklch(0.29 0.12 45)',
  destructive: 'oklch(0.55 0.30 30)',
  'destructive-foreground': 'oklch(1 0 0)',
  success: 'oklch(0.50 0.25 150)',
  'success-foreground': 'oklch(1 0 0)',
  warning: 'oklch(0.55 0.25 90)',
  'warning-foreground': 'oklch(0.16 0.02 90)',
  info: 'oklch(0.55 0.20 220)',
  'info-foreground': 'oklch(1 0 0)',
  border: 'oklch(0.90 0 0)',
  input: 'oklch(0.90 0 0)',
  ring: 'oklch(0.60 0.18 250)',
  radius: '0.375rem',
};

export const highContrastTokens: ThemeTokens = {
  background: 'oklch(1 0 0)',
  foreground: 'oklch(0 0 0)',
  card: 'oklch(1 0 0)',
  'card-foreground': 'oklch(0 0 0)',
  popover: 'oklch(1 0 0)',
  'popover-foreground': 'oklch(0 0 0)',
  primary: 'oklch(0 0 0)',
  'primary-foreground': 'oklch(1 0 0)',
  secondary: 'oklch(0.30 0 0)',
  'secondary-foreground': 'oklch(1 0 0)',
  muted: 'oklch(0.85 0 0)',
  'muted-foreground': 'oklch(0 0 0)',
  accent: 'oklch(0.90 0 0)',
  'accent-foreground': 'oklch(0 0 0)',
  destructive: 'oklch(0 0 0)',
  'destructive-foreground': 'oklch(1 0 0)',
  success: 'oklch(0.35 0.20 150)',
  'success-foreground': 'oklch(1 0 0)',
  warning: 'oklch(0 0 0)',
  'warning-foreground': 'oklch(1 0 0)',
  info: 'oklch(0 0 0)',
  'info-foreground': 'oklch(1 0 0)',
  border: 'oklch(0 0 0)',
  input: 'oklch(0 0 0)',
  ring: 'oklch(0 0 0)',
  radius: '0',
};

export const sepiaTokens: ThemeTokens = {
  background: 'oklch(0.88 0.06 75)',
  foreground: 'oklch(0.25 0.04 60)',
  card: 'oklch(0.85 0.05 75)',
  'card-foreground': 'oklch(0.25 0.04 60)',
  popover: 'oklch(0.85 0.05 75)',
  'popover-foreground': 'oklch(0.25 0.04 60)',
  primary: 'oklch(0.35 0.08 60)',
  'primary-foreground': 'oklch(0.90 0.05 75)',
  secondary: 'oklch(0.35 0.08 60)',
  'secondary-foreground': 'oklch(0.90 0.05 75)',
  muted: 'oklch(0.82 0.04 75)',
  'muted-foreground': 'oklch(0.40 0.04 60)',
  accent: 'oklch(0.80 0.04 75)',
  'accent-foreground': 'oklch(0.25 0.04 60)',
  destructive: 'oklch(0.35 0.20 30)',
  'destructive-foreground': 'oklch(1 0 0)',
  success: 'oklch(0.35 0.15 150)',
  'success-foreground': 'oklch(0.90 0.05 75)',
  warning: 'oklch(0.40 0.15 90)',
  'warning-foreground': 'oklch(0.10 0 0)',
  info: 'oklch(0.35 0.10 220)',
  'info-foreground': 'oklch(0.90 0.05 75)',
  border: 'oklch(0.75 0.05 70)',
  input: 'oklch(0.75 0.05 70)',
  ring: 'oklch(0.45 0.06 60)',
  radius: '0.5rem',
};

export const financeTokens = {
  income: 'oklch(0.50 0.25 150)',
  expense: 'oklch(0.55 0.30 30)',
  pending: 'oklch(0.55 0.25 90)',
  transfer: 'oklch(0.55 0.20 220)',
};

export function getThemeColors(mode: ThemeMode) {
  switch (mode) {
    case 'light': return lightTokens;
    case 'dark': return darkTokens;
    case 'pos': return posTokens;
    case 'high-contrast': return highContrastTokens;
    case 'sepia': return sepiaTokens;
    case 'corporate': return lightTokens; // corporate overrides happen at CSS level
    case 'system': return lightTokens;
  }
}

// Design tokens for the whole app. One place for the palette so the day (focus) and night
// (sleep) surfaces stay in contrast: a calm light canvas with white cards by day, deep
// midnight cards with moonlight accents for everything that belongs to sleep.
//
// Numbers that move (timers, points, progress) use `fontVariant: ['tabular-nums']` so digits
// do not jitter as they tick.

export const tokens = {
  color: {
    background: '#F7F8FA',
    backgroundTop: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceMuted: '#F2F4F7',
    surfaceSunken: '#EAEEF3',
    ink: '#101828',
    inkSecondary: '#344054',
    muted: '#667085',
    subtle: '#98A2B3',
    line: '#E7EAF0',
    lineStrong: '#D5DBE5',

    // Day accent — deep emerald.
    accent: '#0F766E',
    accentStrong: '#115E59',
    accentSoft: '#E7F4F1',
    accentLine: '#C3E6E0',
    onAccent: '#FFFFFF',

    // Booster accent — indigo, kept apart from the base emerald in the dual gauge.
    indigo: '#5B5BD6',
    indigoSoft: '#EEEEFB',
    indigoLine: '#D9D9F6',

    // Night surfaces for sleep.
    night: '#0F172A',
    nightRaised: '#172033',
    nightElevated: '#1E293B',
    nightLine: '#2A3752',
    nightInk: '#F8FAFC',
    nightMuted: '#94A3B8',
    nightSubtle: '#64748B',
    moon: '#C7D2FE',
    moonStrong: '#A5B4FC',
    moonSoft: 'rgba(199, 210, 254, 0.14)',
    moonLine: 'rgba(199, 210, 254, 0.28)',

    success: '#087443',
    successSoft: '#ECFDF3',
    warning: '#B54708',
    warningSoft: '#FFFAEB',
    danger: '#B42318',
    dangerSoft: '#FEF3F2',
  },
  space: { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 44 },
  radius: { xs: 8, sm: 12, md: 16, lg: 22, xl: 28, pill: 999 },
  shadow: {
    card: {
      shadowColor: '#101828',
      shadowOpacity: 0.06,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
    },
    soft: {
      shadowColor: '#101828',
      shadowOpacity: 0.04,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 1,
    },
    lift: {
      shadowColor: '#0F172A',
      shadowOpacity: 0.22,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
      elevation: 6,
    },
  },
  type: {
    display: { fontSize: 52, fontWeight: '800' as const, letterSpacing: -1 },
    title: { fontSize: 26, fontWeight: '800' as const, letterSpacing: -0.4 },
    heading: { fontSize: 18, fontWeight: '700' as const, letterSpacing: -0.2 },
    body: { fontSize: 15, lineHeight: 23 },
    label: { fontSize: 13, fontWeight: '600' as const },
    caption: { fontSize: 12, lineHeight: 18 },
  },
  numeric: { fontVariant: ['tabular-nums' as const] },
} as const;

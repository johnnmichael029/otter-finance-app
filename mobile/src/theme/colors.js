// ─────────────────────────────────────────────────────────────────────────────
//  OTTER Finance — Color Schema
//  Brand: Magenta (#E91E8C)
//  Same structure as Sandigan — lightTheme / darkTheme objects
// ─────────────────────────────────────────────────────────────────────────────

export const lightTheme = {
    background: '#fdf0f8',                   // --theme-main-bg       (soft pink-white)
    surface: '#ffffff',                      // --theme-surface
    surfaceAlt: '#f7e6f3',                   // --theme-surface-alt
    cardBackground: '#ffffff',               // --theme-card-bg
    text: '#0a0a0a',                         // --theme-content-text
    textMuted: '#6b2f52',                    // --theme-content-text-secondary
    border: 'rgba(233, 30, 140, 0.12)',      // --theme-content-border
    inputBackground: '#fdf4fa',              // --theme-input-bg
    inputBorder: '#f0b8d8',                  // --theme-input-border

    // ── Brand ────────────────────────────────────────────────────────────────
    primary: '#E91E8C',                      // --brand-primary (magenta)
    primaryAccent: '#FF4DB5',                // --brand-accent  (lighter magenta)
    primaryButton: '#E91E8C',
    buttonText: '#ffffff',

    // ── Semantic ─────────────────────────────────────────────────────────────
    income: '#16a34a',                       // Green - income
    expense: '#dc2626',                      // Red - expense
    debt: '#d97706',                         // Amber - debt
    danger: '#ef4444',
    success: '#22c55e',
    warning: '#f59e0b',
    info: '#3b82f6',

    // ── Gradients (used in LinearGradient) ───────────────────────────────────
    gradientStart: '#E91E8C',
    gradientEnd: '#B0146A',
};

export const darkTheme = {
    background: '#0d0d1a',                   // --theme-main-bg       (deep navy-black)
    surface: '#12122a',                      // --theme-surface
    surfaceAlt: '#1a1a35',                   // --theme-surface-alt
    cardBackground: '#12122a',               // --theme-card-bg
    text: '#f5f0ff',                         // --theme-content-text
    textMuted: '#c084a8',                    // --theme-content-text-secondary
    border: 'rgba(233, 30, 140, 0.15)',      // --theme-content-border
    inputBackground: '#1a1a35',              // --theme-input-bg
    inputBorder: 'rgba(233, 30, 140, 0.2)', // --theme-input-border

    // ── Brand ────────────────────────────────────────────────────────────────
    primary: '#E91E8C',                      // --brand-primary (magenta)
    primaryAccent: '#FF4DB5',                // --brand-accent  (lighter magenta)
    primaryButton: '#E91E8C',
    buttonText: '#FAFAFA',

    // ── Semantic ─────────────────────────────────────────────────────────────
    income: '#22c55e',                       // Green - income
    expense: '#ef4444',                      // Red - expense
    debt: '#f59e0b',                         // Amber - debt
    danger: '#ef4444',
    success: '#22c55e',
    warning: '#f59e0b',
    info: '#3b82f6',

    // ── Gradients (used in LinearGradient) ───────────────────────────────────
    gradientStart: '#E91E8C',
    gradientEnd: '#7b0f4e',
};

// Map default 'colors' to darkTheme so imports in screens keep working smoothly without refactoring to useTheme everywhere immediately.
export const colors = {
    ...darkTheme,
    surface: '#12122a',
    surfaceAlt: '#1a1a35'
};

export const spacing = {
    xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48,
};

export const radius = {
    sm: 8, md: 12, lg: 16, xl: 24, full: 999,
};

export const typography = {
    h1: { fontSize: 28, fontWeight: '700', color: colors.text },
    h2: { fontSize: 22, fontWeight: '700', color: colors.text },
    h3: { fontSize: 18, fontWeight: '600', color: colors.text },
    body: { fontSize: 14, fontWeight: '400', color: colors.text },
    bodyMuted: { fontSize: 14, fontWeight: '400', color: colors.textMuted },
    caption: { fontSize: 12, fontWeight: '400', color: colors.textMuted },
    label: { fontSize: 12, fontWeight: '600', color: colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase' },
};

export const shadow = {
    sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 },
    md: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
    glow: { shadowColor: '#E91E8C', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
};

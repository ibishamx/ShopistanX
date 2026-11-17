import { z } from 'zod';

/** The COD order form shown on product pages and at checkout. */
export const codFormSchema = z.object({
  enabled: z.boolean(),
  headline: z.string().trim().min(1).max(80),
  subheadline: z.string().trim().max(160),
  buttonText: z.string().trim().min(1).max(40),
  showEmail: z.boolean(),
  showNotes: z.boolean(),
});
export type CodFormConfig = z.infer<typeof codFormSchema>;

export const DEFAULT_COD_FORM: CodFormConfig = {
  enabled: true,
  headline: 'Order now — Cash on Delivery',
  subheadline: 'Pay when your parcel arrives. No advance payment.',
  buttonText: 'Place order',
  showEmail: false,
  showNotes: true,
};

export const themeSchema = z.object({
  announcement: z.string().trim().max(120),
  heroHeading: z.string().trim().min(1).max(80),
  heroSubheading: z.string().trim().max(200),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #0f766e'),
});
export type ThemeConfig = z.infer<typeof themeSchema>;

export const DEFAULT_THEME: ThemeConfig = {
  announcement: 'Cash on Delivery all over Pakistan',
  heroHeading: 'Welcome to our store',
  heroSubheading: 'Quality products, delivered to your door.',
  accentColor: '#0f766e',
};

export function readCodForm(value: unknown): CodFormConfig {
  return { ...DEFAULT_COD_FORM, ...(typeof value === 'object' && value ? value : {}) } as CodFormConfig;
}

export function readTheme(value: unknown): ThemeConfig {
  return { ...DEFAULT_THEME, ...(typeof value === 'object' && value ? value : {}) } as ThemeConfig;
}

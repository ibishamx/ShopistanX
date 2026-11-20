import { z } from 'zod';

/** The COD order form shown on product pages and at checkout. */
export const codFormSchema = z.object({
  enabled: z.boolean(),
  headline: z.string().trim().min(1).max(80),
  subheadline: z.string().trim().max(160),
  buttonText: z.string().trim().min(1).max(40),
  showEmail: z.boolean(),
  showNotes: z.boolean(),
  /** Ask for a nearby landmark (required when shown). Riders use it to find addresses. */
  showLandmark: z.boolean(),
});
export type CodFormConfig = z.infer<typeof codFormSchema>;

export const DEFAULT_COD_FORM: CodFormConfig = {
  enabled: true,
  headline: 'Order now — Cash on Delivery',
  subheadline: 'Pay when your parcel arrives. No advance payment.',
  buttonText: 'Place order',
  showEmail: false,
  showNotes: true,
  showLandmark: true,
};

const optionalUrl = z.union([z.literal(''), z.string().trim().url().max(2000)]);
const line = (max: number) => z.string().trim().max(max);

export const TRUST_ICONS = ['truck', 'cash', 'return', 'shield', 'whatsapp', 'box'] as const;

export const themeSchema = z.object({
  // Header
  logoUrl: optionalUrl,
  /** Messages for the scrolling bar above the header, one per entry. */
  announcements: z.array(line(120).min(1)).max(6),
  // Homepage hero
  heroImageUrl: optionalUrl,
  heroHeading: line(80).min(1),
  heroSubheading: line(200),
  heroButtonText: line(30).min(1),
  // Homepage sections
  showRunway: z.boolean(),
  runwayHeading: line(60),
  marqueeLarge: z.array(line(40).min(1)).max(8),
  marqueeSmall: z.array(line(50).min(1)).max(8),
  trustItems: z
    .array(z.object({ icon: z.enum(TRUST_ICONS), title: line(40).min(1), text: line(80) }))
    .max(4),
  faq: z.array(z.object({ question: line(160).min(1), answer: line(1000).min(1) })).max(12),
  // Product page
  deliveryEstimate: line(80),
  // Footer
  footerText: line(400),
  // Colours
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #111111'),
});
export type ThemeConfig = z.infer<typeof themeSchema>;

/**
 * Default storefront design: a clean fashion layout (black and white with a
 * warm beige accent, serif display headings). Every piece of store-specific
 * wording is a setting the merchant controls; nothing claims facts about the
 * store (ratings, returns, sales counts) that the merchant did not enter.
 */
export const DEFAULT_THEME: ThemeConfig = {
  logoUrl: '',
  announcements: ['Cash on Delivery all over Pakistan', 'Confirm your order on WhatsApp'],
  heroImageUrl: '',
  heroHeading: 'Browse our latest products',
  heroSubheading: '',
  heroButtonText: 'Shop all',
  showRunway: true,
  runwayHeading: 'The Fashion Runway',
  marqueeLarge: ['New Arrivals', 'Timeless Style', 'Made for You'],
  marqueeSmall: ['Cash on Delivery', 'Delivery all over Pakistan'],
  trustItems: [
    { icon: 'truck', title: 'Nationwide Delivery', text: 'All over Pakistan' },
    { icon: 'cash', title: 'Cash on Delivery', text: 'Pay when you receive' },
    { icon: 'whatsapp', title: 'WhatsApp Confirmation', text: 'Confirm your order in one tap' },
  ],
  faq: [
    { question: 'How do I pay?', answer: 'Pay in cash to the courier when your parcel arrives. No advance payment is needed.' },
    { question: 'How will I know my order is confirmed?', answer: 'After you order, confirm it on WhatsApp or on your order page. We dispatch confirmed orders.' },
  ],
  deliveryEstimate: '',
  footerText: '',
  accentColor: '#111111',
};

export function readCodForm(value: unknown): CodFormConfig {
  return { ...DEFAULT_COD_FORM, ...(typeof value === 'object' && value ? value : {}) } as CodFormConfig;
}

export function readTheme(value: unknown): ThemeConfig {
  const stored: Record<string, unknown> = typeof value === 'object' && value ? { ...(value as object) } : {};
  // Stores created before announcements became a list kept a single string.
  if (typeof stored.announcement === 'string') {
    if (!('announcements' in stored)) stored.announcements = stored.announcement ? [stored.announcement] : [];
    delete stored.announcement;
  }
  // Field by field, so one bad stored value falls back alone.
  const theme = { ...DEFAULT_THEME } as Record<string, unknown>;
  for (const [key, field] of Object.entries(themeSchema.shape)) {
    const parsed = (field as z.ZodTypeAny).safeParse(stored[key]);
    if (parsed.success) theme[key] = parsed.data;
  }
  return theme as ThemeConfig;
}

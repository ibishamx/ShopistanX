import { z } from 'zod';

/**
 * Smart collection rules, modelled on Shopify's automated collections:
 * a product joins when all (or any) rules match. Price rules match when any
 * variant matches. Prices in rules are rupees, as merchants type them.
 */
export const RULE_FIELDS = ['tag', 'type', 'vendor', 'title', 'price', 'compare_at_price'] as const;
export const RULE_RELATIONS = ['equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'greater_than', 'less_than', 'is_set'] as const;

const TEXT_RELATIONS = ['equals', 'not_equals', 'contains', 'not_contains', 'starts_with'];
const NUMBER_RELATIONS = ['equals', 'not_equals', 'greater_than', 'less_than', 'is_set'];

export const ruleSchema = z
  .object({
    field: z.enum(RULE_FIELDS),
    relation: z.enum(RULE_RELATIONS),
    value: z.string().trim().max(200).default(''),
  })
  .superRefine((rule, ctx) => {
    const numeric = rule.field === 'price' || rule.field === 'compare_at_price';
    const allowed = numeric ? NUMBER_RELATIONS : TEXT_RELATIONS;
    if (!allowed.includes(rule.relation)) {
      ctx.addIssue({ code: 'custom', message: `“${rule.relation.replace(/_/g, ' ')}” does not work with ${rule.field.replace(/_/g, ' ')}` });
    } else if (rule.relation !== 'is_set' && !rule.value) {
      ctx.addIssue({ code: 'custom', message: 'Every rule needs a value' });
    } else if (numeric && rule.relation !== 'is_set' && !/^\d+(\.\d{1,2})?$/.test(rule.value.replace(/,/g, ''))) {
      ctx.addIssue({ code: 'custom', message: 'Price rules need an amount in rupees, e.g. 3500' });
    }
  });
export type Rule = z.infer<typeof ruleSchema>;

export interface MatchableProduct {
  title: string;
  productType: string;
  vendor: string;
  tags: string[];
  variants: { pricePaisa: number; compareAtPaisa: number | null }[];
}

const lower = (s: string) => s.trim().toLowerCase();

function textMatches(values: string[], relation: Rule['relation'], value: string): boolean {
  const v = lower(value);
  const vs = values.map(lower);
  switch (relation) {
    case 'equals': return vs.includes(v);
    case 'not_equals': return !vs.includes(v);
    case 'contains': return vs.some((x) => x.includes(v));
    case 'not_contains': return !vs.some((x) => x.includes(v));
    case 'starts_with': return vs.some((x) => x.startsWith(v));
    default: return false;
  }
}

function numberMatches(amounts: (number | null)[], relation: Rule['relation'], value: string): boolean {
  if (relation === 'is_set') return amounts.some((a) => a != null);
  const target = Math.round(Number(value.replace(/,/g, '')) * 100);
  return amounts.some((a) => {
    if (a == null) return false;
    if (relation === 'equals') return a === target;
    if (relation === 'not_equals') return a !== target;
    if (relation === 'greater_than') return a > target;
    if (relation === 'less_than') return a < target;
    return false;
  });
}

export function ruleMatches(p: MatchableProduct, rule: Rule): boolean {
  switch (rule.field) {
    case 'tag': return textMatches(p.tags, rule.relation, rule.value);
    case 'type': return textMatches([p.productType], rule.relation, rule.value);
    case 'vendor': return textMatches([p.vendor], rule.relation, rule.value);
    case 'title': return textMatches([p.title], rule.relation, rule.value);
    case 'price': return numberMatches(p.variants.map((v) => v.pricePaisa), rule.relation, rule.value);
    case 'compare_at_price':
      // "is set" means on sale: an original price above the selling price.
      if (rule.relation === 'is_set') return p.variants.some((v) => v.compareAtPaisa != null && v.compareAtPaisa > v.pricePaisa);
      return numberMatches(p.variants.map((v) => v.compareAtPaisa), rule.relation, rule.value);
  }
}

export function productMatches(p: MatchableProduct, rules: Rule[], matchAll: boolean): boolean {
  if (!rules.length) return false;
  return matchAll ? rules.every((r) => ruleMatches(p, r)) : rules.some((r) => ruleMatches(p, r));
}

export const SORT_ORDERS = ['newest', 'oldest', 'price_asc', 'price_desc', 'title_asc', 'manual'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export function sortProducts<T extends { title: string; createdAt: Date; variants: { pricePaisa: number }[] }>(
  products: T[],
  order: string,
  manualPosition?: Map<string, number>,
  idOf?: (p: T) => string,
): T[] {
  const min = (p: T) => Math.min(...p.variants.map((v) => v.pricePaisa));
  const list = [...products];
  switch (order) {
    case 'oldest': return list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    case 'price_asc': return list.sort((a, b) => min(a) - min(b));
    case 'price_desc': return list.sort((a, b) => min(b) - min(a));
    case 'title_asc': return list.sort((a, b) => a.title.localeCompare(b.title));
    case 'manual':
      if (manualPosition && idOf) return list.sort((a, b) => (manualPosition.get(idOf(a)) ?? 0) - (manualPosition.get(idOf(b)) ?? 0));
      return list;
    default: return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}

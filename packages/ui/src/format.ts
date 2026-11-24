/** 250000 paisa → "Rs 2,500" */
export function rs(paisa: number): string {
  const rupees = paisa / 100;
  return `Rs ${rupees.toLocaleString('en-PK', { maximumFractionDigits: Number.isInteger(rupees) ? 0 : 2 })}`;
}

/** "2,500" or "2500.50" rupees → paisa, or null when not a valid amount. */
export function toPaisa(input: string): number | null {
  const cleaned = input.replace(/[,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

export function fromPaisa(paisa: number | null | undefined): string {
  return paisa == null ? '' : String(paisa / 100);
}

/** "Jamia Masjid" → "Near Jamia Masjid"; text that already says near/opposite/behind is kept. */
export function landmarkText(landmark: string): string {
  return /^(near|opp(osite)?|behind|next to|beside|in front of|across)\b/i.test(landmark.trim()) ? landmark.trim() : `Near ${landmark.trim()}`;
}

/** 923001234567 → 0300 1234567 */
export function pkPhone(e164: string): string {
  const local = e164.replace(/^92/, '0');
  return `${local.slice(0, 4)} ${local.slice(4)}`;
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

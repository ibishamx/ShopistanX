/**
 * Pakistani mobile numbers. Accepts 03001234567, 3001234567, 923001234567,
 * +92 300 1234567 and returns the international form without "+":
 * 923001234567 (what both wa.me and the WhatsApp Cloud API expect).
 */
export function normalizePkMobile(input: string): string | null {
  const digits = input.replace(/[^\d]/g, '');
  const match = /^(?:0092|92|0)?(3\d{9})$/.exec(digits);
  return match ? `92${match[1]}` : null;
}

/** 923001234567 → 0300 1234567 */
export function formatPkMobile(e164: string): string {
  const local = e164.replace(/^92/, '0');
  return `${local.slice(0, 4)} ${local.slice(4)}`;
}

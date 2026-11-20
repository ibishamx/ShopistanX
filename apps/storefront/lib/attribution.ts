/**
 * Remembers which ad or link brought the shopper, so the merchant can see
 * returns by campaign. Last click wins; kept for 30 days in this browser.
 */
const KEY = 'shopistan-utm';
const MAX_AGE_MS = 30 * 86_400_000;

export interface Attribution {
  source?: string;
  medium?: string;
  campaign?: string;
}

/**
 * Runs inline in <head>, before the page is interactive, so the landing URL is
 * captured even if the shopper navigates away immediately. Plain ES5, no imports.
 */
export const CAPTURE_SCRIPT = `(function(){try{
var p=new URLSearchParams(location.search),g=function(k){var v=(p.get(k)||'').trim().slice(0,150);return v||undefined};
var a={source:g('utm_source'),medium:g('utm_medium'),campaign:g('utm_campaign')};
if(!a.source){var c=[['fbclid','facebook'],['ttclid','tiktok'],['gclid','google']];
for(var i=0;i<c.length;i++){if(p.has(c[i][0])){a.source=c[i][1];a.medium=a.medium||'paid';break}}}
if(!a.source&&!a.campaign)return;a.at=Date.now();localStorage.setItem('${KEY}',JSON.stringify(a))}catch(e){}})();`;

export function readAttribution(): Attribution | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return undefined;
    const { at, ...value } = JSON.parse(raw);
    if (typeof at !== 'number' || Date.now() - at > MAX_AGE_MS) return undefined;
    return value;
  } catch {
    return undefined;
  }
}

// OCT/wOCT amount math. Both chains use 6 decimals (wOCT is NOT a typical
// 18-decimal ERC-20), so the raw micro-OCT value equals the wei value 1:1.
// octToWei/weiToMicroOct are identity functions but kept named so the
// assumption lives in one auditable place.

export const MICRO_PER_OCT = 1_000_000n;

/** Parse a human-entered OCT string ("1.5", "0.000001") to a raw micro-OCT
 *  string. Throws on invalid input or more than 6 decimals (silently
 *  truncating loses user funds in 1-of-1m worst cases). */
export function parseAmountToRaw(s: string): string {
  s = String(s).trim();
  if (!s) return '0';
  const dot = s.indexOf('.');
  if (dot < 0) {
    if (!/^\d+$/.test(s)) throw new Error('invalid amount');
    return (BigInt(s) * MICRO_PER_OCT).toString();
  }
  const ip = s.slice(0, dot);
  const fp = s.slice(dot + 1);
  if (ip && !/^\d+$/.test(ip)) throw new Error('invalid amount');
  if (fp && !/^\d+$/.test(fp)) throw new Error('invalid amount');
  if (fp.length > 6) throw new Error('too many decimals (max 6)');
  const fpPadded = fp.padEnd(6, '0');
  const ipN = ip ? BigInt(ip) : 0n;
  return (ipN * MICRO_PER_OCT + BigInt(fpPadded || '0')).toString();
}

/** Format a raw micro-OCT value back to a human OCT string with trailing
 *  zeros stripped ("1500000" → "1.5", "1000000" → "1"). */
export function formatRawAmount(raw: string | bigint): string {
  const v = typeof raw === 'bigint' ? raw : BigInt(raw || '0');
  const whole = v / MICRO_PER_OCT;
  const frac = (v % MICRO_PER_OCT).toString().padStart(6, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

// wOCT has 6 decimals on Ethereum. Identity, but expressive at call sites.
export function octToWei(microOct: string | bigint): bigint {
  return typeof microOct === 'bigint' ? microOct : BigInt(microOct);
}

export function weiToMicroOct(wei: bigint): bigint {
  return wei;
}

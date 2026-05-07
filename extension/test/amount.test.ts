import { describe, expect, it } from 'vitest';
import { formatRawAmount, octToWei, parseAmountToRaw, weiToMicroOct, MICRO_PER_OCT } from '../../shared/amount';

describe('parseAmountToRaw', () => {
  it('handles whole OCT amounts', () => {
    expect(parseAmountToRaw('1')).toBe('1000000');
    expect(parseAmountToRaw('100')).toBe('100000000');
    expect(parseAmountToRaw('0')).toBe('0');
  });

  it('handles fractional OCT with up to 6 decimals', () => {
    expect(parseAmountToRaw('1.5')).toBe('1500000');
    expect(parseAmountToRaw('0.000001')).toBe('1');
    expect(parseAmountToRaw('0.123456')).toBe('123456');
    expect(parseAmountToRaw('1.000001')).toBe('1000001');
  });

  it('treats empty string and whitespace as zero', () => {
    expect(parseAmountToRaw('')).toBe('0');
    expect(parseAmountToRaw('   ')).toBe('0');
  });

  it('strips leading/trailing whitespace', () => {
    expect(parseAmountToRaw('  1.5  ')).toBe('1500000');
  });

  it('handles a leading dot (treats integer part as 0)', () => {
    expect(parseAmountToRaw('.5')).toBe('500000');
  });

  it('throws on non-numeric input', () => {
    expect(() => parseAmountToRaw('abc')).toThrow('invalid amount');
    expect(() => parseAmountToRaw('1.5x')).toThrow('invalid amount');
    expect(() => parseAmountToRaw('-1')).toThrow('invalid amount');
  });

  it('throws on > 6 decimal places (no silent truncation)', () => {
    expect(() => parseAmountToRaw('1.1234567')).toThrow('too many decimals');
    expect(() => parseAmountToRaw('0.0000001')).toThrow('too many decimals');
  });

  it('handles huge values without precision loss', () => {
    // 2^53 OCT — beyond JS Number safe integer range
    const big = '9007199254740993';
    expect(parseAmountToRaw(big)).toBe('9007199254740993000000');
  });
});

describe('formatRawAmount', () => {
  it('formats whole units', () => {
    expect(formatRawAmount('1000000')).toBe('1');
    expect(formatRawAmount('100000000')).toBe('100');
    expect(formatRawAmount('0')).toBe('0');
  });

  it('formats fractional values, stripping trailing zeros', () => {
    expect(formatRawAmount('1500000')).toBe('1.5');
    expect(formatRawAmount('1')).toBe('0.000001');
    expect(formatRawAmount('123456')).toBe('0.123456');
    expect(formatRawAmount('1500001')).toBe('1.500001');
  });

  it('accepts bigint input', () => {
    expect(formatRawAmount(1_500_000n)).toBe('1.5');
    expect(formatRawAmount(1n)).toBe('0.000001');
  });

  it('handles empty string as zero', () => {
    expect(formatRawAmount('')).toBe('0');
  });

  it('round-trips with parseAmountToRaw for representative values', () => {
    const cases = ['0', '1', '1.5', '0.000001', '123.456', '999999.999999'];
    for (const c of cases) {
      expect(formatRawAmount(parseAmountToRaw(c))).toBe(c === '0' ? '0' : c.replace(/\.?0+$/, '') || '0');
    }
  });
});

describe('octToWei / weiToMicroOct', () => {
  it('are identity functions (wOCT has 6 decimals, matching micro-OCT)', () => {
    expect(octToWei('1000000')).toBe(1_000_000n);
    expect(octToWei(1_000_000n)).toBe(1_000_000n);
    expect(weiToMicroOct(1_000_000n)).toBe(1_000_000n);
  });

  it('MICRO_PER_OCT is 1e6', () => {
    expect(MICRO_PER_OCT).toBe(1_000_000n);
  });
});

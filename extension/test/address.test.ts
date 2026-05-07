import { describe, expect, it } from 'vitest';
import { isValidEthAddress, isValidOctraAddress } from '../../shared/address';

describe('isValidOctraAddress', () => {
  it('accepts a real 47-char oct… address', () => {
    expect(isValidOctraAddress('oct5MrNfjiXFNRDLwsodn8Zm9hDKNGAYt3eQDCQ52bSpCHq')).toBe(true);
  });

  it('rejects wrong length', () => {
    expect(isValidOctraAddress('oct123')).toBe(false);
    expect(isValidOctraAddress('oct5MrNfjiXFNRDLwsodn8Zm9hDKNGAYt3eQDCQ52bSpCHqX')).toBe(false);
  });

  it('rejects missing prefix', () => {
    expect(isValidOctraAddress('5MrNfjiXFNRDLwsodn8Zm9hDKNGAYt3eQDCQ52bSpCHqAAAA')).toBe(false);
    expect(isValidOctraAddress('xyz5MrNfjiXFNRDLwsodn8Zm9hDKNGAYt3eQDCQ52bSpCHq')).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isValidOctraAddress(undefined as unknown as string)).toBe(false);
    expect(isValidOctraAddress(null as unknown as string)).toBe(false);
    expect(isValidOctraAddress(42 as unknown as string)).toBe(false);
  });
});

describe('isValidEthAddress', () => {
  it('accepts 0x + 40 hex (mixed case fine)', () => {
    expect(isValidEthAddress('0xE7eD69b852fd2a1406080B26A37e8E04e7dA4caE')).toBe(true);
    expect(isValidEthAddress('0xe7ed69b852fd2a1406080b26a37e8e04e7da4cae')).toBe(true);
    expect(isValidEthAddress('0xE7ED69B852FD2A1406080B26A37E8E04E7DA4CAE')).toBe(true);
  });

  it('rejects wrong length', () => {
    expect(isValidEthAddress('0xE7eD69b852fd2a1406080B26A37e8E04e7dA4ca')).toBe(false);
    expect(isValidEthAddress('0xE7eD69b852fd2a1406080B26A37e8E04e7dA4caEE')).toBe(false);
  });

  it('rejects missing prefix', () => {
    expect(isValidEthAddress('E7eD69b852fd2a1406080B26A37e8E04e7dA4caE')).toBe(false);
  });

  it('rejects non-hex chars', () => {
    expect(isValidEthAddress('0xZZeD69b852fd2a1406080B26A37e8E04e7dA4caE')).toBe(false);
  });
});

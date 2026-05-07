import { describe, expect, it } from 'vitest';
import { buildContractCallTx, buildSendTx, canonicalJson, signTx, type OctraTx } from '../src/lib/tx';
import { bytesToBase64 } from '../src/lib/crypto';

// canonicalJson is the tx serialization that the node verifies signatures
// against. ANY change here breaks signing — every shipped wallet would
// produce signatures the node rejects. These tests lock the format down.

describe('canonicalJson', () => {
  const baseTx: OctraTx = {
    from: 'oct1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    to_:  'oct2bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    amount: '1000000',
    nonce: 5,
    ou: '10000',
    timestamp: 1700000000.5,
  };

  it('emits keys in canonical order: from, to_, amount, nonce, ou, timestamp, op_type', () => {
    const j = canonicalJson(baseTx);
    expect(j).toBe(
      '{"from":"oct1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"'
      + ',"to_":"oct2bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"'
      + ',"amount":"1000000"'
      + ',"nonce":5'
      + ',"ou":"10000"'
      + ',"timestamp":1700000000.5'
      + ',"op_type":"standard"}',
    );
  });

  it('defaults op_type to "standard" when missing or empty', () => {
    expect(canonicalJson({ ...baseTx, op_type: undefined })).toContain('"op_type":"standard"');
    expect(canonicalJson({ ...baseTx, op_type: '' })).toContain('"op_type":"standard"');
  });

  it('preserves explicit op_type', () => {
    expect(canonicalJson({ ...baseTx, op_type: 'call' })).toContain('"op_type":"call"');
  });

  it('omits encrypted_data and message when absent', () => {
    const j = canonicalJson(baseTx);
    expect(j).not.toContain('encrypted_data');
    expect(j).not.toContain('message');
  });

  it('appends encrypted_data and message in that order when present', () => {
    const j = canonicalJson({ ...baseTx, op_type: 'call', encrypted_data: 'lock_to_eth', message: '["0xabc"]' });
    expect(j.endsWith(',"encrypted_data":"lock_to_eth","message":"[\\"0xabc\\"]"}')).toBe(true);
  });

  it('escapes JSON metacharacters in string fields', () => {
    const j = canonicalJson({ ...baseTx, op_type: 'standard', message: 'hello "world"\n' });
    expect(j).toContain('"message":"hello \\"world\\"\\n"');
  });

  it('serializes timestamp via JSON.stringify (preserves float repr)', () => {
    expect(canonicalJson({ ...baseTx, timestamp: 1700000000 })).toContain('"timestamp":1700000000');
    expect(canonicalJson({ ...baseTx, timestamp: 1700000000.5 })).toContain('"timestamp":1700000000.5');
  });

  it('coerces nonce to int32 (drops decimals)', () => {
    expect(canonicalJson({ ...baseTx, nonce: 5.7 as unknown as number })).toContain('"nonce":5');
  });
});

describe('signTx', () => {
  it('attaches signature + public_key to the tx', () => {
    const seed = new Uint8Array(32).fill(0x42);
    const tx: OctraTx = {
      from: 'oct',
      to_: 'oct',
      amount: '1',
      nonce: 0,
      ou: '10000',
      timestamp: 1,
      op_type: 'standard',
    };
    const pubB64 = bytesToBase64(new Uint8Array(32).fill(0x55));
    const signed = signTx(tx, seed, pubB64);
    expect(signed.public_key).toBe(pubB64);
    expect(typeof signed.signature).toBe('string');
    // base64 of 64 bytes = 88 chars (with one '=' pad)
    expect(signed.signature.length).toBe(88);
  });
});

describe('buildSendTx', () => {
  it('defaults ou to 10000 for amounts < 1000 OCT', () => {
    const tx = buildSendTx({ from: 'a', to: 'b', amountRaw: '1000000', nonce: 1 });
    expect(tx.ou).toBe('10000');
  });

  it('defaults ou to 30000 for amounts >= 1000 OCT (1e9 raw)', () => {
    const tx = buildSendTx({ from: 'a', to: 'b', amountRaw: '1000000000', nonce: 1 });
    expect(tx.ou).toBe('30000');
  });

  it('sets op_type to standard', () => {
    const tx = buildSendTx({ from: 'a', to: 'b', amountRaw: '1', nonce: 0 });
    expect(tx.op_type).toBe('standard');
  });

  it('omits message when not provided', () => {
    const tx = buildSendTx({ from: 'a', to: 'b', amountRaw: '1', nonce: 0 });
    expect(tx.message).toBeUndefined();
  });

  it('includes message when provided', () => {
    const tx = buildSendTx({ from: 'a', to: 'b', amountRaw: '1', nonce: 0, message: 'gm' });
    expect(tx.message).toBe('gm');
  });
});

describe('buildContractCallTx', () => {
  it('encodes method as encrypted_data and params as JSON in message', () => {
    const tx = buildContractCallTx({
      from: 'oct1',
      contract: 'oct5MrNfjiXFNRDLwsodn8Zm9hDKNGAYt3eQDCQ52bSpCHq',
      method: 'lock_to_eth',
      params: ['0xabc'],
      amountRaw: '1000000',
      nonce: 5,
    });
    expect(tx.op_type).toBe('call');
    expect(tx.to_).toBe('oct5MrNfjiXFNRDLwsodn8Zm9hDKNGAYt3eQDCQ52bSpCHq');
    expect(tx.encrypted_data).toBe('lock_to_eth');
    expect(tx.message).toBe('["0xabc"]');
    expect(tx.amount).toBe('1000000');
  });

  it('defaults amount to 0 if not specified', () => {
    const tx = buildContractCallTx({
      from: 'oct1', contract: 'oct2', method: 'noop', params: [], nonce: 1,
    });
    expect(tx.amount).toBe('0');
  });

  it('defaults ou to 1000', () => {
    const tx = buildContractCallTx({
      from: 'oct1', contract: 'oct2', method: 'noop', params: [], nonce: 1,
    });
    expect(tx.ou).toBe('1000');
  });
});

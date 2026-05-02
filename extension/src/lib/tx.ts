import { bytesToBase64, signEd25519 } from './crypto';

export interface OctraTx {
  from: string;
  to_: string;
  amount: string;
  nonce: number;
  ou: string;
  timestamp: number;
  op_type?: string;
  encrypted_data?: string;
  message?: string;
}

function jsonEscape(s: string): string {
  let r = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    switch (c) {
      case '"':  r += '\\"';  break;
      case '\\': r += '\\\\'; break;
      case '\b': r += '\\b';  break;
      case '\f': r += '\\f';  break;
      case '\n': r += '\\n';  break;
      case '\r': r += '\\r';  break;
      case '\t': r += '\\t';  break;
      default:   r += c;
    }
  }
  return r;
}

function formatTimestamp(ts: number): string {
  return JSON.stringify(ts);
}

export function canonicalJson(tx: OctraTx): string {
  let s = '{"from":"' + jsonEscape(tx.from) + '"'
    + ',"to_":"' + jsonEscape(tx.to_) + '"'
    + ',"amount":"' + jsonEscape(tx.amount) + '"'
    + ',"nonce":' + String(tx.nonce | 0)
    + ',"ou":"' + jsonEscape(tx.ou) + '"'
    + ',"timestamp":' + formatTimestamp(tx.timestamp)
    + ',"op_type":"' + jsonEscape(tx.op_type && tx.op_type.length ? tx.op_type : 'standard') + '"';
  if (tx.encrypted_data) s += ',"encrypted_data":"' + jsonEscape(tx.encrypted_data) + '"';
  if (tx.message) s += ',"message":"' + jsonEscape(tx.message) + '"';
  s += '}';
  return s;
}

export interface SignedTx extends OctraTx {
  signature: string;
  public_key: string;
}

export function signTx(tx: OctraTx, privSeed32: Uint8Array, pubKeyB64: string): SignedTx {
  const msg = new TextEncoder().encode(canonicalJson(tx));
  const sig = signEd25519(msg, privSeed32);
  return { ...tx, signature: bytesToBase64(sig), public_key: pubKeyB64 };
}

export function nowTs(): number {
  // Add ~1µs of noise so the value is never an integer-valued double — JS would
  // serialize 1714603200.0 as "1714603200" while the node's C++ JSON serializer
  // emits "1714603200.0", and a mismatch breaks signature verification.
  return Date.now() / 1000 + (Math.random() + 1) * 1e-6;
}

export interface SendParams {
  from: string;
  to: string;
  amountRaw: string;
  nonce: number;
  ou?: string;
  message?: string;
}

export function buildSendTx(p: SendParams): OctraTx {
  const ou = p.ou ?? (BigInt(p.amountRaw) < 1_000_000_000n ? '10000' : '30000');
  const tx: OctraTx = {
    from: p.from,
    to_: p.to,
    amount: p.amountRaw,
    nonce: p.nonce,
    ou,
    timestamp: nowTs(),
    op_type: 'standard',
  };
  if (p.message) tx.message = p.message;
  return tx;
}

export interface ContractCallParams {
  from: string;
  contract: string;
  method: string;
  params: unknown[];
  amountRaw?: string;
  nonce: number;
  ou?: string;
}

export function buildContractCallTx(p: ContractCallParams): OctraTx {
  return {
    from: p.from,
    to_: p.contract,
    amount: p.amountRaw ?? '0',
    nonce: p.nonce,
    ou: p.ou ?? '1000',
    timestamp: nowTs(),
    op_type: 'call',
    encrypted_data: p.method,
    message: JSON.stringify(p.params),
  };
}

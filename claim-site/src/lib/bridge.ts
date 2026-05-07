import {
  BURN_SELECTOR,
  ETH_BRIDGE,
  ETH_CHAIN_ID,
  PROXY_URL,
  WOCT_ADDR,
  DEFAULT_ETH_RPC,
  DEFAULT_OCTRA_EXPLORER,
} from '../../../shared/constants';
import {
  encodeApproveCalldata,
  encodeBalanceOfCalldata,
  encodeBurnCalldata,
} from '../../../shared/abi';
import { formatRawAmount, octToWei, parseAmountToRaw, weiToMicroOct } from '../../../shared/amount';

// Both relayer + Octra RPC default to the CF Worker proxy. The worker dedupes
// the upstream's malformed CORS headers AND bypasses geo-IP blocks; users only
// need to reach workers.dev. See relayer-proxy/worker.js.
export const DEFAULT_RELAYER    = PROXY_URL;
export const DEFAULT_OCTRA_RPC  = PROXY_URL;

// re-export so existing imports throughout the claim-site keep working
export {
  BURN_SELECTOR,
  ETH_BRIDGE,
  ETH_CHAIN_ID,
  WOCT_ADDR,
  DEFAULT_ETH_RPC,
  DEFAULT_OCTRA_EXPLORER,
  encodeApproveCalldata,
  encodeBalanceOfCalldata,
  encodeBurnCalldata,
  formatRawAmount,
  octToWei,
  parseAmountToRaw,
  weiToMicroOct,
};

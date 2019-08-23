// @flow

/**
 * @typedef {Object} FeeCalculator
 * @property {number} lamportsPerSignature difs Cost in difs to validate a signature
 * @property {number} targetLamportsPerSignature
 * @property {number} targetSignaturesPerSlot
 */
export type FeeCalculator = {
  lamportsPerSignature: number,
  targetSignaturesPerSlot: number,
  targetLamportsPerSignature: number,
};

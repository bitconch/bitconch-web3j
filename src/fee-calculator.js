// @flow

/**
 * @typedef {Object} FeeCalculator
 * @property {number} difsPerSignature difs Cost in difs to validate a signature
 * @property {number} targetDifsPerSignature
 * @property {number} targetSignaturesPerSlot
 */
export type FeeCalculator = {
  difsPerSignature: number,
  targetSignaturesPerSlot: number,
  targetDifsPerSignature: number,
};

// Data Processing Utility Functions
// Shared helper functions used across data-processing modules

/**
 * Check if a transfer type is a Council-to-Troop (C2T) transfer
 * C2T transfers represent incoming inventory from the council (NOT counted as sold)
 *
 * @param {string} transferType - The transfer type to check
 * @returns {boolean} True if this is a C2T transfer
 *
 * @example
 * isC2TTransfer('C2T')     // => true
 * isC2TTransfer('C2T(P)')  // => true
 * isC2TTransfer('C2T-123') // => true
 * isC2TTransfer('T2G')     // => false
 */
function isC2TTransfer(transferType) {
  if (!transferType) return false;
  return transferType === 'C2T' ||
         transferType === 'C2T(P)' ||
         transferType.startsWith('C2T');
}

module.exports = {
  isC2TTransfer
};

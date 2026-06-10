/**
 * Barcode Utility Functions
 * QR Code processing and serial number generation
 */

// QR Code to Serial Number mapping positions
// QR Code (24 hex chars) -> Serial Number (14 chars)
// ═══════════════════════════════════════════════════════════
// Formula: Extract chars from specific positions in QR to form Serial Number
const QR_TO_SN_POSITIONS = [8, 15, 21, 1, 13, 18, 7, 23, 3, 14, 11, 2, 17, 20];
// SN digit index:        0   1   2  3   4   5  6   7  8   9  10 11  12  13
// QR position (1-based): 8  15  21  1  13  18  7  23  3  14  11  2  17  20

/**
 * Generate Serial Number from QR Code using position mapping
 * @param {string} qrCode - 24 character hex QR code
 * @returns {string|null} 14 character Serial Number or null if invalid
 */
function generateSerialFromQR(qrCode) {
  if (!qrCode || qrCode.length !== 24) {
    return null;
  }
  let serial = '';
  for (const pos of QR_TO_SN_POSITIONS) {
    serial += qrCode.charAt(pos - 1);
  }
  return serial;
}

/**
 * Validate QR Code format
 * @param {string} qrCode - QR code to validate
 * @returns {Object} { valid: boolean, error?: string }
 */
function validateQRCode(qrCode) {
  if (!qrCode || !qrCode.trim()) {
    return { valid: false, error: 'QR code is empty' };
  }

  const normalized = qrCode.trim().toUpperCase();

  // Check if it's hex and exactly 24 chars
  if (!/^[0-9A-F]{24}$/i.test(normalized)) {
    return { valid: false, error: 'QR code must be 24 hexadecimal characters' };
  }

  return { valid: true };
}

/**
 * Validate Serial Number format
 * @param {string} serialNumber - Serial number to validate
 * @returns {Object} { valid: boolean, error?: string }
 */
function validateSerialNumber(serialNumber) {
  if (!serialNumber || !serialNumber.trim()) {
    return { valid: false, error: 'Serial number is empty' };
  }

  const normalized = serialNumber.trim().toUpperCase();

  // Check if it's exactly 14 chars alphanumeric
  if (!/^[0-9A-F]{14}$/i.test(normalized)) {
    return { valid: false, error: 'Serial number must be 14 hexadecimal characters' };
  }

  return { valid: true };
}

/**
 * Validate prefix from serial number against product_master
 * @param {string} serialNumber - 14 character serial number
 * @param {string} expectedPrefix - Expected prefix from product_master
 * @param {Object} db - Database instance
 * @returns {Object} { valid: boolean, error?: string }
 */
function validateSerialPrefix(serialNumber, expectedPrefix, db) {
  if (!serialNumber || serialNumber.length < 4) {
    return { valid: false, error: 'Invalid serial number length' };
  }

  const snPrefix = serialNumber.substring(0, 4).toUpperCase();
  const expected = (expectedPrefix || '').toUpperCase();

  if (snPrefix !== expected) {
    return {
      valid: false,
      error: `Prefix mismatch. Expected "${expected}", got "${snPrefix}"`
    };
  }

  return { valid: true };
}

export {
  generateSerialFromQR,
  validateQRCode,
  validateSerialNumber,
  validateSerialPrefix,
  QR_TO_SN_POSITIONS,
};
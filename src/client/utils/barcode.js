/**
 * GS1-128 Barcode Parser Utility
 * Parses GS1-128 barcodes with format:
 * [)>06{5chars}P{14chars Part Number}V{4chars}CustCodeL{4chars}TypeCodeK{5chars}TypeCodeQ{6digits Qty}
 *
 * Example: [)>069KY0EPD52H5810030080V2S853L2S85KJ0001Q000011
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
 * @returns {string} 14 character Serial Number
 */
export function generateSerialFromQR(qrCode) {
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
export function validateQRCode(qrCode) {
  if (!qrCode || !qrCode.trim()) {
    return { valid: false, error: 'QR code is empty' };
  }

  const normalized = qrCode.trim().toUpperCase();

  // Check if it's hex
  if (!/^[0-9A-F]{24}$/i.test(normalized)) {
    return { valid: false, error: 'QR code must be 24 hexadecimal characters' };
  }

  return { valid: true };
}

/**
 * Parse GS1-128 barcode data
 * @param {string} barcode - Raw barcode string
 * @param {Array} productMasters - Array of {modelCode, prefix} for model resolution
 * @returns {Object|null} Parsed barcode data or null if invalid
 */
export function parseGS1Barcode(barcode, productMasters = []) {
  if (!barcode) return null;

  try {
    // Normalize input: trim whitespace and remove extra spaces
    const normalized = String(barcode).trim()
      .replace(/[\r\n\t]/g, '')
      .replace(/\s+/g, '')
      .toUpperCase();

    // Check for GS1-128 header
    if (!normalized.startsWith('[)>06') || normalized.length < 30) {
      return null;
    }

    // Parse using regex:
    // [)>06 + 5 chars + P + 14 chars PartNumber + V + 4 chars CustCode + L + 4 chars TypeCode + K + 5 chars TypeCode + Q + 6 digits Qty
    const match = normalized.match(/[\)>06[A-Z0-9]{5}P([A-Z0-9]{14})V([A-Z0-9]{4})L([A-Z0-9]{4})K([A-Z0-9]{5})Q([0-9]{6})$/);

    if (!match) {
      console.log('Barcode regex did not match:', normalized);
      return null;
    }

    const [, rawPartNumber, customerDestinationCode, typeCode1, typeCode2, qtyStr] = match;
    const quantity = parseInt(qtyStr, 10);

    if (quantity <= 0) return null;

    // Format part number: DH7H5810000080 -> DH7-H5810-00-00-80
    const partNumber = formatPartNumber(rawPartNumber);

    // Extract model code from part number (first segment + third segment)
    const modelCode = extractModelCode(partNumber);

    // Resolve prefix from product masters
    const prefix = resolveModelPrefix(modelCode, productMasters);

    return {
      // Header info
      header: normalized.substring(5, 10), // 5 chars after [)>06

      // Core fields
      partNumber,           // DH7-H5810-00-00-80
      rawPartNumber,       // DH7H5810000080 (without dashes)

      // Destination/Type codes
      customerDestinationCode, // 2S85
      typeCode1,             // 2S85 (after L)
      typeCode2,             // J0001 (after K)

      // Quantity
      quantity,             // 11

      // Derived fields
      modelCode,
      prefix,
    };
  } catch (error) {
    console.error('Barcode parse error:', error);
    return null;
  }
}

/**
 * Format raw part number with dashes
 * Format: DH7H5810000080 -> DH7-H5810-00-00-80
 * Pattern: XXX-XX-XX-XX-XX (3-2-2-2-2)
 * @param {string} partNumber - Raw part number (14 chars)
 * @returns {string} Formatted part number
 */
function formatPartNumber(partNumber) {
  if (!partNumber) return '';

  // Already formatted
  if (partNumber.includes('-')) return partNumber;

  // Format 14-char parts: D52H5810030080 -> D52-H5810-03-00-80
  // Pattern: XXX-XXXX-XX-XX-XX
  if (partNumber.length === 14) {
    return `${partNumber.slice(0, 3)}-${partNumber.slice(3, 8)}-${partNumber.slice(8, 10)}-${partNumber.slice(10, 12)}-${partNumber.slice(12, 14)}`;
  }

  // Format 13-char parts: DH7H5810000080 -> DH7-H581-00-00-80
  if (partNumber.length === 13) {
    return `${partNumber.slice(0, 3)}-${partNumber.slice(3, 7)}-${partNumber.slice(7, 9)}-${partNumber.slice(9, 11)}-${partNumber.slice(11, 13)}`;
  }

  // Fallback for shorter part numbers
  if (partNumber.length >= 10) {
    return `${partNumber.slice(0, 3)}-${partNumber.slice(3, 7)}-${partNumber.slice(7)}`;
  }

  return partNumber;
}

/**
 * Extract model code from part number
 * @param {string} partNumber - Formatted part number (e.g., DH7-H5810-00-00-80)
 * @returns {string} Model code (e.g., DH7-00)
 */
function extractModelCode(partNumber) {
  if (!partNumber) return '';

  const parts = partNumber.split('-');
  // Model code is first and third segment (e.g., "DH7-H5810-00-00-80" -> "DH7-00")
  if (parts.length >= 3) {
    return `${parts[0]}-${parts[2]}`;
  }

  return partNumber;
}

/**
 * Resolve prefix from product masters based on model code
 * @param {string} modelCode - Model code to resolve
 * @param {Array} productMasters - Array of {modelCode, prefix}
 * @returns {string} Prefix or default "0000"
 */
function resolveModelPrefix(modelCode, productMasters) {
  if (!productMasters || productMasters.length === 0) {
    return '0000';
  }

  // Exact match
  const exact = productMasters.find(p => p.modelCode === modelCode);
  if (exact) return exact.prefix;

  // Prefix match (first segment)
  const firstSegment = modelCode.split('-')[0];
  const partial = productMasters.find(p => p.modelCode.startsWith(firstSegment));

  return partial?.prefix || '0000';
}

/**
 * Check if barcode is a valid GS1-128 format
 * @param {string} barcode - Barcode to check
 * @returns {boolean} True if valid GS1-128
 */
export function isValidGS1Barcode(barcode) {
  if (!barcode) return false;
  const normalized = String(barcode).trim().toUpperCase();
  return normalized.startsWith('[)>06') && normalized.length >= 30;
}

/**
 * Validate barcode and return detailed error message
 * @param {string} barcode - Barcode to validate
 * @returns {Object} { valid: boolean, error?: string }
 */
export function validateBarcode(barcode) {
  if (!barcode || !barcode.trim()) {
    return { valid: false, error: 'Barcode is empty' };
  }

  const normalized = String(barcode).trim().toUpperCase();

  if (!normalized.startsWith('[)>06')) {
    return { valid: false, error: 'Invalid barcode header. Expected: [)>06' };
  }

  if (normalized.length < 30) {
    return { valid: false, error: `Barcode too short. Expected >= 30 chars, got ${normalized.length}` };
  }

  // Check for required markers
  const requiredMarkers = ['P', 'V', 'L', 'K', 'Q'];
  for (const marker of requiredMarkers) {
    if (!normalized.includes(marker)) {
      return { valid: false, error: `Missing required marker: ${marker}` };
    }
  }

  return { valid: true };
}
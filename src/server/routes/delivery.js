import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import logger from '../utils/logger.js';
import { generateSerialFromQR, validateQRCode, validateSerialNumber, validateSerialPrefix } from '../utils/barcode.js';
const router = express.Router();

// Start delivery batch
router.post('/start-batch', authenticateToken, authorizeRoles('admin', 'ppic', 'warehouse'), (req, res) => {
  try {
    const { so_item_id, item_card_barcode, qty_total } = req.body;
    if (!so_item_id || !item_card_barcode || !qty_total) {
      return res.status(400).json({ error: { message: 'SO item ID, barcode, and quantity required' } });
    }
    const soItem = db.prepare('SELECT * FROM so_items WHERE id = ?').get(so_item_id);
    if (!soItem) return res.status(404).json({ error: { message: 'SO item not found' } });
    // Check for existing active batch - return it instead of error
    const existingBatch = db.prepare("SELECT * FROM delivery_batches WHERE so_item_id = ? AND status = 'IN_PROGRESS'").get(so_item_id);
    if (existingBatch) {
      return res.status(200).json(existingBatch); // Return existing batch
    }
    const batchId = uuidv4();
    const product = db.prepare('SELECT box_capacity FROM product_master WHERE model_code = ?').get(soItem.model_code);
    const boxCapacity = product?.box_capacity || 50;
    const boxesRequired = Math.ceil(qty_total / boxCapacity);
    const now = new Date().toISOString();
    db.prepare("INSERT INTO delivery_batches (id, so_item_id, item_card_barcode, qty_total, boxes_required, status, started_at, created_by) VALUES (?, ?, ?, ?, ?, 'IN_PROGRESS', ?, ?)").run(batchId, so_item_id, item_card_barcode, qty_total, boxesRequired, now, req.user.id);
    logger.info('Delivery batch started', { batchId, soItemId: so_item_id, startedBy: req.user.username });
    const newBatch = db.prepare('SELECT * FROM delivery_batches WHERE id = ?').get(batchId);
    res.status(201).json(newBatch);
  } catch (error) {
    logger.error('Start batch error:', error);
    res.status(500).json({ error: { message: 'Failed to start batch' } });
  }
});
// Verify barcode against SO data
router.post('/verify-barcode', authenticateToken, (req, res) => {
  try {
    const { barcode, so_id } = req.body;
    if (!barcode || !so_id) {
      return res.status(400).json({ error: { message: 'Barcode and SO ID required' }, valid: false });
    }
    // Barcode: [)>06KODE9KY0EPD52H5810000080V2S85L2S85KJ0001Q000011
    const b = String(barcode).trim().toUpperCase();
    if (!b.startsWith('[)>06')) {
      return res.status(400).json({ error: { message: 'Barcode must start with [)>06' }, valid: false });
    }
    // Parse barcode fields
    const rest = b.slice(5);
    const dataStart = rest.startsWith('KODE') ? 4 : 0;
    const data = rest.slice(dataStart);
    const pIdx = data.indexOf('P');
    const vIdx = data.indexOf('V');
    const lIdx = data.indexOf('L');
    const qIdx = data.indexOf('Q');
    // Cari K SETELAH L (bukan K pertama di string)
    const kAfterLIdx = data.indexOf('K', lIdx);
    if ([pIdx, vIdx, lIdx, qIdx].some(i => i === -1) || kAfterLIdx === -1) {
      return res.status(400).json({ error: { message: 'Invalid barcode delimiters' }, valid: false });
    }
    const customerCode = data.slice(0, pIdx); // 9KY0E
    const partRaw = data.slice(pIdx + 1, vIdx); // D52H5810000080
    const destCode = data.slice(vIdx + 1, lIdx); // 2S85
    const typeCode = data.slice(lIdx + 1, kAfterLIdx); // after L, before K
    // SO Number: 5 chars after K (K yang datang setelah L)
    const soNumberFromBarcode = data.slice(kAfterLIdx + 1, kAfterLIdx + 6); // 5 chars SO Number
    const qtyStr = data.slice(qIdx + 1); // 000050
    const barcodeQty = parseInt(qtyStr, 10);
    // Format part number - handle various lengths
    let formattedPart, modelCode;
    const cleanPartRaw = partRaw.toUpperCase();
    // Try to match against existing item patterns
    // D52H5810-03 -> D52-H5810-03
    if (partRaw.length === 11) {
      // Short format: D52H581003 -> D52-H5810-03
      formattedPart = partRaw.slice(0, 3) + '-' + partRaw.slice(3, 8) + '-' + partRaw.slice(8, 11);
    } else if (partRaw.length === 13) {
      // D52H5810000080 -> D52-H5810-00-00-80
      formattedPart = partRaw.slice(0, 3) + '-' + partRaw.slice(3, 7) + '-' + partRaw.slice(7, 9) + '-' + partRaw.slice(9, 11) + '-' + partRaw.slice(11, 13);
    } else if (partRaw.length === 14) {
      // D52H58100000080 -> D52-H5810-00-00-08
      formattedPart = partRaw.slice(0, 3) + '-' + partRaw.slice(3, 8) + '-' + partRaw.slice(8, 10) + '-' + partRaw.slice(10, 12) + '-' + partRaw.slice(12, 14);
    } else {
      formattedPart = partRaw;
    }
    const parts = formattedPart.split('-');
    // Model format: D52-03 (first part + third segment)
    modelCode = parts[0] + '-' + (parts[2] || ''); // e.g., D52-03
    // Get SO
    const so = db.prepare('SELECT * FROM sales_orders WHERE id = ?').get(so_id);
    if (!so) {
      return res.status(404).json({ error: { message: 'SO not found' }, valid: false });
    }
    // Find matching item by model - more flexible matching
    const soItems = db.prepare('SELECT * FROM so_items WHERE so_id = ?').all(so_id);
    // Extract core part number (without model prefix) for flexible matching
    // e.g., DH7H5810000080 -> H5810000080 (remove first 3 chars)
    // e.g., D52H5810000080 -> H5810000080 (remove first 3 chars)
    const extractCorePart = (part) => {
      const cleaned = part.replace(/-/g, '').toUpperCase();
      // Remove first 3 chars (model prefix) and last 2 chars (suffix)
      // Pattern: PREFIX(3) + COREPART + SUFFIX(2)
      if (cleaned.length >= 8) {
        return cleaned.slice(3, -2); // e.g., H5810000080
      }
      return cleaned;
    };
    const corePartBarcode = extractCorePart(partRaw);
    const matchedItem = soItems.find(item => {
      if (!item.model_code && !item.item_number) return false;
      const cleanModel = item.model_code?.replace(/-/g, '').toUpperCase() || '';
      const cleanItemNum = item.item_number?.replace(/-/g, '').toUpperCase() || '';
      const cleanPart = formattedPart.replace(/-/g, '').toUpperCase();
      const corePartItem = extractCorePart(item.item_number || item.model_code || '');
      // Match if:
      // 1. Exact model/item match, OR
      // 2. Core part numbers match (ignoring model prefix)
      return cleanModel === cleanPart ||
             cleanItemNum === cleanPart ||
             corePartItem === corePartBarcode;
    });
    // Look up customer by code -> get name
    // Try exact match first, then partial match
    let customer = db.prepare('SELECT * FROM customers WHERE UPPER(code) = ?').get(customerCode.toUpperCase());
    if (!customer) {
      // Try partial match on code
      customer = db.prepare('SELECT * FROM customers WHERE UPPER(code) LIKE ?').get(customerCode.toUpperCase() + '%');
    }
    const customerName = customer?.name || null;
    // Look up destination by code AND type_code -> get name and type_name
    // Multiple destinations can have same code but different type_code
    // Match both code AND type_code from barcode
    let destination = null;
    if (typeCode) {
      // Try exact match on code + type_code first
      destination = db.prepare('SELECT * FROM customer_destinations WHERE UPPER(code) = ? AND UPPER(type_code) = ?').get(destCode.toUpperCase(), typeCode.toUpperCase());
      if (!destination) {
        // Try code match + partial type_code match
        destination = db.prepare('SELECT * FROM customer_destinations WHERE UPPER(code) = ? AND UPPER(type_code) LIKE ?').get(destCode.toUpperCase(), typeCode.toUpperCase() + '%');
      }
    }
    if (!destination) {
      // Fallback: try just code match (legacy behavior)
      destination = db.prepare('SELECT * FROM customer_destinations WHERE UPPER(code) = ?').get(destCode.toUpperCase());
      if (!destination) {
        // Try partial match on code
        destination = db.prepare('SELECT * FROM customer_destinations WHERE UPPER(code) LIKE ?').get(destCode.toUpperCase() + '%');
      }
    }
    const destName = destination?.name || null;
    const deliveryType = destination?.type_name || null;
    // Product lookup
    const product = db.prepare('SELECT * FROM product_master WHERE model_code LIKE ?').get(modelCode + '%');
    const boxCapacity = product?.box_capacity || 10;
    // Normalize for comparison
    const normalizeText = (str) => str ? String(str).trim().toUpperCase() : '';

    // VERIFICATION: Compare with SO data
    // Customer: If customer lookup found name, compare names. Otherwise compare barcode code with SO customer_id
    const customerMatch = customerName
      ? normalizeText(customerName) === normalizeText(so.customer_name)
      : normalizeText(customerCode) === normalizeText(so.customer_id);
    // Destination: If destination lookup found name, compare names. Otherwise compare barcode dest code with SO destination_id
    const destMatch = destName
      ? normalizeText(destName) === normalizeText(so.destination_name || so.delivery_destination)
      : normalizeText(destCode) === normalizeText(so.destination_id || so.delivery_destination);
    // Type: If destination lookup found type, compare. Otherwise compare with SO delivery_type
    const typeMatch = deliveryType
      ? normalizeText(deliveryType) === normalizeText(so.delivery_type)
      : normalizeText(destCode) === normalizeText(so.delivery_type);
    // Get first item for SO display (always show SO data, not "Not found")
    const firstItem = soItems.length > 0 ? soItems[0] : null;
    // Part match: compare barcode part with first SO item (or matched item if exists)
    const itemToCompare = matchedItem || firstItem;
    const partMatch = itemToCompare ? (formattedPart === itemToCompare.model_code || formattedPart === itemToCompare.item_number || partRaw === itemToCompare.item_number?.replace(/-/g, '')) : false;
    // For delivery: require exact match for qty (plan qty from SO vs barcode qty)
    const remainingQty = firstItem ? (firstItem.qty_plan - firstItem.qty_actual) : 0;
    // Exact match: barcode qty must equal SO plan qty
    const qtyMatch = firstItem ? (barcodeQty === firstItem.qty_plan) : false;
    // SO Number match: compare barcode SO Number with SO's so_number (strip # and @ for comparison)
    const soNumberFromSo = (so.so_number || '').replace(/^#/, '').replace(/^@/, '').toUpperCase();
    const soNumberMatch = normalizeText(soNumberFromBarcode) === soNumberFromSo;
    // Strip # from so_number for display
    const allMatch = customerMatch && destMatch && typeMatch && partMatch && qtyMatch && soNumberMatch;
    return res.json({
      valid: true, matched: allMatch,
      error: allMatch ? null : 'Barcode mismatch - check individual fields',
      comparison: {
        soNumber: { label: 'SO Number', soValue: soNumberFromSo, barcodeValue: soNumberFromBarcode, match: soNumberMatch },
        customer: { label: 'Customer Name', soValue: so.customer_name, barcodeValue: customerName || customerCode, match: customerMatch },
        destination: { label: 'Destination Name', soValue: so.destination_name || so.delivery_destination, barcodeValue: destName || destCode, match: destMatch },
        type: { label: 'Delivery Type', soValue: so.delivery_type, barcodeValue: deliveryType || destCode, match: typeMatch },
        part: { label: 'Part No', soValue: firstItem?.item_number || so.primary_item_number || '-', barcodeValue: formattedPart, match: partMatch },
        model: { label: 'Model No', soValue: firstItem?.model_code || '-', barcodeValue: modelCode, match: partMatch },
        qty: { label: 'Qty (Plan)', soValue: (firstItem?.qty_plan || 0).toString(), barcodeValue: barcodeQty.toString(), match: qtyMatch }
      },
      // Additional info for UI
      bucketNo: so.bucket_no || '',
      soNumber: so.so_number || '',
      matchedItem: matchedItem ? {
        id: matchedItem.id,
        item_number: matchedItem.item_number,
        model_code: matchedItem.model_code,
        qty_plan: matchedItem.qty_plan,
        has_active_batch: !!db.prepare("SELECT id FROM delivery_batches WHERE so_item_id = ? AND status = 'IN_PROGRESS'").get(matchedItem.id)
      } : firstItem ? {
        id: firstItem.id,
        item_number: firstItem.item_number,
        model_code: firstItem.model_code,
        qty_plan: firstItem.qty_plan,
        has_active_batch: !!db.prepare("SELECT id FROM delivery_batches WHERE so_item_id = ? AND status = 'IN_PROGRESS'").get(firstItem.id)
      } : null
    });
  } catch (error) {
    logger.error('Verify barcode error:', error);
    res.status(500).json({ error: { message: 'Failed to verify barcode' }, valid: false });
  }
});
// Check if QR code already exists in database (for client-side validation)
router.post('/check-qr-exists', authenticateToken, authorizeRoles('admin', 'ppic', 'warehouse'), (req, res) => {
  try {
    const { qr_code } = req.body;
    if (!qr_code) {
      return res.status(400).json({ error: { message: 'QR code is required' } });
    }

    const normalizedQR = qr_code.trim().toUpperCase();

    // Validate QR Code format (24 hex chars)
    const qrValidation = validateQRCode(normalizedQR);
    if (!qrValidation.valid) {
      return res.status(400).json({ exists: false, error: qrValidation.error });
    }

    // Check if QR code already exists
    const existingScan = db.prepare(`
      SELECT
        su.id, su.qr_code, su.serial_number, su.scanned_at, su.scanned_by,
        db.box_label,
        db.batch_id,
        db2.so_item_id,
        si.so_id,
        so.so_number,
        so.customer_name
      FROM scanned_units su
      JOIN delivery_boxes db ON su.box_id = db.id
      JOIN delivery_batches db2 ON db.batch_id = db2.id
      JOIN so_items si ON db2.so_item_id = si.id
      JOIN sales_orders so ON si.so_id = so.id
      WHERE su.qr_code = ?
      LIMIT 1
    `).get(normalizedQR);

    if (existingScan) {
      const scanner = db.prepare('SELECT name FROM users WHERE id = ?').get(existingScan.scanned_by);
      return res.json({
        exists: true,
        serverPort: 43118, // Mark which server responded
        duplicateInfo: {
          scannedAt: existingScan.scanned_at,
          scannedBy: scanner?.name || 'Unknown',
          soNumber: existingScan.so_number,
          customerName: existingScan.customer_name,
          boxLabel: existingScan.box_label,
          serialNumber: existingScan.serial_number,
          qrCode: existingScan.qr_code
        }
      });
    }

    return res.json({ exists: false, serverPort: 43118 });
  } catch (error) {
    logger.error('Check QR exists error:', error);
    res.status(500).json({ error: { message: 'Failed to check QR code' }, exists: false });
  }
});

// Validate prefix against SO item (for client-side validation)
router.post('/validate-prefix', authenticateToken, authorizeRoles('admin', 'ppic', 'warehouse'), (req, res) => {
  try {
    const { qr_code, batch_id } = req.body;
    if (!qr_code || !batch_id) {
      return res.status(400).json({
        valid: false,
        error: { message: 'QR code and batch ID are required' }
      });
    }

    const normalizedQR = qr_code.trim().toUpperCase();

    // Validate QR Code format
    const qrValidation = validateQRCode(normalizedQR);
    if (!qrValidation.valid) {
      return res.status(400).json({ valid: false, error: qrValidation.error });
    }

    // Get batch and SO item info
    const batch = db.prepare('SELECT * FROM delivery_batches WHERE id = ?').get(batch_id);
    if (!batch) {
      return res.status(404).json({ valid: false, error: { message: 'Batch not found' } });
    }

    const soItem = db.prepare('SELECT * FROM so_items WHERE id = ?').get(batch.so_item_id);
    if (!soItem) {
      return res.status(404).json({ valid: false, error: { message: 'SO item not found' } });
    }

    // Generate serial number from QR
    const serialNumber = generateSerialFromQR(normalizedQR);
    if (!serialNumber) {
      return res.status(400).json({
        valid: false,
        error: { message: 'Failed to generate serial number from QR code' }
      });
    }

    // Get product info for prefix validation
    const modelCode = (soItem.model_code || '').trim().toUpperCase();
    let product = db.prepare('SELECT prefix, model_code, part_number, description FROM product_master WHERE model_code = ?').get(modelCode);

    if (!product) {
      product = db.prepare('SELECT prefix, model_code, part_number, description FROM product_master WHERE model_code LIKE ?').get(modelCode + '%');
    }

    if (!product && modelCode) {
      const parts = modelCode.split('-');
      if (parts.length >= 2) {
        product = db.prepare('SELECT prefix, model_code, part_number, description FROM product_master WHERE model_code LIKE ?').get(parts[0] + '%' + (parts[1] || '') + '%');
      }
    }

    const expectedPrefix = (product?.prefix || '0000').toUpperCase();
    const detectedPrefix = serialNumber.substring(0, 4).toUpperCase();
    const prefixValid = detectedPrefix === expectedPrefix;

    return res.json({
      valid: prefixValid,
      serialNumber,
      prefixInfo: {
        detectedPrefix,
        expectedPrefix,
        prefixValid,
        modelCode,
        productFound: !!product,
        productInfo: product ? {
          partNumber: product.part_number,
          description: product.description,
          prefix: product.prefix
        } : null
      }
    });
  } catch (error) {
    logger.error('Validate prefix error:', error);
    res.status(500).json({ valid: false, error: { message: 'Failed to validate prefix' } });
  }
});

// Scan unit into a box
router.post('/scan-unit', authenticateToken, authorizeRoles('admin', 'ppic', 'warehouse'), (req, res) => {
  try {
    const { batch_id, box_id, qr_code, serial_number, model_code } = req.body;
    if (!batch_id || !box_id || !qr_code) {
      return res.status(400).json({ error: { message: 'Batch ID, box ID, and QR code are required' } });
    }

    // Validate QR Code format (24 hex chars)
    const qrValidation = validateQRCode(qr_code);
    if (!qrValidation.valid) {
      return res.status(400).json({ error: { message: qrValidation.error } });
    }

    const normalizedQR = qr_code.trim().toUpperCase();

    // Auto-generate serial number from QR code using position mapping
    const generatedSerial = generateSerialFromQR(normalizedQR);
    if (!generatedSerial) {
      return res.status(400).json({ error: { message: 'Failed to generate serial number from QR code' } });
    }

    // Use provided serial_number or auto-generated
    const finalSerialNumber = (serial_number || generatedSerial).trim().toUpperCase();

    // Validate Serial Number format (14 chars)
    const snValidation = validateSerialNumber(finalSerialNumber);
    if (!snValidation.valid) {
      return res.status(400).json({ error: { message: snValidation.error } });
    }

    // Validate model_code is provided
    const finalModelCode = (model_code || '').trim().toUpperCase();
    if (!finalModelCode) {
      return res.status(400).json({ error: { message: 'Model code is required' } });
    }

    const batch = db.prepare('SELECT * FROM delivery_batches WHERE id = ?').get(batch_id);
    if (!batch) return res.status(404).json({ error: { message: 'Batch not found' } });
    if (batch.status !== 'IN_PROGRESS') return res.status(400).json({ error: { message: 'Batch is not in progress' } });
    const box = db.prepare('SELECT * FROM delivery_boxes WHERE id = ? AND batch_id = ?').get(box_id, batch_id);
    if (!box) return res.status(404).json({ error: { message: 'Box not found in this batch' } });
    if (box.status === 'SEALED') return res.status(400).json({ error: { message: 'Box is already sealed' } });

    // Check for duplicate QR code or serial number with detailed info
    const existingScan = db.prepare(`
      SELECT
        su.id, su.qr_code, su.serial_number, su.scanned_at, su.scanned_by,
        db.box_label,
        db.batch_id,
        db2.so_item_id,
        si.so_id,
        so.so_number
      FROM scanned_units su
      JOIN delivery_boxes db ON su.box_id = db.id
      JOIN delivery_batches db2 ON db.batch_id = db2.id
      JOIN so_items si ON db2.so_item_id = si.id
      JOIN sales_orders so ON si.so_id = so.id
      WHERE su.qr_code = ? OR su.serial_number = ?
      LIMIT 1
    `).get(normalizedQR, finalSerialNumber);

    if (existingScan) {
      // Get scanner name
      const scanner = db.prepare('SELECT name FROM users WHERE id = ?').get(existingScan.scanned_by);

      return res.status(409).json({
        error: {
          message: 'QR code atau serial number sudah pernah discan',
          type: 'DUPLICATE',
          duplicateInfo: {
            scannedAt: existingScan.scanned_at,
            scannedBy: scanner?.name || 'Unknown',
            soNumber: existingScan.so_number,
            boxLabel: existingScan.box_label,
            serialNumber: existingScan.serial_number,
            qrCode: existingScan.qr_code
          }
        }
      });
    }

    // Validate prefix against product_master
    // First try exact match, then try LIKE match for partial model codes
    let product = db.prepare('SELECT prefix, model_code, part_number, description FROM product_master WHERE model_code = ?').get(finalModelCode);

    // If not found, try LIKE match
    if (!product) {
      product = db.prepare('SELECT prefix, model_code, part_number, description FROM product_master WHERE model_code LIKE ?').get(finalModelCode + '%');
    }

    // If still not found, try matching by part number pattern from model_code
    if (!product && finalModelCode) {
      // Extract part number pattern: D52-03 -> D52%03%
      const parts = finalModelCode.split('-');
      if (parts.length >= 2) {
        product = db.prepare('SELECT prefix, model_code, part_number, description FROM product_master WHERE model_code LIKE ?').get(parts[0] + '%' + (parts[1] || '') + '%');
      }
    }

    const expectedPrefix = (product?.prefix || '0000').toUpperCase();
    const detectedPrefix = finalSerialNumber.substring(0, 4).toUpperCase();

    // Debug logging
    console.log('[Prefix Validation]', {
      modelCode: finalModelCode,
      serialNumber: finalSerialNumber,
      detectedPrefix,
      expectedPrefix,
      productFound: !!product,
      productPrefix: product?.prefix,
      willReject: detectedPrefix !== expectedPrefix
    });

    // Check prefix mismatch BEFORE inserting
    if (detectedPrefix !== expectedPrefix) {
      logger.warn('Prefix validation failed', {
        serialNumber: finalSerialNumber,
        expectedPrefix,
        detectedPrefix,
        modelCode: finalModelCode,
        productFound: !!product
      });

      return res.status(400).json({
        error: {
          message: `Prefix tidak valid. Prefix yang terdeteksi (${detectedPrefix}) tidak sesuai dengan prefix produk (${expectedPrefix})`,
          type: 'PREFIX_MISMATCH',
          prefixMismatch: {
            detectedPrefix,
            expectedPrefix,
            modelCode: finalModelCode,
            productFound: !!product,
            productInfo: product ? {
              partNumber: product.part_number,
              description: product.description
            } : null
          }
        }
      });
    }

    const scannedAt = new Date().toISOString();
    const scanId = uuidv4();
    db.prepare("INSERT INTO scanned_units (id, box_id, qr_code, serial_number, model_code, prefix_valid, scanned_at, scanned_by) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").run(scanId, box_id, normalizedQR, finalSerialNumber, finalModelCode, scannedAt, req.user.id);
    const newScanned = db.prepare('SELECT * FROM scanned_units WHERE id = ?').get(scanId);
    const updatedQtyScanned = db.prepare('SELECT COUNT(*) as count FROM scanned_units WHERE box_id = ?').get(box_id).count;
    db.prepare('UPDATE delivery_boxes SET qty_actual = ? WHERE id = ?').run(updatedQtyScanned, box_id);
    const updatedBatchScanned = db.prepare('SELECT SUM(qty_actual) as total FROM delivery_boxes WHERE batch_id = ?').get(batch_id).total || 0;
    db.prepare('UPDATE delivery_batches SET qty_scanned = ? WHERE id = ?').run(updatedBatchScanned, batch_id);
    // Update so_items.qty_actual
    const soItemUpdated = db.prepare('SELECT * FROM so_items WHERE id = ?').get(batch.so_item_id);
    let soUpdated = null;
    if (soItemUpdated) {
      db.prepare('UPDATE so_items SET qty_actual = ? WHERE id = ?').run(updatedBatchScanned, batch.so_item_id);
      // Update sales_orders.total_qty_actual
      const soId = soItemUpdated.so_id;
      const totalActual = db.prepare('SELECT SUM(qty_actual) as total FROM so_items WHERE so_id = ?').get(soId)?.total || 0;
      db.prepare('UPDATE sales_orders SET total_qty_actual = ? WHERE id = ?').run(totalActual, soId);
      // Get updated sales_orders
      soUpdated = db.prepare('SELECT * FROM sales_orders WHERE id = ?').get(soId);
    }
    logger.info('Unit scanned', { scanId, batchId: batch_id, boxId: box_id, scannedBy: req.user.username, serialNumber: finalSerialNumber, prefixValid: 1 });
    res.status(201).json({
      scan: newScanned,
      serial_number: finalSerialNumber,
      box: { id: box_id, qty_actual: updatedQtyScanned },
      batch: { id: batch_id, qty_scanned: updatedBatchScanned },
      soItem: soItemUpdated,
      so: soUpdated,
      prefix_valid: 1
    });
  } catch (error) {
    logger.error('Scan unit error:', error);
    res.status(500).json({ error: { message: 'Failed to scan unit' } });
  }
});
// Seal a box
router.post('/seal-box', authenticateToken, authorizeRoles('admin', 'ppic', 'warehouse'), (req, res) => {
  try {
    const { box_id } = req.body;
    if (!box_id) return res.status(400).json({ error: { message: 'Box ID is required' } });
    const box = db.prepare('SELECT * FROM delivery_boxes WHERE id = ?').get(box_id);
    if (!box) return res.status(404).json({ error: { message: 'Box not found' } });
    if (box.status === 'SEALED') return res.status(400).json({ error: { message: 'Box is already sealed' } });
    const batch = db.prepare('SELECT * FROM delivery_batches WHERE id = ?').get(box.batch_id);
    if (!batch) return res.status(404).json({ error: { message: 'Batch not found' } });
    if (batch.status !== 'IN_PROGRESS') return res.status(400).json({ error: { message: 'Batch is not in progress' } });
    const sealedAt = new Date().toISOString();
    const sealedBy = req.user?.id || 'system';
    db.prepare('UPDATE delivery_boxes SET status = \'SEALED\', sealed_at = ?, sealed_by = ? WHERE id = ?').run(sealedAt, sealedBy, box_id);
    logger.info('Box sealed', { boxId: box_id, sealedBy: req.user?.username || 'system' });
    const updatedBox = db.prepare('SELECT * FROM delivery_boxes WHERE id = ?').get(box_id);
    res.json(updatedBox);
  } catch (error) {
    logger.error('Seal box error:', error);
    res.status(500).json({ error: { message: 'Failed to seal box', details: error.message } });
  }
});

// Create new box for a batch
router.post('/boxes', authenticateToken, authorizeRoles('admin', 'ppic', 'warehouse'), (req, res) => {
  try {
    const { batch_id } = req.body;
    if (!batch_id) return res.status(400).json({ error: { message: 'Batch ID is required' } });
    const batch = db.prepare('SELECT * FROM delivery_batches WHERE id = ?').get(batch_id);
    if (!batch) return res.status(404).json({ error: { message: 'Batch not found' } });
    if (batch.status !== 'IN_PROGRESS') return res.status(400).json({ error: { message: 'Batch is not in progress' } });

    const soItem = db.prepare('SELECT * FROM so_items WHERE id = ?').get(batch.so_item_id);
    if (!soItem) return res.status(404).json({ error: { message: 'SO Item not found for batch' } });

    let boxCapacity = 50;
    if (soItem.model_code) {
      const product = db.prepare('SELECT box_capacity FROM product_master WHERE model_code = ?').get(soItem.model_code);
      boxCapacity = product?.box_capacity || 50;
    }

    const maxBoxNumber = db.prepare('SELECT MAX(box_number) as max FROM delivery_boxes WHERE batch_id = ?').get(batch_id)?.max || 0;
    const boxNumber = maxBoxNumber + 1;

    // Extract SO number from item_card_barcode
    // Format: [)>06KODE{customer}P{part}V{dest}L{type}K{so_number}Q{qty}
    // SO number is after 'K' and before 'Q'
    let soPrefix = 'BOX';
    if (batch.item_card_barcode) {
      const match = batch.item_card_barcode.match(/K([A-Z0-9]{5})/);
      if (match) {
        soPrefix = match[1];  // e.g., "00028" from "K00028"
      }
    }

    // Box ID format: batch_id + box_number (for uniqueness)
    const boxId = `${batch_id}-BOX${String(boxNumber).padStart(3, '0')}`;
    // Box label format: SO_NUMBER-BOX{number} (e.g., "00028-BOX001")
    const boxLabel = `${soPrefix}-BOX${String(boxNumber).padStart(3, '0')}`;

    db.prepare('INSERT INTO delivery_boxes (id, batch_id, box_number, box_label, qty_capacity, qty_actual, status) VALUES (?, ?, ?, ?, ?, 0, \'OPEN\')').run(boxId, batch_id, boxNumber, boxLabel, boxCapacity);
    const newBox = db.prepare('SELECT * FROM delivery_boxes WHERE id = ?').get(boxId);
    res.status(201).json(newBox);
  } catch (error) {
    logger.error('Create box error:', error);
    res.status(500).json({ error: { message: 'Failed to create box' } });
  }
});

// Complete delivery batch
router.post('/complete-batch', authenticateToken, authorizeRoles('admin', 'ppic', 'warehouse'), (req, res) => {
  try {
    const { batch_id } = req.body;
    if (!batch_id) return res.status(400).json({ error: { message: 'Batch ID is required' } });
    const batch = db.prepare('SELECT * FROM delivery_batches WHERE id = ?').get(batch_id);
    if (!batch) return res.status(404).json({ error: { message: 'Batch not found' } });

    // If already completed, just return success
    if (batch.status === 'COMPLETED') {
      return res.json(batch);
    }

    if (batch.status !== 'IN_PROGRESS') return res.status(400).json({ error: { message: 'Batch is not in progress' } });

    // Auto-seal boxes that have qty_actual > 0
    const boxes = db.prepare('SELECT * FROM delivery_boxes WHERE batch_id = ?').all(batch_id);
    const sealedAt = new Date().toISOString();
    const sealedBy = req.user?.id || 'system';
    for (const box of boxes) {
      if (box.status !== 'SEALED' && box.qty_actual > 0) {
        db.prepare('UPDATE delivery_boxes SET status = \'SEALED\', sealed_at = ?, sealed_by = ? WHERE id = ?').run(sealedAt, sealedBy, box.id);
        logger.info('Auto-sealed box during batch completion', { boxId: box.id, batchId: batch_id });
      }
    }

    const completedAt = new Date().toISOString();
    db.prepare('UPDATE delivery_batches SET status = \'COMPLETED\', completed_at = ? WHERE id = ?').run(completedAt, batch_id);
    logger.info('Delivery batch completed', { batchId: batch_id, completedBy: req.user?.username || 'system' });

    // Update sales_orders status to COMPLETED
    const soItem = db.prepare('SELECT * FROM so_items WHERE id = ?').get(batch.so_item_id);
    if (soItem) {
      const soId = soItem.so_id;
      // Check if all items are completed
      const items = db.prepare('SELECT * FROM so_items WHERE so_id = ?').all(soId);
      const allItemsComplete = items.every(item => item.qty_actual >= item.qty_plan);
      const newStatus = allItemsComplete ? 'COMPLETED' : 'PARTIAL';
      db.prepare('UPDATE sales_orders SET status = ?, total_qty_actual = ? WHERE id = ?').run(newStatus, soItem.qty_actual, soId);
    }

    const updatedBatch = db.prepare('SELECT * FROM delivery_batches WHERE id = ?').get(batch_id);
    res.json(updatedBatch);
  } catch (error) {
    logger.error('Complete batch error:', error);
    res.status(500).json({ error: { message: 'Failed to complete batch', details: error.message } });
  }
});
// Get SO items by SO ID
router.get('/so-items/:id', authenticateToken, (req, res) => {
  try {
    const soId = decodeURIComponent(req.params.id);
    const so = db.prepare('SELECT * FROM sales_orders WHERE id = ?').get(soId);
    if (!so) return res.status(404).json({ error: { message: 'Sales order not found' } });
    const items = db.prepare('SELECT * FROM so_items WHERE so_id = ?').all(soId);
    res.json(items); // Return items array directly
  } catch (error) {
    logger.error('Get SO items error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch SO items' } });
  }
});
// Get batch by ID
router.get('/batches/:id', authenticateToken, (req, res) => {
  try {
    const batch = db.prepare('SELECT * FROM delivery_batches WHERE id = ?').get(req.params.id);
    if (!batch) return res.status(404).json({ error: { message: 'Batch not found' } });
    const soItem = db.prepare('SELECT * FROM so_items WHERE id = ?').get(batch.so_item_id);
    const so = db.prepare('SELECT * FROM sales_orders WHERE id = ?').get(soItem.so_id);
    const boxes = db.prepare('SELECT * FROM delivery_boxes WHERE batch_id = ? ORDER BY box_number ASC').all(batch.id);

    // Get scanned units with full details, ordered by scanned_at DESC
    const scannedUnits = db.prepare(`
      SELECT su.*, u.name as scanned_by_name
      FROM scanned_units su
      LEFT JOIN users u ON su.scanned_by = u.id
      WHERE su.box_id IN (SELECT id FROM delivery_boxes WHERE batch_id = ?)
      ORDER BY su.scanned_at DESC
    `).all(batch.id);

    // Get box_capacity from product_master using model_code
    const product = db.prepare('SELECT box_capacity FROM product_master WHERE model_code LIKE ?').get((soItem.model_code || '') + '%');
    const boxCapacity = product?.box_capacity || 50;
    res.json({ batch, soItem, so, boxes, scannedUnits, boxCapacity });
  } catch (error) {
    logger.error('Get batch error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch batch' } });
  }
});
export default router;

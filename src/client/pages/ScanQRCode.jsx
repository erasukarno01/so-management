// Scan QR Code Page - Split 2-Column Compact Layout with PDF Report
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box, ScanBarcode, Check, X, AlertCircle, ArrowLeft,
  Hash, Zap, Activity, Wifi, WifiOff, Volume2, VolumeX, ShieldCheck, ShieldX, FileText, Loader
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../api/client';
import { useToast, ErrorBoundary } from '../hooks';
import ScanErrorModal from '../components/ScanErrorModal';

const QR_POS = [8, 15, 21, 1, 13, 18, 7, 23, 3, 14, 11, 2, 17, 20];

function getSerial(qr) {
  if (!qr || qr.length !== 24) return null;
  return QR_POS.map(p => qr[p - 1]).join('');
}

function isValidQR(qr) {
  if (!qr) return { valid: false, error: null };
  const v = qr.trim().toUpperCase();
  if (!/^[0-9A-F]{24}$/.test(v)) {
    return { valid: false, error: 'Format tidak valid (harus 24 karakter hex)' };
  }
  return { valid: true, error: null, value: v };
}

function playBeep(type) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const playTone = (freq, duration, vol = 0.1) => {
      osc.frequency.value = freq;
      gain.gain.value = vol;
      osc.start();
      osc.stop(ctx.currentTime + duration);
    };
    if (type === 'success') {
      playTone(880, 0.1);
    } else if (type === 'error') {
      playTone(220, 0.3, 0.15);
    } else if (type === 'dup') {
      playTone(440, 0.15, 0.15);
      setTimeout(() => {
        try {
          const o2 = ctx.createOscillator();
          const g2 = ctx.createGain();
          o2.connect(g2);
          g2.connect(ctx.destination);
          o2.frequency.value = 440;
          g2.gain.value = 0.15;
          o2.start();
          o2.stop(ctx.currentTime + 0.15);
        } catch (_e) { /* ignore */ }
      }, 150);
    }
  } catch (_e) { /* ignore */ }
}

// PDF Report Generator - Match Modal Layout exactly
function generateDeliveryReport({ batch, so, soItem, boxes, units, capacity, logoImage }) {
  try {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - (margin * 2);
    const colWidth = (contentWidth / 2) - 5;


    // Logo on LEFT - before title
    const logoW = 14;
    const logoH = 14;
    const logoX = margin;
    const logoY = 8;
    // Use passed logo image
    if (logoImage) {
      try {
        doc.addImage(logoImage, 'PNG', logoX, logoY, logoW, logoH);
      } catch (e) {
        doc.setFillColor(13, 148, 136);
        doc.setFillColor(255, 255, 255);
        doc.setFontSize(8);
        doc.text('CL', logoX + logoW/2, logoY + logoH/2 + 2, { align: 'center' });
      }
    } else {
      // Fallback: draw simple logo
      doc.setFillColor(13, 148, 136);
      doc.roundedRect(logoX, logoY, logoW, logoH, 3, 3, 'F');
      doc.setFillColor(255, 255, 255);
      doc.setFontSize(8);
      doc.text('CL', logoX + logoW/2, logoY + logoH/2 + 2, { align: 'center' });
    }

    // Header title - next to logo
    const headerY = 14;
    const titleX = logoX + logoW + 8;
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(6, 95, 70);
    doc.text('DELIVERY REPORT', titleX, headerY);

    // Subtitle
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Sales Order Delivery Execution', titleX, headerY + 4);

    // Header divider line
    doc.setDrawColor(6, 95, 70);
    doc.setLineWidth(1);
    doc.line(margin, headerY + 12, pageWidth - margin, headerY + 12);

    let y = headerY + 16;

    // Info Table - using autoTable for cleaner format
    const infoData = [
      ['SO Number', so?.so_number || '-', 'Part No', soItem?.item_number || so?.primary_item_number || '-'],
      ['Customer', (so?.customer_name || '-').substring(0, 25), 'Model', (soItem?.model_code || so?.model || '-').substring(0, 15)],
      ['Destination', so?.destination_name || so?.destination_code || '-', 'Status', 'COMPLETED'],
      ['Delivery Date', so?.delivery_date ? new Date(so.delivery_date).toLocaleDateString('id-ID') : '-', 'Date', new Date().toLocaleDateString('id-ID')]
    ];

    autoTable(doc, {
      startY: y,
      body: infoData,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        0: { fontStyle: 'bold', textColor: [75, 85, 99] },
        1: { fontStyle: 'bold', textColor: [6, 95, 70] },
        2: { fontStyle: 'bold', textColor: [75, 85, 99] },
        3: { fontStyle: 'bold', textColor: [6, 95, 70] }
      },
      margin: { left: margin, right: margin },
      tableWidth: contentWidth,
      showHeader: 'never'
    });

    y = doc.lastAutoTable.finalY + 8;

    // Summary Box - Green themed (match modal)
    doc.setFillColor(236, 253, 245);
    doc.roundedRect(margin, y, contentWidth, 18, 3, 3, 'F');

    const sumBoxW = (contentWidth - 10) / 5;
    const sumData = [
      { label: 'Plan', value: batch?.qty_total || 0 },
      { label: 'Scanned', value: units.length, highlight: true },
      { label: 'Remaining', value: Math.max(0, (batch?.qty_total || 0) - units.length) },
      { label: 'Boxes Req', value: batch?.boxes_required || Math.ceil((batch?.qty_total || 0) / capacity) },
      { label: 'Sealed', value: boxes.filter(b => b.status === 'SEALED').length }
    ];

    sumData.forEach((item, i) => {
      const bx = margin + 5 + (i * sumBoxW);
      if (item.highlight) {
        doc.setFillColor(6, 95, 70);
        doc.roundedRect(bx, y + 3, sumBoxW - 5, 12, 2, 2, 'F');
        doc.setTextColor(255, 255, 255);
      } else {
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(bx, y + 3, sumBoxW - 5, 12, 2, 2, 'DF');
        doc.setTextColor(55, 65, 81);
      }
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(String(item.value), bx + (sumBoxW - 5) / 2, y + 10, { align: 'center' });
      doc.setFontSize(6);
      doc.setTextColor(item.highlight ? 220 : 100, item.highlight ? 252 : 116, item.highlight ? 231 : 139);
      doc.text(item.label, bx + (sumBoxW - 5) / 2, y + 14, { align: 'center' });
    });

    y += 24;

    // Box Details Table
    // Calculate qty_actual from scanned units for accuracy
    const boxCounts = {};
    units.forEach(u => {
      if (!boxCounts[u.box_id]) boxCounts[u.box_id] = 0;
      boxCounts[u.box_id]++;
    });

    doc.setTextColor(55, 65, 81);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('BOX DETAILS', margin, y);
    y += 4;

    const boxData = boxes.map((b, i) => {
      const actualQty = boxCounts[b.id] || b.qty_actual || 0;
      return [
        String(i + 1),
        b.box_label || 'Box ' + b.box_number,
        String(actualQty),
        b.status === 'SEALED' ? 'SEALED' : 'OPEN',
        actualQty > 0 ? ((actualQty / capacity * 100).toFixed(0) + '%') : '0%'
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [['#', 'Box Label', 'Qty', 'Status', 'Fill %']],
      body: boxData,
      theme: 'grid',
      headStyles: { fillColor: [6, 95, 70], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: { 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' } }
    });

    y = doc.lastAutoTable.finalY + 6;

    // Scanned Units Log
    doc.setTextColor(55, 65, 81);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('SCANNED UNITS LOG', margin, y);
    y += 4;

    const unitRows = units.slice(0, 100).map((u, i) => {
      const box = boxes.find(b => b.id === u.box_id);
      return [
        String(i + 1),
        u.serial_number || '-',
        (u.qr_code || '').substring(0, 18),
        new Date(u.scanned_at).toLocaleString('id-ID'),
        box?.box_label || box?.box_number || '-',
        u.prefix_valid ? 'VALID' : 'INVALID'
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [['#', 'Serial Number', 'QR Code', 'Scanned At', 'Box', 'Status']],
      body: unitRows,
      theme: 'grid',
      headStyles: { fillColor: [75, 85, 99], textColor: 255, fontSize: 7 },
      styles: { fontSize: 7, cellPadding: 2 }
    });

    y = doc.lastAutoTable.finalY + 12;

    // Signature Footer - only on last page
    // Add page if not enough space
    if (y > pageHeight - 50) {
      doc.addPage();
      y = margin;
    }

    const sigW = contentWidth / 3;

    // Signature labels
    doc.setFontSize(8);
    doc.setTextColor(55, 65, 81);
    doc.setFont('helvetica', 'bold');
    doc.text('Approved By', margin + sigW / 2, y, { align: 'center' });
    doc.text('Warehouse', margin + sigW + sigW / 2, y, { align: 'center' });
    doc.text('Received By', pageWidth - margin - sigW / 2, y, { align: 'center' });

    // Signature lines (h-8 = ~8mm)
    const lineY = y + 16;
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.5);
    doc.line(margin + 10, lineY, margin + sigW - 10, lineY);
    doc.line(margin + sigW + 10, lineY, margin + sigW * 2 - 10, lineY);
    doc.line(pageWidth - margin - sigW + 10, lineY, pageWidth - margin - 10, lineY);

    // Footer
    doc.setFontSize(7);
    doc.setTextColor(156, 163, 175);
    doc.text('Generated: ' + new Date().toLocaleString('id-ID'), margin, pageHeight - 6);
    doc.text('Page 1 of 1', pageWidth - margin, pageHeight - 6, { align: 'right' });

    const fileName = 'DeliveryReport_' + (so?.so_number || 'UNKNOWN') + '_' + new Date().toISOString().split('T')[0] + '.pdf';
    doc.save(fileName);
  } catch (err) {
    alert('Gagal generate PDF: ' + err.message);
  }
}
export function ScanQRCodeContent() {
  const navigate = useNavigate();
  const { batchId } = useParams();
  const toast = useToast();
  const inputRef = useRef(null);
  const lastScanRef = useRef(0);
  const logoImageRef = useRef(null);

  const [batch, setBatch] = useState(null);
  const [soItem, setSoItem] = useState(null);
  const [so, setSo] = useState(null);
  const [qr, setQr] = useState('');
  const [scanning, setScanning] = useState(false);
  const [units, setUnits] = useState([]);
  const [box, setBox] = useState(null);
  const [boxes, setBoxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [capacity, setCapacity] = useState(50);
  const [status, setStatus] = useState(null);
  const [soundOn, setSoundOn] = useState(true);
  const [online, setOnline] = useState(true);
  const [inputKey, setInputKey] = useState(0);
  const [errorModal, setErrorModal] = useState(null); // { isOpen, type, message, details }
  const [newBoxModal, setNewBoxModal] = useState({ isOpen: false, box: null, barcode: '' });
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [congratsModal, setCongratsModal] = useState({ isOpen: false });
  const [reportModal, setReportModal] = useState({ isOpen: false });
  const barcodeInputRef = useRef(null);

  // Preload logo image for PDF
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, 200, 200);
      logoImageRef.current = canvas.toDataURL('image/png');
    };
    img.src = '/logo.svg';
  }, []);

  const qrVal = useMemo(() => isValidQR(qr), [qr]);
  const serial = useMemo(() => qrVal.valid ? getSerial(qrVal.value) : null, [qrVal]);
  const prefixOk = useMemo(() => {
    if (!serial) return false;
    return serial.substring(0, 4).toUpperCase() === '0008';
  }, [serial]);

  const stats = useMemo(() => ({
    total: batch?.qty_total || 0,
    scanned: units.length, // Use units.length as source of truth
    remaining: (batch?.qty_total || 0) - units.length,
    boxQty: box?.qty_actual || 0,
    boxesTotal: batch?.boxes_required || Math.ceil((batch?.qty_total || 0) / capacity),
    boxesSealed: boxes.filter(b => b.status === 'SEALED').length,
    isComplete: units.length >= (batch?.qty_total || 0),
  }), [batch, units, box, boxes]);

  const progress = batch?.qty_total > 0 ? Math.min(100, Math.round((units.length / batch.qty_total) * 100)) : 0;
  const boxProg = capacity > 0 ? (stats.boxQty / capacity) * 100 : 0;

  useEffect(() => {
    if (!loading) {
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.value = '';
          inputRef.current.focus();
        }
      });
    }
  }, [loading]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    if (!batchId) {
      toast.error('Batch ID tidak ditemukan');
      navigate('/delivery');
      return;
    }
    loadBatch();
  }, [batchId]);

  // Show Congratulation Modal when Qty Plan = Qty Actual
  useEffect(() => {
    if (!batch || loading) return;
    if (stats.remaining !== 0) return;
    if (batch.status === 'COMPLETED') return;
    if (congratsModal.isOpen) return;

    // Show congratulation modal when plan is matched
    const timer = setTimeout(() => {
      setCongratsModal({ isOpen: true });
    }, 500);

    return () => clearTimeout(timer);
  }, [stats.remaining, batch, loading, congratsModal.isOpen]);

  // Handle Complete Batch from Congratulation Modal
  const handleCompleteFromCongrats = useCallback(async () => {
    setCongratsModal({ isOpen: false });

    try {
      if (box && box.status !== 'SEALED' && box.id) {
        // Skip sealing if box.id looks like a test/placeholder ID
        if (!box.id.includes('test') && box.id.length > 10) {
          try {
            await api.post('/delivery/seal-box', { box_id: box.id });
            setBoxes(prev => prev.map(b => b.id === box.id ? { ...b, status: 'SEALED' } : b));
          } catch (sealErr) {
          }
        }
      }

      // Mark batch as completed
      let completedBatch = null;
      try {
        completedBatch = await api.post('/delivery/complete-batch', { batch_id: batch.id });
      } catch (completeErr) {
        // Batch might already be completed - this is okay
      }

      // Refresh SO and SO Item data after completion
      if (completedBatch?.data) {
        const soId = so?.id;
        if (soId) {
          try {
            const soRes = await api.get('/sales-orders/' + encodeURIComponent(soId));
            if (soRes.data) setSo(soRes.data);
          } catch (_soErr) { /* ignore */ }
        }
        const soItemId = soItem?.id || batch?.so_item_id;
        if (soItemId && soId) {
          try {
            const itemsRes = await api.get('/delivery/so-items/' + encodeURIComponent(soId));
            const items = itemsRes.data || [];
            const matchedItem = items.find(i => i.id === soItemId);
            if (matchedItem) setSoItem(matchedItem);
          } catch (_itemsErr) { /* ignore */ }
        }
      }

      // Generate PDF
      setGeneratingPdf(true);
      try {
        generateDeliveryReport({
          so,
          soItem,
          boxes: boxes.map(b => ({ ...b, status: 'SEALED' })),
          units,
          capacity,
          logoImage: logoImageRef.current
        });
        setCongratsModal({ isOpen: false });
        setReportModal({ isOpen: true });
      } catch (_e) {
        console.error('PDF error:', _e);
        toast.success('Batch Complete!');
      } finally {
        setGeneratingPdf(false);
      }
    } catch (e) {
      console.error('Complete error:', e);
      toast.error(e.response?.data?.error?.message || 'Error completing batch');
    }
  }, [box, batch, so, soItem, boxes, units, capacity]);

  // Handle Continue Scanning
  const handleContinueScanning = useCallback(() => {
    setCongratsModal({ isOpen: false });
  }, []);

  async function loadBatch() {
    setLoading(true);
    try {
      const r = await api.get('/delivery/batches/' + batchId);
      const d = r.data;
      setBatch(d.batch || d);

      // Load SO details
      if (d.so) {
        setSo(d.so);
      } else if (d.batch?.so_id) {
        // Fetch SO details separately
        try {
          const soRes = await api.get('/sales-orders/' + encodeURIComponent(d.batch.so_id));
          setSo(soRes.data);
        } catch (_soErr) {
          // Ignore SO fetch error
        }
      }

      // Load SO Item details
      if (d.soItem) {
        setSoItem(d.soItem);
      } else if (d.batch?.so_item_id) {
        // Fetch items from SO
        try {
          const itemsRes = await api.get('/sales-orders/' + encodeURIComponent(d.batch.so_id) + '/items');
          const items = itemsRes.data || [];
          // Find matching item
          const matchedItem = items.find(i => i.id === d.batch.so_item_id) || items[0];
          if (matchedItem) {
            setSoItem(matchedItem);
          }
        } catch (_itemsErr) {
          // Ignore items fetch error
        }
      }

      setBoxes(d.boxes || []);
      setCapacity(d.boxCapacity || 50);

      // Load scanned units from server response
      const serverUnits = d.scannedUnits || [];
      setUnits(serverUnits);

      // Find or create first open box
      let openBox = d.boxes?.find(b => b.status !== 'SEALED');
      if (!openBox && d.boxes?.length > 0) {
        // All boxes are sealed, create new one
        const nb = await api.post('/delivery/boxes', { batch_id: batchId });
        openBox = nb.data;
        setBoxes([...d.boxes, openBox]);
      } else if (!openBox) {
        // No boxes exist, create first box
        const nb = await api.post('/delivery/boxes', { batch_id: batchId });
        openBox = nb.data;
        setBoxes([openBox]);
      }
      setBox(openBox);
    } catch (e) {
      toast.error('Gagal memuat data batch');
    } finally {
      setLoading(false);
    }
  }

  // Helper to reset input
  function resetInput() {
    setQr('');
    setInputKey(k => k + 1);
  }

  // Add visual indicator for debugging
  const [debug, setDebug] = useState('');

  async function ensureBox() {
    // If no box exists, create one
    if (!box && batch?.id) {
      const nb = await api.post('/delivery/boxes', { batch_id: batch.id });
      setBox(nb.data);
      setBoxes(prev => [...prev, nb.data]);
      return nb.data;
    }
    return box;
  }

  const doScan = useCallback(async (e) => {
    console.log('[SCAN] ===== doScan START =====');
    if (e?.key && e?.key !== 'Enter' && e?.key !== 'button') {
      console.log('[SCAN] doScan: wrong key, returning');
      return;
    }

    const currentQr = qr.trim().toUpperCase();
    console.log('[SCAN] doScan: currentQr:', currentQr);

    // Step 1: Check format (24 char hex)
    if (currentQr.length !== 24) {
      toast.error('QR harus 24 karakter. Sekarang: ' + currentQr.length + ' karakter');
      return;
    }
    if (!/^[0-9A-F]{24}$/.test(currentQr)) {
      toast.error('Format QR tidak valid. Gunakan karakter 0-9 dan A-F');
      return;
    }
    if (!batch) {
      toast.error('No batch');
      return;
    }

    // Ensure box exists
    let currentBox = box;
    if (!currentBox) {
      try {
        const nb = await api.post('/delivery/boxes', { batch_id: batch.id });
        currentBox = nb.data;
        setBox(currentBox);
        setBoxes(prev => [...prev, currentBox]);
      } catch (err) {
        toast.error('Gagal membuat box');
        return;
      }
    }

    const currentSerial = getSerial(currentQr);

    const now = Date.now();
    if (now - lastScanRef.current < 500) {
      return;
    }
    lastScanRef.current = now;

    setScanning(true);
    setStatus(null);

    try {
      // Step 2: Check if QR code already exists in database
      console.log('[SCAN] doScan: calling check-qr-exists');
      const checkExistsRes = await api.post('/delivery/check-qr-exists', { qr_code: currentQr });
      console.log('[SCAN] doScan: check-qr-exists response:', JSON.stringify(checkExistsRes.data));

      if (checkExistsRes.data.exists) {
        // QR code is duplicate - show error modal
        const duplicateInfo = checkExistsRes.data.duplicateInfo;
        setStatus('dup');
        if (soundOn) playBeep('dup');

        setErrorModal({
          isOpen: true,
          type: 'DUPLICATE',
          message: 'QR Code sudah pernah discan',
          qrCode: currentQr,
          serialNumber: currentSerial,
          existingScanInfo: {
            scannedAt: duplicateInfo.scannedAt,
            scannedBy: duplicateInfo.scannedBy,
            soNumber: duplicateInfo.soNumber,
            customerName: duplicateInfo.customerName,
            boxLabel: duplicateInfo.boxLabel
          }
        });
        resetInput();
        setScanning(false);
        return;
      }

      // Step 3: Validate prefix against SO item
      const validatePrefixRes = await api.post('/delivery/validate-prefix', {
        qr_code: currentQr,
        batch_id: batch.id
      });

      const prefixData = validatePrefixRes.data;
      const extractedSerial = prefixData.serialNumber || currentSerial;

      if (!prefixData.valid) {
        // Prefix mismatch - show error modal
        setStatus('error');
        if (soundOn) playBeep('error');

        const errorData = {
          isOpen: true,
          type: 'PREFIX_MISMATCH',
          message: prefixData.error?.message || 'Prefix tidak valid',
          qrCode: currentQr,
          serialNumber: extractedSerial,
          detectedPrefix: prefixData.prefixInfo?.detectedPrefix || (extractedSerial ? extractedSerial.substring(0, 4) : null),
          expectedPrefix: prefixData.prefixInfo?.expectedPrefix || soItem?.prefix || '0008',
          modelCode: soItem?.model_code,
          productInfo: prefixData.prefixInfo?.productInfo
        };
        setErrorModal(errorData);
        resetInput();
        setScanning(false);
        return;
      }

      // Step 4: All validations passed - do the actual scan
      const r = await api.post('/delivery/scan-unit', {
        batch_id: batch.id,
        box_id: currentBox.id,
        qr_code: currentQr,
        model_code: soItem?.model_code || ''
      });

      const u = r.data;
      const scanData = {
        ...u.scan,
        serial_number: u.serial_number || extractedSerial,
        qr_code: currentQr,
        prefix_valid: u.prefix_valid
      };

      // Add to units list
      setUnits(prev => [scanData, ...prev]);
      setStatus(scanData.prefix_valid ? 'success' : 'error');
      if (soundOn) playBeep('success');

      const updBox = r.data.box;
      const updBatch = r.data.batch;

      // Update box and batch states
      setBox(prev => prev ? { ...prev, qty_actual: updBox.qty_actual } : null);
      setBatch(prev => prev ? { ...prev, qty_scanned: updBatch.qty_scanned } : null);

      // Update so and soItem from scan response (realtime update)
      if (r.data.so) setSo(r.data.so);
      if (r.data.soItem) setSoItem(r.data.soItem);

      // Auto-seal conditions:
      // 1. Box reaches capacity, OR
      // 2. All qty_plan is complete (whichever comes first)
      const updatedUnitsCount = units.length + 1; // Include current scan
      const updatedRemaining = (batch.qty_total || 0) - updatedUnitsCount;
      const isBoxFull = updBox.qty_actual >= capacity;
      const isBatchComplete = updatedRemaining <= 0;

      // Seal the box if capacity reached OR batch complete
      if (isBoxFull || isBatchComplete) {
        await api.post('/delivery/seal-box', { box_id: currentBox.id });
        setBoxes(prev => prev.map(b => b.id === currentBox.id ? { ...b, status: 'SEALED' } : b));

        // If batch is complete (all qty_plan scanned), no more boxes needed
        if (isBatchComplete) {
          toast.success('Batch complete! All units scanned.');
          setQr('');
          setInputKey(k => k + 1);
          setTimeout(() => setStatus(null), 500);
          return;
        }

        // If box is full but batch not complete, mandatory barcode re-scan
        // This ensures user doesn't skip boxes
        toast.success('Box sealed! Wajib scan barcode untuk lanjut.');
        setNewBoxModal({
          isOpen: true,
          box: null,
          message: 'WAJIB scan barcode item card untuk box baru',
          required: true,
          batch_id: batch.id,
          batch_barcode: batch.item_card_barcode
        });
        return;
      }

      setQr('');
      setInputKey(k => k + 1);
      setTimeout(() => setStatus(null), 500);

    } catch (err) {
      console.log('[SCAN] doScan error:', err.message, 'status:', err.response?.status);
      const st = err.response?.status;
      const apiError = err.response?.data?.error;
      const msg = apiError?.message || err.message || 'Scan gagal';

      // Reset input immediately for any error
      resetInput();

      if (st === 409) {
        setStatus('dup');
        if (soundOn) playBeep('dup');

        const duplicateInfo = apiError?.duplicateInfo || {};
        const errorData = {
          isOpen: true,
          type: 'DUPLICATE',
          message: msg,
          qrCode: currentQr,
          serialNumber: getSerial(currentQr) || currentSerial,
          existingScanInfo: {
            scannedAt: duplicateInfo.scannedAt,
            scannedBy: duplicateInfo.scannedBy,
            soNumber: duplicateInfo.soNumber,
            boxLabel: duplicateInfo.boxLabel
          }
        };
        setErrorModal(errorData);
      } else if (st === 400) {
        // Validation error - check for prefix mismatch
        setStatus('error');
        if (soundOn) playBeep('error');

        const prefixMismatchData = apiError?.prefixMismatch;
        const isPrefixMismatch = apiError?.type === 'PREFIX_MISMATCH' || msg.toLowerCase().includes('prefix');
        const extractedSerial = getSerial(currentQr) || currentSerial;

        const errorData = {
          isOpen: true,
          type: isPrefixMismatch ? 'PREFIX_MISMATCH' : 'VALIDATION',
          message: msg,
          qrCode: currentQr,
          serialNumber: extractedSerial,
          detectedPrefix: prefixMismatchData?.detectedPrefix || (extractedSerial ? extractedSerial.substring(0, 4) : null),
          expectedPrefix: prefixMismatchData?.expectedPrefix || soItem?.prefix || '0008',
          modelCode: prefixMismatchData?.modelCode || soItem?.model_code,
          productInfo: prefixMismatchData?.productInfo
        };
        setErrorModal(errorData);
      } else {
        // Other errors (network, server, etc.)
        setStatus('error');
        if (soundOn) playBeep('error');

        const errorData = {
          isOpen: true,
          type: st ? 'SERVER' : 'NETWORK',
          message: msg,
          qrCode: currentQr,
          serialNumber: getSerial(currentQr) || currentSerial
        };
        setErrorModal(errorData);
      }

      setTimeout(() => setStatus(null), 2000);
    } finally {
      setScanning(false);
    }
  }, [box, batch, soItem, capacity, soundOn, qr]);

  // Process scan after box is ready - with client-side validation
  const processScan = useCallback((currentBox, currentQr) => {
    console.log('[SCAN] ===== processScan START =====');
    console.log('[SCAN] currentQr:', currentQr);
    console.log('[SCAN] currentBox:', currentBox?.id);
    console.log('[SCAN] batch:', batch?.id);
    const currentSerial = getSerial(currentQr);
    console.log('[SCAN] currentSerial:', currentSerial);
    const now = Date.now();
    if (now - lastScanRef.current < 500) {
      setScanning(false);
      return;
    }
    lastScanRef.current = now;

    // Step 2: Check if QR code already exists in database
    console.log('[SCAN] Checking QR exists for:', currentQr);
    api.post('/delivery/check-qr-exists', { qr_code: currentQr })
      .then(checkExistsRes => {
        console.log('[SCAN] check-qr-exists response:', JSON.stringify(checkExistsRes.data));
        if (checkExistsRes.data.exists) {
          // QR code is duplicate - show error modal
          const duplicateInfo = checkExistsRes.data.duplicateInfo;
          console.log('[SCAN] Duplicate detected!');
          setStatus('dup');
          if (soundOn) playBeep('dup');
          setErrorModal({
            isOpen: true,
            type: 'DUPLICATE',
            message: 'QR Code sudah pernah discan',
            qrCode: currentQr,
            serialNumber: currentSerial,
            existingScanInfo: {
              scannedAt: duplicateInfo.scannedAt,
              scannedBy: duplicateInfo.scannedBy,
              soNumber: duplicateInfo.soNumber,
              customerName: duplicateInfo.customerName,
              boxLabel: duplicateInfo.boxLabel
            }
          });
          resetInput();
          setScanning(false);
          return; // Return undefined to stop chain
        }

        console.log('[SCAN] QR not duplicate, proceeding to prefix validation');
        // Step 3: Validate prefix against SO item
        return api.post('/delivery/validate-prefix', {
          qr_code: currentQr,
          batch_id: batch.id
        });
      })
      .then(validatePrefixRes => {
        console.log('[SCAN] validate-prefix response:', validatePrefixRes ? JSON.stringify(validatePrefixRes.data) : 'undefined');
        // If check-qr-exists returned exists=true, validatePrefixRes will be undefined
        if (!validatePrefixRes) {
          console.log('[SCAN] validatePrefixRes is undefined, skipping');
          return;
        }

        const prefixData = validatePrefixRes.data;
        const extractedSerial = prefixData.serialNumber || currentSerial;

        if (!prefixData.valid) {
          // Prefix mismatch - show error modal
          setStatus('error');
          if (soundOn) playBeep('error');
          setErrorModal({
            isOpen: true,
            type: 'PREFIX_MISMATCH',
            message: prefixData.error?.message || 'Prefix tidak valid',
            qrCode: currentQr,
            serialNumber: extractedSerial,
            detectedPrefix: prefixData.prefixInfo?.detectedPrefix || (extractedSerial ? extractedSerial.substring(0, 4) : null),
            expectedPrefix: prefixData.prefixInfo?.expectedPrefix || soItem?.prefix || '0008',
            modelCode: soItem?.model_code,
            productInfo: prefixData.prefixInfo?.productInfo
          });
          resetInput();
          setScanning(false);
          return;
        }

        // Step 4: All validations passed - do the actual scan
        console.log('[SCAN] All validations passed, calling scan-unit');
        return api.post('/delivery/scan-unit', {
          batch_id: batch.id,
          box_id: currentBox.id,
          qr_code: currentQr,
          model_code: soItem?.model_code || ''
        });
      })
      .then(r => {
        // If prefix validation failed, r will be undefined
        if (!r) {
          console.log('[SCAN] Skipping scan-unit (validation failed)');
          return;
        }

        console.log('[SCAN]', new Date().toISOString(), 'SUCCESS:', JSON.stringify(r.data));
        const u = r.data;
        const scanData = {
          ...u.scan,
          serial_number: u.serial_number || currentSerial,
          qr_code: currentQr,
          prefix_valid: u.prefix_valid
        };
        setUnits(prev => [scanData, ...prev]);
        setStatus(scanData.prefix_valid ? 'success' : 'error');
        if (soundOn) playBeep('success');

        const updBox = r.data.box;
        const updBatch = r.data.batch;
        setBox(prev => prev ? { ...prev, qty_actual: updBox.qty_actual } : null);
        setBatch(prev => prev ? { ...prev, qty_scanned: updBatch.qty_scanned } : null);

        // Update so and soItem from scan response (realtime update)
        if (r.data.so) setSo(r.data.so);
        if (r.data.soItem) setSoItem(r.data.soItem);

        if (updBox.qty_actual >= capacity) {
          api.post('/delivery/seal-box', { box_id: currentBox.id }).then(() => {
            api.post('/delivery/boxes', { batch_id: batch.id }).then(nb => {
              const newBox = nb.data;
              setBoxes(prev => [...prev.map(b => b.id === currentBox.id ? { ...b, status: 'SEALED' } : b), newBox]);
              setBox(newBox);
              toast.success('Box sealed!');
            });
          });
        }

        setQr('');
        setInputKey(k => k + 1);
        setTimeout(() => setStatus(null), 500);
      })
      .catch(err => {
        console.log('[SCAN]', new Date().toISOString(), 'ERROR:', err.response?.status, err.response?.data);
        const st = err.response?.status;
        const apiError = err.response?.data?.error;
        const msg = apiError?.message || err.message || 'Scan gagal';
        resetInput();
        if (st === 409) {
          console.log('[SCAN] Duplicate detected!');
          setStatus('dup');
          if (soundOn) playBeep('dup');
          setErrorModal({
            isOpen: true,
            type: 'DUPLICATE',
            message: msg,
            qrCode: currentQr,
            serialNumber: currentSerial,
            existingScanInfo: apiError?.duplicateInfo
          });
        } else {
          setStatus('error');
          if (soundOn) playBeep('error');
          setErrorModal({ isOpen: true, type: 'SERVER', message: msg, qrCode: currentQr, serialNumber: currentSerial });
        }
        setTimeout(() => setStatus(null), 2000);
      })
      .finally(() => {
        setScanning(false);
      });
  }, [batch, soItem, capacity, soundOn]);

  async function doComplete() {
    if (stats.remaining > 0) {
      toast.error(stats.remaining + ' unit belum discan');
      return;
    }
    if (!window.confirm('Yakin selesaikan batch?\n\n' + stats.boxesTotal + ' box akan disegel.\nTotal ' + stats.scanned + ' unit.\n\nPDF Report akan otomatis di-generate.')) {
      return;
    }
    try {
      // Seal only boxes with content (qty_actual > 0)
      for (const b of boxes) {
        if (b.status !== 'SEALED' && b.qty_actual > 0) {
          await api.post('/delivery/seal-box', { box_id: b.id });
        }
      }

      // Complete batch
      const completeRes = await api.post('/delivery/complete-batch', { batch_id: batch.id });

      // Refresh SO and SO Item data after completion
      if (completeRes?.data) {
        const soId = so?.id;
        if (soId) {
          try {
            const soRes = await api.get('/sales-orders/' + encodeURIComponent(soId));
            if (soRes.data) setSo(soRes.data);
          } catch (_soErr) { /* ignore */ }
        }
        const soItemId = soItem?.id || batch?.so_item_id;
        if (soItemId && soId) {
          try {
            const itemsRes = await api.get('/delivery/so-items/' + encodeURIComponent(soId));
            const items = itemsRes.data || [];
            const matchedItem = items.find(i => i.id === soItemId);
            if (matchedItem) setSoItem(matchedItem);
          } catch (_itemsErr) { /* ignore */ }
        }
      }

      // Generate PDF Report
      setGeneratingPdf(true);
      try {
        const allBoxes = [...boxes];
        generateDeliveryReport({
          batch,
          so,
          soItem,
          boxes: allBoxes.map((b, i) => ({ ...b, status: 'SEALED' })),
          units,
          capacity,
          logoImage: logoImageRef.current
        });
        toast.success('Batch selesai! PDF Report downloaded.');
      } catch (pdfErr) {
        console.error('PDF generation error:', pdfErr);
        toast.warning('Batch selesai tapi PDF gagal di-generate');
      } finally {
        setGeneratingPdf(false);
      }

      navigate('/delivery');
    } catch (e) {
      toast.error(e.response?.data?.error?.message || 'Gagal');
    }
  }

  function doCancel() {
    if (units.length > 0) {
      if (!window.confirm('Batal? Data tersimpan tetap aman.')) return;
    }
    navigate('/delivery');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-slate-400">Memuat...</p>
        </div>
      </div>
    );
  }

  if (!batch?.id) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center p-8">
          <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-10 h-10 text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Batch Tidak Ditemukan</h2>
          <p className="text-slate-400 mb-6">Batch tidak valid atau dihapus.</p>
          <button onClick={() => navigate('/delivery')} className="px-6 py-3 bg-emerald-500 rounded-xl font-medium hover:bg-emerald-400">Kembali</button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Inject CSS for animations */}
      <style>{`
        @keyframes shine {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        .animate-shine {
          animation: shine 1.5s ease-in-out infinite;
        }
      `}</style>

    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 flex flex-col">
      {/* Header - Gradient & Compact */}
      <header className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600 px-4 py-2.5 flex items-center justify-between shadow-lg shadow-emerald-500/20">
        <div className="flex items-center gap-3">
          <button onClick={doCancel} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <ScanBarcode className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-white text-base font-bold tracking-tight">{so?.so_number || 'Scanner'}</span>
              <span className="block text-emerald-200 text-[10px]">{so?.customer_name || '-'}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
            online ? 'bg-white/20 text-white' : 'bg-red-500/30 text-red-200'
          }`}>
            {online ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {online ? 'Online' : 'Offline'}
          </span>
          <button onClick={() => setSoundOn(!soundOn)} className={`p-2 rounded-xl transition-colors ${
            soundOn ? 'bg-white/20 text-white' : 'bg-white/10 text-white/50'
          }`}>
            {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Content - Split 2 Columns */}
      <div className="flex-1 overflow-hidden flex">
        {/* LEFT COLUMN - Scanner Focus */}
        <div className="w-3/5 p-3 space-y-2 overflow-y-auto border-r border-slate-700/30">

          {/* Stats Bar - Ultra Compact */}
          <div className="bg-gradient-to-r from-slate-800 to-slate-800/80 rounded-xl p-2.5 border border-slate-700/50">
            <div className="flex items-center justify-between">
              {/* Progress */}
              <div className="flex items-center gap-3 flex-1">
                <div className="relative w-full max-w-[200px] h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`absolute inset-y-0 left-0 rounded-full transition-all duration-300 ${
                      status === 'success' ? 'bg-emerald-400' :
                      status === 'dup' ? 'bg-amber-500 animate-pulse' :
                      status === 'error' ? 'bg-red-500' :
                      'bg-emerald-500'
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-white font-bold text-sm">{progress}%</span>
              </div>

              {/* Stats Pills */}
              <div className="flex items-center gap-2">
                <div className="px-2.5 py-1 bg-emerald-500/20 rounded-lg text-center">
                  <span className="text-emerald-400 font-bold text-sm">{stats.scanned}</span>
                  <span className="text-slate-500 text-[10px] ml-1">/ {stats.total}</span>
                </div>
                <div className="px-2.5 py-1 bg-slate-700/50 rounded-lg text-center">
                  <span className="text-amber-400 font-bold text-sm">{stats.remaining}</span>
                  <span className="text-slate-500 text-[10px] ml-1">sisa</span>
                </div>
                <div className="px-2.5 py-1 bg-blue-500/20 rounded-lg text-center">
                  <span className="text-blue-400 font-bold text-sm">{stats.boxesSealed}</span>
                  <span className="text-slate-500 text-[10px] ml-1">/ {stats.boxesTotal} box</span>
                </div>
              </div>
            </div>
          </div>

          {/* QR Scanner Card - Main Focus */}
          <div className={`bg-slate-800 rounded-xl p-3 border-2 transition-all ${
            status === 'dup' ? 'border-amber-500 shadow-lg shadow-amber-500/30 animate-pulse' :
            status === 'error' ? 'border-red-500 shadow-lg shadow-red-500/30' :
            qr.length === 24 && qrVal.valid ? 'border-emerald-500 shadow-lg shadow-emerald-500/30' :
            qr.length > 0 ? 'border-amber-500/50' :
            'border-slate-700'
          }`}>
            {/* Header Row */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  status === 'dup' ? 'bg-amber-500' : status === 'error' ? 'bg-red-500' :
                  qr.length === 24 ? 'bg-emerald-500' : 'bg-slate-700'
                }`}>
                  {status === 'dup' ? <AlertCircle className="w-4 h-4 text-white" /> :
                   status === 'error' ? <X className="w-4 h-4 text-white" /> :
                   qr.length === 24 ? <Check className="w-4 h-4 text-white" /> :
                   <ScanBarcode className="w-4 h-4 text-slate-400" />}
                </div>
                <div>
                  <span className="text-white text-sm font-bold">SCAN QR</span>
                  <span className="text-slate-500 text-[10px] block">Aktifkan scanner</span>
                </div>
              </div>
              {/* Box Capacity */}
              <div className="flex items-center gap-1.5">
                <Box className="w-4 h-4 text-amber-400" />
                <span className="font-mono font-bold text-lg text-amber-400">{stats.boxQty}</span>
                <span className="text-slate-500 text-xs">/{capacity}</span>
              </div>
            </div>

            {/* Input */}
	            <input
              key={'scan-input-' + inputKey}
              ref={inputRef}
              type="text"
              value={qr}
              onChange={e => {
                const val = e.target.value.toUpperCase();
                setQr(val);
                setStatus(null);
                // Auto trigger scan when QR length = 24
                if (val.length === 24 && /^[0-9A-F]{24}$/.test(val) && !scanning && batch?.id) {
                  doScan({ key: 'Enter' });
                }
              }}
              onKeyDown={e => { if (e.key === 'Enter' && e.target.value.length === 24 && !scanning) doScan({ key: 'Enter' }); }}
              placeholder="SCAN QR..."
              className={`w-full px-3 py-3 text-lg font-mono font-bold rounded-lg border-2 transition-all ${
                status === 'dup' ? 'border-amber-500 bg-amber-900/30 text-amber-300' :
                qr.length === 24 && qrVal.valid ? 'border-emerald-500 bg-emerald-900/30 text-emerald-300' :
                qr.length > 0 ? 'border-red-500 bg-red-900/30 text-red-300' :
                'border-slate-600 bg-slate-700 text-white placeholder-slate-500'
              }`}
              autoComplete="off"
              autoCapitalize="characters"
              autoFocus
            />

            {/* Scan Button */}
            <button
              id="scan-button"
              type="button"
              onClick={() => {
                if (scanning) return;
                const currentQr = qr.trim().toUpperCase();
                console.log('[SCAN] Button clicked, QR:', currentQr);
                if (currentQr.length !== 24) {
                  toast.error('QR harus 24 karakter. Sekarang: ' + currentQr.length + ' karakter');
                  return;
                }
                if (!/^[0-9A-F]{24}$/.test(currentQr)) {
                  toast.error('Format QR tidak valid. Gunakan karakter 0-9 dan A-F');
                  return;
                }
                if (!batch || !batch.id) {
                  toast.error('Batch tidak ditemukan');
                  return;
                }
                setScanning(true);
                setStatus(null);

                const currentBox = box;
                console.log('[SCAN] Current box:', currentBox ? currentBox.id : 'none');
                if (!currentBox) {
                  api.post('/delivery/boxes', { batch_id: batch.id }).then(nb => {
                    setBox(nb.data);
                    setBoxes(prev => [...prev, nb.data]);
                    console.log('[SCAN] Box created, calling processScan');
                    processScan(nb.data, currentQr);
                  }).catch((err) => {
                    toast.error('Gagal membuat box: ' + (err.response?.data?.error?.message || err.message));
                    setScanning(false);
                  });
                } else {
                  console.log('[SCAN] Calling processScan with existing box');
                  processScan(currentBox, currentQr);
                }
              }}
              className="w-full mt-2 py-2.5 px-4 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white"
            >
              <ScanBarcode className="w-4 h-4" />
              {scanning ? 'MEMPROSES...' : qr.length < 24 ? `${qr.length}/24` : 'SCAN'}
            </button>

            {/* Serial Preview */}
            {serial && (
              <div className="mt-2 pt-2 border-t border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Hash className="w-4 h-4 text-emerald-400" />
                  <span className="font-mono text-xl font-bold text-emerald-300">{serial}</span>
                </div>
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold ${
                  prefixOk ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                }`}>
                  {prefixOk ? <ShieldCheck className="w-4 h-4" /> : <ShieldX className="w-4 h-4" />}
                  {prefixOk ? 'VALID' : 'INVALID'}
                </div>
              </div>
            )}
          </div>

          {/* Box Pills - Visual */}
          <div className="flex items-center gap-1.5 p-2 bg-slate-800/50 rounded-xl">
            <span className="text-slate-500 text-[10px] uppercase mr-1">Box:</span>
            {boxes.slice(-10).map((b, i) => (
              <div
                key={b.id}
                className={`w-8 h-8 rounded-lg text-xs font-bold flex items-center justify-center transition-all ${
                  b.id === box?.id
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                    : b.status === 'SEALED'
                    ? 'bg-slate-600 text-slate-400'
                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/50'
                }`}
              >
                {b.status === 'SEALED' ? <Check className="w-4 h-4" /> : i + 1}
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT COLUMN - Info & Log */}
        <div className="w-2/5 p-3 space-y-2 overflow-y-auto bg-slate-900/30">

          {/* SO Details - Compact */}
          <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span className="text-emerald-400 text-xs font-bold uppercase tracking-wider">Detail</span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <div className="flex items-center gap-1">
                <span className="text-slate-500 w-14">SO</span>
                <span className="text-emerald-400 font-mono font-bold">{so?.so_number || '-'}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-slate-500 w-14">Part</span>
                <span className="text-slate-300 font-mono">{soItem?.item_number || so?.primary_item_number || '-'}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-slate-500 w-14">Model</span>
                <span className="text-slate-300 font-mono">{soItem?.model_code || so?.model || '-'}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-slate-500 w-14">Customer</span>
                <span className="text-slate-300 truncate">{so?.customer_name || '-'}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-slate-500 w-14">Dest</span>
                <span className="text-slate-300 truncate">{so?.delivery_destination || so?.destination_name || '-'}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-slate-500 w-14">Date</span>
                <span className="text-slate-300">{so?.delivery_date ? new Date(so.delivery_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : '-'}</span>
              </div>
            </div>
          </div>

          {/* Scan Log - Detailed Table */}
          <div className="bg-slate-800/80 rounded-xl overflow-hidden border border-slate-700/50 flex flex-col" style={{ maxHeight: 'calc(100vh - 220px)' }}>
            {/* Header */}
            <div className="px-3 py-2 bg-slate-800 border-b border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-400" />
                <span className="text-slate-300 text-xs font-semibold uppercase">Scan Log</span>
              </div>
              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-[10px] font-bold">
                {units.length}
              </span>
            </div>

            {/* Table Header */}
            <div className="px-3 py-1.5 bg-slate-700/30 border-b border-slate-700/50 grid grid-cols-[1fr_1fr_90px_70px_60px] gap-2 text-[9px] text-slate-400 uppercase tracking-wider">
              <span>QR Code</span>
              <span>Serial Number</span>
              <span>Scanned At</span>
              <span>By</span>
              <span>Status</span>
            </div>

            {/* Table Body */}
            <div className="flex-1 overflow-y-auto">
              {units.length === 0 ? (
                <div className="py-8 text-center">
                  <ScanBarcode className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-slate-500 text-xs">Scan QR untuk memulai</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-700/30">
                  {units.slice(0, 50).map((u, i) => {
                    const scanTime = new Date(u.scanned_at);
                    const dateStr = scanTime.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' }).toUpperCase();
                    const timeStr = scanTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                    const scannedBy = u.scanned_by || u.user_name || 'System';

                    return (
                      <div
                        key={u.id || u.qr_code + u.scanned_at}
                        className={`px-3 py-2 grid grid-cols-[1fr_1fr_90px_70px_60px] gap-2 items-center hover:bg-slate-700/30 ${i === 0 ? 'bg-emerald-500/5' : ''}`}
                      >
                        {/* QR Code */}
                        <span className="font-mono text-[10px] text-slate-400 tracking-wider truncate" title={u.qr_code}>
                          {u.qr_code || '-'}
                        </span>

                        {/* Serial Number */}
                        <div className="flex items-center gap-1.5">
                          <span className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
                            u.prefix_valid ? 'bg-emerald-500/20' : 'bg-red-500/20'
                          }`}>
                            {u.prefix_valid
                              ? <Check className="w-2.5 h-2.5 text-emerald-400" />
                              : <X className="w-2.5 h-2.5 text-red-400" />}
                          </span>
                          <span className="font-mono text-xs text-emerald-300 font-medium truncate">
                            {u.serial_number || '-'}
                          </span>
                        </div>

                        {/* Scanned At */}
                        <div className="text-[10px]">
                          <span className="text-slate-300">{dateStr}</span>
                          <span className="text-slate-500 ml-1">{timeStr}</span>
                        </div>

                        {/* Scanned By */}
                        <span className="text-[10px] text-slate-400 truncate">
                          {scannedBy}
                        </span>

                        {/* Status Badge */}
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold text-center ${
                          u.prefix_valid
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}>
                          {u.prefix_valid ? 'VALID' : 'INVALID'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer Stats */}
            {units.length > 0 && (
              <div className="px-3 py-1.5 bg-slate-900/50 border-t border-slate-700/50 flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400">{units.filter(u => u.prefix_valid).length} valid</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <X className="w-3 h-3 text-red-400" />
                    <span className="text-red-400">{units.filter(u => !u.prefix_valid).length} invalid</span>
                  </span>
                </div>
                <span className="text-slate-500">Updated: {new Date().toLocaleTimeString('id-ID')}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error Modal */}
      <ScanErrorModal
        isOpen={errorModal?.isOpen}
        onClose={() => setErrorModal(null)}
        error={errorModal}
        onRetry={() => setErrorModal(null)}
      />

      {/* New Box Barcode Scan Modal */}
      {newBoxModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 border border-amber-500 overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-amber-500 to-amber-600">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <Box className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg">
                    {newBoxModal.required ? 'Box Penuh - Wajib Scan Ulang' : 'New Box Created'}
                  </h3>
                  <p className="text-amber-100 text-xs">
                    {newBoxModal.required
                      ? 'Scan item card barcode untuk lanjut ke box berikutnya'
                      : 'Scan Item Card Barcode to continue'}
                  </p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4">
              {newBoxModal.required && (
                <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 text-center">
                  <p className="text-red-400 font-bold text-sm">WAJIB SCAN BARCODE</p>
                  <p className="text-slate-400 text-xs mt-1">Box sebelumnya sudah penuh</p>
                </div>
              )}

              <div className="bg-slate-700/50 rounded-xl p-4 text-center">
                <p className="text-slate-400 text-sm mb-2">Box #{boxes.filter(b => b.status === 'SEALED').length + 1}</p>
                <p className="text-amber-400 font-bold text-lg">Kapasitas: {capacity} units</p>
              </div>

              <div>
                <label className="block text-slate-400 text-xs mb-2 uppercase tracking-wider">
                  Scan Item Card Barcode
                </label>
                <input
                  ref={barcodeInputRef}
                  type="text"
                  value={newBoxModal.barcode}
                  onChange={e => {
                    const val = e.target.value.toUpperCase();
                    setNewBoxModal(prev => ({ ...prev, barcode: val }));
                    // Auto submit when length = 24
                    if (val.length === 24 && /^[0-9A-F]{24}$/.test(val)) {
                      handleNewBoxBarcodeSubmit();
                    }
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newBoxModal.barcode.length >= 10) {
                      handleNewBoxBarcodeSubmit();
                    }
                  }}
                  placeholder="SCAN BARCODE..."
                  className="w-full px-4 py-3 bg-slate-700 border-2 border-slate-600 rounded-xl text-white font-mono text-center focus:border-amber-500 focus:outline-none"
                  autoFocus
                />
              </div>

              <button
                onClick={handleNewBoxBarcodeSubmit}
                disabled={newBoxModal.barcode.length < 10}
                className="w-full px-4 py-3 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                {newBoxModal.required ? 'Verifikasi & Buat Box Baru' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Generating Modal */}
      {generatingPdf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-800 rounded-2xl shadow-2xl p-8 text-center border border-emerald-500/30">
            <div className="w-16 h-16 mx-auto mb-4">
              <Loader className="w-16 h-16 text-emerald-400 animate-spin" />
            </div>
            <h3 className="text-white font-bold text-lg mb-2">Generating Report...</h3>
            <p className="text-slate-400 text-sm">Creating PDF delivery report</p>
          </div>
        </div>
      )}

      {/* Congratulation Modal - When Qty Plan = Qty Actual */}
      {congratsModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-gradient-to-b from-slate-800 to-slate-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 border border-emerald-500/50 overflow-hidden">
            {/* Header - Celebration */}
            <div className="px-6 py-8 bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500 text-center">
              <div className="w-20 h-20 mx-auto mb-3 bg-white/20 rounded-full flex items-center justify-center">
                <Check className="w-12 h-12 text-white" />
              </div>
              <h2 className="text-white text-2xl font-bold mb-1">Congratulations!</h2>
              <p className="text-emerald-100 text-sm">All units have been scanned</p>
            </div>

            {/* Stats Summary */}
            <div className="px-6 py-5">
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="bg-slate-700/50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-400">{stats.total}</p>
                  <p className="text-slate-400 text-[10px] uppercase">Plan</p>
                </div>
                <div className="bg-emerald-500/20 rounded-xl p-3 text-center border border-emerald-500/30">
                  <p className="text-2xl font-bold text-emerald-400">{stats.scanned}</p>
                  <p className="text-emerald-400 text-[10px] uppercase">Scanned</p>
                </div>
                <div className="bg-slate-700/50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-blue-400">{stats.boxesSealed}</p>
                  <p className="text-slate-400 text-[10px] uppercase">Sealed</p>
                </div>
              </div>

              {/* SO Info */}
              <div className="bg-slate-700/30 rounded-xl p-3 mb-5">
                <p className="text-slate-400 text-[10px] uppercase mb-1">Sales Order</p>
                <p className="text-white font-bold">{so?.so_number || '-'}</p>
                <p className="text-slate-400 text-xs">{so?.customer_name || '-'}</p>
              </div>

              {/* Actions */}
              <div className="space-y-3">
                <button
                  onClick={handleCompleteFromCongrats}
                  className="w-full px-4 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl font-bold hover:from-emerald-400 hover:to-emerald-500 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30"
                >
                  <FileText className="w-5 h-5" />
                  View Report
                </button>
                <button
                  onClick={handleContinueScanning}
                  className="w-full px-4 py-3 bg-slate-700 text-slate-300 rounded-xl font-medium hover:bg-slate-600 transition-colors"
                >
                  Continue Scanning (Optional)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Report Modal - Full Report View */}
      {reportModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Delivery Report</h3>
                  <p className="text-emerald-100 text-xs">{so?.so_number}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => generateDeliveryReport({ batch, so, soItem, boxes, units, capacity, logoImage: logoImageRef.current })}
                  className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  Download PDF
                </button>
                <button
                  onClick={() => navigate('/delivery')}
                  className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Report Content - A4 Style */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-100">
              <div className="bg-white shadow-lg rounded-lg p-6 mx-auto" style={{ maxWidth: '210mm', minHeight: '297mm' }}>
                {/* Header with Logo on Right */}
                <div className="flex items-start justify-between mb-4 pb-3 border-b-2 border-emerald-600">
                  <div className="flex-1">
                    <h1 className="text-xl font-bold text-emerald-700">DELIVERY REPORT</h1>
                    <p className="text-xs text-slate-500">Sales Order Delivery Execution</p>
                  </div>
                  <div className="text-right">
                    <div className="w-16 h-16 bg-emerald-100 rounded-lg flex items-center justify-center mb-1 mx-auto">
                      <img src="/logo.png" alt="Logo" className="max-w-full max-h-full object-contain" onError={(e) => e.target.style.display='none'} />
                    </div>
                    <p className="text-sm font-bold text-emerald-700">CHAO LONG</p>
                    <p className="text-[10px] text-slate-500">INDIA PVT LTD</p>
                  </div>
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                  <div className="space-y-1">
                    <p><span className="font-semibold text-slate-600">SO Number:</span> <span className="font-mono">{so?.so_number || '-'}</span></p>
                    <p><span className="font-semibold text-slate-600">Customer:</span> {so?.customer_name || '-'}</p>
                    <p><span className="font-semibold text-slate-600">Destination:</span> {so?.delivery_destination || so?.destination_name || '-'}</p>
                    <p><span className="font-semibold text-slate-600">Delivery Date:</span> {so?.delivery_date ? new Date(so.delivery_date).toLocaleDateString('id-ID') : '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <p><span className="font-semibold text-slate-600">Part No:</span> <span className="font-mono">{soItem?.item_number || so?.primary_item_number || '-'}</span></p>
                    <p><span className="font-semibold text-slate-600">Model:</span> <span className="font-mono">{soItem?.model_code || so?.model || '-'}</span></p>
                    <p><span className="font-semibold text-slate-600">Status:</span> <span className="text-emerald-600 font-bold">COMPLETED</span></p>
                    <p><span className="font-semibold text-slate-600">Date:</span> {new Date().toLocaleDateString('id-ID')}</p>
                  </div>
                </div>

                {/* Summary Box */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4">
                  <p className="text-xs font-bold text-emerald-700 mb-2">SUMMARY</p>
                  <div className="grid grid-cols-5 gap-2 text-center text-xs">
                    <div className="bg-white rounded p-2">
                      <p className="text-lg font-bold text-slate-700">{batch?.qty_total || 0}</p>
                      <p className="text-slate-500">Plan</p>
                    </div>
                    <div className="bg-emerald-500 text-white rounded p-2">
                      <p className="text-lg font-bold">{units.length}</p>
                      <p className="text-emerald-100">Scanned</p>
                    </div>
                    <div className="bg-white rounded p-2">
                      <p className="text-lg font-bold text-slate-700">{(batch?.qty_total || 0) - units.length}</p>
                      <p className="text-slate-500">Remaining</p>
                    </div>
                    <div className="bg-white rounded p-2">
                      <p className="text-lg font-bold text-slate-700">{batch?.boxes_required || Math.ceil((batch?.qty_total || 0) / capacity)}</p>
                      <p className="text-slate-500">Boxes Req</p>
                    </div>
                    <div className="bg-white rounded p-2">
                      <p className="text-lg font-bold text-blue-600">{boxes.filter(b => b.status === 'SEALED').length}</p>
                      <p className="text-slate-500">Sealed</p>
                    </div>
                  </div>
                </div>

                {/* Box Details */}
                <div className="mb-4">
                  <p className="text-sm font-bold text-slate-700 mb-2">BOX DETAILS</p>
                  <table className="w-full text-xs border border-slate-200 rounded overflow-hidden">
                    <thead className="bg-emerald-600 text-white">
                      <tr>
                        <th className="px-2 py-1 text-left">#</th>
                        <th className="px-2 py-1 text-left">Box Label</th>
                        <th className="px-2 py-1 text-center">Qty</th>
                        <th className="px-2 py-1 text-center">Status</th>
                        <th className="px-2 py-1 text-center">Fill %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {boxes.map((b, i) => (
                        <tr key={b.id} className="border-t border-slate-100">
                          <td className="px-2 py-1">{i + 1}</td>
                          <td className="px-2 py-1 font-mono text-[10px]">{b.box_label || 'Box ' + b.box_number}</td>
                          <td className="px-2 py-1 text-center font-bold">{b.qty_actual || 0}</td>
                          <td className="px-2 py-1 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] ${b.status === 'SEALED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                              {b.status === 'SEALED' ? 'SEALED' : 'OPEN'}
                            </span>
                          </td>
                          <td className="px-2 py-1 text-center">{b.qty_actual ? ((b.qty_actual / capacity) * 100).toFixed(0) + '%' : '0%'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Scanned Units Log */}
                <div className="mb-4">
                  <p className="text-sm font-bold text-slate-700 mb-2">SCANNED UNITS LOG</p>
                  <div className="border border-slate-200 rounded overflow-hidden max-h-48 overflow-y-auto">
                    <table className="w-full text-[10px]">
                      <thead className="bg-slate-600 text-white sticky top-0">
                        <tr>
                          <th className="px-2 py-1 text-left w-8">#</th>
                          <th className="px-2 py-1 text-left">Serial Number</th>
                          <th className="px-2 py-1 text-left">QR Code</th>
                          <th className="px-2 py-1 text-left">Scanned At</th>
                          <th className="px-2 py-1 text-left">Box</th>
                          <th className="px-2 py-1 text-center w-16">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {units.slice(0, 50).map((u, i) => {
                          const box = boxes.find(b => b.id === u.box_id);
                          return (
                            <tr key={u.id || i} className={i === 0 ? 'bg-emerald-50' : ''}>
                              <td className="px-2 py-1">{i + 1}</td>
                              <td className="px-2 py-1 font-mono">{u.serial_number || '-'}</td>
                              <td className="px-2 py-1 font-mono text-[9px] text-slate-500">{u.qr_code || '-'}</td>
                              <td className="px-2 py-1">{new Date(u.scanned_at).toLocaleString('id-ID')}</td>
                              <td className="px-2 py-1 text-slate-500">{box?.box_label || box?.box_number || '-'}</td>
                              <td className="px-2 py-1 text-center">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] ${u.prefix_valid ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                  {u.prefix_valid ? 'VALID' : 'INVALID'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {units.length > 50 && (
                      <p className="text-xs text-slate-500 text-center py-2 border-t">+ {units.length - 50} more items...</p>
                    )}
                  </div>
                </div>

                {/* Signature Area */}
                <div className="grid grid-cols-3 gap-4 mt-8 pt-4 border-t border-slate-200 text-xs">
                  <div className="text-center">
                    <p className="font-semibold mb-8">Approved By</p>
                    <div className="border-b border-slate-300 h-8"></div>
                  </div>
                  <div className="text-center">
                    <p className="font-semibold mb-8">Warehouse</p>
                    <div className="border-b border-slate-300 h-8"></div>
                  </div>
                  <div className="text-center">
                    <p className="font-semibold mb-8">Received By</p>
                    <div className="border-b border-slate-300 h-8"></div>
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-4 pt-2 border-t border-slate-200 text-[10px] text-slate-400 flex justify-between">
                  <span>Generated: {new Date().toLocaleString('id-ID')}</span>
                  <span>Page 1 of 1</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}

// New Box Barcode Submit Handler
// When box is full, user must scan item card barcode to create new box
const handleNewBoxBarcodeSubmit = async () => {
  if (newBoxModal.barcode.length < 10) {
    toast.error('Scan barcode dengan benar');
    return;
  }

  // If this is a required barcode scan (box full scenario), create new box
  if (newBoxModal.required && newBoxModal.batch_id) {
    try {
      // Verify barcode matches batch
      const verifyRes = await api.post('/delivery/verify-barcode', {
        barcode: newBoxModal.barcode,
        so_id: so?.id
      });

      if (!verifyRes.data.matched) {
        toast.error('Barcode tidak cocok dengan batch ini');
        return;
      }

      // Create new box
      const nb = await api.post('/delivery/boxes', { batch_id: newBoxModal.batch_id });
      const newBox = nb.data;

      // Update state
      setBoxes(prev => [...prev, newBox]);
      setBox(newBox);

      setNewBoxModal({ isOpen: false, box: null, barcode: '' });
      toast.success('Box created - Ready to scan');

      // Focus input for scanning
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 100);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Gagal membuat box');
    }
    return;
  }

  // Normal flow - just close modal
  setNewBoxModal({ isOpen: false, box: null, barcode: '' });
  toast.success('Barcode confirmed - Ready to scan');
  setTimeout(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, 100);
};

export default function ScanQRCode() {
  return (
    <ErrorBoundary message="Gagal memuat halaman Scanner">
      <ScanQRCodeContent />
    </ErrorBoundary>
  );
}
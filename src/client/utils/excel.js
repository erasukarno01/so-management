import * as XLSX from 'xlsx';

// Sales Order template structure
export const SO_IMPORT_HEADERS = [
  'SO Number',
  'Customer Name',
  'Delivery Date',
  'Destination',
  'Delivery Type',
  'Bucket No',
  'Product Item',
  'Model Code',
  'Qty Plan',
  'Remark'
];

// Export sales orders to Excel
export function exportSalesOrdersToExcel(orders, filename = 'sales-orders') {
  const data = orders.map(order => ({
    'SO Number': order.so_number || '',
    'Customer': order.customer_name || '',
    'Delivery Date': order.delivery_date ? formatDateForExcel(order.delivery_date) : '',
    'Destination': order.delivery_destination || order.destination_name || '',
    'Delivery Type': order.delivery_type || '',
    'Bucket No': order.bucket_no || '',
    'Status': order.status || '',
    'Plan Qty': order.total_qty_plan || 0,
    'Actual Qty': order.total_qty_actual || 0,
    'Remark': order.remark || '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();

  // Set column widths
  worksheet['!cols'] = [
    { wch: 15 }, // SO Number
    { wch: 25 }, // Customer
    { wch: 15 }, // Delivery Date
    { wch: 25 }, // Destination
    { wch: 15 }, // Delivery Type
    { wch: 15 }, // Bucket No
    { wch: 12 }, // Status
    { wch: 10 }, // Plan Qty
    { wch: 10 }, // Actual Qty
    { wch: 30 }, // Remark
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sales Orders');

  const fileName = `${filename}-${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName);

  return fileName;
}

// Format date for Excel
function formatDateForExcel(dateStr) {
  if (!dateStr) return '';
  if (typeof dateStr === 'string' && dateStr.includes('T')) {
    return dateStr.split('T')[0];
  }
  return dateStr;
}

// Parse Excel file to get data
export function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        // Validate headers
        const headers = jsonData[0] || [];
        const isValidTemplate = validateHeaders(headers);

        if (!isValidTemplate) {
          reject(new Error('Invalid Excel template. Please use the correct format.'));
          return;
        }

        // Parse rows (skip header row)
        const rows = jsonData.slice(1).filter(row => row.some(cell => cell !== undefined && cell !== ''));

        resolve({
          headers,
          rows,
          count: rows.length
        });
      } catch (error) {
        reject(new Error('Failed to parse Excel file: ' + error.message));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

// Validate Excel headers
function validateHeaders(headers) {
  const requiredHeaders = ['SO Number', 'Customer Name', 'Delivery Date', 'Destination', 'Delivery Type'];
  return requiredHeaders.every(h => headers.includes(h));
}

// Convert parsed Excel rows to SO data
export function parseRowsToSOData(rows) {
  return rows.map((row, index) => {
    const soNumber = row[0] || '';  // SO Number
    const customerName = row[1] || '';  // Customer Name
    const deliveryDate = row[2] || '';  // Delivery Date
    const destination = row[3] || '';  // Destination
    const deliveryType = row[4] || '';  // Delivery Type
    const bucketNo = row[5] || '';  // Bucket No
    const productItem = row[6] || '';  // Product Item
    const modelCode = row[7] || '';  // Model Code
    const qtyPlan = row[8] || 0;  // Qty Plan
    const remark = row[9] || '';  // Remark

    return {
      so_number: String(soNumber).trim(),
      customer_name: String(customerName).trim(),
      delivery_date: normalizeDate(deliveryDate),
      destination: String(destination).trim(),
      delivery_type: String(deliveryType).trim(),
      bucket_no: String(bucketNo).trim(),
      items: productItem ? [{
        item_number: String(productItem).trim(),
        model_code: String(modelCode).trim(),
        qty_plan: parseInt(qtyPlan) || 0
      }] : [],
      remark: String(remark).trim(),
      rowNumber: index + 2 // +2 because of header row and 0-based index
    };
  }).filter(row => row.so_number || row.customer_name); // Only return rows with data
}

// Normalize date string
function normalizeDate(dateValue) {
  if (!dateValue) return '';

  // Handle Excel serial date (number)
  if (typeof dateValue === 'number') {
    const date = new Date((dateValue - 25569) * 86400 * 1000);
    return date.toISOString().split('T')[0];
  }

  // Handle string date
  const str = String(dateValue).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);

  // Try to parse other formats
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return '';
}

// Generate template Excel file
export function downloadSOTemplate() {
  const data = [
    SO_IMPORT_HEADERS,
    ['#SO001', 'Customer Name', '2026-06-15', 'Destination Name', 'Regular', '2026-01', 'ITEM001', 'MODEL-A', '100', 'Remark notes'],
    ['#SO002', 'Customer Name', '2026-06-20', 'Destination Name', 'CKD', '2026-02', 'ITEM002', 'MODEL-B', '50', ''],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();

  worksheet['!cols'] = [
    { wch: 15 }, // SO Number
    { wch: 25 }, // Customer Name
    { wch: 15 }, // Delivery Date
    { wch: 25 }, // Destination
    { wch: 15 }, // Delivery Type
    { wch: 15 }, // Bucket No
    { wch: 15 }, // Product Item
    { wch: 15 }, // Model Code
    { wch: 10 }, // Qty Plan
    { wch: 30 }, // Remark
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, 'SO Template');

  const fileName = `so-template-${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName);

  return fileName;
}
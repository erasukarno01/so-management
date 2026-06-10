// ViewModal - Display record details in a modal
import { X, Eye, Barcode } from 'lucide-react';

export function ViewModal({ isOpen, onClose, title, data, fields = [], customers = [], destinations = [] }) {
  if (!isOpen || !data) return null;

  // Generate barcode from data
  const generateBarcode = (data) => {
    if (!data.customer_id || !data.so_number) return null;

    // Get customer code from customers array
    const customer = customers.find(c => c.id === data.customer_id);
    const customerCode = customer?.code || '';

    // Find destination - try multiple lookup strategies
    // data.destination_id atau data.delivery_destination adalah destination name
    const destName = data.destination_id || data.delivery_destination;
    const deliveryType = data.delivery_type || '';

    // Strategy 1: Match by customer_id + name
    let dest = destinations.find(d =>
      d.customer_id === data.customer_id && d.name === destName
    );

    // Strategy 2: If grouped destinations, check key/name
    if (!dest) {
      dest = destinations.find(d =>
        d.key === destName || d.name === destName
      );
    }

    // Strategy 3: Match by type_name if delivery_type matches
    if (!dest && deliveryType) {
      dest = destinations.find(d =>
        d.customer_id === data.customer_id && d.type_name === deliveryType
      );
    }

    // Get dest code and type code
    const destCode = dest?.code || '';
    const typeCode = dest?.type_code || '';

    // Format barcode
    // Part number: 14 characters (D52H5810030080, DH7H5810000080, etc.)
    const partNumber = (data.primary_item_number || '').replace(/[-/]/g, '').substring(0, 14).toUpperCase().padEnd(14, '0');
    const soNum = (data.so_number || '').replace(/[#@]/g, '').substring(0, 5).toUpperCase().padStart(5, '0');
    const qty = String(data.total_qty_plan || 0).padStart(6, '0');
    const customerBarcode = (customerCode || 'XXXXX').substring(0, 5).toUpperCase().padEnd(5, '0');
    const destBarcode = (destCode || 'XXXXX').substring(0, 5).toUpperCase().padEnd(5, '0');
    const typeBarcode = (typeCode || 'XXXX').substring(0, 4).toUpperCase().padEnd(4, '0');

    // Debug: log lookup results
    console.debug('[Barcode Debug]', { customer_id: data.customer_id, destName, deliveryType, destFound: !!dest, destCode, typeCode });

    // Correct format: [)>06{customerCode}P{part}V{destCode}L{typeCode}K{soNumber}Q{qty}
    return `[)>06${customerBarcode}P${partNumber}V${destBarcode}L${typeBarcode}K${soNum}Q${qty}`;
  };

  const barcodeValue = generateBarcode(data);

  const renderValue = (field, value) => {
    if (field.render) return field.render(value, data);
    if (value === null || value === undefined || value === '') return <span className="text-slate-400">-</span>;
    if (field.type === 'date') return new Date(value).toLocaleDateString('en-GB');
    if (field.type === 'number') return Number(value).toLocaleString();
    // Skip barcode field in body - it's in the header
    if (field.type === 'barcode') return <span className="text-slate-400">-</span>;
    return String(value);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Eye className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">{title}</h2>
              <p className="text-xs text-slate-500">View details</p>
              {barcodeValue && (
                <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-2">
                  <Barcode className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <code className="font-mono text-xs text-emerald-800 block select-all">{barcodeValue}</code>
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-4">
            {fields.map((field) => (
              <div key={field.key} className={field.fullWidth ? 'col-span-2' : ''}>
                <label className="text-xs font-medium text-slate-500 uppercase">{field.label}</label>
                <div className="mt-1 text-sm font-medium text-slate-800">
                  {renderValue(field, data[field.key])}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-200 bg-slate-50">
          <div className="flex justify-end">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ViewModal;
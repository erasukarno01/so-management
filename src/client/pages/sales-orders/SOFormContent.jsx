import React, { useMemo, useState } from 'react';
import { SOItemsEditor } from './SOItemsEditor';
import { Package, FileText, Building2, MapPin, AlertCircle } from 'lucide-react';

export function SOFormContent({
  formData,
  setFormData,
  soItems,
  setSoItems,
  products,
  filteredCustomers,
  filteredDestinations,
  selectedDeliveryType,
  selectedCustomerId,
  selectedDestinationId,
  onDeliveryTypeChange,
  onCustomerSelect,
  onDestinationSelect,
  deliveryTime,
  onDeliveryTimeChange,
  errors = {},
}) {
  const [touched, setTouched] = useState({});

  // Add new item row
  const addItemRow = () => {
    setSoItems([...soItems, { item_number: '', model_code: '', qty_plan: '' }]);
  };

  // Remove item row
  const removeItemRow = (index) => {
    if (soItems.length > 1) {
      setSoItems(soItems.filter((_, i) => i !== index));
    }
  };

  // Update item row
  const updateItemRow = (index, field, value) => {
    setSoItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  // Get selected destination based on destination_id in formData or selectedDestinationId
  const selectedDest = useMemo(() => {
    const destKey = formData.destination_id || selectedDestinationId;
    // Find destination by key (name) in filteredDestinations - case insensitive
    return filteredDestinations.find(d =>
      d.key?.toLowerCase() === destKey?.toLowerCase()
    );
  }, [filteredDestinations, formData.destination_id, selectedDestinationId]);
  const availableTypes = selectedDest?.types || [];

  // Compute effective values with fallback to selectedX when formData.X is empty
  const effectiveCustomerId = formData.customer_id || selectedCustomerId || '';
  const effectiveDestinationId = formData.destination_id || selectedDestinationId || '';
  const effectiveDeliveryType = formData.delivery_type || selectedDeliveryType || '';

  // Track touched fields
  const markTouched = (field) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  // Handlers - update formData with single object containing all relevant fields
  const handleCustomerChange = (e) => {
    const val = e.target.value;
    onCustomerSelect?.(val);
    markTouched('customer_id');
    // Clear destination and delivery type when customer changes - they depend on customer/destination
    setFormData({ customer_id: val, destination_id: '', delivery_type: '' });
  };

  const handleDestChange = (e) => {
    const val = e.target.value;
    onDestinationSelect?.(val);
    markTouched('destination_id');
    // Clear delivery type and update delivery_destination when destination changes
    setFormData({ destination_id: val, delivery_type: '', delivery_destination: val });
  };

  const handleTypeChange = (e) => {
    const val = e.target.value;
    onDeliveryTypeChange?.(val);
    markTouched('delivery_type');
    setFormData({ delivery_type: val });
  };

  // Helper to get input class with error state
  const getInputClass = (field, defaultClass = 'border-slate-300') => {
    const hasError = touched[field] && errors[field];
    return hasError
      ? `${defaultClass} border-red-400 bg-red-50`
      : defaultClass;
  };

  // Check if items are valid
  const itemsWithData = soItems.filter(item => item.item_number?.trim());
  const hasInvalidItems = itemsWithData.some(item => !item.qty_plan || parseInt(item.qty_plan) <= 0);

  return (
    <div className="space-y-4">
      {/* Order Info Section */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
            <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5.366V19a2 2 0 01-2 2v-5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-sm font-bold text-slate-800">Order Information</h3>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              SO Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.so_number || ''}
              onChange={e => {
                setFormData({ so_number: e.target.value });
                markTouched('so_number');
              }}
              onBlur={() => markTouched('so_number')}
              placeholder="#XXXXX"
              className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-colors ${getInputClass('so_number')}`}
            />
            {touched.so_number && errors.so_number && (
              <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {errors.so_number}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Delivery Date <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={formData.delivery_date || ''}
                onChange={e => {
                  setFormData({ delivery_date: e.target.value });
                  markTouched('delivery_date');
                }}
                onBlur={() => markTouched('delivery_date')}
                className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-colors ${getInputClass('delivery_date')}`}
              />
              <input
                type="time"
                value={deliveryTime || '13:00'}
                onChange={e => {
                  onDeliveryTimeChange?.(e.target.value);
                  markTouched('delivery_time');
                }}
                onBlur={() => markTouched('delivery_time')}
                className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-colors ${getInputClass('delivery_time')}`}
              />
            </div>
            {touched.delivery_date && errors.delivery_date && (
              <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {errors.delivery_date}
              </p>
            )}
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            Bucket No <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.bucket_no || ''}
            onChange={e => {
              setFormData({ bucket_no: e.target.value });
              markTouched('bucket_no');
            }}
            onBlur={() => markTouched('bucket_no')}
            placeholder="Enter bucket number"
            className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-colors ${getInputClass('bucket_no')}`}
          />
          {touched.bucket_no && errors.bucket_no && (
            <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {errors.bucket_no}
            </p>
          )}
        </div>
      </div>

      {/* Customer & Destination Section */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
            <Building2 className="w-4 h-4 text-blue-600" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">Customer & Destination</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Customer <span className="text-red-500">*</span>
            </label>
            <select
              value={effectiveCustomerId}
              onChange={handleCustomerChange}
              className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-400 bg-white transition-colors ${getInputClass('customer_id')}`}
            >
              <option value="">Select customer...</option>
              {filteredCustomers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {touched.customer_id && errors.customer_id && (
              <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {errors.customer_id}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              <MapPin className="w-3 h-3 inline mr-1" />
              Destination <span className="text-red-500">*</span>
            </label>
            <select
              value={effectiveDestinationId}
              onChange={handleDestChange}
              className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-400 bg-white transition-colors ${getInputClass('destination_id')}`}
            >
              <option value="">Select destination...</option>
              {filteredDestinations.map((d, i) => (
                <option key={d.key || `dest-${i}`} value={d.key}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
            {touched.destination_id && errors.destination_id && (
              <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {errors.destination_id}
              </p>
            )}
          </div>
        </div>

        {/* Available Types Info */}
        {availableTypes.length > 0 && (
          <div className="mt-4 bg-white/80 border border-blue-200 rounded-lg p-3">
            <p className="text-xs font-medium text-blue-700 mb-2">Available Types:</p>
            <div className="flex flex-wrap gap-2">
              {availableTypes.map(t => (
                <span
                  key={t.type_name}
                  className={`px-3 py-1.5 border rounded-lg text-sm transition-colors cursor-pointer ${
                    effectiveDeliveryType === t.type_name
                      ? 'bg-blue-100 border-blue-300 text-blue-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-blue-200'
                  }`}
                  onClick={() => {
                    onDeliveryTypeChange?.(t.type_name);
                    setFormData({ delivery_type: t.type_name });
                  }}
                >
                  <span className="font-medium">{t.type_name}</span>
                  <span className="text-blue-500 ml-1">({t.type_code})</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4">
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            Delivery Type <span className="text-red-500">*</span>
          </label>
          <select
            value={effectiveDeliveryType}
            onChange={handleTypeChange}
            className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-400 bg-white transition-colors ${getInputClass('delivery_type')}`}
          >
            <option value="">Select type...</option>
            {availableTypes.length > 0 ? (
              availableTypes.map(t => (
                <option key={t.type_name} value={t.type_name}>
                  {t.type_name} ({t.type_code})
                </option>
              ))
            ) : (
              <>
                <option value="Regular">Regular</option>
                <option value="CKD">CKD</option>
                <option value="Non Regular">Non Regular</option>
              </>
            )}
          </select>
          {touched.delivery_type && errors.delivery_type && (
            <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {errors.delivery_type}
            </p>
          )}
        </div>
      </div>

      {/* Product Items Section */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <Package className="w-4 h-4 text-amber-600" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">Product Items <span className="text-red-500">*</span></h3>
          </div>
          {itemsWithData.length === 0 && (
            <span className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> At least one item required
            </span>
          )}
          {hasInvalidItems && (
            <span className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Each item needs quantity
            </span>
          )}
        </div>
        <SOItemsEditor
          items={soItems}
          products={products}
          onAdd={addItemRow}
          onRemove={removeItemRow}
          onUpdate={updateItemRow}
        />
      </div>

      {/* Remark Section */}
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
        <label className="block text-xs font-medium text-slate-600 mb-2 flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-400" />
          Remark
        </label>
        <textarea
          value={formData.remark || ''}
          onChange={e => setFormData({ remark: e.target.value })}
          placeholder="Additional notes or special instructions..."
          rows={2}
          className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-400 bg-white transition-colors"
        />
      </div>
    </div>
  );
}

export default SOFormContent;
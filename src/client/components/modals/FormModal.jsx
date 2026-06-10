// FormModal - Form input modal with validation
import { useState, useEffect } from 'react';
import { X, Edit2, Plus, Save, Loader2, Barcode } from 'lucide-react';

export function FormModal({
  isOpen,
  onClose,
  onSubmit,
  title,
  fields = [],
  initialData,
  isLoading = false,
  submitLabel = 'Save',
  customContent,
  itemProps,
  headerBarcode,
}) {
  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (isOpen) {
      // Only reset to initialData if we have it AND it's not a custom content form
      if (initialData && Object.keys(initialData).length > 0) {
        const initial = { ...initialData };
        Object.keys(initial).forEach(key => {
          const field = fields.find(f => f.key === key);
          if (field?.type === 'date' && initial[key]) {
            if (typeof initial[key] === 'string' && initial[key].includes('T')) {
              initial[key] = initial[key].split('T')[0];
            }
          }
        });
        setFormData(initial);
        setErrors({});
      } else if (!customContent) {
        // Only apply field defaults for non-customContent forms
        const initial = {};
        fields.forEach(f => {
          if (f.defaultValue !== undefined) {
            initial[f.key] = f.defaultValue;
          }
        });
        setFormData(initial);
        setErrors({});
      }
      // For customContent, do NOT reset formData - let it be controlled by parent
    } else {
      // Reset form when modal closes
      setFormData({});
      setErrors({});
    }
  }, [isOpen, initialData, fields, customContent]);

  const handleChange = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors(prev => {
        const n = { ...prev };
        delete n[key];
        return n;
      });
    }
  };

  const handleSubmit = () => {
    if (customContent) {
      // For custom content, pass the actual formData from local state
      onSubmit(formData);
      return;
    }

    const newErrors = {};
    fields.forEach(f => {
      if (f.required && !formData[f.key] && formData[f.key] !== 0) {
        newErrors[f.key] = `${f.label} is required`;
      }
    });
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    onSubmit(formData);
  };

  const renderField = (field) => {
    let value = formData[field.key] ?? '';
    const error = errors[field.key];
    const borderCls = error ? 'border-red-400 bg-red-50' : 'border-slate-300 focus:border-blue-400';

    if (field.type === 'textarea') {
      return (
        <textarea
          value={value}
          onChange={e => handleChange(field.key, e.target.value)}
          placeholder={field.placeholder}
          rows={field.rows || 3}
          className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 transition-all ${borderCls}`}
        />
      );
    }

    if (field.type === 'select') {
      return (
        <select
          value={value}
          onChange={e => {
            handleChange(field.key, e.target.value);
            if (field.onChange) field.onChange(e.target.value);
          }}
          className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 transition-all ${borderCls}`}
        >
          <option value="">{field.placeholder || 'Select...'}</option>
          {(field.options || []).map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.sublabel ? `${opt.label} (${opt.sublabel})` : opt.label}
            </option>
          ))}
        </select>
      );
    }

    if (field.type === 'checkbox') {
      return (
        <input
          type="checkbox"
          checked={value}
          onChange={e => handleChange(field.key, e.target.checked)}
          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
      );
    }

    if (field.type === 'date' && value && typeof value === 'string' && value.includes('T')) {
      value = value.split('T')[0];
    }

    return (
      <input
        type={field.type || 'text'}
        value={value}
        onChange={e => handleChange(field.key, e.target.value)}
        placeholder={field.placeholder}
        className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 transition-all ${borderCls}`}
      />
    );
  };

  if (!isOpen) return null;

  const isEdit = initialData && Object.keys(initialData).length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isEdit ? 'bg-amber-100' : 'bg-blue-100'}`}>
              {isEdit ? (
                <Edit2 className="w-6 h-6 text-amber-600" />
              ) : (
                <Plus className="w-6 h-6 text-blue-600" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">{title}</h2>
              <p className="text-xs text-slate-500">{isEdit ? 'Update existing record' : 'Create new record'}</p>
              {headerBarcode && (
                <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-2">
                  <Barcode className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <code className="font-mono text-xs text-emerald-800 block select-all">{headerBarcode}</code>
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2.5 hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {customContent ? customContent(formData, setFormData, errors, setErrors, itemProps) : (
            <div className="space-y-4">
              {fields.map(field => (
                <div key={field.key} className={field.fullWidth ? '' : ''}>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  {renderField(field)}
                  {field.helper && (
                    <p className="mt-1 text-xs text-slate-400">{field.helper}</p>
                  )}
                  {errors[field.key] && (
                    <p className="mt-1 text-xs text-red-500 font-medium">{errors[field.key]}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-gradient-to-r from-slate-50 to-white flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-50 shadow-lg shadow-blue-600/25"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                {submitLabel}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default FormModal;
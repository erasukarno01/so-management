// ScanErrorModal - Floating modal for scan errors with detailed information
import { useState, useEffect } from 'react';
import { AlertCircle, AlertTriangle, Copy, Check, X, Info, Clock, Hash, Package } from 'lucide-react';

const ERROR_TYPES = {
  DUPLICATE: 'DUPLICATE',
  PREFIX_MISMATCH: 'PREFIX_MISMATCH',
  MODEL_MISMATCH: 'MODEL_MISMATCH',
  VALIDATION: 'VALIDATION',
  NETWORK: 'NETWORK',
  SERVER: 'SERVER',
  UNKNOWN: 'UNKNOWN'
};

const ERROR_CONFIG = {
  [ERROR_TYPES.DUPLICATE]: {
    title: 'QR Code Duplikat',
    icon: AlertTriangle,
    color: 'amber',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500',
    iconColor: 'text-amber-500',
    message: 'QR code ini sudah pernah discan sebelumnya'
  },
  [ERROR_TYPES.PREFIX_MISMATCH]: {
    title: 'Prefix Tidak Valid',
    icon: AlertCircle,
    color: 'red',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500',
    iconColor: 'text-red-500',
    message: 'Prefix serial number tidak sesuai dengan master produk'
  },
  [ERROR_TYPES.MODEL_MISMATCH]: {
    title: 'Model Tidak Sesuai',
    icon: AlertCircle,
    color: 'red',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500',
    iconColor: 'text-red-500',
    message: 'Model code tidak sesuai dengan batch ini'
  },
  [ERROR_TYPES.VALIDATION]: {
    title: 'Validasi Gagal',
    icon: AlertCircle,
    color: 'red',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500',
    iconColor: 'text-red-500',
    message: 'Data tidak valid atau format salah'
  },
  [ERROR_TYPES.NETWORK]: {
    title: 'Koneksi Gagal',
    icon: AlertCircle,
    color: 'red',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500',
    iconColor: 'text-red-500',
    message: 'Tidak dapat terhubung ke server'
  },
  [ERROR_TYPES.SERVER]: {
    title: 'Server Error',
    icon: AlertCircle,
    color: 'red',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500',
    iconColor: 'text-red-500',
    message: 'Terjadi kesalahan di server'
  },
  [ERROR_TYPES.UNKNOWN]: {
    title: 'Terjadi Kesalahan',
    icon: AlertCircle,
    color: 'red',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500',
    iconColor: 'text-red-500',
    message: 'Terjadi kesalahan yang tidak terduga'
  }
};

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hours}:${minutes}`;
}

function InfoRow({ icon: Icon, label, value, highlight = false }) {
  return (
    <div className={`flex items-start gap-3 py-2 ${highlight ? 'bg-slate-700/50 -mx-4 px-4 rounded' : ''}`}>
      <Icon className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-slate-500 text-xs">{label}</p>
        <p className={`text-sm font-medium break-all ${highlight ? 'text-white' : 'text-slate-300'}`}>
          {value || '-'}
        </p>
      </div>
    </div>
  );
}

function DetailSection({ title, children }) {
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{title}</p>
      <div className="bg-slate-900/50 rounded-lg p-3 space-y-1">
        {children}
      </div>
    </div>
  );
}

export function ScanErrorModal({ isOpen, onClose, error, onRetry }) {
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setShowDetails(false);
      setCopied(false);
    }
  }, [isOpen]);

  if (!isOpen || !error) return null;

  // Determine error type from error object
  const getErrorType = () => {
    if (error.type) return error.type;

    const msg = (error.message || '').toLowerCase();
    const apiMsg = (error.apiMessage || '').toLowerCase();

    if (msg.includes('duplicate') || msg.includes('duplicat') || apiMsg.includes('already scanned') || msg.includes('sudah discan')) {
      return ERROR_TYPES.DUPLICATE;
    }
    if (msg.includes('prefix') || msg.includes('prefix')) {
      return ERROR_TYPES.PREFIX_MISMATCH;
    }
    if (msg.includes('model')) {
      return ERROR_TYPES.MODEL_MISMATCH;
    }
    if (msg.includes('valid') || msg.includes('format') || msg.includes('required')) {
      return ERROR_TYPES.VALIDATION;
    }
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch')) {
      return ERROR_TYPES.NETWORK;
    }
    if (msg.includes('server') || msg.includes('internal')) {
      return ERROR_TYPES.SERVER;
    }
    return ERROR_TYPES.UNKNOWN;
  };

  const errorType = getErrorType();
  const config = ERROR_CONFIG[errorType] || ERROR_CONFIG[ERROR_TYPES.UNKNOWN];
  const Icon = config.icon;

  const handleCopySerial = () => {
    if (error.serialNumber) {
      navigator.clipboard.writeText(error.serialNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className={`relative ${config.bgColor} rounded-2xl p-6 max-w-md w-full shadow-2xl border-2 ${config.borderColor}`}>
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-start gap-4 mb-4">
          <div className={`w-12 h-12 rounded-xl ${config.bgColor} border border-${config.color}-500/30 flex items-center justify-center`}>
            <Icon className={`w-6 h-6 ${config.iconColor}`} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-white">{config.title}</h3>
              <span className={`px-2 py-0.5 text-xs font-bold rounded bg-${config.color}-500/20 text-${config.color}-400`}>
                ERROR
              </span>
            </div>
            <p className="text-slate-400 text-sm mt-1">{config.message}</p>
          </div>
        </div>

        {/* Error Details */}
        <div className="space-y-3">
          {/* QR/Serial Info */}
          <div className="bg-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Hash className="w-4 h-4 text-slate-500" />
                <span className="text-slate-400 text-sm font-medium">Informasi QR</span>
              </div>
              {error.serialNumber && (
                <button
                  onClick={handleCopySerial}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-slate-500 mb-1">Serial Number</p>
                <p className="font-mono text-sm font-bold text-emerald-400 truncate">
                  {error.serialNumber || error.qrCode?.substring(0, 14) || '-'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">QR Code</p>
                <p className="font-mono text-xs text-slate-400 truncate" title={error.qrCode}>
                  {error.qrCode ? `${error.qrCode.substring(0, 12)}...` : '-'}
                </p>
              </div>
            </div>
          </div>

          {/* Duplicate-specific info */}
          {errorType === ERROR_TYPES.DUPLICATE && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Info className="w-4 h-4 text-amber-400" />
                <span className="text-amber-400 text-sm font-medium">Detail Duplikat</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {error.existingScanInfo && (
                  <>
                    <div>
                      <p className="text-xs text-amber-400/70 mb-1">Discanned Sebelumnya</p>
                      <p className="text-sm font-medium text-white flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(error.existingScanInfo.scannedAt)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-amber-400/70 mb-1">Di-scan oleh</p>
                      <p className="text-sm font-medium text-white">
                        {error.existingScanInfo.scannedBy || '-'}
                      </p>
                    </div>
                    {error.existingScanInfo.soNumber && (
                      <div>
                        <p className="text-xs text-amber-400/70 mb-1">Sales Order</p>
                        <p className="text-sm font-bold text-amber-400">
                          {error.existingScanInfo.soNumber}
                        </p>
                      </div>
                    )}
                    {error.existingScanInfo.customerName && (
                      <div>
                        <p className="text-xs text-amber-400/70 mb-1">Customer</p>
                        <p className="text-sm font-medium text-white">
                          {error.existingScanInfo.customerName}
                        </p>
                      </div>
                    )}
                    {error.existingScanInfo.boxLabel && (
                      <div className="col-span-2">
                        <p className="text-xs text-amber-400/70 mb-1">Box</p>
                        <p className="text-sm font-medium text-white flex items-center gap-1">
                          <Package className="w-3 h-3" />
                          {error.existingScanInfo.boxLabel}
                        </p>
                      </div>
                    )}
                  </>
                )}
                {!error.existingScanInfo && (
                  <div className="col-span-2 text-center py-2">
                    <p className="text-sm text-amber-400/70">
                      Data scan sebelumnya tidak tersedia
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Prefix mismatch info */}
          {errorType === ERROR_TYPES.PREFIX_MISMATCH && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-red-400 text-sm font-medium">Detail Prefix</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-red-400/70 mb-1">Prefix Terdeteksi</p>
                  <p className="font-mono text-sm font-bold text-red-400">
                    {error.detectedPrefix || error.serialNumber?.substring(0, 4) || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-red-400/70 mb-1">Prefix Yang Diharapkan</p>
                  <p className="font-mono text-sm font-bold text-emerald-400">
                    {error.expectedPrefix || '-'}
                  </p>
                </div>
                {error.modelCode && (
                  <div className="col-span-2">
                    <p className="text-xs text-red-400/70 mb-1">Model Code</p>
                    <p className="text-sm font-medium text-white">
                      {error.modelCode}
                    </p>
                  </div>
                )}
                {error.productInfo && (
                  <>
                    {error.productInfo.partNumber && (
                      <div>
                        <p className="text-xs text-red-400/70 mb-1">Part Number</p>
                        <p className="text-sm font-medium text-white">
                          {error.productInfo.partNumber}
                        </p>
                      </div>
                    )}
                    {error.productInfo.description && (
                      <div className="col-span-2">
                        <p className="text-xs text-red-400/70 mb-1">Deskripsi</p>
                        <p className="text-sm font-medium text-white">
                          {error.productInfo.description}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Generic error message */}
          {error.message && (
            <div className="bg-slate-800 rounded-lg p-3">
              <p className="text-xs text-slate-500 mb-1">Pesan Error</p>
              <p className="text-sm text-white">{error.message}</p>
            </div>
          )}

          {/* Technical details (collapsible) */}
          {error.stack && (
            <div>
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-400 transition-colors"
              >
                <Info className="w-3 h-3" />
                {showDetails ? 'Sembunyikan' : 'Tampilkan'} detail teknis
              </button>
              {showDetails && (
                <pre className="mt-2 p-3 bg-slate-900 rounded-lg text-xs text-slate-500 overflow-auto max-h-32">
                  {error.stack}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-slate-700 text-slate-300 rounded-xl font-medium hover:bg-slate-600 transition-colors"
          >
            Tutup
          </button>
          {onRetry && (
            <button
              onClick={() => { onRetry(); onClose(); }}
              className={`flex-1 px-4 py-3 bg-${config.color}-500 text-white rounded-xl font-medium hover:bg-${config.color}-400 transition-colors`}
            >
              Scan Ulang
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export { ERROR_TYPES };
export default ScanErrorModal;
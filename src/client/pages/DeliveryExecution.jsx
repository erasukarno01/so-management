// Delivery Execution page - Redesigned with modern UI
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package, ScanBarcode, Check, AlertCircle, RefreshCw, Play, Eye,
  X, Box, PackageCheck, Clock, Truck, ChevronRight, CheckCircle, XCircle
} from 'lucide-react';
import api from '../api/client';
import { DataTable } from '../components/DataTable';
import { useToast } from '../hooks';

function DeliveryExecution() {
  const navigate = useNavigate();
  const toast = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scannedData, setScannedData] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [productMasters, setProductMasters] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [ordersResponse, productsResponse] = await Promise.all([
        api.get('/sales-orders'),
        api.get('/products'),
      ]);
      setOrders(ordersResponse.data || []);
      const masters = (productsResponse.data || []).map(p => ({
        modelCode: p.model_code,
        prefix: p.prefix || '0000'
      }));
      setProductMasters(masters);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load delivery data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        if (!o.so_number?.toLowerCase().includes(s) &&
            !o.customer_name?.toLowerCase().includes(s) &&
            !o.delivery_destination?.toLowerCase().includes(s)) return false;
      }
      return o.status !== 'COMPLETED';
    });
  }, [orders, searchTerm]);

  // Modal states
  const [executionModal, setExecutionModal] = useState({ open: false, so: null });
  const [startBatchModal, setStartBatchModal] = useState({ open: false, item: null, barcode: null });
  const [soItems, setSoItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [startingBatch, setStartingBatch] = useState(false);

  // View Details Modal
  const [viewModal, setViewModal] = useState({ open: false, so: null });
  const [viewSoItems, setViewSoItems] = useState([]);
  const [loadingViewItems, setLoadingViewItems] = useState(false);

  const handleViewDetails = async (so) => {
    setViewModal({ open: true, so });
    setLoadingViewItems(true);
    try {
      console.log('View Details - so.id:', so.id, so);
      const encodedId = encodeURIComponent(so.id);
      const res = await api.get(`/sales-orders/${encodedId}/items`);
      console.log('Items response:', res.data);
      setViewSoItems(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('View details error:', err);
      setViewSoItems([]);
    } finally {
      setLoadingViewItems(false);
    }
  };

  const closeViewModal = () => {
    setViewModal({ open: false, so: null });
    setViewSoItems([]);
  };

  // Handler for barcode verification
  const handleVerifyBarcode = async () => {
    if (!manualBarcode.trim()) return;
    setScanError(null);
    try {
      const res = await api.post('/delivery/verify-barcode', {
        barcode: manualBarcode,
        so_id: executionModal.so.id
      });
      setScannedData(res.data);
    } catch (err) {
      setScanError(err.response?.data?.error?.message || 'Failed to verify barcode');
    }
  };

  // Handler for starting batch from scan result
  const handleStartBatchFromScan = async () => {
    if (!scannedData?.matchedItem) return;
    try {
      setStartingBatch(true);
      const batchRes = await api.post('/delivery/start-batch', {
        so_item_id: scannedData.matchedItem.id,
        item_card_barcode: manualBarcode,
        qty_total: scannedData.matchedItem.qty_plan
      });
      const newBatch = batchRes.data;
      closeExecutionModal();
      navigate(`/delivery/scan/${newBatch.id}`);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to start batch');
    } finally {
      setStartingBatch(false);
    }
  };

  // Execution Modal (with barcode scan)
  const handleStartExecution = async (so) => {
    setExecutionModal({ open: true, so });
    setLoadingItems(true);
    try {
      const encodedId = encodeURIComponent(so.id);
      const res = await api.get(`/delivery/so-items/${encodedId}`);
      setSoItems(res.data || []);
    } catch (err) {
      toast.error('Failed to load SO items');
    } finally {
      setLoadingItems(false);
    }
  };

  const openStartBatch = (item, barcode) => {
    setStartBatchModal({ open: true, item, barcode });
  };

  const closeStartBatch = () => {
    setStartBatchModal({ open: false, item: null, barcode: null });
  };

  const handleStartBatchSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const barcode = formData.get('barcode');
    const qty = formData.get('qty');

    if (!barcode?.trim() || !qty) {
      toast.error('Please fill all fields');
      return;
    }

    setStartingBatch(true);
    try {
      await api.post('/delivery/start-batch', {
        so_item_id: startBatchModal.item.id,
        item_card_barcode: barcode,
        qty_total: parseInt(qty, 10)
      });
      toast.success('Delivery batch started successfully');
      closeStartBatch();
      // Refresh items
      const refreshId = encodeURIComponent(executionModal.so.id);
      const res = await api.get(`/delivery/so-items/${refreshId}`);
      setSoItems(res.data || []);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to start delivery');
    } finally {
      setStartingBatch(false);
    }
  };

  const closeExecutionModal = () => {
    setExecutionModal({ open: false, so: null });
    setSoItems([]);
    setScannedData(null);
    setManualBarcode('');
    loadData();
  };

  const stats = useMemo(() => ({
    total: filteredOrders.length,
    pending: filteredOrders.filter(d => d.status === 'PENDING').length,
    partial: filteredOrders.filter(d => d.status === 'PARTIAL').length,
    totalPlan: filteredOrders.reduce((s, d) => s + Number(d.total_qty_plan || 0), 0),
    totalDelivered: filteredOrders.reduce((s, d) => s + Number(d.total_qty_actual || 0), 0),
    totalRemaining: filteredOrders.reduce((s, d) => s + Number((d.total_qty_plan || 0) - (d.total_qty_actual || 0)), 0),
  }), [filteredOrders]);

  const columns = [
    {
      key: 'so_number',
      label: 'SO Number',
      sortable: true,
      render: (val) => <span className="font-mono font-semibold text-blue-600">{val}</span>,
    },
    {
      key: 'primary_item_number',
      label: 'Part No',
      sortable: false,
      render: (val) => val ? <span className="text-xs font-mono text-slate-600">{val}</span> : '-',
    },
    {
      key: 'model',
      label: 'Model',
      sortable: false,
      render: (val) => val ? <span className="text-xs font-mono text-slate-500">{val}</span> : '-',
    },
    {
      key: 'customer_name',
      label: 'Customer',
      sortable: true,
      render: (val) => <span className="text-slate-600">{val}</span>,
    },
    {
      key: 'delivery_destination',
      label: 'Destination',
      sortable: true,
      render: (val) => <span className="text-slate-600">{val || '-'}</span>,
    },
    {
      key: 'delivery_date',
      label: 'Date',
      sortable: true,
      render: (val) => val ? new Date(val).toLocaleDateString('en-GB') : '-',
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      align: 'center',
      render: (val) => {
        const colors = { PENDING: 'bg-red-100 text-red-700', PARTIAL: 'bg-amber-100 text-amber-700', COMPLETED: 'bg-emerald-100 text-emerald-700' };
        return <span className={`px-2 py-1 rounded text-xs font-semibold ${colors[val] || 'bg-slate-100'}`}>{val}</span>;
      },
    },
    {
      key: 'total_qty_plan',
      label: 'Plan',
      sortable: true,
      align: 'right',
      render: (val) => <span className="font-semibold">{Number(val || 0).toLocaleString()}</span>,
    },
    {
      key: 'total_qty_actual',
      label: 'Done',
      sortable: true,
      align: 'right',
      render: (val) => <span className="font-semibold text-emerald-600">{Number(val || 0).toLocaleString()}</span>,
    },
    {
      key: 'remaining',
      label: 'Rem',
      sortable: true,
      align: 'right',
      render: (val, row) => {
        const rem = (row.total_qty_plan || 0) - (row.total_qty_actual || 0);
        return <span className={`font-semibold ${rem > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{Number(rem).toLocaleString()}</span>;
      },
    },
    {
      key: 'actions',
      label: '',
      width: 'w-24',
      align: 'right',
      render: (_, row) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => handleViewDetails(row)}
            className="p-1.5 rounded-lg hover:bg-blue-100 text-slate-400 hover:text-blue-600 transition-colors"
            title="View Details"
          >
            <Eye className="w-4 h-4" />
          </button>
          {row.status !== 'COMPLETED' && (
            <button
              onClick={() => handleStartExecution(row)}
              className="p-1.5 rounded-lg hover:bg-emerald-100 text-slate-400 hover:text-emerald-600 transition-colors"
              title="Start Delivery"
            >
              <Play className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">

      {/* Secondary Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Sales Orders</h1>
          <p className="text-xs text-slate-500">{filteredOrders.length} orders</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadData} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs hover:bg-slate-50">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
          <div className="text-lg font-bold text-blue-600">{stats.total}</div>
          <div className="text-[10px] text-slate-500">Active Orders</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-2.5">
          <div className="text-lg font-bold text-red-600">{stats.pending}</div>
          <div className="text-[10px] text-slate-500">Pending</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          <div className="text-lg font-bold text-amber-600">{stats.partial}</div>
          <div className="text-[10px] text-slate-500">In Progress</div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
          <div className="text-lg font-bold text-slate-700">{stats.totalPlan.toLocaleString()}</div>
          <div className="text-[10px] text-slate-500">Total Plan</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
          <div className="text-lg font-bold text-emerald-600">{stats.totalDelivered.toLocaleString()}</div>
          <div className="text-[10px] text-slate-500">Delivered</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          <div className="text-lg font-bold text-amber-600">{stats.totalRemaining.toLocaleString()}</div>
          <div className="text-[10px] text-slate-500">Remaining</div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3">
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search SO number, customer, destination..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} className="mt-2 text-xs text-red-500 hover:underline">
            Clear search
          </button>
        )}
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={filteredOrders}
        loading={loading}
        error={error}
        pageSize={10}
        emptyMessage="No delivery orders found"
      />

      {/* View Details Modal - Full Sales Order Details */}
      {viewModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeViewModal} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-200 flex items-center justify-center">
                    <Eye className="w-5 h-5 text-slate-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">Sales Order Details</h2>
                    <p className="text-sm text-slate-500 font-mono">{viewModal.so?.so_number}</p>
                  </div>
                </div>
                <button onClick={closeViewModal} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
            </div>

            {/* Sales Order Info - 3 column grid */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
                  <p className="text-[10px] text-slate-500 uppercase mb-1">Part No</p>
                  <p className="font-mono text-sm text-slate-800">{viewModal.so?.primary_item_number || '-'}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
                  <p className="text-[10px] text-slate-500 uppercase mb-1">Model</p>
                  <p className="font-mono text-sm text-slate-800">{viewModal.so?.model || '-'}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
                  <p className="text-[10px] text-slate-500 uppercase mb-1">Delivery Type</p>
                  <p className="font-medium text-sm text-slate-800">{viewModal.so?.delivery_type || '-'}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
                  <p className="text-[10px] text-slate-500 uppercase mb-1">Customer</p>
                  <p className="font-medium text-sm text-slate-800">{viewModal.so?.customer_name || '-'}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
                  <p className="text-[10px] text-slate-500 uppercase mb-1">Destination</p>
                  <p className="font-medium text-sm text-slate-800">{viewModal.so?.delivery_destination || '-'}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
                  <p className="text-[10px] text-slate-500 uppercase mb-1">Delivery Date</p>
                  <p className="font-medium text-sm text-slate-800">{viewModal.so?.delivery_date ? new Date(viewModal.so.delivery_date).toLocaleDateString('en-GB') : '-'}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
                  <p className="text-[10px] text-slate-500 uppercase mb-1">Bucket No</p>
                  <p className="font-mono text-sm text-slate-800">{viewModal.so?.bucket_no || '-'}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
                  <p className="text-[10px] text-slate-500 uppercase mb-1">Status</p>
                  <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                    viewModal.so?.status === 'PENDING' ? 'bg-red-100 text-red-700' :
                    viewModal.so?.status === 'PARTIAL' ? 'bg-amber-100 text-amber-700' :
                    'bg-emerald-100 text-emerald-700'
                  }`}>
                    {viewModal.so?.status || 'PENDING'}
                  </span>
                </div>
                <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm flex flex-col justify-center">
                  <p className="text-[10px] text-slate-500 uppercase mb-1">Plan / Actual Qty</p>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-lg text-slate-800">{viewModal.so?.total_qty_plan || 0}</span>
                    <span className="text-slate-300">/</span>
                    <span className="font-bold text-lg text-emerald-600">{viewModal.so?.total_qty_actual || 0}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Remark */}
            {viewModal.so?.remark && (
              <div className="px-6 py-3 bg-amber-50 border-b border-amber-200">
                <p className="text-[10px] text-amber-600 uppercase mb-1">Remark</p>
                <p className="text-sm text-slate-700">{viewModal.so.remark}</p>
              </div>
            )}

            {/* Items List - Detailed table */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-320px)]">
              <h3 className="font-semibold text-slate-700 mb-3">Items ({viewSoItems.length})</h3>
              {loadingViewItems ? (
                <div className="text-center py-8 text-slate-500">Loading...</div>
              ) : viewSoItems.length === 0 ? (
                <div className="text-center py-8 text-slate-400">No items found</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs text-slate-500 uppercase">
                      <th className="text-left py-2 px-2">#</th>
                      <th className="text-left py-2 px-2">Part No</th>
                      <th className="text-left py-2 px-2">Model</th>
                      <th className="text-right py-2 px-2">Plan</th>
                      <th className="text-right py-2 px-2">Actual</th>
                      <th className="text-right py-2 px-2">Rem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {viewSoItems.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="py-2 px-2 text-slate-400">{idx + 1}</td>
                        <td className="py-2 px-2 font-mono text-slate-800">{item.part_number || item.item_number}</td>
                        <td className="py-2 px-2 text-slate-600">{item.model_code}</td>
                        <td className="py-2 px-2 text-right font-medium text-slate-800">{item.qty_plan}</td>
                        <td className="py-2 px-2 text-right font-medium text-emerald-600">{item.qty_actual || 0}</td>
                        <td className="py-2 px-2 text-right font-medium text-amber-600">{(item.qty_plan || 0) - (item.qty_actual || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Execution Modal - Compact with prominent Scanner */}
      {executionModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeExecutionModal} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col">

            {/* Header - Compact */}
            <div className="px-5 py-3 border-b border-slate-200 bg-gradient-to-r from-blue-600 to-indigo-600">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                    <Truck className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">Delivery Execution</h2>
                    <p className="text-xs text-blue-100 font-mono">{executionModal.so?.so_number}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${
                    executionModal.so?.status === 'PENDING' ? 'bg-red-500 text-white' :
                    executionModal.so?.status === 'PARTIAL' ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'
                  }`}>
                    {executionModal.so?.status}
                  </span>
                  <button onClick={closeExecutionModal} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                    <X className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>
            </div>

            {/* SO Info Bar - Important Details */}
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-4 text-xs flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Customer:</span>
                <span className="font-semibold text-slate-800">{executionModal.so?.customer_name || '-'}</span>
              </div>
              <div className="w-px h-4 bg-slate-300" />
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Destination:</span>
                <span className="font-semibold text-slate-800">{executionModal.so?.delivery_destination || '-'}</span>
              </div>
              <div className="w-px h-4 bg-slate-300" />
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Date:</span>
                <span className="font-semibold text-slate-800">
                  {executionModal.so?.delivery_date ? new Date(executionModal.so.delivery_date).toLocaleDateString('en-GB') : '-'}
                </span>
              </div>
              <div className="w-px h-4 bg-slate-300" />
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Type:</span>
                <span className="font-semibold text-slate-800">{executionModal.so?.delivery_type || '-'}</span>
              </div>
              <div className="w-px h-4 bg-slate-300" />
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Part:</span>
                <span className="font-mono font-semibold text-slate-800">{executionModal.so?.primary_item_number || '-'}</span>
              </div>
              <div className="w-px h-4 bg-slate-300" />
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Model:</span>
                <span className="font-mono text-slate-600">{executionModal.so?.model || '-'}</span>
              </div>
              <div className="w-px h-4 bg-slate-300" />
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Plan:</span>
                <span className="font-bold text-slate-800">{executionModal.so?.total_qty_plan || 0}</span>
                <span className="text-slate-400">/</span>
                <span className="font-bold text-emerald-600">{executionModal.so?.total_qty_actual || 0}</span>
              </div>
            </div>

            {/* Scanner Section - Prominent, Full Width */}
            <div className="px-5 py-4 bg-white border-b border-slate-200">
              <div className="flex items-center gap-2 mb-3">
                <ScanBarcode className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-700">Scan Item Card Barcode</h3>
              </div>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <input
                    type="text"
                    name="executionBarcode"
                    placeholder="Arahkan scanner ke barcode item card..."
                    value={manualBarcode}
                    onChange={(e) => {
                      setManualBarcode(e.target.value);
                      setScannedData(null);
                      setScanError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && manualBarcode.trim()) {
                        handleVerifyBarcode();
                      }
                    }}
                    className={`w-full px-4 py-4 border-2 rounded-xl text-base bg-white font-mono focus:outline-none transition-all ${
                      scanError ? 'border-red-400 focus:ring-2 focus:ring-red-200' :
                      scannedData?.matched ? 'border-emerald-400 focus:ring-2 focus:ring-emerald-200' :
                      'border-blue-300 focus:ring-2 focus:ring-blue-200 hover:border-blue-400'
                    }`}
                    autoFocus
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {scannedData?.matched ? (
                      <Check className="w-6 h-6 text-emerald-500" />
                    ) : scanError ? (
                      <X className="w-6 h-6 text-red-500" />
                    ) : (
                      <ScanBarcode className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                </div>
                <button
                  onClick={handleVerifyBarcode}
                  disabled={!manualBarcode.trim()}
                  className="px-6 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-colors flex items-center gap-2 shadow-lg shadow-blue-600/25"
                >
                  <Check className="w-4 h-4" />
                  Verify
                </button>
              </div>
              {scanError && (
                <p className="mt-2 text-sm text-red-600 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {scanError}
                </p>
              )}
            </div>

            {/* Body - Split Layout (Verification Results | Items List) */}
            <div className="flex-1 overflow-hidden flex">

              {/* Left Panel - Verification Results */}
              <div className="w-1/2 border-r border-slate-200 overflow-y-auto">
                <div className="p-5">
                  <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    Verification Results
                  </h3>
                  {scannedData ? (
                    <div className="space-y-3">
                      {/* Status Banner */}
                      <div className={`rounded-xl p-4 flex items-center justify-between ${
                        scannedData.matched
                          ? 'bg-emerald-50 border border-emerald-200'
                          : 'bg-red-50 border border-red-200'
                      }`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            scannedData.matched ? 'bg-emerald-500' : 'bg-red-500'
                          }`}>
                            {scannedData.matched ? (
                              <Check className="w-5 h-5 text-white" />
                            ) : (
                              <X className="w-5 h-5 text-white" />
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-slate-800">{scannedData.matched ? 'Barcode Verified' : 'Mismatch Detected'}</p>
                            <p className="text-xs text-slate-500">{scannedData.matched ? 'Ready to start batch' : 'Check the details below'}</p>
                          </div>
                        </div>
                        <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${
                          scannedData.matched ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
                        }`}>
                          {scannedData.matched ? 'MATCH' : 'MISMATCH'}
                        </span>
                      </div>

                      {/* Comparison Table - Full Details */}
                      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-100">
                            <tr>
                              <th className="text-left px-3 py-2 font-semibold text-slate-600">Field</th>
                              <th className="text-left px-3 py-2 font-semibold text-slate-600">Sales Order</th>
                              <th className="text-left px-3 py-2 font-semibold text-slate-600">Barcode</th>
                              <th className="text-center px-3 py-2 font-semibold text-slate-600">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              { key: 'soNumber', label: 'SO Number' },
                              { key: 'customer', label: 'Customer' },
                              { key: 'destination', label: 'Destination' },
                              { key: 'type', label: 'Type' },
                              { key: 'part', label: 'Part No' },
                              { key: 'model', label: 'Model' },
                              { key: 'qty', label: 'Qty' },
                            ].map((field) => {
                              const data = scannedData.comparison?.[field.key];
                              const isMatch = data?.match;
                              return (
                                <tr key={field.key} className={`border-t border-slate-100 ${!isMatch ? 'bg-red-50' : ''}`}>
                                  <td className="px-3 py-2 text-slate-500">{data?.label || field.label}</td>
                                  <td className="px-3 py-2 font-mono font-semibold text-slate-700">{data?.soValue || '-'}</td>
                                  <td className="px-3 py-2 font-mono text-slate-600">{data?.barcodeValue || '-'}</td>
                                  <td className="px-3 py-2 text-center">
                                    {isMatch ? (
                                      <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                                    ) : (
                                      <X className="w-4 h-4 text-red-500 mx-auto" />
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Action Buttons */}
                      {scannedData.matched && scannedData.matchedItem && (
                        <button
                          onClick={handleStartBatchFromScan}
                          disabled={startingBatch}
                          className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 rounded-xl text-white font-bold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25"
                        >
                          {startingBatch ? (
                            <>
                              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <Play className="w-5 h-5" />
                              Start Batch ({scannedData.matchedItem.qty_plan} units)
                            </>
                          )}
                        </button>
                      )}

                      <button
                        onClick={() => {
                          setManualBarcode('');
                          setScannedData(null);
                        }}
                        className="w-full py-2 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        Clear & Scan Next
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
                        <ScanBarcode className="w-8 h-8 text-blue-400" />
                      </div>
                      <p className="text-slate-500 font-medium text-sm">Scan barcode item card</p>
                      <p className="text-slate-400 text-xs mt-1">Tekan Enter atau klik Verify untuk proses</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Panel - Order Items */}
              <div className="w-1/2 bg-slate-50 overflow-y-auto">
                <div className="p-5">
                  <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    Items ({soItems.length})
                  </h3>
                  {loadingItems ? (
                    <div className="text-center py-8">
                      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                    </div>
                  ) : soItems.length === 0 ? (
                    <p className="text-center text-slate-400 text-sm py-4">No items found</p>
                  ) : (
                    <div className="space-y-3">
                      {soItems.map((item, idx) => {
                        const rem = (item.qty_plan || 0) - (item.qty_actual || 0);
                        return (
                          <div
                            key={item.id}
                            className={`bg-white rounded-xl p-4 border transition-colors ${
                              scannedData?.matchedItem?.id === item.id ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-blue-300'
                            }`}
                            onClick={() => {
                              setManualBarcode(item.item_number || item.part_number || '');
                            }}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">{idx + 1}</span>
                                <span className="font-mono text-sm font-semibold text-slate-800">{item.item_number || item.part_number || '-'}</span>
                              </div>
                              <span className={`px-2 py-1 rounded text-[10px] font-semibold ${
                                item.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
                                item.qty_actual > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                              }`}>
                                {item.status === 'COMPLETED' ? 'Done' : item.qty_actual > 0 ? 'Partial' : 'Pending'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 mb-2">{item.model_code || '-'}</p>
                            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                              <div className="flex items-center gap-4 text-xs">
                                <span className="text-slate-500">Plan: <span className="font-semibold text-slate-700">{item.qty_plan}</span></span>
                                <span className="text-slate-500">Actual: <span className="font-semibold text-emerald-600">{item.qty_actual || 0}</span></span>
                              </div>
                              <span className={`font-bold text-sm ${rem > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                Rem: {rem}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Start Batch Modal */}
      {startBatchModal.open && startBatchModal.item && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeStartBatch} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-200 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                    <Box className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">Start Delivery Batch</h2>
                    <p className="text-sm text-emerald-100">{startBatchModal.item.item_number}</p>
                  </div>
                </div>
                <button onClick={closeStartBatch} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Item Summary Card */}
            <div className="px-6 py-4 bg-gradient-to-r from-emerald-50 to-white border-b border-emerald-100">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs text-emerald-600 font-medium">Item</p>
                    <span className="px-1.5 py-0.5 bg-emerald-100 rounded text-[10px] text-emerald-700">{startBatchModal.item.model_code}</span>
                  </div>
                  <p className="font-mono font-bold text-slate-800 text-lg">{startBatchModal.item.part_number || startBatchModal.item.item_number}</p>
                </div>
                <div className="w-px h-16 bg-emerald-200" />
                <div className="text-center px-4">
                  <p className="text-4xl font-bold text-emerald-600">{startBatchModal.item.qty_plan}</p>
                  <p className="text-xs text-slate-500">units to deliver</p>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-3 gap-3 mt-4">
                <div className="bg-white rounded-lg p-3 border border-emerald-100 text-center">
                  <p className="text-xs text-slate-500">Plan Qty</p>
                  <p className="font-bold text-slate-700">{startBatchModal.item.qty_plan}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-emerald-100 text-center">
                  <p className="text-xs text-slate-500">Already Scanned</p>
                  <p className="font-bold text-emerald-600">{startBatchModal.item.qty_scanned || startBatchModal.item.total_batch_qty || 0}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-emerald-100 text-center">
                  <p className="text-xs text-slate-500">Remaining</p>
                  <p className="font-bold text-amber-600">
                    {(startBatchModal.item.qty_plan) - (startBatchModal.item.qty_scanned || startBatchModal.item.total_batch_qty || 0)}
                  </p>
                </div>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleStartBatchSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Item Card Barcode <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    name="barcode"
                    placeholder="Scan barcode di modal Delivery Execution"
                    defaultValue={startBatchModal.barcode || ''}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-400 transition-all font-mono"
                    autoFocus
                    required
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <ScanBarcode className="w-5 h-5 text-slate-400" />
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-slate-400">Scan barcode di modal Delivery Execution terlebih dahulu</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Quantity for this Batch <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  name="qty"
                  defaultValue={startBatchModal.item.qty_plan}
                  min="1"
                  max={startBatchModal.item.qty_plan}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-400 transition-all"
                  required
                />
                <p className="mt-1.5 text-xs text-slate-400">Total units for this batch (max: {startBatchModal.item.qty_plan} units)</p>
              </div>

              {/* Info Box */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-blue-800 text-sm">Batch Information</p>
                    <p className="text-xs text-blue-600 mt-1">
                      Once started, this batch will track scanned units. Make sure all boxes are properly sealed before completing.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={closeStartBatch}
                  className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={startingBatch}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white rounded-xl text-sm font-semibold hover:from-emerald-600 hover:to-emerald-600 transition-all shadow-lg shadow-emerald-500/25 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {startingBatch ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Start Batch
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default DeliveryExecution;
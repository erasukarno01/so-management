// SalesOrdersPage - Main sales orders page
import { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import { Plus, Trash2, Eye, Edit2, CheckSquare, Square, RefreshCw, Filter, Package, X, Upload, FileDown } from 'lucide-react';
import api from '../../api/client';
import { DataTable } from '../../components/DataTable';
import { ViewModal, FormModal, DeleteModal } from '../../components/Modal';
import { useToast, useStats, useFilters } from '../../hooks';
import { STATUS_OPTIONS, DELIVERY_TYPE_OPTIONS } from '../../utils/constants';
import { formatDate } from '../../utils/formatters';
import { exportSalesOrdersToExcel, parseExcelFile, parseRowsToSOData, downloadSOTemplate } from '../../utils/excel';
import { StatCard } from '../../components/ui';
import { SOItemsEditor } from './SOItemsEditor';
import { SOFormContent } from './SOFormContent';

function SalesOrdersPage() {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [destinations, setDestinations] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter states
  const {
    filters,
    searchTerm,
    setSearchTerm,
    showFilters,
    setShowFilters,
    updateFilter,
    clearFilters,
    hasActiveFilters,
    activeFilterCount,
  } = useFilters({ initialFilters: { status: '', customer: '', type: '' } });

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [viewModal, setViewModal] = useState({ open: false, data: null });
  const [formModal, setFormModal] = useState({ open: false, data: null });
  const [deleteModal, setDeleteModal] = useState({ open: false, data: null });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [importModal, setImportModal] = useState({ open: false, data: null });
  const [importData, setImportData] = useState(null);
  const fileInputRef = useRef(null);

  // SO Items state for form
  const [soItems, setSoItems] = useState([{ item_number: '', model_code: '', qty_plan: '' }]);
  const [selectedDeliveryType, setSelectedDeliveryType] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedDestinationId, setSelectedDestinationId] = useState('');
  const [soFormData, setSoFormData] = useState({}); // Centralized form data for SO
  const [deliveryTime, setDeliveryTime] = useState('13:00'); // Default delivery time
  const [countdownKey, setCountdownKey] = useState(0); // Force re-render for countdown

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [soRes, custRes, destRes, prodRes] = await Promise.all([
        api.get('/sales-orders'),
        api.get('/customers'),
        api.get('/destinations'),
        api.get('/products'),
      ]);
      setOrders(soRes.data || []);
      setCustomers(custRes.data || []);
      setDestinations(destRes.data || []);
      setProducts(prodRes.data || []);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Load failed');
      toastRef.current.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Update countdown every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdownKey(k => k + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const filteredCustomers = useMemo(() => {
    // Always show all customers, don't filter by delivery type to prevent reset
    return customers;
  }, [customers]);

  const filteredDestinations = useMemo(() => {
    // Group destinations by name for the dropdown
    // Each destination can have multiple types (one record per type in new DB structure)
    if (!selectedCustomerId) {
      // Show all destinations grouped by name
      const groups = {};
      destinations.forEach(d => {
        const key = d.name || 'Unknown';
        if (!groups[key]) {
          groups[key] = {
            key,
            name: d.name,
            code: d.code,
            customer_id: d.customer_id,
            types: []
          };
        }
        // Add unique type
        const typeInfo = { type_name: d.type_name, type_code: d.type_code };
        if (!groups[key].types.find(t => t.type_name === d.type_name)) {
          groups[key].types.push(typeInfo);
        }
      });
      return Object.values(groups);
    }

    // Filter by customer - case insensitive comparison
    let custDests = destinations.filter(d =>
      d.customer_id?.toLowerCase() === selectedCustomerId?.toLowerCase()
    );

    // If custDests is empty but selectedDestinationId is set, include that destination
    // This handles the case where the destination was found by name match from a different customer
    if (custDests.length === 0 && selectedDestinationId) {
      const matchingDest = destinations.find(d =>
        d.name?.toLowerCase() === selectedDestinationId?.toLowerCase()
      );
      if (matchingDest) {
        custDests = [matchingDest];
      }
    }

    // Group by destination name
    const groups = {};
    custDests.forEach(d => {
      const key = d.name || 'Unknown';
      if (!groups[key]) {
        groups[key] = {
          key,
          name: d.name,
          code: d.code,
          customer_id: d.customer_id,
          types: []
        };
      }
      const typeInfo = { type_name: d.type_name, type_code: d.type_code };
      if (!groups[key].types.find(t => t.type_name === d.type_name)) {
        groups[key].types.push(typeInfo);
      }
    });

    return Object.values(groups);
  }, [selectedCustomerId, destinations, selectedDestinationId]);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (searchTerm && !o.so_number?.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !o.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !o.delivery_destination?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (filters.status && o.status !== filters.status) return false;
      if (filters.customer && o.customer_id !== filters.customer) return false;
      if (filters.type && o.delivery_type !== filters.type) return false;
      return true;
    });
  }, [orders, searchTerm, filters]);

  const stats = useStats(filteredOrders, {
    statusField: 'status',
    sumFields: ['total_qty_plan', 'total_qty_actual'],
  });

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.size === filteredOrders.length ? new Set() : new Set(filteredOrders.map(o => o.id)));
  };

  const handleView = async (order) => {
    try {
      const res = await api.get(`/sales-orders/${encodeURIComponent(order.id)}`);
      const fullOrder = res.data;
      // Use first item's data for primary_item_number and model if available
      if (fullOrder.items?.length > 0) {
        fullOrder.primary_item_number = fullOrder.primary_item_number || fullOrder.items[0].item_number;
        fullOrder.model = fullOrder.model || fullOrder.items[0].model_code;
      }
      setViewModal({ open: true, data: fullOrder });
    } catch (err) {
      toastRef.current.error('Failed to load order details');
    }
  };

  const handleCreate = () => {
    setSelectedDeliveryType('');
    setSelectedCustomerId('');
    setSelectedDestinationId('');
    setSoItems([{ item_number: '', model_code: '', qty_plan: '' }]);
    // Initialize with default delivery_date and delivery_time (13:00)
    const today = new Date().toISOString().split('T')[0];
    setSoFormData({ delivery_date: today });
    setDeliveryTime('13:00');
    setFormErrors({});
    setFormModal({ open: true, data: null });
  };

  const handleEdit = async (order) => {
    setFormErrors({});
    try {
      const encodedId = encodeURIComponent(order.id);
      const res = await api.get(`/sales-orders/${encodedId}`);
      const fullOrder = res.data;

      const customerId = fullOrder.customer_id || '';
      const deliveryDest = fullOrder.delivery_destination || fullOrder.destination_name || '';
      const deliveryType = fullOrder.delivery_type || '';

      // Find matching destination by name across ALL destinations (case-insensitive)
      // This ensures we find the destination even if customer_id comparison fails
      const matchingDest = destinations.find(d =>
        d.name?.toLowerCase() === deliveryDest?.toLowerCase()
      );
      const destinationKey = matchingDest?.name || deliveryDest;

      // If we found a matching destination, use its customer_id for filtering
      // Otherwise, use the customer_id from the order
      const effectiveCustomerId = matchingDest?.customer_id || customerId;

      // Set selected state
      setSelectedCustomerId(effectiveCustomerId);
      setSelectedDeliveryType(deliveryType);
      setSelectedDestinationId(destinationKey);

      // Set form data with all values
      setSoFormData({
        so_number: fullOrder.so_number || '',
        bucket_no: fullOrder.bucket_no || '',
        delivery_type: deliveryType,
        customer_id: effectiveCustomerId,
        destination_id: destinationKey,
        destination_code: fullOrder.destination_id || matchingDest?.code || '',
        destination_name: deliveryDest,
        delivery_destination: deliveryDest,
        delivery_date: fullOrder.delivery_date ? fullOrder.delivery_date.split('T')[0] : '',
        remark: fullOrder.remark || '',
        id: fullOrder.id,
      });
      // Set delivery time - extract from delivery_date if available, default to 13:00
      const deliveryDateTime = fullOrder.delivery_date || '';
      if (deliveryDateTime.includes('T')) {
        const timePart = deliveryDateTime.split('T')[1];
        if (timePart) {
          setDeliveryTime(timePart.substring(0, 5));
        } else {
          setDeliveryTime('13:00');
        }
      } else {
        setDeliveryTime('13:00');
      }

      // Set SO items
      if (fullOrder.items?.length > 0) {
        setSoItems(fullOrder.items.map(item => ({
          item_number: item.item_number || '',
          model_code: item.model_code || '',
          qty_plan: item.qty_plan || ''
        })));
      } else {
        setSoItems([{ item_number: fullOrder.primary_item_number || '', model_code: '', qty_plan: fullOrder.total_qty_plan || '' }]);
      }

      setFormModal({ open: true, data: fullOrder });
    } catch (err) {
      toastRef.current.error('Failed to load order details');
    }
  };

  const handleDelete = (order) => setDeleteModal({ open: true, data: order });

  const handleDeliveryTypeChange = (type) => {
    setSelectedDeliveryType(type);
  };

  const handleCustomerSelect = (customerId) => {
    setSelectedCustomerId(customerId);
    // Clear destination and delivery type when customer changes
    setSelectedDestinationId('');
    setSelectedDeliveryType('');
  };

  const handleDestinationSelect = (destinationKey) => {
    setSelectedDestinationId(destinationKey);
    // Clear delivery type when destination changes
    setSelectedDeliveryType('');

    // Update customer_id if the destination belongs to a different customer
    const selectedDest = destinations.find(d => d.name === destinationKey);
    if (selectedDest?.customer_id && selectedDest.customer_id !== selectedCustomerId) {
      setSelectedCustomerId(selectedDest.customer_id);
    }
  };

  const handleSubmit = async (formData) => {
    // For edit mode: soFormData (updated by form) takes priority over selectedX (may be stale)
    // When user changes destination via SOFormContent, soFormData.destination_id is updated immediately
    // while selectedDestinationId is still the old value until next render
    const isEditMode = !!soFormData.id;
    const destinationId = isEditMode
      ? (soFormData.destination_id || selectedDestinationId || formData?.destination_id || '')
      : (soFormData.destination_id || selectedDestinationId || formData?.destination_id || '');
    const customerId = isEditMode
      ? (soFormData.customer_id || selectedCustomerId || formData?.customer_id || '')
      : (soFormData.customer_id || selectedCustomerId || formData?.customer_id || '');
    const deliveryType = isEditMode
      ? (soFormData.delivery_type || selectedDeliveryType || formData?.delivery_type || '')
      : (soFormData.delivery_type || selectedDeliveryType || formData?.delivery_type || '');

    // Validate required fields
    const mergedFormData = {
      ...soFormData,
      ...formData,
      destination_id: destinationId,
      customer_id: customerId,
      delivery_type: deliveryType,
    };
    const errors = {};

    // Validate SO Number
    if (!mergedFormData.so_number?.trim()) {
      errors.so_number = 'SO Number is required';
    }

    // Validate Bucket No
    if (!mergedFormData.bucket_no?.trim()) {
      errors.bucket_no = 'Bucket No is required';
    }

    // Validate Customer
    if (!mergedFormData.customer_id) {
      errors.customer_id = 'Please select a customer';
    }

    // Validate Destination
    if (!destinationId) {
      errors.destination_id = 'Please select a destination';
    }

    // Validate Delivery Date
    if (!mergedFormData.delivery_date) {
      errors.delivery_date = 'Delivery Date is required';
    }

    // Validate Delivery Type
    if (!deliveryType) {
      errors.delivery_type = 'Please select a delivery type';
    }

    // Validate at least one item with item_number
    const itemsWithData = soItems.filter(item => item.item_number?.trim());
    if (itemsWithData.length === 0) {
      errors.items = 'At least one product item is required';
    }

    // Validate each item has qty_plan
    const invalidItems = itemsWithData.filter(item => !item.qty_plan || parseInt(item.qty_plan) <= 0);
    if (invalidItems.length > 0) {
      errors.qty = 'Each item must have a valid quantity';
    }

    // If there are errors, set them and return
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toastRef.current.error('Please fill in all required fields');
      return;
    }

    setFormErrors({});
    setIsSubmitting(true);
    try {
      // Look up customer from full customers array (not filteredCustomers)
      const selectedCustomer = customers.find(c => c.id === customerId);
      // Find the destination group by key (name)
      const selectedDestGroup = filteredDestinations.find(d => d.key === destinationId);
      // Find the specific destination record by name + delivery_type
      const specificDest = destinations.find(d =>
        d.name === destinationId && d.type_name === deliveryType
      );

      const itemsWithData = soItems.filter(item => item.item_number);
      const totalQty = soItems.reduce((sum, item) => sum + (parseInt(item.qty_plan) || 0), 0);

      // Determine destination_id: use specificDest?.code (matched by name + delivery_type)
      const destId = specificDest?.code || selectedDestGroup?.code || destinationId || null;
      // For delivery_destination, use selectedDestGroup.name (current selection) first
      // This ensures the new destination name is used when user changes destination
      const newDeliveryDestination = selectedDestGroup?.name || destinationId || mergedFormData.delivery_destination || '';
      const newDestinationName = selectedDestGroup?.name || destinationId || mergedFormData.destination_name || '';

      const submitData = {
        ...mergedFormData,
        customer_name: selectedCustomer?.name || '',
        customer_id: customerId,
        destination_id: destId,
        destination_name: newDestinationName,
        delivery_destination: newDeliveryDestination,
        delivery_type: deliveryType,
        delivery_date: mergedFormData.delivery_date ? `${mergedFormData.delivery_date}T${deliveryTime || '13:00'}:00` : null,
        total_qty_plan: totalQty,
        primary_item_number: soItems[0]?.item_number || '',
        items: itemsWithData.map(item => ({
          item_number: item.item_number,
          model_code: item.model_code,
          qty_plan: parseInt(item.qty_plan) || 0
        })),
      };

      const isEdit = !!mergedFormData.id;
      if (isEdit) {
        await api.patch(`/sales-orders/${encodeURIComponent(mergedFormData.id)}`, submitData);
        toastRef.current.success('Sales order updated successfully');
      } else {
        await api.post('/sales-orders', submitData);
        toastRef.current.success('Sales order created successfully');
      }
      setFormModal({ open: false, data: null });
      setSelectedDeliveryType('');
      setSelectedCustomerId('');
      setSelectedDestinationId('');
      setSoItems([{ item_number: '', model_code: '', qty_plan: '' }]);
      loadData();
    } catch (err) {
      toastRef.current.error(err.response?.data?.error?.message || 'Failed to save');
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    setIsSubmitting(true);
    try {
      await api.delete(`/sales-orders/${encodeURIComponent(deleteModal.data.id)}`);
      toastRef.current.success('Sales order deleted successfully');
      setDeleteModal({ open: false, data: null });
      loadData();
    } catch (err) {
      toastRef.current.error('Failed to delete');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExport = () => {
    try {
      const fileName = exportSalesOrdersToExcel(filteredOrders, 'sales-orders');
      toastRef.current.success(`Exported ${filteredOrders.length} orders to ${fileName}`);
    } catch (error) {
      toastRef.current.error('Export failed: ' + error.message);
    }
  };

  const handleDownloadTemplate = () => {
    try {
      const fileName = downloadSOTemplate();
      toastRef.current.success('Template downloaded');
    } catch (error) {
      toastRef.current.error('Download failed: ' + error.message);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await parseExcelFile(file);
      const soData = parseRowsToSOData(result.rows);
      setImportData(soData);
      setImportModal({ open: true, data: result });
      toastRef.current.success(`Parsed ${soData.length} records from Excel`);
    } catch (error) {
      toastRef.current.error(error.message);
    }

    // Reset input
    e.target.value = '';
  };

  const handleImportConfirm = async () => {
    if (!importData || importData.length === 0) {
      toastRef.current.error('No data to import');
      return;
    }

    setIsSubmitting(true);
    try {
      let successCount = 0;
      let errorCount = 0;

      for (const so of importData) {
        // Find customer by name
        const customer = customers.find(c => c.name.toLowerCase() === so.customer_name.toLowerCase());
        if (!customer) {
          errorCount++;
          continue;
        }

        // Find or create destination
        let dest = destinations.find(d =>
          d.name.toLowerCase() === so.destination.toLowerCase() &&
          d.customer_id === customer.id
        );

        try {
          const submitData = {
            so_number: so.so_number,
            customer_id: customer.id,
            customer_name: customer.name,
            destination_id: dest?.id || null,
            destination_name: so.destination,
            delivery_destination: so.destination,
            delivery_date: so.delivery_date,
            delivery_type: so.delivery_type,
            bucket_no: so.bucket_no,
            total_qty_plan: so.items.reduce((sum, i) => sum + (i.qty_plan || 0), 0),
            primary_item_number: so.items[0]?.item_number || '',
            items: so.items,
            remark: so.remark,
          };

          await api.post('/sales-orders', submitData);
          successCount++;
        } catch (err) {
          errorCount++;
        }
      }

      toastRef.current.success(`Imported ${successCount} orders, ${errorCount} failed`);
      setImportModal({ open: false, data: null });
      setImportData(null);
      loadData();
    } catch (error) {
      toastRef.current.error('Import failed: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImportCancel = () => {
    setImportModal({ open: false, data: null });
    setImportData(null);
  };

  const columns = [
    {
      key: 'checkbox', label: '', width: 'w-10',
      render: (_, order) => (
        <button onClick={() => toggleSelect(order.id)} className="p-1 rounded hover:bg-slate-100">
          {selectedIds.has(order.id) ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-slate-300" />}
        </button>
      ),
    },
    { key: 'so_number', label: 'SO Number', sortable: true, render: v => <span className="font-mono font-semibold text-blue-600">{v}</span> },
    { key: 'primary_item_number', label: 'Part No', sortable: false, render: v => v ? <span className="font-mono text-xs">{v}</span> : '-' },
    { key: 'model', label: 'Model', sortable: false, render: v => v ? <span className="font-mono text-xs text-slate-500">{v}</span> : '-' },
    { key: 'customer_name', label: 'Customer', sortable: true },
    { key: 'delivery_date', label: 'Date', sortable: true, render: v => formatDate(v) },
    {
      key: 'countdown', label: 'Countdown', width: 'w-28', align: 'center',
      render: (_, order) => {
        // Don't show countdown for completed orders
        if (order.status === 'COMPLETED') {
          return <span className="text-slate-300">-</span>;
        }

        // Calculate countdown to 13:00 on delivery date
        const deliveryDate = order.delivery_date;
        if (!deliveryDate) return <span className="text-slate-400">-</span>;

        const deliveryDateTime = new Date(deliveryDate);
        const [hours, minutes] = [13, 0]; // Default 13:00
        deliveryDateTime.setHours(hours, minutes, 0, 0);

        const now = new Date();
        const diff = deliveryDateTime.getTime() - now.getTime();

        // If delivery date is in the past
        if (diff < 0) {
          const todayStr = now.toISOString().split('T')[0];
          const deliveryDateStr = deliveryDate?.split('T')[0] || deliveryDate;

          // If delivery date is today and time already passed 13:00
          if (deliveryDateStr === todayStr) {
            return <span className="text-red-500 font-mono text-xs font-semibold">OVERDUE</span>;
          }

          // Past dates (not today) - show days overdue
          const overdueMs = Math.abs(diff);
          const overdueDays = Math.floor(overdueMs / (1000 * 60 * 60 * 24));
          const overdueHours = Math.floor((overdueMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

          if (overdueDays > 0) {
            return (
              <span className="text-red-600 font-mono text-xs font-semibold">
                -{overdueDays}d
              </span>
            );
          }
          return (
            <span className="text-red-500 font-mono text-xs">
              -{overdueHours}h
            </span>
          );
        }

        // Calculate remaining time
        const totalMs = diff;
        const daysRemaining = Math.floor(totalMs / (1000 * 60 * 60 * 24));
        const hoursRemaining = Math.floor((totalMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

        // If more than 24 hours, show in days
        if (daysRemaining > 0) {
          const urgencyColor = daysRemaining <= 1 ? 'text-red-600' : daysRemaining <= 3 ? 'text-amber-600' : 'text-emerald-600';
          return (
            <span className={`font-mono text-xs font-semibold ${urgencyColor}`}>
              {daysRemaining}d
            </span>
          );
        }

        // Less than 24 hours - show hh:mm:ss
        const totalSeconds = Math.floor(totalMs / 1000);
        const minutesRemaining = Math.floor((totalSeconds % 3600) / 60);
        const secondsRemaining = totalSeconds % 60;

        const formatted = `${String(hoursRemaining).padStart(2, '0')}:${String(minutesRemaining).padStart(2, '0')}:${String(secondsRemaining).padStart(2, '0')}`;

        // Color based on urgency
        const isUrgent = hoursRemaining < 2;
        const isWarning = hoursRemaining < 4;

        return (
          <span className={`font-mono text-xs font-semibold ${isUrgent ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-emerald-600'}`}>
            {formatted}
          </span>
        );
      }
    },
    { key: 'delivery_destination', label: 'Destination', sortable: true },
    { key: 'delivery_type', label: 'Type', sortable: true, render: v => v ? <span className="px-2 py-1 rounded text-xs font-medium bg-slate-100 text-slate-700">{v}</span> : '-' },
    {
      key: 'status', label: 'Status', sortable: true, align: 'center',
      render: (val) => {
        const opt = STATUS_OPTIONS.find(o => o.value === val);
        return <span className={`px-2 py-1 rounded text-xs font-semibold ${opt?.color || 'bg-slate-100'}`}>{val}</span>;
      },
    },
    { key: 'total_qty_plan', label: 'Plan', sortable: true, align: 'right', render: v => Number(v || 0).toLocaleString() },
    { key: 'total_qty_actual', label: 'Actual', sortable: true, align: 'right', render: v => <span className="text-emerald-600">{Number(v || 0).toLocaleString()}</span> },
    {
      key: 'urgency_score', label: 'Priority', width: 'w-20', align: 'center', sortable: true,
      render: (val, order) => {
        if (order.status === 'COMPLETED') return <span className="text-slate-300">-</span>;
        if (val === undefined || val === null) return <span className="text-slate-400">-</span>;
        const isUrgent = val < 100;
        const isWarning = val < 500;
        return (
          <span className={`px-2 py-1 rounded text-xs font-bold ${isUrgent ? 'bg-red-100 text-red-700' : isWarning ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
            {isUrgent ? 'HIGH' : isWarning ? 'MED' : 'LOW'}
          </span>
        );
      }
    },
    {
      key: 'actions', label: '', width: 'w-24', align: 'right', sortable: false,
      render: (_, order) => {
        const isEditable = order.status === 'PENDING' || order.status === 'ACTIVE';
        return (
          <div className="flex gap-1 justify-end">
            <button onClick={() => handleView(order)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-blue-600" title="View"><Eye className="w-4 h-4" /></button>
            {isEditable && (
              <>
                <button onClick={() => handleEdit(order)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-amber-600" title="Edit"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => handleDelete(order)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-red-600" title="Delete"><Trash2 className="w-4 h-4" /></button>
              </>
            )}
          </div>
        );
      },
    },
  ];

  const viewFields = [
    { key: 'so_number', label: 'SO Number' },
    {
      key: 'item_card_barcode',
      label: 'Item Card Barcode',
      type: 'barcode',
      // Barcode akan dirender di header ViewModal, bukan di body
    },
    { key: 'primary_item_number', label: 'Part No' },
    { key: 'model', label: 'Model' },
    { key: 'customer_name', label: 'Customer' },
    { key: 'delivery_destination', label: 'Destination' },
    { key: 'delivery_date', label: 'Delivery Date', type: 'date' },
    { key: 'delivery_type', label: 'Delivery Type' },
    { key: 'status', label: 'Status', type: 'status' },
    { key: 'total_qty_plan', label: 'Plan Qty', type: 'number' },
    { key: 'total_qty_actual', label: 'Actual Qty', type: 'number' },
    { key: 'bucket_no', label: 'Bucket No' },
    { key: 'remark', label: 'Remark', fullWidth: true },
  ];

  const getFormFields = () => {
    const customerOptions = filteredCustomers.map(c => ({ value: c.id, label: c.name }));
    const destOptions = filteredDestinations.map(d => ({ value: d.key, label: `${d.name} (${d.code})` }));
    const selectedDest = filteredDestinations.find(d => d.key === selectedDestinationId);
    const typeOptions = selectedDest?.types?.length > 0
      ? selectedDest.types.map(t => ({ value: t.type_name, label: `${t.type_name} (${t.type_code})` }))
      : DELIVERY_TYPE_OPTIONS;
    return [
      { key: 'so_number', label: 'SO Number', required: true, placeholder: 'Format: #XXXXX' },
      { key: 'customer_id', label: 'Customer', type: 'select', options: customerOptions, required: true, placeholder: 'Select customer', onChange: handleCustomerSelect },
      { key: 'destination_id', label: 'Destination', type: 'select', options: destOptions, required: true, placeholder: 'Select destination', helper: !selectedCustomerId ? 'Select customer first' : destOptions.length === 0 ? 'No destinations for this customer' : '' },
      { key: 'delivery_type', label: 'Delivery Type', type: 'select', options: typeOptions, required: true, placeholder: 'Select type' },
      { key: 'delivery_date', label: 'Delivery Date', type: 'date', required: true, defaultValue: new Date().toISOString().split('T')[0] },
      { key: 'remark', label: 'Remark', type: 'textarea', placeholder: 'Optional notes...', fullWidth: true },
    ];
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Sales Orders</h1>
          <p className="text-xs text-slate-500 mt-0.5">{filteredOrders.length} orders</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadData} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs hover:bg-slate-50">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleDownloadTemplate} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs hover:bg-slate-50" title="Download Template">
            <FileDown className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleImportClick} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs hover:bg-slate-50" title="Import from Excel">
            <Upload className="w-3.5 h-3.5" />
          </button>
          <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xlsx,.xls" className="hidden" />
          <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs hover:bg-slate-50">Export</button>
          <button onClick={handleCreate} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700">
            <Plus className="w-3.5 h-3.5" /> New SO
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2">
        <StatCard value={stats.total} label="Total" color="blue" />
        <StatCard value={stats.pending} label="Pending" color="red" />
        <StatCard value={stats.partial} label="In Progress" color="amber" />
        <StatCard value={stats.completed} label="Completed" color="emerald" />
        <StatCard value={stats.totalPlan.toLocaleString()} label="Plan Qty" color="slate" />
        <StatCard value={stats.totalActual.toLocaleString()} label="Actual Qty" color="emerald" />
      </div>

      <FilterBar
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        filters={filters}
        updateFilter={updateFilter}
        clearFilters={clearFilters}
        hasActiveFilters={hasActiveFilters}
        activeFilterCount={activeFilterCount}
        customers={customers}
      />

      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl">
          <span className="text-sm font-medium text-blue-700">{selectedIds.size} selected</span>
          <button onClick={toggleSelectAll} className="text-xs text-blue-600 hover:underline">
            {selectedIds.size === filteredOrders.length ? 'Deselect all' : 'Select all'}
          </button>
        </div>
      )}

      <DataTable columns={columns} data={filteredOrders} loading={loading} error={error} pageSize={10} onRowClick={handleView} emptyMessage="No sales orders found" defaultSortKey="urgency_score" defaultSortDirection="asc" />

      <ViewModal isOpen={viewModal.open} onClose={() => setViewModal({ open: false, data: null })} title="Sales Order Details" data={viewModal.data} fields={viewFields} customers={customers} destinations={destinations} />

      <FormModal
        isOpen={formModal.open}
        onClose={() => { setFormModal({ open: false, data: null }); setSelectedDeliveryType(''); setSelectedCustomerId(''); setSelectedDestinationId(''); setSoItems([{ item_number: '', model_code: '', qty_plan: '' }]); setSoFormData({}); setFormErrors({}); setDeliveryTime('13:00'); }}
        onSubmit={(data) => handleSubmit(data)}
        title={formModal.data ? 'Edit Sales Order' : 'Create Sales Order'}
        fields={formModal.data ? getFormFields() : []}
        initialData={formModal.data}
        isLoading={isSubmitting}
        submitLabel={formModal.data ? 'Update' : 'Create'}
        headerBarcode={(() => {
          const destKey = soFormData.destination_id || selectedDestinationId;
          if (!destKey) return '';
          const selectedDest = filteredDestinations.find(d => d.key === destKey);
          if (!selectedDest) return '';
          const customerCode = filteredCustomers?.find(c => c.id === selectedCustomerId)?.code || '';
          const destCode = selectedDest.code || '';
          // Get type_code based on delivery_type (selectedDeliveryType)
          const deliveryType = selectedDeliveryType || soFormData.delivery_type || '';
          const matchedType = selectedDest.types?.find(t => t.type_name === deliveryType);
          const typeCode = matchedType?.type_code || selectedDest.types?.[0]?.type_code || selectedDest.type_code || '';
          const partNumber = soItems?.[0]?.item_number || '';
          const soNumber = soFormData.so_number
            ? (soFormData.so_number || '').replace(/[#@]/g, '').substring(0, 5).padStart(5, '0')
            : 'XXXXX';
          const qty = String(soFormData.total_qty_plan || 0).padStart(6, '0');
          const customer = (customerCode || 'XXXXX').substring(0, 5).toUpperCase().padEnd(5, '0');
          // Part number: 14 characters
          const part = (partNumber || '').replace(/[-/]/g, '').substring(0, 14).toUpperCase().padEnd(14, '0');
          const dest = (destCode || 'XXXXX').substring(0, 5).toUpperCase().padEnd(5, '0');
          const type = (typeCode || 'XXXX').substring(0, 4).toUpperCase().padEnd(4, '0');
          return `[)>06${customer}P${part}V${dest}L${type}K${soNumber}Q${qty}`;
        })()}
        customContent={(formData, setFormData) => {
          return (
          <SOFormContent
            formData={soFormData}
            setFormData={(data) => {
              if (typeof data === 'function') {
                setSoFormData(data);
              } else {
                setSoFormData(prev => ({ ...prev, ...data }));
              }
            }}
            soItems={soItems}
            setSoItems={setSoItems}
            products={products}
            filteredCustomers={filteredCustomers}
            filteredDestinations={filteredDestinations}
            selectedDeliveryType={selectedDeliveryType}
            selectedCustomerId={selectedCustomerId}
            selectedDestinationId={selectedDestinationId}
            onDeliveryTypeChange={handleDeliveryTypeChange}
            onCustomerSelect={handleCustomerSelect}
            onDestinationSelect={handleDestinationSelect}
            deliveryTime={deliveryTime}
            onDeliveryTimeChange={setDeliveryTime}
            errors={formErrors}
          />
        )}}
      />

      <DeleteModal
        isOpen={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, data: null })}
        onConfirm={handleDeleteConfirm}
        title="Delete Sales Order"
        message={`Are you sure you want to delete SO "${deleteModal.data?.so_number}"? This action cannot be undone.`}
        isLoading={isSubmitting}
      />

      {/* Import Preview Modal */}
      <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${importModal.open ? '' : 'hidden'}`}>
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleImportCancel} />
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-emerald-50 to-white">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                <Upload className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">Import Sales Orders</h2>
                <p className="text-xs text-slate-500">{importData?.length || 0} records to import</p>
              </div>
            </div>
            <button onClick={handleImportCancel} className="p-2.5 hover:bg-slate-100 rounded-xl transition-colors">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Row</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">SO Number</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Customer</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Destination</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Delivery Date</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Type</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Bucket No</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Items</th>
                  </tr>
                </thead>
                <tbody>
                  {importData?.map((so, index) => (
                    <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-400">{so.rowNumber}</td>
                      <td className="px-3 py-2 font-medium">{so.so_number || '-'}</td>
                      <td className="px-3 py-2">{so.customer_name || '-'}</td>
                      <td className="px-3 py-2">{so.destination || '-'}</td>
                      <td className="px-3 py-2">{so.delivery_date || '-'}</td>
                      <td className="px-3 py-2">{so.delivery_type || '-'}</td>
                      <td className="px-3 py-2">{so.bucket_no || '-'}</td>
                      <td className="px-3 py-2">{so.items.length} items</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="px-6 py-4 border-t border-slate-200 bg-gradient-to-r from-slate-50 to-white flex justify-end gap-3">
            <button
              onClick={handleImportCancel}
              className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleImportConfirm}
              disabled={isSubmitting || !importData?.length}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors disabled:opacity-50 shadow-lg shadow-emerald-600/25"
            >
              <Upload className="w-4 h-4" />
              Import {importData?.length || 0} Orders
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Filter bar component - memoized to prevent re-renders
const FilterBar = memo(function FilterBar({ searchTerm, setSearchTerm, showFilters, setShowFilters, filters, updateFilter, clearFilters, hasActiveFilters, activeFilterCount, customers }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3">
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search SO number, customer, destination..." className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs transition-colors ${showFilters ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-slate-200 hover:bg-slate-50'}`}>
          <Filter className="w-3.5 h-3.5" /> Filters
          {hasActiveFilters && !showFilters && <span className="w-5 h-5 bg-blue-600 text-white rounded-full text-[10px] flex items-center justify-center">{activeFilterCount}</span>}
        </button>
        {hasActiveFilters && <button onClick={clearFilters} className="text-xs text-red-500 hover:underline">Clear</button>}
      </div>

      {showFilters && (
        <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] font-medium text-slate-500 uppercase mb-1 block">Status</label>
            <select value={filters.status} onChange={(e) => updateFilter('status', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All Status</option>
              {STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-medium text-slate-500 uppercase mb-1 block">Customer</label>
            <select value={filters.customer} onChange={(e) => updateFilter('customer', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All Customers</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-medium text-slate-500 uppercase mb-1 block">Type</label>
            <select value={filters.type} onChange={(e) => updateFilter('type', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All Types</option>
              {DELIVERY_TYPE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
});

export default SalesOrdersPage;
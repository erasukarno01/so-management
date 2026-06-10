// AdminPage - Main admin container
import { useState, useCallback, useEffect } from 'react';
import { RefreshCw, Plus } from 'lucide-react';
import api from '../../api/client';
import { FormModal, DeleteModal } from '../../components/modals';
import { useToast } from '../../hooks';
import { UsersTab } from './UsersTab';
import { CustomersTab } from './CustomersTab';
import { ProductsTab } from './ProductsTab';
import { DeliveryTypesTab } from './DeliveryTypesTab';

const TABS = [
  { id: 'users', label: 'User', icon: 'Users' },
  { id: 'customers', label: 'Customer', icon: 'Building2' },
  { id: 'types', label: 'Types', icon: 'Truck' },
  { id: 'products', label: 'Produk', icon: 'Package' },
];

export function AdminPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('users');
  const [refreshKey, setRefreshKey] = useState(0);

  // Refresh function for all tabs
  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  // Customer modal states
  const [formModal, setFormModal] = useState({ open: false, data: null });
  const [deleteModal, setDeleteModal] = useState({ open: false, data: null });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Destination modal states
  const [destFormModal, setDestFormModal] = useState({ open: false, data: null, customerId: null });
  const [destDeleteModal, setDestDeleteModal] = useState({ open: false, data: null });

  // User modal states
  const [userFormModal, setUserFormModal] = useState({ open: false, data: null });
  const [userDeleteModal, setUserDeleteModal] = useState({ open: false, data: null });

  // User fetch function
  const fetchUserById = useCallback(async (userId) => {
    try {
      const res = await api.get(`/users/${userId}`);
      return res.data;
    } catch (err) {
      toast.error('Failed to fetch user data');
      return null;
    }
  }, [toast]);

  // Product modal states
  const [productFormModal, setProductFormModal] = useState({ open: false, data: null });
  const [productDeleteModal, setProductDeleteModal] = useState({ open: false, data: null });

  // Product fetch function
  const fetchProductById = useCallback(async (productId) => {
    try {
      const res = await api.get(`/products/${productId}`);
      return res.data;
    } catch (err) {
      toast.error('Failed to fetch product data');
      return null;
    }
  }, [toast]);

  // Delivery types for customer form
  const [deliveryTypes, setDeliveryTypes] = useState([]);
  useEffect(() => {
    api.get('/delivery-types').then(r => setDeliveryTypes(r.data || [])).catch(() => {});
  }, []);

  // Customer CRUD
  const handleCreateCustomer = () => setFormModal({ open: true, data: null });
  const handleEditCustomer = async (item) => {
    if (item.id) {
      try {
        const res = await api.get(`/customers/${item.id}`);
        setFormModal({ open: true, data: res.data });
      } catch (err) {
        toast.error('Failed to fetch customer data');
      }
    } else {
      setFormModal({ open: true, data: item });
    }
  };
  const handleDeleteCustomer = (item) => setDeleteModal({ open: true, data: item });

  const handleSubmitCustomer = async (formData) => {
    setIsSubmitting(true);
    try {
      if (formData.id) {
        // Extract only the fields needed for update
        const payload = {
          name: formData.name,
          code: formData.code,
          delivery_type_id: formData.delivery_type_id || null,
        };
        await api.patch(`/customers/${encodeURIComponent(formData.id)}`, payload);
        toast.success('Customer updated');
      } else {
        await api.post('/customers', formData);
        toast.success('Customer created');
      }
      setFormModal({ open: false, data: null });
      handleRefresh();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to save');
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCustomerConfirm = async () => {
    setIsSubmitting(true);
    try {
      await api.delete(`/customers/${encodeURIComponent(deleteModal.data.id)}`);
      toast.success('Customer deleted');
      setDeleteModal({ open: false, data: null });
      handleRefresh();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to delete');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Destination CRUD
  const handleAddDestination = (customerId) => {
    setDestFormModal({ open: true, data: null, customerId });
  };

  // Fetch full destination data from server
  const fetchDestinationById = useCallback(async (destId) => {
    try {
      const res = await api.get(`/destinations/${destId}`);
      return res.data;
    } catch (err) {
      toast.error('Failed to fetch destination data');
      return null;
    }
  }, [toast]);

  // Add new destination with specific type - opens modal with destination info pre-filled
  const [addTypeModal, setAddTypeModal] = useState({ open: false, destId: null, destName: '', destCode: '', customerId: null, currentTypes: [] });

  const handleAddType = (dest, customerId) => {
    // Open modal to add new destination record with type
    // Pre-fill with destination name and code
    const existingTypes = dest.items?.map(i => i.type_name).filter(Boolean) || [];
    setAddTypeModal({
      open: true,
      destId: null,
      destName: dest.name,
      destCode: dest.destCode,
      customerId,
      currentTypes: existingTypes
    });
  };

  const handleEditDestination = async (dest, customerId) => {
    // For destination (parent row), we need to handle edit differently
    // The dest object has items[] array, not direct id
    if (dest.items && dest.items.length > 0) {
      // This is the grouped destination - fetch by first item's id
      const firstItem = dest.items[0];
      const fullData = await fetchDestinationById(firstItem.id);
      if (fullData) {
        setDestFormModal({ open: true, data: fullData, customerId });
        return;
      }
    }
    // For type items (child rows), use item.id directly
    if (dest.id) {
      const fullData = await fetchDestinationById(dest.id);
      if (fullData) {
        setDestFormModal({ open: true, data: fullData, customerId });
        return;
      }
    }
    toast.error('Unable to edit destination');
  };

  const handleDeleteDestination = async (dest) => {
    let destId = null;
    let destName = dest.name || 'this destination';

    // For grouped destination (has items array), use first item's id
    if (dest.items && dest.items.length > 0) {
      destId = dest.items[0].id;
    } else if (dest.id) {
      destId = dest.id;
    }

    if (!destId) {
      toast.error('Invalid destination');
      return;
    }
    setDestDeleteModal({ open: true, data: { id: destId, name: destName } });
  };

  const handleDestinationSubmit = async (formData) => {
    // Validate required fields
    if (!formData.name || !formData.code || !formData.type_name || !formData.type_code) {
      toast.error('All fields are required');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: formData.name,
        code: formData.code,
        type_name: formData.type_name,
        type_code: formData.type_code,
        is_default: formData.is_default || false,
        customer_id: destFormModal.customerId,
      };

      if (destFormModal.data?.id) {
        await api.patch(`/destinations/${encodeURIComponent(destFormModal.data.id)}`, payload);
        toast.success('Destination updated');
      } else {
        await api.post('/destinations', payload);
        toast.success('Destination created');
      }
      setDestFormModal({ open: false, data: null, customerId: null });
      handleRefresh();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to save destination');
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDestinationDeleteConfirm = async () => {
    setIsSubmitting(true);
    try {
      await api.delete(`/destinations/${encodeURIComponent(destDeleteModal.data.id)}`);
      toast.success('Destination deleted');
      setDestDeleteModal({ open: false, data: null });
      handleRefresh();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to delete destination');
    } finally {
      setIsSubmitting(false);
    }
  };

  // User CRUD
  const handleCreateUser = () => setUserFormModal({ open: true, data: null });
  const handleEditUser = async (user) => {
    if (user.id) {
      const fullData = await fetchUserById(user.id);
      if (fullData) {
        setUserFormModal({ open: true, data: fullData });
      }
    } else {
      setUserFormModal({ open: true, data: user });
    }
  };
  const handleDeleteUser = (user) => setUserDeleteModal({ open: true, data: user });

  const handleSubmitUser = async (formData) => {
    setIsSubmitting(true);
    try {
      if (formData.id) {
        await api.patch(`/users/${encodeURIComponent(formData.id)}`, formData);
        toast.success('User updated');
      } else {
        await api.post('/users', formData);
        toast.success('User created');
      }
      setUserFormModal({ open: false, data: null });
      handleRefresh();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to save user');
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUserConfirm = async () => {
    setIsSubmitting(true);
    try {
      await api.delete(`/users/${encodeURIComponent(userDeleteModal.data.id)}`);
      toast.success('User deleted');
      setUserDeleteModal({ open: false, data: null });
      handleRefresh();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to delete user');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Product CRUD
  const handleCreateProduct = () => setProductFormModal({ open: true, data: null });
  const handleEditProduct = async (product) => {
    if (product.id) {
      const fullData = await fetchProductById(product.id);
      if (fullData) {
        setProductFormModal({ open: true, data: fullData });
      }
    } else {
      setProductFormModal({ open: true, data: product });
    }
  };
  const handleDeleteProduct = (product) => setProductDeleteModal({ open: true, data: product });

  const handleSubmitProduct = async (formData) => {
    setIsSubmitting(true);
    try {
      if (formData.id) {
        await api.put(`/products/${encodeURIComponent(formData.id)}`, formData);
        toast.success('Product updated');
      } else {
        await api.post('/products', formData);
        toast.success('Product created');
      }
      setProductFormModal({ open: false, data: null });
      handleRefresh();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to save product');
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProductConfirm = async () => {
    setIsSubmitting(true);
    try {
      await api.delete(`/products/${encodeURIComponent(productDeleteModal.data.id)}`);
      toast.success('Product deleted');
      setProductDeleteModal({ open: false, data: null });
      handleRefresh();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to delete product');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Form field generators
  const getCustomerFormFields = () => [
    { key: 'code', label: 'Customer Code', placeholder: 'e.g., CUST-001' },
    { key: 'name', label: 'Customer Name', required: true, placeholder: 'Enter customer name' },
    { key: 'delivery_type_id', label: 'Primary Delivery Type', type: 'select', options: deliveryTypes.map(t => ({ value: t.id, label: t.name })), placeholder: 'Select primary type' },
  ];

  const getUserFormFields = () => [
    { key: 'username', label: 'Username', required: true, placeholder: 'Enter username', type: 'text' },
    { key: 'name', label: 'Full Name', required: true, placeholder: 'Enter full name' },
    { key: 'role', label: 'Role', type: 'select', required: true, options: [
      { value: 'admin', label: 'Admin' },
      { value: 'ppic', label: 'PPIC' },
      { value: 'warehouse', label: 'Warehouse' },
      { value: 'qc', label: 'QC' },
      { value: 'viewer', label: 'Viewer' },
    ], placeholder: 'Select role' },
  ];

  const getProductFormFields = () => [
    { key: 'part_number', label: 'Part Number', required: true, placeholder: 'e.g., D52-H5810-03-00-80' },
    { key: 'model_code', label: 'Model Code', required: true, placeholder: 'e.g., D52-03' },
    { key: 'prefix', label: 'Prefix (QR Code)', required: true, placeholder: 'e.g., 0008' },
    { key: 'box_capacity', label: 'Box Capacity (units)', type: 'number', placeholder: 'e.g., 50', defaultValue: 50 },
    { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Optional description...' },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Admin Management</h1>
          <p className="text-sm text-slate-500">Manage users, customers, and products</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors" title="Refresh">
            <RefreshCw className="w-4 h-4 text-slate-600" />
          </button>
          {activeTab === 'users' && (
            <button onClick={handleCreateUser} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/25">
              <Plus className="w-4 h-4" />
              New User
            </button>
          )}
          {activeTab === 'customers' && (
            <button onClick={handleCreateCustomer} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/25">
              <Plus className="w-4 h-4" />
              New Customer
            </button>
          )}
          {activeTab === 'products' && (
            <button onClick={handleCreateProduct} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/25">
              <Plus className="w-4 h-4" />
              New Product
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} tabs={TABS} />

      {/* Content */}
      {activeTab === 'users' && (
        <UsersTab
          key={`users-${refreshKey}`}
          onEdit={handleEditUser}
          onDelete={handleDeleteUser}
        />
      )}
      {activeTab === 'customers' && (
        <CustomersTab
          key={`customers-${refreshKey}`}
          onEdit={handleEditCustomer}
          onDelete={handleDeleteCustomer}
          onAddDestination={handleAddDestination}
          onEditDestination={handleEditDestination}
          onDeleteDestination={handleDeleteDestination}
          onAddType={handleAddType}
        />
      )}
      {activeTab === 'products' && (
        <ProductsTab
          key={`products-${refreshKey}`}
          onEdit={handleEditProduct}
          onDelete={handleDeleteProduct}
        />
      )}
      {activeTab === 'types' && (
        <DeliveryTypesTab key={`types-${refreshKey}`} />
      )}

      {/* User Modals */}
      <FormModal
        isOpen={userFormModal.open}
        onClose={() => setUserFormModal({ open: false, data: null })}
        onSubmit={handleSubmitUser}
        title={userFormModal.data ? 'Edit User' : 'New User'}
        fields={getUserFormFields()}
        initialData={userFormModal.data}
        isLoading={isSubmitting}
        submitLabel={userFormModal.data ? 'Update' : 'Create'}
      />

      <DeleteModal
        isOpen={userDeleteModal.open}
        onClose={() => setUserDeleteModal({ open: false, data: null })}
        onConfirm={handleDeleteUserConfirm}
        title="Delete User"
        message={`Delete user "${userDeleteModal.data?.username}"? This action cannot be undone.`}
        isLoading={isSubmitting}
      />

      {/* Customer Modals */}
      <FormModal
        isOpen={formModal.open}
        onClose={() => setFormModal({ open: false, data: null })}
        onSubmit={handleSubmitCustomer}
        title={formModal.data ? 'Edit Customer' : 'New Customer'}
        fields={getCustomerFormFields()}
        initialData={formModal.data}
        isLoading={isSubmitting}
        submitLabel={formModal.data ? 'Update' : 'Create'}
      />

      <DeleteModal
        isOpen={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, data: null })}
        onConfirm={handleDeleteCustomerConfirm}
        title="Delete Customer"
        message={`Delete customer "${deleteModal.data?.name}"? This action cannot be undone.`}
        isLoading={isSubmitting}
      />

      {/* Destination Modals */}
      <FormModal
        isOpen={destFormModal.open}
        onClose={() => setDestFormModal({ open: false, data: null, customerId: null })}
        onSubmit={handleDestinationSubmit}
        title={destFormModal.data?.id ? 'Edit Destination' : 'New Destination'}
        customContent={(formData, setFormData, errors, setErrors) => (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Destination Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={e => {
                  setFormData(prev => ({ ...prev, name: e.target.value }));
                  if (errors?.name) setErrors(prev => { const n = { ...prev }; delete n.name; return n; });
                }}
                placeholder="e.g., Chennai"
                className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 transition-all ${errors?.name ? 'border-red-400 bg-red-50' : 'border-slate-300 focus:border-blue-400'}`}
              />
              {errors?.name && <p className="mt-1 text-xs text-red-500 font-medium">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Destination Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.code || ''}
                onChange={e => {
                  setFormData(prev => ({ ...prev, code: e.target.value }));
                  if (errors?.code) setErrors(prev => { const n = { ...prev }; delete n.code; return n; });
                }}
                placeholder="e.g., 2S85"
                className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 transition-all ${errors?.code ? 'border-red-400 bg-red-50' : 'border-slate-300 focus:border-blue-400'}`}
              />
              {errors?.code && <p className="mt-1 text-xs text-slate-400">Code for this destination location</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Type Name <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.type_name || ''}
                onChange={e => {
                  setFormData(prev => ({ ...prev, type_name: e.target.value }));
                  if (errors?.type_name) setErrors(prev => { const n = { ...prev }; delete n.type_name; return n; });
                }}
                className="w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 border-slate-300 focus:border-blue-400"
              >
                <option value="">Select type...</option>
                {['Regular', 'CKD', 'Non Regular'].map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              {errors?.type_name && <p className="mt-1 text-xs text-red-500 font-medium">{errors.type_name}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Type Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.type_code || ''}
                onChange={e => {
                  setFormData(prev => ({ ...prev, type_code: e.target.value }));
                  if (errors?.type_code) setErrors(prev => { const n = { ...prev }; delete n.type_code; return n; });
                }}
                placeholder="e.g., 1234"
                className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 transition-all ${errors?.type_code ? 'border-red-400 bg-red-50' : 'border-slate-300 focus:border-blue-400'}`}
              />
              {errors?.type_code && <p className="mt-1 text-xs text-red-500 font-medium">{errors.type_code}</p>}
            </div>
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_default || false}
                  onChange={e => setFormData(prev => ({ ...prev, is_default: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">Set as Default</span>
              </label>
            </div>
          </div>
        )}
        fields={[]}
        initialData={destFormModal.data || {}}
        isLoading={isSubmitting}
        submitLabel={destFormModal.data?.id ? 'Update' : 'Create'}
      />

      <DeleteModal
        isOpen={destDeleteModal.open}
        onClose={() => setDestDeleteModal({ open: false, data: null })}
        onConfirm={handleDestinationDeleteConfirm}
        title="Delete Destination"
        message={`Delete destination "${destDeleteModal.data?.name}"? This action cannot be undone.`}
        isLoading={isSubmitting}
      />

      {/* Add Type Modal - Add a new destination with specific type */}
      <FormModal
        isOpen={addTypeModal.open}
        onClose={() => setAddTypeModal({ open: false, destId: null, destName: '', destCode: '', customerId: null, currentTypes: [] })}
        onSubmit={async (formData) => {
          if (!formData.type_name || !formData.type_code) {
            toast.error('Type name and type code are required');
            return;
          }
          setIsSubmitting(true);
          try {
            // Create new destination record with specific type
            await api.post('/destinations', {
              customer_id: addTypeModal.customerId,
              name: addTypeModal.destName,
              code: addTypeModal.destCode,
              type_name: formData.type_name,
              type_code: formData.type_code,
              is_default: formData.is_default || false
            });
            toast.success(`Added ${formData.type_name} destination`);
            setAddTypeModal({ open: false, destId: null, destName: '', destCode: '', customerId: null, currentTypes: [] });
            handleRefresh();
          } catch (err) {
            toast.error(err.response?.data?.error?.message || 'Failed to add destination');
          } finally {
            setIsSubmitting(false);
          }
        }}
        title="Add Destination"
        customContent={(formData, setFormData, errors, setErrors) => (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-4">
              <p className="text-sm text-slate-500">Adding destination to:</p>
              <p className="font-semibold text-slate-800">{addTypeModal.destName}</p>
              <p className="text-xs text-slate-500 font-mono">Destination Code: {addTypeModal.destCode}</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Type Name <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.type_name || ''}
                onChange={e => {
                  setFormData(prev => ({ ...prev, type_name: e.target.value }));
                  if (errors?.type_name) setErrors(prev => { const n = { ...prev }; delete n.type_name; return n; });
                }}
                className="w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 border-slate-300 focus:border-blue-400"
              >
                <option value="">Select type...</option>
                {['Regular', 'CKD', 'Non Regular'].map(type => (
                  <option key={type} value={type} disabled={addTypeModal.currentTypes.includes(type)}>
                    {type}{addTypeModal.currentTypes.includes(type) ? ' (already exists)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Type Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.type_code || ''}
                onChange={e => {
                  setFormData(prev => ({ ...prev, type_code: e.target.value }));
                  if (errors?.type_code) setErrors(prev => { const n = { ...prev }; delete n.type_code; return n; });
                }}
                placeholder="e.g., 1234"
                className="w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 border-slate-300 focus:border-blue-400"
              />
              {errors?.type_code && <p className="mt-1 text-xs text-red-500 font-medium">{errors.type_code}</p>}
            </div>
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_default || false}
                  onChange={e => setFormData(prev => ({ ...prev, is_default: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">Set as Default</span>
              </label>
            </div>
          </div>
        )}
        fields={[]}
        initialData={{}}
        isLoading={isSubmitting}
        submitLabel="Add Destination"
      />

      {/* Product Modals */}
      <FormModal
        isOpen={productFormModal.open}
        onClose={() => setProductFormModal({ open: false, data: null })}
        onSubmit={handleSubmitProduct}
        title={productFormModal.data ? 'Edit Product' : 'New Product'}
        fields={getProductFormFields()}
        initialData={productFormModal.data}
        isLoading={isSubmitting}
        submitLabel={productFormModal.data ? 'Update' : 'Create'}
      />

      <DeleteModal
        isOpen={productDeleteModal.open}
        onClose={() => setProductDeleteModal({ open: false, data: null })}
        onConfirm={handleDeleteProductConfirm}
        title="Delete Product"
        message={`Delete product "${productDeleteModal.data?.model_code}"? This action cannot be undone.`}
        isLoading={isSubmitting}
      />
    </div>
  );
}

// Tab bar component
function TabBar({ activeTab, onTabChange, tabs }) {
  return (
    <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === tab.id
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <TabIcon name={tab.icon} className="w-4 h-4" />
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// Simple icon component
function TabIcon({ name, className }) {
  const icons = {
    Users: (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
      </svg>
    ),
    Building2: (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    Package: (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
    Truck: (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
      </svg>
    ),
  };
  return icons[name] || null;
}

export default AdminPage;
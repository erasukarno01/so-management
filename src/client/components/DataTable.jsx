// DataTable - Professional DataTable Component with Pagination, Search, and Custom Total Row
import { useState, useMemo, useEffect } from 'react';
import {
  ChevronUp, ChevronDown, ChevronsUpDown, ChevronsLeft, ChevronLeft,
  ChevronRight, ChevronsRight, Search, X
} from 'lucide-react';

const ROW_HEIGHT = 'h-12';
const PAGE_SIZES = [10, 25, 50, 100];

export function DataTable({
  columns = [],
  data = [],
  loading = false,
  error = null,
  title = '',
  searchable = true,
  exportable = false,
  onExport,
  showTotalRow = true,
  totalRowConfig = {},
  pageSize: initialPageSize = 10,
  showPageSizeSelector = true,
  showPagination = true,
  emptyMessage = 'No data available',
  striped = true,
  hoverable = true,
  stickyHeader = false,
  defaultSortKey = null,
  defaultSortDirection = 'asc',
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: defaultSortKey, direction: defaultSortDirection });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, pageSize]);

  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return data;
    const query = searchQuery.toLowerCase();
    return data.filter(row =>
      columns.some(col => {
        const value = row[col.key];
        if (value === null || value === undefined) return false;
        return String(value).toLowerCase().includes(query);
      })
    );
  }, [data, searchQuery, columns]);

  const sortedData = useMemo(() => {
    if (!sortConfig.key) return filteredData;
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (aVal === null || aVal === undefined) return sortConfig.direction === 'asc' ? 1 : -1;
      if (bVal === null || bVal === undefined) return sortConfig.direction === 'asc' ? -1 : 1;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      return sortConfig.direction === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
  }, [filteredData, sortConfig]);

  const totalItems = sortedData.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedData = sortedData.slice(startIndex, startIndex + pageSize);

  const totals = useMemo(() => {
    if (!showTotalRow || Object.keys(totalRowConfig).length === 0) return null;
    const result = {};
    Object.entries(totalRowConfig).forEach(([key, config]) => {
      const values = sortedData.map(row => row[key]).filter(v => typeof v === 'number');
      if (values.length > 0) {
        result[key] = config.aggregate === 'avg'
          ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)
          : values.reduce((a, b) => a + b, 0);
      }
    });
    return result;
  }, [sortedData, showTotalRow, totalRowConfig]);

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const goToPage = (page) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) {
      return <ChevronsUpDown className="w-4 h-4 text-slate-400" />;
    }
    return sortConfig.direction === 'asc'
      ? <ChevronUp className="w-4 h-4 text-blue-600" />
      : <ChevronDown className="w-4 h-4 text-blue-600" />;
  };

  const handleExport = () => {
    if (onExport) {
      onExport(sortedData);
    } else {
      const headers = columns.map(c => c.label).join(',');
      const rows = sortedData.map(row =>
        columns.map(c => {
          const val = row[c.key];
          return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
        }).join(',')
      ).join('\n');
      const csv = `${headers}\n${rows}`;
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title || 'export'}-${Date.now()}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-red-100 p-6">
        <div className="flex items-center gap-3 text-red-600">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <X className="w-5 h-5" />
          </div>
          <div>
            <p className="font-medium">Error Loading Data</p>
            <p className="text-sm text-red-500">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className={`overflow-x-auto ${stickyHeader ? 'max-h-[600px] overflow-y-auto' : ''}`}>
        <table className="w-full">
          <thead className={`bg-slate-800 text-white ${stickyHeader ? 'sticky top-0 z-10' : ''}`}>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-left
                    ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}
                    ${col.sortable !== false ? 'cursor-pointer hover:bg-slate-700 select-none' : ''}`}
                  style={{ width: col.width }}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                >
                  <div className={`flex items-center gap-2 ${col.align === 'center' ? 'justify-center' : col.align === 'right' ? 'justify-end' : 'justify-start'}`}>
                    <span>{col.label}</span>
                    {col.sortable !== false && <SortIcon columnKey={col.key} />}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <span className="text-slate-500 text-sm">Loading data...</span>
                  </div>
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
                      <Search className="w-8 h-8 text-slate-400" />
                    </div>
                    <p className="text-slate-600 font-medium">{emptyMessage}</p>
                    {searchQuery && (
                      <p className="text-sm text-slate-400">No results for "{searchQuery}"</p>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              paginatedData.map((row, rowIdx) => (
                <tr
                  key={row.id || rowIdx}
                  className={`${ROW_HEIGHT} transition-colors
                    ${striped && rowIdx % 2 === 1 ? 'bg-slate-100' : 'bg-white'}
                    ${hoverable ? 'hover:bg-blue-50 cursor-pointer' : ''}`}
                  onClick={row.onClick ? () => row.onClick(row) : undefined}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 text-sm
                        ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}
                        ${col.className || ''}`}
                    >
                      {col.render ? col.render(row[col.key], row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {showTotalRow && totals && !loading && paginatedData.length > 0 && (
            <tfoot className="bg-slate-800 text-white font-semibold">
              <tr className={ROW_HEIGHT}>
                {columns.map((col, idx) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 text-sm
                      ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}`}
                  >
                    {idx === 0 ? (
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-blue-400 rounded-full" />
                        TOTAL
                      </span>
                    ) : totals[col.key] !== undefined ? (
                      <span className="text-blue-300">
                        {col.totalFormatter ? col.totalFormatter(totals[col.key]) : totals[col.key].toLocaleString()}
                      </span>
                    ) : '-'}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {showPagination && (
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {showPageSizeSelector && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600">Rows per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="px-2 py-1 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {PAGE_SIZES.map(size => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>
            )}
            <span className="text-sm text-slate-600">
              Showing <span className="font-semibold">{startIndex + 1}-{Math.min(startIndex + pageSize, totalItems)}</span> of <span className="font-semibold">{totalItems.toLocaleString()}</span>
              {searchQuery && <span className="text-slate-400"> (filtered)</span>}
            </span>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button onClick={() => goToPage(1)} disabled={currentPage === 1} className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed" title="First page">
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed" title="Previous page">
                <ChevronLeft className="w-4 h-4" />
              </button>
              {getPageNumbers().map(page => (
                <button
                  key={page}
                  onClick={() => goToPage(page)}
                  className={`w-8 h-8 rounded text-sm font-medium transition-colors ${page === currentPage ? 'bg-blue-600 text-white' : 'hover:bg-slate-200 text-slate-700'}`}
                >
                  {page}
                </button>
              ))}
              <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed" title="Next page">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button onClick={() => goToPage(totalPages)} disabled={currentPage === totalPages} className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed" title="Last page">
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function BadgeCell({ value, variants = {} }) {
  const variant = variants[value] || 'default';
  const styles = {
    default: 'bg-slate-100 text-slate-700',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-red-100 text-red-700',
    info: 'bg-blue-100 text-blue-700',
    purple: 'bg-purple-100 text-purple-700',
  };
  return <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${styles[variant] || styles.default}`}>{value}</span>;
}

export function NumberCell({ value, format = 'number', color }) {
  const formatted = useMemo(() => {
    if (value === null || value === undefined) return '-';
    if (format === 'currency') return `$${Number(value).toLocaleString()}`;
    if (format === 'percent') return `${Number(value).toFixed(1)}%`;
    if (format === 'decimal') return Number(value).toFixed(2);
    return Number(value).toLocaleString();
  }, [value, format]);
  return <span className={color}>{formatted}</span>;
}

export function DateCell({ value, format = 'date' }) {
  if (!value) return '-';
  const date = new Date(value);
  if (isNaN(date.getTime())) return '-';
  const formatted = useMemo(() => {
    switch (format) {
      case 'datetime':
        return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      case 'time':
        return date.toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit' });
      case 'short':
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      default:
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  }, [value, format]);
  return <span className="text-slate-600">{formatted}</span>;
}

export default DataTable;
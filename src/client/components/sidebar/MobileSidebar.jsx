// MobileSidebar - Mobile drawer sidebar component
import { NavLink } from 'react-router-dom';
import { X } from 'lucide-react';

export function MobileSidebar({ isOpen, onClose, isAdmin }) {
  if (!isOpen) return null;

  const menuItems = [
    { path: '/', label: 'Dashboard' },
    { path: '/sales-orders', label: 'Sales Orders' },
    { path: '/delivery', label: 'Delivery' },
    { path: '/reports', label: 'Reports' },
    { path: '/alerts', label: 'Alerts' },
  ];

  const adminItems = [{ path: '/admin', label: 'Admin' }];

  return (
    <>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-40 lg:hidden" onClick={onClose} />
      <aside className="fixed left-0 top-0 h-screen w-[300px] bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white flex flex-col shadow-2xl z-50">
        <div className="flex items-center justify-between h-[72px] px-5 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 flex items-center justify-center">
              <img src="/logo.png" alt="Logo" className="w-7 h-7 object-contain" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Delivery Control</h1>
              <p className="text-[10px] text-slate-500">Management System</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 py-3 px-3 space-y-1">
          {menuItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={({ isActive }) => {
                  const active = isActive
                    ? `bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg`
                    : `text-slate-400 hover:bg-white/5 hover:text-white`;
                  return `flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${active}`;
                }}
              end={item.path === '/'}
            >
              <span className="font-semibold text-sm">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {isAdmin && (
          <div className="px-3 pt-2 mt-2 border-t border-white/5">
            <p className="text-[10px] font-bold text-slate-600 uppercase mb-2">Admin</p>
            <nav className="space-y-1">
              {adminItems.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onClose}
                  className={({ isActive }) => {
                  const active = isActive
                    ? `bg-gradient-to-r from-violet-600 to-purple-600 text-white`
                    : `text-slate-400 hover:bg-white/5 hover:text-white`;
                  return `flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${active}`;
                }}
                >
                  <span className="font-semibold text-sm">{item.label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
        )}

        <div className="p-3 border-t border-white/5">
          <div className="px-3 py-3 rounded-xl bg-white/2">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-[10px] text-slate-500">Version 2.0.0</p>
            </div>
            <p className="text-[9px] text-slate-600 text-center">© 2026 Delivery Control Systems</p>
          </div>
        </div>
      </aside>
    </>
  );
}

export default MobileSidebar;
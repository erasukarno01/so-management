// Sidebar component
import { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Menu, X, LayoutDashboard, ShoppingCart, Truck, BarChart3, Bell, Settings, ChevronLeft, ChevronRight } from 'lucide-react';

const menuItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/sales-orders', label: 'Sales Orders', icon: ShoppingCart },
  { path: '/delivery', label: 'Delivery', icon: Truck },
  { path: '/reports', label: 'Reports', icon: BarChart3 },
  { path: '/alerts', label: 'Alerts', icon: Bell },
];

const adminItems = [
  { path: '/admin', label: 'Admin', icon: Settings },
];

function Sidebar({ collapsed = false, onCollapsedChange }) {
  const { user } = useAuthStore();
  const location = useLocation();
  const isAdmin = user?.role === 'admin';
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggle = () => onCollapsedChange?.(!collapsed);
  const toggleMobile = () => setMobileOpen(!mobileOpen);

  // Close mobile on route change
  useEffect(() => { setMobileOpen(false); }, [location]);

  return (
    <>
      {/* Mobile toggle button */}
      <button
        onClick={toggleMobile}
        className="lg:hidden fixed top-4 left-4 z-[60] p-3 bg-slate-800 rounded-xl shadow-lg"
      >
        {mobileOpen ? <X className="w-6 h-6 text-white" /> : <Menu className="w-6 h-6 text-white" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileOpen(false)} />
      )}

      {/* Mobile sidebar */}
      <aside className={`lg:hidden fixed left-0 top-0 h-screen w-64 bg-slate-900 text-white z-50 transition-transform ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-16 flex items-center justify-between px-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Logo" className="w-8 h-8 object-contain" />
            <span className="font-bold">Delivery Control</span>
          </div>
          <button onClick={() => setMobileOpen(false)}><X className="w-5 h-5" /></button>
        </div>
        <nav className="p-3 space-y-1">
          {menuItems.map(item => (
            <NavItem key={item.path} to={item.path} icon={item.icon} label={item.label} />
          ))}
          {isAdmin && adminItems.map(item => (
            <NavItem key={item.path} to={item.path} icon={item.icon} label={item.label} variant="admin" />
          ))}
        </nav>
      </aside>

      {/* Desktop sidebar */}
      <aside className={`hidden lg:flex fixed left-0 top-0 h-screen bg-slate-900 text-white flex-col z-50 transition-all duration-300 ${collapsed ? 'w-16' : 'w-56'}`}>
        <div className="h-16 flex items-center justify-between px-4 border-b border-white/10">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="Logo" className="w-6 h-6 object-contain" />
              <span className="font-bold text-sm">Delivery Control</span>
            </div>
          )}
          <button onClick={toggle} className="p-2 hover:bg-white/10 rounded-lg">
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {menuItems.map(item => (
            <NavItem key={item.path} to={item.path} icon={item.icon} label={item.label} collapsed={collapsed} />
          ))}
          {isAdmin && (
            <>
              {!collapsed && <div className="text-xs text-slate-500 px-3 py-2">Admin</div>}
              {adminItems.map(item => (
                <NavItem key={item.path} to={item.path} icon={item.icon} label={item.label} variant="admin" collapsed={collapsed} />
              ))}
            </>
          )}
        </nav>
        <div className="p-2 border-t border-white/10 text-xs text-slate-500 text-center">
          {collapsed ? 'v2.0' : 'Version 2.0'}
        </div>
      </aside>
    </>
  );
}

function NavItem({ to, icon: Icon, label, variant = 'default', collapsed = false }) {
  const location = useLocation();
  const isActive = to === '/'
    ? location.pathname === '/'
    : location.pathname.startsWith(to);

  return (
    <Link
      to={to}
      className={`flex items-center gap-2 px-2 py-2 rounded-lg transition-colors ${
        isActive
          ? variant === 'admin' ? 'bg-purple-600 text-white' : 'bg-blue-600 text-white'
          : 'text-slate-400 hover:bg-white/5 hover:text-white'
      } ${collapsed ? 'justify-center' : ''}`}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      {!collapsed && <span className="font-medium text-sm truncate">{label}</span>}
    </Link>
  );
}

export default Sidebar;
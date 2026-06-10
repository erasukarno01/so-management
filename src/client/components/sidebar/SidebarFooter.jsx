// SidebarFooter - Footer for Sidebar with version info

export function SidebarFooter({ isExpanded }) {
  return (
    <div className={`relative p-3 border-t border-white/5 ${isExpanded ? '' : 'flex justify-center'}`}>
      {isExpanded ? (
        <div className="px-3 py-3 rounded-xl bg-white/[0.02] backdrop-blur-sm border border-white/5">
          <div className="flex items-center justify-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <p className="text-[10px] text-slate-500 font-medium tracking-wide">Version 2.0.0</p>
          </div>
          <p className="text-[9px] text-slate-600 text-center">© 2026 Delivery Control Systems</p>
        </div>
      ) : (
        <div className="w-8 h-8 rounded-lg bg-white/[0.02] border border-white/5 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        </div>
      )}
    </div>
  );
}

export default SidebarFooter;
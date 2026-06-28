const navItems = [
  { label: "Dashboard", icon: "🏠" },
  { label: "Products", icon: "📦" },
  { label: "Suppliers", icon: "🚚" },
  { label: "Pricing", icon: "💰" },
  { label: "Quotes", icon: "📝" },
  { label: "Team Stores", icon: "🏫" },
  { label: "Settings", icon: "⚙️" },
];

export default function Sidebar() {
  return (
    <aside className="w-64 bg-slate-800 p-6 text-white">
      <div>
        <h1 className="text-xl font-bold tracking-wide">Crossbar</h1>
        <p className="mt-1 text-sm text-slate-300">Product Platform</p>
      </div>

      <nav className="mt-10 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.label}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
              item.label === "Products"
                ? "bg-white text-slate-950 shadow"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="mt-10 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          Current Module
        </p>
        <p className="mt-1 text-sm font-medium text-white">Catalog Manager</p>
      </div>
    </aside>
  );
}
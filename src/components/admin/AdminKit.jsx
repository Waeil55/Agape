

/* =====================================================================
   Agape Admin Design System — Shared Primitives
   Uses the .adm-* component layer from index.css.
   ===================================================================== */

/* Lightweight inline glyphs so the kit has zero hard icon dependencies */


const SearchGlyph = ({ size = 16, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
  </svg>
);

/* =====================================================================
   AdminShell — Top-level layout wrapper
   Handles desktop sidebar + mobile pill bottom nav + topbar
   ===================================================================== */

export const AdminShell = ({
  nav = [],
  active,
  onNavigate,
  title,
  subtitle,
  eyebrow = 'Agape Care',
  actions,
  children,
  mobileNav = [],
  mobileActive,
  onMobileNavigate,
  fab,
  hideBrand = false,
  navInline = false,
}) => (
  <div className="admin-app">
    {/* Desktop Sidebar */}
    {!navInline && (
      <aside className="adm-sidebar hidden md:flex">
        {!hideBrand && (
          <div className="adm-brand">
            <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden shadow-sm mr-2">
              <img src="/agape.png" alt="Agape Care" className="w-6 h-6 object-contain" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="adm-brand-name">Agape Care</div>
              <div className="adm-brand-sub">Command Admin</div>
            </div>
          </div>
        )}

        {nav.map((group, gi) => (
          <div key={gi}>
            {group.label && <div className="adm-nav-group-label">{group.label}</div>}
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate?.(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`adm-nav-link focus-visible:ring-2 focus-visible:ring-blue-500 ${isActive ? 'is-active' : ''}`}
                >
                  {Icon && <Icon size={18} className="adm-nav-ico" />}
                  <span className="truncate">{item.label}</span>
                  {item.badge != null && <span className="adm-nav-badge">{item.badge}</span>}
                </button>
              );
            })}
          </div>
        ))}

        <div className="adm-sidebar-footer">
          <div className="flex items-center gap-2 px-2 text-[11px] font-semibold text-slate-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            System online
          </div>
        </div>
      </aside>
    )}

    {/* Main Column */}
    <div className="adm-main">
      <header className="adm-topbar !border-slate-200 !bg-white" style={{ backdropFilter: 'none' }}>
        <div className="w-11 h-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden shadow-sm md:hidden mr-2">
          <img src="/agape.png" alt="Agape Care" className="w-8 h-8 object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0 md:hidden">
            <p className="text-[15px] font-extrabold text-slate-900 leading-none tracking-tight">{eyebrow} Admin</p>
          </div>
          <h1 className="adm-topbar-title truncate hidden md:block">{title}</h1>
          <p className="adm-topbar-sub truncate md:hidden text-xs font-medium text-slate-500 mt-1">{title}</p>
          {subtitle && <p className="adm-topbar-sub truncate hidden md:block">{subtitle}</p>}
        </div>
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </header>

      {navInline && nav.length > 0 && (
        <div className="adm-subnav hidden md:block">
          {nav.map((group, gi) => (
            <div key={gi} className="adm-subnav-group">
              {group.label && <div className="adm-subnav-label">{group.label}</div>}
              <div className="adm-subnav-row">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = active === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onNavigate?.(item.id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`adm-subnav-link focus-visible:ring-2 focus-visible:ring-blue-500 ${isActive ? 'is-active' : ''}`}
                    >
                      {Icon && <Icon size={16} className="adm-nav-ico" />}
                      <span className="truncate">{item.label}</span>
                      {item.badge != null && <span className="adm-nav-badge">{item.badge}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <main data-scroll-region="admin-sections" className="adm-content">
        {children}
      </main>
    </div>

    {/* Mobile Bottom Nav */}
    <nav className="adm-bottomnav md:hidden">
      {mobileNav.map((item) => {
        const Icon = item.icon;
        const isActive = (mobileActive ?? active) === item.id;
        if (item.fab) {
          return (
            <button key={item.id} type="button" aria-label={item.label} onClick={() => onMobileNavigate?.(item.id)} className="adm-bottomnav-fab">
              {Icon && <Icon size={22} />}
            </button>
          );
        }
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onMobileNavigate?.(item.id)}
            aria-current={isActive ? 'page' : undefined}
            className={`adm-bottomnav-item focus-visible:ring-2 focus-visible:ring-blue-500 ${isActive ? 'is-active' : ''}`}
          >
            {Icon && <Icon size={20} />}
            <span className="label">{item.label}</span>
          </button>
        );
      })}
      {fab && (
        <button type="button" aria-label="Primary action" onClick={fab.onClick} className="adm-bottomnav-fab">
          {fab.icon && <fab.icon size={22} />}
        </button>
      )}
    </nav>
  </div>
);

/* =====================================================================
   Primitive Components
   ===================================================================== */

export const AdminCard = ({ children, className = '', pad = true, ...rest }) => (
  <div className={`adm-card rounded-xl border border-slate-200 bg-white shadow-sm ${pad ? 'adm-card-pad' : ''} ${className}`} {...rest}>{children}</div>
);

export const AdminCardHead = ({ icon: Icon, title, action }) => (
  <div className="adm-card-head">
    {Icon && <Icon size={18} className="adm-card-title-ico" />}
    <h2 className="adm-card-title">{title}</h2>
    {action && <div className="ml-auto">{action}</div>}
  </div>
);

export const AdminStat = ({ icon: Icon, value, label, accent }) => (
  <div className="adm-stat" style={accent ? { '--adm-accent-soft': accent } : undefined}>
    {Icon && <Icon size={20} className="adm-stat-ico" />}
    <div className="adm-stat-value">{value}</div>
    <div className="adm-stat-label">{label}</div>
  </div>
);

const TONE = {
  online: 'adm-badge--online',
  success: 'adm-badge--success',
  busy: 'adm-badge--busy',
  warning: 'adm-badge--warning',
  offline: 'adm-badge--offline',
  muted: 'adm-badge--muted',
  danger: 'adm-badge--danger',
  info: 'adm-badge--info',
  brand: 'adm-badge--brand',
};

export const AdminBadge = ({ tone = 'muted', dot = false, children }) => (
  <span className={`adm-badge ${TONE[tone] || TONE.muted}`}>
    {dot && <span className="dot" />}
    {children}
  </span>
);

export const AdminButton = ({ variant = 'primary', size, block, children, className = '', ...rest }) => (
  <button
    className={`adm-btn adm-btn--${variant} ${size === 'sm' ? 'adm-btn--sm' : ''} ${block ? 'adm-btn--block' : ''} ${className}`}
    {...rest}
  >
    {children}
  </button>
);

export const AdminIconButton = ({ danger = false, children, className = '', ...rest }) => (
  <button className={`adm-icon-btn ${danger ? 'adm-icon-btn--danger' : ''} ${className}`} {...rest}>
    {children}
  </button>
);

export const AdminAvatar = ({ name = '?', brand = false, size = 44 }) => (
  <div
    className={`adm-avatar ${brand ? 'adm-avatar--brand' : ''}`}
    style={{ width: size, height: size, fontSize: size * 0.4 }}
  >
    {String(name || '?').trim()[0]?.toUpperCase()}
  </div>
);

export const AdminSearch = ({ icon: Icon = SearchGlyph, value, onChange, placeholder }) => (
  <div className="adm-search-wrap">
    <Icon size={16} className="adm-search-ico" />
    <input
      className="adm-input pl-10"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
    />
  </div>
);

export const AdminPillTabs = ({ tabs, active, onChange }) => (
  <div className="adm-pill-tabs">
    {tabs.map((t) => (
      <button
        key={t.id}
        type="button"
        onClick={() => onChange?.(t.id)}
        className={`adm-pill-tab ${active === t.id ? 'is-active' : ''}`}
      >
        {t.label}
      </button>
    ))}
  </div>
);

export const AdminEmpty = ({ icon: Icon, title, hint }) => (
  <div className="adm-empty">
    {Icon && <Icon size={28} className="text-slate-300" />}
    <p className="text-sm font-semibold text-slate-500">{title}</p>
    {hint && <p className="text-xs font-medium text-slate-400">{hint}</p>}
  </div>
);

export const AdminSectionTitle = ({ children }) => (
  <div className="adm-section-title">{children}</div>
);

/* =====================================================================
   Default export for convenience
   ===================================================================== */
export default AdminShell;

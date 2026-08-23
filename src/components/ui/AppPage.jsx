import React from 'react';
import { AlertCircle, Inbox } from 'lucide-react';

export function AppPage({ children, className = '', ...props }) {
  return <main className={`ui-page ${className}`} {...props}>{children}</main>;
}

export function AppPageHeader({ eyebrow, title, description, actions, meta, className = '' }) {
  return (
    <header className={`ui-page-header ${className}`}>
      <div className="min-w-0">
        {eyebrow && <p className="ui-eyebrow">{eyebrow}</p>}
        <h1 className="ui-page-title">{title}</h1>
        {description && <p className="ui-page-description">{description}</p>}
        {meta && <div className="ui-page-meta">{meta}</div>}
      </div>
      {actions && <div className="ui-page-actions">{actions}</div>}
    </header>
  );
}

export function AppToolbar({ children, className = '', ariaLabel = 'Page controls' }) {
  return <div className={`ui-toolbar ${className}`} role="toolbar" aria-label={ariaLabel}>{children}</div>;
}

export function AppMetric({ icon: Icon, label, value, detail, tone = 'brand', className = '' }) {
  return (
    <article className={`ui-metric ui-metric--${tone} ${className}`}>
      <div className="ui-metric-copy">
        <p className="ui-metric-label">{label}</p>
        <p className="ui-metric-value">{value}</p>
        {detail && <p className="ui-metric-detail">{detail}</p>}
      </div>
      {Icon && <span className="ui-metric-icon"><Icon size={18} aria-hidden="true" /></span>}
    </article>
  );
}

export function AppSectionHeader({ title, description, actions, className = '' }) {
  return (
    <div className={`ui-section-header ${className}`}>
      <div className="min-w-0">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="ui-section-actions">{actions}</div>}
    </div>
  );
}

export function AppStatePanel({ icon: Icon, title, description, action, tone = 'empty', className = '' }) {
  const StateIcon = Icon || (tone === 'error' ? AlertCircle : Inbox);
  return (
    <section className={`ui-state-panel ui-state-panel--${tone} ${className}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="ui-state-icon"><StateIcon size={22} aria-hidden="true" /></span>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </section>
  );
}

export function AppSection({ children, className = '', ...props }) {
  return <section className={`ui-section ${className}`} {...props}>{children}</section>;
}

export function AppMetricGrid({ children, className = '', ...props }) {
  return <div className={`ui-metric-grid ${className}`} {...props}>{children}</div>;
}

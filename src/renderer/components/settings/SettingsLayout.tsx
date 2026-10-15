import React from 'react';

// Shared layout primitives for settings pages: one section = a small title,
// an optional hint, and a single bordered list whose rows are separated by
// hairlines. Pages compose these instead of hand-rolling spacing.

interface SectionProps {
  title?: string;
  description?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export const SettingsSection: React.FC<SectionProps> = ({ title, description, footer, children }) => (
  <section className="settings-section">
    {(title || description) && (
      <header className="settings-section-header">
        {title && <h3 className="settings-section-title">{title}</h3>}
        {description && <p className="settings-section-description">{description}</p>}
      </header>
    )}
    <div className="settings-list">{children}</div>
    {footer && <div className="settings-section-footer">{footer}</div>}
  </section>
);

interface RowProps {
  title?: string;
  description?: string;
  control?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

/** One list row: label and hint on the left, control on the right. */
export const SettingsListRow: React.FC<RowProps> = ({ title, description, control, children, className = '' }) => (
  <div className={`settings-list-row ${className}`}>
    {(title || description || control) && (
      <div className="settings-list-row-main">
        <div className="settings-list-row-text">
          {title && <h4 className="settings-list-row-title">{title}</h4>}
          {description && <p className="settings-list-row-description">{description}</p>}
        </div>
        {control && <div className="settings-list-row-control">{control}</div>}
      </div>
    )}
    {children}
  </div>
);

import React from 'react';

export function AppTable({ children, className = '', ...props }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className={`w-full text-left ${className}`} {...props}>
        {children}
      </table>
    </div>
  );
}

export function AppTableHead({ children, className = '', ...props }) {
  return (
    <thead className={`bg-blue-600 text-white ${className}`} {...props}>
      {children}
    </thead>
  );
}

export function AppTableHeadCell({ children, className = '', ...props }) {
  return (
    <th className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider ${className}`} {...props}>
      {children}
    </th>
  );
}

export function AppTableBody({ children, className = '', ...props }) {
  return (
    <tbody className={`divide-y divide-slate-100 ${className}`} {...props}>
      {children}
    </tbody>
  );
}

export function AppTableRow({ children, className = '', onClick, hover = true, ...props }) {
  const hoverClasses = hover ? 'hover:bg-slate-50/80' : '';
  const clickableClasses = onClick ? 'cursor-pointer' : '';

  return (
    <tr
      className={`${hoverClasses} ${clickableClasses} ${className}`}
      onClick={onClick}
      {...props}
    >
      {children}
    </tr>
  );
}

export function AppTableCell({ children, className = '', ...props }) {
  return (
    <td className={`px-3 py-1.5 text-xs text-slate-700 ${className}`} {...props}>
      {children}
    </td>
  );
}

export default AppTable;

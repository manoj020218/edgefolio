/**
 * EDGEFOLIO - Atomic Components
 * Base reusable components for building the UI
 */

// ============================================================================
// BUTTON Component
// ============================================================================

import React from 'react';
import { COLORS, BUTTON, TRANSITIONS, BORDER_RADIUS } from '../theme/designSystem';

export const Button = ({
  children,
  variant = 'primary', // primary, secondary, tertiary, danger
  size = 'md', // xs, sm, md, lg, xl
  isFullWidth = false,
  isLoading = false,
  isDisabled = false,
  icon: Icon = null,
  iconPosition = 'left',
  onClick,
  className = '',
  ...props
}) => {
  const baseStyles = `
    inline-flex items-center justify-center font-medium transition-all
    focus:outline-none focus:ring-2 focus:ring-offset-2
    disabled:opacity-50 disabled:cursor-not-allowed
    ${isFullWidth ? 'w-full' : ''}
    ${isLoading ? 'opacity-70 cursor-wait' : ''}
  `;

  const variants = {
    primary: `
      bg-[${COLORS.primary[500]}] text-white
      hover:bg-[${COLORS.primary[600]}]
      active:bg-[${COLORS.primary[700]}]
      focus:ring-[${COLORS.primary[500]}]
    `,
    secondary: `
      bg-[${COLORS.slate[700]}] text-[${COLORS.text}]
      hover:bg-[${COLORS.slate[600]}]
      active:bg-[${COLORS.slate[500]}]
      focus:ring-[${COLORS.primary[500]}]
    `,
    tertiary: `
      bg-transparent text-[${COLORS.primary[400]}]
      hover:bg-[${COLORS.slate[700]}]
      border border-[${COLORS.slate[600]}]
    `,
    danger: `
      bg-[${COLORS.danger[500]}] text-white
      hover:bg-[${COLORS.danger[600]}]
      active:bg-[${COLORS.danger[700]}]
    `,
  };

  const sizeStyles = BUTTON.sizes[size];

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${className}`}
      style={{
        padding: sizeStyles.padding,
        fontSize: sizeStyles.fontSize,
        height: sizeStyles.height,
        borderRadius: BORDER_RADIUS.lg,
        transition: TRANSITIONS.fast,
      }}
      onClick={onClick}
      disabled={isDisabled || isLoading}
      {...props}
    >
      {isLoading && <span className="mr-2">⏳</span>}
      {Icon && iconPosition === 'left' && <Icon className="mr-2 w-4 h-4" />}
      {children}
      {Icon && iconPosition === 'right' && <Icon className="ml-2 w-4 h-4" />}
    </button>
  );
};

// ============================================================================
// INPUT Component
// ============================================================================

export const Input = React.forwardRef(({
  type = 'text',
  size = 'md',
  isError = false,
  isDisabled = false,
  icon: Icon = null,
  label = null,
  helperText = null,
  placeholder = '',
  className = '',
  ...props
}, ref) => {
  const sizeStyles = { sm: '2rem', md: '2.5rem', lg: '3rem' }[size];

  return (
    <div className="w-full">
      {label && (
        <label className="block mb-2 text-sm font-medium text-slate-100">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && <Icon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />}
        <input
          ref={ref}
          type={type}
          placeholder={placeholder}
          disabled={isDisabled}
          className={`
            w-full px-4 py-2 bg-slate-800 text-slate-100 placeholder-slate-400
            border border-slate-700 rounded-lg
            focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent
            transition-all disabled:opacity-50 disabled:cursor-not-allowed
            ${Icon ? 'pl-10' : ''}
            ${isError ? 'border-red-500 focus:ring-red-500' : ''}
            ${className}
          `}
          style={{ height: sizeStyles }}
          {...props}
        />
      </div>
      {helperText && (
        <p className={`mt-1 text-xs ${isError ? 'text-red-500' : 'text-slate-400'}`}>
          {helperText}
        </p>
      )}
    </div>
  );
});

// ============================================================================
// SELECT Component
// ============================================================================

export const Select = React.forwardRef(({
  options = [],
  size = 'md',
  isError = false,
  isDisabled = false,
  label = null,
  helperText = null,
  placeholder = 'Select option...',
  className = '',
  ...props
}, ref) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block mb-2 text-sm font-medium text-slate-100">
          {label}
        </label>
      )}
      <select
        ref={ref}
        disabled={isDisabled}
        className={`
          w-full px-4 py-2 bg-slate-800 text-slate-100 placeholder-slate-400
          border border-slate-700 rounded-lg
          focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent
          transition-all disabled:opacity-50 disabled:cursor-not-allowed
          appearance-none bg-no-repeat
          ${isError ? 'border-red-500 focus:ring-red-500' : ''}
          ${className}
        `}
        style={{
          backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
          backgroundPosition: 'right 0.75rem center',
          backgroundSize: '1.5em 1.5em',
          paddingRight: '2.5rem',
        }}
        {...props}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {helperText && (
        <p className={`mt-1 text-xs ${isError ? 'text-red-500' : 'text-slate-400'}`}>
          {helperText}
        </p>
      )}
    </div>
  );
});

// ============================================================================
// CARD Component
// ============================================================================

export const Card = ({
  children,
  className = '',
  header = null,
  footer = null,
  isPadded = true,
  isClickable = false,
  onClick = null,
}) => {
  return (
    <div
      className={`
        bg-slate-800 border border-slate-700 rounded-lg
        overflow-hidden shadow-md
        transition-all
        ${isClickable ? 'cursor-pointer hover:border-slate-600 hover:shadow-lg' : ''}
        ${className}
      `}
      onClick={onClick}
    >
      {header && (
        <div className="px-6 py-4 border-b border-slate-700 bg-slate-900">
          {header}
        </div>
      )}
      <div className={isPadded ? 'px-6 py-4' : ''}>
        {children}
      </div>
      {footer && (
        <div className="px-6 py-4 border-t border-slate-700 bg-slate-900">
          {footer}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// BADGE Component
// ============================================================================

export const Badge = ({
  children,
  variant = 'default', // default, success, warning, danger, info
  size = 'md', // sm, md, lg
  className = '',
}) => {
  const variants = {
    default: 'bg-slate-700 text-slate-100',
    success: 'bg-green-900 text-green-100',
    warning: 'bg-yellow-900 text-yellow-100',
    danger: 'bg-red-900 text-red-100',
    info: 'bg-blue-900 text-blue-100',
  };

  const sizes = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base',
  };

  return (
    <span
      className={`
        inline-flex items-center font-medium rounded-full
        ${variants[variant]} ${sizes[size]} ${className}
      `}
    >
      {children}
    </span>
  );
};

// ============================================================================
// TABLE Component
// ============================================================================

export const Table = ({
  columns = [],
  data = [],
  isStriped = true,
  isHoverable = true,
  isBordered = true,
  className = '',
}) => {
  return (
    <div className={`overflow-x-auto rounded-lg border border-slate-700 ${className}`}>
      <table className="w-full">
        <thead>
          <tr className="bg-slate-900 border-b border-slate-700">
            {columns.map((column) => (
              <th
                key={column.key}
                className="px-6 py-3 text-left text-sm font-semibold text-slate-100"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-6 py-8 text-center text-slate-400">
                No data available
              </td>
            </tr>
          ) : (
            data.map((row, idx) => (
              <tr
                key={idx}
                className={`
                  border-b border-slate-700
                  ${isStriped && idx % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800'}
                  ${isHoverable ? 'hover:bg-slate-700 transition-colors' : ''}
                `}
              >
                {columns.map((column) => (
                  <td key={column.key} className="px-6 py-4 text-sm text-slate-100">
                    {column.render ? column.render(row[column.key], row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

// ============================================================================
// AVATAR Component
// ============================================================================

export const Avatar = ({
  src = null,
  initials = '?',
  size = 'md', // xs, sm, md, lg, xl
  status = null, // online, offline, away
  className = '',
}) => {
  const sizes = {
    xs: 'w-6 h-6 text-xs',
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-base',
    lg: 'w-12 h-12 text-lg',
    xl: 'w-16 h-16 text-2xl',
  };

  const statusColors = {
    online: 'bg-green-500',
    offline: 'bg-slate-500',
    away: 'bg-yellow-500',
  };

  return (
    <div className={`relative inline-block ${className}`}>
      <div
        className={`
          ${sizes[size]} rounded-full flex items-center justify-center font-medium
          ${src ? '' : 'bg-gradient-to-br from-sky-500 to-blue-600 text-white'}
        `}
      >
        {src ? (
          <img src={src} alt="avatar" className="w-full h-full rounded-full object-cover" />
        ) : (
          initials
        )}
      </div>
      {status && (
        <div
          className={`
            absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-800
            ${statusColors[status]}
          `}
        />
      )}
    </div>
  );
};

// ============================================================================
// MODAL Component
// ============================================================================

export const Modal = ({
  isOpen = false,
  onClose,
  title = '',
  children,
  footer = null,
  size = 'md', // sm, md, lg, xl
}) => {
  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className={`bg-slate-800 rounded-lg shadow-2xl ${sizes[size]} w-full mx-4`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 transition-colors"
          >
            ✕
          </button>
        </div>
        <div className="px-6 py-4">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-slate-700 bg-slate-900 rounded-b-lg">{footer}</div>}
      </div>
    </div>
  );
};

// ============================================================================
// ALERT Component
// ============================================================================

export const Alert = ({
  variant = 'info', // info, success, warning, danger
  title = '',
  message = '',
  onClose = null,
  className = '',
}) => {
  const variants = {
    info: { bg: 'bg-blue-900 bg-opacity-20', border: 'border-blue-700', text: 'text-blue-100' },
    success: { bg: 'bg-green-900 bg-opacity-20', border: 'border-green-700', text: 'text-green-100' },
    warning: { bg: 'bg-yellow-900 bg-opacity-20', border: 'border-yellow-700', text: 'text-yellow-100' },
    danger: { bg: 'bg-red-900 bg-opacity-20', border: 'border-red-700', text: 'text-red-100' },
  };

  const style = variants[variant];

  return (
    <div
      className={`${style.bg} border ${style.border} rounded-lg p-4 ${style.text} ${className}`}
    >
      <div className="flex items-start justify-between">
        <div>
          {title && <h3 className="font-semibold mb-1">{title}</h3>}
          {message && <p className="text-sm">{message}</p>}
        </div>
        {onClose && (
          <button onClick={onClose} className="text-current opacity-50 hover:opacity-100">
            ✕
          </button>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// SPINNER Component
// ============================================================================

export const Spinner = ({
  size = 'md', // xs, sm, md, lg
  color = 'blue',
  className = '',
}) => {
  const sizes = {
    xs: 'w-3 h-3 border',
    sm: 'w-4 h-4 border',
    md: 'w-6 h-6 border-2',
    lg: 'w-8 h-8 border-2',
  };

  return (
    <div
      className={`${sizes[size]} border-slate-700 border-t-sky-500 rounded-full animate-spin ${className}`}
    />
  );
};

// ============================================================================
// EMPTY STATE Component
// ============================================================================

export const EmptyState = ({
  icon: Icon = null,
  title = 'No data',
  message = '',
  action = null,
  className = '',
}) => {
  return (
    <div className={`flex flex-col items-center justify-center py-12 ${className}`}>
      {Icon && <Icon className="w-12 h-12 text-slate-400 mb-4" />}
      <h3 className="text-lg font-medium text-slate-100 mb-2">{title}</h3>
      {message && <p className="text-sm text-slate-400 mb-4">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};

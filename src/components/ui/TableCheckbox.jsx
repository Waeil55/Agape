import { useEffect, useRef } from 'react';
import { Check, Minus } from 'lucide-react';

const TableCheckbox = ({ checked, indeterminate = false, onChange, label, disabled = false }) => {
  const inputRef = useRef(null);
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = Boolean(indeterminate && !checked);
  }, [checked, indeterminate]);

  return (
    <label
      className={`relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer hover:bg-blue-100/80'}`}
      onClick={(event) => event.stopPropagation()}
    >
      <input
        ref={inputRef}
        type="checkbox"
        checked={Boolean(checked)}
        disabled={disabled}
        aria-label={label}
        className="peer !absolute !left-1/2 !top-1/2 !h-5 !w-5 -translate-x-1/2 -translate-y-1/2 opacity-0"
        onChange={onChange}
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-flex h-5 w-5 items-center justify-center rounded-md border-2 shadow-sm transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-blue-300 peer-focus-visible:ring-offset-1 ${
          checked || indeterminate
            ? 'border-blue-600 bg-blue-600 text-white'
            : 'border-slate-400 bg-white text-transparent'
        }`}
      >
        {indeterminate && !checked ? <Minus size={15} strokeWidth={3.25} /> : <Check size={15} strokeWidth={3.25} />}
      </span>
    </label>
  );
};

export default TableCheckbox;

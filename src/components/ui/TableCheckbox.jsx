import { useEffect, useRef } from 'react';

const TableCheckbox = ({ checked, indeterminate = false, onChange, label, disabled = false }) => {
  const inputRef = useRef(null);
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = Boolean(indeterminate && !checked);
  }, [checked, indeterminate]);

  return (
    <input
      ref={inputRef}
      type="checkbox"
      checked={Boolean(checked)}
      disabled={disabled}
      aria-label={label}
      onClick={(event) => event.stopPropagation()}
      onChange={onChange}
    />
  );
};

export default TableCheckbox;

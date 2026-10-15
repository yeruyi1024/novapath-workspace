import { ChevronDownIcon } from '@heroicons/react/24/outline';
import React, { useEffect, useRef, useState } from 'react';

interface ThemedSelectProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  label?: string;
}

const ThemedSelect: React.FC<ThemedSelectProps> = ({
  id,
  value,
  onChange,
  options,
  className = '',
  label,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Find the selected option label
  const selectedOption = options.find(option => option.value === value);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handle option selection
  const handleOptionClick = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex items-center space-x-3">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-foreground whitespace-nowrap">
            {label}
          </label>
        )}
        <div className="flex-1">
          <button
            id={id}
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className={`flex items-center justify-between w-full min-h-[32px] rounded-lg bg-surface border-border border text-foreground px-3 py-1.5 text-xs font-medium shadow-sm transition-colors hover:bg-surface-raised focus:border-primary focus:ring-1 focus:ring-primary/40 focus:outline-none ${className}`}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
          >
            <span className="min-w-0 truncate text-left">{selectedOption?.label || value}</span>
            <ChevronDownIcon className="w-3.5 h-3.5 ml-2 shrink-0 text-secondary" />
          </button>

          {isOpen && (
            <div className="absolute z-20 w-full mt-1 overflow-auto rounded-lg shadow-popover max-h-60 focus:outline-none">
              <ul
                className="py-1 overflow-auto text-xs bg-surface border border-border rounded-lg shadow-elevated"
                role="listbox"
                aria-labelledby={id}
              >
                {options.map((option) => (
                  <li
                    key={option.value}
                    className={`cursor-pointer select-none relative py-1.5 px-3 hover:bg-surface-raised flex items-center justify-between ${
                      option.value === value ? 'bg-surface-raised text-primary font-medium' : 'text-foreground font-normal'
                    }`}
                    role="option"
                    aria-selected={option.value === value}
                    onClick={() => handleOptionClick(option.value)}
                  >
                    <span className="truncate">{option.label}</span>
                    {option.value === value && <span className="ml-2 text-primary font-bold">✓</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ThemedSelect; 
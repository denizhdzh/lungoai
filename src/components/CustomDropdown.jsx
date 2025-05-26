import React, { useState, useEffect, useRef } from 'react';
import { CaretDown, Check } from '@phosphor-icons/react';

const CustomDropdown = ({
  options,
  selectedValue,
  onSelect,
  placeholder = "Select...",
  icon,
  itemRenderFn, // Optional: (option, isSelected) => JSX
  className = "",
  dropdownWidthClass = "w-56", // Default width, can be overridden
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);
  const dropdownContentRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (option) => {
    onSelect(option);
    setIsOpen(false);
  };

  const getDisplayValue = () => {
    if (!selectedValue) return placeholder;
    const selectedOption = options.find(opt => opt.id === selectedValue || (typeof selectedValue === 'object' && opt.id === selectedValue.id));
    return selectedOption ? selectedOption.name : placeholder;
  };
  
  const getSelectedOptionDetails = () => {
    if (!selectedValue) return null;
    return options.find(opt => opt.id === selectedValue || (typeof selectedValue === 'object' && opt.id === selectedValue.id));
  }

  const selectedOptionDetails = getSelectedOptionDetails();

  // NOTION-STYLE DROPDOWN
  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`group flex items-center justify-between w-full text-sm bg-white dark:bg-zinc-900 hover:bg-neutral-900/10 dark:hover:bg-neutral-100/10 border border-gray-200 dark:border-zinc-700 rounded-lg transition-all duration-150 px-3 h-11 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Icon */}
          {icon && !selectedOptionDetails?.imageUrl && React.cloneElement(icon, { 
            size: 14, 
            weight: "regular",
            className: "text-gray-600 dark:text-gray-400 flex-shrink-0" 
          })}
          
          {/* Image (if present) */}
          {selectedOptionDetails?.imageUrl && (
            <div className="w-5 h-5 rounded-md overflow-hidden flex-shrink-0 border border-gray-200 dark:border-zinc-700">
              <img 
                src={selectedOptionDetails.imageUrl} 
                alt={selectedOptionDetails.name} 
                className="w-full h-full object-cover" 
              />
            </div>
          )}
          
          {/* Text */}
          <span className={`truncate text-sm ${selectedValue ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
            {getDisplayValue()}
          </span>
        </div>
        
        {/* Caret */}
        <CaretDown 
          size={12} 
          weight="regular" 
          className={`text-gray-400 dark:text-gray-500 transform transition-transform duration-200 flex-shrink-0 ml-2 ${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>

      {/* Dropdown Content */}
      {isOpen && (
        <div 
          ref={dropdownContentRef}
          className={`absolute z-40 mb-1 ${dropdownWidthClass} bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-lg max-h-[320px] overflow-y-auto scrollbar-hide`}
          style={{ bottom: 'calc(100% + 4px)' }}
        >
          <div className="p-1">
            {options.length === 0 ? (
              <div className="px-2.5 py-2 text-gray-500 dark:text-gray-400 text-xs">No options available</div>
            ) : (
              options.map((option) => {
                const isSelected = selectedValue === option.id || (typeof selectedValue === 'object' && selectedValue.id === option.id);
                
                if (itemRenderFn) {
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleSelect(option)}
                      className={`w-full text-left rounded-md transition-colors hover:bg-neutral-900/10 dark:hover:bg-neutral-100/10 ${isSelected ? 'bg-neutral-900/10 dark:bg-neutral-100/10' : ''} px-2 py-1.5`}
                    >
                      {itemRenderFn(option, isSelected)}
                    </button>
                  );
                }
                
                // Default item renderer
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleSelect(option)}
                    className={`w-full text-left rounded-md transition-colors hover:bg-neutral-900/10 dark:hover:bg-neutral-100/10 ${isSelected ? 'bg-neutral-900/10 dark:bg-neutral-100/10' : ''} px-2 py-1.5 flex items-center gap-2.5`}
                  >
                    {/* Option Image */}
                    {option.imageUrl ? (
                      <div className="w-8 h-8 rounded-md overflow-hidden border border-gray-200 dark:border-zinc-700 flex-shrink-0">
                        <img 
                          src={option.imageUrl} 
                          alt={option.name} 
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-8 h-8 flex items-center justify-center rounded-md bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-zinc-700 flex-shrink-0">
                        {icon && React.cloneElement(icon, { size: 14, className: "text-gray-400 dark:text-gray-500" })}
                      </div>
                    )}
                    
                    {/* Option Text and Check */}
                    <div className="flex flex-grow items-center justify-between min-w-0">
                      <span className="text-gray-900 dark:text-gray-100 truncate pr-2 text-xs font-medium">
                        {option.name}
                      </span>
                      {isSelected && (
                        <Check size={14} weight="bold" className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomDropdown; 
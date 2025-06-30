import React, { useState, useEffect, useRef } from 'react';
import { CaretDown, Check, X } from '@phosphor-icons/react';

const CustomDropdown = ({
  options,
  selectedValue,
  onSelect,
  placeholder = "Select...",
  icon,
  itemRenderFn, // Optional: (option, isSelected, isMulti) => JSX
  className = "",
  dropdownWidthClass = "w-56", // Default width, can be overridden
  disabled = false,
  isMulti = false, // New prop for multi-select
  closeOnSelect = true, // New prop to control closing on select (esp. for multi)
  displayMode = "list", // New prop: "list" or "grid"
  onOpenStateChange, // New prop to notify parent about open state
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

  // Notify parent about open state changes
  useEffect(() => {
    if (onOpenStateChange) {
      onOpenStateChange(isOpen);
    }
  }, [isOpen, onOpenStateChange]);

  const handleSelect = (option) => {
    if (isMulti) {
      const currentSelectedIds = Array.isArray(selectedValue) ? selectedValue.map(val => typeof val === 'object' ? val.id : val) : [];
      let newSelectedValues;
      if (currentSelectedIds.includes(option.id)) {
        newSelectedValues = selectedValue.filter(val => (typeof val === 'object' ? val.id : val) !== option.id);
      } else {
        // Maintain the type of items in selectedValue (object or id)
        const newItem = options.find(o => o.id === option.id); // Get the full option object
        newSelectedValues = [...(selectedValue || []), newItem ]; // Add the full option object
      }
      onSelect(newSelectedValues);
      if (!closeOnSelect) {
        setIsOpen(true); // Keep dropdown open if closeOnSelect is false
      } else {
        setIsOpen(false);
      }
    } else {
      onSelect(option);
      setIsOpen(false);
    }
  };
  
  const isOptionSelected = (option) => {
    if (isMulti) {
      if (!Array.isArray(selectedValue) || selectedValue.length === 0) return false;
      return selectedValue.some(sel => (typeof sel === 'object' ? sel.id : sel) === option.id);
    }
    if (!selectedValue) return false;
    return (typeof selectedValue === 'object' ? selectedValue.id : selectedValue) === option.id;
  };

  const getDisplayValue = () => {
    if (isMulti) {
      if (!Array.isArray(selectedValue) || selectedValue.length === 0) return placeholder;
      if (selectedValue.length === 1) {
         const singleSelected = options.find(opt => opt.id === (typeof selectedValue[0] === 'object' ? selectedValue[0].id : selectedValue[0]));
         return singleSelected ? singleSelected.name : placeholder;
      }
      return `${selectedValue.length} selected`; // e.g., "3 selected"
    }
    // Single select logic
    if (!selectedValue) return placeholder;
    const selectedOption = options.find(opt => opt.id === (typeof selectedValue === 'object' ? selectedValue.id : selectedValue));
    return selectedOption ? selectedOption.name : placeholder;
  };
  
  const getSelectedOptionDetailsForSingle = () => { // Renamed for clarity
    if (isMulti || !selectedValue) return null;
    return options.find(opt => opt.id === (typeof selectedValue === 'object' ? selectedValue.id : selectedValue));
  }

  const selectedOptionDetails = getSelectedOptionDetailsForSingle(); // Used for single select display

  // Function to clear all selections in multi-select mode
  const handleClearMultiSelection = (e) => {
    e.stopPropagation(); // Prevent dropdown from closing/opening
    if (isMulti) {
      onSelect([]); // Pass empty array to clear
    }
  };

  // NOTION-STYLE DROPDOWN
  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`group flex items-center justify-between w-full text-sm bg-white dark:bg-neutral-900 hover:bg-neutral-100/10 dark:hover:bg-neutral-800/10 border border-stone-200 dark:border-stone-700 rounded-lg transition-all duration-150 px-3 h-11 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* --- MODIFIED ICON LOGIC --- */}
          {/* Show selected option's icon/flag/emoji if available, otherwise fallback to dropdown icon */}
          {!selectedOptionDetails?.imageUrl && (
            selectedOptionDetails?.flag ? (
              <div className="w-5 h-5 flex items-center justify-center rounded-lg text-lg flex-shrink-0 bg-neutral-50 dark:bg-neutral-800/50 border border-stone-200/50 dark:border-stone-700/50">
                {selectedOptionDetails.flag}
              </div>
            ) : selectedOptionDetails?.icon ? (
              <div className="w-5 h-5 flex items-center justify-center rounded-lg text-stone-600 dark:text-stone-400 flex-shrink-0">
                {React.cloneElement(selectedOptionDetails.icon, { size: 14 })}
              </div>
            ) : icon && (
              React.isValidElement(icon) && icon.type === 'img' 
                ? icon // If it's an <img> tag, render it directly
                : React.cloneElement(icon, { // Otherwise, clone it with props
                    size: 14, 
                    weight: "regular",
                    className: "text-stone-600 dark:text-stone-400 flex-shrink-0" 
                  })
            )
          )}
          {/* --- END MODIFIED ICON LOGIC --- */}
          
          {/* Image (only for single select display or if one item selected in multi) */}
          {!isMulti && selectedOptionDetails?.imageUrl && (
            <div className="w-5 h-5 rounded-sm overflow-hidden flex-shrink-0 border border-stone-200 dark:border-stone-700">
              <img 
                src={selectedOptionDetails.imageUrl} 
                alt={selectedOptionDetails.name} 
                className="w-full h-full object-cover" 
              />
            </div>
          )}
           {isMulti && Array.isArray(selectedValue) && selectedValue.length === 1 && options.find(opt => opt.id === (typeof selectedValue[0] === 'object' ? selectedValue[0].id : selectedValue[0]))?.imageUrl && (
             <div className="w-5 h-5 rounded-sm overflow-hidden flex-shrink-0 border border-stone-200 dark:border-stone-700">
               <img 
                 src={options.find(opt => opt.id === (typeof selectedValue[0] === 'object' ? selectedValue[0].id : selectedValue[0]))?.imageUrl}
                 alt={options.find(opt => opt.id === (typeof selectedValue[0] === 'object' ? selectedValue[0].id : selectedValue[0]))?.name}
                 className="w-full h-full object-cover"
               />
             </div>
           )}

          {/* Text Display */}
          <span className={`truncate text-sm ${(!isMulti && selectedValue) || (isMulti && Array.isArray(selectedValue) && selectedValue.length > 0) ? 'text-stone-900 dark:text-stone-100 font-medium' : 'text-stone-500 dark:text-stone-400'}`}>
            {getDisplayValue()}
          </span>
        </div>
        
        {/* Clear button for multi-select */}
        {isMulti && Array.isArray(selectedValue) && selectedValue.length > 0 && (
          <button 
            type="button" 
            onClick={handleClearMultiSelection} 
            className="p-0.5 ml-1.5 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700 text-stone-400 dark:text-stone-500"
            aria-label="Clear selection"
          >
            <X size={10} weight="bold" />
          </button>
        )}

        <CaretDown 
          size={12} 
          weight="regular" 
          className={`text-stone-400 dark:text-stone-500 transform transition-transform duration-200 flex-shrink-0 ml-2 ${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>

      {/* Dropdown Content */}
      {isOpen && (
        <div 
          ref={dropdownContentRef}
          className={`absolute z-40 mb-1 ${dropdownWidthClass} bg-white dark:bg-neutral-900 border border-stone-200 dark:border-stone-700 rounded-lg shadow-lg max-h-[320px] overflow-y-auto scrollbar-hide`}
          style={{ bottom: 'calc(100% + 4px)' }}
        >
          <div className={displayMode === "grid" ? "p-3 grid grid-cols-2 gap-3" : "p-2 space-y-1"}>
            {options.length === 0 ? (
                              <div className={`px-2.5 py-2 text-stone-500 dark:text-stone-400 text-xs w-full text-center ${displayMode === "grid" ? 'col-span-2' : ''}`}>No options available</div>
            ) : (
              options.map((option) => {
                const isSelected = isOptionSelected(option);
                
                if (itemRenderFn) {
                  return (
                    <div 
                      key={option.id}
                      onClick={() => handleSelect(option)} 
                      className={`p-2 rounded-lg transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50 ${isSelected && !isMulti ? 'bg-neutral-50 dark:bg-neutral-800/50' : ''} cursor-pointer ${displayMode === "grid" ? 'flex justify-center' : 'w-full text-left'}`}>
                      {itemRenderFn(option, isSelected, isMulti)}
                    </div>
                  );
                }
                
                // Default item renderer (vertical list style)
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleSelect(option)}
                    className={`w-full text-left rounded-lg transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50 ${isSelected && !isMulti ? 'bg-neutral-50 dark:bg-neutral-800/50' : ''} px-3 py-2.5 flex items-center gap-3`}
                  >
                    {isMulti && (
                      <input 
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}} 
                        className="form-checkbox h-4 w-4 rounded text-blue-600 border-stone-300 dark:border-stone-600 bg-white dark:bg-neutral-700 focus:ring-blue-500 dark:focus:ring-offset-stone-800 flex-shrink-0"
                        onClick={(e) => e.stopPropagation()} 
                      />
                    )}
                    {option.imageUrl ? (
                      <div className="w-5 h-5 rounded-sm overflow-hidden border border-stone-200 dark:border-stone-700 flex-shrink-0">
                        <img 
                          src={option.imageUrl} 
                          alt={option.name} 
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                       icon && (
                        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                          {React.cloneElement(icon, { size: 14, className: "text-stone-400 dark:text-stone-500" })}
                        </div>
                       )
                    )}
                    <div className="flex flex-grow items-center justify-between min-w-0">
                      <span className={`text-stone-900 dark:text-stone-100 truncate pr-2 text-sm font-medium ${isMulti && isSelected ? 'font-semibold': ''}`}>
                        {option.name}
                      </span>
                      {!isMulti && isSelected && ( 
                        <Check size={13} weight="bold" className="text-indigo-500 flex-shrink-0" />
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
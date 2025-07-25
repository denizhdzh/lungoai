import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { models, getModelById, requiresImage, supportsImageInput, getModelsByCategory } from '../config/models.js';
import ReactFlow, {
	Controls,
	Background,
	applyNodeChanges,
	applyEdgeChanges,
	addEdge,
	Handle,
	Position,
	MarkerType,
	useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';

// Loading Animation Component
function LoadingAnimation({ className = "", variant = "default" }) {
  if (variant === "grid") {
    // Grid loading animation for card-based layouts
    return (
      <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 ${className}`}>
        {[...Array(8)].map((_, index) => (
          <div key={index} className="animate-pulse">
            <div className="bg-neutral-200 dark:bg-neutral-700 rounded-lg aspect-[9/16]"></div>
          </div>
        ))}
      </div>
    );
  }

  // Default wave squares loading animation - Full frame with random opacity changes
  const randomDelays = React.useMemo(() => {
    return [...Array(64)].map(() => Math.random() * 6);
  }, []);
  
  return (
    <div className="w-full h-full">
      <div className="w-full h-full grid grid-cols-8 grid-rows-8 gap-0.5">
        {[...Array(64)].map((_, index) => (
          <div
            key={index}
            className="bg-neutral-600 dark:bg-neutral-700 rounded-sm animate-fade-wave"
            style={{
              animationDelay: `${randomDelays[index]}s`
            }}
          />
        ))}
      </div>
    </div>
  );
}
import {
	Image, 
	VideoCamera, 
	Plus,
	Upload,
	Sparkle,
	CaretDown,
	Square,
	Asterisk,
	Rectangle,
	DeviceMobile,
	Palette,
	Smiley,
	Play,
	Lightning,
	ArrowUp,
	PencilSimple,
	Mountains,
	Users,
	Package,
	ShoppingBag,
	Video,
	Info,
	GitMerge,
	Question,
	Camera,
	ImagesSquare,
	FilmSlate,
	User,
	X,
	ClockCounterClockwise,
	ListNumbers,
	ArrowsClockwise,
	UploadSimple,
	Bug,
} from '@phosphor-icons/react';
import { generateImage, generateVideo, checkApiKey, GENERATION_TYPES, IMAGE_STYLES, QUALITY_OPTIONS } from '../services/ai';
import { useOutletContext } from 'react-router-dom';
import { db, functions, auth } from '../firebase';
import { collection, query, onSnapshot, orderBy, doc, getDoc, setDoc, getDocs, limit, updateDoc, addDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import CanvasTutorial from '../components/CanvasTutorial';
import CustomDropdown from '../components/CustomDropdown';

// Custom hook for handle hover behavior
const useHandleHover = () => {
	const [showHandles, setShowHandles] = useState(false);
	const handleTimeoutRef = useRef(null);

	const handleMouseEnter = useCallback(() => {
		if (handleTimeoutRef.current) {
			clearTimeout(handleTimeoutRef.current);
		}
		setShowHandles(true);
	}, []);

	const handleMouseLeave = useCallback(() => {
		handleTimeoutRef.current = setTimeout(() => {
			setShowHandles(false);
		}, 2000);
	}, []);

	useEffect(() => {
		return () => {
			if (handleTimeoutRef.current) {
				clearTimeout(handleTimeoutRef.current);
			}
		};
	}, []);

	return { showHandles, handleMouseEnter, handleMouseLeave };
};

// Universal Node Wrapper with consistent styling
const NodeWrapper = ({ 
	children, 
	selected, 
	width, 
	height, 
	nodeType,
	aspectRatio = '9:16',
	onDragOver,
	onDragLeave,
	onDrop,
	className = ""
}) => {
	const { showHandles, handleMouseEnter, handleMouseLeave } = useHandleHover();
	
	// Calculate dimensions based on aspect ratio
	const getNodeDimensions = () => {
		const baseSize = 320;
		
		switch(aspectRatio) {
			case '16:9':
				return { width: baseSize * (16/9), height: baseSize };
			case '1:1':
				return { width: baseSize, height: baseSize };
			case '4:3':
				return { width: baseSize * (4/3), height: baseSize };
			case '3:4':
				return { width: baseSize, height: baseSize * (4/3) };
			case '9:16':
				return { width: baseSize, height: baseSize * (16/9) };
			default:
				return { width: width || baseSize, height: height || baseSize * (16/9) };
		}
	};
	
	const { width: nodeWidth, height: nodeHeight } = width && height ? 
		{ width, height } : getNodeDimensions();
	
	return (
		<div 
			className={`group bg-transparent border rounded-2xl p-2.5 transition-all duration-300 ease-in-out text-neutral-200 border-neutral-600 ${
				selected ? 'border-lime-400' : ''
			} ${className}`}
			style={{ 
				width: nodeWidth,
				height: nodeHeight,
				transition: 'width 0.3s ease, height 0.3s ease'
			}}
			onDragOver={onDragOver}
			onDragLeave={onDragLeave}
			onDrop={onDrop}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
		>
			{/* Node type label */}
			<div className="absolute -top-6 left-0 text-xs text-neutral-400 font-bold duration-200 z-10">
				{nodeType}
			</div>

			{/* Corner lines */}
			<div className="absolute top-2 left-2 w-8 h-8 pointer-events-none z-10">
				<div className={`w-full h-full border-t-2 border-l-2 rounded-tl-xl ${selected ? 'border-lime-400' : 'border-neutral-500'}`}></div>
			</div>
			<div className="absolute bottom-2 right-2 w-8 h-8 pointer-events-none z-10">
				<div className={`w-full h-full border-b-2 border-r-2 rounded-br-xl ${selected ? 'border-lime-400' : 'border-neutral-500'}`}></div>
			</div>

			{/* Inner frame */}
			<div className="bg-neutral-900 rounded-xl shadow-lg w-full h-full">
				{children}
			</div>

			{/* Handles */}
			{/* Target Handle */}
			<Handle 
				type="target" 
				position={Position.Left} 
				style={{
					width: '36px',
					height: '72px',
					background: 'black',
					border: 'none',
					outline: 'none',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					color: 'white',
					left: '-18px',
					opacity: showHandles ? 1 : 0,
					transition: 'opacity 0.2s ease'
				}}
			>
				<div style={{
					width: '4px',
					height: '4px',
					borderRadius: '50%',
					backgroundColor: 'white'
				}}></div>
			</Handle>
			
			{/* Source Handle */}
			<Handle 
				type="source" 
				position={Position.Right} 
				style={{
					width: '36px',
					height: '72px',
					background: 'black',
					border: 'none',
					outline: 'none',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					color: 'white',
					right: '-18px',
					opacity: showHandles ? 1 : 0,
					transition: 'opacity 0.2s ease'
				}}
			>
				<div style={{
					width: '4px',
					height: '4px',
					borderRadius: '50%',
					backgroundColor: 'white'
				}}></div>
			</Handle>

		</div>
	);
};

const LogoNaked = ({ className }) => (
	<svg viewBox="0 0 566 399" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
		<rect x="35" y="35" width="496" height="329" rx="93" stroke="currentColor" strokeWidth="70"/>
	</svg>
);

// Custom Image Dropdown Component
const CustomImageDropdown = React.memo(({ 
	options, 
	value, 
	onChange, 
	onDropdownStateChange, 
	placeholder = "Select option",
	className = ""
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
	const dropdownRef = useRef(null);
	const buttonRef = useRef(null);

	const selectedOption = options.find(opt => opt.value === value);

	const handleToggle = () => {
		if (!isOpen && buttonRef.current) {
			const rect = buttonRef.current.getBoundingClientRect();
			setDropdownPosition({
				top: rect.bottom + window.scrollY + 4,
				left: rect.left + window.scrollX,
				width: rect.width
			});
		}
		const newState = !isOpen;
		setIsOpen(newState);
		onDropdownStateChange?.(newState);
	};

	const handleSelect = (option) => {
		onChange?.(option.value);
		setIsOpen(false);
		onDropdownStateChange?.(false);
	};

	// Click outside to close
	useEffect(() => {
		const handleClickOutside = (event) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target) &&
			    buttonRef.current && !buttonRef.current.contains(event.target)) {
				setIsOpen(false);
				onDropdownStateChange?.(false);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [onDropdownStateChange]);

	return (
		<>
			<div className={`relative ${className}`}>
				<button
					ref={buttonRef}
					onClick={handleToggle}
					className="w-full bg-neutral-800 border border-lime-500/30 rounded-lg px-3 py-2 text-xs text-lime-300 focus:outline-none hover:bg-neutral-750 transition-all duration-200 flex items-center gap-2 justify-between"
				>
				<div className="flex items-center gap-2 min-w-0">
					{selectedOption?.image && (
						<img 
							src={selectedOption.image} 
							alt={selectedOption.label}
							className="w-5 h-5 rounded object-cover flex-shrink-0"
						/>
					)}
					<span className="truncate">{selectedOption?.label || placeholder}</span>
				</div>
				<CaretDown 
					size={12} 
					className={`text-lime-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
				/>
			</button>

			</div>

			{/* Portal dropdown to body */}
			{isOpen && createPortal(
				<div 
					ref={dropdownRef}
					className="bg-neutral-900 border border-lime-500/50 rounded-lg shadow-2xl overflow-hidden"
					style={{ 
						position: 'absolute',
						top: dropdownPosition.top,
						left: dropdownPosition.left,
						width: dropdownPosition.width,
						maxHeight: '300px',
						zIndex: 99999
					}}
					onMouseEnter={() => onDropdownStateChange?.(true)}
					onMouseLeave={() => onDropdownStateChange?.(true)}
				>
					<div 
						className="overflow-y-auto p-1 max-h-72"
						onWheel={(e) => {
							e.stopPropagation();
						}}
					>
						{options.map((option) => (
							<button
								key={option.value}
								onClick={(e) => {
									e.stopPropagation();
									e.preventDefault();
									handleSelect(option);
								}}
								onMouseDown={(e) => {
									e.stopPropagation();
								}}
								className="w-full flex items-center gap-3 p-2 text-xs text-lime-300 hover:bg-lime-500/20 rounded transition-colors text-left cursor-pointer"
							>
								{option.image && (
									<img 
										src={option.image} 
										alt={option.label}
										className="w-8 h-8 rounded object-cover flex-shrink-0"
										draggable={false}
									/>
								)}
								<div className="min-w-0">
									<div className="font-medium truncate">{option.label}</div>
									{(option.type || option.subtitle) && (
										<div className="text-neutral-400 text-[10px] truncate">
											{option.subtitle || option.type?.replace('_', ' ')}
										</div>
									)}
								</div>
							</button>
						))}
					</div>
				</div>,
				document.body
			)}
		</>
	);
});


// Custom Model Dropdown Component
const ModelDropdown = ({ value, options, onChange, hasImageInput, onDropdownStateChange }) => {
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef(null);
	const buttonRef = useRef(null);

	const selectedOption = options.find(opt => opt.value === value);

	const handleToggle = () => {
		setIsOpen(!isOpen);
		onDropdownStateChange?.(!isOpen);
	};

	const handleSelect = (option) => {
		if (!option.disabled) {
			onChange(option.value);
			setIsOpen(false);
			onDropdownStateChange?.(false);
		}
	};

	// Click outside to close and close on drag
	useEffect(() => {
		const handleClickOutside = (event) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target) &&
			    buttonRef.current && !buttonRef.current.contains(event.target)) {
				setIsOpen(false);
				onDropdownStateChange?.(false);
			}
		};

		const handleMouseMove = (event) => {
			// Close dropdown if mouse is dragging (node being moved)
			if (event.buttons === 1 && isOpen) {
				setIsOpen(false);
				onDropdownStateChange?.(false);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		document.addEventListener('mousemove', handleMouseMove);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('mousemove', handleMouseMove);
		};
	}, [onDropdownStateChange, isOpen]);

	// Add scrollbar styles
	useEffect(() => {
		const style = document.createElement('style');
		style.textContent = `
			.model-dropdown-scroll::-webkit-scrollbar {
				width: 8px;
			}
			.model-dropdown-scroll::-webkit-scrollbar-track {
				background: #404040;
				border-radius: 4px;
			}
			.model-dropdown-scroll::-webkit-scrollbar-thumb {
				background: #525252;
				border-radius: 4px;
			}
			.model-dropdown-scroll::-webkit-scrollbar-thumb:hover {
				background: #606060;
			}
		`;
		document.head.appendChild(style);
		return () => document.head.removeChild(style);
	}, []);

	const getCreditsText = (modelConfig) => {
		if (typeof modelConfig.creditsPerSecond === 'number') {
			return `${Math.ceil(modelConfig.creditsPerSecond)} credits/sec`;
		} else if (typeof modelConfig.creditsPerSecond === 'object') {
			const entries = Object.entries(modelConfig.creditsPerSecond);
			if (entries.length === 1) {
				return `${Math.ceil(entries[0][1])} credits/sec`;
			} else {
				const values = Object.values(modelConfig.creditsPerSecond);
				const min = Math.ceil(Math.min(...values));
				const max = Math.ceil(Math.max(...values));
				return min === max ? `${min} credits/sec` : `${min}-${max} credits/sec`;
			}
		}
		return '';
	};

	const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });

	const updateDropdownPosition = () => {
		if (buttonRef.current) {
			const rect = buttonRef.current.getBoundingClientRect();
			setDropdownPosition({
				top: rect.bottom + window.scrollY + 4,
				left: rect.left + window.scrollX,
				width: rect.width
			});
		}
	};

	const handleToggleWithPosition = () => {
		if (!isOpen) {
			updateDropdownPosition();
		}
		setIsOpen(!isOpen);
		onDropdownStateChange?.(!isOpen);
	};

	return (
		<div className="relative">
			<button
				ref={buttonRef}
				onClick={handleToggleWithPosition}
				className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-2 py-1.5 text-xs text-neutral-200 hover:bg-neutral-750 transition-all flex items-center justify-between"
			>
				<span className="truncate text-[11px]">{selectedOption?.label || 'Select Model'}</span>
				<CaretDown size={10} className="text-neutral-400 flex-shrink-0 ml-1" />
			</button>

			{isOpen && createPortal(
				<div 
					ref={dropdownRef}
					className="fixed bg-neutral-800 border border-neutral-700 rounded-xl shadow-xl z-[9999] max-h-80 overflow-y-auto model-dropdown-scroll"
					style={{
						top: dropdownPosition.top,
						left: dropdownPosition.left,
						width: dropdownPosition.width,
						scrollbarWidth: 'thin',
						scrollbarColor: '#525252 #404040'
					}}
					onWheel={(e) => e.stopPropagation()}
					onScroll={(e) => e.stopPropagation()}
				>
					{options.map((option) => {
						const isDisabled = option.disabled;
						const creditsText = getCreditsText(option);
						
						return (
							<button
								key={option.value}
								onClick={() => handleSelect(option)}
								disabled={isDisabled}
								className={`w-full px-2 py-1.5 text-left transition-colors ${
									isDisabled 
										? 'bg-neutral-800/50 text-neutral-500 cursor-not-allowed' 
										: value === option.value
											? 'bg-neutral-700 text-white'
											: 'hover:bg-neutral-700/50 text-neutral-200'
								}`}
							>
								<div className="flex items-center justify-between">
									<span className={`text-[11px] truncate ${isDisabled ? 'text-neutral-500' : 'text-white'}`}>
										{option.label}
									</span>
									{isDisabled && (
										<span className="text-[10px] text-orange-400 ml-2">
											Need Image
										</span>
									)}
								</div>
							</button>
						);
					})}
				</div>,
				document.body
			)}
		</div>
	);
};

// Enhanced Dropdown Component with search and categories
const EnhancedDropdown = ({ value, options, onChange, isOpen, onToggle, onOpenStateChange }) => {
	const dropdownRef = useRef(null);
	const [searchTerm, setSearchTerm] = useState('');

	// Add custom scrollbar styles
	React.useEffect(() => {
		const style = document.createElement('style');
		style.textContent = `
			.enhanced-dropdown-scroll::-webkit-scrollbar {
				width: 8px;
			}
			.enhanced-dropdown-scroll::-webkit-scrollbar-track {
				background: #404040;
				border-radius: 4px;
			}
			.enhanced-dropdown-scroll::-webkit-scrollbar-thumb {
				background: #525252;
				border-radius: 4px;
			}
			.enhanced-dropdown-scroll::-webkit-scrollbar-thumb:hover {
				background: #666666;
			}
		`;
		document.head.appendChild(style);
		return () => document.head.removeChild(style);
	}, []);

	// Close dropdown when clicking outside
	React.useEffect(() => {
		const handleClickOutside = (event) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
				if (isOpen) {
					onToggle();
				}
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [isOpen, onToggle]);

	// Notify parent about open state changes
	React.useEffect(() => {
		if (onOpenStateChange) {
			onOpenStateChange(isOpen);
		}
	}, [isOpen, onOpenStateChange]);

	// Filter options based on search
	const filteredOptions = options.filter(option => 
		option.label.toLowerCase().includes(searchTerm.toLowerCase())
	);

	// Group options by category
	const generalOptions = filteredOptions.filter(opt => opt.value === 'general');
	const backgroundOptions = filteredOptions.filter(opt => opt.value === 'background');
	const characterOptions = filteredOptions.filter(opt => 
		opt.value !== 'general' && opt.value !== 'background'
	);

	const selectedOption = options.find(opt => opt.value === value) || options[0];

	return (
		<div ref={dropdownRef} className="relative">
			<button
				onClick={onToggle}
				className="bg-neutral-800 border border-neutral-700 rounded-2xl px-4 py-2.5 text-neutral-200 text-sm focus:outline-none hover:bg-neutral-750 transition-all duration-200 flex items-center gap-3"
			>
				{selectedOption?.backgroundImage ? (
					<img 
						src={selectedOption.backgroundImage} 
						alt={selectedOption.label}
						className="w-5 h-5 object-cover rounded"
					/>
				) : selectedOption?.icon ? (
					<selectedOption.icon size={16} className="text-neutral-400" />
				) : null}
				<span className="truncate font-semibold">{selectedOption?.label || 'Select Style'}</span>
				<CaretDown 
					size={12} 
					className={`text-neutral-400 transition-transform duration-200 ml-auto ${isOpen ? 'rotate-180' : ''}`} 
				/>
			</button>

			{isOpen && (
				<div 
					className="absolute top-full left-0 mt-2 bg-neutral-800/95 backdrop-blur-lg border border-neutral-700/50 rounded-2xl z-[9999] w-80 shadow-2xl flex flex-col overflow-hidden"
					style={{ maxHeight: '450px' }} // Set a max height for the whole dropdown
					onWheel={(e) => {
						// Force stop all propagation to parent elements
						e.stopPropagation();
						e.preventDefault();
					}}
				>
					{/* Search Bar (non-scrolling part) */}
					<div className="p-3 border-b border-neutral-700/50 flex-shrink-0">
						<div className="relative">
							<div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">
								<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
									<path d="M21.71 20.29L18 16.61A9 9 0 1 0 16.61 18l3.68 3.68a1 1 0 0 0 1.42-1.42zM11 18a7 7 0 1 1 7-7 7 7 0 0 1-7 7z"/>
								</svg>
							</div>
							<input
								type="text"
								placeholder="Search Styles..."
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
								onMouseDown={(e) => e.stopPropagation()}
								className="w-full bg-neutral-700/50 border border-neutral-600/50 rounded-xl px-10 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-500 focus:bg-neutral-700"
							/>
						</div>
					</div>

					{/* Options List (scrolling part) */}
					<div 
						className="flex-grow overflow-y-auto enhanced-dropdown-scroll"
						onWheel={(e) => {
							// Stop event propagation to prevent canvas zoom
							e.stopPropagation();
						}}
					>
						<div className="p-2 space-y-1">
							{/* General Section */}
							{generalOptions.length > 0 && (
								<>
									<div className="px-3 pt-2 pb-1 text-xs font-semibold text-neutral-400 tracking-wide uppercase">
										General
									</div>
									{generalOptions.map((option) => (
										<button
											key={option.value}
											onClick={(e) => {
												e.preventDefault();
												e.stopPropagation();
												onChange(option.value);
												onToggle();
												setSearchTerm('');
											}}
											className={`w-full p-4 text-sm text-left rounded-xl transition-all duration-200 group ${
												value === option.value 
													? 'bg-neutral-700 ring-2 ring-lime-400/50' 
													: 'hover:bg-neutral-700/50'
											}`}
										>
											<div className="flex items-center gap-4">
												<div className="w-16 h-16 rounded-xl bg-neutral-600 flex items-center justify-center flex-shrink-0 border border-neutral-600">
													<option.icon size={28} className="text-neutral-300" />
												</div>
												<div className="flex-1 min-w-0">
													<div className="font-semibold text-white text-sm truncate">{option.label}</div>
													<div className="text-xs text-neutral-400 truncate mt-1">Any type of image</div>
												</div>
												{value === option.value && (
													<div className="w-5 h-5 bg-lime-400 rounded-full flex items-center justify-center flex-shrink-0">
														<div className="w-2 h-2 bg-black rounded-full"></div>
													</div>
												)}
											</div>
										</button>
									))}
								</>
							)}

							{/* Background Section */}
							{backgroundOptions.length > 0 && (
								<>
									<div className="px-3 pt-2 pb-1 text-xs font-semibold text-neutral-400 tracking-wide uppercase">
										Background
									</div>
									{backgroundOptions.map((option) => (
										<button
											key={option.value}
											onClick={(e) => {
												e.preventDefault();
												e.stopPropagation();
												onChange(option.value);
												onToggle();
												setSearchTerm('');
											}}
											className={`w-full p-4 text-sm text-left rounded-xl transition-all duration-200 group ${
												value === option.value 
													? 'bg-neutral-700 ring-2 ring-lime-400/50' 
													: 'hover:bg-neutral-700/50'
											}`}
										>
											<div className="flex items-center gap-4">
												<div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 border border-neutral-600">
													<img 
														src={option.backgroundImage} 
														alt={option.label}
														className="w-full h-full object-cover"
													/>
												</div>
												<div className="flex-1 min-w-0">
													<div className="font-semibold text-white text-sm truncate">{option.label}</div>
													<div className="text-xs text-neutral-400 truncate mt-1">Background Scene</div>
												</div>
												{value === option.value && (
													<div className="w-5 h-5 bg-lime-400 rounded-full flex items-center justify-center flex-shrink-0">
														<div className="w-2 h-2 bg-black rounded-full"></div>
													</div>
												)}
											</div>
										</button>
									))}
								</>
							)}

							{/* Character Styles Section */}
							{characterOptions.length > 0 && (
								<>
									<div className="px-3 pt-2 pb-1 text-xs font-semibold text-neutral-400 tracking-wide uppercase">
										Character Styles
									</div>
									{characterOptions.map((option) => (
										<button
											key={option.value}
											onClick={(e) => {
												e.preventDefault();
												e.stopPropagation();
												onChange(option.value);
												onToggle();
												setSearchTerm('');
											}}
											className={`w-full p-4 text-sm text-left rounded-xl transition-all duration-200 group ${
												value === option.value 
													? 'bg-neutral-700 ring-2 ring-lime-400/50' 
													: 'hover:bg-neutral-700/50'
											}`}
										>
											<div className="flex items-center gap-4">
												<div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 border border-neutral-600">
													<img 
														src={option.backgroundImage} 
														alt={option.label}
														className="w-full h-full object-cover"
													/>
												</div>
												<div className="flex-1 min-w-0">
													<div className="font-semibold text-white text-sm truncate">{option.label}</div>
													<div className="text-xs text-neutral-400 truncate mt-1">{option.subtitle}</div>
												</div>
												{value === option.value && (
													<div className="w-5 h-5 bg-lime-400 rounded-full flex items-center justify-center flex-shrink-0">
														<div className="w-2 h-2 bg-black rounded-full"></div>
													</div>
												)}
											</div>
										</button>
									))}
								</>
							)}

							{/* No Results */}
							{filteredOptions.length === 0 && (
								<div className="p-4 text-center text-neutral-500 text-sm">
									No styles found for "{searchTerm}"
								</div>
							)}
						</div>
					</div>

					{/* Footer (non-scrolling part) */}
					<div className="p-3 border-t border-neutral-700/50 flex items-center justify-between text-xs text-neutral-500 flex-shrink-0">
						<span>See all Styles</span>
						<span>+ New style</span>
					</div>
				</div>
			)}
		</div>
	);
};

const initialNodes = [];

// AI Frame Component - Enhanced with rich options like slideshow
	const AIFrame = ({ 
	id, 
	data, 
	selected, 
	onGenerate,
	onImageUpload,
	onSettingChange,
	onUpdateNode,
	onDropdownStateChange,
	onRemoveIncomingEdges
}) => {
	const { formData = {}, generatedContent, isGenerating, error, connectedImages = [], uploadedImage } = data;
	const fileInputRef = useRef(null);
	const [openDropdown, setOpenDropdown] = useState(null);

	// Local state for form fields
	const [prompt, setPrompt] = useState(formData.prompt || '');
	const [model, setModel] = useState(formData.model || (data.type === 'video' ? 'google/veo-3-fast' : 'google/imagen-4'));
	const modelConfig = getModelById(model);
	const [duration, setDuration] = useState(formData.duration || (data.type === 'video' ? (modelConfig?.params?.duration?.default || 8) : 3));
	const [selectedAspectRatio, setSelectedAspectRatio] = useState(formData.aspect_ratio || '3:4');
	const [isDragOver, setIsDragOver] = useState(false);
	const [isConnectionDragOver, setIsConnectionDragOver] = useState(false);
	const { showHandles, handleMouseEnter, handleMouseLeave } = useHandleHover();


	// This effect syncs the component's internal state with props from the parent canvas.
	// It's crucial for when data is loaded or updated externally, preventing "stale state".
	useEffect(() => {
		if (formData) {
			const newModel = formData.model || (data.type === 'video' ? 'google/veo-3-fast' : 'google/imagen-4');
			const newModelConfig = getModelById(newModel);
			const defaultDuration = data.type === 'video' ? (newModelConfig?.params?.duration?.default || 8) : 3;
			
			setDuration(formData.duration || defaultDuration);
			setModel(newModel);
			setSelectedAspectRatio(formData.aspect_ratio || '3:4');
			// We intentionally don't sync `prompt` here to avoid cursor jumps and conflicts while typing.
		}
	}, [formData.duration, formData.model, formData.aspect_ratio, data.type]);

	// Update duration when model changes to use model's default/first option
	// Also remove image connections if model doesn't support images
	useEffect(() => {
		const modelConfig = getModelById(model);
		if (modelConfig && data.type === 'video') {
			// Use model's default duration or first available option
			const defaultDuration = modelConfig.params?.duration?.default || 
				(modelConfig.options?.duration?.length > 0 ? modelConfig.options.duration[0] : 8);
			
			// Only update if current duration is not in the model's available options
			if (modelConfig.options?.duration && !modelConfig.options.duration.includes(duration)) {
				setDuration(defaultDuration);
				// Update parent component
				const currentFormData = formData || {};
				onUpdateNode(id, { 
					formData: { ...currentFormData, duration: defaultDuration, model }
				});
			}

			// If model doesn't support image input, clear connected images and uploaded image
			if (!supportsImageInput(model) && (connectedImages.length > 0 || uploadedImage)) {
				console.log('🗑️ Model', model, 'does not support images, clearing image connections');
				
				// Clear uploaded image and connected images from node data
				onUpdateNode(id, { 
					connectedImages: [],
					uploadedImage: null
				});

				// Remove incoming edges from image nodes
				if (onRemoveIncomingEdges) {
					onRemoveIncomingEdges(id);
				}
			}
		}
	}, [model, connectedImages.length, uploadedImage]);

	const handleDropdownToggle = (dropdownId) => {
		setOpenDropdown(prev => (prev === dropdownId ? null : dropdownId));
	};

	// Click outside to close dropdowns
	useEffect(() => {
		const handleClickOutside = (event) => {
			if (openDropdown && !event.target.closest('.custom-dropdown')) {
				setOpenDropdown(null);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [openDropdown]);

	// Get available models using new config system
	const getAvailableModels = () => {
		const category = data.type === 'image' ? 'image' : 'video';
		const categoryModels = getModelsByCategory(category);
		
		// Return all models in category - no filtering, all available
		return Object.entries(categoryModels).map(([modelId, modelConfig]) => ({
			value: modelId,
			label: modelConfig.name,
			...modelConfig
		}));
	};


	// Handle image upload
	const handleImageUpload = (file) => {
		if (file && file.type.startsWith('image/')) {
			const reader = new FileReader();
			reader.onload = (e) => {
				const result = e.target.result;
				onUpdateNode(id, { 
					uploadedImage: {
						url: result,
						fileName: file.name,
						size: file.size
					}
				});
			};
			reader.readAsDataURL(file);
		}
	};

	// Handle drag and drop
	const handleDragOver = (e) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(true);
	};

	const handleDragLeave = (e) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(false);
	};

	const handleDrop = (e) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(false);
		const files = e.dataTransfer.files;
		if (files.length > 0) {
			handleImageUpload(files[0]);
		}
	};

	// Handle node connection drag and drop for frames
	const handleConnectionDragOver = (e) => {
		if (e.dataTransfer.types.includes('application/reactflow')) {
			e.preventDefault();
			e.stopPropagation();
			setIsConnectionDragOver(true);
		}
	};

	const handleConnectionDragLeave = (e) => {
		e.preventDefault();
		e.stopPropagation();
		setIsConnectionDragOver(false);
	};

	const handleConnectionDrop = (e) => {
		if (e.dataTransfer.types.includes('application/reactflow')) {
			e.preventDefault();
			e.stopPropagation();
			setIsConnectionDragOver(false);
			
			// React Flow will handle the connection automatically
			// This just provides visual feedback
		}
	};

	// Update form data when local state changes
	React.useEffect(() => {
		const timeoutId = setTimeout(() => {
			onUpdateNode(id, { 
				formData: { prompt, duration, model },
				connectedImages 
			});
		}, 100);
		
		return () => clearTimeout(timeoutId);
	}, [id, onUpdateNode, prompt, duration, model, connectedImages]);

	const handleGenerate = async () => {
		console.log('🚀 handleGenerate called');
		console.log('- prompt:', prompt);
		console.log('- data.type:', data.type);
		console.log('- model:', model);
		console.log('- onGenerate exists:', !!onGenerate);
		
		if (!prompt.trim()) {
			console.log('❌ No prompt provided');
			alert('Please enter a prompt');
			return;
		}

		if (onGenerate) {
			// Combine connected images with uploaded image
			const allImages = [...connectedImages];
			if (uploadedImage) {
				allImages.push({
					id: `uploaded-${Date.now()}`,
					url: uploadedImage.url,
					fileName: uploadedImage.fileName,
					type: 'image',
					sourceType: 'uploaded'
				});
			}

			const generationData = {
				type: data.type,
				prompt,
				duration: data.type === 'video' ? duration : undefined,
				model,
				connectedImages: allImages,
				uploadedImage,
				aspect_ratio: selectedAspectRatio // Use the selected aspect ratio
			};

			console.log('📤 Sending generation data:', generationData);

			// Clear the prompt immediately after sending
			setPrompt('');
			
			// Update node to generating state and apply selected aspect ratio
			const currentFormData = formData || {};
			onUpdateNode(id, { 
				formData: { 
					...currentFormData, 
					prompt: '', // Clear prompt in form data too
					aspect_ratio: selectedAspectRatio // Apply the selected aspect ratio
				},
				isGenerating: true // Set generating state
			});

			try {
				await onGenerate(id, generationData);
				console.log('✅ Generation completed');
			} catch (error) {
				console.error('❌ Generation failed:', error);
			}
		} else {
			console.log('❌ onGenerate function not provided');
		}
	};

	const getCreditsForType = () => {
		const selectedModelConfig = getModelById(model);
		if (selectedModelConfig) {
			// Handle image models
			if (typeof selectedModelConfig.credits === 'number') {
				return selectedModelConfig.credits;
			}
			// Handle video models with per-second pricing
			if (data.type === 'video' && selectedModelConfig.creditsPerSecond) {
				const videoDuration = duration || 5;
				let creditsPerSec = selectedModelConfig.creditsPerSecond;
				
				// Handle resolution-dependent pricing
				if (typeof creditsPerSec === 'object') {
					const resolution = formData?.resolution || '480p';
					const mode = formData?.mode || 'standard';
					
					// Check for resolution-based pricing (ByteDance, MiniMax)
					if (creditsPerSec[resolution]) {
						creditsPerSec = creditsPerSec[resolution];
					}
					// Check for mode-based pricing (Kling)
					else if (creditsPerSec[mode]) {
						creditsPerSec = creditsPerSec[mode];
					}
					// Fallback to first available value
					else {
						creditsPerSec = Object.values(creditsPerSec)[0];
					}
				}
				
				return Math.ceil(creditsPerSec * videoDuration); // Round up to nearest integer
			}
		}
		return data.type === 'image' ? 2 : 60;
	};
	
	const IconComponent = useMemo(() => {
		return modelConfig?.icon || (data.type === 'image' ? Image : VideoCamera);
	}, [modelConfig, data.type]);
	
	// Current dropdown value

	// Calculate node dimensions based on aspect ratio
	const getNodeDimensions = () => {
		const aspectRatio = formData?.aspect_ratio || '3:4';
		
		// Base dimensions: 1:1 = 320x320 (square as reference)
		const squareSize = 320;
		
		switch(aspectRatio) {
			case '16:9':
				return { width: squareSize * (16/9), height: squareSize }; // ~568x320
			case '1:1':
				return { width: squareSize, height: squareSize }; // 320x320
			case '4:3':
				return { width: squareSize * (4/3), height: squareSize }; // ~427x320
			case '3:4':
				return { width: squareSize, height: squareSize * (4/3) }; // 320x427
			case '9:16':
				return { width: squareSize, height: squareSize * (16/9) }; // 320x568
			case '3:2':
				return { width: squareSize * (3/2), height: squareSize }; // 480x320
			case '2:3':
				return { width: squareSize, height: squareSize * (3/2) }; // 320x480
			case '21:9':
				return { width: squareSize * (21/9), height: squareSize }; // ~747x320
			case '9:21':
				return { width: squareSize, height: squareSize * (21/9) }; // 320x747
			default:
				return { width: squareSize, height: squareSize * (16/9) }; // Default to 9:16
		}
	};
	
	const { width: nodeWidth, height: nodeHeight } = getNodeDimensions();

	return (
		<div 
			className={`group bg-transparent p-4 transition-all duration-300 ease-in-out text-neutral-200 ${
				isConnectionDragOver 
					? 'ring-2 ring-lime-400/30 bg-lime-500/5' 
					: ''
			}`}
			style={{ 
				width: nodeWidth,
				height: nodeHeight,
				transition: 'width 0.3s ease, height 0.3s ease'
			}}
			onDragOver={handleConnectionDragOver}
			onDragLeave={handleConnectionDragLeave}
			onDrop={handleConnectionDrop}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
		>
			{/* Corner lines */}
			<div className="absolute top-0 left-0 w-12 h-12 pointer-events-none z-10">
				<div className={`w-full h-full border-t-2 border-l-2 rounded-tl-[40px] ${selected ? 'border-lime-400' : 'border-neutral-500'}`}></div>
			</div>
			<div className="absolute bottom-0 right-0 w-12 h-12 pointer-events-none z-10">
				<div className={`w-full h-full border-b-2 border-r-2 rounded-br-[40px] ${selected ? 'border-lime-400' : 'border-neutral-500'}`}></div>
			</div>

			{/* Media type label */}
			<div className="absolute -top-2 left-14 text-xs text-neutral-400 font-bold duration-200 z-10">
				{data.type === 'video' ? 'VIDEO GENERATION' : 'IMAGE GENERATION'}
			</div>

			{/* Inner frame */}
			<div className="bg-neutral-900 w-full h-full" style={{ borderRadius: '30px' }}>

			{/* Handles */}
			{/* Target Handle */}
			<Handle 
				type="target" 
				position={Position.Left} 
				style={{
					width: '36px',
					height: '72px',
					background: 'transparent',
					border: 'none',
					outline: 'none',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					color: 'white',
					left: '-18px',
					opacity: showHandles ? 1 : 0,
					transition: 'opacity 0.2s ease'
				}}
			>
				<div style={{
					width: '4px',
					height: '4px',
					borderRadius: '50%',
					backgroundColor: 'white'
				}}></div>
			</Handle>
			
			{/* Source Handle */}
			<Handle 
				type="source" 
				position={Position.Right} 
				style={{
					width: '36px',
					height: '72px',
					background: 'transparent',
					border: 'none',
					outline: 'none',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					color: 'white',
					right: '-18px',
					opacity: showHandles ? 1 : 0,
					transition: 'opacity 0.2s ease'
				}}
			>
				<div style={{
					width: '4px',
					height: '4px',
					borderRadius: '50%',
					backgroundColor: 'white'
				}}></div>
			</Handle>
				{/* Node content */}
				<div className="h-full flex flex-col gap-2"
					style={{
						// Dynamic padding based on aspect ratio to optimize space usage
						padding: nodeHeight > nodeWidth ? '8px' : '6px'
					}}
				>
				{/* Header - Credit only */}
				<div className="flex justify-center items-center flex-shrink-0">
					<div className="flex items-center px-3 py-1.5 bg-neutral-700 rounded-xl border border-neutral-600">
						<LogoNaked className="w-4 h-4 mr-2 text-neutral-300" />
						<span className="text-sm text-neutral-300 font-medium">
							{getCreditsForType()}
						</span>
					</div>
				</div>






				{/* Connected Images Display - clean */}
				{(connectedImages.length > 0 || uploadedImage) && (
					<div className="flex items-center gap-2 flex-shrink-0">
						{/* Show uploaded image first */}
						{uploadedImage && (
							<div className="relative">
								<img 
									src={uploadedImage.url} 
									alt={uploadedImage.fileName}
									className="w-12 h-12 object-cover rounded-xl"
								/>
								<button
									onClick={() => onUpdateNode(id, { uploadedImage: null })}
									className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] hover:bg-red-600 transition-colors"
								>
									×
								</button>
							</div>
						)}
						{/* Show connected images */}
						{connectedImages.slice(0, uploadedImage ? 2 : 3).map((img, index) => (
							<img 
								key={index}
								src={img.url} 
								alt={img.fileName}
								className="w-12 h-12 object-cover rounded-xl"
							/>
						))}
						{connectedImages.length > (uploadedImage ? 2 : 3) && (
							<div className="w-12 h-12 bg-neutral-700 rounded-xl flex items-center justify-center">
								<span className="text-sm text-neutral-300">+{connectedImages.length - (uploadedImage ? 2 : 3)}</span>
							</div>
						)}
					</div>
				)}

				{/* Compact Generation Controls */}
				{!isGenerating && (
					<div className="flex-shrink-0"
						style={{
							// Responsive layout based on aspect ratio
							display: nodeWidth > nodeHeight ? 'flex' : 'block'
						}}
					>
						{/* Controls container */}
						<div className={`${nodeWidth > nodeHeight ? 'flex gap-1.5 w-full' : 'space-y-1.5'}`}>
							{/* AI Model */}
							<div className="flex-1 min-w-0">
								<label className="text-[10px] text-neutral-500 block px-1 mb-1">Model</label>
								<ModelDropdown
									value={model}
									options={getAvailableModels()}
									onChange={setModel}
									hasImageInput={connectedImages.length > 0 || uploadedImage}
									onDropdownStateChange={onDropdownStateChange}
								/>
								{/* Warning for models that require images */}
								{(() => {
									const hasImage = connectedImages.length > 0 || uploadedImage;
									const imageCount = connectedImages.length + (uploadedImage ? 1 : 0);
									
									// Show upload button for models that support images (only if less than 1 image)
									if (supportsImageInput(model) && imageCount < 1) {
										return (
											<button
												onClick={() => fileInputRef.current?.click()}
												className="w-full mt-2 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-xs text-neutral-300 hover:bg-neutral-750 hover:text-white transition-all duration-200 flex items-center justify-center gap-2"
											>
												<Upload size={12} />
												Upload Image
											</button>
										);
									}
									
									return null;
								})()}
							</div>

							{/* Settings Row */}
							<div className={`${nodeWidth > nodeHeight ? 'flex gap-1.5 flex-1' : 'flex gap-1.5'}`}>
								{/* Aspect Ratio */}
								<div className="flex-1 min-w-0">
									<label className="text-[10px] text-neutral-500 block px-1 mb-1">Aspect</label>
									<select
										value={selectedAspectRatio}
										onChange={(e) => {
											setSelectedAspectRatio(e.target.value);
											// Don't update the node immediately - only on generate
										}}
										onFocus={() => onDropdownStateChange?.(true)}
										onBlur={() => onDropdownStateChange?.(false)}
										className="w-full bg-neutral-800/70 border border-neutral-700/50 rounded-xl px-2 py-2 text-xs text-neutral-200 focus:outline-none focus:border-neutral-500 focus:bg-neutral-800 transition-all"
									>
										<option value="1:1">1:1</option>
										<option value="4:3">4:3</option>
										<option value="3:4">3:4</option>
										<option value="16:9">16:9</option>
										<option value="9:16">9:16</option>
										{data.type === 'video' && (
											<>
												<option value="21:9">21:9</option>
												<option value="9:21">9:21</option>
											</>
										)}
									</select>
								</div>

								{/* Duration for videos */}
								{data.type === 'video' && (
									<div className="flex-1 min-w-0">
										<label className="text-[10px] text-neutral-500 block px-1 mb-1">Duration</label>
										<select
											value={duration}
											onChange={(e) => setDuration(parseInt(e.target.value))}
											onFocus={() => onDropdownStateChange?.(true)}
											onBlur={() => onDropdownStateChange?.(false)}
											className="w-full bg-neutral-800/70 border border-neutral-700/50 rounded-xl px-2 py-2 text-xs text-neutral-200 focus:outline-none focus:border-neutral-500 focus:bg-neutral-800 transition-all"
										>
											{(() => {
												const selectedModel = getModelById(model);
												if (!selectedModel?.options?.duration) return <option value={8}>8s</option>;
												
												const durationOptions = selectedModel.options.duration;
												// Always use the exact duration options from the model - no range generation
												return durationOptions.map(duration => (
													<option key={duration} value={duration}>{duration}s</option>
												));
											})()}
										</select>
									</div>
								)}
							</div>

							{/* Additional Video Settings */}
							{data.type === 'video' && (
								<div className={`${nodeWidth > nodeHeight ? 'flex gap-1.5 w-full' : 'space-y-1.5'}`}>
									{/* Resolution for models that support it */}
									{getModelById(model)?.options?.resolution && (
										<div className="flex-1 min-w-0">
											<label className="text-[10px] text-neutral-500 block px-1 mb-1">Resolution</label>
											<select
												value={formData?.resolution || getModelById(model).options.resolution[0]}
												onChange={(e) => {
													const currentFormData = formData || {};
													onUpdateNode(id, { 
														formData: { ...currentFormData, resolution: e.target.value }
													});
												}}
												onFocus={() => onDropdownStateChange?.(true)}
												onBlur={() => onDropdownStateChange?.(false)}
												className="w-full bg-neutral-800/70 border border-neutral-700/50 rounded-xl px-2 py-2 text-xs text-neutral-200 focus:outline-none focus:border-neutral-500 focus:bg-neutral-800 transition-all"
											>
												{getModelById(model).options.resolution.map((res) => (
													<option key={res} value={res}>{res}</option>
												))}
											</select>
										</div>
									)}

									{/* Mode for models that support it */}
									{getModelById(model)?.options?.mode && (
										<div className="flex-1 min-w-0">
											<label className="text-[10px] text-neutral-500 block px-1 mb-1">Mode</label>
											<select
												value={formData?.mode || getModelById(model).options.mode[0]}
												onChange={(e) => {
													const currentFormData = formData || {};
													onUpdateNode(id, { 
														formData: { ...currentFormData, mode: e.target.value }
													});
												}}
												onFocus={() => onDropdownStateChange?.(true)}
												onBlur={() => onDropdownStateChange?.(false)}
												className="w-full bg-neutral-800/70 border border-neutral-700/50 rounded-xl px-2 py-2 text-xs text-neutral-200 focus:outline-none focus:border-neutral-500 focus:bg-neutral-800 transition-all"
											>
												{getModelById(model).options.mode.map((mode) => (
													<option key={mode} value={mode}>{mode === 'standard' ? 'Standard' : mode === 'pro' ? 'Pro' : mode}</option>
												))}
											</select>
										</div>
									)}
								</div>
							)}
						</div>

					</div>
				)}


				{/* Spacer */}
				<div className="flex-1"></div>

				{/* Prompt Input */}
				<div 
					className={`relative bg-neutral-800/50 border-2 border-dashed transition-colors flex-shrink-0 ${
						isDragOver 
							? 'border-blue-500 bg-blue-500/10' 
							: 'border-transparent hover:border-neutral-600'
					}`}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					onDrop={handleDrop}
					style={{
						// Dynamic height based on aspect ratio
						minHeight: nodeHeight > nodeWidth ? '80px' : '70px',
						borderRadius: '30px'
					}}
				>
					{isGenerating ? (
						<div className="p-2">
							<div className="h-12 flex items-center justify-center bg-neutral-700/50 border border-neutral-600 rounded-lg">
								<div className="text-neutral-400 text-[10px]">Generating...</div>
							</div>
						</div>
					) : (
						<>
							<textarea
								value={prompt}
								onChange={(e) => setPrompt(e.target.value)}
								onFocus={() => {
									// Disable ReactFlow interactions
									onDropdownStateChange?.(true);
								}}
								onBlur={() => {
									// Re-enable ReactFlow interactions  
									onDropdownStateChange?.(false);
								}}
								placeholder={data.type === 'image' ? 
									(isDragOver ? 'Drop image here...' : 'Describe the image...') :
									`Describe the ${data.type}...`
								}
								rows={nodeHeight > nodeWidth ? 3 : 2}
								className="w-full bg-transparent border-none text-neutral-400 text-sm p-2.5 pr-12 focus:outline-none resize-none"
								style={{
									lineHeight: '1.4'
								}}
							/>
							<div className="absolute right-2 bottom-2 flex items-center gap-1">
								<button
									onClick={handleGenerate}
									disabled={!prompt.trim() || isGenerating}
									className="bg-white text-black rounded-full w-8 h-8 flex items-center justify-center hover:bg-neutral-200 transition-colors disabled:bg-neutral-600 disabled:text-neutral-400"
								>
									<ArrowUp size={14} weight="bold" />
								</button>
							</div>
						</>
					)}
					{/* Hidden file input */}
					<input
						ref={fileInputRef}
						type="file"
						accept="image/*"
						onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
						className="hidden"
					/>
				</div>
			</div>
		</div>

		</div>
	);
};

// Video Upload Component - Standardized design
const VideoUpload = React.memo(({ data, selected, id }) => {
	const { videoUrl, fileName } = data;
	const [isConnectionDragOver, setIsConnectionDragOver] = useState(false);
	const [actualVideoSize, setActualVideoSize] = useState(null);
	const [isHovered, setIsHovered] = useState(false);
	const [isPlaying, setIsPlaying] = useState(false);
	const videoRef = useRef(null);
	const { showHandles, handleMouseEnter, handleMouseLeave } = useHandleHover();

	// Calculate dimensions based on actual video size when available
	const getVideoDimensions = () => {
		// If we have actual video dimensions, use production node sizing logic
		if (actualVideoSize) {
			const { width: actualWidth, height: actualHeight } = actualVideoSize;
			
			// Base size same as production nodes
			const baseSize = 320;
			
			// Calculate aspect ratio from actual dimensions
			const aspectRatio = actualWidth / actualHeight;
			
			// Apply production node sizing logic
			if (aspectRatio > 1) {
				// Landscape: fix height, scale width
				return {
					width: Math.round(baseSize * aspectRatio),
					height: baseSize
				};
			} else {
				// Portrait: fix width, scale height
				return {
					width: baseSize,
					height: Math.round(baseSize / aspectRatio)
				};
			}
		}
		
		// Default to 9:16 aspect ratio (same as production nodes)
		const squareSize = 320;
		return { width: squareSize, height: squareSize * (16/9) };
	};

	const { width: videoWidth, height: videoHeight } = getVideoDimensions();

	// Load actual video dimensions when video URL is available
	useEffect(() => {
		if (videoUrl) {
			const video = document.createElement('video');
			video.onloadedmetadata = () => {
				setActualVideoSize({ width: video.videoWidth, height: video.videoHeight });
			};
			video.src = videoUrl;
		}
	}, [videoUrl]);

	// Handle video hover play/pause
	const handleVideoHover = useCallback(() => {
		if (videoRef.current) {
			setIsHovered(true);
			videoRef.current.play();
			setIsPlaying(true);
		}
	}, []);

	const handleVideoLeave = useCallback(() => {
		if (videoRef.current) {
			setIsHovered(false);
			videoRef.current.pause();
			setIsPlaying(false);
		}
	}, []);

	// Handle node connection drag and drop for frames
	const handleConnectionDragOver = (e) => {
		if (e.dataTransfer.types.includes('application/reactflow')) {
			e.preventDefault();
			e.stopPropagation();
			setIsConnectionDragOver(true);
		}
	};

	const handleConnectionDragLeave = (e) => {
		e.preventDefault();
		e.stopPropagation();
		setIsConnectionDragOver(false);
	};

	const handleConnectionDrop = (e) => {
		if (e.dataTransfer.types.includes('application/reactflow')) {
			e.preventDefault();
			e.stopPropagation();
			setIsConnectionDragOver(false);
		}
	};

	// If video is uploaded, show compact preview
	if (videoUrl) {
		return (
			<div 
				className={`group bg-transparent p-4 transition-all duration-300 ease-in-out text-neutral-200 ${
					selected ? 'ring-10 ring-lime-400/30' : ''
				} ${
					isConnectionDragOver ? 'ring-2 ring-lime-400/30 bg-lime-500/5' : ''
				}`}
				style={{ 
					width: videoWidth,
					height: videoHeight,
					transition: 'width 0.3s ease, height 0.3s ease'
				}}
				onDragOver={handleConnectionDragOver}
				onDragLeave={handleConnectionDragLeave}
				onDrop={handleConnectionDrop}
				onMouseEnter={handleMouseEnter}
				onMouseLeave={handleMouseLeave}
			>
				{/* Corner lines - 100px */}
				<div className="absolute top-0 left-0 w-12 h-12 pointer-events-none z-10">
					<div className={`w-full h-full border-t-2 border-l-2 rounded-tl-[60px] ${selected ? 'border-lime-400' : 'border-neutral-500'}`}></div>
				</div>
				
				{/* Media type label - right after L line */}
				<div className="absolute -top-1.5 left-14 text-xs text-neutral-400 font-bold duration-200 z-10">
					VIDEO UPLOAD
				</div>
				<div className="absolute bottom-0 right-0 w-12 h-12 pointer-events-none z-10">
					<div className={`w-full h-full border-b-2 border-r-2 rounded-br-[60px] ${selected ? 'border-lime-400' : 'border-neutral-500'}`}></div>
				</div>

				<div className="h-full relative">
					<div 
						className="relative w-full h-full cursor-pointer"
						onMouseEnter={handleVideoHover}
						onMouseLeave={handleVideoLeave}
					>
						<video
							ref={videoRef}
							src={videoUrl}
							alt={fileName || 'Uploaded video'}
							className="w-full h-full object-cover"
							style={{ borderRadius: '40px' }}
							loop
							muted
						/>
					</div>
				</div>

				{/* Handles */}
				<Handle 
					type="target" 
					position={Position.Left} 
					style={{
						width: '32px',
						height: '32px',
						background: 'black',
						border: '3px solid white',
						borderRadius: '50%',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						fontSize: '18px',
						fontWeight: 'bold',
						color: 'white',
						left: '-19px',
						opacity: 1,
						transition: 'opacity 0.2s ease'
					}}
				>
					<Asterisk size={16} weight="bold" />
				</Handle>
				<Handle 
					type="source" 
					position={Position.Right} 
					style={{
						width: '32px',
						height: '32px',
						background: 'black',
						border: '1px solid white',
						borderRadius: '50%',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						fontSize: '18px',
						fontWeight: 'bold',
						color: 'white',
						right: '-19px',
						opacity: 1,
						transition: 'opacity 0.2s ease'
					}}
				>
					<Asterisk size={16} weight="bold" />
				</Handle>
			</div>
		);
	}

		// Upload state with ImageUpload styling
		return (
			<div 
				className={`group bg-transparent p-4 transition-all duration-300 ease-in-out text-neutral-200 ${
					selected ? 'ring-10 ring-lime-400/30' : ''
				} ${
					isConnectionDragOver ? 'ring-2 ring-lime-400/30 bg-lime-500/5' : ''
				}`}
				style={{ 
					width: videoWidth,
					height: videoHeight,
					transition: 'width 0.3s ease, height 0.3s ease'
				}}
				onDragOver={handleConnectionDragOver}
				onDragLeave={handleConnectionDragLeave}
				onDrop={handleConnectionDrop}
				onMouseEnter={handleMouseEnter}
				onMouseLeave={handleMouseLeave}
			>
				{/* Corner lines - 100px */}
				<div className="absolute top-0 left-0 w-12 h-12 pointer-events-none z-10">
					<div className={`w-full h-full border-t-2 border-l-2 rounded-tl-[60px] ${selected ? 'border-lime-400' : 'border-neutral-500'}`}></div>
				</div>
				
				{/* Media type label - right after L line */}
				<div className="absolute -top-1.5 left-14 text-xs text-neutral-400 font-bold duration-200 z-10">
					VIDEO UPLOAD
				</div>
				<div className="absolute bottom-0 right-0 w-12 h-12 pointer-events-none z-10">
					<div className={`w-full h-full border-b-2 border-r-2 rounded-br-[60px] ${selected ? 'border-lime-400' : 'border-neutral-500'}`}></div>
				</div>

				<div 
					className="flex flex-col items-center justify-center h-full text-neutral-400 hover:bg-neutral-700/50 transition-colors cursor-pointer"
					style={{ borderRadius: '40px' }}
				>
					<Upload size={32} className="mb-2" />
					<span className="text-sm font-medium">Upload Video</span>
					<span className="text-xs mt-1">Click or drag here</span>
				</div>

			</div>
	);
});

// Simple Image Upload Component
const ImageUpload = React.memo(({ data, selected, id, onUpdateNode }) => {
	const [imageUrl, setImageUrl] = useState(data.imageUrl || null);
	const [isConnectionDragOver, setIsConnectionDragOver] = useState(false);
	const [actualImageSize, setActualImageSize] = useState(null);
	const fileInputRef = useRef(null);

	// Calculate dimensions based on actual image size when available
	const getImageDimensions = () => {
		// If we have actual image dimensions, use production node sizing logic
		if (actualImageSize) {
			const { width: actualWidth, height: actualHeight } = actualImageSize;
			
			// Base size same as production nodes
			const baseSize = 320;
			
			// Calculate aspect ratio from actual dimensions
			const aspectRatio = actualWidth / actualHeight;
			
			// Apply production node sizing logic
			if (aspectRatio > 1) {
				// Landscape: fix height, scale width
				return {
					width: Math.round(baseSize * aspectRatio),
					height: baseSize
				};
			} else {
				// Portrait: fix width, scale height
				return {
					width: baseSize,
					height: Math.round(baseSize / aspectRatio)
				};
			}
		}
		
		// Default to 9:16 aspect ratio (same as production nodes)
		const squareSize = 320;
		return { width: squareSize, height: squareSize * (16/9) };
	};

	const { width: imageWidth, height: imageHeight } = getImageDimensions();

	// Load actual image dimensions when image URL is available
	useEffect(() => {
		if (imageUrl) {
			const img = document.createElement('img');
			img.onload = () => {
				setActualImageSize({ width: img.naturalWidth, height: img.naturalHeight });
			};
			img.src = imageUrl;
		}
	}, [imageUrl]);

	const handleImageUpload = (file) => {
		if (file && file.type.startsWith('image/')) {
			const reader = new FileReader();
			reader.onload = (e) => {
				const result = e.target.result;
				setImageUrl(result);
				if (onUpdateNode) {
					onUpdateNode(id, { imageUrl: result, fileName: file.name });
				}
			};
			reader.readAsDataURL(file);
		}
	};

	// Handle node connection drag and drop for frames
	const handleConnectionDragOver = (e) => {
		if (e.dataTransfer.types.includes('application/reactflow')) {
			e.preventDefault();
			e.stopPropagation();
			setIsConnectionDragOver(true);
		}
	};

	const handleConnectionDragLeave = (e) => {
		e.preventDefault();
		e.stopPropagation();
		setIsConnectionDragOver(false);
	};

	const handleConnectionDrop = (e) => {
		if (e.dataTransfer.types.includes('application/reactflow')) {
			e.preventDefault();
			e.stopPropagation();
			setIsConnectionDragOver(false);
		}
	};


	// If image uploaded, show it
	if (imageUrl) {
		return (
			<div 
				className={`group bg-transparent p-4 transition-all duration-300 ease-in-out text-neutral-200 ${
					selected ? 'ring-10 ring-lime-400/30' : ''
				} ${
					isConnectionDragOver ? 'ring-100 ring-lime-400/30 bg-lime-500/5' : ''
				}`}
				style={{ 
					width: imageWidth,
					height: imageHeight,
					transition: 'width 0.3s ease, height 0.3s ease'
				}}
				onDragOver={handleConnectionDragOver}
				onDragLeave={handleConnectionDragLeave}
				onDrop={handleConnectionDrop}
			>
				{/* Corner lines - AIFrame style */}
				<div className="absolute top-0 left-0 w-12 h-12 pointer-events-none z-10">
					<div className={`w-full h-full border-t-2 border-l-2 rounded-tl-[40px] ${selected ? 'border-lime-400' : 'border-neutral-500'}`}></div>
				</div>
				
				{/* Media type label */}
				<div className="absolute -top-2 left-14 text-xs text-neutral-400 font-bold duration-200 z-10">
					IMAGE UPLOAD
				</div>
				<div className="absolute bottom-0 right-0 w-12 h-12 pointer-events-none z-10">
					<div className={`w-full h-full border-b-2 border-r-2 rounded-br-[40px] ${selected ? 'border-lime-400' : 'border-neutral-500'}`}></div>
				</div>

				{/* Handles */}
				{/* Target Handle */}
				<Handle 
					type="target" 
					position={Position.Left} 
					style={{
						width: '36px',
						height: '72px',
						background: 'black',
						border: 'none',
						outline: 'none',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						color: 'white',
						left: '-18px',
						opacity: 1, // Always visible for upload nodes
						transition: 'opacity 0.2s ease'
					}}
				>
					<div style={{
						width: '4px',
						height: '4px',
						borderRadius: '50%',
						backgroundColor: 'white'
					}}></div>
				</Handle>
				
				{/* Source Handle */}
				<Handle 
					type="source" 
					position={Position.Right} 
					style={{
						width: '36px',
						height: '72px',
						background: 'black',
						border: 'none',
						outline: 'none',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						color: 'white',
						right: '-18px',
						opacity: 1, // Always visible for upload nodes
						transition: 'opacity 0.2s ease'
					}}
				>
					<div style={{
						width: '4px',
						height: '4px',
						borderRadius: '50%',
						backgroundColor: 'white'
					}}></div>
				</Handle>

				{/* Inner frame */}
				<div className="bg-neutral-900 w-full h-full" style={{ borderRadius: '30px' }}>
					<div className="h-full relative">
						<img 
							src={imageUrl} 
							alt="Uploaded" 
							className="w-full h-full object-cover"
							style={{ borderRadius: '30px' }}
						/>
						<button
							onClick={() => fileInputRef.current?.click()}
							className="absolute top-4 right-4 w-10 h-10 bg-black/70 text-white rounded-full flex items-center justify-center hover:bg-black/90 opacity-0 group-hover:opacity-100 transition-all"
						>
							<ArrowsClockwise size={16} />
						</button>
						<input
							ref={fileInputRef}
							type="file"
							accept="image/*"
							onChange={(e) => handleImageUpload(e.target.files[0])}
							className="hidden"
						/>
					</div>
				</div>
			</div>
		);
	}

	// Upload state
	return (
		<div 
			className={`group bg-transparent p-4 transition-all duration-300 ease-in-out text-neutral-200 cursor-pointer ${
				selected ? 'ring-10 ring-lime-400/30' : ''
			} ${
				isConnectionDragOver ? 'ring-2 ring-lime-400/30 bg-lime-500/5' : ''
			}`}
			style={{ 
				width: imageWidth,
				height: imageHeight,
				transition: 'width 0.3s ease, height 0.3s ease'
			}}
			onDragOver={handleConnectionDragOver}
			onDragLeave={handleConnectionDragLeave}
			onDrop={handleConnectionDrop}
		>
			{/* Corner lines - AIFrame style */}
			<div className="absolute top-0 left-0 w-12 h-12 pointer-events-none z-10">
				<div className={`w-full h-full border-t-2 border-l-2 rounded-tl-[40px] ${selected ? 'border-lime-400' : 'border-neutral-500'}`}></div>
			</div>
			
			{/* Media type label */}
			<div className="absolute -top-2 left-14 text-xs text-neutral-400 font-bold duration-200 z-10">
				IMAGE UPLOAD
			</div>
			<div className="absolute bottom-0 right-0 w-12 h-12 pointer-events-none z-10">
				<div className={`w-full h-full border-b-2 border-r-2 rounded-br-[40px] ${selected ? 'border-lime-400' : 'border-neutral-500'}`}></div>
			</div>

			{/* Handles */}
			{/* Target Handle */}
			<Handle 
				type="target" 
				position={Position.Left} 
				style={{
					width: '36px',
					height: '72px',
					background: 'black',
					border: 'none',
					outline: 'none',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					color: 'white',
					left: '-18px',
					opacity: 1, // Always visible for upload nodes
					transition: 'opacity 0.2s ease'
				}}
			>
				<div style={{
					width: '4px',
					height: '4px',
					borderRadius: '50%',
					backgroundColor: 'white'
				}}></div>
			</Handle>
			
			{/* Source Handle */}
			<Handle 
				type="source" 
				position={Position.Right} 
				style={{
					width: '36px',
					height: '72px',
					background: 'black',
					border: 'none',
					outline: 'none',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					color: 'white',
					right: '-18px',
					opacity: 1, // Always visible for upload nodes
					transition: 'opacity 0.2s ease'
				}}
			>
				<div style={{
					width: '4px',
					height: '4px',
					borderRadius: '50%',
					backgroundColor: 'white'
				}}></div>
			</Handle>

			{/* Inner frame */}
			<div className="bg-neutral-900 w-full h-full" style={{ borderRadius: '30px' }}>
				<div 
					className="flex flex-col items-center justify-center h-full text-neutral-400 hover:bg-neutral-700/50 transition-colors"
					style={{ borderRadius: '30px' }}
					onClick={() => fileInputRef.current?.click()}
				>
					<Upload size={32} className="mb-2" />
					<span className="text-sm font-medium">Upload Image</span>
					<span className="text-xs mt-1">Click or drag here</span>
					<input
						ref={fileInputRef}
						type="file"
						accept="image/*"
						onChange={(e) => handleImageUpload(e.target.files[0])}
						className="hidden"
					/>
				</div>
			</div>
		</div>
	);
});



const GeneratedFrame = ({ data, id, selected }) => {
	const { imageUrl, videoUrl, prompt, type, isGenerating, error, formData } = data;
	const mediaUrl = videoUrl || imageUrl;
	const isVideo = !!videoUrl;
	const [isConnectionDragOver, setIsConnectionDragOver] = useState(false);
	const [actualMediaSize, setActualMediaSize] = useState(null);
	const [isHovered, setIsHovered] = useState(false);
	const [isPlaying, setIsPlaying] = useState(false);
	const videoRef = useRef(null);
	const { showHandles, handleMouseEnter, handleMouseLeave } = useHandleHover();

	// Calculate dimensions based on actual media size when available
	const getMediaDimensions = () => {
		// If we have actual media dimensions, use production node sizing logic
		if (actualMediaSize) {
			const { width: actualWidth, height: actualHeight } = actualMediaSize;
			
			// Base size same as production nodes
			const baseSize = 320;
			
			// Calculate aspect ratio from actual dimensions
			const aspectRatio = actualWidth / actualHeight;
			
			// Apply production node sizing logic
			if (aspectRatio > 1) {
				// Landscape: fix height, scale width
				return {
					width: Math.round(baseSize * aspectRatio),
					height: baseSize
				};
			} else {
				// Portrait: fix width, scale height
				return {
					width: baseSize,
					height: Math.round(baseSize / aspectRatio)
				};
			}
		}
		
		// Fallback to aspect ratio based calculation (same as production nodes)
		const aspectRatio = formData?.aspect_ratio || '3:4';
		
		// Base dimensions: 1:1 = 320x320 (same as production nodes)
		const squareSize = 320;
		
		switch(aspectRatio) {
			case '16:9':
				return { width: squareSize * (16/9), height: squareSize }; // ~568x320
			case '1:1':
				return { width: squareSize, height: squareSize }; // 320x320
			case '4:3':
				return { width: squareSize * (4/3), height: squareSize }; // ~427x320
			case '3:4':
				return { width: squareSize, height: squareSize * (4/3) }; // 320x427
			case '9:16':
				return { width: squareSize, height: squareSize * (16/9) }; // 320x568
			case '3:2':
				return { width: squareSize * (3/2), height: squareSize }; // 480x320
			case '2:3':
				return { width: squareSize, height: squareSize * (3/2) }; // 320x480
			case '21:9':
				return { width: squareSize * (21/9), height: squareSize }; // ~747x320
			case '9:21':
				return { width: squareSize, height: squareSize * (21/9) }; // 320x747
			default:
				return { width: squareSize, height: squareSize * (16/9) }; // Default to 9:16
		}
	};

	const { width: mediaWidth, height: mediaHeight } = getMediaDimensions();

	// Load actual media dimensions when media URL is available
	useEffect(() => {
		if (mediaUrl && !isVideo) {
			const img = document.createElement('img');
			img.onload = () => {
				setActualMediaSize({ width: img.naturalWidth, height: img.naturalHeight });
			};
			img.src = mediaUrl;
		} else if (mediaUrl && isVideo) {
			const video = document.createElement('video');
			video.onloadedmetadata = () => {
				setActualMediaSize({ width: video.videoWidth, height: video.videoHeight });
			};
			video.src = mediaUrl;
		}
	}, [mediaUrl, isVideo]);

	// Handle video hover play/pause
	const handleVideoHover = useCallback(() => {
		if (videoRef.current && isVideo) {
			setIsHovered(true);
			videoRef.current.play();
			setIsPlaying(true);
		}
	}, [isVideo]);

	const handleVideoLeave = useCallback(() => {
		if (videoRef.current && isVideo) {
			setIsHovered(false);
			videoRef.current.pause();
			setIsPlaying(false);
		}
	}, [isVideo]);

	// Handle node connection drag and drop for frames
	const handleConnectionDragOver = (e) => {
		if (e.dataTransfer.types.includes('application/reactflow')) {
			e.preventDefault();
			e.stopPropagation();
			setIsConnectionDragOver(true);
		}
	};

	const handleConnectionDragLeave = (e) => {
		e.preventDefault();
		e.stopPropagation();
		setIsConnectionDragOver(false);
	};

	const handleConnectionDrop = (e) => {
		if (e.dataTransfer.types.includes('application/reactflow')) {
			e.preventDefault();
			e.stopPropagation();
			setIsConnectionDragOver(false);
		}
	};

	return (
		<div 
			className={`bg-transparent group relative z-10 flex flex-col items-center generated-frame-node transition-all p-4 ${
				isConnectionDragOver 
					? 'ring-2 ring-lime-400/30 bg-lime-500/5' 
					: ''
			}`}
			style={{ 
				width: `${mediaWidth}px`,
				height: `${mediaHeight}px`,
				transition: 'width 0.3s ease, height 0.3s ease'
			}}
			onDragOver={handleConnectionDragOver}
			onDragLeave={handleConnectionDragLeave}
			onDrop={handleConnectionDrop}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
		>
			{/* Media type label - right after L line */}
			{mediaUrl && (
				<div className="absolute -top-1.5 left-14 text-xs text-neutral-400 font-bold duration-200 z-10">
					{isVideo ? 'VIDEO ASSET' : 'IMAGE ASSET'}
				</div>
			)}
			
			{/* Corner lines - 100px */}
			{mediaUrl && (
				<>
					<div className="absolute top-0 left-0 w-12 h-12 pointer-events-none z-10">
						<div className={`w-full h-full border-t-2 border-l-2 rounded-tl-[60px] ${selected ? 'border-lime-400' : 'border-neutral-500'}`}></div>
					</div>
					<div className="absolute bottom-0 right-0 w-12 h-12 pointer-events-none z-10">
						<div className={`w-full h-full border-b-2 border-r-2 rounded-br-[60px] ${selected ? 'border-lime-400' : 'border-neutral-500'}`}></div>
					</div>
				</>
			)}
			
			{/* Inner frame */}
			<div className="relative w-full h-full">
			{/* Connection handles - hidden until hover, higher z-index */}
			
			{/* Media frame with dynamic aspect ratio */}
			<div 
				className={`relative overflow-hidden generated-image-frame transition-all duration-300 ease-in-out w-full h-full ${selected ? 'selected' : ''} ${isGenerating ? 'generating' : ''}`}
			>
				{isGenerating ? (
					<div className="w-full h-full flex items-center justify-center bg-neutral-900 p-4">
						<LoadingAnimation className="!h-full !w-full !bg-neutral-800 !border-neutral-700" />
					</div>
				) : error ? (
					<div className="w-full h-full flex flex-col items-center justify-center bg-neutral-900 text-red-400">
						<div className="text-red-500 mb-2">
							<svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
								<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
							</svg>
						</div>
						<span className="text-sm font-medium text-center px-4">Generation Failed</span>
						<span className="text-xs text-neutral-500 text-center px-4 mt-1">{error}</span>
					</div>
				) : mediaUrl ? (
					isVideo ? (
						<div 
							className="h-full relative cursor-pointer"
							onMouseEnter={handleVideoHover}
							onMouseLeave={handleVideoLeave}
						>
							<video 
								ref={videoRef}
								src={mediaUrl} 
								alt={prompt || 'Generated video'}
								className="w-full h-full object-cover"
								style={{ borderRadius: '40px', transition: 'opacity 0.3s ease' }}
								muted
								loop
							/>
						</div>
					) : (
						<div className="h-full relative">
							<img 
								src={mediaUrl}
								alt={prompt || 'Generated image'}
								className="w-full h-full object-cover"
								style={{ borderRadius: '40px' }}
							/>
						</div>
					)
				) : (
					<div className="w-full h-full flex items-center justify-center bg-neutral-900 text-neutral-500">
						<Sparkle size={32} />
					</div>
				)}
			</div>

		</div>
	</div>
	);
};



// Generated Content Item with Hover Frame
const GeneratedContentItem = React.memo(({ content, index, activeTab, handleDragStart, formatDate }) => {
	const [showFrame, setShowFrame] = useState(false);
	const [framePrompt, setFramePrompt] = useState(content.prompt || '');
	const [frameType, setFrameType] = useState('image');
	const [frameRatio, setFrameRatio] = useState('9:16');
	const [frameModel, setFrameModel] = useState('google/imagen-3.0-generate-001');
	const [hoverTimeout, setHoverTimeout] = useState(null);

	const typeOptions = [
		{ value: 'image', label: 'Image', icon: Image },
		{ value: 'video', label: 'Video', icon: VideoCamera }
	];

	const ratioOptions = [
		{ value: '9:16', label: '9:16 (Portrait)' },
		{ value: '16:9', label: '16:9 (Landscape)' },
		{ value: '1:1', label: '1:1 (Square)' }
	];

	const modelOptions = [
		{ value: 'google/imagen-3.0-generate-001', label: 'Google Imagen 3' },
		{ value: 'google/imagen-3.0-fast-generate-001', label: 'Google Imagen 3 Fast' },
		{ value: 'black-forest-labs/flux-1.1-pro', label: 'Flux Pro' }
	];

	return (
		<div
			className="group relative aspect-[9/16] bg-neutral-800 rounded-xl overflow-hidden cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-lime-400/50 transition-all duration-200"
			style={{
				animationDelay: `${index * 50}ms`,
				animationFillMode: 'both'
			}}
			draggable
			onDragStart={(e) => handleDragStart(e, content)}
			onMouseEnter={() => {
				if (hoverTimeout) {
					clearTimeout(hoverTimeout);
					setHoverTimeout(null);
				}
				setShowFrame(true);
			}}
			onMouseLeave={() => {
				const timeout = setTimeout(() => {
					setShowFrame(false);
					setHoverTimeout(null);
				}, 300);
				setHoverTimeout(timeout);
			}}
			onClick={() => setShowFrame(!showFrame)}
		>
			{/* Content Display */}
			{activeTab === 'images' ? (
				<img
					draggable="false"
					src={content.url || content.imageUrl}
					alt={content.prompt || content.name || 'Generated Image'}
					className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
				/>
			) : (
				<div className="w-full h-full bg-gradient-to-br from-neutral-700 to-neutral-800 flex items-center justify-center relative overflow-hidden">
					{content.videoUrl ? (
						<video
							draggable="false"
							src={content.videoUrl}
							className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
							muted
							loop
							onMouseEnter={(e) => e.target.play()}
							onMouseLeave={(e) => {
								e.target.pause();
								e.target.currentTime = 0;
							}}
						/>
					) : (
						<div className="text-center p-2">
							<VideoCamera size={20} className="text-neutral-400 mx-auto mb-1" />
							<p className="text-[10px] text-neutral-300 font-medium truncate">
								{content.prompt || content.name || 'Video'}
							</p>
						</div>
					)}
				</div>
			)}
			
			{/* Hover Frame */}
			{showFrame && (
				<div 
					className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col p-3 z-10"
					onClick={(e) => e.stopPropagation()}
					onMouseEnter={() => {
						if (hoverTimeout) {
							clearTimeout(hoverTimeout);
							setHoverTimeout(null);
						}
					}}
					onMouseLeave={() => {
						const timeout = setTimeout(() => {
							setShowFrame(false);
							setHoverTimeout(null);
						}, 300);
						setHoverTimeout(timeout);
					}}
				>
					{/* Prompt Input */}
					<div className="mb-3">
						<input
							type="text"
							value={framePrompt}
							onChange={(e) => setFramePrompt(e.target.value)}
							onMouseDown={(e) => e.stopPropagation()}
							placeholder="Enter new prompt..."
							className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-white text-sm placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-lime-500/50 focus:border-lime-500"
						/>
					</div>

					{/* Options Row */}
					<div className="space-y-2">
						{/* Type & Ratio Row */}
						<div className="flex gap-2">
							<CustomDropdown
								options={typeOptions}
								value={frameType}
								onChange={setFrameType}
								placeholder="Type"
								className="flex-1"
								size="sm"
							/>
							<CustomDropdown
								options={ratioOptions}
								value={frameRatio}
								onChange={setFrameRatio}
								placeholder="Ratio"
								className="flex-1"
								size="sm"
							/>
						</div>

						{/* Model Row */}
						<CustomDropdown
							options={modelOptions}
							value={frameModel}
							onChange={setFrameModel}
							placeholder="AI Model"
							className="w-full"
							size="sm"
						/>

						{/* Generate Button */}
						<button
							className="w-full bg-lime-500 hover:bg-lime-600 text-black font-medium py-2 px-4 rounded-lg transition-colors text-sm mt-2"
							onClick={() => {
								console.log('Generate new content:', {
									prompt: framePrompt,
									type: frameType,
									ratio: frameRatio,
									model: frameModel
								});
								setShowFrame(false);
							}}
						>
							Generate
						</button>
					</div>
				</div>
			)}
			
			{/* Default Hover Overlay (when frame is not shown) */}
			{!showFrame && (
				<div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
					<div className=" bg-lime-500 text-black text-xs px-2 py-1 rounded-lg font-medium">
						Drag
					</div>
				</div>
			)}
			
			{/* Info Badge */}
			<div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
				<p className="text-[10px] font-medium text-white truncate mb-0.5">
					{activeTab === 'images' 
						? (content.prompt?.slice(0, 20) + (content.prompt?.length > 20 ? '...' : '')) 
						: (content.prompt?.slice(0, 20) + (content.prompt?.length > 20 ? '...' : '') || content.name || 'Untitled')
					}
				</p>
				<p className="text-[9px] text-neutral-300">
					{formatDate(content.createdAt)}
				</p>
			</div>

			{/* Type Badge */}
			<div className="absolute top-1.5 right-1.5">
				<span className="bg-black/60 backdrop-blur-sm text-white text-[9px] px-1.5 py-0.5 rounded-full font-medium">
					{activeTab === 'images' ? 'IMG' : 'VID'}
				</span>
			</div>
		</div>
	);
});


const CanvasWorkspace = ({ preloadedCanvasData }) => {
	const { user, setCanvasStatus, generatingItem, commandQueue, isDarkMode } = useOutletContext() || {};
	const [nodes, setNodes] = useState(initialNodes);
	const [edges, setEdges] = useState([]);
	const [menu, setMenu] = useState(null);
	const [deleteMenu, setDeleteMenu] = useState(null);
	const [reactFlowInstance, setReactFlowInstance] = useState(null);
	const [selectedMenuIndex, setSelectedMenuIndex] = useState(0);
	const [selectedNodeId, setSelectedNodeId] = useState(null);
	const [connectionNodeId, setConnectionNodeId] = useState(null);
	const [connectionHandleType, setConnectionHandleType] = useState(null);
	const [lastSaved, setLastSaved] = useState(null);
	const [isAutoSaving, setIsAutoSaving] = useState(false);
	const [dragCreateMenu, setDragCreateMenu] = useState(null); // { x, y, sourceNode, position }
	const [isDraggingNode, setIsDraggingNode] = useState(false);
	const [activeAssetPanel, setActiveAssetPanel] = useState(null);
	const [showTutorial, setShowTutorial] = useState(false);
	const [isAnyDropdownOpen, setIsAnyDropdownOpen] = useState(false);
	const [isInputFocused, setIsInputFocused] = useState(false);
	
	// Feedback menu states
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const [showFeedbackModal, setShowFeedbackModal] = useState(false);
	const [feedbackForm, setFeedbackForm] = useState({
		type: 'feedback',
		title: '',
		description: '',
		email: user?.email || ''
	});
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Touch handling for 2-finger pan
	const [touchStart, setTouchStart] = useState(null);
	const [lastTouchDistance, setLastTouchDistance] = useState(null);

	// Global input focus tracking
	useEffect(() => {
		const handleFocus = (e) => {
			if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
				setIsInputFocused(true);
			}
		};
		
		const handleBlur = (e) => {
			if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
				setIsInputFocused(false);
			}
		};

		document.addEventListener('focusin', handleFocus);
		document.addEventListener('focusout', handleBlur);
		
		return () => {
			document.removeEventListener('focusin', handleFocus);
			document.removeEventListener('focusout', handleBlur);
		};
	}, []);
	
	// Slideshow editing states  

	const [backgrounds, setBackgrounds] = useState([]);

	// Prevent body scroll when component mounts
	useEffect(() => {
		// Save original style
		const originalStyle = window.getComputedStyle(document.body).overflow;
		// Prevent scrolling
		document.body.style.overflow = 'hidden';
		document.documentElement.style.overflow = 'hidden';
		
		// Cleanup on unmount
		return () => {
			document.body.style.overflow = originalStyle;
			document.documentElement.style.overflow = originalStyle;
		};
	}, []);
	
	// Simplified asset state - these are no longer needed since AssetPanel manages its own state
	// const [backgrounds, setBackgrounds] = useState([]);
	// const [creators, setCreators] = useState([]);
	// const [products, setProducts] = useState([]);

	// Refs
	const reactFlowWrapper = useRef(null);
	const connectingNodeId = useRef(null);

	// Fetch backgrounds for slideshow editing
	useEffect(() => {
		const fetchBackgrounds = async () => {
			if (!user) return;
			
			try {
				const backgroundsQuery = query(
					collection(db, 'users', user.uid, 'backgrounds'),
					orderBy('createdAt', 'desc'),
					limit(20)
				);
				const backgroundsSnapshot = await getDocs(backgroundsQuery);
				const fetchedBackgrounds = backgroundsSnapshot.docs.map(doc => ({
					id: doc.id,
					...doc.data()
				}));
				setBackgrounds(fetchedBackgrounds);
			} catch (error) {
				console.error('Error fetching backgrounds:', error);
			}
		};

		fetchBackgrounds();
	}, [user]);

	// Update node data function
	const updateNodeData = useCallback((nodeId, newData) => {
		setNodes((nds) =>
			nds.map((node) => {
				if (node.id === nodeId) {
					// Deep merge data to avoid overwriting nested properties
					const mergedData = { ...node.data, ...newData };
					return { ...node, data: mergedData };
				}
				return node;
			})
		);
	}, []);

	const addNodeToCanvas = useCallback((newNode) => {
		setNodes((nds) => nds.concat(newNode));
	}, []);

	// Submit feedback to Firestore
	const submitFeedback = async () => {
		if (!feedbackForm.title.trim() || !feedbackForm.description.trim()) {
			alert('Please fill in all required fields');
			return;
		}

		setIsSubmitting(true);
		try {
			await addDoc(collection(db, 'feedbacks'), {
				userId: user?.uid || 'anonymous',
				userEmail: user?.email || feedbackForm.email,
				type: feedbackForm.type,
				title: feedbackForm.title,
				description: feedbackForm.description,
				timestamp: new Date(),
				status: 'open'
			});

			alert('Feedback submitted successfully!');
			setShowFeedbackModal(false);
			setFeedbackForm({
				type: 'feedback',
				title: '',
				description: '',
				email: user?.email || ''
			});
		} catch (error) {
			console.error('Error submitting feedback:', error);
			alert('Failed to submit feedback. Please try again.');
		} finally {
			setIsSubmitting(false);
		}
	};

	// Open tutorial function
	const openTutorial = () => {
		setShowTutorial(true);
	};

			// Edit mode state
	const [editModeNodes, setEditModeNodes] = useState(new Set());



	const menuOptions = [
		{ type: 'image', label: 'Image', icon: Image },
		{ type: 'video', label: 'Video', icon: VideoCamera },
		{ type: 'imageUpload', label: 'Image Upload', icon: Upload },
	];

	// Asset loading is now handled by AssetPanel component

	const transferContent = useCallback((sourceNode, targetNode) => {
		if (!sourceNode || !targetNode) return;
	
		// Use a local copy of nodes for accurate data
		const allNodes = reactFlowInstance.getNodes();
		const source = allNodes.find(n => n.id === sourceNode.id);
		const target = allNodes.find(n => n.id === targetNode.id);
	
		if (!source || !target) return;
	
		const sourceHasMedia = source.data.imageUrl || source.data.videoUrl;
		// Images can connect to video nodes for image-to-video generation
		const targetAcceptsMedia = ['video'].includes(target.type);
	
		if (sourceHasMedia && targetAcceptsMedia) {
			const newAsset = {
				id: `connected-${source.id}-${Date.now()}`,
				url: source.data.imageUrl || source.data.videoUrl,
				fileName: source.data.fileName || 'Connected Asset',
				type: source.data.imageUrl ? 'image' : 'video',
				sourceNodeId: source.id
			};
	
			const existingImages = target.data.connectedImages || [];
			
			// Only allow one image for video generation
			const updatedImages = [newAsset];
	
			updateNodeData(target.id, { connectedImages: updatedImages });
		}
	}, [updateNodeData, reactFlowInstance]);

	// Track which node is being dragged for our custom drop zones
	const [draggedNodeId, setDraggedNodeId] = useState(null);

	const onNodeDragStart = useCallback((event, node) => {
		setDraggedNodeId(node.id);
	}, []);

	const onNodeDrag = useCallback((event, node) => {
		// During drag, check if we're over another node
		if (!reactFlowInstance) return;
		
		const rect = reactFlowWrapper.current?.getBoundingClientRect();
		if (!rect) return;
		
		const mouseX = event.clientX - rect.left;
		const mouseY = event.clientY - rect.top;
		
		// Convert screen coordinates to flow coordinates
		const flowPosition = reactFlowInstance.screenToFlowPosition({
			x: mouseX,
			y: mouseY
		});
		
		// Find all nodes at this position (excluding the dragged node)
		const allNodes = reactFlowInstance.getNodes();
		const targetNode = allNodes.find(n => {
			if (n.id === node.id) return false; // Skip the dragged node
			
			const nodeRect = {
				left: n.position.x,
				right: n.position.x + (n.width || 340),
				top: n.position.y,
				bottom: n.position.y + (n.height || 200)
			};
			
			return flowPosition.x >= nodeRect.left && 
				   flowPosition.x <= nodeRect.right && 
				   flowPosition.y >= nodeRect.top && 
				   flowPosition.y <= nodeRect.bottom;
		});
		
		// Visual feedback - highlight the target node
		allNodes.forEach(n => {
			if (n.id === node.id) return; // Skip dragged node
			
			const element = document.querySelector(`[data-id="${n.id}"]`);
			if (element) {
				if (n.id === targetNode?.id) {
					element.style.borderColor = '#ffffff';
					element.style.boxShadow = '0 0 0 2px rgba(255, 255, 255, 0.3)';
				} else {
					element.style.borderColor = '';
					element.style.boxShadow = '';
				}
			}
		});
	}, [reactFlowInstance]);

		const onNodeDragStop = useCallback((event, node) => {
		if (!reactFlowInstance) return;
		
		// Clear all visual feedback
		const allNodes = reactFlowInstance.getNodes();
		allNodes.forEach(n => {
			const element = document.querySelector(`[data-id="${n.id}"]`);
			if (element) {
				element.style.borderColor = '';
				element.style.boxShadow = '';
			}
		});
		
		setDraggedNodeId(null);
	}, [reactFlowInstance]);

	// Load canvas from Firestore
	const loadCanvasFromFirestore = useCallback(async () => {
		try {
			const user = auth.currentUser;
			if (!user) {
				console.warn('User not authenticated, cannot load from Firestore');
				return null;
			}

			const canvasRef = doc(db, 'canvases', user.uid);
			const canvasSnap = await getDoc(canvasRef);
			
			if (canvasSnap.exists()) {
				const data = canvasSnap.data();
				return {
					nodes: data.nodes || [],
					edges: data.edges || [],
					timestamp: data.timestamp || data.updatedAt?.toMillis() || Date.now()
				};
			}
			
			return null;
		} catch (error) {
			console.error('Failed to load canvas from Firestore:', error);
			return null;
		}
	}, []);

	// Load saved canvas state on mount
	useEffect(() => {
		const loadCanvas = async () => {
			try {
				// Use preloaded data if available, otherwise load from Firestore
				const savedState = preloadedCanvasData || await loadCanvasFromFirestore();
				
				if (preloadedCanvasData) {
					console.log('✅ Using preloaded canvas data');
				}
				
				if (savedState) {
					const { nodes: savedNodes, edges: savedEdges, timestamp } = savedState;
					
					// Always load saved canvas data (no expiration)
					if (true) {
						// Migration logic for nodes from older versions
						const migratedNodes = savedNodes.map(node => {
							const migratedNode = { ...node };
							// 1. Ensure every node has a `position` object.
							if (!migratedNode.position || typeof migratedNode.position.x !== 'number') {
								migratedNode.position = { x: 0, y: 0 };
							}
							// 2. Ensure `aiFrame` nodes have `data.position` for positioning generated children.
							if (migratedNode.type === 'aiFrame') {
								if (!migratedNode.data) migratedNode.data = {};
								if (!migratedNode.data.position) {
									migratedNode.data.position = migratedNode.position;
								}
							}
							return migratedNode;
						});

						setNodes(migratedNodes);
						setEdges(savedEdges);
						const savedTime = new Date(timestamp);
						setLastSaved(savedTime);
						
						// Initialize canvas status
						if (setCanvasStatus) {
							setCanvasStatus({
								isAutoSaving: false,
								lastSaved: savedTime,
								nodeCount: migratedNodes.length,
								edgeCount: savedEdges.length
							});
						}
					}
				} else {
					// No saved state, initialize with empty status
					if (setCanvasStatus) {
						setCanvasStatus({
							isAutoSaving: false,
							lastSaved: null,
							nodeCount: 0,
							edgeCount: 0
						});
					}
				}
			} catch (error) {
				console.warn('Failed to load or migrate canvas state:', error);
				
				// Initialize with empty status on error
				if (setCanvasStatus) {
					setCanvasStatus({
						isAutoSaving: false,
						lastSaved: null,
						nodeCount: 0,
						edgeCount: 0
					});
				}
			}
		};

		loadCanvas();
	}, [setCanvasStatus, loadCanvasFromFirestore, preloadedCanvasData]);

	// Helper function to safely serialize nodes and edges
	const createSerializableState = (nodes, edges) => {
		// Only keep essential properties from nodes
		const serializableNodes = nodes.map(node => ({
			id: node.id,
			type: node.type,
			position: node.position,
			data: node.data,
			width: node.width,
			height: node.height,
			selected: node.selected,
			dragging: node.dragging,
			// Exclude any React Flow internal properties that might cause circular references
		}));

		// Only keep essential properties from edges
		const serializableEdges = edges.map(edge => ({
			id: edge.id,
			source: edge.source,
			target: edge.target,
			sourceHandle: edge.sourceHandle,
			targetHandle: edge.targetHandle,
			type: edge.type,
			style: edge.style,
			animated: edge.animated,
			label: edge.label,
			// Exclude any React Flow internal properties
		}));

		return {
			nodes: serializableNodes,
			edges: serializableEdges,
			timestamp: Date.now()
		};
	};

	// Save canvas to Firestore
	const saveCanvasToFirestore = useCallback(async (canvasNodes, canvasEdges) => {
		try {
			const user = auth.currentUser;
			if (!user) {
				console.warn('⚠️ User not authenticated, cannot save to Firestore');
				return false;
			}

			console.log('💾 Saving to Firestore for user:', user.uid, 'Nodes:', canvasNodes.length, 'Edges:', canvasEdges.length);
			
			// Create serializable state inline to avoid dependency issues
			const cleanNodes = canvasNodes.map(node => {
				const cleanedNode = { ...node };
				
				if (cleanedNode.data) {
					const cleanedData = { ...cleanedNode.data };
					
					// Remove undefined and non-serializable data
					Object.keys(cleanedData).forEach(key => {
						if (cleanedData[key] === undefined || 
							key === 'videoRef' || 
							key === 'audioRef') {
							delete cleanedData[key];
						}
					});
					
					cleanedNode.data = cleanedData;
				}
				
				return cleanedNode;
			});
			
			const stateToSave = {
				nodes: cleanNodes,
				edges: canvasEdges,
				timestamp: Date.now()
			};
			
			const canvasRef = doc(db, 'canvases', user.uid);
			
			await setDoc(canvasRef, {
				...stateToSave,
				userId: user.uid,
				updatedAt: new Date()
			}, { merge: true });

			console.log('✅ Canvas saved to Firestore successfully');
			return true;
		} catch (error) {
			console.error('❌ Failed to save canvas to Firestore:', error);
			return false;
		}
	}, []);

	// Auto-save canvas state
	useEffect(() => {
		// Don't save empty canvas or during initial load
		if (nodes.length === 0 && edges.length === 0) return;
		
		// Update Layout with saving status immediately
		if (setCanvasStatus) {
			setCanvasStatus(prev => ({
				...prev,
				isAutoSaving: true,
				nodeCount: nodes.length,
				edgeCount: edges.length
			}));
		}
		
		setIsAutoSaving(true);
		
		const saveTimeout = setTimeout(async () => {
			try {
				console.log('🔄 Starting save process...', nodes.length, 'nodes,', edges.length, 'edges');
				
				// Save to Firestore only
				const saveSuccess = await saveCanvasToFirestore(nodes, edges);
				
				if (saveSuccess) {
					const now = new Date();
					setLastSaved(now);
					console.log('✅ Save completed successfully at:', now.toLocaleTimeString());
				} else {
					console.error('❌ Save failed');
				}
				
				// Send completed status to Layout
				if (setCanvasStatus) {
					setCanvasStatus({
						isAutoSaving: false,
						lastSaved: new Date(),
						nodeCount: nodes.length,
						edgeCount: edges.length
					});
				}
				
				setIsAutoSaving(false);
			} catch (error) {
				console.warn('Failed to save canvas state:', error);
				
				// Clear saving status on error
				if (setCanvasStatus) {
					setCanvasStatus(prev => ({
						...prev,
						isAutoSaving: false,
						nodeCount: nodes.length,
						edgeCount: edges.length
					}));
				}
				
				setIsAutoSaving(false);
			}
		}, 500); // 500ms debounce for faster feedback

		return () => {
			clearTimeout(saveTimeout);
			// Clear saving status if component unmounts during save
			setIsAutoSaving(false);
			if (setCanvasStatus) {
				setCanvasStatus(prev => ({
					...prev,
					isAutoSaving: false
				}));
			}
		};
	}, [nodes, edges, setCanvasStatus, saveCanvasToFirestore]);

	// Clear canvas function
	const clearCanvas = useCallback(async () => {
		try {
			setNodes([]);
			setEdges([]);
			setLastSaved(null);
			
			// Also clear from Firestore
			const user = auth.currentUser;
			if (user) {
				const canvasRef = doc(db, 'canvases', user.uid);
				await setDoc(canvasRef, {
					nodes: [],
					edges: [],
					timestamp: Date.now(),
					userId: user.uid,
					updatedAt: new Date()
				});
			}
			
			if (setCanvasStatus) {
				setCanvasStatus({
					isAutoSaving: false,
					lastSaved: null,
					nodeCount: 0,
					edgeCount: 0
				});
			}
		} catch (error) {
			console.warn('Failed to clear canvas from Firestore:', error);
		}
	}, [setCanvasStatus]);

	// Listen for clear canvas event from Layout
	useEffect(() => {
		const handleClearCanvas = () => {
			clearCanvas();
		};

		window.addEventListener('clearCanvas', handleClearCanvas);
		return () => window.removeEventListener('clearCanvas', handleClearCanvas);
	}, [clearCanvas]);

	const handleGenerate = useCallback(async (sourceNodeId, generationData) => {
		console.log('🎯 Main handleGenerate called:', { sourceNodeId, generationData });
		
		const timestamp = Date.now();

		// Mark node as generating but keep original type
		updateNodeData(sourceNodeId, { 
			isGenerating: true,
			generatedContent: {
				prompt: generationData.prompt,
				type: generationData.type,
				generatedAt: timestamp
			}
		});

		try {
			let result = null;

			if (generationData.type === 'image') {
				console.log('🖼️ Calling generateImage...');
				console.log('🖼️ Generation data:', {
					prompt: generationData.prompt,
					subtype: generationData.subtype,
					selectedFrame: generationData.selectedFrame,
				});
				
				// Simple approach: just send prompt, subtype and selectedFrame
				// AI service will handle the rest based on rules
				console.log('🖼️ About to call generateImage with:', {
					prompt: generationData.prompt,
					subtype: generationData.subtype,
					selectedFrame: generationData.selectedFrame,
					style: 'photorealistic',
					quality: 'high',
					connectedImagesCount: generationData.connectedImages?.length || 0
				});
				
				// Handle Lungo Vibe model specially
				if (generationData.model === 'lungo-vibe') {
					result = await generateImage({
						originalPrompt: generationData.prompt,
						subtype: 'ugc_character',
						selectedFrame: generationData.selectedFrame || 'late_night_lofi',
						model: 'google/imagen-4', // Use Imagen 4 behind the scenes
						style: 'photorealistic',
						quality: 'high',
						connectedImages: generationData.connectedImages || []
					});
				} else {
					result = await generateImage({
						prompt: generationData.prompt,
						subtype: generationData.subtype,
						selectedFrame: generationData.selectedFrame,
						model: generationData.model,
						style: 'photorealistic',
						quality: 'high',
						connectedImages: generationData.connectedImages || []
					});
				}
				console.log('🖼️ Image generation result:', result);
			} else if (generationData.type === 'video') {
				console.log('🎬 Calling generateVideo...');
				
				// Get current node form data for additional parameters
				if (!reactFlowInstance) {
					throw new Error("React Flow instance not available.");
				}
				const sourceNode = reactFlowInstance.getNode(sourceNodeId);
				const formData = sourceNode?.data?.formData || {};
				
				// Get model configuration to determine which parameters to send
				const modelConfig = getModelById(generationData.model);
				const supportedParams = modelConfig?.params ? Object.keys(modelConfig.params) : [];
				const modelOptions = modelConfig?.options || {};
				
				// Build parameters object based on what the model supports
				const videoParams = {
					prompt: generationData.prompt,
					subtype: generationData.subtype,
					duration: generationData.duration,
					model: generationData.model,
					imageUrl: generationData.connectedImages?.[0]?.url || generationData.uploadedImage?.url || null,
				};

				// Add model-specific parameters only if supported
				if (supportedParams.includes('negative_prompt')) {
					videoParams.negative_prompt = formData.negative_prompt;
				}
				if (supportedParams.includes('aspect_ratio') || modelOptions.aspect_ratio) {
					videoParams.aspectRatio = formData.aspect_ratio || '3:4';
				}
				if (supportedParams.includes('resolution') || modelOptions.resolution) {
					videoParams.resolution = formData.resolution || (modelOptions.resolution?.[0] || '1080p');
				}
				if (supportedParams.includes('mode') || modelOptions.mode) {
					videoParams.mode = formData.mode || (modelOptions.mode?.[0] || 'standard');
				}
				if (supportedParams.includes('camera_fixed') || modelOptions.camera_fixed) {
					videoParams.camera_fixed = formData.camera_fixed || false;
				}
				if (supportedParams.includes('prompt_optimizer') || modelOptions.prompt_optimizer) {
					videoParams.prompt_optimizer = formData.prompt_optimizer !== false;
				}
				
				console.log('🎬 Video generation parameters:', videoParams);
				result = await generateVideo(videoParams);
				console.log('🎬 Video generation result:', result);
			}

			if (result && result.success) {
				// Transform to generated content node and update with results
				updateNodeData(sourceNodeId, {
					type: 'generatedFrame',
					imageUrl: result.imageUrl,
					videoUrl: result.videoUrl || result.data?.videoUrl,
					prompt: generationData.prompt,
					isGenerating: false,
					error: null
				});

				console.log('✅ Generation completed successfully');
			} else {
				throw new Error(result?.error || 'Generation failed');
			}
		} catch (error) {
			console.error('❌ Generation failed:', error);
			updateNodeData(sourceNodeId, { 
				isGenerating: false, 
				error: error.message 
			});
			alert(`Generation failed: ${error.message}`);
		}
	}, [updateNodeData]);

	const onSelectionChange = useCallback(({ nodes: selectedNodes, edges: selectedEdges }) => {
		setEdges(eds =>
			eds.map(edge => {
				const isSelected = selectedEdges.some(se => se.id === edge.id) ||
								 selectedNodes.some(sn => sn.id === edge.source || sn.id === edge.target);
				return {
					...edge,
					style: {
						...edge.style,
						stroke: isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.4)',
					}
				};
			})
		);
	}, [setEdges]);

	// Connection state object to pass to components (simplified to avoid infinite re-renders)
	const connectionState = useMemo(() => ({
		connectionNodeId,
		connectionHandleType,
		setConnectionNodeId,
		setConnectionHandleType,
		setEdges,
		updateNodeData
	}), [connectionNodeId, connectionHandleType]);

	const onNodesChange = useCallback(
		(changes) => {
			setNodes((nds) => applyNodeChanges(changes, nds));
		},
		[setNodes]
	);

	const onEdgesChange = useCallback(
		(changes) => {
			// Handle edge removal to clean up connected content
			changes.forEach(change => {
				if (change.type === 'remove') {
					const removedEdge = edges.find(edge => edge.id === change.id);
					if (removedEdge) {
						const sourceNode = nodes.find(n => n.id === removedEdge.source);
						const targetNode = nodes.find(n => n.id === removedEdge.target);
						
						if (sourceNode && targetNode) {
							// Clean up connected images in target node from this source
							if (targetNode.data.connectedImages) {
								const filteredImages = targetNode.data.connectedImages.filter(
									img => img.sourceNodeId !== sourceNode.id
								);
								updateNodeData(targetNode.id, { connectedImages: filteredImages });
							}
							
							// Clean up connected product in target node from this source
							if (targetNode.data.connectedProduct && targetNode.data.connectedProduct.id === sourceNode.id) {
								updateNodeData(targetNode.id, { connectedProduct: null });
							}
						}
					}
				}
			});
			
			setEdges((eds) => applyEdgeChanges(changes, eds));
		},
		[setEdges, edges, nodes, updateNodeData]
	);

	const onConnect = useCallback(
		(connection) => {
			const sourceNode = reactFlowInstance.getNode(connection.source);
			const targetNode = reactFlowInstance.getNode(connection.target);
			
			if (!sourceNode || !targetNode) return;

			// Connection validation rules
			const generationNodeTypes = ['image', 'video', 'aiFrame'];
			const isSourceGeneration = generationNodeTypes.includes(sourceNode.type);
			const isTargetGeneration = generationNodeTypes.includes(targetNode.type);
			
			// Rule 1: Üretim node'ları birbirine bağlanamaz
			if (isSourceGeneration && isTargetGeneration) {
				console.warn('Generation nodes cannot be connected to each other');
				return;
			}

			// Rule 2: Generated content can only connect to generation nodes that accept that type
			if (sourceNode.type === 'generatedFrame') {
				// Image content can only connect to video generation (for image-to-video)
				if (sourceNode.data.type === 'image' && targetNode.data.type !== 'video') {
					console.warn('Images can only be connected to video generation nodes');
					return;
				}
				// Videos generally can't be used as input for now
				if (sourceNode.data.type === 'video') {
					console.warn('Videos cannot be used as input for generation');
					return;
				}
			}

			// Rule 3: Only allow connections that make semantic sense
			if (sourceNode.type === 'imageUpload') {
				// Image uploads can only connect to video generation nodes
				if (targetNode.data.type !== 'video') {
					console.warn('Image uploads can only be connected to video generation nodes');
					return;
				}
			}

			// Video uploads can't be used as input for now
			if (sourceNode.type === 'videoUpload') {
				console.warn('Video uploads cannot be used as input for generation');
				return;
			}

			// Rule 4: Check if target model actually supports image input
			if ((sourceNode.type === 'imageUpload' || sourceNode.type === 'generatedFrame') && 
				targetNode.data.type === 'video') {
				const targetModel = targetNode.data.formData?.model || 'google/veo-3-fast';
				const modelConfig = getModelById(targetModel);
				
				// Check if model supports any image input parameters
				const imageParams = ['image_input', 'image', 'start_image', 'first_frame_image'];
				const supportsImage = modelConfig?.params ? imageParams.some(param => param in modelConfig.params) : false;
				
				if (!supportsImage) {
					console.warn(`Model ${targetModel} does not support image input`);
					return;
				}
			}
			
			// Check if target is a generation node (slideshow, image, video)
			const isGenerationConnection = generationNodeTypes.includes(targetNode?.type);
			
			// Check if source or target is a generated result node
			const isGeneratedConnection = sourceNode?.type === 'generatedFrame' || targetNode?.type === 'generatedFrame';
			
			let edgeStyle;
			if (isGenerationConnection) {
				// White solid edges for generation nodes
				edgeStyle = {
					stroke: '#ffffff',
					strokeWidth: 1,
					strokeDasharray: undefined,
					background: '#ffffff',
					borderRadius: '1000px 0 0 1000px'
				};
			} else if (isGeneratedConnection) {
				// Green dashed edges for generated content
				edgeStyle = {
					stroke: '#ffffffff',
					strokeWidth: 1,
					strokeDasharray: '5,5',
					background: '#ffffff',
					borderRadius: '1000px 0 0 1000px'
				};
			} else {
				// Default subtle edges
				edgeStyle = {
					stroke: 'rgba(255, 255, 255, 0.4)',
					strokeWidth: 1,
					strokeDasharray: undefined,
					background: '#ffffff',
					borderRadius: '1000px 0 0 1000px'
				};
			}
			
			const newEdge = {
				...connection,
				style: edgeStyle,
			};
			setEdges((eds) => addEdge(newEdge, eds));
			
			// Also transfer content on manual connection
			transferContent(sourceNode, targetNode);
		},
		[setEdges, reactFlowInstance, transferContent]
	);

	const handleGenerateForNode = async (nodeId) => {
		const node = reactFlowInstance.getNode(nodeId);
		if (!node) return;

		const { formData, type, connectedImages } = node.data;

		if (type === 'image') {
			// ... logic for image generation
		}
		// ... other generation logic
	};

	const handleImageUploadForNode = (nodeId, file) => {
		// ... logic for image upload
	};

	const onSettingChange = (nodeId, newFormData) => {
		updateNodeData(nodeId, { formData: newFormData });
	};

	// Remove incoming edges to a specific node (for when model doesn't support images)
	const removeIncomingEdges = useCallback((targetNodeId) => {
		console.log('🗑️ Removing incoming edges to node:', targetNodeId);
		setEdges((eds) => eds.filter(edge => edge.target !== targetNodeId));
	}, []);

	// Stable nodeTypes without connected images dependency
	const nodeTypes = useMemo(() => ({
		aiFrame: (props) => <AIFrame {...props} onUpdateNode={updateNodeData} onAddNode={addNodeToCanvas} onGenerate={handleGenerate} onDropdownStateChange={setIsAnyDropdownOpen} onRemoveIncomingEdges={removeIncomingEdges} />,
		image: (props) => <AIFrame {...props} onUpdateNode={updateNodeData} onAddNode={addNodeToCanvas} onGenerate={handleGenerate} onDropdownStateChange={setIsAnyDropdownOpen} onRemoveIncomingEdges={removeIncomingEdges} />,
		video: (props) => <AIFrame {...props} onUpdateNode={updateNodeData} onAddNode={addNodeToCanvas} onGenerate={handleGenerate} onDropdownStateChange={setIsAnyDropdownOpen} onRemoveIncomingEdges={removeIncomingEdges} />,
		imageUpload: (props) => <ImageUpload {...props} onUpdateNode={updateNodeData} />,
		videoUpload: (props) => <VideoUpload {...props} />,
		generatedFrame: (props) => <GeneratedFrame {...props} />,
	}), [updateNodeData, addNodeToCanvas, handleGenerate, removeIncomingEdges]);

	// Event handlers for right-click menus
	const onPaneClick = useCallback((event) => {
		setMenu(null);
		setDeleteMenu(null);
	}, []);

	const onPaneContextMenu = useCallback((event) => {
		event.preventDefault();
		const rect = reactFlowWrapper.current.getBoundingClientRect();
		const position = reactFlowInstance.screenToFlowPosition({
			x: event.clientX - rect.left,
			y: event.clientY - rect.top,
		});

		setMenu({
			x: event.clientX,
			y: event.clientY,
			position
		});
	}, [reactFlowInstance]);

	const onNodeContextMenu = useCallback((event, node) => {
		event.preventDefault();
		event.stopPropagation();
		
		setDeleteMenu({
			x: event.clientX,
			y: event.clientY,
			nodeId: node.id
		});
	}, []);

	const handleMenuSelect = useCallback((type) => {
		if (!menu) return;

		const newNode = {
			id: `${type}-${Date.now()}`,
			type: type,
			position: menu.position,
			data: {
				label: type.charAt(0).toUpperCase() + type.slice(1),
				type: type,
				formData: { prompt: '' }
			}
		};

		if (type === 'image') {
			newNode.data.type = 'image';
		} else if (type === 'video') {
			newNode.data.type = 'video';
		}

		setNodes((nds) => nds.concat(newNode));
		setMenu(null);
	}, [menu]);

	const handleDeleteNode = useCallback(() => {
		if (!deleteMenu) return;

		setNodes((nds) => nds.filter(node => node.id !== deleteMenu.nodeId));
		setEdges((eds) => eds.filter(edge => 
			edge.source !== deleteMenu.nodeId && edge.target !== deleteMenu.nodeId
		));
		setDeleteMenu(null);
	}, [deleteMenu]);

	// Add drag and drop handlers for content (both generated and new nodes)
	const handleContentDrop = useCallback((event) => {
		event.preventDefault();
		event.stopPropagation();
		
		try {
			const textData = event.dataTransfer.getData('text/plain');
			
			if (!textData) {
				return;
			}
			
			const contentData = JSON.parse(textData);
			
			if (!contentData || !reactFlowInstance) {
				return;
			}

			const rect = reactFlowWrapper.current?.getBoundingClientRect();
			if (!rect) {
				return;
			}

			const position = reactFlowInstance.screenToFlowPosition({
				x: event.clientX - rect.left,
				y: event.clientY - rect.top,
			});

			let newNode;
			const nodeId = `node-${Date.now()}`;

			// Handle generated content (existing content being reused)
			if (contentData.type === 'image') {
				newNode = {
					id: nodeId,
					type: 'generatedFrame',
					position,
					data: {
						imageUrl: contentData.imageUrl,
						prompt: contentData.prompt || contentData.originalPrompt || 'Generated Image',
						type: 'image',
						isGenerating: false,
						generatedAt: Date.now()
					}
				};
			} else if (contentData.type === 'video') {
				newNode = {
					id: nodeId,
					type: 'generatedFrame',
					position,
					data: {
						videoUrl: contentData.videoUrl,
						prompt: contentData.prompt || contentData.originalPrompt || 'Generated Video',
						type: 'video',
						isGenerating: false,
						generatedAt: Date.now()
					}
				};
			}
			
			if (newNode) {
				setNodes((nds) => nds.concat(newNode));
			}
		} catch (error) {
			// Ignore non-JSON drops
		}
	}, [reactFlowInstance]);

	const handleContentDragOver = useCallback((event) => {
		event.preventDefault();
		event.dataTransfer.dropEffect = 'copy';
	}, []);

	// Touch event handlers for 2-finger pan
	const handleTouchStart = useCallback((event) => {
		if (event.touches.length === 2 && !isAnyDropdownOpen && !isInputFocused) {
			const touch1 = event.touches[0];
			const touch2 = event.touches[1];
			
			setTouchStart({
				x1: touch1.clientX,
				y1: touch1.clientY,
				x2: touch2.clientX,
				y2: touch2.clientY,
				centerX: (touch1.clientX + touch2.clientX) / 2,
				centerY: (touch1.clientY + touch2.clientY) / 2
			});
			
			// Calculate initial distance for zoom detection
			const distance = Math.sqrt(
				Math.pow(touch2.clientX - touch1.clientX, 2) + 
				Math.pow(touch2.clientY - touch1.clientY, 2)
			);
			setLastTouchDistance(distance);
		}
	}, [isAnyDropdownOpen, isInputFocused]);

	const handleTouchMove = useCallback((event) => {
		if (event.touches.length === 2 && touchStart && reactFlowInstance && !isAnyDropdownOpen && !isInputFocused) {
			event.preventDefault();
			
			const touch1 = event.touches[0];
			const touch2 = event.touches[1];
			
			const currentCenterX = (touch1.clientX + touch2.clientX) / 2;
			const currentCenterY = (touch1.clientY + touch2.clientY) / 2;
			
			// Calculate current distance for zoom detection
			const currentDistance = Math.sqrt(
				Math.pow(touch2.clientX - touch1.clientX, 2) + 
				Math.pow(touch2.clientY - touch1.clientY, 2)
			);
			
			// Only pan if this is not a zoom gesture (distance hasn't changed much)
			const distanceChange = Math.abs(currentDistance - lastTouchDistance);
			const isZoomGesture = distanceChange > 10; // Threshold for zoom vs pan
			
			if (!isZoomGesture) {
				// Calculate pan delta
				const deltaX = currentCenterX - touchStart.centerX;
				const deltaY = currentCenterY - touchStart.centerY;
				
				// Apply horizontal pan only (2-finger left/right movement)
				const viewport = reactFlowInstance.getViewport();
				reactFlowInstance.setViewport({
					x: viewport.x + deltaX,
					y: viewport.y + deltaY,
					zoom: viewport.zoom
				});
				
				// Update touch start for next move
				setTouchStart({
					...touchStart,
					centerX: currentCenterX,
					centerY: currentCenterY
				});
			}
			
			setLastTouchDistance(currentDistance);
		}
	}, [touchStart, lastTouchDistance, reactFlowInstance, isAnyDropdownOpen, isInputFocused]);

	const handleTouchEnd = useCallback(() => {
		setTouchStart(null);
		setLastTouchDistance(null);
	}, []);



	return (
		<div className="w-full h-screen relative overflow-hidden" ref={reactFlowWrapper}>



			<ReactFlow
				nodes={nodes}
				edges={edges}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				onConnect={onConnect}
				onInit={setReactFlowInstance}
				onNodeDragStart={onNodeDragStart}
				onNodeDrag={onNodeDrag}
				onNodeDragStop={onNodeDragStop}
				onSelectionChange={onSelectionChange}
				nodeTypes={nodeTypes}
				onPaneClick={onPaneClick}
				onPaneContextMenu={onPaneContextMenu}
				onNodeContextMenu={onNodeContextMenu}
				onDrop={handleContentDrop}
				onDragOver={handleContentDragOver}
				onTouchStart={handleTouchStart}
				onTouchMove={handleTouchMove}
				onTouchEnd={handleTouchEnd}
				className="bg-neutral-950"
				style={{ width: '100%', height: '100vh' }}
				zoomOnScroll={!isAnyDropdownOpen && !isInputFocused}
				zoomOnPinch={!isAnyDropdownOpen && !isInputFocused}
				panOnScroll={!isAnyDropdownOpen && !isInputFocused}
				selectionOnDrag={!isAnyDropdownOpen && !isInputFocused}
				panOnDrag={false}
				nodesDraggable={!isInputFocused}
				nodesFocusable={true}
				selectNodesOnDrag={true}
				selectionKeyCode={null}
				minZoom={0.1}
				defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
				snapToGrid={true}
				snapGrid={[24, 24]}
				proOptions={{ hideAttribution: true }}
				defaultEdgeOptions={{
					type: 'simplebezier',
					animated: false,
					style: {
						stroke: '#00f5ff',
						strokeWidth: 1,
						strokeLinecap: 'round',
					},
					markerEnd: {
						type: MarkerType.ArrowClosed,
						color: '#00f5ff',
						width: 20,
						height: 20,
					},
				}}
				connectionLineStyle={{
					stroke: '#ffffffff',
					strokeWidth: 1,
					strokeLinecap: 'round',
				}}
				connectionLineType="simplebezier"
			>
				{/* SVG Definitions for Sci-Fi Gradients */}
				<defs>
					<linearGradient id="sci-fi-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
						<stop offset="0%" stopColor="#00f5ff" stopOpacity="1" />
						<stop offset="50%" stopColor="#0099ff" stopOpacity="1" />
						<stop offset="100%" stopColor="#00f5ff" stopOpacity="1" />
					</linearGradient>
					<filter id="sci-fi-glow">
						<feGaussianBlur stdDeviation="4" result="coloredBlur"/>
						<feMerge> 
							<feMergeNode in="coloredBlur"/>
							<feMergeNode in="SourceGraphic"/>
						</feMerge>
					</filter>
				</defs>
				<Background variant="dots" gap={24} size={1.5} color="#303030" />
			</ReactFlow>

				{/* Right-click/Double-click menu for creating nodes */}
				{menu && (
					<div
						className="fixed z-50 bg-neutral-800 border border-neutral-700 rounded-xl shadow-2xl py-2 min-w-48"
						style={{ left: menu.x, top: menu.y }}
					>
						<div className="px-3 py-2 text-xs font-medium text-neutral-400 border-b border-neutral-700">
							Add Block
						</div>
						{menuOptions.map((option) => {
							const IconComponent = option.icon;
							return (
								<button
									key={option.type}
									onClick={() => handleMenuSelect(option.type)}
									className="w-full px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-700 flex items-center gap-3 transition-colors"
								>
									<IconComponent size={16} className="text-neutral-400" />
									{option.label}
								</button>
							);
						})}
					</div>
				)}

				{/* Right-click menu for deleting nodes */}
				{deleteMenu && (
					<div
						className="fixed z-50 bg-neutral-800 border border-neutral-700 rounded-xl shadow-2xl py-2 min-w-32"
						style={{ left: deleteMenu.x, top: deleteMenu.y }}
					>
						<button
							onClick={handleDeleteNode}
							className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-neutral-700 flex items-center gap-3 transition-colors"
						>
							🗑️ Delete
						</button>
					</div>
				)}



				{/* Canvas Tutorial */}
				<CanvasTutorial 
					user={user}
					isOpen={showTutorial}
					onClose={() => setShowTutorial(false)}
					onOpenTutorial={() => setShowTutorial(true)}
				/>

				{/* Hover Menu */}
				<div 
					className="fixed bottom-4 right-4 z-40"
					onMouseEnter={() => setIsMenuOpen(true)}
					onMouseLeave={() => setIsMenuOpen(false)}
				>
					<div className={`bg-neutral-900/95 backdrop-blur-sm border border-neutral-700 rounded-xl shadow-xl px-2 transition-all duration-700 ease-in-out transform ${
						isMenuOpen ? ' w-12 flex flex-col-reverse gap-1 py-2 scale-100 opacity-100' : 'h-12 w-12 flex items-center justify-center py-2 opacity-90'
					} overflow-hidden`}>
						<button
							onClick={() => {
								openTutorial();
								setIsMenuOpen(false);
							}}
							className="flex items-center justify-center w-8 h-8 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded-md transition-all duration-200"
							title="Open canvas tutorial"
						>
							<Info size={16} />
						</button>
						
						{isMenuOpen && (
							<>
								<button
									onClick={() => {
										window.location.href = 'mailto:deniz@lungoai.com?subject=LungoAI Canvas Support';
										setIsMenuOpen(false);
									}}
									className="flex items-center justify-center w-8 h-8 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded-md transition-colors duration-200"
									title="Contact support via email"
								>
									<Question size={16} />
								</button>
								
								<button
									onClick={() => {
										setIsMenuOpen(false);
										setShowFeedbackModal(true);
									}}
									className="flex items-center justify-center w-8 h-8 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded-md transition-colors duration-200"
									title="Submit feedback or bug report"
								>
									<Bug size={16} />
								</button>
							</>
						)}
					</div>
				</div>

				{/* Feedback Modal */}
				{showFeedbackModal && createPortal(
					<div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
						<div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-2xl w-full max-w-lg animate-in fade-in-0 zoom-in-95 duration-200">
							{/* Header */}
							<div className="flex items-center justify-between p-6 border-b border-neutral-200 dark:border-neutral-700">
								<div>
									<h3 className="text-xl font-bold text-neutral-900 dark:text-white">Feedback</h3>
									<p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">Help us improve LungoAI Canvas</p>
								</div>
								<button
									onClick={() => setShowFeedbackModal(false)}
									className="w-10 h-10 rounded-full bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 flex items-center justify-center text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors"
								>
									<X size={18} />
								</button>
							</div>

							{/* Form */}
							<div className="p-6 space-y-5">
								{/* Type Selection */}
								<div>
									<label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3">What type of feedback?</label>
									<div className="grid grid-cols-3 gap-2">
										{['feedback', 'bug', 'feature'].map((type) => (
											<button
												key={type}
												onClick={() => setFeedbackForm({ ...feedbackForm, type })}
												className={`p-3 rounded-lg border text-sm font-medium transition-all ${
													feedbackForm.type === type
														? 'bg-lime-50 border-lime-300 text-lime-700 dark:bg-lime-900/20 dark:border-lime-600 dark:text-lime-300'
														: 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-300 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-600'
												}`}
											>
												{type === 'feedback' ? '💬 General' : type === 'bug' ? '🐛 Bug Report' : '✨ Feature'}
											</button>
										))}
									</div>
								</div>

								{/* Title */}
								<div>
									<label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">Title *</label>
									<input
										type="text"
										value={feedbackForm.title}
										onChange={(e) => setFeedbackForm({ ...feedbackForm, title: e.target.value })}
										placeholder="Brief summary of your feedback"
										className="w-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600 rounded-lg px-4 py-3 text-neutral-900 dark:text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-lime-500/50 focus:border-lime-500/50 transition-colors"
									/>
								</div>

								{/* Description */}
								<div>
									<label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">Description *</label>
									<textarea
										value={feedbackForm.description}
										onChange={(e) => setFeedbackForm({ ...feedbackForm, description: e.target.value })}
										placeholder="Tell us more about your experience, issue, or suggestion..."
										rows={4}
										className="w-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600 rounded-lg px-4 py-3 text-neutral-900 dark:text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-lime-500/50 focus:border-lime-500/50 resize-none transition-colors"
									/>
								</div>

								{/* Email (if not logged in) */}
								{!user?.email && (
									<div>
										<label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">Email (Optional)</label>
										<input
											type="email"
											value={feedbackForm.email}
											onChange={(e) => setFeedbackForm({ ...feedbackForm, email: e.target.value })}
											placeholder="your@email.com"
											className="w-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600 rounded-lg px-4 py-3 text-neutral-900 dark:text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-lime-500/50 focus:border-lime-500/50 transition-colors"
										/>
									</div>
								)}
							</div>

							{/* Footer */}
							<div className="flex items-center justify-between p-6 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 rounded-b-xl">
								<p className="text-xs text-neutral-500 dark:text-neutral-400">We read every piece of feedback</p>
								<div className="flex items-center gap-3">
									<button
										onClick={() => setShowFeedbackModal(false)}
										className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors"
									>
										Cancel
									</button>
									<button
										onClick={submitFeedback}
										disabled={isSubmitting || !feedbackForm.title.trim() || !feedbackForm.description.trim()}
										className="px-6 py-2.5 bg-lime-500 hover:bg-lime-600 disabled:bg-neutral-300 disabled:text-neutral-500 dark:disabled:bg-neutral-700 dark:disabled:text-neutral-500 text-white font-semibold rounded-lg transition-all transform hover:scale-105 disabled:transform-none disabled:hover:scale-100 text-sm shadow-lg hover:shadow-xl disabled:shadow-none"
									>
										{isSubmitting ? 'Sending...' : 'Send Feedback'}
									</button>
								</div>
							</div>
						</div>
					</div>,
					document.body
				)}
		</div>
	);
};

export default CanvasWorkspace;
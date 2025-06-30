import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
import {
	Image, 
	VideoCamera, 
	Slideshow,
	Plus,
	Upload,
	Sparkle,
	CaretDown,
	Square,
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
} from '@phosphor-icons/react';
import { generateImage, generateVideo, generateSlideshow, checkApiKey, GENERATION_TYPES, IMAGE_STYLES, QUALITY_OPTIONS } from '../services/ai';
import { useOutletContext } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, onSnapshot, orderBy, doc, getDoc, setDoc, getDocs } from 'firebase/firestore';
import DynamicIsland from '../components/DynamicIsland';
import CanvasTutorial from '../components/CanvasTutorial';

const LogoNaked = ({ className }) => (
	<svg viewBox="0 0 566 399" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
		<rect x="35" y="35" width="496" height="329" rx="93" stroke="currentColor" strokeWidth="70"/>
	</svg>
);

// All available frame options including background
const allFrameOptions = [
	// Background option
	{
		id: 'background',
		name: 'Background Scene',
		description: 'Atmospheric environmental backgrounds',
		exampleImage: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=400&h=300&fit=crop',
		rules: 'background_image_rules',
		type: 'background'
	},
	// UGC Character frames
	{
		id: 'car_selfie_glow',
		name: 'Car Selfie Glow',
		description: 'Smartphone selfie in car with natural daylight',
		exampleImage: 'https://images.unsplash.com/photo-1494790108755-2616c96bb4de?w=400&h=300&fit=crop&crop=face',
		rules: 'car_selfie_glow',
		type: 'ugc_character'
	},
	{
		id: 'late_night_lofi',
		name: 'Late Night Lo-Fi',
		description: 'Flash snapshot in casual indoor settings',
		exampleImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=300&fit=crop&crop=face',
		rules: 'late_night_lofi',
		type: 'ugc_character'
	},
	{
		id: 'forced_perspective',
		name: 'Forced Perspective',
		description: 'Wide-angle street photography with playful scale',
		exampleImage: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=300&fit=crop&crop=face',
		rules: 'forced_perspective',
		type: 'ugc_character'
	},
	{
		id: 'wide_angle_pov',
		name: 'Wide-Angle POV Walk',
		description: 'Environmental street shots with movement',
		exampleImage: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=300&fit=crop&crop=face',
		rules: 'wide_angle_pov',
		type: 'ugc_character'
	},
	{
		id: 'city_street_style',
		name: 'City Street Style',
		description: 'Urban fashion photography',
		exampleImage: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400&h=300&fit=crop&crop=face',
		rules: 'city_street_style',
		type: 'ugc_character'
	},
	{
		id: 'solo_snap_vibe',
		name: 'Solo Snap Vibe',
		description: 'Casual individual portraits',
		exampleImage: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&h=300&fit=crop&crop=face',
		rules: 'solo_snap_vibe',
		type: 'ugc_character'
	},
	{
		id: 'warm_moments',
		name: 'Warm Moments',
		description: 'Intimate couple photography',
		exampleImage: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=400&h=300&fit=crop&crop=face',
		rules: 'warm_moments',
		type: 'ugc_character'
	},
	{
		id: 'urban_motion_girl',
		name: 'Urban Motion Girl',
		description: 'Dynamic city street portraits',
		exampleImage: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=300&fit=crop&crop=face',
		rules: 'urban_motion_girl',
		type: 'ugc_character'
	},
	{
		id: 'vintage_buddy_vibes',
		name: '90s Vintage Buddy',
		description: 'Analog film aesthetic with friends',
		exampleImage: 'https://images.unsplash.com/photo-1503023345310-bd7c1de61c7d?w=400&h=300&fit=crop&crop=face',
		rules: 'vintage_buddy_vibes',
		type: 'ugc_character'
	}
];

const generationConfig = {
	image: {
		label: 'AI Image',
		icon: Image,
		subtypes: {
			// Background first (moved to top)
			background: {
				label: 'Background Scene',
				icon: Rectangle,
				subtitle: 'Generate atmospheric background environments',
				commandCode: 201
			},
			// UGC Character with frame selection
			ugc_character: {
				label: 'UGC Character',
				icon: Smiley,
				subtitle: 'Generate realistic person images with style frames',
				commandCode: 202
			},
			// General image
			general: {
				label: 'General Image',
				icon: Image,
				subtitle: 'Generate any type of image',
				commandCode: 203
			}
		}
	},
	video: {
		label: 'AI Video',
		icon: VideoCamera,
		subtypes: {
			image_to_video: {
				label: 'Image to Video',
				icon: Play,
				subtitle: 'Animate an image',
				models: {
					'stable_video_diffusion': { label: 'Stable Video Diffusion', icon: Sparkle, subtitle: 'Standard animation', credits: 150 },
					'i2vgen_xl': { label: 'I2VGen XL', icon: Users, subtitle: 'High quality motion', credits: 200 },
				}
			},
			text_to_video: {
				label: 'Text to Video',
				icon: PencilSimple,
				subtitle: 'From a prompt',
				models: {
					'zeroscope_v2_xl': { label: 'Zeroscope XL', icon: Play, subtitle: 'Community favorite', credits: 200 },
				}
			}
		},
		options: {
			duration: [
				{ value: 3, label: '3s', icon: Play, subtitle: 'Short', credits: 0 },
				{ value: 5, label: '5s', icon: Play, subtitle: 'Medium', credits: 50 },
				{ value: 7, label: '7s', icon: Play, subtitle: 'Long', credits: 100 },
			]
		}
	},
	slideshow: {
		label: 'AI Slideshow',
		icon: Slideshow,
		models: {
			 top_3_lists: { label: 'Top 3 Lists', icon: Slideshow, subtitle: 'Ranked content', credits: 50 },
			 before_after: { label: 'Before & After', icon: Slideshow, subtitle: 'Comparison', credits: 60 },
			 step_by_step: { label: 'Step by Step', icon: Slideshow, subtitle: 'Tutorial', credits: 80 }
		}
	}
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
						e.stopPropagation(); // Prevent scroll events from reaching the canvas
						e.preventDefault(); // Prevent default behavior
					}}
					onScroll={(e) => e.stopPropagation()} // Also handle scroll events
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
								className="w-full bg-neutral-700/50 border border-neutral-600/50 rounded-xl px-10 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-500 focus:bg-neutral-700"
							/>
						</div>
					</div>

					{/* Options List (scrolling part) */}
					<div 
						className="flex-grow overflow-y-auto enhanced-dropdown-scroll"
						onWheel={(e) => {
							// Allow scrolling within this container
							const element = e.currentTarget;
							const isScrollable = element.scrollHeight > element.clientHeight;
							
							if (isScrollable) {
								e.stopPropagation(); // Prevent event from reaching ReactFlow
							}
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
											className={`w-full p-3 text-sm text-left rounded-xl transition-all duration-200 group ${
												value === option.value 
													? 'bg-neutral-700 ring-2 ring-white/50' 
													: 'hover:bg-neutral-700/50'
											}`}
										>
											<div className="flex items-center gap-3">
												<div className="w-10 h-10 rounded-lg bg-neutral-600 flex items-center justify-center">
													<option.icon size={20} className="text-neutral-300" />
												</div>
												<div className="flex-1">
													<div className="font-semibold text-white text-sm">{option.label}</div>
												</div>
												{value === option.value && (
													<div className="w-4 h-4 bg-white rounded-full flex items-center justify-center">
														<div className="w-2 h-2 bg-neutral-800 rounded-full"></div>
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
											className={`w-full p-3 text-sm text-left rounded-xl transition-all duration-200 group ${
												value === option.value 
													? 'bg-neutral-700 ring-2 ring-white/50' 
													: 'hover:bg-neutral-700/50'
											}`}
										>
											<div className="flex items-center gap-3">
												<div className="w-10 h-10 rounded-lg overflow-hidden">
													<img 
														src={option.backgroundImage} 
														alt={option.label}
														className="w-full h-full object-cover"
													/>
												</div>
												<div className="flex-1">
													<div className="font-semibold text-white text-sm">{option.label}</div>
												</div>
												{value === option.value && (
													<div className="w-4 h-4 bg-white rounded-full flex items-center justify-center">
														<div className="w-2 h-2 bg-neutral-800 rounded-full"></div>
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
											className={`w-full p-3 text-sm text-left rounded-xl transition-all duration-200 group ${
												value === option.value 
													? 'bg-neutral-700 ring-2 ring-white/50' 
													: 'hover:bg-neutral-700/50'
											}`}
										>
											<div className="flex items-center gap-3">
												<div className="w-10 h-10 rounded-lg overflow-hidden">
													<img 
														src={option.backgroundImage} 
														alt={option.label}
														className="w-full h-full object-cover"
													/>
												</div>
												<div className="flex-1">
													<div className="font-semibold text-white text-sm">{option.label}</div>
												</div>
												{value === option.value && (
													<div className="w-4 h-4 bg-white rounded-full flex items-center justify-center">
														<div className="w-2 h-2 bg-neutral-800 rounded-full"></div>
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
	onDropdownStateChange
}) => {
	const { formData = {}, generatedContent, isGenerating, error, connectedImages = [], uploadedImage } = data;
	const config = generationConfig[data.type];
	const fileInputRef = useRef(null);
	const [openDropdown, setOpenDropdown] = useState(null);

	// Local state for form fields
	const [prompt, setPrompt] = useState(formData.prompt || '');
	const [subtype, setSubtype] = useState(formData.subtype || 'general');
	const [selectedFrame, setSelectedFrame] = useState(formData.selectedFrame || null);
	const [duration, setDuration] = useState(formData.duration || 3);
	const [model, setModel] = useState(formData.model || '');
	const [isDragOver, setIsDragOver] = useState(false);

	// This effect syncs the component's internal state with props from the parent canvas.
	// It's crucial for when data is loaded or updated externally, preventing "stale state".
	useEffect(() => {
		if (formData) {
			setSubtype(formData.subtype || (data.type === 'image' ? 'general' : 'text_to_video'));
			setSelectedFrame(formData.selectedFrame || null);
			setDuration(formData.duration || 3);
			setModel(formData.model || '');
			// We intentionally don't sync `prompt` here to avoid cursor jumps and conflicts while typing.
		}
	}, [formData.subtype, formData.selectedFrame, formData.duration, formData.model, data.type]);

	const handleDropdownToggle = (dropdownId) => {
		setOpenDropdown(prev => (prev === dropdownId ? null : dropdownId));
	};

	// Create combined options for the Image dropdown
	const imageGenerationOptions = useMemo(() => {
		const characterFrames = allFrameOptions.filter(f => f.type === 'ugc_character');
		const backgroundFrames = allFrameOptions.filter(f => f.type === 'background');

		const options = [
			{ isHeader: true, label: 'General' },
			{ value: 'general', label: 'General Image', icon: Image, subtitle: 'Generate any type of image', isFrame: false },
			{ isHeader: true, label: 'UGC Character Frames' },
			...characterFrames.map(frame => ({
				value: frame.id,
				label: frame.name,
				subtitle: frame.description,
				backgroundImage: frame.exampleImage,
				isFrame: true,
				subtypeForFrame: 'ugc_character'
			})),
			{ isHeader: true, label: 'Background Scenes' },
			...backgroundFrames.map(frame => ({
				value: frame.id,
				label: frame.name,
				subtitle: frame.description,
				backgroundImage: frame.exampleImage,
				isFrame: true,
				subtypeForFrame: 'background'
			})),
		];
		
		console.log('imageGenerationOptions created:', options);
		return options;
	}, []);

	const handleImageOptionChange = (selectedValue) => {
		console.log('handleImageOptionChange called with:', selectedValue);
		const selectedOption = imageGenerationOptions.find(opt => opt.value === selectedValue);
		console.log('Found option:', selectedOption);
		if (!selectedOption) {
			console.log('No option found for value:', selectedValue);
			return;
		}

		if (selectedOption.isFrame) {
			console.log('Setting frame:', selectedOption.subtypeForFrame, selectedOption.value);
			setSubtype(selectedOption.subtypeForFrame);
			setSelectedFrame(selectedOption.value);
			// Update node data immediately
			onUpdateNode(id, { 
				formData: { 
					...formData, 
					subtype: selectedOption.subtypeForFrame, 
					selectedFrame: selectedOption.value 
				}
			});
		} else {
			console.log('Setting subtype:', selectedOption.value);
			setSubtype(selectedOption.value);
			setSelectedFrame(null);
			// Update node data immediately
			onUpdateNode(id, { 
				formData: { 
					...formData, 
					subtype: selectedOption.value, 
					selectedFrame: null 
				}
			});
		}
		setOpenDropdown(null); // Close dropdown
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

	// Update form data when local state changes
	React.useEffect(() => {
		const timeoutId = setTimeout(() => {
			onUpdateNode(id, { 
				formData: { prompt, subtype, selectedFrame, duration, model },
				connectedImages 
			});
		}, 100);
		
		return () => clearTimeout(timeoutId);
	}, [id, onUpdateNode, prompt, subtype, selectedFrame, duration, model, connectedImages]);

	const handleGenerate = async () => {
		console.log('🚀 handleGenerate called');
		console.log('- prompt:', prompt);
		console.log('- subtype:', subtype);
		console.log('- selectedFrame:', selectedFrame);
		console.log('- data.type:', data.type);
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
				subtype,
				selectedFrame,
				duration: data.type === 'video' ? duration : undefined,
				model,
				connectedImages: allImages,
				uploadedImage
			};

			console.log('📤 Sending generation data:', generationData);

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
		if (data.type === 'image') {
			return subtype === 'ugc_character' ? 75 : 50;
		} else if (data.type === 'video') {
			const baseCredits = subtype === 'image_to_video' ? 150 : 200;
			const durationBonus = duration === 5 ? 50 : duration === 7 ? 100 : 0;
			return baseCredits + durationBonus;
		}
		return 50;
	};
	
	const IconComponent = useMemo(() => {
		if (subtype === 'general') return Image;
		if (subtype === 'ugc_character') return Smiley;
		if (subtype === 'background') return Rectangle;
		return config?.icon || Sparkle;
	}, [subtype, config]);

	// Determine current selected value for the dropdown
	const currentDropdownValue = selectedFrame || subtype;
	
	// Debug current values
	console.log('Current values:', { subtype, selectedFrame, currentDropdownValue });

	return (
		<div 
			className={`group bg-[#202123]/60 border border-neutral-700/60 rounded-2xl shadow-lg transition-all text-neutral-200 ${selected ? '!ring-0 !border-neutral-700/60' : 'border-neutral-700/60'}`} 
			style={{ width: 340 }}
		>
			{/* Dropdowns on hover - Placed above the node */}
			<div className={`absolute -top-12 left-1/2 -translate-x-1/2 flex flex-wrap gap-1 z-10 w-full transition-opacity ${(selectedFrame || subtype !== 'general' || openDropdown) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} justify-center`}>
				{/* Image Dropdown - Enhanced Version */}
				{data.type === 'image' && (
					<EnhancedDropdown
						value={currentDropdownValue}
						options={[
							{ value: 'general', label: 'General Image', icon: Image },
							{ value: 'background', label: 'Background Scene', backgroundImage: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=400&h=300&fit=crop' },
							{ value: 'car_selfie_glow', label: 'Car Selfie Glow', backgroundImage: 'https://images.unsplash.com/photo-1494790108755-2616c96bb4de?w=400&h=300&fit=crop&crop=face' },
							{ value: 'late_night_lofi', label: 'Late Night Lo-Fi', backgroundImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=300&fit=crop&crop=face' },
							{ value: 'forced_perspective', label: 'Forced Perspective', backgroundImage: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=300&fit=crop&crop=face' },
							{ value: 'wide_angle_pov', label: 'Wide-Angle POV Walk', backgroundImage: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=300&fit=crop&crop=face' },
							{ value: 'city_street_style', label: 'City Street Style', backgroundImage: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400&h=300&fit=crop&crop=face' },
							{ value: 'solo_snap_vibe', label: 'Solo Snap Vibe', backgroundImage: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&h=300&fit=crop&crop=face' },
							{ value: 'warm_moments', label: 'Warm Moments', backgroundImage: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=400&h=300&fit=crop&crop=face' },
							{ value: 'urban_motion_girl', label: 'Urban Motion Girl', backgroundImage: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=300&fit=crop&crop=face' },
							{ value: 'vintage_buddy_vibes', label: '90s Vintage Buddy', backgroundImage: 'https://images.unsplash.com/photo-1503023345310-bd7c1de61c7d?w=400&h=300&fit=crop&crop=face' }
						]}
						onChange={(selectedValue) => {
							console.log('Frame selected:', selectedValue);
							if (selectedValue === 'general') {
								setSubtype('general');
								setSelectedFrame(null);
							} else if (selectedValue === 'background') {
								setSubtype('background');
								setSelectedFrame('background');
							} else {
								// All other options are UGC character frames
								setSubtype('ugc_character');
								setSelectedFrame(selectedValue);
							}
						}}
						isOpen={openDropdown === 'subtype'}
						onToggle={() => {
							console.log('NEW Dropdown toggle called');
							setOpenDropdown(openDropdown === 'subtype' ? null : 'subtype');
						}}
						onOpenStateChange={onDropdownStateChange}
					/>
				)}

				{/* Video Dropdowns */}
				{data.type === 'video' && (
					<>
						<CustomDropdown
							value={subtype}
							options={Object.entries(config.subtypes).map(([key, value]) => ({
								value: key,
								label: value.label,
								icon: value.icon
							}))}
							onChange={(value) => {
								setSubtype(value);
								onUpdateNode(id, { 
									formData: { ...formData, subtype: value }
								});
							}}
							isOpen={openDropdown === 'subtype'}
							onToggle={() => handleDropdownToggle('subtype')}
							onOpenStateChange={onDropdownStateChange}
							minWidth="120px"
						/>
						{config?.subtypes?.[subtype]?.models && (
							<CustomDropdown
								value={model}
								options={Object.entries(config.subtypes[subtype].models).map(([key, value]) => ({
									value: key,
									label: value.label,
									icon: value.icon
								}))}
								onChange={(value) => {
									setModel(value);
									onUpdateNode(id, { 
										formData: { ...formData, model: value }
									});
								}}
								isOpen={openDropdown === 'model'}
								onToggle={() => handleDropdownToggle('model')}
								onOpenStateChange={onDropdownStateChange}
								minWidth="100px"
							/>
						)}
					</>
				)}
			</div>

			{/* Node content */}
			<div className="p-4 space-y-3">
				{/* Header with inline dropdown for video duration */}
				<div className="flex justify-between items-center text-xs font-medium text-neutral-400 px-1">
					<span>{data.type.toUpperCase()}</span>
					{data.type === 'video' && (
						<CustomDropdown
							value={duration}
							options={config.options?.duration?.map(opt => ({
								value: opt.value,
								label: opt.label,
							})) || []}
							onChange={(value) => {
								setDuration(value);
								onUpdateNode(id, { 
									formData: { ...formData, duration: value }
								});
							}}
							isOpen={openDropdown === 'duration'}
							onToggle={() => handleDropdownToggle('duration')}
							onOpenStateChange={onDropdownStateChange}
							minWidth="60px"
							isCompact={true}
						/>
					)}
					<div className="flex items-center px-2 py-1 bg-neutral-700 rounded-lg border border-neutral-600">
						<LogoNaked className="w-3 h-3 mr-1.5 text-white rotate-90" />
						<span className="text-xs text-neutral-300 font-medium">
							{getCreditsForType()}
						</span>
					</div>
				</div>

				{/* Selected Frame Display */}
				{data.type === 'image' && selectedFrame && (
					<div className="bg-neutral-800/50 p-1.5 rounded-lg flex items-center gap-2">
						{(() => {
							const frameOption = allFrameOptions.find(f => f.id === selectedFrame);
							return frameOption ? (
								<>
									<img 
										src={frameOption.exampleImage} 
										alt={frameOption.name}
										className="w-8 h-8 object-cover rounded border border-neutral-600"
									/>
									<span className="text-white text-sm font-medium truncate">{frameOption.name}</span>
								</>
							) : null;
						})()}
					</div>
				)}

				{/* Connected Images Display - small thumbnail in top right */}
				{(connectedImages.length > 0 || uploadedImage) && (
					<div className="bg-neutral-800/50 p-1.5 rounded-lg flex items-center gap-2">
						{/* Show uploaded image first */}
						{uploadedImage && (
							<div className="relative">
								<img 
									src={uploadedImage.url} 
									alt={uploadedImage.fileName}
									className="w-8 h-8 object-cover rounded border border-neutral-600"
								/>
								<button
									onClick={() => onUpdateNode(id, { uploadedImage: null })}
									className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 transition-colors"
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
								className="w-8 h-8 object-cover rounded border border-neutral-600"
							/>
						))}
						{connectedImages.length > (uploadedImage ? 2 : 3) && (
							<div className="w-8 h-8 bg-neutral-700 rounded border border-neutral-600 flex items-center justify-center">
								<span className="text-xs text-neutral-300">+{connectedImages.length - (uploadedImage ? 2 : 3)}</span>
							</div>
						)}
						<span className="text-white text-sm font-medium truncate ml-1">
							{uploadedImage && connectedImages.length > 0 ? 'Images' : uploadedImage ? 'Uploaded' : 'Connected Assets'}
						</span>
					</div>
				)}

				<div className="space-y-1 text-sm pt-2">
					<p className="text-neutral-500 px-2 pb-1">Try to...</p>
					<div className="w-full text-left flex items-center gap-3 p-2 rounded-lg text-neutral-300">
						<IconComponent size={16} /> Generate {config?.label || 'Content'}
					</div>
					{data.type === 'image' && (
						<div className="w-full text-left flex items-center gap-3 hover:bg-neutral-700/50 p-2 rounded-lg transition-colors cursor-pointer"
							onClick={() => fileInputRef.current?.click()}
						>
							<Upload size={16} /> Upload an image
						</div>
					)}
				</div>

				{/* Prompt Input */}
				<div 
					className={`relative bg-neutral-800/50 rounded-lg border-2 border-dashed transition-colors ${
						isDragOver 
							? 'border-blue-500 bg-blue-500/10' 
							: 'border-transparent hover:border-neutral-600'
					}`}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					onDrop={handleDrop}
				>
					<textarea
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
						placeholder={data.type === 'image' ? 
							(isDragOver ? 'Drop image here...' : 'Describe the image you want to create or drag & drop an image...') :
							`Describe the ${data.type} you want to create...`
						}
						rows={2}
						className="w-full bg-transparent border-none text-neutral-400 text-sm p-3 pr-20 focus:outline-none resize-none"
					/>
					<div className="absolute right-2 bottom-2 flex items-center gap-2">
						<button
							onClick={handleGenerate}
							disabled={!prompt.trim() || isGenerating}
							className="bg-white text-black rounded-full w-8 h-8 flex items-center justify-center hover:bg-neutral-200 transition-colors disabled:bg-neutral-600 disabled:text-neutral-400"
						>
							{isGenerating ? (
								<div className="animate-spin rounded-full h-4 w-4 border-2 border-black border-t-transparent"></div>
							) : (
								<ArrowUp size={16} weight="bold" />
							)}
						</button>
					</div>
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

			<Handle type="target" position={Position.Left} className="!w-4 !h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
			<Handle type="source" position={Position.Right} className="!w-4 !h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
		</div>
	);
};

// Video Upload Component - Standardized design
const VideoUpload = React.memo(({ data, selected, id }) => {
	const { videoUrl, fileName } = data;

	// If video is uploaded, show compact preview
	if (videoUrl) {
		return (
			<div 
				className={`relative group transition-all ${selected ? 'ring-2 ring-neutral-400/30 rounded-2xl' : ''}`} 
				style={{ width: 140, height: 233 }}
			>
				{selected && (
					<div className="absolute -top-6 left-0 text-xs text-neutral-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
						Video Asset
					</div>
				)}
				<div className="relative w-full h-full">
					<video
						src={videoUrl}
						alt={fileName || 'Uploaded video'}
						className="w-full h-full object-cover rounded-2xl shadow-xl border border-neutral-700/50"
						controls
						loop
						muted
					/>
				</div>
				<Handle type="target" position={Position.Left} className="!w-4 !h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
				<Handle type="source" position={Position.Right} className="!w-4 !h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
			</div>
		);
	}

			// Initial state with standardized design
		return (
			<div 
				className={`group relative bg-[#202123]/60 border border-neutral-700/60 rounded-2xl shadow-lg transition-all text-neutral-200 ${selected ? 'ring-1 ring-white/30 border-white' : 'border-neutral-700/60'}`} 
				style={{ width: 340 }}
			>
			<div className="p-4 space-y-3">
				<div className="flex justify-between items-center text-xs font-medium text-neutral-400 px-1">
					<span>VIDEO 1</span>
					<span>UPLOAD</span>
				</div>

				<div className="space-y-1 text-sm pt-2">
					<p className="text-neutral-500 px-2 pb-1">Try to...</p>
					<div className="w-full text-left flex items-center gap-3 hover:bg-neutral-700/50 p-2 rounded-lg transition-colors">
						<Upload size={16} /> Upload a video
					</div>
				</div>
				<div className="relative bg-neutral-800/50 rounded-lg">
					<p className="text-neutral-400 text-sm p-3 pr-20">Drag and drop your video file here</p>
					<div className="absolute right-2 bottom-2 flex items-center gap-2">
						<span className="bg-black/50 text-xs font-bold rounded-full px-2 py-1">1×</span>
						<button className="bg-white text-black rounded-full w-8 h-8 flex items-center justify-center hover:bg-neutral-200 transition-colors">
							<ArrowUp size={16} weight="bold" />
						</button>
					</div>
				</div>
			</div>
			<Handle type="target" position={Position.Left} className="!w-4 !h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
			<Handle type="source" position={Position.Right} className="!w-4 !h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
		</div>
	);
});

// Simple Image Upload Component
const ImageUpload = React.memo(({ data, selected, id, onUpdateNode }) => {
	const [imageUrl, setImageUrl] = useState(data.imageUrl || null);
	const fileInputRef = useRef(null);

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



	// If image uploaded, show it
	if (imageUrl) {
		return (
			<div 
				className={`relative group transition-all`} 
				style={{ width: 180, height: 240 }}
			>
					<img 
						src={imageUrl} 
						alt="Uploaded" 
					className="w-full h-full object-cover rounded-2xl border border-neutral-600"
					/>
					<button
						onClick={() => fileInputRef.current?.click()}
					className="absolute top-2 right-2 w-8 h-8 bg-black/70 text-white rounded-full flex items-center justify-center hover:bg-black/90 opacity-0 group-hover:opacity-100 transition-all"
					>
					<PencilSimple size={16} />
					</button>
				<input
					ref={fileInputRef}
					type="file"
					accept="image/*"
					onChange={(e) => handleImageUpload(e.target.files[0])}
					className="hidden"
				/>
				<Handle type="source" position={Position.Right} className="!w-4 !h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
				<Handle type="target" position={Position.Left} className="!w-4 !h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
			</div>
		);
	}

	// Upload state
		return (
		<div 
			className={`group relative border-2 border-dashed border-neutral-600/60 rounded-2xl bg-neutral-800/30 hover:bg-neutral-700/50 transition-all cursor-pointer`} 
			style={{ width: 180, height: 240 }}
			onClick={() => fileInputRef.current?.click()}
		>
			<div className="flex flex-col items-center justify-center h-full text-neutral-400">
				<Upload size={32} className="mb-2" />
				<span className="text-sm font-medium">Upload Image</span>
				<span className="text-xs mt-1">Click or drag here</span>
					</div>
			 <input
				ref={fileInputRef}
				type="file"
				accept="image/*"
				onChange={(e) => handleImageUpload(e.target.files[0])}
				className="hidden"
			/>
			<Handle type="source" position={Position.Right} className="!w-4 !h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
			<Handle type="target" position={Position.Left} className="!w-4 !h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
		</div>
	);
});

// Main Slideshow Node for configuration - Standardized design
const SlideshowNode = React.memo(({ id, data, selected, onUpdateNode, onGenerate, onDropdownStateChange }) => {
	const { getNodes, getEdges } = useReactFlow();

	// State for the node's controls
	const [topic, setTopic] = useState(data.topic || '');
	const [slideshowType, setSlideshowType] = useState(data.slideshowType || 'top_3_lists');
	const [imageSource, setImageSource] = useState(data.imageSource || 'asset');
	const [language, setLanguage] = useState(data.language || 'en');
	const [background, setBackground] = useState(data.background || '');
	const [openDropdown, setOpenDropdown] = useState(null);

	const handleDragOver = (event) => {
		event.preventDefault();
		event.dataTransfer.dropEffect = 'link';
	};

	const handleDrop = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (onNodeDrop) {
            onNodeDrop(event, { id, data, type: 'slideshow' });
        }
	};

	const handleDropdownToggle = (dropdownId) => {
		setOpenDropdown(prev => (prev === dropdownId ? null : dropdownId));
	};

	// Persist changes to the main nodes state - with debouncing to prevent infinite loops
	useEffect(() => {
		const timeoutId = setTimeout(() => {
			onUpdateNode(id, { topic, slideshowType, language, background, imageSource });
		}, 100);
		
		return () => clearTimeout(timeoutId);
	}, [id, onUpdateNode, topic, slideshowType, language, background, imageSource]);

	// Check connections to show/hide UI elements
	const { hasProductConnection, hasImageConnection, connectedProductName } = useMemo(() => {
		const hasProduct = !!data.connectedProduct;
		const hasImage = !!(data.connectedImages && data.connectedImages.length > 0);
		const productName = data.connectedProduct?.name || '';

		return { hasProductConnection: hasProduct, hasImageConnection: hasImage, connectedProductName: productName };
	}, [data.connectedProduct, data.connectedImages]);
	
	const handleGenerateClick = async () => {
		if (data.isGenerating) return;

		if (!hasProductConnection && !topic.trim()) {
			alert("Please connect a product or provide a topic.");
			return;
		}
		
		onUpdateNode(id, { isGenerating: true });

		try {
			const generationParams = {
				topic: hasProductConnection ? `Product: ${connectedProductName}` : topic,
				slideshowType,
				language,
				background: hasImageConnection ? null : background,
				connectedImages: data.connectedImages || []
			};
			

			const result = await generateSlideshow(generationParams);
			
			if (result && result.success) {
				if (onGenerate) {
					const slideshowData = result.data || {};
					onGenerate(id, {
						type: 'slideshow',
						slideTexts: slideshowData.slideTexts || [],
						backgroundUrl: slideshowData.selectedBackgroundUrl,
						processedImageUrls: slideshowData.processedImageUrls || [],
						generationId: slideshowData.generationId
					});
				}
			} else {
				throw new Error(result?.error || 'Slideshow generation failed');
			}
		} catch (error) {
			console.error('Slideshow generation error:', error);
			alert(`Generation failed: ${error.message}`);
		} finally {
			onUpdateNode(id, { isGenerating: false });
		}
	}

	const creditCost = imageSource === 'ai' ? 100 : 30;

	return (
		<div 
			className={`group relative bg-[#202123]/60 border border-neutral-700/60 rounded-2xl shadow-lg transition-all text-neutral-200`} 
			style={{ width: 340 }}
		>
			
			{/* Dropdowns on hover */}
			<div className={`absolute -top-12 left-1/2 -translate-x-1/2 flex flex-wrap gap-1 z-10 w-full transition-opacity opacity-0 group-hover:opacity-100 justify-center`}>
				<CustomDropdown
					value={slideshowType}
					onChange={(value) => {
						setSlideshowType(value);
						onUpdateNode(id, { slideshowType: value });
					}}
					options={data.slideshowTypeOptions || []}
					isOpen={openDropdown === 'type'}
					onToggle={() => handleDropdownToggle('type')}
					onOpenStateChange={onDropdownStateChange}
					minWidth="120px"
				/>
				<CustomDropdown
					value={language}
					onChange={(value) => {
						setLanguage(value);
						onUpdateNode(id, { language: value });
					}}
					options={data.languageOptions || []}
					isOpen={openDropdown === 'lang'}
					onToggle={() => handleDropdownToggle('lang')}
					onOpenStateChange={onDropdownStateChange}
					minWidth="100px"
				/>
			</div>

			{/* Node content */}
			<div className="p-4 space-y-3">
				<div className="flex justify-between items-center text-xs font-medium text-neutral-400 px-1">
					<span>SLIDESHOW 1</span>
					<span>AI GEN</span>
				</div>
				


				{/* Connected content display */}
				{(hasProductConnection || hasImageConnection) && (
					<div className="bg-neutral-800/50 p-1.5 rounded-lg flex items-center gap-2">
						{hasImageConnection && data.connectedImages?.[0] && (
							<img 
								src={data.connectedImages[0].url} 
								alt="Connected asset" 
								className="w-8 h-8 rounded-md object-cover"
							/>
						)}
						{hasProductConnection && (
							<Package size={16} className="text-neutral-400" />
						)}
						<span className="text-white text-sm font-medium truncate">
							{hasProductConnection ? connectedProductName : 'Connected Background'}
						</span>
					</div>
				)}

				<div className="space-y-1 text-sm pt-2">
					<p className="text-neutral-500 px-2 pb-1">Try to...</p>
					<div className="w-full text-left flex items-center gap-3 p-2 rounded-lg text-neutral-300">
						<Slideshow size={16} /> Generate slideshow content
					</div>
				</div>

				{/* Topic Input */}
				<div className="relative bg-neutral-800/50 rounded-lg">
					{hasProductConnection ? (
						<p className="text-neutral-400 text-sm p-3 pr-20">Product: {connectedProductName}</p>
					) : (
						<textarea
							value={topic}
							onChange={(e) => setTopic(e.target.value)}
							placeholder="e.g., 'Top 5 features of our new app'"
							rows={2}
							className="w-full bg-transparent border-none text-neutral-400 text-sm p-3 pr-20 focus:outline-none resize-none"
						/>
					)}
					<div className="absolute right-2 bottom-2 flex items-center gap-2">
						<div className="flex items-center px-2 py-1 bg-neutral-700 rounded-lg border border-neutral-600">
							<LogoNaked className="w-3 h-3 mr-1.5 text-white rotate-90" />
							<span className="text-xs text-neutral-300 font-medium">
								{creditCost}
							</span>
						</div>
						<button
							onClick={handleGenerateClick}
							disabled={data.isGenerating || (!hasProductConnection && !topic.trim())}
							className="bg-white text-black rounded-full w-8 h-8 flex items-center justify-center hover:bg-neutral-200 transition-colors disabled:bg-neutral-600 disabled:text-neutral-400"
						>
							{data.isGenerating ? (
								<div className="animate-spin rounded-full h-4 w-4 border-2 border-black border-t-transparent"></div>
							) : (
								<ArrowUp size={16} weight="bold" />
							)}
						</button>
					</div>
				</div>
			</div>

			<Handle type="target" position={Position.Left} className="!w-4 !h-4 !bg-neutral-600 !border-2 !border-white opacity-0 group-hover:opacity-100 transition-opacity" />
			<Handle type="source" position={Position.Right} className="!w-4 !h-4 !bg-neutral-600 !border-2 !border-white opacity-0 group-hover:opacity-100 transition-opacity" />
		</div>
	);
});

const GeneratedFrame = ({ data, id, selected }) => {
	const { imageUrl, prompt, type } = data;

	return (
		<div className="group relative z-10 flex flex-col items-center">
			{/* Connection handles - hidden until hover, higher z-index */}
			<Handle 
				type="target" 
				position={Position.Left} 
				className="!w-4 !h-4 opacity-0 group-hover:opacity-100 transition-opacity !z-20" 
			/>
			<Handle 
				type="source" 
				position={Position.Right} 
				className="!w-4 !h-4 opacity-0 group-hover:opacity-100 transition-opacity !z-20" 
			/>
			
			{/* Title above the frame - uppercase */}
			{prompt && (
				<div className="mb-4 text-center max-w-[180px]">
					<p className="text-sm font-bold text-neutral-200 uppercase tracking-wider truncate" title={prompt}>
						{prompt}
					</p>
				</div>
			)}
			
			{/* Image frame with 9:16 aspect ratio */}
			<div 
				className="relative overflow-hidden rounded-2xl shadow-xl"
				style={{ width: '180px', height: '320px' }} // 9:16 ratio
			>
				{imageUrl ? (
					<img 
						src={imageUrl} 
						alt={prompt || 'Generated image'} 
						className="w-full h-full object-cover"
					/>
				) : (
					<div className="w-full h-full flex items-center justify-center bg-neutral-900 text-neutral-500">
						<Sparkle size={32} />
					</div>
				)}
			</div>
		</div>
	);
};

// Slideshow Result Node - Shows generated slideshow content
const SlideshowResultNode = React.memo(({ data, id }) => {
	const [currentSlide, setCurrentSlide] = useState(0);

	const slideTexts = data.slideTexts || [];
	const images = data.processedImageUrls && data.processedImageUrls.length > 0 ? data.processedImageUrls : [data.backgroundUrl].filter(Boolean);
	const totalSlides = slideTexts.length;
	
	const nextSlide = () => {
		setCurrentSlide(prev => (prev === totalSlides - 1 ? 0 : prev + 1));
	};

	const prevSlide = () => {
		setCurrentSlide(prev => (prev === 0 ? totalSlides - 1 : prev - 1));
	};

	return (
		<div 
			className="w-[280px] text-white font-sans relative group"
		>
			<Handle type="target" position={Position.Left} className="!w-6 !h-6 !bg-neutral-600 border-2 border-white" />
			<Handle type="source" position={Position.Right} className="!w-6 !h-6 !bg-neutral-600 border-2 border-white" />
			
			{/* Title above the frame */}
			<div className="mb-3 flex items-center gap-3 px-2">
				<div className="p-2 bg-neutral-700/50 border border-neutral-600/50 rounded-lg">
					<Slideshow size={16} className="text-neutral-300" />
				</div>
				<div>
					<div className="font-bold text-sm text-neutral-100">{data.label || 'Generated Slideshow'}</div>
					<div className="text-xs text-neutral-400">
						Generated at {new Date(data.generatedAt).toLocaleTimeString()}
					</div>
				</div>
			</div>

			{/* Frame container */}
			<div className="bg-gradient-to-br from-neutral-800 to-neutral-900 border-2 border-neutral-600/60 rounded-3xl shadow-2xl overflow-hidden relative">
				{/* Frame inner shadow */}
				<div className="absolute inset-0 rounded-3xl shadow-inner pointer-events-none" style={{
					boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)'
				}}></div>
				
				{/* Frame glow effect */}
				<div className="absolute -inset-1 bg-gradient-to-br from-neutral-600/20 to-neutral-500/20 rounded-3xl blur-sm -z-10"></div>

				{totalSlides > 0 ? (
					<div className="relative w-full aspect-[9/16] rounded-3xl overflow-hidden">
						{/* Slides Container - fills entire frame */}
						<div className="w-full h-full overflow-hidden">
							{slideTexts.map((text, index) => (
								<div
									key={index}
									className="absolute w-full h-full transition-opacity duration-500 ease-in-out"
									style={{ opacity: index === currentSlide ? 1 : 0 }}
								>
									<img
										src={images[index] || images[0] || "https://placehold.co/1080x1920/171717/262626?text=No+Image"}
										alt={`Slide ${index + 1}`}
										className="w-full h-full object-cover"
									/>
									<div className="absolute inset-0 bg-black/40"></div>
									<div className="absolute inset-0 p-6 flex items-center justify-center">
										<p className="text-white text-lg font-bold text-center shadow-lg leading-snug drop-shadow-2xl">
											{text}
										</p>
									</div>
								</div>
							))}
						</div>

						{/* Navigation Arrows */}
						{totalSlides > 1 && (
							<>
								<button 
									onClick={prevSlide} 
									className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/50 backdrop-blur-sm text-white p-2.5 rounded-full hover:bg-black/70 transition-all focus:outline-none focus:ring-2 focus:ring-green-400/50 z-10"
								>
									<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
									</svg>
								</button>
								<button 
									onClick={nextSlide} 
									className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/50 backdrop-blur-sm text-white p-2.5 rounded-full hover:bg-black/70 transition-all focus:outline-none focus:ring-2 focus:ring-green-400/50 z-10"
								>
									<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
									</svg>
								</button>
							</>
						)}

						{/* Slide Indicators */}
						<div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex space-x-2 z-10">
							{Array.from({ length: totalSlides }).map((_, index) => (
								<button
									key={index}
									onClick={() => setCurrentSlide(index)}
									className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
										index === currentSlide 
											? 'bg-white scale-125 shadow-lg shadow-white/50' 
											: 'bg-white/60 hover:bg-white/80'
									}`}
								></button>
							))}
						</div>
					</div>
				) : (
					<div className="p-8 text-center text-neutral-400 text-sm">
						<div className="border-2 border-dashed border-neutral-600 rounded-2xl p-8">
							No slides were generated.
						</div>
					</div>
				)}
			</div>
		</div>
	);
});

// Asset Panel Component - Minimal like Layout bottom bar
const AssetPanel = ({ user, onDragStart }) => {
	const [assets, setAssets] = useState({
		products: [],
		creators: [],
		backgrounds: []
	});
	const [activeCategory, setActiveCategory] = useState(null);
	const [isExpanded, setIsExpanded] = useState(false);

	// Fetch assets from Firestore
	useEffect(() => {
		if (!user?.uid) return;

		const fetchAssets = async () => {
			try {
				// Fetch Products
				const productsQuery = query(
					collection(db, 'users', user.uid, 'products'),
					orderBy('createdAt', 'desc')
				);
				const productsSnapshot = await getDocs(productsQuery);
				const products = productsSnapshot.docs.map(doc => ({
					id: doc.id,
					...doc.data(),
					type: 'product'
				}));

				// Fetch Creators
				const creatorsQuery = query(
					collection(db, 'users', user.uid, 'creators'),
					orderBy('createdAt', 'desc')
				);
				const creatorsSnapshot = await getDocs(creatorsQuery);
				const creators = creatorsSnapshot.docs.map(doc => ({
					id: doc.id,
					...doc.data(),
					type: 'creator'
				}));

				// Fetch Backgrounds
				const backgroundsQuery = query(
					collection(db, 'users', user.uid, 'backgrounds'),
					orderBy('createdAt', 'desc')
				);
				const backgroundsSnapshot = await getDocs(backgroundsQuery);
				const backgrounds = backgroundsSnapshot.docs.map(doc => ({
					id: doc.id,
					...doc.data(),
					type: 'background'
				}));

				setAssets({
					products,
					creators,
					backgrounds
				});
			} catch (error) {
				console.error('Error fetching assets:', error);
			}
		};

		fetchAssets();
	}, [user]);

	const handleDragStart = (e, asset) => {
		console.log('Setting drag data:', asset);
		e.dataTransfer.setData('application/json', JSON.stringify(asset));
		e.dataTransfer.effectAllowed = 'copy';
		
		// Close the panel during drag to avoid z-index issues
		setTimeout(() => {
			setIsExpanded(false);
			setActiveCategory(null);
		}, 100);
		
		if (onDragStart) {
			onDragStart(asset);
		}
	};

	const categories = [
		{ id: 'products', icon: Package, label: 'Products' },
		{ id: 'creators', icon: User, label: 'Creators' },
		{ id: 'backgrounds', icon: ImagesSquare, label: 'Backgrounds' }
	];

	const currentAssets = assets[activeCategory] || [];

	const toggleCategory = (categoryId) => {
		if (activeCategory === categoryId && isExpanded) {
			// Close if same category clicked
			setIsExpanded(false);
			setActiveCategory(null);
		} else {
			// Open new category
			setActiveCategory(categoryId);
			setIsExpanded(true);
		}
	};

	return (
		<>
			{/* Unified Asset Panel - Single frame like Layout bottom bar */}
			<div className="fixed top-1/2 left-4 -translate-y-1/2 z-50">
				<div className={`flex items-center bg-white/80 dark:bg-neutral-950/80 backdrop-blur-xl border border-stone-200/50 dark:border-stone-700/50 rounded-xl shadow-sm transition-all duration-300 ease-out ${
					isExpanded && activeCategory ? 'pr-0' : 'pr-3'
				}`}>
					{/* Category Buttons */}
					<div className="flex flex-col items-center p-3">
						{categories.map((category) => {
							const IconComponent = category.icon;
							const isActive = activeCategory === category.id && isExpanded;
							const count = assets[category.id]?.length || 0;
							
							return (
								<button
									key={category.id}
									onClick={() => toggleCategory(category.id)}
									className={`relative p-3 mb-2 last:mb-0 rounded-xl transition-all duration-200 ${
										isActive 
											? 'bg-neutral-100 dark:bg-neutral-800 text-stone-800 dark:text-stone-200' 
											: 'text-stone-600 dark:text-stone-400 hover:bg-neutral-950/10 dark:hover:bg-neutral-100/10'
									}`}
									title={category.label}
								>
									<IconComponent size={18} />
									{count > 0 && (
										<span className="absolute -top-1 -right-1 w-4 h-4 text-[10px] font-bold rounded-full bg-stone-800 dark:bg-white text-white dark:text-stone-900 flex items-center justify-center">
											{count}
										</span>
									)}
								</button>
							);
						})}
					</div>

					{/* Expanded Content - Same frame */}
					<div 
						className={`transition-all duration-300 ease-out overflow-hidden ${
							isExpanded && activeCategory 
								? 'w-72 opacity-100' 
								: 'w-0 opacity-0'
						}`}
					>
						<div className="w-72 border-l border-stone-200/50 dark:border-stone-700/50 max-h-96 overflow-hidden flex flex-col">
							{/* Header */}
							<div className="flex items-center justify-between p-3 border-b border-stone-200/50 dark:border-stone-700/50">
								<div className="flex items-center gap-2">
									{activeCategory && React.createElement(categories.find(c => c.id === activeCategory)?.icon, { size: 16 })}
									<span className="text-sm font-medium text-stone-900 dark:text-stone-100">
										{activeCategory && categories.find(c => c.id === activeCategory)?.label}
									</span>
								</div>
								<button
									onClick={() => {
										setIsExpanded(false);
										setActiveCategory(null);
									}}
									className="p-1 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-stone-500 dark:text-stone-400 transition-colors"
								>
									<X size={16} />
								</button>
							</div>

							{/* Assets Grid */}
							<div className="flex-1 overflow-y-auto p-3">
								{currentAssets.length === 0 ? (
									<div className="text-center py-6">
										<div className="text-stone-400 mb-2">
											{activeCategory && React.createElement(categories.find(c => c.id === activeCategory)?.icon, { size: 24 })}
										</div>
										<p className="text-xs text-stone-500 dark:text-stone-400">
											No {activeCategory} found
										</p>
										<p className="text-xs text-stone-400 dark:text-stone-500">
											Add some in Settings
										</p>
									</div>
								) : (
									<div className="grid grid-cols-3 gap-2">
										{currentAssets.map((asset, index) => {
											// Use correct URL for each asset type
											let assetUrl = '';
											if (asset.type === 'product') {
												assetUrl = asset.mediaType === 'video' ? asset.mediaUrl : asset.logoUrl;
											} else if (asset.type === 'creator') {
												assetUrl = asset.imageUrl;
											} else if (asset.type === 'background') {
												assetUrl = asset.imageUrl;
											}

											return (
												<div
													key={asset.id}
													draggable
													onDragStart={(e) => handleDragStart(e, asset)}
													className={`group relative aspect-[9/16] bg-neutral-50 dark:bg-neutral-800 rounded-lg overflow-hidden cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-stone-400 transition-all duration-200 ${
														isExpanded ? 'animate-in slide-in-from-left-1 fade-in' : ''
													}`}
													style={{
														animationDelay: `${index * 50}ms`,
														animationFillMode: 'both'
													}}
												>
													{/* Asset Content */}
													{assetUrl && (
														<>
															{asset.type === 'product' && asset.mediaType === 'video' ? (
																<video
																	src={assetUrl}
																	className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
																	muted
																	loop
																	onMouseEnter={(e) => e.target.play().catch(() => {})}
																	onMouseLeave={(e) => e.target.pause()}
																/>
															) : (
																<img
																	src={assetUrl}
																	alt={asset.name}
																	className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
																/>
															)}
														</>
													)}
													
													{/* Hover Overlay */}
													<div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
														<div className="opacity-0 group-hover:opacity-100 transition-opacity bg-stone-800 text-white text-xs px-2 py-1 rounded">
															Drag
														</div>
													</div>
													
													{/* Name */}
													<div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
														<p className="text-xs font-medium text-white truncate">
															{asset.name}
														</p>
														{asset.type === 'product' && asset.mediaType && (
															<p className="text-[10px] text-white/80">
																{asset.mediaType}
															</p>
														)}
													</div>
												</div>
											);
										})}
									</div>
								)}
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Backdrop */}
			{isExpanded && (
				<div 
					className="fixed inset-0 z-30" 
					onClick={() => {
						setIsExpanded(false);
						setActiveCategory(null);
					}}
				/>
			)}
		</>
	);
};

const CanvasWorkspace = () => {
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

	const menuOptions = [
		{ type: 'image', label: 'Image', icon: Image },
		{ type: 'slideshow', label: 'Slideshow', icon: Slideshow },
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
		// Images can only connect to slideshows, not to image creation nodes
		const targetAcceptsMedia = ['slideshow'].includes(target.type);
	
		if (sourceHasMedia && targetAcceptsMedia) {
			const newAsset = {
				id: `connected-${source.id}-${Date.now()}`,
				url: source.data.imageUrl || source.data.videoUrl,
				fileName: source.data.fileName || 'Connected Asset',
				type: source.data.imageUrl ? 'image' : 'video',
				sourceNodeId: source.id
			};
	
			const existingImages = target.data.connectedImages || [];
			
			// For slideshow, only allow one background image
			const updatedImages = target.type === 'slideshow'
				? [newAsset] 
				: [...existingImages, newAsset];
	
			updateNodeData(target.id, { connectedImages: updatedImages });
		}
	
		// Handle product connection to slideshow
		if (source.data?.assetType === 'products' && target.type === 'slideshow') {
			updateNodeData(target.id, {
				connectedProduct: {
					id: source.id,
					name: source.data.label,
				}
			});
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

	// Load saved canvas state on mount
	useEffect(() => {
		try {
			const savedState = localStorage.getItem('lungoai-canvas-state');
			if (savedState) {
				const { nodes: savedNodes, edges: savedEdges, timestamp } = JSON.parse(savedState);
				
				// Only load if saved within last 24 hours
				const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
				if (timestamp > dayAgo) {
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
			localStorage.removeItem('lungoai-canvas-state'); // Clear corrupted state
			
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
	}, [setCanvasStatus]);

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
		
		const saveTimeout = setTimeout(() => {
			try {
				const stateToSave = {
					nodes,
					edges,
					timestamp: Date.now()
				};
				
				localStorage.setItem('lungoai-canvas-state', JSON.stringify(stateToSave));
				const now = new Date();
				setLastSaved(now);
				
				// Send completed status to Layout
				if (setCanvasStatus) {
					setCanvasStatus({
						isAutoSaving: false,
						lastSaved: now,
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
	}, [nodes, edges, setCanvasStatus]);

	// Clear canvas function
	const clearCanvas = useCallback(() => {
			setNodes([]);
			setEdges([]);
			localStorage.removeItem('lungoai-canvas-state');
			setLastSaved(null);
		if (setCanvasStatus) {
			setCanvasStatus({
				isAutoSaving: false,
				lastSaved: null,
				nodeCount: 0,
				edgeCount: 0
			});
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
		const newNodeId = `gen-${timestamp}`;
		const newEdgeId = `e-${sourceNodeId}-${newNodeId}`;

		// First, mark the source node as generating
		updateNodeData(sourceNodeId, { isGenerating: true });

		try {
			let result = null;

			if (generationData.type === 'image') {
				console.log('🖼️ Calling generateImage...');
				
				// Simple approach: just send prompt, subtype and selectedFrame
				// AI service will handle the rest based on rules
				result = await generateImage({
					prompt: generationData.prompt,
					subtype: generationData.subtype,
					selectedFrame: generationData.selectedFrame,
					style: 'photorealistic',
					quality: 'high',
					connectedImages: generationData.connectedImages || []
				});
				console.log('🖼️ Image generation result:', result);
			} else if (generationData.type === 'video') {
				console.log('🎬 Calling generateVideo...');
				result = await generateVideo({
					prompt: generationData.prompt,
					subtype: generationData.subtype,
					duration: generationData.duration,
					model: generationData.model,
					connectedImages: generationData.connectedImages || []
				});
				console.log('🎬 Video generation result:', result);
			}

			// Clear generating state
			updateNodeData(sourceNodeId, { isGenerating: false });

			if (result && result.success) {
				// Create new result node
				setNodes((currentNodes) => {
					const sourceNode = currentNodes.find(n => n.id === sourceNodeId);
					if (!sourceNode) return currentNodes;

					let newNode;
					
					if (generationData.type === 'slideshow') {
						newNode = {
							id: newNodeId,
							type: 'slideshowResult',
							position: {
								x: sourceNode.position.x + (sourceNode.width || 340) + 150,
								y: sourceNode.position.y,
							},
							data: {
								label: 'Generated Slideshow',
								slideTexts: generationData.slideTexts || [],
								backgroundUrl: generationData.selectedBackgroundUrl,
								processedImageUrls: generationData.processedImageUrls || [],
								generationId: generationData.generationId,
								generatedAt: timestamp,
							},
						};
					} else { // For 'image' and 'video' from AIFrame
						newNode = {
							id: newNodeId,
							type: 'generatedFrame',
							position: {
								x: sourceNode.position.x,
								y: sourceNode.position.y + (sourceNode.height || 400) + 150,
							},
							data: {
								imageUrl: result.imageUrl || generationData.imageUrl,
								videoUrl: result.videoUrl || generationData.videoUrl,
								prompt: generationData.prompt,
								type: generationData.type,
								generatedAt: timestamp,
							},
						};
					}

					return [...currentNodes, newNode];
				});

				// Create connection edge with green styling for generated content
				setEdges((currentEdges) => {
					const newEdge = {
						id: newEdgeId,
						source: sourceNodeId,
						target: newNodeId,
						style: { 
							stroke: '#22c55e', 
							strokeWidth: 3,
							strokeDasharray: '5,5'
						},
					};
					return addEdge(newEdge, currentEdges);
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
			
			// Check if source or target is a generated node
			const isGeneratedConnection = sourceNode?.type === 'generatedFrame' || targetNode?.type === 'generatedFrame';
			
			const newEdge = {
				...connection,
				style: { 
					stroke: isGeneratedConnection ? '#22c55e' : 'rgba(255, 255, 255, 0.4)', 
					strokeWidth: isGeneratedConnection ? 3 : 2,
					strokeDasharray: isGeneratedConnection ? '5,5' : undefined
				},
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

	// Create nodeTypes with stable references to avoid React Flow warnings
	const nodeTypes = useMemo(() => ({
		aiFrame: (props) => <AIFrame {...props} onUpdateNode={updateNodeData} onAddNode={addNodeToCanvas} onGenerate={handleGenerate} onDropdownStateChange={setIsAnyDropdownOpen} />,
		image: (props) => <AIFrame {...props} onUpdateNode={updateNodeData} onAddNode={addNodeToCanvas} onGenerate={handleGenerate} onDropdownStateChange={setIsAnyDropdownOpen} />,
		video: (props) => <AIFrame {...props} onUpdateNode={updateNodeData} onAddNode={addNodeToCanvas} onGenerate={handleGenerate} onDropdownStateChange={setIsAnyDropdownOpen} />,
		imageUpload: (props) => <ImageUpload {...props} onUpdateNode={updateNodeData} />,
		videoUpload: (props) => <VideoUpload {...props} />,
		generatedFrame: (props) => <GeneratedFrame {...props} />,
		slideshow: (props) => (
			<SlideshowNode 
				{...props} 
				onUpdateNode={updateNodeData} 
				onGenerate={handleGenerate}
				onDropdownStateChange={setIsAnyDropdownOpen}
			/>
		),
		slideshowResult: (props) => <SlideshowResultNode {...props} />,
	}), [updateNodeData, addNodeToCanvas, handleGenerate]);

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

		if (type === 'slideshow') {
			newNode.data = {
				...newNode.data,
				slideshowTypeOptions: [
					{ value: 'top_3_lists', label: 'Top 3 Lists', icon: Slideshow },
					{ value: 'before_after', label: 'Before & After', icon: Slideshow },
					{ value: 'step_by_step', label: 'Step by Step', icon: Slideshow }
				],
				languageOptions: [
					{ value: 'en', label: 'English' },
					{ value: 'tr', label: 'Türkçe' },
					{ value: 'es', label: 'Español' },
					{ value: 'fr', label: 'Français' }
				],
				backgrounds: [] // Empty array since backgrounds are now managed by AssetPanel
			};
		} else if (type === 'image') {
			newNode.data.type = 'image';
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

	// Add drag and drop handlers for assets
	const handleAssetDrop = useCallback((event) => {
		event.preventDefault();
		
		console.log('Asset dropped!', event);
		
		try {
			const assetData = JSON.parse(event.dataTransfer.getData('application/json'));
			console.log('Asset data:', assetData);
			
			if (!assetData || !reactFlowInstance) {
				console.log('Missing asset data or reactFlowInstance');
				return;
			}

			const rect = reactFlowWrapper.current?.getBoundingClientRect();
			if (!rect) {
				console.log('No rect found');
				return;
			}

			const position = reactFlowInstance.screenToFlowPosition({
				x: event.clientX - rect.left,
				y: event.clientY - rect.top,
			});
			console.log('Drop position:', position);

			let newNode;
			const nodeId = `asset-${Date.now()}`;

			if (assetData.type === 'product') {
				console.log('Creating product node');
				// Create video upload node for product videos, image upload for product logos
				if (assetData.mediaType === 'video' && assetData.mediaUrl) {
					newNode = {
						id: nodeId,
						type: 'videoUpload',
						position,
						data: {
							videoUrl: assetData.mediaUrl,
							fileName: assetData.name,
							assetType: 'products',
							label: assetData.name
						}
					};
				} else if (assetData.logoUrl) {
					newNode = {
						id: nodeId,
						type: 'imageUpload',
						position,
						data: {
							imageUrl: assetData.logoUrl,
							fileName: assetData.name,
							assetType: 'products',
							label: assetData.name
						}
					};
				}
			} else if (assetData.type === 'creator') {
				console.log('Creating creator node');
				// Create image upload node for creator
				newNode = {
					id: nodeId,
					type: 'imageUpload',
					position,
					data: {
						imageUrl: assetData.imageUrl,
						fileName: assetData.name,
						assetType: 'creators',
						label: assetData.name
					}
				};
			} else if (assetData.type === 'background') {
				console.log('Creating background node');
				// Create image upload node for background
				newNode = {
					id: nodeId,
					type: 'imageUpload',
					position,
					data: {
						imageUrl: assetData.imageUrl,
						fileName: assetData.name,
						assetType: 'backgrounds',
						label: assetData.name
					}
				};
			}

			console.log('New node created:', newNode);
			
			if (newNode) {
				setNodes((nds) => nds.concat(newNode));
				console.log('Node added to canvas');
			} else {
				console.log('No node was created');
			}
		} catch (error) {
			console.error('Error handling asset drop:', error);
		}
	}, [reactFlowInstance]);

	const handleAssetDragOver = useCallback((event) => {
		event.preventDefault();
		event.dataTransfer.dropEffect = 'copy';
	}, []);

	return (
		<div className="w-full h-screen relative overflow-hidden" ref={reactFlowWrapper}>
			{/* Asset Panel */}
			<AssetPanel 
				user={user}
				onDragStart={(asset) => {
					console.log('Dragging asset:', asset);
				}}
			/>

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
					onDrop={handleAssetDrop}
					onDragOver={handleAssetDragOver}
					className="bg-neutral-950"
					style={{ width: '100%', height: '100vh' }}
					zoomOnScroll={!isAnyDropdownOpen}
					zoomOnPinch={!isAnyDropdownOpen}
					panOnScroll={false}
					selectionOnDrag={!isAnyDropdownOpen}
					panOnDrag={!isAnyDropdownOpen}
					selectionKeyCode={'Shift'}
					minZoom={0.1}
					defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
					snapToGrid={true}
					snapGrid={[24, 24]}
					proOptions={{ hideAttribution: true }}
				>
					<Background variant="dots" gap={24} size={1.5} color="#606060" />
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

				{/* Dynamic Island - Top Center */}
				<div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50">
					<DynamicIsland 
						generatingItem={generatingItem}
						commandQueue={commandQueue || []}
						isDarkMode={isDarkMode || false}
					/>
				</div>

				{/* Canvas Tutorial */}
				<CanvasTutorial 
					user={user}
					isOpen={showTutorial}
					onClose={() => setShowTutorial(false)}
					onOpenTutorial={() => setShowTutorial(true)}
				/>
		</div>
	);
};

export default CanvasWorkspace;
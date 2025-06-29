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
} from '@phosphor-icons/react';
import { generateImage, generateVideo, generateSlideshow, checkApiKey, GENERATION_TYPES, IMAGE_STYLES, QUALITY_OPTIONS } from '../services/ai';
import { useOutletContext } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, onSnapshot, orderBy, doc, getDoc, setDoc } from 'firebase/firestore';

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

// Custom Dropdown Component
const CustomDropdown = ({ value, options, onChange, className = '', minWidth = '60px', isOpen, onToggle, isCompact = false }) => {
	const dropdownRef = useRef(null);

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

	// Safely find the selected option or a fallback
	const selectedOption = options.find(opt => opt.value === value) || (options && options.length > 0 ? options[0] : null);

	// If no option is selected (e.g., initial load, empty options), render a disabled button
	if (!selectedOption) {
		return (
			<div ref={dropdownRef} className={`relative ${className}`}>
				<button
					disabled
					className={`bg-neutral-800 border border-neutral-700 rounded-2xl px-4 py-2.5 text-neutral-500 text-sm focus:outline-none flex items-center gap-3 ${minWidth ? `min-w-[${minWidth}]` : ''}`}
				>
					<span className="truncate font-semibold">Loading...</span>
				</button>
			</div>
		);
	}

	const dropdownContent = isOpen ? createPortal(
		<div 
			className="fixed bg-neutral-800 border border-neutral-700 rounded-2xl z-[9999] w-80 shadow-2xl"
			style={{
				top: dropdownRef.current?.getBoundingClientRect().bottom + 8,
				left: dropdownRef.current?.getBoundingClientRect().left,
			}}
		>
			<div className="max-h-64 overflow-y-auto">
				<div className="p-2 space-y-1">
					{options.map((option) => (
						<button
							key={option.value}
							onClick={() => {
								onChange(option.value);
								onToggle();
							}}
							className={`w-full p-3 text-sm text-left rounded-xl transition-all duration-200 group ${
								value === option.value 
									? 'ring-2 ring-green-500 bg-neutral-750' 
									: 'hover:bg-neutral-750'
							}`}
						>
							{option.backgroundImage ? (
								<div className="flex items-center gap-3">
									<div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
										<img 
											src={option.backgroundImage} 
											alt={option.label}
											className="w-full h-full object-cover"
										/>
									</div>
									<div className="flex-1 min-w-0">
										<div className="font-semibold text-white truncate text-sm">{option.label}</div>
										{option.subtitle && (
											<div className="text-xs text-neutral-400 truncate mt-0.5">{option.subtitle}</div>
										)}
									</div>
									{value === option.value && (
										<div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
											<div className="w-2 h-2 bg-white rounded-full"></div>
										</div>
									)}
								</div>
							) : (
								<div className="flex items-center gap-3">
									<div className="w-10 h-10 rounded-lg bg-neutral-700 flex items-center justify-center flex-shrink-0">
										<div className="w-5 h-5 bg-neutral-600 rounded"></div>
									</div>
									<div className="flex-1">
										<div className="font-semibold text-white text-sm">{option.label}</div>
										{option.subtitle && (
											<div className="text-xs text-neutral-400 mt-0.5">{option.subtitle}</div>
										)}
									</div>
									{option.credits && (
										<div className="flex items-center px-2 py-1 bg-neutral-700 rounded-lg border border-neutral-600">
											<span className="text-xs text-neutral-300 font-medium">
												{option.credits}
											</span>
										</div>
									)}
									{value === option.value && (
										<div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
											<div className="w-2 h-2 bg-white rounded-full"></div>
										</div>
									)}
								</div>
							)}
						</button>
					))}
				</div>
			</div>
		</div>,
		document.body
	) : null;

	return (
		<div ref={dropdownRef} className={`relative ${className}`}>
			<button
				onClick={onToggle}
				
				className={`bg-neutral-800 border border-neutral-700 rounded-2xl px-4 py-2.5 text-neutral-200 text-sm focus:outline-none focus:border-neutral-600 hover:bg-neutral-750 transition-all duration-200 flex items-center gap-3 ${minWidth ? `min-w-[${minWidth}]` : ''} ${isCompact ? 'px-2 py-1' : ''}`}
			>
				<span className="truncate font-semibold">{selectedOption.label}</span>
				<CaretDown 
					size={12} 
					className={`text-neutral-400 transition-transform duration-200 ml-auto ${isOpen ? 'rotate-180' : ''}`} 
				/>
			</button>

			{dropdownContent}
		</div>
	);
};

const initialNodes = [];

// Node types definition outside component to prevent recreation
const createNodeTypes = (updateNodeData, addNodeToCanvas, handleGenerate, onNodeDrop) => ({
	aiFrame: (props) => <AIFrame {...props} onUpdateNode={updateNodeData} onAddNode={addNodeToCanvas} onGenerate={handleGenerate} onNodeDrop={onNodeDrop} />,
	image: (props) => <AIFrame {...props} onUpdateNode={updateNodeData} onAddNode={addNodeToCanvas} onGenerate={handleGenerate} onNodeDrop={onNodeDrop} />,
	video: (props) => <AIFrame {...props} onUpdateNode={updateNodeData} onAddNode={addNodeToCanvas} onGenerate={handleGenerate} onNodeDrop={onNodeDrop} />,
	uploadedFrame: (props) => <UploadedFrame {...props} onUpdateNode={updateNodeData} />,
	imageUpload: (props) => <ImageUpload {...props} onUpdateNode={updateNodeData} />,
	videoUpload: (props) => <VideoUpload {...props} />,
	generatedFrame: (props) => <GeneratedFrame {...props} />,
	slideshow: (props) => (
		<SlideshowNode 
			{...props} 
			onUpdateNode={updateNodeData} 
			onGenerate={handleGenerate}
			onNodeDrop={onNodeDrop}
		/>
	),
	slideshowResult: (props) => <SlideshowResultNode {...props} />,
});

// AI Frame Component - Enhanced with rich options like slideshow
const AIFrame = ({ 
	id, 
	data, 
	selected, 
	onGenerate,
	onImageUpload,
	onSettingChange,
	onUpdateNode,
	onNodeDrop
}) => {
	const { formData = {}, generatedContent, isGenerating, error, connectedImages = [] } = data;
	const config = generationConfig[data.type];
	const IconComponent = config?.icon || Sparkle;
	const fileInputRef = useRef(null);
	const [openDropdown, setOpenDropdown] = useState(null);

	// Local state for form fields
	const [prompt, setPrompt] = useState(formData.prompt || '');
	const [subtype, setSubtype] = useState(formData.subtype || (data.type === 'image' ? 'general' : 'text_to_video'));
	const [duration, setDuration] = useState(formData.duration || 3);
	const [model, setModel] = useState(formData.model || '');

	const handleDropdownToggle = (dropdownId) => {
		setOpenDropdown(prev => (prev === dropdownId ? null : dropdownId));
	};

	const handleDragOver = (event) => {
		event.preventDefault();
		event.stopPropagation();
		event.dataTransfer.dropEffect = 'link';
	};

	const handleDrop = (event) => {
		event.preventDefault();
		event.stopPropagation();
		if (onNodeDrop) {
			onNodeDrop(event, { id, data, type: data.type });
		}
	};

	// Update form data when local state changes
	React.useEffect(() => {
		const timeoutId = setTimeout(() => {
			onUpdateNode(id, { 
				formData: { prompt, subtype, duration, model },
				connectedImages 
			});
		}, 100);
		
		return () => clearTimeout(timeoutId);
	}, [id, onUpdateNode, prompt, subtype, duration, model, connectedImages]);

	const handleGenerate = async () => {
		if (onGenerate) {
			await onGenerate(id, {
				type: data.type,
				prompt,
				subtype,
				duration: data.type === 'video' ? duration : undefined,
				model,
				connectedImages
			});
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

	return (
		<div 
			className={`group bg-[#202123] border border-neutral-700 rounded-2xl shadow-lg transition-all text-neutral-200 ${selected ? 'ring-1 ring-green-500/30 border-green-500' : 'border-neutral-700'}`} 
			style={{ width: 340 }}
			onDragOver={handleDragOver}
			onDrop={handleDrop}
		>
			{/* Dropdowns on hover - Placed above the node */}
			<div className={`absolute -top-12 left-1/2 -translate-x-1/2 flex flex-wrap gap-1 z-10 w-full transition-opacity opacity-0 group-hover:opacity-100 justify-center`}>
				{/* Subtype Dropdown (Image or Video) */}
				{config?.subtypes && (
					<CustomDropdown
						value={subtype}
						options={Object.entries(config.subtypes).map(([key, value]) => ({
							value: key,
							label: value.label,
							icon: value.icon
						}))}
						onChange={setSubtype}
						isOpen={openDropdown === 'subtype'}
						onToggle={() => handleDropdownToggle('subtype')}
						minWidth="120px"
					/>
				)}

				{/* Model Dropdown for Video */}
				{data.type === 'video' && config?.subtypes?.[subtype]?.models && (
					<CustomDropdown
						value={model}
						options={Object.entries(config.subtypes[subtype].models).map(([key, value]) => ({
							value: key,
							label: value.label,
							icon: value.icon
						}))}
						onChange={setModel}
						isOpen={openDropdown === 'model'}
						onToggle={() => handleDropdownToggle('model')}
						minWidth="100px"
					/>
				)}
			</div>

			{/* Node content */}
			<div className="p-4 space-y-3">
				{/* Header with inline dropdown for video duration */}
				<div className="flex justify-between items-center text-xs font-medium text-neutral-400 px-1">
					<span>{data.type.toUpperCase()} {data.type === 'image' ? '3' : '2'}</span>
					{data.type === 'video' && (
						<CustomDropdown
							value={duration}
							options={config.options?.duration?.map(opt => ({
								value: opt.value,
								label: opt.label,
							})) || []}
							onChange={setDuration}
							isOpen={openDropdown === 'duration'}
							onToggle={() => handleDropdownToggle('duration')}
							minWidth="60px"
							isCompact={true}
						/>
					)}
					<span>FLUX DEV</span>
				</div>
				
				<div className="bg-neutral-800/50 p-2 rounded-lg text-sm flex items-center gap-2 text-neutral-300">
					<Info size={16} /> Learn about {config?.label || 'AI'} Blocks
				</div>

				{/* Connected Images Display - small thumbnail in top right */}
				{connectedImages.length > 0 && (
					<div className="bg-neutral-800/50 p-1.5 rounded-lg flex items-center gap-2">
						{connectedImages.slice(0, 3).map((img, index) => (
							<img 
								key={index}
								src={img.url} 
								alt={img.fileName}
								className="w-8 h-8 object-cover rounded border border-neutral-600"
							/>
						))}
						{connectedImages.length > 3 && (
							<div className="w-8 h-8 bg-neutral-700 rounded border border-neutral-600 flex items-center justify-center">
								<span className="text-xs text-neutral-300">+{connectedImages.length - 3}</span>
							</div>
						)}
						<span className="text-white text-sm font-medium truncate ml-1">Connected Assets</span>
					</div>
				)}

				<div className="space-y-1 text-sm pt-2">
					<p className="text-neutral-500 px-2 pb-1">Try to...</p>
					<div className="space-y-1">
						<div className="w-full text-left flex items-center gap-3 p-2 rounded-lg text-neutral-300">
							<IconComponent size={16} /> Generate {config?.label || 'Content'}
						</div>
					</div>
				</div>

				{/* Prompt Input */}
				<div className="relative bg-neutral-800/50 rounded-lg">
					<textarea
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
						placeholder={`Describe the ${data.type} you want to create...`}
						rows={2}
						className="w-full bg-transparent border-none text-neutral-400 text-sm p-3 pr-20 focus:outline-none resize-none"
					/>
					<div className="absolute right-2 bottom-2 flex items-center gap-2">
						<div className="flex items-center px-2 py-1 bg-neutral-700 rounded-lg border border-neutral-600">
							<LogoNaked className="w-3 h-3 mr-1.5 text-green-500 rotate-90" />
							<span className="text-xs text-neutral-300 font-medium">
								{getCreditsForType()}
							</span>
						</div>
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
			<div className={`relative group transition-all ${selected ? 'ring-2 ring-neutral-400/30 rounded-2xl' : ''}`} style={{ width: 140, height: 233 }}>
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
		<div className={`group relative bg-[#202123] border border-neutral-700 rounded-2xl shadow-lg transition-all text-neutral-200 ${selected ? 'ring-1 ring-green-500/30 border-green-500' : 'border-neutral-700'}`} style={{ width: 340 }}>
			<div className="p-4 space-y-3">
				<div className="flex justify-between items-center text-xs font-medium text-neutral-400 px-1">
					<span>VIDEO 1</span>
					<span>UPLOAD</span>
				</div>
				<div className="bg-neutral-800/50 p-2 rounded-lg text-sm flex items-center gap-2 text-neutral-300">
					<Info size={16} /> Learn about Video Blocks
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

// Image Upload Component - Standardized design
const ImageUpload = React.memo(({ data, selected, id, onUpdateNode }) => {
	const [imageUrl, setImageUrl] = useState(data.imageUrl || null);
	const fileInputRef = useRef(null);
	const [openDropdown, setOpenDropdown] = useState(null);
	const [aspectRatio, setAspectRatio] = useState('1:1');
	const [model, setModel] = useState('flux_dev');

	const handleDropdownToggle = (dropdownId) => {
		setOpenDropdown(prev => (prev === dropdownId ? null : dropdownId));
	};

	// Update local state when data changes
	React.useEffect(() => {
		if (data.imageUrl !== imageUrl) {
			setImageUrl(data.imageUrl);
		}
	}, [data.imageUrl, imageUrl]);

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

	// If an image is uploaded, show the compact preview
	if (imageUrl) {
		return (
			<div className={`relative group transition-all ${selected ? 'ring-2 ring-neutral-400/30 rounded-2xl' : ''}`} style={{ width: 140, height: 233 }}>
				{selected && (
					<div className="absolute -top-6 left-0 text-xs text-neutral-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
						Image Upload
					</div>
				)}
				<div className="relative w-full h-full">
					<img 
						src={imageUrl} 
						alt="Uploaded" 
						className="w-full h-full object-cover rounded-2xl shadow-xl border border-neutral-700/50"
					/>
					<button
						onClick={() => fileInputRef.current?.click()}
						className="absolute top-2 right-2 w-7 h-7 bg-black/60 backdrop-blur-sm text-white rounded-full flex items-center justify-center shadow-lg hover:bg-black/80 opacity-0 group-hover:opacity-100 transition-all duration-200"
					>
						<PencilSimple size={14} />
					</button>
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
	}

	// Initial state with standardized design
	return (
		<div className={`group relative bg-[#202123] border border-neutral-700 rounded-2xl shadow-lg transition-all text-neutral-200 ${selected ? 'ring-1 ring-green-500/30 border-green-500' : 'border-neutral-700'}`} style={{ width: 340 }}>
			{/* Dropdowns on hover */}
			<div className={`absolute -top-12 left-1/2 -translate-x-1/2 flex flex-wrap gap-1 z-10 w-full transition-opacity opacity-0 group-hover:opacity-100 justify-center`}>
				<CustomDropdown
					value={aspectRatio}
					onChange={setAspectRatio}
					options={[{ value: '1:1', label: '1:1' }, { value: '16:9', label: '16:9' }]}
					isOpen={openDropdown === 'aspect'}
					onToggle={() => handleDropdownToggle('aspect')}
					minWidth="80px"
				/>
				<CustomDropdown
					value={model}
					onChange={setModel}
					options={[{ value: 'flux_dev', label: 'Flux Dev' }, { value: 'flux_pro', label: 'Flux Pro' }]}
					isOpen={openDropdown === 'model'}
					onToggle={() => handleDropdownToggle('model')}
					minWidth="120px"
				/>
			</div>

			{/* Node content */}
			<div className="p-4 space-y-3">
				<div className="flex justify-between items-center text-xs font-medium text-neutral-400 px-1">
					<span>IMAGE 3</span>
					<span>FLUX DEV</span>
				</div>
				<div className="bg-neutral-800/50 p-2 rounded-lg text-sm flex items-center gap-2 text-neutral-300">
					<Info size={16} /> Learn about Image Blocks
				</div>
				<div className="space-y-1 text-sm pt-2">
					<p className="text-neutral-500 px-2 pb-1">Try to...</p>
					<button onClick={() => fileInputRef.current?.click()} className="w-full text-left flex items-center gap-3 hover:bg-neutral-700/50 p-2 rounded-lg transition-colors">
						<Upload size={16} /> Upload an image
					</button>
					<div className="w-full text-left flex items-center gap-3 p-2 rounded-lg text-neutral-300">
						<GitMerge size={16} /> Combine images into a video
					</div>
					<div className="w-full text-left flex items-center gap-3 p-2 rounded-lg text-neutral-300">
						<VideoCamera size={16} /> Turn an image into a video
					</div>
					<div className="w-full text-left flex items-center gap-3 p-2 rounded-lg text-neutral-300">
						<Question size={16} /> Ask a question about an image
					</div>
				</div>
				<div className="relative bg-neutral-800/50 rounded-lg">
					<p className="text-neutral-400 text-sm p-3 pr-20">Try "A colorful abstract pattern with splashes of paint"</p>
					<div className="absolute right-2 bottom-2 flex items-center gap-2">
						 <span className="bg-black/50 text-xs font-bold rounded-full px-2 py-1">1×</span>
						 <button 
							onClick={() => fileInputRef.current?.click()}
							className="bg-white text-black rounded-full w-8 h-8 flex items-center justify-center hover:bg-neutral-200 transition-colors"
						>
							 <ArrowUp size={16} weight="bold" />
						 </button>
					</div>
				</div>
			</div>

			<Handle type="source" position={Position.Right} className="!w-4 !h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
			<Handle type="target" position={Position.Left} className="!w-4 !h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
			 <input
				ref={fileInputRef}
				type="file"
				accept="image/*"
				onChange={(e) => handleImageUpload(e.target.files[0])}
				className="hidden"
			/>
		</div>
	)
});

// Main Slideshow Node for configuration - Standardized design
const SlideshowNode = React.memo(({ id, data, onUpdateNode, onGenerate, onNodeDrop }) => {
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
			onDrop={handleDrop}
			onDragOver={handleDragOver}
			className={`group relative bg-[#202123] border border-neutral-700 rounded-2xl shadow-lg transition-all text-neutral-200 ${data.isSelected ? 'ring-1 ring-green-500/30 border-green-500' : 'border-neutral-700'}`} style={{ width: 340 }}>
			
			{/* Dropdowns on hover */}
			<div className={`absolute -top-12 left-1/2 -translate-x-1/2 flex flex-wrap gap-1 z-10 w-full transition-opacity ${
				hasProductConnection || hasImageConnection
					? 'opacity-100' 
					: 'opacity-0 group-hover:opacity-100'
			} justify-center`}>
				<CustomDropdown
					value={slideshowType}
					onChange={setSlideshowType}
					options={data.slideshowTypeOptions || []}
					isOpen={openDropdown === 'type'}
					onToggle={() => handleDropdownToggle('type')}
					minWidth="120px"
				/>
				<CustomDropdown
					value={language}
					onChange={setLanguage}
					options={data.languageOptions || []}
					isOpen={openDropdown === 'lang'}
					onToggle={() => handleDropdownToggle('lang')}
					minWidth="100px"
				/>
			</div>

			{/* Node content */}
			<div className="p-4 space-y-3">
				<div className="flex justify-between items-center text-xs font-medium text-neutral-400 px-1">
					<span>SLIDESHOW 1</span>
					<span>AI GEN</span>
				</div>
				
				<div className="bg-neutral-800/50 p-2 rounded-lg text-sm flex items-center gap-2 text-neutral-300">
					<Info size={16} /> Learn about Slideshow Blocks
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
							<LogoNaked className="w-3 h-3 mr-1.5 text-green-500 rotate-90" />
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

			<Handle type="target" position={Position.Left} className="!w-4 !h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
			<Handle type="source" position={Position.Right} className="!w-4 !h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
		</div>
	);
});

const GeneratedFrame = ({ data }) => {
	const { imageUrl, prompt, settings } = data;

	return (
		<div 
			className="group bg-neutral-800 rounded-2xl border-2 border-neutral-700 shadow-xl w-full h-full flex flex-col p-2"
			style={{ width: '200px', height: '260px' }}
		>
			<Handle type="target" position={Position.Top} className="!bg-neutral-600 w-3 h-3 rounded-full border-2 border-neutral-800 opacity-0 group-hover:opacity-100 transition-opacity" />
			<div className="relative w-full aspect-auto rounded-lg overflow-hidden bg-neutral-900 flex-grow">
				{imageUrl ? (
					<img src={imageUrl} alt={prompt || 'Generated image'} className="w-full h-full object-contain" />
				) : (
					<div className="w-full h-full flex items-center justify-center text-neutral-500">
						<Sparkle size={32} />
					</div>
				)}
			</div>
			{prompt && (
				<p className="text-xs text-neutral-400 mt-2 p-1 truncate" title={prompt}>{prompt}</p>
			)}
			<Handle type="source" position={Position.Bottom} className="!bg-neutral-600 w-3 h-3 rounded-full border-2 border-neutral-800 opacity-0 group-hover:opacity-100 transition-opacity" />
		</div>
	);
};

// Slideshow Result Node - Shows generated slideshow content
const SlideshowResultNode = React.memo(({ data }) => {
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
		<div className="w-[280px] text-white font-sans relative group">
			<Handle type="target" position={Position.Left} className="!bg-neutral-600 !w-3 !h-3 !top-1/2 opacity-0 group-hover:opacity-100 transition-opacity" />
			<Handle type="source" position={Position.Right} className="!bg-neutral-600 !w-3 !h-3 !top-1/2 opacity-0 group-hover:opacity-100 transition-opacity" />
			
			{/* Title above the frame */}
			<div className="mb-3 flex items-center gap-3 px-2">
				<div className="p-2 bg-green-600/20 border border-green-500/30 rounded-lg">
					<Slideshow size={16} className="text-green-400" />
				</div>
				<div>
					<div className="font-bold text-sm text-neutral-100">{data.label || 'Generated Slideshow'}</div>
					<div className="text-xs text-neutral-400">
						Generated at {new Date(data.generatedAt).toLocaleTimeString()}
					</div>
				</div>
			</div>

			{/* Frame container */}
			<div className="bg-gradient-to-br from-neutral-800 to-neutral-900 border-2 border-green-500/60 rounded-3xl shadow-2xl overflow-hidden relative">
				{/* Frame inner shadow */}
				<div className="absolute inset-0 rounded-3xl shadow-inner pointer-events-none" style={{
					boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)'
				}}></div>
				
				{/* Frame glow effect */}
				<div className="absolute -inset-1 bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-3xl blur-sm -z-10"></div>

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
											? 'bg-green-400 scale-125 shadow-lg shadow-green-400/50' 
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

const CanvasWorkspace = () => {
	const { user, setCanvasStatus } = useOutletContext() || {};
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
	const [draggedNode, setDraggedNode] = useState(null); // Track the node being dragged
	const draggedNodeIdRef = useRef(null);
	
	// NEW: State for assets
	const [backgrounds, setBackgrounds] = useState([]);
	const [creators, setCreators] = useState([]);
	const [products, setProducts] = useState([]);
	const [isLoadingAssets, setIsLoadingAssets] = useState(true);

	const [localProducts, setLocalProducts] = useState([]);
	const [videos, setVideos] = useState([]);
	const [generatedContent, setGeneratedContent] = useState([]);

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

	// NEW: useEffect to fetch data from Firestore
	useEffect(() => {
		if (!user || !user.uid) {
			setIsLoadingAssets(false);
			setProducts([]);
			setCreators([]);
			setBackgrounds([]);
			return;
		}

		setIsLoadingAssets(true);
		console.log(`[CanvasWorkspace] Fetching assets for user ${user.uid}`);

		const subscriptions = [];
		
		// Fetch Products
		try {
			const productsQuery = query(collection(db, 'users', user.uid, 'products'), orderBy('createdAt', 'desc'));
			const productsUnsub = onSnapshot(productsQuery, (snapshot) => {
				const productList = snapshot.docs.map(doc => ({
					id: doc.id,
					...doc.data(),
				}));
				setProducts(productList);
				console.log(`[CanvasWorkspace] Fetched ${productList.length} products.`);
			}, (error) => {
				console.error("[CanvasWorkspace] Error fetching products:", error);
				setProducts([]);
			});
			subscriptions.push(productsUnsub);
		} catch (error) {
			console.error("[CanvasWorkspace] Error setting up product subscription:", error);
		}

		// Fetch Creators
		try {
			const creatorsQuery = query(collection(db, 'users', user.uid, 'creators'), orderBy('createdAt', 'desc'));
			const creatorsUnsub = onSnapshot(creatorsQuery, (snapshot) => {
				const creatorList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
				setCreators(creatorList);
				console.log(`[CanvasWorkspace] Fetched ${creatorList.length} creators.`);
			}, (error) => {
				console.error("[CanvasWorkspace] Error fetching creators:", error);
				setCreators([]);
			});
			subscriptions.push(creatorsUnsub);
		} catch (error) {
			console.error("[CanvasWorkspace] Error setting up creator subscription:", error);
		}

		// Fetch Backgrounds
		try {
			const backgroundsQuery = query(collection(db, 'users', user.uid, 'backgrounds'), orderBy('createdAt', 'desc'));
			const backgroundsUnsub = onSnapshot(backgroundsQuery, (snapshot) => {
				const backgroundList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
				setBackgrounds(backgroundList);
				console.log(`[CanvasWorkspace] Fetched ${backgroundList.length} backgrounds.`);
			}, (error) => {
				console.error("[CanvasWorkspace] Error fetching backgrounds:", error);
				setBackgrounds([]);
			});
			subscriptions.push(backgroundsUnsub);
		} catch (error) {
			console.error("[CanvasWorkspace] Error setting up background subscription:", error);
		}

		setIsLoadingAssets(false); // Set to false after setting up listeners

		// Cleanup subscriptions on unmount
		return () => {
			console.log("[CanvasWorkspace] Cleaning up asset subscriptions.");
			subscriptions.forEach(unsub => unsub());
		};
	}, [user]);

	const assetData = {
		backgrounds,
		creators,
		products,
	};

	const assetMenuIcons = {
		backgrounds: Mountains,
		creators: Users,
		products: Package
	};

	const handleAssetMenuClick = (panel) => {
		setActiveAssetPanel(prev => prev === panel ? null : panel);
	};

	const onAssetDragStart = (event, assetType, asset) => {
		event.dataTransfer.setData('application/lungo-asset', JSON.stringify({ ...asset, assetType }));
		event.dataTransfer.effectAllowed = 'copy';
	};

	const transferContent = useCallback((sourceNode, targetNode) => {
		if (!sourceNode || !targetNode) return;
	
		// Use a local copy of nodes for accurate data
		const allNodes = reactFlowInstance.getNodes();
		const source = allNodes.find(n => n.id === sourceNode.id);
		const target = allNodes.find(n => n.id === targetNode.id);
	
		if (!source || !target) return;
	
		const sourceHasMedia = source.data.imageUrl || source.data.videoUrl;
		const targetAcceptsMedia = ['image', 'video', 'slideshow', 'aiFrame'].includes(target.type);
	
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

	const onNodeDragStart = useCallback((_, node) => {
        draggedNodeIdRef.current = node.id;
    }, []);

    const onNodeDragStop = useCallback(() => {
        draggedNodeIdRef.current = null;
    }, []);

	const handleNodeDrop = useCallback((event, targetNode) => {
        const sourceNodeId = draggedNodeIdRef.current;
        const targetNodeId = targetNode.id;

        if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) {
            return;
        }

        const sourceNode = reactFlowInstance.getNode(sourceNodeId);
        if (!sourceNode) return;
        
        // Use a local copy of nodes for accurate data
        const allNodes = reactFlowInstance.getNodes();
        const target = allNodes.find(n => n.id === targetNodeId);
        if (!target) return;

        const allEdges = reactFlowInstance.getEdges();
        const edgeExists = allEdges.some(
            (edge) =>
                (edge.source === sourceNodeId && edge.target === targetNodeId) ||
                (edge.source === targetNodeId && edge.target === sourceNodeId)
        );

        if (!edgeExists) {
            const newEdge = {
                id: `e-${sourceNodeId}-${targetNodeId}`,
                source: sourceNodeId,
                target: targetNodeId,
                markerEnd: { type: MarkerType.ArrowClosed, color: '#4ade80' },
                style: { stroke: 'rgba(74, 222, 128, 0.4)', strokeWidth: 2 },
            };
            setEdges((eds) => addEdge(newEdge, eds));
            transferContent(sourceNode, target);
        }

    }, [reactFlowInstance, setEdges, transferContent]);

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
		if (window.confirm('Are you sure you want to clear the entire canvas? This action cannot be undone.')) {
			setNodes([]);
			setEdges([]);
			localStorage.removeItem('lungoai-canvas-state');
			setLastSaved(null);
		}
	}, []);

	const handleGenerate = useCallback((sourceNodeId, generationData) => {

		const timestamp = Date.now();
		const newNodeId = `gen-${timestamp}`;
		const newEdgeId = `e-${sourceNodeId}-${newNodeId}`;

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
						imageUrl: generationData.imageUrl,
						videoUrl: generationData.videoUrl,
						prompt: generationData.prompt,
						type: generationData.type,
						generatedAt: timestamp,
					},
				};
			}

			return [...currentNodes, newNode];
		});

		setEdges((currentEdges) => {
			const newEdge = {
				id: newEdgeId,
				source: sourceNodeId,
				target: newNodeId,
				markerEnd: { type: MarkerType.ArrowClosed, color: '#4ade80' },
				style: { stroke: 'rgba(74, 222, 128, 0.4)', strokeWidth: 2 },
			};
			return addEdge(newEdge, currentEdges);
		});
	}, []);

	const onSelectionChange = useCallback(({ nodes: selectedNodes, edges: selectedEdges }) => {
		setEdges(eds =>
			eds.map(edge => {
				const isSelected = selectedEdges.some(se => se.id === edge.id) ||
								 selectedNodes.some(sn => sn.id === edge.source || sn.id === edge.target);
				return {
					...edge,
					style: {
						...edge.style,
						stroke: isSelected ? '#4ade80' : 'rgba(74, 222, 128, 0.4)',
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
		(changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
		[setEdges]
	);

	const onConnect = useCallback(
		(connection) => {
			const newEdge = {
				...connection,
				markerEnd: { type: MarkerType.ArrowClosed, color: '#4ade80' },
				style: { stroke: 'rgba(74, 222, 128, 0.4)', strokeWidth: 2 },
			};
			setEdges((eds) => addEdge(newEdge, eds));
			
			// Also transfer content on manual connection
			const sourceNode = reactFlowInstance.getNode(connection.source);
			const targetNode = reactFlowInstance.getNode(connection.target);
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

	const nodeTypes = useMemo(
		() => createNodeTypes(updateNodeData, addNodeToCanvas, handleGenerate, handleNodeDrop),
		[updateNodeData, addNodeToCanvas, handleGenerate, handleNodeDrop]
	);

	// Event handlers for right-click and double-click menus
	const onPaneClick = useCallback((event) => {
		// Check for double click
		if (event.detail === 2) {
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
		} else {
			setMenu(null);
			setDeleteMenu(null);
		}
	}, [reactFlowInstance]);

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
				backgrounds: backgrounds || []
			};
		} else if (type === 'image') {
			newNode.data.type = 'image';
		}

		setNodes((nds) => nds.concat(newNode));
		setMenu(null);
	}, [menu, backgrounds]);

	const handleDeleteNode = useCallback(() => {
		if (!deleteMenu) return;

		setNodes((nds) => nds.filter(node => node.id !== deleteMenu.nodeId));
		setEdges((eds) => eds.filter(edge => 
			edge.source !== deleteMenu.nodeId && edge.target !== deleteMenu.nodeId
		));
		setDeleteMenu(null);
	}, [deleteMenu]);





	// ... rest of CanvasWorkspace

	return (
		<div 
			className="w-full h-screen relative" 
			ref={reactFlowWrapper}
		>


			<ReactFlow
				nodes={nodes}
				edges={edges}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				onConnect={onConnect}
				onInit={setReactFlowInstance}
				onNodeDragStart={onNodeDragStart}
				onNodeDragStop={onNodeDragStop}
				onSelectionChange={onSelectionChange}
				nodeTypes={nodeTypes}
				onPaneClick={onPaneClick}
				onPaneContextMenu={onPaneContextMenu}
				onNodeContextMenu={onNodeContextMenu}
				className="bg-neutral-900"
				style={{ width: '100%', height: '100vh' }}
				zoomOnScroll={true}
				zoomOnPinch={true}
				panOnScroll={false}
				selectionOnDrag={true}
				panOnDrag={true}
				selectionKeyCode={null}
				minZoom={0.1}
				snapToGrid={true}
				snapGrid={[24, 24]}
				proOptions={{ hideAttribution: true }}
			>
				<Background variant="dots" gap={24} size={1} color="#404040" />
			</ReactFlow>

			{/* Right-click/Double-click menu for creating nodes */}
			{menu && (
				<div
					className="fixed z-50 bg-neutral-800 border border-neutral-700 rounded-xl shadow-2xl py-2 min-w-48"
					style={{ left: menu.x, top: menu.y }}
				>
					<div className="px-3 py-2 text-xs font-medium text-neutral-400 border-b border-neutral-700">
						Add Node
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
		</div>
	);
};

export default CanvasWorkspace;
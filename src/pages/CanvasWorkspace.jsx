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
	ListNumbers,
	ArrowsClockwise,
} from '@phosphor-icons/react';
import { generateImage, generateVideo, checkApiKey, GENERATION_TYPES, IMAGE_STYLES, QUALITY_OPTIONS } from '../services/ai';
import { useOutletContext } from 'react-router-dom';
import { db, functions } from '../firebase';
import { collection, query, onSnapshot, orderBy, doc, getDoc, setDoc, getDocs, limit } from 'firebase/firestore';
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
				<div className="w-full h-full border-t-2 border-l-2 border-neutral-500 rounded-tl-xl"></div>
			</div>
			<div className="absolute bottom-2 right-2 w-8 h-8 pointer-events-none z-10">
				<div className="w-full h-full border-b-2 border-r-2 border-neutral-500 rounded-br-xl"></div>
			</div>

			{/* Inner frame */}
			<div className="bg-neutral-900 rounded-xl shadow-lg w-full h-full">
				{children}
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
					opacity: showHandles ? 1 : 0,
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
					border: '3px solid white',
					borderRadius: '50%',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					fontSize: '18px',
					fontWeight: 'bold',
					color: 'white',
					right: '-19px',
					opacity: showHandles ? 1 : 0,
					transition: 'opacity 0.2s ease'
				}}
			>
				<Asterisk size={16} weight="bold" />
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
		id: 'empty_highway_fashion',
		name: 'Highway Fashion Shot',
		description: 'Smartphone selfie in car with natural daylight',
		exampleImage: 'https://images.unsplash.com/photo-1494790108755-2616c96bb4de?w=400&h=300&fit=crop&crop=face',
		rules: 'empty_highway_fashion',
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
		id: 'forced_perspective_play',
		name: 'Forced Perspective Play',
		description: 'Wide-angle street photography with playful scale',
		exampleImage: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=300&fit=crop&crop=face',
		rules: 'forced_perspective_play',
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
		id: '90s_vintage_buddy',
		name: '90s Vintage Buddy Vibes',
		description: 'Analog film aesthetic with friends',
		exampleImage: 'https://images.unsplash.com/photo-1503023345310-bd7c1de61c7d?w=400&h=300&fit=crop&crop=face',
		rules: '90s_vintage_buddy',
		type: 'ugc_character'
	},
	// New frames added
	{
		id: 'fish_eye_selfie_urban',
		name: 'Urban Fisheye Selfie Drama',
		description: 'Bold fisheye lens selfies with urban backgrounds',
		exampleImage: 'https://images.unsplash.com/photo-1606836591695-4d58a1b0eba9?w=400&h=300&fit=crop&crop=face',
		rules: 'fish_eye_selfie_urban',
		type: 'ugc_character'
	},
	{
		id: 'y2k_flash_pop',
		name: 'Y2K Flash Pop Street Portrait',
		description: 'Early 2000s digital camera flash photography',
		exampleImage: 'https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?w=400&h=300&fit=crop&crop=face',
		rules: 'y2k_flash_pop',
		type: 'ugc_character'
	},
	{
		id: 'elevator_mirror_selfie',
		name: 'Elevator Mirror Flex',
		description: 'Mirror selfies in elevators with metallic backgrounds',
		exampleImage: 'https://images.unsplash.com/photo-1615887023516-86caaa4c5a5a?w=400&h=300&fit=crop&crop=face',
		rules: 'elevator_mirror_selfie',
		type: 'ugc_character'
	},
	{
		id: 'yum_moment_diaries',
		name: 'Yum Moment Diaries',
		description: 'Capturing joyful eating moments in cozy settings',
		exampleImage: 'https://images.unsplash.com/photo-1544681280-f2803650ee5d?w=400&h=300&fit=crop&crop=face',
		rules: 'yum_moment_diaries',
		type: 'ugc_character'
	},
	{
		id: 'selfcare_bliss_aesthetic',
		name: 'Selfcare Bliss Aesthetic',
		description: 'Relaxing self-care moments with skincare and cozy vibes',
		exampleImage: 'https://images.unsplash.com/photo-1570554886111-e80fcca6a029?w=400&h=300&fit=crop&crop=face',
		rules: 'selfcare_bliss_aesthetic',
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
				commandCode: 201,
				models: {
					'black-forest-labs/flux-kontext-max': {
						label: 'Flux Kontext Max',
						icon: Lightning,
						subtitle: 'High quality image generation',
						credits: 2,
						params: ['prompt', 'image'],
						options: {
							aspect_ratio: ['1:1', '3:4', '4:3', '9:16', '16:9']
						}
					},
					'black-forest-labs/flux-kontext-pro': {
						label: 'Flux Kontext Pro',
						icon: Lightning,
						subtitle: 'Professional image generation',
						credits: 1,
						params: ['prompt', 'image'],
						options: {
							aspect_ratio: ['1:1', '3:4', '4:3', '9:16', '16:9']
						}
					},
					'google/imagen-4': {
						label: 'Google Imagen 4',
						icon: Lightning,
						subtitle: 'Google\'s latest image AI',
						credits: 1,
						params: ['prompt'],
						options: {
							aspect_ratio: ['1:1', '9:16', '16:9', '3:4', '4:3']
						}
					},
					'google/imagen-4-ultra': {
						label: 'Google Imagen 4 Ultra',
						icon: Sparkle,
						subtitle: 'Ultra high quality images',
						credits: 2,
						params: ['prompt'],
						options: {
							aspect_ratio: ['1:1', '9:16', '16:9', '3:4', '4:3']
						}
					},
					'ideogram-ai/ideogram-v3-quality': {
						label: 'Ideogram V3 Quality',
						icon: Image,
						subtitle: 'Quality focused generation',
						credits: 3,
						params: ['prompt', 'image'],
						options: {
							aspect_ratio: ['1:1', '3:4', '4:3', '9:16', '16:9']
						}
					}
				}
			},
			// UGC Character with frame selection
			ugc_character: {
				label: 'UGC Character',
				icon: Smiley,
				subtitle: 'Generate realistic person images with style frames',
				commandCode: 202,
				models: {
					'black-forest-labs/flux-kontext-max': {
						label: 'Flux Kontext Max',
						icon: Lightning,
						subtitle: 'High quality image generation',
						credits: 2,
						params: ['prompt', 'image'],
						options: {
							aspect_ratio: ['1:1', '3:4', '4:3', '9:16', '16:9']
						}
					},
					'black-forest-labs/flux-kontext-pro': {
						label: 'Flux Kontext Pro',
						icon: Lightning,
						subtitle: 'Professional image generation',
						credits: 1,
						params: ['prompt', 'image'],
						options: {
							aspect_ratio: ['1:1', '3:4', '4:3', '9:16', '16:9']
						}
					},
					'google/imagen-4': {
						label: 'Google Imagen 4',
						icon: Lightning,
						subtitle: 'Google\'s latest image AI',
						credits: 1,
						params: ['prompt'],
						options: {
							aspect_ratio: ['1:1', '9:16', '16:9', '3:4', '4:3']
						}
					},
					'google/imagen-4-ultra': {
						label: 'Google Imagen 4 Ultra',
						icon: Sparkle,
						subtitle: 'Ultra high quality images',
						credits: 2,
						params: ['prompt'],
						options: {
							aspect_ratio: ['1:1', '9:16', '16:9', '3:4', '4:3']
						}
					},
					'ideogram-ai/ideogram-v3-quality': {
						label: 'Ideogram V3 Quality',
						icon: Image,
						subtitle: 'Quality focused generation',
						credits: 3,
						params: ['prompt', 'image'],
						options: {
							aspect_ratio: ['1:1', '3:4', '4:3', '9:16', '16:9']
						}
					}
				}
			},
			// General image
			general: {
				label: 'General Image',
				icon: Image,
				subtitle: 'Generate any type of image',
				commandCode: 203,
				models: {
					'black-forest-labs/flux-kontext-max': {
						label: 'Flux Kontext Max',
						icon: Lightning,
						subtitle: 'High quality image generation',
						credits: 2,
						params: ['prompt', 'image'],
						options: {
							aspect_ratio: ['1:1', '3:4', '4:3', '9:16', '16:9']
						}
					},
					'black-forest-labs/flux-kontext-pro': {
						label: 'Flux Kontext Pro',
						icon: Lightning,
						subtitle: 'Professional image generation',
						credits: 1,
						params: ['prompt', 'image'],
						options: {
							aspect_ratio: ['1:1', '3:4', '4:3', '9:16', '16:9']
						}
					},
					'google/imagen-4': {
						label: 'Google Imagen 4',
						icon: Lightning,
						subtitle: 'Google\'s latest image AI',
						credits: 1,
						params: ['prompt'],
						options: {
							aspect_ratio: ['1:1', '9:16', '16:9', '3:4', '4:3']
						}
					},
					'google/imagen-4-ultra': {
						label: 'Google Imagen 4 Ultra',
						icon: Sparkle,
						subtitle: 'Ultra high quality images',
						credits: 2,
						params: ['prompt'],
						options: {
							aspect_ratio: ['1:1', '9:16', '16:9', '3:4', '4:3']
						}
					},
					'ideogram-ai/ideogram-v3-quality': {
						label: 'Ideogram V3 Quality',
						icon: Image,
						subtitle: 'Quality focused generation',
						credits: 3,
						params: ['prompt', 'image'],
						options: {
							aspect_ratio: ['1:1', '3:4', '4:3', '9:16', '16:9']
						}
					}
				}
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
					'google/veo-3-fast': { 
						label: 'Google Veo 3 Fast', 
						icon: Lightning, 
						subtitle: 'Fast video generation', 
						credits: 60,
						params: ['prompt', 'negative_prompt'],
						options: {
							duration: [3, 5],
							aspect_ratio: ['9:16', '16:9', '1:1']
						}
					},
					'google/veo-3': { 
						label: 'Google Veo 3', 
						icon: Lightning, 
						subtitle: 'Google\'s latest video AI', 
						credits: 100,
						params: ['prompt', 'negative_prompt'],
						options: {
							duration: [3, 5],
							aspect_ratio: ['9:16', '16:9', '1:1']
						}
					},
					'google/veo-2': { 
						label: 'Google Veo 2', 
						icon: Lightning, 
						subtitle: '10 credits per second', 
						credits: 'dynamic',
						params: ['image_input', 'aspect_ratio', 'duration'],
						options: {
							aspect_ratio: ['9:16', '16:9'],
							duration: [5, 6, 7, 8]
						}
					},
					'bytedance/seedance-1-pro': { 
						label: 'ByteDance SeeDance Pro', 
						icon: Sparkle, 
						subtitle: '1-3 credits per second', 
						credits: 2,
						params: ['prompt', 'image', 'duration', 'resolution', 'aspect_ratio', 'camera_fixed'],
						options: {
							duration: [5, 10],
							resolution: ['480p', '1080p'],
							aspect_ratio: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', '9:21'],
							camera_fixed: [true, false]
						}
					},
					'kwaivgi/kling-v2.1': { 
						label: 'KwaiVGI Kling v2.1', 
						icon: VideoCamera, 
						subtitle: '1-2 credits per second', 
						credits: 60,
						params: ['prompt', 'negative_prompt', 'start_image', 'mode', 'duration'],
						options: {
							mode: ['standard', 'pro'],
							duration: [5, 10]
						}
					},
					'minimax/hailuo-02': { 
						label: 'MiniMax Hailuo 02', 
						icon: Play, 
						subtitle: '1-2 credits per second', 
						credits: 'dynamic',
						params: ['prompt', 'first_frame_image', 'duration', 'resolution', 'prompt_optimizer'],
						options: {
							duration: [6, 10],
							resolution: ['768p', '1080p'],
							prompt_optimizer: [true, false]
						}
					}
				}
			},
			text_to_video: {
				label: 'Text to Video',
				icon: PencilSimple,
				subtitle: 'From a prompt',
				models: {
					'google/veo-3-fast': { 
						label: 'Google Veo 3 Fast', 
						icon: Lightning, 
						subtitle: 'Fast video generation', 
						credits: 60,
						params: ['prompt', 'negative_prompt'],
						options: {
							duration: [3, 5],
							aspect_ratio: ['9:16', '16:9', '1:1']
						}
					},
					'google/veo-3': { 
						label: 'Google Veo 3', 
						icon: Lightning, 
						subtitle: 'Google\'s latest video AI', 
						credits: 100,
						params: ['prompt', 'negative_prompt'],
						options: {
							duration: [3, 5],
							aspect_ratio: ['9:16', '16:9', '1:1']
						}
					},
					'google/veo-2': { 
						label: 'Google Veo 2', 
						icon: Lightning, 
						subtitle: '10 credits per second', 
						credits: 'dynamic',
						params: ['aspect_ratio', 'duration'],
						options: {
							aspect_ratio: ['9:16', '16:9'],
							duration: [5, 6, 7, 8]
						}
					},
					'bytedance/seedance-1-pro': { 
						label: 'ByteDance SeeDance Pro', 
						icon: Sparkle, 
						subtitle: '1-3 credits per second', 
						credits: 2,
						params: ['prompt', 'duration', 'resolution', 'aspect_ratio', 'camera_fixed'],
						options: {
							duration: [5, 10],
							resolution: ['480p', '1080p'],
							aspect_ratio: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', '9:21'],
							camera_fixed: [true, false]
						}
					},
					'kwaivgi/kling-v2.1': { 
						label: 'KwaiVGI Kling v2.1', 
						icon: VideoCamera, 
						subtitle: '1-2 credits per second', 
						credits: 60,
						params: ['prompt', 'negative_prompt', 'mode', 'duration'],
						options: {
							mode: ['standard', 'pro'],
							duration: [5, 10]
						}
					},
					'minimax/hailuo-02': { 
						label: 'MiniMax Hailuo 02', 
						icon: Play, 
						subtitle: '1-2 credits per second', 
						credits: 'dynamic',
						params: ['prompt', 'duration', 'resolution', 'prompt_optimizer'],
						options: {
							duration: [6, 10],
							resolution: ['768p', '1080p'],
							prompt_optimizer: [true, false]
						}
					}
				}
			}
		},
		options: {
			duration: [
				{ value: 5, label: '5s', icon: Play, subtitle: 'Short', credits: 0 },
				{ value: 6, label: '6s', icon: Play, subtitle: 'Medium', credits: 25 },
				{ value: 7, label: '7s', icon: Play, subtitle: 'Medium+', credits: 50 },
				{ value: 8, label: '8s', icon: Play, subtitle: 'Long', credits: 75 },
				{ value: 10, label: '10s', icon: Play, subtitle: 'Extended', credits: 100 },
			]
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
	const [duration, setDuration] = useState(formData.duration || (data.type === 'video' ? 5 : 3));
	const [model, setModel] = useState(formData.model || (data.type === 'video' ? 'google/veo-3-fast' : 'google/imagen-4'));
	const [isDragOver, setIsDragOver] = useState(false);
	const [isConnectionDragOver, setIsConnectionDragOver] = useState(false);
	const { showHandles, handleMouseEnter, handleMouseLeave } = useHandleHover();

	// This effect syncs the component's internal state with props from the parent canvas.
	// It's crucial for when data is loaded or updated externally, preventing "stale state".
	useEffect(() => {
		if (formData) {
			setSubtype(formData.subtype || (data.type === 'image' ? 'general' : 'text_to_video'));
			setSelectedFrame(formData.selectedFrame || null);
			setDuration(formData.duration || 3);
			setModel(formData.model || 'google/imagen-4');
			// We intentionally don't sync `prompt` here to avoid cursor jumps and conflicts while typing.
		}
	}, [formData.subtype, formData.selectedFrame, formData.duration, formData.model, data.type]);

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
		
		return options;
	}, []);

	// Available AI models for image generation
	const imageModelOptions = [
		{ 
			id: 'google/imagen-4', 
			name: 'Google Imagen 4', 
			icon: <Sparkle size={16} />, 
			subtitle: 'Photorealistic, high quality' 
		},
		{ 
			id: 'ideogram-ai/ideogram-v3-quality', 
			name: 'Ideogram v3 Quality', 
			icon: <PencilSimple size={16} />, 
			subtitle: 'Great for text in images' 
		}
	];

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
	const currentDropdownValue = selectedFrame || (subtype === 'background' ? 'background' : subtype);
	
	// Current dropdown value

	// Calculate node dimensions based on aspect ratio
	const getNodeDimensions = () => {
		const aspectRatio = formData?.aspect_ratio || '9:16';
		
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
				<div className="w-full h-full border-t-2 border-l-2 border-neutral-500 rounded-tl-[40px]"></div>
			</div>
			<div className="absolute bottom-0 right-0 w-12 h-12 pointer-events-none z-10">
				<div className="w-full h-full border-b-2 border-r-2 border-neutral-500 rounded-br-[40px]"></div>
			</div>

			{/* Media type label */}
			<div className="absolute -top-2 left-14 text-xs text-neutral-400 font-bold duration-200 z-10">
				{data.type === 'video' ? 'VIDEO GENERATION' : 'IMAGE GENERATION'}
			</div>

			{/* Inner frame */}
			<div className="bg-neutral-900 w-full h-full" style={{ borderRadius: '30px' }}>
				{/* Node content */}
				<div className="p-4 space-y-3 h-full flex flex-col">
				{/* Header */}
				<div className="flex justify-between items-center text-xs font-medium text-neutral-400 px-1">
					<span>{data.type.toUpperCase()}</span>
					<div className="flex items-center px-2 py-1 bg-neutral-700 rounded-lg border border-neutral-600">
						<LogoNaked className="w-3 h-3 mr-1.5 text-white rotate-90" />
						<span className="text-xs text-neutral-300 font-medium">
							{getCreditsForType()}
						</span>
					</div>
				</div>






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

				{/* Spacer */}
				<div className="flex-1"></div>

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
									{isGenerating ? (
					<div className="p-3">
						<div className="h-20 flex items-center justify-center bg-neutral-700/50 border border-neutral-600 rounded-lg">
							<div className="text-neutral-400 text-sm">Generating...</div>
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
									(isDragOver ? 'Drop image here...' : 'Describe the image you want to create or drag & drop an image...') :
									`Describe the ${data.type} you want to create...`
								}
								rows={3}
								className="w-full bg-transparent border-none text-neutral-400 text-sm p-3 pr-20 focus:outline-none resize-none"
							/>
							<div className="absolute right-2 bottom-2 flex items-center gap-2">
								<button
									onClick={handleGenerate}
									disabled={!prompt.trim() || isGenerating}
									className="bg-white text-black rounded-full w-8 h-8 flex items-center justify-center hover:bg-neutral-200 transition-colors disabled:bg-neutral-600 disabled:text-neutral-400"
								>
									<ArrowUp size={16} weight="bold" />
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
					<div className="w-full h-full border-t-2 border-l-2 border-neutral-500 rounded-tl-[60px]"></div>
				</div>
				
				{/* Media type label - right after L line */}
				<div className="absolute -top-1.5 left-14 text-xs text-neutral-400 font-bold duration-200 z-10">
					VIDEO UPLOAD
				</div>
				<div className="absolute bottom-0 right-0 w-12 h-12 pointer-events-none z-10">
					<div className="w-full h-full border-b-2 border-r-2 border-neutral-500 rounded-br-[60px]"></div>
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
					<div className="w-full h-full border-t-2 border-l-2 border-neutral-500 rounded-tl-[60px]"></div>
				</div>
				
				{/* Media type label - right after L line */}
				<div className="absolute -top-1.5 left-14 text-xs text-neutral-400 font-bold duration-200 z-10">
					VIDEO UPLOAD
				</div>
				<div className="absolute bottom-0 right-0 w-12 h-12 pointer-events-none z-10">
					<div className="w-full h-full border-b-2 border-r-2 border-neutral-500 rounded-br-[60px]"></div>
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
				{/* Corner lines - 100px */}
				<div className="absolute top-0 left-0 w-12 h-12 pointer-events-none z-10">
					<div className="w-full h-full border-t-2 border-l-2 border-neutral-500 rounded-tl-[60px]"></div>
				</div>
				
				{/* Media type label - right after L line */}
				<div className="absolute -top-1.5 left-14 text-xs text-neutral-400 font-bold duration-200 z-10">
					IMAGE UPLOAD
				</div>
				<div className="absolute bottom-0 right-0 w-12 h-12 pointer-events-none z-10">
					<div className="w-full h-full border-b-2 border-r-2 border-neutral-500 rounded-br-[60px]"></div>
				</div>

				<div className="h-full relative">
					<img 
						src={imageUrl} 
						alt="Uploaded" 
						className="w-full h-full object-cover"
						style={{ borderRadius: '40px' }}
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
		);
	}

	// Upload state
	return (
		<NodeWrapper 
			selected={selected} 
			width={imageWidth} 
			height={imageHeight}
			nodeType="IMAGE UPLOAD"
			onDragOver={handleConnectionDragOver}
			onDragLeave={handleConnectionDragLeave}
			onDrop={handleConnectionDrop}
			className={`cursor-pointer ${isConnectionDragOver ? 'ring-2 ring-lime-400/30 bg-lime-500/5' : ''}`}
		>
			<div 
				className="flex flex-col items-center justify-center h-full text-neutral-400 hover:bg-neutral-700/50 rounded-xl transition-colors"
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
		</NodeWrapper>
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
		const aspectRatio = formData?.aspect_ratio || '9:16';
		
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
						<div className="w-full h-full border-t-2 border-l-2 border-neutral-500 rounded-tl-[60px]"></div>
					</div>
					<div className="absolute bottom-0 right-0 w-12 h-12 pointer-events-none z-10">
						<div className="w-full h-full border-b-2 border-r-2 border-neutral-500 rounded-br-[60px]"></div>
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



// Generated Content Panel - Showcase generated content for reuse
const GeneratedContentPanel = ({ user, onDragStart }) => {
	const [generatedContent, setGeneratedContent] = useState({
		images: [],
		videos: []
	});
	const [activeTab, setActiveTab] = useState('images');
	const [isExpanded, setIsExpanded] = useState(false);
	const [isLoading, setIsLoading] = useState(false);

	// Fetch generated content from Firestore (using Dashboard's approach)
	useEffect(() => {
		if (!user?.uid) return;

		const fetchGeneratedContent = async () => {
			setIsLoading(true);
			try {
				// Fetch from 'generations' collection (images and slideshows)
				const generationsQuery = query(
					collection(db, 'users', user.uid, 'generations'),
					orderBy('timestamp', 'desc')
				);
				const generationsSnapshot = await getDocs(generationsQuery);

				// Process generations (images and slideshows)
				const generations = generationsSnapshot.docs.map(doc => {
					const data = doc.data();
					const timestamp = data.timestamp?.toDate?.() || data.timestamp || data.createdAt?.toDate?.() || new Date();
					return {
						id: doc.id,
						...data,
						timestamp,
						createdAt: timestamp
					};
				});

				// Separate content by type
				const images = generations.filter(item => 
					item.type === 'image' || (item.commandCode >= 200 && item.commandCode < 300)
				);
				const videos = generations.filter(item => 
					item.type === 'video'
				);

				setGeneratedContent({
					images,
					videos
				});
			} catch (error) {
				console.error('Error fetching generated content:', error);
			} finally {
				setIsLoading(false);
			}
		};

		fetchGeneratedContent();
	}, [user]);

	const handleDragStart = (e, content) => {
		e.dataTransfer.setData('text/plain', JSON.stringify(content));
		e.dataTransfer.effectAllowed = 'copy';
		
		if (onDragStart) {
			onDragStart(content);
		}
	};

	const tabs = [
		{ id: 'images', icon: Image, label: 'Images', count: generatedContent.images.length },
		{ id: 'videos', icon: VideoCamera, label: 'Videos', count: generatedContent.videos.length }
	];

	const currentContent = generatedContent[activeTab] || [];

	const formatDate = (date) => {
		if (!date) return 'Unknown';
		const now = new Date();
		const diff = now - date;
		const days = Math.floor(diff / (1000 * 60 * 60 * 24));
		const hours = Math.floor(diff / (1000 * 60 * 60));
		const minutes = Math.floor(diff / (1000 * 60));

		if (days > 0) return `${days}d ago`;
		if (hours > 0) return `${hours}h ago`;
		if (minutes > 0) return `${minutes}m ago`;
		return 'Just now';
	};

	return (
		<>
			{/* Main Panel */}
			<div className="fixed top-1/2 left-4 -translate-y-1/2 z-50">
				<div className={`bg-neutral-900/95 backdrop-blur-xl border border-neutral-700/50 rounded-2xl shadow-2xl transition-all duration-300 ease-out ${
					isExpanded ? 'w-80' : 'w-16'
				}`}>
					{/* Collapsed State - Icon Only */}
					{!isExpanded && (
						<div className="p-4 flex flex-col items-center">
							<button
								onClick={() => setIsExpanded(true)}
								className="p-3 rounded-xl bg-neutral-800/50 hover:bg-neutral-700/50 text-neutral-300 hover:text-white transition-all duration-200 group"
								title="Generated Content"
							>
								<div className="relative">
									<Sparkle size={20} className="group-hover:scale-110 transition-transform" />
									{(generatedContent.images.length + generatedContent.videos.length) > 0 && (
										<span className="absolute -top-2 -right-2 w-4 h-4 text-[10px] font-bold rounded-full bg-lime-500 text-black flex items-center justify-center">
											{generatedContent.images.length + generatedContent.videos.length}
										</span>
									)}
								</div>
							</button>
							<span className="text-xs text-neutral-500 mt-2 text-center leading-tight">
								My<br/>Content
							</span>
						</div>
					)}

					{/* Expanded State */}
					{isExpanded && (
						<div className="flex flex-col h-[500px]">
							{/* Header */}
							<div className="flex items-center justify-between p-4 border-b border-neutral-700/50">
								<div className="flex items-center gap-2">
									<Sparkle size={18} className="text-lime-500" />
									<span className="text-sm font-semibold text-white">Generated Content</span>
								</div>
								<button
									onClick={() => setIsExpanded(false)}
									className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
								>
									<X size={16} />
								</button>
							</div>

							{/* Tabs */}
							<div className="flex border-b border-neutral-700/50">
								{tabs.map((tab) => {
									const IconComponent = tab.icon;
									const isActive = activeTab === tab.id;
									
									return (
										<button
											key={tab.id}
											onClick={() => setActiveTab(tab.id)}
											className={`flex-1 flex items-center justify-center gap-2 p-3 text-sm font-medium transition-all duration-200 ${
												isActive 
													? 'text-lime-400 border-b-2 border-lime-400 bg-lime-500/5' 
													: 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
											}`}
										>
											<IconComponent size={16} />
											<span>{tab.label}</span>
											{tab.count > 0 && (
												<span className={`text-xs px-1.5 py-0.5 rounded-full ${
													isActive ? 'bg-lime-500 text-black' : 'bg-neutral-700 text-neutral-300'
												}`}>
													{tab.count}
												</span>
											)}
										</button>
									);
								})}
							</div>

							{/* Content Grid */}
							<div 
								className="flex-1 overflow-y-auto p-3"
								onWheel={(e) => e.stopPropagation()}
							>
								{isLoading ? (
									<div className="flex items-center justify-center h-full">
										<div className="animate-spin rounded-full h-8 w-8 border-2 border-lime-500 border-t-transparent"></div>
									</div>
								) : currentContent.length === 0 ? (
									<div className="text-center py-8 px-4">
										<div className="text-neutral-500 mb-3">
											{activeTab === 'images' ? <Image size={32} /> : <VideoCamera size={32} />}
										</div>
										<p className="text-sm text-neutral-400 mb-1">
											No {activeTab} generated yet
										</p>
										<p className="text-xs text-neutral-500">
											Generate some content to see it here
										</p>
									</div>
								) : (
									<div className="grid grid-cols-3 gap-2">
										{currentContent.map((content, index) => (
											<GeneratedContentItem
												key={content.id}
												content={content}
												index={index}
												activeTab={activeTab}
												handleDragStart={handleDragStart}
												formatDate={formatDate}
											/>
										))}
									</div>
								)}
							</div>

							{/* Footer Stats */}
							<div className="border-t border-neutral-700/50 p-3">
								<div className="flex items-center justify-between text-xs text-neutral-500">
									<span>Total: {generatedContent.images.length + generatedContent.videos.length}</span>
									<span>Drag to canvas to reuse</span>
								</div>
							</div>
						</div>
					)}
				</div>
			</div>
		</>
	);
};

// Generated Content Item with Hover Frame
const GeneratedContentItem = React.memo(({ content, index, activeTab, handleDragStart, formatDate }) => {
	const [showFrame, setShowFrame] = useState(false);
	const [framePrompt, setFramePrompt] = useState(content.prompt || '');
	const [frameType, setFrameType] = useState('image');
	const [frameRatio, setFrameRatio] = useState('9:16');
	const [frameModel, setFrameModel] = useState('google/imagen-3.0-generate-001');

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
			onMouseEnter={() => setShowFrame(true)}
			onMouseLeave={() => setShowFrame(false)}
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

// Floating Generation Panel Component
const FloatingGenerationPanel = ({ selectedNodes, onUpdateNode, onGenerate }) => {
	const [isVisible, setIsVisible] = useState(false);
	const [activeNode, setActiveNode] = useState(null);

	// All aspect ratio options
	const aspectRatios = [
		{ value: '1:1', label: '1:1', description: 'Square' },
		{ value: '4:3', label: '4:3', description: 'Standard' },
		{ value: '3:4', label: '3:4', description: 'Portrait' },
		{ value: '16:9', label: '16:9', description: 'Landscape' },
		{ value: '9:16', label: '9:16', description: 'Vertical' },
		{ value: '3:2', label: '3:2', description: 'Photo' },
		{ value: '2:3', label: '2:3', description: 'Photo Portrait' },
		{ value: '21:9', label: '21:9', description: 'Ultrawide' },
		{ value: '9:21', label: '9:21', description: 'Ultra Vertical' }
	];

	// Model options based on node type from actual functions/index.js implementation
	const getModelOptions = (nodeType, subtype = 'text_to_video') => {
		if (nodeType === 'image') {
			// Real image models from new configuration
			return [
				{ 
					value: 'black-forest-labs/flux-kontext-max', 
					label: 'Flux Kontext Max', 
					type: 'image', 
					subtitle: 'High quality image generation',
					credits: 120,
					params: ['prompt', 'image'],
					supportedOptions: ['aspect_ratio']
				},
				{ 
					value: 'black-forest-labs/flux-kontext-pro', 
					label: 'Flux Kontext Pro', 
					type: 'image', 
					subtitle: 'Professional image generation',
					credits: 100,
					params: ['prompt', 'image'],
					supportedOptions: ['aspect_ratio']
				},
				{ 
					value: 'google/imagen-4', 
					label: 'Google Imagen 4', 
					type: 'image', 
					subtitle: 'Google\'s latest image AI',
					credits: 80,
					params: ['prompt'],
					supportedOptions: ['aspect_ratio']
				},
				{ 
					value: 'google/imagen-4-ultra', 
					label: 'Google Imagen 4 Ultra', 
					type: 'image', 
					subtitle: 'Ultra high quality images',
					credits: 'dynamic',
					params: ['prompt'],
					supportedOptions: ['aspect_ratio']
				},
				{ 
					value: 'ideogram-ai/ideogram-v3-quality', 
					label: 'Ideogram V3 Quality', 
					type: 'image', 
					subtitle: 'Quality focused generation',
					credits: 90,
					params: ['prompt', 'image'],
					supportedOptions: ['aspect_ratio']
				}
			];
		} else if (nodeType === 'video') {
			// Real video models from functions/index.js
			return [
				{ 
					value: 'google/veo-3-fast', 
					label: 'Google Veo 3 Fast', 
					type: 'video', 
					subtitle: '60 credits per video',
					credits: 60,
					params: ['prompt', 'negative_prompt'],
					supportedOptions: ['duration', 'aspect_ratio']
				},
				{ 
					value: 'google/veo-3', 
					label: 'Google Veo 3', 
					type: 'video', 
					subtitle: '100 credits per video',
					credits: 100,
					params: ['prompt', 'negative_prompt'],
					supportedOptions: ['duration', 'aspect_ratio']
				},
				{ 
					value: 'google/veo-2', 
					label: 'Google Veo 2', 
					type: 'video', 
					subtitle: '10 credits per second',
					credits: 'dynamic',
					params: ['image_input', 'aspect_ratio', 'duration'],
					supportedOptions: ['aspect_ratio', 'duration']
				},
				{ 
					value: 'bytedance/seedance-1-pro', 
					label: 'ByteDance SeeDance Pro', 
					type: 'video', 
					subtitle: '1-3 credits per second',
					credits: 'dynamic',
					params: ['prompt', 'image', 'duration', 'resolution', 'aspect_ratio', 'camera_fixed'],
					supportedOptions: ['duration', 'resolution', 'aspect_ratio', 'camera_fixed']
				},
				{ 
					value: 'kwaivgi/kling-v2.1', 
					label: 'KwaiVGI Kling v2.1', 
					type: 'video', 
					subtitle: '1-2 credits per second',
					credits: 60,
					params: ['prompt', 'negative_prompt', 'start_image', 'mode', 'duration'],
					supportedOptions: ['mode', 'duration']
				},
				{ 
					value: 'minimax/hailuo-02', 
					label: 'MiniMax Hailuo 02', 
					type: 'video', 
					subtitle: '1-2 credits per second',
					credits: 'dynamic',
					params: ['prompt', 'first_frame_image', 'duration', 'resolution', 'prompt_optimizer'],
					supportedOptions: ['duration', 'resolution', 'prompt_optimizer']
				}
			];
		} else {
			// Real image models from functions/index.js
			return [
				{ 
					value: 'google/imagen-4', 
					label: 'Google Imagen 4', 
					type: 'image', 
					subtitle: 'Photorealistic, high quality',
					params: ['prompt', 'aspect_ratio', 'output_format', 'safety_tolerance'],
					supportedOptions: ['aspect_ratio']
				},
				{ 
					value: 'ideogram-ai/ideogram-v3-quality', 
					label: 'Ideogram v3 Quality', 
					type: 'image', 
					subtitle: 'Great for text in images',
					params: ['prompt', 'aspect_ratio', 'model', 'magic_prompt_option'],
					supportedOptions: ['aspect_ratio']
				}
			];
		}
	};

	// Check if panel should be visible - only for selected nodes, not hover
	useEffect(() => {
		const generationNodes = [...selectedNodes].filter(node => 
			['aiFrame', 'video', 'generatedFrame', 'image'].includes(node.type)
		);
		
		if (generationNodes.length === 1) {
			setActiveNode(generationNodes[0]);
			setIsVisible(true);
		} else {
			setIsVisible(false);
			setActiveNode(null);
		}
	}, [selectedNodes]);

	if (!isVisible || !activeNode) return null;

	const currentAspectRatio = activeNode.data?.formData?.aspect_ratio || activeNode.data?.aspect_ratio || '9:16';
	const currentSubtype = activeNode.data?.formData?.subtype || activeNode.data?.subtype || (activeNode.type === 'video' ? 'text_to_video' : 'general');
	const currentModel = activeNode.data?.formData?.model || activeNode.data?.model || 
		(activeNode.type === 'video' ? 'google/veo-3-fast' : 'google/imagen-4');
	const modelOptions = getModelOptions(activeNode.type, currentSubtype);
	
	// Get current selected model details
	const selectedModelDetails = modelOptions.find(model => model.value === currentModel);
	
	// Get model-specific options
	const getModelSpecificOptions = () => {
		if (!selectedModelDetails) return {};
		
		const options = {};
		
		// Duration options for video models
		if (selectedModelDetails.supportedOptions?.includes('duration')) {
			if (currentModel === 'google/veo-3-fast' || currentModel === 'google/veo-3') {
				options.duration = [3, 5];
			} else if (currentModel === 'google/veo-2') {
				options.duration = [5, 6, 7, 8];
			} else if (currentModel === 'bytedance/seedance-1-pro') {
				options.duration = [5, 10];
			} else if (currentModel === 'kwaivgi/kling-v2.1') {
				options.duration = [5, 10];
			} else if (currentModel === 'minimax/hailuo-02') {
				options.duration = [6, 10];
			}
		}
		
		// Resolution options
		if (selectedModelDetails.supportedOptions?.includes('resolution')) {
			if (currentModel === 'bytedance/seedance-1-pro') {
				options.resolution = ['480p', '1080p'];
			} else if (currentModel === 'minimax/hailuo-02') {
				options.resolution = ['768p', '1080p'];
			}
		}
		
		// Mode options
		if (selectedModelDetails.supportedOptions?.includes('mode')) {
			if (currentModel === 'kwaivgi/kling-v2.1') {
				options.mode = ['standard', 'pro'];
			}
		}
		
		// Aspect ratio options (model specific)
		if (selectedModelDetails.supportedOptions?.includes('aspect_ratio')) {
			// Image models
			if (currentModel === 'black-forest-labs/flux-kontext-max' || currentModel === 'black-forest-labs/flux-kontext-pro') {
				options.aspect_ratio = ['1:1', '3:4', '4:3', '9:16', '16:9'];
			} else if (currentModel === 'google/imagen-4' || currentModel === 'google/imagen-4-ultra') {
				options.aspect_ratio = ['1:1', '9:16', '16:9', '3:4', '4:3'];
			} else if (currentModel === 'ideogram-ai/ideogram-v3-quality') {
				options.aspect_ratio = ['1:1', '3:4', '4:3', '9:16', '16:9'];
			}
			// Video models
			else if (currentModel === 'bytedance/seedance-1-pro') {
				options.aspect_ratio = ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', '9:21'];
			} else if (currentModel === 'google/veo-3-fast' || currentModel === 'google/veo-3') {
				options.aspect_ratio = ['9:16', '16:9', '1:1'];
			} else if (currentModel === 'google/veo-2') {
				options.aspect_ratio = ['9:16', '16:9'];
			} else {
				// Default aspect ratios for other models
				options.aspect_ratio = ['1:1', '4:3', '3:4', '16:9', '9:16'];
			}
		}
		
		return options;
	};
	
	const modelSpecificOptions = getModelSpecificOptions();
	const availableAspectRatios = modelSpecificOptions.aspect_ratio ? 
		aspectRatios.filter(ratio => modelSpecificOptions.aspect_ratio.includes(ratio.value)) : 
		aspectRatios;

	const handleAspectRatioChange = (ratio) => {
		const currentFormData = activeNode.data?.formData || {};
		onUpdateNode(activeNode.id, { 
			formData: { ...currentFormData, aspect_ratio: ratio }
		});
	};

	const handleModelChange = (model) => {
		const currentFormData = activeNode.data?.formData || {};
		onUpdateNode(activeNode.id, { 
			formData: { ...currentFormData, model }
		});
	};

	const handleGenerateClick = () => {
		const currentPrompt = activeNode.data?.formData?.prompt || activeNode.data?.prompt;
		if (currentPrompt?.trim()) {
			onGenerate(activeNode.id, {
				prompt: currentPrompt,
				type: activeNode.type === 'video' ? 'video' : 'image',
				aspect_ratio: currentAspectRatio,
				model: currentModel,
				subtype: currentSubtype,
				...activeNode.data?.formData
			});
		}
	};

	return (
		<div className="fixed top-16 right-4 z-50 w-80 bg-neutral-900/95 backdrop-blur-xl border border-neutral-700/50 rounded-2xl shadow-2xl">
			{/* Header */}
			<div className="px-4 py-3 border-b border-neutral-700/50">
				<div className="flex items-center justify-between">
					<h3 className="text-sm font-medium text-neutral-200">Generation Settings</h3>
					<div className="text-xs text-neutral-400 capitalize">{activeNode.type}</div>
				</div>
			</div>

			{/* Content */}
			<div className="p-4 space-y-4">
				{/* Image Type Selection - Only for image nodes */}
				{activeNode.type === 'image' && (
					<div className="space-y-2">
						<label className="text-xs text-neutral-400 block">Image Type</label>
						<div className="grid grid-cols-3 gap-2">
							<button
								onClick={() => {
									const currentFormData = activeNode.data?.formData || {};
									onUpdateNode(activeNode.id, { 
										formData: { ...currentFormData, subtype: 'general', selectedFrame: null }
									});
								}}
								className={`p-2 text-xs rounded-lg border transition-all ${
									(activeNode.data?.formData?.subtype || 'general') === 'general'
										? 'bg-lime-500/20 border-lime-500 text-lime-300'
										: 'bg-neutral-800 border-neutral-600 text-neutral-300 hover:border-neutral-500'
								}`}
							>
								<div className="font-medium">General</div>
								<div className="text-[10px] text-neutral-400 mt-0.5">Any image</div>
							</button>
							<button
								onClick={() => {
									const currentFormData = activeNode.data?.formData || {};
									onUpdateNode(activeNode.id, { 
										formData: { ...currentFormData, subtype: 'ugc_character', selectedFrame: null }
									});
								}}
								className={`p-2 text-xs rounded-lg border transition-all ${
									(activeNode.data?.formData?.subtype || 'general') === 'ugc_character'
										? 'bg-lime-500/20 border-lime-500 text-lime-300'
										: 'bg-neutral-800 border-neutral-600 text-neutral-300 hover:border-neutral-500'
								}`}
							>
								<div className="font-medium">Character</div>
								<div className="text-[10px] text-neutral-400 mt-0.5">People</div>
							</button>
							<button
								onClick={() => {
									const currentFormData = activeNode.data?.formData || {};
									onUpdateNode(activeNode.id, { 
										formData: { ...currentFormData, subtype: 'background', selectedFrame: null }
									});
								}}
								className={`p-2 text-xs rounded-lg border transition-all ${
									(activeNode.data?.formData?.subtype || 'general') === 'background'
										? 'bg-lime-500/20 border-lime-500 text-lime-300'
										: 'bg-neutral-800 border-neutral-600 text-neutral-300 hover:border-neutral-500'
								}`}
							>
								<div className="font-medium">Background</div>
								<div className="text-[10px] text-neutral-400 mt-0.5">Scenes</div>
							</button>
						</div>
					</div>
				)}

				{/* Frame Selection - Only for character and background types */}
				{activeNode.type === 'image' && (activeNode.data?.formData?.subtype === 'ugc_character' || activeNode.data?.formData?.subtype === 'background') && (
					<div className="space-y-2">
						<label className="text-xs text-neutral-400 block">
							{activeNode.data?.formData?.subtype === 'ugc_character' ? 'Character Frame' : 'Background Frame'}
						</label>
						<div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
							{allFrameOptions
								.filter(frame => frame.type === activeNode.data?.formData?.subtype)
								.map((frame) => (
									<button
										key={frame.id}
										onClick={() => {
											const currentFormData = activeNode.data?.formData || {};
											onUpdateNode(activeNode.id, { 
												formData: { ...currentFormData, selectedFrame: frame.id }
											});
										}}
										className={`flex items-center gap-3 p-2 text-xs rounded-lg border transition-all text-left ${
											(activeNode.data?.formData?.selectedFrame) === frame.id
												? 'bg-lime-500/20 border-lime-500 text-lime-300'
												: 'bg-neutral-800 border-neutral-600 text-neutral-300 hover:border-neutral-500'
										}`}
									>
										<img 
											src={frame.exampleImage} 
											alt={frame.name}
											className="w-8 h-8 rounded object-cover flex-shrink-0"
										/>
										<div className="min-w-0 flex-1">
											<div className="font-medium truncate">{frame.name}</div>
											<div className="text-[10px] text-neutral-400 truncate">{frame.description}</div>
										</div>
									</button>
								))}
						</div>
					</div>
				)}

				{/* Model Selection */}
				<div className="space-y-2">
					<label className="text-xs text-neutral-400 block">Model</label>
					<CustomImageDropdown
						options={modelOptions.map(model => ({
							value: model.value,
							label: model.label,
							subtitle: `${model.subtitle} • ${model.credits || 0} credits`,
							type: model.type
						}))}
						value={currentModel}
						onChange={handleModelChange}
						onDropdownStateChange={(isOpen) => {
							// This will be handled by the parent component if needed
						}}
						placeholder="Select model"
						className="w-full"
					/>
				</div>

				{/* Aspect Ratio Grid */}
				<div className="space-y-2">
					<label className="text-xs text-neutral-400 block">
						Aspect Ratio
						{modelSpecificOptions.aspect_ratio && (
							<span className="text-neutral-500 ml-1">
								({modelSpecificOptions.aspect_ratio.length} available)
							</span>
						)}
					</label>
					<div className="grid grid-cols-3 gap-2">
						{availableAspectRatios.map((ratio) => (
							<button
								key={ratio.value}
								onClick={() => handleAspectRatioChange(ratio.value)}
								className={`p-2 text-xs rounded-lg border transition-all ${
									currentAspectRatio === ratio.value
										? 'bg-lime-500/20 border-lime-500 text-lime-300'
										: 'bg-neutral-800 border-neutral-600 text-neutral-300 hover:border-neutral-500'
								}`}
							>
								<div className="font-medium">{ratio.label}</div>
								<div className="text-[10px] text-neutral-400 mt-0.5">{ratio.description}</div>
							</button>
						))}
					</div>
				</div>

				{/* Model-Specific Options */}
				{selectedModelDetails && (
					<div className="space-y-3">
						{/* Negative Prompt for models that support it */}
						{selectedModelDetails.params?.includes('negative_prompt') && (
							<div className="space-y-2">
								<label className="text-xs text-neutral-400 block">Negative Prompt</label>
								<input
									type="text"
									placeholder="What to avoid in the generation..."
									value={activeNode.data?.formData?.negative_prompt || ''}
									onChange={(e) => {
										const currentFormData = activeNode.data?.formData || {};
										onUpdateNode(activeNode.id, { 
											formData: { ...currentFormData, negative_prompt: e.target.value }
										});
									}}
									onMouseDown={(e) => e.stopPropagation()}
									className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-2 text-xs text-neutral-300 placeholder-neutral-500 focus:outline-none focus:border-neutral-500"
								/>
							</div>
						)}

						{/* Duration for video models */}
						{modelSpecificOptions.duration && (
							<div className="space-y-2">
								<label className="text-xs text-neutral-400 block">Duration (seconds)</label>
								<div className="flex gap-2">
									{modelSpecificOptions.duration.map((duration) => (
										<button
											key={duration}
											onClick={() => {
												const currentFormData = activeNode.data?.formData || {};
												onUpdateNode(activeNode.id, { 
													formData: { ...currentFormData, duration }
												});
											}}
											className={`flex-1 p-2 text-xs rounded-lg border transition-all ${
												(activeNode.data?.formData?.duration || activeNode.data?.duration || 5) === duration
													? 'bg-lime-500/20 border-lime-500 text-lime-300'
													: 'bg-neutral-800 border-neutral-600 text-neutral-300 hover:border-neutral-500'
											}`}
										>
											{duration}s
										</button>
									))}
								</div>
							</div>
						)}

						{/* Resolution */}
						{modelSpecificOptions.resolution && (
							<div className="space-y-2">
								<label className="text-xs text-neutral-400 block">Resolution</label>
								<div className="flex gap-2">
									{modelSpecificOptions.resolution.map((res) => (
										<button
											key={res}
											onClick={() => {
												const currentFormData = activeNode.data?.formData || {};
												onUpdateNode(activeNode.id, { 
													formData: { ...currentFormData, resolution: res }
												});
											}}
											className={`flex-1 p-2 text-xs rounded-lg border transition-all ${
												(activeNode.data?.formData?.resolution || activeNode.data?.resolution) === res
													? 'bg-lime-500/20 border-lime-500 text-lime-300'
													: 'bg-neutral-800 border-neutral-600 text-neutral-300 hover:border-neutral-500'
											}`}
										>
											{res}
										</button>
									))}
								</div>
							</div>
						)}

						{/* Mode */}
						{modelSpecificOptions.mode && (
							<div className="space-y-2">
								<label className="text-xs text-neutral-400 block">Mode</label>
								<div className="flex gap-2">
									{modelSpecificOptions.mode.map((mode) => (
										<button
											key={mode}
											onClick={() => {
												const currentFormData = activeNode.data?.formData || {};
												onUpdateNode(activeNode.id, { 
													formData: { ...currentFormData, mode }
												});
											}}
											className={`flex-1 p-2 text-xs rounded-lg border transition-all ${
												(activeNode.data?.formData?.mode || activeNode.data?.mode || 'standard') === mode
													? 'bg-lime-500/20 border-lime-500 text-lime-300'
													: 'bg-neutral-800 border-neutral-600 text-neutral-300 hover:border-neutral-500'
											}`}
										>
											{mode.charAt(0).toUpperCase() + mode.slice(1)}
										</button>
									))}
								</div>
							</div>
						)}

						{/* Toggles */}
						{selectedModelDetails.supportedOptions?.includes('camera_fixed') && (
							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<label className="text-xs text-neutral-400">Fixed Camera</label>
									<button
										onClick={() => {
											const currentFormData = activeNode.data?.formData || {};
											const currentValue = currentFormData.camera_fixed !== undefined ? 
												currentFormData.camera_fixed : false;
											onUpdateNode(activeNode.id, { 
												formData: { ...currentFormData, camera_fixed: !currentValue }
											});
										}}
										className={`relative inline-flex w-10 h-5 items-center rounded-full transition-colors duration-200 ${
											(activeNode.data?.formData?.camera_fixed || false) ? 'bg-lime-500' : 'bg-neutral-700'
										}`}
									>
										<span
											className={`inline-block w-3 h-3 transform rounded-full bg-white transition-transform duration-200 ${
												(activeNode.data?.formData?.camera_fixed || false) ? 'translate-x-6' : 'translate-x-1'
											}`}
										/>
									</button>
								</div>
							</div>
						)}

						{selectedModelDetails.supportedOptions?.includes('prompt_optimizer') && (
							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<label className="text-xs text-neutral-400">Optimize Prompt</label>
									<button
										onClick={() => {
											const currentFormData = activeNode.data?.formData || {};
											const currentValue = currentFormData.prompt_optimizer !== undefined ? 
												currentFormData.prompt_optimizer : true;
											onUpdateNode(activeNode.id, { 
												formData: { ...currentFormData, prompt_optimizer: !currentValue }
											});
										}}
										className={`relative inline-flex w-10 h-5 items-center rounded-full transition-colors duration-200 ${
											(activeNode.data?.formData?.prompt_optimizer !== false) ? 'bg-lime-500' : 'bg-neutral-700'
										}`}
									>
										<span
											className={`inline-block w-3 h-3 transform rounded-full bg-white transition-transform duration-200 ${
												(activeNode.data?.formData?.prompt_optimizer !== false) ? 'translate-x-6' : 'translate-x-1'
											}`}
										/>
									</button>
								</div>
							</div>
						)}
					</div>
				)}

				{/* Current Prompt Display */}
				{(activeNode.data?.formData?.prompt || activeNode.data?.prompt) && (
					<div className="space-y-2">
						<label className="text-xs text-neutral-400 block">Current Prompt</label>
						<div className="bg-neutral-800 border border-neutral-600 rounded-lg p-3 text-xs text-neutral-300 max-h-20 overflow-y-auto">
							{activeNode.data?.formData?.prompt || activeNode.data?.prompt}
						</div>
					</div>
				)}

				{/* Generate Button */}
				<button
					onClick={handleGenerateClick}
					disabled={!(activeNode.data?.formData?.prompt || activeNode.data?.prompt)?.trim()}
					className="w-full bg-lime-500 hover:bg-lime-400 disabled:bg-neutral-700 disabled:text-neutral-500 text-black font-medium py-2.5 px-4 rounded-lg transition-all duration-200 text-sm"
				>
					{(activeNode.data?.formData?.prompt || activeNode.data?.prompt)?.trim() ? 'Generate' : 'Enter prompt to generate'}
				</button>
			</div>
		</div>
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
	const [isInputFocused, setIsInputFocused] = useState(false);

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
				const stateToSave = createSerializableState(nodes, edges);
				
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

		// Transform the generation node instead of creating a new one
		updateNodeData(sourceNodeId, { 
			isGenerating: true,
			type: 'generatedFrame',
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
				
				// Get current node form data for additional parameters
				if (!reactFlowInstance) {
					throw new Error("React Flow instance not available.");
				}
				const sourceNode = reactFlowInstance.getNode(sourceNodeId);
				const formData = sourceNode?.data?.formData || {};
				
				// Get model configuration to determine which parameters to send
				const config = generationConfig.video?.subtypes?.[generationData.subtype];
				const modelConfig = config?.models?.[generationData.model];
				const supportedParams = modelConfig?.params || [];
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
					videoParams.aspectRatio = formData.aspect_ratio || '9:16';
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
				// Update the source node with the generated content
				updateNodeData(sourceNodeId, {
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
	}, [updateNodeData, reactFlowInstance]);

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
				const modelConfig = generationConfig.video?.subtypes?.image_to_video?.models?.[targetModel];
				
				// Check if model supports any image input parameters
				const imageParams = ['image_input', 'image', 'start_image', 'first_frame_image'];
				const supportsImage = modelConfig?.params?.some(param => imageParams.includes(param));
				
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

	// Stable nodeTypes without connected images dependency
	const nodeTypes = useMemo(() => ({
		aiFrame: (props) => <AIFrame {...props} onUpdateNode={updateNodeData} onAddNode={addNodeToCanvas} onGenerate={handleGenerate} onDropdownStateChange={setIsAnyDropdownOpen} />,
		image: (props) => <AIFrame {...props} onUpdateNode={updateNodeData} onAddNode={addNodeToCanvas} onGenerate={handleGenerate} onDropdownStateChange={setIsAnyDropdownOpen} />,
		video: (props) => <AIFrame {...props} onUpdateNode={updateNodeData} onAddNode={addNodeToCanvas} onGenerate={handleGenerate} onDropdownStateChange={setIsAnyDropdownOpen} />,
		imageUpload: (props) => <ImageUpload {...props} onUpdateNode={updateNodeData} />,
		videoUpload: (props) => <VideoUpload {...props} />,
		generatedFrame: (props) => <GeneratedFrame {...props} />,
	}), [updateNodeData, addNodeToCanvas, handleGenerate, user]);

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



	return (
		<div className="w-full h-screen relative overflow-hidden" ref={reactFlowWrapper}>
			{/* Generated Content Panel */}
			<GeneratedContentPanel 
				user={user}
				onDragStart={(content) => {
					console.log('Dragging generated content:', content);
				}}
			/>

			{/* Floating Generation Panel */}
			<FloatingGenerationPanel 
				selectedNodes={nodes.filter(node => node.selected)}
				onUpdateNode={updateNodeData}
				onGenerate={handleGenerate}
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
				onDrop={handleContentDrop}
				onDragOver={handleContentDragOver}
				className="bg-neutral-950"
				style={{ width: '100%', height: '100vh' }}
				zoomOnScroll={!isAnyDropdownOpen && !isInputFocused}
				zoomOnPinch={!isAnyDropdownOpen && !isInputFocused}
				panOnScroll={false}
				selectionOnDrag={!isAnyDropdownOpen && !isInputFocused}
				panOnDrag={!isAnyDropdownOpen && !isInputFocused}
				nodesDraggable={!isInputFocused}
				nodesFocusable={false}
				selectNodesOnDrag={false}
				selectionKeyCode={'Shift'}
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
		</div>
	);
};

export default CanvasWorkspace;
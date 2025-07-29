import React, { useState, useRef, useEffect } from 'react';
import { models, getModelById, getModelsByCategory } from '../config/models.js';
import { 
	Upload,
	Image as ImageIcon,
	Video as VideoIcon,
	CaretDown,
	X,
	Plus,
	CaretUp
} from '@phosphor-icons/react';
import { auth, db } from '../firebase.js';
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';

const GenerationPage = () => {
	const [activeType, setActiveType] = useState('image');
	const [selectedModel, setSelectedModel] = useState('google/imagen-4');
	const [prompt, setPrompt] = useState('');
	const [settings, setSettings] = useState({});
	const [uploadedImage, setUploadedImage] = useState(null);
	const [isDragOver, setIsDragOver] = useState(false);
	const [historyScrollIndex, setHistoryScrollIndex] = useState(0);
	const [previousGenerations, setPreviousGenerations] = useState([]);
	const [isLoadingGenerations, setIsLoadingGenerations] = useState(true);
	const [generatedImage, setGeneratedImage] = useState(null);
	const [isGenerating, setIsGenerating] = useState(false);
	const [openDropdowns, setOpenDropdowns] = useState({});
	const fileInputRef = useRef(null);
	const dropAreaRef = useRef(null);
	const navigate = useNavigate();
	
	const [user, setUser] = useState(null);
	const [authChecked, setAuthChecked] = useState(false);
	
	// Check authentication
	useEffect(() => {
		const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
			setUser(currentUser);
			setAuthChecked(true);
			
			if (!currentUser) {
				navigate('/signup');
			}
		});
		
		return () => unsubscribe();
	}, [navigate]);
	
	// Fetch previous generations from Firestore
	useEffect(() => {
		const fetchGenerations = async () => {
			if (!user) {
				setIsLoadingGenerations(false);
				return;
			}

			try {
				setIsLoadingGenerations(true);
				const generationsColRef = collection(db, 'users', user.uid, 'generations');
				
				// Only fetch image type generations, limit to recent 20
				const imageQuery = query(
					generationsColRef, 
					where('type', '==', 'image'), 
					orderBy('timestamp', 'desc'), 
					limit(20)
				);
				
				const imageSnapshot = await getDocs(imageQuery);
				const processedGenerations = imageSnapshot.docs.map(docSnapshot => {
					const data = docSnapshot.data();
					const timestamp = data.timestamp instanceof Timestamp ? data.timestamp.toDate() : (data.timestamp ? new Date(data.timestamp) : new Date());
					return { 
						id: docSnapshot.id, 
						...data, 
						timestamp,
						url: data.imageUrl || data.url, // Handle different URL field names
						prompt: data.prompt || 'Generated image'
					};
				}).filter(gen => gen.url); // Only include generations with valid image URLs

				setPreviousGenerations(processedGenerations);
			} catch (error) {
				console.error("Error fetching generations:", error);
			} finally {
				setIsLoadingGenerations(false);
			}
		};

		fetchGenerations();
	}, [user]);
	
	// Get current model config
	const modelConfig = getModelById(selectedModel);
	const availableModels = getModelsByCategory(activeType);
	
	// Load default settings when model changes
	useEffect(() => {
		const currentModelConfig = getModelById(selectedModel);
		if (currentModelConfig?.params) {
			const defaultSettings = {};
			
			// Set default values for all parameters
			Object.keys(currentModelConfig.params).forEach(key => {
				const param = currentModelConfig.params[key];
				if (param.default !== undefined) {
					defaultSettings[key] = param.default;
				}
			});
			
			setSettings(defaultSettings);
		}
	}, [selectedModel]); // Only depend on selectedModel
	
	// Check if model supports image input and clear uploaded images if not
	useEffect(() => {
		const currentModelConfig = getModelById(selectedModel);
		const supportsImages = Object.keys(currentModelConfig?.params || {})
			.some(key => key.includes('image') || key === 'start_image' || key === 'first_frame_image' || key === 'subject_reference');
		
		// Only clear image if model doesn't support images and there's an image uploaded
		if (!supportsImages) {
			setUploadedImage(prev => {
				if (prev) {
					console.log(`🚫 Model ${selectedModel} doesn't support image input, cleared uploaded image`);
					return null;
				}
				return prev;
			});
		}
	}, [selectedModel]);
	
	// Close dropdowns when clicking outside
	useEffect(() => {
		const handleClickOutside = (event) => {
			// Check if click is outside any dropdown
			if (!event.target.closest('.dropdown-container')) {
				closeAllDropdowns();
			}
		};
		
		document.addEventListener('mousedown', handleClickOutside);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, []);
	
	// Handle settings change
	const handleSettingChange = (key, value) => {
		setSettings(prev => ({
			...prev,
			[key]: value
		}));
	};
	
	// Toggle dropdown open/close
	const toggleDropdown = (key) => {
		setOpenDropdowns(prev => ({
			...prev,
			[key]: !prev[key]
		}));
	};
	
	// Close all dropdowns
	const closeAllDropdowns = () => {
		setOpenDropdowns({});
	};
	
	// Get logo for model
	const getModelLogo = (modelId) => {
		if (modelId.includes('google')) return '/logos/google_logo.png';
		if (modelId.includes('flux')) return '/logos/flux_logo.png';
		if (modelId.includes('ideogram')) return '/logos/ideogram_logo.png';
		if (modelId.includes('minimax')) return '/logos/minimax_logo.png';
		if (modelId.includes('bytedance')) return '/logos/bytedance_logo.png';
		if (modelId.includes('kling')) return '/logos/kling_logo.png';
		if (modelId.includes('runway')) return '/logos/runway_logo.png';
		if (modelId.includes('leonardo')) return '/logos/leonardo_logo.png';
		return '/logos/google_logo.png'; // default
	};
	
	// Get support info for model
	const getModelSupport = (modelId) => {
		const modelConfig = getModelById(modelId);
		const supportsImages = Object.keys(modelConfig?.params || {})
			.some(key => key.includes('image') || key === 'start_image' || key === 'first_frame_image' || key === 'subject_reference');
		
		const modelType = modelConfig?.type;
		
		if (modelType === 'image') {
			return supportsImages ? 'TXT+IMG→IMG' : 'TXT→IMG';
		} else if (modelType === 'text_to_video') {
			return 'TXT→VID';
		} else if (modelType === 'image_to_video') {
			return 'IMG→VID';
		} else if (modelType === 'both') {
			return 'TXT+IMG→VID';
		}
		return 'TXT→IMG';
	};
	
	// Get setting value with fallback to model default
	const getSettingValue = (key) => {
		const settingValue = settings[key];
		const defaultValue = modelConfig?.params?.[key]?.default;
		const result = settingValue !== undefined ? settingValue : defaultValue;
		return result;
	};
	
	// Get dynamic aspect ratio class based on selected ratio or model type
	const getAspectRatioClass = () => {
		const aspectRatio = getSettingValue('aspect_ratio');
		if (aspectRatio) {
			switch (aspectRatio) {
				case '1:1': return 'aspect-square max-w-[500px] max-h-[500px]';
				case '1:2': return 'aspect-[1/2] max-w-[300px] max-h-[600px]';
				case '2:1': return 'aspect-[2/1] max-w-[600px] max-h-[300px]';
				case '1:3': return 'aspect-[1/3] max-w-[200px] max-h-[600px]';
				case '3:1': return 'aspect-[3/1] max-w-[600px] max-h-[200px]';
				case '2:3': return 'aspect-[2/3] max-w-[400px] max-h-[600px]';
				case '3:2': return 'aspect-[3/2] max-w-[600px] max-h-[400px]';
				case '3:4': return 'aspect-[3/4] max-w-[450px] max-h-[600px]';
				case '4:3': return 'aspect-[4/3] max-w-[600px] max-h-[450px]';
				case '4:5': return 'aspect-[4/5] max-w-[480px] max-h-[600px]';
				case '5:4': return 'aspect-[5/4] max-w-[600px] max-h-[480px]';
				case '9:16': return 'aspect-[9/16] max-w-[338px] max-h-[600px]';
				case '16:9': return 'aspect-video max-w-[800px] max-h-[450px]';
				case '9:21': return 'aspect-[9/21] max-w-[257px] max-h-[600px]';
				case '21:9': return 'aspect-[21/9] max-w-[800px] max-h-[343px]';
				case '10:16': return 'aspect-[10/16] max-w-[375px] max-h-[600px]';
				case '16:10': return 'aspect-[16/10] max-w-[640px] max-h-[400px]';
				default: return activeType === 'image' ? 'aspect-square max-w-[500px] max-h-[500px]' : 'aspect-video max-w-[800px] max-h-[450px]';
			}
		}
		return activeType === 'image' ? 'aspect-square max-w-[500px] max-h-[500px]' : 'aspect-video max-w-[800px] max-h-[450px]';
	};
	
	// Calculate credits needed for generation
	const calculateCredits = () => {
		if (!modelConfig) return 0;
		
		// For image models
		if (modelConfig.credits !== undefined) {
			const baseCredits = modelConfig.credits;
			const numImages = getSettingValue('number_of_images') || 1;
			return baseCredits * numImages;
		}
		
		// For video models with creditsPerSecond
		if (modelConfig.creditsPerSecond !== undefined) {
			const duration = getSettingValue('duration') || modelConfig.params?.duration?.default || 5;
			
			// Handle object-based creditsPerSecond (like resolution-dependent)
			if (typeof modelConfig.creditsPerSecond === 'object') {
				const resolution = getSettingValue('resolution') || modelConfig.params?.resolution?.default;
				const mode = getSettingValue('mode') || modelConfig.params?.mode?.default;
				
				if (resolution && modelConfig.creditsPerSecond[resolution]) {
					return modelConfig.creditsPerSecond[resolution] * duration;
				}
				if (mode && modelConfig.creditsPerSecond[mode]) {
					return modelConfig.creditsPerSecond[mode] * duration;
				}
				// Fallback to first value
				const firstKey = Object.keys(modelConfig.creditsPerSecond)[0];
				return modelConfig.creditsPerSecond[firstKey] * duration;
			}
			
			// Handle simple number creditsPerSecond
			return modelConfig.creditsPerSecond * duration;
		}
		
		return 0;
	};

	// Handle file operations
	const handleFileUpload = (files) => {
		const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
		
		if (imageFiles.length === 0) return;
		
		// Take only the first image file
		const file = imageFiles[0];
		const reader = new FileReader();
		reader.onload = (e) => {
			// Create image element to get dimensions
			const img = new window.Image();
			img.onload = () => {
				const aspectRatio = img.width / img.height;
				const newImage = {
					id: Date.now() + Math.random(),
					file: file,
					url: e.target.result,
					name: file.name,
					aspectRatio: aspectRatio
				};
				setUploadedImage(newImage);
			};
			img.src = e.target.result;
		};
		reader.readAsDataURL(file);
	};

	const removeImage = () => {
		setUploadedImage(null);
	};

	const handleDragOver = (e) => {
		e.preventDefault();
		setIsDragOver(true);
	};

	const handleDragLeave = (e) => {
		e.preventDefault();
		setIsDragOver(false);
	};

	const handleDrop = (e) => {
		e.preventDefault();
		setIsDragOver(false);
		
		// Check if it's a history image being dropped
		const historyData = e.dataTransfer.getData('application/json');
		if (historyData) {
			try {
				const generation = JSON.parse(historyData);
				addHistoryImageToUploaded(generation);
				return;
			} catch (error) {
				console.error('Error parsing dropped history data:', error);
			}
		}
		
		// Handle regular file drops
		const files = e.dataTransfer.files;
		if (files.length > 0) {
			handleFileUpload(files);
		}
	};

	const handleClickUpload = () => {
		fileInputRef.current?.click();
	};

	// History scroll functions
	const scrollHistoryUp = () => {
		setHistoryScrollIndex(prev => Math.max(0, prev - 1));
	};

	const scrollHistoryDown = () => {
		const maxIndex = Math.max(0, previousGenerations.length - 6);
		setHistoryScrollIndex(prev => Math.min(maxIndex, prev + 1));
	};

	const getVisibleHistory = () => {
		return previousGenerations.slice(historyScrollIndex, historyScrollIndex + 6);
	};

	// Convert URL to File object for history images
	const urlToFile = async (url, filename, mimeType) => {
		try {
			const response = await fetch(url);
			const blob = await response.blob();
			return new File([blob], filename, { type: mimeType });
		} catch (error) {
			console.error('Error converting URL to file:', error);
			return null;
		}
	};

	// Add history image to uploadedImage (replace current)
	const addHistoryImageToUploaded = async (generation) => {
		try {
			const filename = `generation-${generation.id}.jpg`;
			
			// For history images, we'll use a default aspect ratio and set directly
			// Since they're from Firebase Storage, we know they exist
			const newImage = {
				id: Date.now() + Math.random(),
				file: null, // Don't need file for history images
				url: generation.url,
				name: filename,
				aspectRatio: 1, // Default to square, will be updated when image loads in preview
				isFromHistory: true
			};
			
			setUploadedImage(newImage);
			console.log('✅ Set history image as uploaded image:', filename);
			
		} catch (error) {
			console.error('Error adding history image:', error);
		}
	};

	// Handle generate
	const handleGenerate = async () => {
		if (!user) {
			navigate('/signup');
			return;
		}

		if (!prompt.trim()) {
			alert('Please enter a prompt');
			return;
		}

		try {
			setIsGenerating(true);
			setGeneratedImage(null); // Clear previous generated image
			
			// Prepare data for Firebase function
			const generationData = {
				model: selectedModel,
				prompt: prompt.trim(),
				...settings
			};

			// Handle uploaded images
			if (uploadedImage) {
				const modelConfig = getModelById(selectedModel);
				
				if (modelConfig?.params) {
					// Find the first image parameter for this model
					const imageParams = Object.keys(modelConfig.params).filter(key => 
						key.includes('image') || key === 'start_image' || key === 'first_frame_image' || key === 'subject_reference'
					);
					
					if (imageParams.length > 0) {
						const imageParam = imageParams[0]; // Use first image parameter
						
						if (uploadedImage.isFromHistory) {
							// Use URL directly for history images
							generationData[imageParam] = uploadedImage.url;
							console.log(`🖼️ FRONTEND: Added image parameter '${imageParam}' with URL: ${uploadedImage.url}`);
						} else {
							// Convert local files to base64 data URI for Firebase function
							const base64DataUri = await new Promise((resolve) => {
								const reader = new FileReader();
								reader.onload = (e) => resolve(e.target.result);
								reader.readAsDataURL(uploadedImage.file);
							});
							
							generationData[imageParam] = base64DataUri;
							console.log(`🖼️ FRONTEND: Added image parameter '${imageParam}' with base64 data URI`);
							console.log(`🖼️ FRONTEND: File name: ${uploadedImage.file.name}`);
							console.log(`🖼️ FRONTEND: File type: ${uploadedImage.file.type}`);
							console.log(`🖼️ FRONTEND: File size: ${uploadedImage.file.size} bytes`);
							console.log(`🖼️ FRONTEND: Data URI length: ${base64DataUri.length}`);
							console.log(`🖼️ FRONTEND: Data URI preview: ${base64DataUri.substring(0, 100)}...`);
						}
					} else {
						console.warn(`❌ FRONTEND: No image parameters found for model ${selectedModel}`);
					}
				}
			}

			console.log('🔥 FRONTEND DEBUG - Sending generation request:');
		console.log('📋 Generation Data:', generationData);
		console.log('🖼️ Uploaded Image:', uploadedImage);
		console.log('🤖 Selected Model:', selectedModel);
		console.log('📊 Model Config:', modelConfig);
		
		// Show exact parameter names that will be sent
		Object.keys(generationData).forEach(key => {
			if (key !== 'prompt' && key !== 'model') {
				console.log(`🔧 Parameter: ${key} = ${typeof generationData[key] === 'string' ? generationData[key].substring(0, 50) + '...' : generationData[key]}`);
			}
		});

			// Call appropriate Firebase function based on type
			let result;
			if (activeType === 'image') {
				const { httpsCallable } = await import('firebase/functions');
				const { functions } = await import('../firebase.js');
				const generateImage = httpsCallable(functions, 'generateImage');
				result = await generateImage(generationData);
			} else if (activeType === 'video') {
				const { httpsCallable } = await import('firebase/functions');
				const { functions } = await import('../firebase.js');
				const generateVideo = httpsCallable(functions, 'generateVideo');
				result = await generateVideo(generationData);
			}

			console.log('Generation result:', result.data);
			
			if (result.data.success) {
				if (result.data.isAsync && result.data.predictionId) {
					console.log(`Generation started! Prediction ID: ${result.data.predictionId}`);
					// TODO: Add polling logic here
				} else if (result.data.imageUrl) {
					console.log(`Image generated successfully! URL: ${result.data.imageUrl}`);
					// Set the generated image to display in the center
					const newGeneratedImage = {
						url: result.data.imageUrl,
						prompt: prompt.trim(),
						model: selectedModel,
						timestamp: new Date()
					};
					console.log('🖼️ Setting generated image:', newGeneratedImage);
					setGeneratedImage(newGeneratedImage);
					// Clear uploaded images and show the result
					setUploadedImages([]);
					console.log('🖼️ Cleared uploaded images, should show generated image now');
				} else if (result.data.videoUrl) {
					console.log(`Video generated successfully! URL: ${result.data.videoUrl}`);
					// For videos, you might want to handle differently
					setGeneratedImage({
						url: result.data.videoUrl,
						prompt: prompt.trim(),
						model: selectedModel,
						timestamp: new Date(),
						isVideo: true
					});
					setUploadedImages([]);
				}
			} else {
				console.error('Generation failed:', result.data);
			}

		} catch (error) {
			console.error('Generation error:', error);
			alert(`Generation failed: ${error.message}`);
		} finally {
			setIsGenerating(false);
		}
	};

	// Get all parameters that have options (dropdowns)
	const getDropdownParameters = () => {
		if (!modelConfig?.params) return [];
		return Object.entries(modelConfig.params).filter(([key, param]) => {
			// Skip prompt and image inputs
			if (key === 'prompt' || key.includes('image') || key === 'start_image' || key === 'first_frame_image') {
				return false;
			}
			// Only include parameters that have options or are boolean
			return modelConfig.options?.[key] || param.type === 'boolean';
		});
	};

	// Get numeric parameters for sliders
	const getSliderParameters = () => {
		if (!modelConfig?.params) return [];
		return Object.entries(modelConfig.params).filter(([key, param]) => 
			(param.type === 'number' || param.type === 'integer') && 
			!key.includes('image') && 
			!modelConfig.options?.[key] // No predefined options
		);
	};

	// Show loading while checking auth
	if (!authChecked) {
		return (
			<div className="h-screen bg-neutral-950 flex items-center justify-center">
				<div className="text-white">Loading...</div>
			</div>
		);
	}

	// Don't render if not authenticated
	if (!user) {
		return null;
	}

	return (
		<div className="h-[calc(100vh-200px)] bg-transparent text-white relative overflow-hidden flex">
			{/* Left Sidebar - Minimal Design */}
			<div className="fixed left-2 top-15 z-10 w-64">
				<div className="bg-transparent space-y-1 shadow-2xl max-h-[80vh]">
					
					{/* Type Selection */}
					<div className="bg-neutral-900 rounded-[10px] p-3 mb-1">
						<div className="text-xs text-neutral-400 mb-2">Type</div>
						<div className="flex gap-2">
							<button
								onClick={() => {
									setActiveType('image');
									setSelectedModel('google/imagen-4');
								}}
								className={`flex-1 px-3 py-2 rounded-xl text-xs font-light tracking-wide transition-all flex items-center justify-center gap-2 ${
									activeType === 'image' 
										? 'bg-white text-black font-medium' 
										: 'bg-neutral-800/40 text-neutral-400 hover:text-white hover:bg-neutral-700/40'
								}`}
							>
								<ImageIcon size={14} />
								Image
							</button>
							<button
								onClick={() => {
									setActiveType('video');
									setSelectedModel('google/veo-3-fast');
								}}
								className={`flex-1 px-3 py-2 rounded-xl text-xs font-light tracking-wide transition-all flex items-center justify-center gap-2 ${
									activeType === 'video' 
										? 'bg-white text-black font-medium' 
										: 'bg-neutral-800/40 text-neutral-400 hover:text-white hover:bg-neutral-700/40'
								}`}
							>
								<VideoIcon size={14} />
								Video
							</button>
						</div>
					</div>
					
					{/* Model Selection */}
					<div className="bg-neutral-900 rounded-[10px] p-3 relative dropdown-container">
						<div className="text-xs text-neutral-400 mb-2">Model</div>
						<div className="relative">
							<button
								onClick={() => toggleDropdown('model')}
								className="w-full bg-transparent text-white text-sm border-none focus:outline-none appearance-none text-left flex items-center justify-between"
							>
								<div className="flex items-center gap-2">
									<div className="w-5 h-5 bg-white/10 rounded-md flex items-center justify-center p-0.5">
										<img 
											src={getModelLogo(selectedModel)}
											alt={availableModels[selectedModel]?.name}
											className="w-full h-full object-contain"
											onError={(e) => {
												e.target.style.display = 'none';
											}}
										/>
									</div>
									<div>
										<div className="text-white text-sm">{availableModels[selectedModel]?.name || selectedModel}</div>
										<div className="text-xs text-neutral-500">{getModelSupport(selectedModel)}</div>
									</div>
								</div>
								<CaretDown size={14} className={`text-neutral-400 transition-transform ${openDropdowns.model ? 'rotate-180' : ''}`} />
							</button>
							
							{openDropdowns.model && (
								<div className="absolute top-full left-0 right-0 mt-1 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
									{Object.entries(availableModels).map(([id, model]) => (
										<button
											key={id}
											onClick={() => {
												setSelectedModel(id);
												closeAllDropdowns();
											}}
											className={`w-full text-left px-3 py-2 hover:bg-neutral-700 transition-colors flex items-center gap-2 ${
												selectedModel === id ? 'bg-neutral-700 text-white' : 'text-neutral-300'
											}`}
										>
											<div className="w-4 h-4 bg-white/10 rounded-sm flex items-center justify-center p-0.5">
												<img 
													src={getModelLogo(id)}
													alt={model.name}
													className="w-full h-full object-contain"
													onError={(e) => {
														e.target.style.display = 'none';
													}}
												/>
											</div>
											<div className="flex-1">
												<div className="text-sm">{model.name}</div>
												<div className="text-xs text-neutral-500">{getModelSupport(id)}</div>
											</div>
										</button>
									))}
								</div>
							)}
						</div>
					</div>

					{/* All Dropdown Parameters */}
					{getDropdownParameters().map(([key, param]) => {
						const options = modelConfig?.options?.[key];
						const value = getSettingValue(key);
						
						
						// Handle boolean with 2 options as buttons
						if (param.type === 'boolean') {
							return (
								<div key={key} className="bg-neutral-900 rounded-[10px] p-3">
									<div className="text-xs text-neutral-400 mb-2 capitalize">
										{key.replace(/_/g, ' ')}
									</div>
									<div className="grid grid-cols-2 gap-2">
										<button
											onClick={() => handleSettingChange(key, true)}
											className={`px-3 py-2 text-xs rounded-[10px] transition-colors ${
												value === true
													? 'bg-white text-black'
													: 'bg-neutral-900 text-white hover:bg-neutral-800'
											}`}
										>
											Yes
										</button>
										<button
											onClick={() => handleSettingChange(key, false)}
											className={`px-3 py-2 text-xs rounded-[10px] transition-colors ${
												value === false
													? 'bg-white text-black'
													: 'bg-neutral-700 text-white hover:bg-neutral-600'
											}`}
										>
											No
										</button>
									</div>
								</div>
							);
						}
						
						// Handle options with exactly 2 choices as buttons
						if (options && options.length === 2) {
							return (
								<div key={key} className="bg-neutral-900 rounded-[10px] p-3">
									<div className="text-xs text-neutral-400 mb-2 capitalize">
										{key.replace(/_/g, ' ')}
									</div>
									<div className="grid grid-cols-2 gap-2">
										{options.map(option => (
											<button
												key={option}
												onClick={() => handleSettingChange(key, option)}
												className={`px-3 py-2 text-xs rounded-[10px] transition-colors ${
													value === option
														? 'bg-white text-black'
														: 'bg-neutral-700 text-white hover:bg-neutral-600'
												}`}
											>
												{option}
											</button>
										))}
									</div>
								</div>
							);
						}
						
						// Handle all other options as custom dropdown
						if (options && options.length > 2) {
							return (
								<div key={key} className="bg-neutral-900 rounded-[10px] p-3 relative dropdown-container">
									<div className="text-xs text-neutral-400 mb-2 capitalize">
										{key.replace(/_/g, ' ')}
									</div>
									<div className="relative">
										<button
											onClick={() => toggleDropdown(key)}
											className="w-full bg-transparent text-white text-sm border-none focus:outline-none appearance-none text-left flex items-center justify-between pr-2"
										>
											<span>{value || options[0] || 'Select...'}</span>
											<CaretDown size={14} className={`text-neutral-400 transition-transform ${openDropdowns[key] ? 'rotate-180' : ''}`} />
										</button>
										
										{openDropdowns[key] && (
											<div className="absolute top-full left-0 right-0 mt-1 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
												{options.map(option => (
													<button
														key={option}
														onClick={() => {
															handleSettingChange(key, option);
															closeAllDropdowns();
														}}
														className={`w-full text-left px-3 py-2 text-sm hover:bg-neutral-700 transition-colors ${
															value === option ? 'bg-neutral-700 text-white' : 'text-neutral-300'
														}`}
													>
														{option}
													</button>
												))}
											</div>
										)}
									</div>
								</div>
							);
						}
						
						return null;
					})}

					{/* Slider Parameters */}
					{getSliderParameters().map(([key, param]) => {
						const value = getSettingValue(key);
						const min = key === 'seed' ? 1 : 1;
						const max = key === 'seed' ? 999999 : (key.includes('number') ? 10 : 100);
						const currentValue = value || param.default || min;
						
						return (
							<div key={key} className="bg-neutral-900 rounded-[10px] p-3">
								<div className="text-xs text-neutral-400 mb-2 capitalize">
									{key.replace(/_/g, ' ')}
								</div>
								<div className="space-y-2">
									<div className="flex items-center justify-between">
										<span className="text-sm text-white">{currentValue}</span>
										<span className="text-xs text-neutral-500">{max}</span>
									</div>
									<div className="relative h-6 bg-neutral-700 rounded-[3px] overflow-hidden">
										<div 
											className="absolute left-0 top-0 h-full bg-neutral-500 transition-all duration-200"
											style={{ width: `${((currentValue - min) / (max - min)) * 100}%` }}
										></div>
										<input
											type="range"
											min={min}
											max={max}
											value={currentValue}
											onChange={(e) => handleSettingChange(key, param.type === 'integer' ? parseInt(e.target.value) : parseFloat(e.target.value))}
											className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
										/>
										<div 
											className="absolute top-1/2 transform -translate-y-1/2 w-3 h-3 bg-white rounded-[2px] pointer-events-none transition-all duration-200"
											style={{ left: `calc(${((currentValue - min) / (max - min)) * 100}% - 6px)` }}
										></div>
									</div>
								</div>
							</div>
						);
					})}

					{/* Negative Prompt */}
					{modelConfig?.params?.negative_prompt && (
						<div className="bg-neutral-900 rounded-[10px] p-3">
							<div className="text-xs text-neutral-400 mb-2">Negative prompt</div>
							<textarea
								value={getSettingValue('negative_prompt') || ''}
								onChange={(e) => handleSettingChange('negative_prompt', e.target.value)}
								placeholder="What you don't want..."
								className="w-full bg-neutral-700 text-white rounded-[10px] px-3 py-2 text-sm border-none focus:outline-none resize-none h-16"
							/>
						</div>
					)}
				</div>
			</div>

			{/* Main content area */}
			<div className="flex items-center justify-center p-4 h-full w-full ml-64 mr-20">
				{generatedImage ? (
					/* Generated Image Display */
					<div className={`relative bg-transparent p-4 w-full transition-all duration-300 ${getAspectRatioClass()}`}>
						<div className="w-full h-full rounded-[60px] overflow-hidden bg-neutral-900 shadow-2xl relative group">
							{generatedImage.isVideo ? (
								<video 
									src={generatedImage.url} 
									className="w-full h-full object-cover"
									controls
									autoPlay
									muted
									loop
								/>
							) : (
								<img 
									src={generatedImage.url} 
									alt={generatedImage.prompt}
									className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
								/>
							)}
							
							{/* Generated image overlay */}
							<div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
								<div className="text-white text-sm font-medium mb-1">{generatedImage.model}</div>
								<div className="text-white/80 text-xs truncate">{generatedImage.prompt}</div>
							</div>
							
							{/* Clear/New Generation Button */}
							<button
								onClick={() => {
									setGeneratedImage(null);
									setPrompt('');
								}}
								className="absolute top-4 right-4 w-10 h-10 bg-neutral-800/80 hover:bg-neutral-700 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 hover:scale-110 z-10"
							>
								<X size={20} className="text-white" />
							</button>
						</div>
					</div>
				) : !uploadedImage ? (
					/* Empty state - Use getAspectRatioClass */
					<div className={`relative bg-transparent p-4 w-full transition-all duration-300 ${getAspectRatioClass()}`}>
					
						{/* Inner frame - Drop Area or Info */}
						<div 
							ref={dropAreaRef}
							onDragOver={modelConfig && Object.keys(modelConfig?.params || {}).some(key => key.includes('image') || key === 'start_image' || key === 'first_frame_image' || key === 'subject_reference') ? handleDragOver : undefined}
							onDragLeave={modelConfig && Object.keys(modelConfig?.params || {}).some(key => key.includes('image') || key === 'start_image' || key === 'first_frame_image' || key === 'subject_reference') ? handleDragLeave : undefined}
							onDrop={modelConfig && Object.keys(modelConfig?.params || {}).some(key => key.includes('image') || key === 'start_image' || key === 'first_frame_image' || key === 'subject_reference') ? handleDrop : undefined}
							onClick={modelConfig && Object.keys(modelConfig?.params || {}).some(key => key.includes('image') || key === 'start_image' || key === 'first_frame_image' || key === 'subject_reference') ? handleClickUpload : undefined}
							className={`w-full h-full rounded-[60px] flex items-center justify-center transition-all duration-300 relative overflow-hidden bg-neutral-900 ${
								modelConfig && Object.keys(modelConfig?.params || {}).some(key => key.includes('image') || key === 'start_image' || key === 'first_frame_image' || key === 'subject_reference') 
									? `cursor-pointer hover:bg-neutral-800 ${isDragOver ? 'bg-neutral-800 border-2 border-dashed border-lime-400' : 'border-2 border-dashed border-neutral-700'}`
									: 'border-2 border-dashed border-neutral-700/50'
							}`}
						>
							{isGenerating ? (
								<div className="text-center">
									<div className="text-lime-400 mb-4">
										<div className="w-12 h-12 border-4 border-lime-400/20 border-t-lime-400 rounded-full animate-spin mx-auto mb-4"></div>
										<div className="text-lg font-medium mb-2">Generating...</div>
										<div className="text-sm text-neutral-400">Please wait while AI creates your content</div>
									</div>
								</div>
							) : modelConfig && Object.keys(modelConfig?.params || {}).some(key => key.includes('image') || key === 'start_image' || key === 'first_frame_image' || key === 'subject_reference') ? (
								<div className="text-center">
									<div className={`mb-4 transition-colors ${isDragOver ? 'text-lime-400' : 'text-neutral-400'}`}>
										<Upload size={48} className="mx-auto mb-2" />
										<div className="text-lg font-medium mb-2">
											{isDragOver ? 'Drop image here' : 'Drop image or click to upload'}
										</div>
										<div className="text-sm text-neutral-500">
											Single image input • PNG, JPG, WEBP
										</div>
									</div>
								</div>
							) : (
								<div className="text-center">
									<div className="mb-4 text-neutral-500">
										<ImageIcon size={48} className="mx-auto mb-2" />
										<div className="text-lg font-medium mb-2">
											Ready to Generate
										</div>
										<div className="text-sm text-neutral-600">
											{availableModels[selectedModel]?.name} • Text-to-Image
										</div>
									</div>
								</div>
							)}
						</div>
					</div>
				) : (
					/* Single image display */
					<div 
						className="relative bg-transparent p-4 w-full h-full transition-all duration-300 flex items-center justify-center"
						onDragOver={handleDragOver}
						onDragLeave={handleDragLeave}
						onDrop={handleDrop}
					>
						<div 
							className="relative group bg-neutral-800 rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] cursor-pointer"
							style={{
								aspectRatio: uploadedImage.aspectRatio || '3/4',
								width: '500px',
								maxWidth: '90%',
								maxHeight: '90%'
							}}
							onClick={handleClickUpload}
						>
							<img 
								src={uploadedImage.url} 
								alt={uploadedImage.name}
								className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
							/>
							{/* Image info overlay */}
							<div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
								<div className="text-white text-sm font-medium truncate">{uploadedImage.name}</div>
								<div className="text-white/70 text-xs">Click to replace</div>
							</div>
							{/* Remove button */}
							<button
								onClick={(e) => {
									e.stopPropagation();
									removeImage();
								}}
								className="absolute top-3 right-3 w-8 h-8 bg-red-500/80 hover:bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 hover:scale-110 z-10"
							>
								<X size={16} className="text-white" />
							</button>
						</div>
					</div>
				)}
				
				{/* Hidden file input */}
				<input
					ref={fileInputRef}
					type="file"
					accept="image/*"
					className="hidden"
					onChange={(e) => handleFileUpload(e.target.files)}
				/>
				
				{/* Right sidebar with + button and history */}
				<div className="fixed right-4 top-1/2 transform -translate-y-1/2 z-50 flex flex-col items-center space-y-4">
					{/* Add image button - show only when no image */}
					{!uploadedImage && (() => {
						const currentModelConfig = getModelById(selectedModel);
						const supportsImages = Object.keys(currentModelConfig?.params || {})
							.some(key => key.includes('image') || key === 'start_image' || key === 'first_frame_image' || key === 'subject_reference');
						
						return (
							<button
								onClick={supportsImages ? handleClickUpload : undefined}
								disabled={!supportsImages}
								className={`w-12 h-12 border-2 border-dashed rounded-xl flex items-center justify-center transition-colors group bg-neutral-900/80 backdrop-blur-sm ${
									supportsImages 
										? 'border-neutral-700 hover:border-lime-400 cursor-pointer' 
										: 'border-neutral-800 cursor-not-allowed opacity-50'
								}`}
								title={supportsImages ? "Add image" : "This model doesn't support image input"}
							>
								<Plus size={20} className={supportsImages ? "text-neutral-600 group-hover:text-lime-400" : "text-neutral-700"} />
							</button>
						);
					})()}
					
					{/* History section */}
					{!isLoadingGenerations && previousGenerations.length > 0 && (
						<div className="flex flex-col items-center space-y-2">
							{/* Scroll up button */}
							{historyScrollIndex > 0 && (
								<button
									onClick={scrollHistoryUp}
									className="w-12 h-4 bg-neutral-900/80 backdrop-blur-sm rounded-lg flex items-center justify-center hover:bg-neutral-800/80 transition-colors group"
								>
									<CaretUp size={16} className="text-neutral-600 group-hover:text-lime-400" />
								</button>
							)}
							
							{/* History images */}
							<div className="flex flex-col space-y-2">
								{getVisibleHistory().map((generation) => {
									const currentModelConfig = getModelById(selectedModel);
									const supportsImages = Object.keys(currentModelConfig?.params || {})
										.some(key => key.includes('image') || key === 'start_image' || key === 'first_frame_image' || key === 'subject_reference');
									
									return (
										<div
											key={generation.id}
											className={`w-12 h-12 bg-neutral-800 rounded-xl overflow-hidden transition-all duration-300 group relative ${
												supportsImages 
													? 'hover:ring-2 hover:ring-lime-400/50 cursor-pointer' 
													: 'opacity-50 cursor-not-allowed'
											}`}
											title={supportsImages ? `Click to add: ${generation.prompt}` : "This model doesn't support image input"}
											draggable={supportsImages}
											onClick={supportsImages ? () => addHistoryImageToUploaded(generation) : undefined}
											onDragStart={supportsImages ? (e) => {
												e.dataTransfer.setData('application/json', JSON.stringify(generation));
												e.dataTransfer.effectAllowed = 'copy';
											} : undefined}
										>
										<img
											src={generation.url}
											alt={generation.prompt}
											className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none"
											onError={(e) => {
												e.target.style.display = 'none';
											}}
										/>
										{/* Hover overlay */}
										<div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
											<Plus size={16} className="text-white opacity-80" />
										</div>
									</div>
									);
								})}
							</div>
							
							{/* Scroll down button */}
							{historyScrollIndex < previousGenerations.length - 6 && (
								<button
									onClick={scrollHistoryDown}
									className="w-12 h-4 bg-neutral-900/80 backdrop-blur-sm rounded-lg flex items-center justify-center hover:bg-neutral-800/80 transition-colors group"
								>
									<CaretDown size={16} className="text-neutral-600 group-hover:text-lime-400" />
								</button>
							)}
						</div>
					)}
				</div>
			</div>
			
			{/* Bottom menu */}
			<div className="fixed bottom-5 left-1/2 transform -translate-x-1/2 rounded-3xl p-4 bg-neutral-950/40 backdrop-blur-xl border border-neutral-700/50 w-full max-w-3xl">
				<div>
						<div className="flex items-stretch gap-3 h-16">
							
							{/* Prompt input */}
							<div className="flex-1 relative h-full">
								<textarea
									value={prompt}
									onChange={(e) => setPrompt(e.target.value)}
									placeholder="Describe a scene and click generate"
									className="w-full h-full bg-neutral-800/0 backdrop-blur-sm border border-neutral-700/0 rounded-xl px-3 py-2 pb-8 text-white placeholder-neutral-500 resize-none focus:border-lime-400/0 focus:outline-none text-sm font-light tracking-wide"
								/>
								
							
							</div>
							
							{/* Generate Section */}
							<div className="flex flex-col gap-2 h-full justify-center">
								<button
									onClick={handleGenerate}
									disabled={!prompt.trim() || isGenerating}
									className="px-8 py-3 bg-white/90 hover:bg-white text-black font-normal tracking-wide rounded-2xl disabled:bg-neutral-700/50 disabled:text-neutral-500 transition-all hover:scale-105 shadow-lg text-sm"
								>
									{isGenerating ? 'GENERATING...' : 'GENERATE'}
								</button>
								<div className="text-xs text-neutral-500 text-center font-light tracking-wider uppercase">
									Credits: {calculateCredits()}
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
	);
};

export default GenerationPage;
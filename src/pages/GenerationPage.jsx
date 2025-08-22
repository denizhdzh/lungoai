import React, { useState, useRef, useEffect } from 'react';
import { models, getModelById, getModelsByCategory, getUserTier, canAccessModel } from '../config/models.js';
import { 
	Upload,
	Image as ImageIcon,
	Video as VideoIcon,
	CaretDown,
	X,
	Plus,
	CaretUp,
	Lock,
	Pencil,
	Wrench
} from '@phosphor-icons/react';
import { auth, db } from '../firebase.js';
import { collection, query, where, orderBy, limit, getDocs, Timestamp, doc, getDoc } from 'firebase/firestore';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import DynamicIsland from '../components/DynamicIsland.jsx';
import Header from '../components/Header.jsx';

const GenerationPage = () => {
	const [searchParams, setSearchParams] = useSearchParams();
	const [activeType, setActiveType] = useState(searchParams.get('type') || 'image');
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
	const [generatingItem, setGeneratingItem] = useState(null);
	const [notifications, setNotifications] = useState([]);
	const [user, setUser] = useState(null);
	const [subscriptionData, setSubscriptionData] = useState(null);
	const [authChecked, setAuthChecked] = useState(false);
	const fileInputRef = useRef(null);
	const dropAreaRef = useRef(null);
	const navigate = useNavigate();
	
	// Add notification
	const addNotification = (message, type = 'info') => {
		const id = Date.now() + Math.random();
		const notification = { id, message, type, timestamp: new Date() };
		setNotifications(prev => [...prev, notification]);
		
		// Auto remove after 5 seconds
		setTimeout(() => {
			setNotifications(prev => prev.filter(n => n.id !== id));
		}, 5000);
	};
	
	// Handle URL type parameter changes
	useEffect(() => {
		const urlType = searchParams.get('type');
		if (urlType && ['image', 'video', 'edit', 'tools'].includes(urlType)) {
			setActiveType(urlType);
			// Set appropriate default models based on type
			switch(urlType) {
				case 'image':
					setSelectedModel('google/imagen-4');
					break;
				case 'video':
					setSelectedModel('google/veo-3-fast');
					break;
				case 'edit':
					setSelectedModel('black-forest-labs/flux-kontext-pro'); // Default for edit
					break;
				case 'tools':
					setSelectedModel('google/imagen-4'); // Default for tools
					break;
			}
		}
	}, [searchParams]);

	// Check authentication and fetch subscription data
	useEffect(() => {
		const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
			setUser(currentUser);
			setAuthChecked(true);
			
			if (currentUser) {
				// Fetch subscription data
				try {
					const userDocRef = doc(db, 'users', currentUser.uid);
					const userDoc = await getDoc(userDocRef);
					if (userDoc.exists()) {
						setSubscriptionData(userDoc.data());
					}
				} catch (error) {
					console.error('Error fetching subscription data:', error);
				}
			}
		});
		
		return () => unsubscribe();
	}, []);
	
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
	
	// All models are now accessible to everyone
	const accessibleModels = availableModels;
	
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

	// Add wheel event listener for history scroll
	useEffect(() => {
		const historyContainer = document.querySelector('.history-container');
		
		const handleWheel = (e) => {
			// Only handle wheel events when hovering over history images
			if (e.target.closest('.history-container')) {
				e.preventDefault();
				
				if (e.deltaY > 0) {
					// Scroll down
					scrollHistoryDown();
				} else {
					// Scroll up
					scrollHistoryUp();
				}
			}
		};

		if (historyContainer) {
			historyContainer.addEventListener('wheel', handleWheel, { passive: false });
			
			return () => {
				historyContainer.removeEventListener('wheel', handleWheel);
			};
		}
	}, [previousGenerations.length]);
	
	// Handle settings change
	const handleSettingChange = (key, value) => {
		setSettings(prev => ({
			...prev,
			[key]: value
		}));
	};
	
	// Check if option is disabled due to constraints
	const isOptionDisabled = (paramKey, optionValue) => {
		if (selectedModel === 'minimax/hailuo-02') {
			const currentResolution = getSettingValue('resolution') || '768p';
			const currentDuration = getSettingValue('duration') || 6;
			
			if (paramKey === 'resolution' && optionValue === '1080p') {
				// 1080p is disabled if duration is 10
				return currentDuration === 10;
			} else if (paramKey === 'duration' && optionValue === 10) {
				// 10 seconds is disabled if resolution is 1080p
				return currentResolution === '1080p';
			}
		}
		return false;
	};
	
	// Get tooltip text for disabled options
	const getDisabledTooltip = (paramKey, optionValue) => {
		if (selectedModel === 'minimax/hailuo-02') {
			if (paramKey === 'resolution' && optionValue === '1080p') {
				return '1080p is only available with 6 second duration';
			} else if (paramKey === 'duration' && optionValue === 10) {
				return '10 seconds is only available with 768p resolution';
			}
		}
		return '';
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
		if (modelId.includes('google')) return '/logos/google_logo.webp';
		if (modelId.includes('flux')) return '/logos/flux_logo.webp';
		if (modelId.includes('ideogram')) return '/logos/ideogram_logo.webp';
		if (modelId.includes('minimax')) return '/logos/minimax_logo.webp';
		if (modelId.includes('bytedance')) return '/logos/bytedance_logo.webp';
		if (modelId.includes('kling')) return '/logos/kling_logo.webp';
		if (modelId.includes('runway')) return '/logos/runway_logo.webp';
		if (modelId.includes('leonardo')) return '/logos/leonardo_logo.webp';
		return '/logos/google_logo.webp'; // default
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
	// Don't apply aspect ratio constraints when image is uploaded
	const getAspectRatioClass = () => {
		// If there's an uploaded image, don't constrain the aspect ratio
		if (uploadedImage) {
			return '';
		}
		
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
		
		// Special handling for edit mode models
		if (activeType === 'edit') {
			if (selectedModel === 'black-forest-labs/flux-kontext-pro') {
				return 1;
			} else if (selectedModel === 'black-forest-labs/flux-kontext-max') {
				return 2;
			}
		}
		
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

	// History scroll functions - now supports smooth multi-item scrolling
	const scrollHistoryUp = () => {
		setHistoryScrollIndex(prev => Math.max(0, prev - 3));
	};

	const scrollHistoryDown = () => {
		const maxIndex = Math.max(0, previousGenerations.length - 6);
		setHistoryScrollIndex(prev => Math.min(maxIndex, prev + 3));
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
			
			// Load the image to get its actual aspect ratio
			const img = new window.Image();
			img.onload = () => {
				const actualAspectRatio = img.width / img.height;
				const newImage = {
					id: Date.now() + Math.random(),
					file: null, // Don't need file for history images
					url: generation.url,
					name: filename,
					aspectRatio: actualAspectRatio,
					isFromHistory: true
				};
				
				setUploadedImage(newImage);
				console.log('✅ Set history image as uploaded image with correct aspect ratio:', filename, `${img.width}x${img.height}`, `ratio: ${actualAspectRatio.toFixed(2)}`);
			};
			
			img.onerror = () => {
				// Fallback to default if image fails to load
				const newImage = {
					id: Date.now() + Math.random(),
					file: null,
					url: generation.url,
					name: filename,
					aspectRatio: 1, // Default to square if image fails to load
					isFromHistory: true
				};
				setUploadedImage(newImage);
				console.log('⚠️ Failed to load history image, using default aspect ratio:', filename);
			};
			
			img.src = generation.url;
			
		} catch (error) {
			console.error('Error adding history image:', error);
		}
	};

	// Use generated image as input for next generation
	const useGeneratedImageAsInput = () => {
		if (!generatedImage || generatedImage.isVideo) return;
		
		try {
			// Load the image to get its actual aspect ratio
			const img = new window.Image();
			img.onload = () => {
				const actualAspectRatio = img.width / img.height;
				const newImage = {
					id: Date.now() + Math.random(),
					file: null, // Don't need file for generated images
					url: generatedImage.url,
					name: `generated-${Date.now()}.jpg`,
					aspectRatio: actualAspectRatio,
					isFromHistory: true // Treat like history image for backend processing
				};
				
				setUploadedImage(newImage);
				setGeneratedImage(null); // Clear the generated image display
				console.log('✅ Using generated image as input with correct aspect ratio:', newImage.name, `ratio: ${actualAspectRatio.toFixed(2)}`);
			};
			
			img.onerror = () => {
				// Fallback to default if image fails to load
				const newImage = {
					id: Date.now() + Math.random(),
					file: null,
					url: generatedImage.url,
					name: `generated-${Date.now()}.jpg`,
					aspectRatio: 1,
					isFromHistory: true
				};
				setUploadedImage(newImage);
				setGeneratedImage(null);
				console.log('⚠️ Failed to load generated image, using default aspect ratio');
			};
			
			img.src = generatedImage.url;
			
		} catch (error) {
			console.error('Error using generated image as input:', error);
		}
	};

	// Helper function to create image with correct aspect ratio
	const createImageWithAspectRatio = async (url, name) => {
		return new Promise((resolve) => {
			const img = new window.Image();
			img.onload = () => {
				const actualAspectRatio = img.width / img.height;
				resolve({
					id: Date.now() + Math.random(),
					file: null,
					url: url,
					name: name,
					aspectRatio: actualAspectRatio,
					isFromHistory: true
				});
			};
			
			img.onerror = () => {
				// Fallback to default if image fails to load
				resolve({
					id: Date.now() + Math.random(),
					file: null,
					url: url,
					name: name,
					aspectRatio: 1, // Default to square if image fails to load
					isFromHistory: true
				});
			};
			
			img.src = url;
		});
	};

	// Poll prediction status
	const pollPrediction = async (predictionId, currentActiveType, currentPrompt, currentSelectedModel) => {
		let attempts = 0;
		const maxAttempts = 120; // 10 minutes max (5 second intervals)
		
		const poll = async () => {
			attempts++;
			
			try {
				const { httpsCallable } = await import('firebase/functions');
				const { functions } = await import('../firebase.js');
				const pollPredictions = httpsCallable(functions, 'pollPredictions');
				
				const result = await pollPredictions({ predictionId });
				console.log('Poll result:', result.data);
				
				if (result.data.success) {
					const { status, output, error } = result.data;
					
					// Update DynamicIsland status
					setGeneratingItem(prev => prev ? {
						...prev,
						status: status
					} : null);
					
					if (status === 'succeeded' && output) {
						console.log('Async generation completed!', output);
						
						// Handle the completed generation
						const contentUrl = Array.isArray(output) ? output[0] : output;
						
						if (currentActiveType === 'image' || currentActiveType === 'edit' || currentActiveType === 'tools') {
							const newGeneratedImage = {
								url: contentUrl,
								prompt: currentPrompt.trim(),
								model: currentSelectedModel,
								timestamp: new Date()
							};
							
							// In edit mode, automatically use the generated image as input for the next generation
							if (currentActiveType === 'edit') {
								const newInputImage = await createImageWithAspectRatio(contentUrl, `edited-${Date.now()}.jpg`);
								setUploadedImage(newInputImage);
								setGeneratedImage(null); // Don't show in center, it's now the input
								console.log('🖼️ Edit mode: Auto-using generated image as input with correct aspect ratio:', newInputImage.name, `ratio: ${newInputImage.aspectRatio.toFixed(2)}`);
							} else {
								setGeneratedImage(newGeneratedImage);
								setUploadedImage(null);
								console.log('🖼️ Set generated image from async poll:', newGeneratedImage);
							}
						} else if (currentActiveType === 'video') {
							const newGeneratedVideo = {
								url: contentUrl,
								prompt: currentPrompt.trim(),
								model: currentSelectedModel,
								timestamp: new Date(),
								isVideo: true
							};
							setGeneratedImage(newGeneratedVideo);
							setUploadedImage(null);
						}
						
						// Update to completed status
						setGeneratingItem(prev => prev ? {
							...prev,
							status: 'completed'
						} : null);
						
						addNotification(`${currentActiveType === 'video' ? 'Video' : 'Image'} generated successfully!`, 'success');
						
						// Clear generating item after 3 seconds
						setTimeout(() => setGeneratingItem(null), 3000);
						
					} else if (status === 'failed') {
						console.error('Async generation failed:', error);
						
						setGeneratingItem(prev => prev ? {
							...prev,
							status: 'failed'
						} : null);
						
						addNotification(`Generation failed: ${error || 'Unknown error'}`, 'error');
						
						// Clear generating item after 5 seconds
						setTimeout(() => setGeneratingItem(null), 5000);
						
					} else if (status === 'starting' || status === 'processing') {
						// Continue polling
						if (attempts < maxAttempts) {
							setTimeout(poll, 5000); // Poll every 5 seconds
						} else {
							console.error('Polling timeout reached');
							addNotification('Generation is taking longer than expected. Please check back later.', 'warning');
							setGeneratingItem(null);
						}
					}
				}
			} catch (error) {
				console.error('Error polling prediction:', error);
				if (attempts < maxAttempts) {
					setTimeout(poll, 10000); // Longer interval on error
				} else {
					addNotification('Error checking generation status', 'error');
					setGeneratingItem(null);
				}
			}
		};
		
		// Start polling
		setTimeout(poll, 5000); // First poll after 5 seconds
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
			
			// Set generating item for DynamicIsland
			setGeneratingItem({
				type: activeType,
				name: prompt.trim().substring(0, 30) + (prompt.trim().length > 30 ? '...' : ''),
				status: 'generating',
				model: selectedModel
			});
			
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
			} else if (activeType === 'edit') {
				const { httpsCallable } = await import('firebase/functions');
				const { functions } = await import('../firebase.js');
				const generateImage = httpsCallable(functions, 'generateImage'); // Edit uses image generation
				result = await generateImage(generationData);
			} else {
				// Handle other types (tools, etc.) - fallback to image generation
				const { httpsCallable } = await import('firebase/functions');
				const { functions } = await import('../firebase.js');
				const generateImage = httpsCallable(functions, 'generateImage');
				result = await generateImage(generationData);
			}

			console.log('Generation result:', result?.data);
			
			if (result?.data?.success) {
				if (result.data.isAsync && result.data.predictionId) {
					console.log(`Generation started! Prediction ID: ${result.data.predictionId}`);
					setGeneratingItem({
						type: activeType,
						name: prompt.trim().substring(0, 30) + (prompt.trim().length > 30 ? '...' : ''),
						status: 'starting',
						model: selectedModel,
						predictionId: result.data.predictionId
					});
					addNotification(`${activeType === 'video' ? 'Video' : 'Image'} generation started. This may take a few minutes...`, 'info');
					
					// Start polling for async prediction
					pollPrediction(result.data.predictionId, activeType, prompt, selectedModel);
				} else if (result.data.imageUrl) {
					console.log(`Image generated successfully! URL: ${result.data.imageUrl}`);
					
					// In edit mode, automatically use the generated image as input for the next generation
					if (activeType === 'edit') {
						const newInputImage = await createImageWithAspectRatio(result.data.imageUrl, `edited-${Date.now()}.jpg`);
						setUploadedImage(newInputImage);
						setGeneratedImage(null); // Don't show in center, it's now the input
						console.log('🖼️ Edit mode: Auto-using generated image as input with correct aspect ratio:', newInputImage.name, `ratio: ${newInputImage.aspectRatio.toFixed(2)}`);
					} else {
						// Set the generated image to display in the center
						const newGeneratedImage = {
							url: result.data.imageUrl,
							prompt: prompt.trim(),
							model: selectedModel,
							timestamp: new Date()
						};
						console.log('🖼️ Setting generated image:', newGeneratedImage);
						setGeneratedImage(newGeneratedImage);
						// Clear uploaded image and show the result
						setUploadedImage(null);
						console.log('🖼️ Cleared uploaded image, should show generated image now');
					}
					
					// Update DynamicIsland to completed
					setGeneratingItem({
						type: activeType,
						name: prompt.trim().substring(0, 30) + (prompt.trim().length > 30 ? '...' : ''),
						status: 'completed',
						model: selectedModel
					});
					addNotification(`${activeType === 'video' ? 'Video' : 'Image'} generated successfully!`, 'success');
					
					// Clear generating item after 3 seconds
					setTimeout(() => setGeneratingItem(null), 3000);
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
					setUploadedImage(null);
					
					// Update DynamicIsland to completed
					setGeneratingItem({
						type: activeType,
						name: prompt.trim().substring(0, 30) + (prompt.trim().length > 30 ? '...' : ''),
						status: 'completed',
						model: selectedModel
					});
					addNotification(`${activeType === 'video' ? 'Video' : 'Image'} generated successfully!`, 'success');
					
					// Clear generating item after 3 seconds
					setTimeout(() => setGeneratingItem(null), 3000);
				}
			} else {
				console.error('Generation failed:', result?.data);
				setGeneratingItem({
					type: activeType,
					name: prompt.trim().substring(0, 30) + (prompt.trim().length > 30 ? '...' : ''),
					status: 'failed',
					model: selectedModel
				});
				addNotification(`Generation failed: ${result?.data?.error || 'Unknown error'}`, 'error');
				
				// Clear generating item after 5 seconds
				setTimeout(() => setGeneratingItem(null), 5000);
			}

		} catch (error) {
			console.error('Generation error:', error);
			setGeneratingItem({
				type: activeType,
				name: prompt.trim().substring(0, 30) + (prompt.trim().length > 30 ? '...' : ''),
				status: 'failed',
				model: selectedModel
			});
			addNotification(`Generation failed: ${error.message}`, 'error');
			
			// Clear generating item after 5 seconds
			setTimeout(() => setGeneratingItem(null), 5000);
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

	// Handle type change and update URL
	const handleTypeChange = (newType) => {
		setActiveType(newType);
		setSearchParams({ type: newType });
		// Set appropriate default models
		switch(newType) {
			case 'image':
				setSelectedModel('google/imagen-4');
				break;
			case 'video':
				setSelectedModel('google/veo-3-fast');
				break;
			case 'edit':
				setSelectedModel('black-forest-labs/flux-kontext-pro');
				break;
			case 'tools':
				setSelectedModel('google/imagen-4');
				break;
		}
	};

	return (
		<div className="min-h-screen bg-neutral-950 relative">
			
			{/* Header Component */}
			<Header />
			
			{/* Main Layout - Responsive */}
			<div className="flex h-[calc(100vh-200px)] bg-transparent text-white relative overflow-hidden z-10">
			{/* CSS for notification animation */}
			<style>
				{`
					@keyframes slide-in-right {
						from {
							transform: translateX(100%);
							opacity: 0;
						}
						to {
							transform: translateX(0);
							opacity: 1;
						}
					}
					.animate-slide-in-right {
						animation: slide-in-right 0.3s ease-out;
					}
				`}
			</style>
			{/* DynamicIsland */}
			<DynamicIsland 
				generatingItem={generatingItem}
				isDarkMode={true}
				position="bottom-right"
			/>
			

			{/* Main content area */}
			<div className="flex items-center justify-center p-4 h-full w-full mb-32">
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
							
							{/* Action Buttons */}
							<div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 z-10">
								{/* Use as Input Button - only show for images that support image input and NOT in edit mode */}
								{!generatedImage.isVideo && activeType !== 'edit' && modelConfig && Object.keys(modelConfig?.params || {}).some(key => key.includes('image') || key === 'start_image' || key === 'first_frame_image' || key === 'subject_reference') && (
									<button
										onClick={useGeneratedImageAsInput}
										title="Use this image as input for next generation"
										className="w-10 h-10 bg-lime-600/80 hover:bg-lime-500 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110"
									>
										<Plus size={20} className="text-white" />
									</button>
								)}
								
								{/* Clear/New Generation Button */}
								<button
									onClick={() => {
										setGeneratedImage(null);
										setPrompt('');
									}}
									title="Clear and start new generation"
									className="w-10 h-10 bg-neutral-800/80 hover:bg-neutral-700 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110"
								>
									<X size={20} className="text-white" />
								</button>
							</div>
						</div>
					</div>
				) : !uploadedImage ? (
					/* Empty state - Use getAspectRatioClass */
					<div className={`relative bg-transparent p-4 w-full transition-all duration-300 flex items-center justify-center ${getAspectRatioClass()}`}>
					
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
								<div className="flex items-center justify-center h-full">
									<div className="text-center">
										<div className="mb-4 text-neutral-500">
											<ImageIcon size={48} className="mx-auto mb-2" />
											<div className="text-lg font-medium mb-2">
												Your generation will be visible here.
											</div>
											<div className="text-sm text-neutral-600">
												{availableModels[selectedModel]?.name} • Text-to-Image
											</div>
											<div className="mt-4 text-sm text-lime-500">
												This model doesn't support image inputs.
											</div>
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
							className="relative group bg-neutral-800 rounded-[60px] overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] cursor-pointer"
							style={{
								aspectRatio: uploadedImage.aspectRatio || '3/4',
								maxWidth: '800px',
								maxHeight: '600px',
								width: 'fit-content',
								height: 'fit-content'
							}}
							onClick={handleClickUpload}
						>
							<img 
								src={uploadedImage.url} 
								alt={uploadedImage.name}
								className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
							/>
							{/* Image info overlay */}
							<div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-6 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
								<div className="text-white text-sm font-medium truncate">{uploadedImage.name}</div>
								<div className="text-white/70 text-xs">Click to replace</div>
							</div>
							{/* Remove button */}
							<button
								onClick={(e) => {
									e.stopPropagation();
									removeImage();
								}}
								className="absolute top-6 right-6 w-8 h-8 bg-red-500/80 hover:bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 hover:scale-110 z-10"
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
				
				{/* Right sidebar with + button and history - Hidden on mobile */}
				<div className="hidden lg:flex fixed right-4 top-1/2 transform -translate-y-1/2 z-50 flex-col items-center space-y-4">
					{/* History section */}
					{!isLoadingGenerations && previousGenerations.length > 0 && (
						<div className="flex flex-col items-center space-y-2 history-container">
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
											className={`w-12 h-12 bg-neutral-800 rounded-xl overflow-hidden group relative ${
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
			

			{/* Quick Edit Prompts - Above bottom bar */}
			{activeType === 'edit' && (
				<div className="fixed bottom-24 md:bottom-28 left-1/2 transform -translate-x-1/2 w-[95%] md:w-full max-w-3xl">
					<div className="flex gap-2 bg-neutral-950/40 backdrop-blur-xl rounded-2xl p-3">
						<button
							onClick={() => setPrompt('Add vibrant, realistic colors to this black and white image, maintaining natural skin tones and lighting, 4K ultra high resolution')}
							className="px-3 py-2 bg-neutral-900 hover:bg-neutral-800 rounded-lg text-xs text-white transition-colors flex-1"
						>
							Colorize
						</button>
						<button
							onClick={() => setPrompt('Remove all text, logos, and typography from this image while preserving the background and maintaining photorealistic quality, 4K resolution')}
							className="px-3 py-2 bg-neutral-900 hover:bg-neutral-800 rounded-lg text-xs text-white transition-colors flex-1"
						>
							Remove Text
						</button>
						<button
							onClick={() => setPrompt('Transform this product image into a professional advertising photo with dynamic lighting, appealing background, and commercial photography style, 4K ultra sharp')}
							className="px-3 py-2 bg-neutral-900 hover:bg-neutral-800 rounded-lg text-xs text-white transition-colors flex-1"
						>
							To Ad Image
						</button>
						<button
							onClick={() => setPrompt('Enhance lighting with professional studio-quality illumination, balanced shadows and highlights, cinematic lighting style, photorealistic 4K quality')}
							className="px-3 py-2 bg-neutral-900 hover:bg-neutral-800 rounded-lg text-xs text-white transition-colors flex-1"
						>
							Relight
						</button>
						<button
							onClick={() => setPrompt('Zoom out to show more of the scene, expanding the frame while maintaining image quality and natural perspective, 4K resolution')}
							className="px-3 py-2 bg-neutral-900 hover:bg-neutral-800 rounded-lg text-xs text-white transition-colors flex-1"
						>
							Zoom Out
						</button>
					</div>
				</div>
			)}

			{/* Bottom menu - Responsive */}
			<div className="fixed bottom-3 md:bottom-5 left-1/2 transform -translate-x-1/2 rounded-2xl md:rounded-3xl p-2 md:p-4 bg-neutral-950/40 backdrop-blur-xl border border-neutral-700/50 w-[95%] md:w-full max-w-3xl">
				{/* Mobile Layout - Stacked */}
				<div className="flex lg:hidden flex-col gap-3">
					{/* Top row - Model Selection + Aspect Ratio */}
					<div className="flex items-stretch gap-3 h-12">
						{/* Model Selection - Mobile */}
						<div className="flex-1 relative dropdown-container">
							{activeType === 'edit' ? (
								<div className="flex gap-2 h-full">
									<button
										onClick={() => setSelectedModel('black-forest-labs/flux-kontext-pro')}
										className={`px-3 py-2 rounded-xl text-xs font-medium transition-all flex-1 ${
											selectedModel === 'black-forest-labs/flux-kontext-pro'
												? 'bg-white text-black'
												: 'bg-neutral-900 text-neutral-300 hover:text-white'
										}`}
									>
										<div className="text-center">
											<div className="font-semibold">PRO</div>
											<div className="text-xs opacity-75">1 Credit</div>
										</div>
									</button>
									<button
										onClick={() => setSelectedModel('black-forest-labs/flux-kontext-max')}
										className={`px-3 py-2 rounded-xl text-xs font-medium transition-all flex-1 ${
											selectedModel === 'black-forest-labs/flux-kontext-max'
												? 'bg-white text-black'
												: 'bg-neutral-900 text-neutral-300 hover:text-white'
										}`}
									>
										<div className="text-center">
											<div className="font-semibold">MAX</div>
											<div className="text-xs opacity-75">2 Credits</div>
										</div>
									</button>
								</div>
							) : (
								<>
							<button
								onClick={() => toggleDropdown('model')}
								className="w-full bg-neutral-900 rounded-xl px-3 py-2 text-white text-xs flex items-center justify-between h-full"
							>
								<div className="flex items-center gap-2">
									<div className="w-4 h-4 bg-white/10 rounded-md flex items-center justify-center p-0.5">
										<img 
											src={getModelLogo(selectedModel)}
											alt={availableModels[selectedModel]?.name}
											className="w-full h-full object-contain"
											onError={(e) => {
												e.target.style.display = 'none';
											}}
										/>
									</div>
									<span className="truncate">{availableModels[selectedModel]?.name || selectedModel}</span>
								</div>
								<CaretDown size={12} className={`text-neutral-400 transition-transform ${openDropdowns.model ? 'rotate-180' : ''}`} />
							</button>
							
							{openDropdowns.model && (
								<div className="absolute bottom-full left-0 right-0 mb-2 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
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
											<div className="flex-1 min-w-0">
												<div className="text-sm truncate">{model.name}</div>
												<div className="text-xs text-neutral-500">{getModelSupport(id)}</div>
											</div>
										</button>
									))}
								</div>
							)}
								</>
							)}
						</div>

					</div>
					
					
					{/* Regular prompt input - Mobile */}
					<div className="relative">
						<textarea
							value={prompt}
							onChange={(e) => setPrompt(e.target.value)}
							placeholder={activeType === 'edit' ? "Describe your custom edit..." : "Describe what you want to create..."}
							className="w-full bg-transparent border-none rounded-xl px-3 py-3 text-white placeholder-neutral-500 resize-none focus:outline-none text-sm font-light tracking-wide h-20"
						/>
					</div>
					
					{/* Generate button with Aspect Ratio - Mobile */}
					<div className="flex items-stretch gap-3 h-12">
						{/* Aspect Ratio - Mobile (if available) */}
						{modelConfig?.options?.aspect_ratio && (
							<div className="flex items-center gap-2 bg-neutral-900 rounded-xl px-3 py-2 min-w-[80px] dropdown-container relative">
								<button
									onClick={() => toggleDropdown('aspect_ratio_bottom')}
									className="flex items-center justify-between text-white text-xs w-full"
								>
									<div className="font-medium">
										{(selectedModel === 'black-forest-labs/flux-kontext-pro' || selectedModel === 'black-forest-labs/flux-kontext-max') && (getSettingValue('aspect_ratio') === 'match_input_image' || uploadedImage) ? 'auto' : (getSettingValue('aspect_ratio') || '1:1')}
									</div>
									<CaretDown size={12} className={`text-neutral-400 transition-transform ${openDropdowns.aspect_ratio_bottom ? 'rotate-180' : ''}`} />
								</button>
								
								{openDropdowns.aspect_ratio_bottom && (
									<div className="absolute bottom-full left-0 right-0 mb-2 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
										{modelConfig.options.aspect_ratio.map(option => (
											<button
												key={option}
												onClick={() => {
													handleSettingChange('aspect_ratio', option);
													closeAllDropdowns();
												}}
												className={`w-full text-left px-3 py-2 text-sm transition-colors ${
													getSettingValue('aspect_ratio') === option 
														? 'bg-neutral-700 text-white' 
														: 'text-neutral-300 hover:bg-neutral-700'
												}`}
											>
												{(selectedModel === 'black-forest-labs/flux-kontext-pro' || selectedModel === 'black-forest-labs/flux-kontext-max') && option === 'match_input_image' ? 'auto' : option}
											</button>
										))}
									</div>
								)}
							</div>
						)}

						{/* Generate button - Mobile */}
						<button
							onClick={handleGenerate}
							disabled={!prompt.trim() || isGenerating}
							className="flex-1 bg-lime-400 hover:bg-lime-300 text-black font-medium tracking-wide rounded-xl disabled:bg-neutral-700/50 disabled:text-neutral-500 transition-all shadow-lg text-sm py-3 flex flex-col items-center justify-center gap-1"
						>
							<span>{isGenerating ? 'GENERATING...' : 'GENERATE'}</span>
							<span className="text-black font-bold text-xs tracking-wider uppercase">
								{calculateCredits()} CREDITS
							</span>
						</button>
					</div>
				</div>

				{/* Desktop Layout - Single Row */}
				<div className="hidden lg:flex items-stretch gap-3 h-16">
					{/* Model and Ratio Controls */}
					<div className="flex flex-col gap-2 w-48 dropdown-container">
						{/* Model Selection */}
						<div className="relative">
							{activeType === 'edit' ? (
								<div className="flex gap-2">
									<button
										onClick={() => setSelectedModel('black-forest-labs/flux-kontext-pro')}
										className={`px-3 py-2 rounded-lg text-xs font-medium transition-all flex-1 h-7 ${
											selectedModel === 'black-forest-labs/flux-kontext-pro'
												? 'bg-white text-black'
												: 'bg-neutral-900 text-neutral-300 hover:text-white'
										}`}
									>
										<div className="text-center">
											<div className="font-semibold text-xs">PRO</div>
										</div>
									</button>
									<button
										onClick={() => setSelectedModel('black-forest-labs/flux-kontext-max')}
										className={`px-3 py-2 rounded-lg text-xs font-medium transition-all flex-1 h-7 ${
											selectedModel === 'black-forest-labs/flux-kontext-max'
												? 'bg-white text-black'
												: 'bg-neutral-900 text-neutral-300 hover:text-white'
										}`}
									>
										<div className="text-center">
											<div className="font-semibold text-xs">MAX</div>
										</div>
									</button>
								</div>
							) : (
								<>
									<button
										onClick={() => toggleDropdown('model_bottom')}
										className="w-full bg-neutral-900 rounded-lg px-3 py-2 text-white text-xs flex items-center justify-between h-7"
									>
										<div className="flex items-center gap-2">
											<div className="w-4 h-4 bg-white/10 rounded-md flex items-center justify-center p-0.5">
												<img 
													src={getModelLogo(selectedModel)}
													alt={availableModels[selectedModel]?.name}
													className="w-full h-full object-contain"
													onError={(e) => {
														e.target.style.display = 'none';
													}}
												/>
											</div>
											<span className="truncate text-xs">{availableModels[selectedModel]?.name || selectedModel}</span>
										</div>
										<CaretDown size={12} className={`text-neutral-400 transition-transform ${openDropdowns.model_bottom ? 'rotate-180' : ''}`} />
									</button>
									
									{openDropdowns.model_bottom && (
										<div className="absolute bottom-full left-0 right-0 mb-2 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
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
													<div className="flex-1 min-w-0">
														<div className="text-sm truncate">{model.name}</div>
														<div className="text-xs text-neutral-500">{getModelSupport(id)}</div>
													</div>
												</button>
											))}
										</div>
									)}
								</>
							)}
						</div>
						
						{/* Aspect Ratio - Desktop (if available) */}
						{modelConfig?.options?.aspect_ratio && (
							<div className="relative">
								<button
									onClick={() => toggleDropdown('aspect_ratio_desktop')}
									className="w-full bg-neutral-900 rounded-lg px-3 py-2 text-white text-xs flex items-center justify-between h-7"
								>
									<div className="font-medium">
										{(selectedModel === 'black-forest-labs/flux-kontext-pro' || selectedModel === 'black-forest-labs/flux-kontext-max') && (getSettingValue('aspect_ratio') === 'match_input_image' || uploadedImage) ? 'auto' : (getSettingValue('aspect_ratio') || '1:1')}
									</div>
									<CaretDown size={12} className={`text-neutral-400 transition-transform ${openDropdowns.aspect_ratio_desktop ? 'rotate-180' : ''}`} />
								</button>
								
								{openDropdowns.aspect_ratio_desktop && (
									<div className="absolute bottom-full left-0 right-0 mb-2 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
										{modelConfig.options.aspect_ratio.map(option => (
											<button
												key={option}
												onClick={() => {
													handleSettingChange('aspect_ratio', option);
													closeAllDropdowns();
												}}
												className={`w-full text-left px-3 py-2 text-sm transition-colors ${
													getSettingValue('aspect_ratio') === option 
														? 'bg-neutral-700 text-white' 
														: 'text-neutral-300 hover:bg-neutral-700'
												}`}
											>
												{(selectedModel === 'black-forest-labs/flux-kontext-pro' || selectedModel === 'black-forest-labs/flux-kontext-max') && option === 'match_input_image' ? 'auto' : option}
											</button>
										))}
								</div>
							)}
						</div>
					)}
				</div>
					
					
					{/* Regular prompt input - Desktop */}
					<div className="flex-1 relative h-full">
						<textarea
							value={prompt}
							onChange={(e) => setPrompt(e.target.value)}
							placeholder={activeType === 'edit' ? "Describe your custom edit..." : "Describe a scene and click generate"}
							className="w-full h-full bg-transparent border-none text-white placeholder-neutral-500 resize-none focus:outline-none text-sm font-light tracking-wide"
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
						<div className="text-xs text-lime-500 text-center font-bold tracking-wider uppercase">
							{calculateCredits()} CREDITS
						</div>
					</div>
				</div>
			</div>
		</div> {/* End Main Layout */}
		</div>
	);
};

export default GenerationPage;
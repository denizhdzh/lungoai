import React, { useState, useRef } from 'react';
import { models, getModelById, getModelsByCategory } from '../config/models.js';
import { 
	Upload,
	Image as ImageIcon,
	Video as VideoIcon,
	CaretDown,
	X,
	Plus
} from '@phosphor-icons/react';

const GenerationPage = () => {
	const [activeType, setActiveType] = useState('image');
	const [selectedModel, setSelectedModel] = useState('black-forest-labs/flux-1.1-pro');
	const [prompt, setPrompt] = useState('');
	const [settings, setSettings] = useState({});
	const [uploadedImages, setUploadedImages] = useState([]);
	const [isDragOver, setIsDragOver] = useState(false);
	const fileInputRef = useRef(null);
	const dropAreaRef = useRef(null);
	
	// Get current model config
	const modelConfig = getModelById(selectedModel);
	const availableModels = getModelsByCategory(activeType);
	
	// Handle settings change
	const handleSettingChange = (key, value) => {
		setSettings(prev => ({
			...prev,
			[key]: value
		}));
	};
	
	// Get setting value with fallback to model default
	const getSettingValue = (key) => {
		if (settings[key] !== undefined) {
			return settings[key];
		}
		return modelConfig?.params?.[key]?.default;
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
		
		// OpenAI supports multiple images, but let's limit to 5 for UI purposes
		const remainingSlots = Math.max(0, 5 - uploadedImages.length);
		const filesToAdd = imageFiles.slice(0, remainingSlots);
		
		filesToAdd.forEach(file => {
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
					setUploadedImages(prev => [...prev, newImage]);
				};
				img.src = e.target.result;
			};
			reader.readAsDataURL(file);
		});
	};

	const removeImage = (imageId) => {
		setUploadedImages(prev => prev.filter(img => img.id !== imageId));
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
		const files = e.dataTransfer.files;
		handleFileUpload(files);
	};

	const handleClickUpload = () => {
		fileInputRef.current?.click();
	};

	// Handle generate
	const handleGenerate = () => {
		console.log('Generating with:', {
			type: activeType,
			model: selectedModel,
			prompt,
			settings,
			uploadedImages: uploadedImages,
			creditsNeeded: calculateCredits()
		});
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
									setSelectedModel('black-forest-labs/flux-1.1-pro');
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
					<div className="bg-neutral-900 rounded-[10px] p-3">
						<div className="text-xs text-neutral-400 mb-2">Model</div>
						<select 
							value={selectedModel}
							onChange={(e) => setSelectedModel(e.target.value)}
							className="w-full bg-transparent text-white text-sm border-none focus:outline-none appearance-none"
						>
							{Object.entries(availableModels).map(([id, model]) => (
								<option key={id} value={id} className="bg-neutral-900">
									{model.name}
								</option>
							))}
						</select>
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
						
						// Handle all other options as dropdown
						if (options && options.length > 2) {
							return (
								<div key={key} className="bg-neutral-900 rounded-[10px] p-3">
									<div className="text-xs text-neutral-400 mb-2 capitalize">
										{key.replace(/_/g, ' ')}
									</div>
									<div className="relative">
										<select
											value={value || ''}
											onChange={(e) => handleSettingChange(key, e.target.value)}
											className="w-full bg-transparent text-white text-sm border-none focus:outline-none appearance-none pr-6"
										>
											{options.map(option => (
												<option key={option} value={option} className="bg-neutral-900">
													{option}
												</option>
											))}
										</select>
										<CaretDown size={14} className="absolute right-0 top-1/2 transform -translate-y-1/2 text-neutral-400 pointer-events-none" />
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
				{uploadedImages.length === 0 ? (
					/* Empty state - Use getAspectRatioClass */
					<div className={`relative bg-transparent p-4 w-full transition-all duration-300 ${getAspectRatioClass()}`}>
					
						{/* Inner frame - Drop Area */}
						<div 
							ref={dropAreaRef}
							onDragOver={handleDragOver}
							onDragLeave={handleDragLeave}
							onDrop={handleDrop}
							onClick={handleClickUpload}
							className={`w-full h-full rounded-[60px] flex items-center justify-center transition-all duration-300 cursor-pointer relative overflow-hidden bg-neutral-900 hover:bg-neutral-800 ${isDragOver ? 'bg-neutral-800 border-2 border-dashed border-lime-400' : 'border-2 border-dashed border-neutral-700'}`}
						>
							<div className="text-center">
								<div className={`mb-4 transition-colors ${isDragOver ? 'text-lime-400' : 'text-neutral-400'}`}>
									<Upload size={48} className="mx-auto mb-2" />
									<div className="text-lg font-medium mb-2">
										{isDragOver ? 'Drop images here' : 'Drop images or click to upload'}
									</div>
									<div className="text-sm text-neutral-500">
										Support multiple images (max 5) • PNG, JPG, WEBP
									</div>
								</div>
							</div>
						</div>
					</div>
				) : (
					/* Grid layout for all images */
					<div className="relative bg-transparent p-4 w-full h-full transition-all duration-300 flex items-center justify-center">
						
						{/* Grid container */}
						<div className={` overflow-visible bg-neutral-900/0 p-4 ${
							uploadedImages.length === 1 ? 'flex items-center justify-center' :
							uploadedImages.length === 2 ? 'grid grid-cols-2 gap-3 items-center justify-center' :
							uploadedImages.length === 3 ? 'grid grid-cols-3 gap-3 items-center justify-center' :
							uploadedImages.length === 4 ? 'grid grid-cols-2 grid-rows-2 gap-3 place-items-center' :
							'grid grid-cols-3 grid-rows-2 gap-3 place-items-center'
						}`} style={{
							width: 'fit-content',
							maxWidth: '90%'
						}}>
							{uploadedImages.map((image) => {
								const containerSize = uploadedImages.length === 1 ? 500 : 
													uploadedImages.length <= 3 ? 300 : 250;
								
								return (
								<div 
									key={image.id}
									className="relative group bg-neutral-800 rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02]"
									style={{
										aspectRatio: '3/4',
										width: `${containerSize}px`,
										height: `${containerSize * 4/3}px`
									}}
								>
										<img 
											src={image.url} 
											alt={image.name}
											className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
										/>
										{/* Image info overlay */}
										<div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
											<div className="text-white text-sm font-medium truncate">{image.name}</div>
										</div>
										<button
											onClick={(e) => {
												e.stopPropagation();
												removeImage(image.id);
											}}
											className="absolute top-3 right-3 w-8 h-8 bg-red-500/80 hover:bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 hover:scale-110 z-10"
										>
											<X size={16} className="text-white" />
										</button>
									
								</div>
								);
							})}
						</div>
					</div>
				)}
				
				{/* Hidden file input */}
				<input
					ref={fileInputRef}
					type="file"
					accept="image/*"
					multiple
					className="hidden"
					onChange={(e) => handleFileUpload(e.target.files)}
				/>
				
				{/* Add more button - Outside the main area */}
				{uploadedImages.length > 0 && uploadedImages.length < 5 && (
					<div className="fixed top-1/2 right-4 transform -translate-y-1/2 z-50">
						<button
							onClick={handleClickUpload}
							className="w-12 h-12 border-2 border-dashed border-neutral-700 hover:border-lime-400 rounded-xl flex items-center justify-center transition-colors group bg-neutral-900/80 backdrop-blur-sm"
						>
							<Plus size={20} className="text-neutral-600 group-hover:text-lime-400" />
						</button>
					</div>
				)}
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
									disabled={!prompt.trim()}
									className="px-8 py-3 bg-white/90 hover:bg-white text-black font-normal tracking-wide rounded-2xl disabled:bg-neutral-700/50 disabled:text-neutral-500 transition-all hover:scale-105 shadow-lg text-sm"
								>
									GENERATE
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
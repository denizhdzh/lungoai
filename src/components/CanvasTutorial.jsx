import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Info, ArrowLeft, ArrowRight } from '@phosphor-icons/react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

const CanvasTutorial = ({ user, isOpen, onClose, onOpenTutorial }) => {
	const [currentStep, setCurrentStep] = useState(0);
	const [showTutorial, setShowTutorial] = useState(false);

	const tutorialSteps = [
		{
			title: "Move",
			description: "Right click and drag to move around the canvas. Use mouse wheel to zoom in and out.",
			visual: "🖱️",
			shortcut: "Right Click + Drag"
		},
		{
			title: "Create Blocks",
			description: "Right click anywhere to open the block menu. Choose from Image, Slideshow, or Upload blocks.",
			visual: "➕",
			shortcut: "Right Click"
		},
		{
			title: "Select Multiple",
			description: "Hold Shift and drag to select multiple blocks at once. Perfect for organizing your workspace.",
			visual: "🔲",
			shortcut: "Shift + Drag"
		},
		{
			title: "Connect Blocks",
			description: "Drag blocks onto each other to create connections. Images will automatically transfer between connected blocks.",
			visual: "🔗",
			shortcut: "Drag & Drop"
		},
		{
			title: "Configure Blocks",
			description: "Hover over blocks to see configuration options. Change settings like generation type, language, and more.",
			visual: "⚙️",
			shortcut: "Hover + Click"
		},
		{
			title: "Generate Content",
			description: "Enter your prompt and click the arrow button to generate AI content. Monitor progress in the bottom right.",
			visual: "✨",
			shortcut: "Enter + Click ↗"
		},
		{
			title: "Organize Workspace",
			description: "Use snap-to-grid for perfect alignment. Delete blocks with right-click menu. Save happens automatically.",
			visual: "📐",
			shortcut: "Auto-Save"
		}
	];

	// Check if user has completed tutorial
	useEffect(() => {
		const checkTutorialStatus = async () => {
			if (!user?.uid) return;
			
			try {
				const tutorialDoc = await getDoc(doc(db, 'userTutorials', user.uid));
				const completed = tutorialDoc.exists() && tutorialDoc.data()?.canvasTutorialCompleted;
				
				if (!completed && !isOpen) {
					setShowTutorial(true);
				}
			} catch (error) {
				console.warn('Failed to check tutorial status:', error);
				// Show tutorial by default if we can't check
				if (!isOpen) {
					setShowTutorial(true);
				}
			}
		};

		checkTutorialStatus();
	}, [user, isOpen]);

	// Mark tutorial as completed
	const completeTutorial = async () => {
		if (!user?.uid) return;
		
		try {
			await setDoc(doc(db, 'userTutorials', user.uid), {
				canvasTutorialCompleted: true,
				completedAt: new Date().toISOString()
			}, { merge: true });
		} catch (error) {
			console.warn('Failed to save tutorial completion:', error);
		}
	};

	const handleClose = () => {
		setShowTutorial(false);
		if (onClose) onClose();
		if (currentStep === tutorialSteps.length - 1) {
			completeTutorial();
		}
	};

	const nextStep = () => {
		if (currentStep < tutorialSteps.length - 1) {
			setCurrentStep(currentStep + 1);
		} else {
			completeTutorial();
			handleClose();
		}
	};

	const prevStep = () => {
		if (currentStep > 0) {
			setCurrentStep(currentStep - 1);
		}
	};

	const openTutorial = () => {
		setCurrentStep(0);
		setShowTutorial(true);
		if (onOpenTutorial) onOpenTutorial();
	};

	const currentStepData = tutorialSteps[currentStep];
	const isVisible = showTutorial || isOpen;

	if (!isVisible) {
		return (
			<button
				onClick={openTutorial}
				className="fixed bottom-4 right-4 z-40 w-10 h-10 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 rounded-full flex items-center justify-center text-neutral-400 hover:text-white transition-all duration-200 shadow-lg"
				title="Open Canvas Tutorial"
			>
				<Info size={16} />
			</button>
		);
	}

	return createPortal(
		<div className="fixed bottom-4 left-4 right-4 z-[9999]">
			<div className="bg-neutral-900/95 backdrop-blur-lg border border-neutral-700 rounded-2xl shadow-2xl max-w-2xl mx-auto">
				{/* Compact Header */}
				<div className="flex items-center justify-between p-4">
					<div className="flex items-center gap-3">
						<div className="text-2xl">{currentStepData.visual}</div>
						<div>
							<h3 className="font-bold text-white">{currentStepData.title}</h3>
							<p className="text-xs text-neutral-400">
								{currentStep + 1} of {tutorialSteps.length}
							</p>
						</div>
					</div>
					<button
						onClick={handleClose}
						className="w-7 h-7 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
					>
						<X size={14} />
					</button>
				</div>

				{/* Compact Content */}
				<div className="px-4 pb-4">
					<p className="text-sm text-neutral-300 mb-3">
						{currentStepData.description}
					</p>

					{/* Inline Shortcut */}
					<div className="flex items-center justify-between mb-4">
						<div className="bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-1.5">
							<span className="text-xs text-neutral-400 mr-2">Shortcut:</span>
							<span className="text-sm font-bold text-white">
								{currentStepData.shortcut}
							</span>
						</div>

						{/* Progress Dots */}
						<div className="flex gap-1">
							{tutorialSteps.map((_, index) => (
								<button
									key={index}
									onClick={() => setCurrentStep(index)}
									className={`w-2 h-2 rounded-full transition-all duration-200 ${
										index === currentStep 
											? 'bg-white scale-110' 
											: index < currentStep
											? 'bg-neutral-500'
											: 'bg-neutral-700 hover:bg-neutral-600'
									}`}
								/>
							))}
						</div>
					</div>

					{/* Navigation */}
					<div className="flex items-center justify-between">
						<button
							onClick={prevStep}
							disabled={currentStep === 0}
							className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-white text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						>
							<ArrowLeft size={14} />
							Previous
						</button>

						<button
							onClick={nextStep}
							className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white hover:bg-neutral-200 text-black text-sm font-medium transition-colors"
						>
							{currentStep === tutorialSteps.length - 1 ? 'Finish' : 'Next'}
							{currentStep < tutorialSteps.length - 1 && <ArrowRight size={14} />}
						</button>
					</div>
				</div>
			</div>
		</div>,
		document.body
	);
};

export default CanvasTutorial; 
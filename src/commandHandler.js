import { auth, db } from './firebase'; // May need db for deletes later
import { getFunctions, httpsCallable } from "firebase/functions"; // Import Firebase Functions SDK for frontend
import { deleteDoc, doc, collection, query, where, getDocs } from 'firebase/firestore';
import { commandDefinitions } from './command'; // Import command definitions

// Get Functions instance (needed for calling functions from frontend code)
const functions = getFunctions();

// --- English Helper for user-friendly messages ---
const getFriendlyTaskNameEN = (functionName) => {
  switch (functionName) {
    case 'generateContentPlan': return 'content plan generation';
    case 'generateImage': return 'image generation';
    case 'generateVideo': return 'video generation';
    case 'generateImageSlideshow': return 'slideshow creation';
    case 'editImage': return 'image editing';
    case 'requestImageGeneration': return 'UGC Video - Image Step';
    case 'triggerVideoGenerationAndHook': return 'UGC Video - Video Step';
    default: return functionName; // Fallback
  }
};

// --- Specific Command Handlers ---

async function handleDataManagement(command, context) {
    const { commandCode, parameters } = command;
    const { setUserMessages, setPendingConfirmation, products, creators, backgrounds, commandDef, fetchProducts, fetchCreatorsAndBackgrounds, user } = context;

    if (!user || !user.uid) {
        setUserMessages(prev => [...prev, "User not authenticated for data management."]);
        return { processed: true };
    }
    const userId = user.uid;

    const itemType = commandCode === 501 || commandCode === 502 ? 'product' :
                     commandCode === 503 || commandCode === 504 ? 'creator' :
                     commandCode === 505 || commandCode === 506 ? 'background' : null;

    const identifier = parameters[`${itemType}_identifier`];
    const addParams = parameters;

    const commandName = commandDef?.name || `Command ${commandCode}`;
    // console.log(`Handling Data Command: ${commandName}, Type: ${itemType}, Identifier: ${identifier}`);

    if (!itemType && ![501,503,505].includes(commandCode)) {
        setUserMessages(prev => [...prev, "Sorry, I can't process that data management request right now. Please try again later."]);
        return { processed: true };
    }

    if (commandCode === 501 /* ADD_PRODUCT */) {
        if (!addParams.product_name || !addParams.product_description) {
            setUserMessages(prev => [...prev, "To add a product, I need its name and a description. You can manage products in Settings > Products."]);
        } else {
            try {
                await addDoc(collection(db, 'users', userId, 'products'), {
                    name: addParams.product_name,
                    description: addParams.product_description,
                    logoUrl: addParams.product_logo_url,
                    imageUrl: addParams.product_image_url,
                    createdAt: serverTimestamp()
                });
                setUserMessages(prev => [...prev, `Product "${addParams.product_name}" added successfully.`]);
                if (fetchProducts) fetchProducts();
            } catch (error) {
                console.error("Error adding product:", error);
                setUserMessages(prev => [...prev, `Error adding product: ${error.message}`]);
            }
        }
        return { processed: true };
    } else if (commandCode === 503 /* ADD_CREATOR */) {
        if (!addParams.creator_name) {
            setUserMessages(prev => [...prev, "To add a creator, I need their name. You can manage creators in Settings > Creators."]);
        } else {
            try {
                await addDoc(collection(db, 'users', userId, 'creators'), {
                    name: addParams.creator_name,
                    imageUrl: addParams.creator_image_url,
                    createdAt: serverTimestamp()
                });
                setUserMessages(prev => [...prev, `Creator "${addParams.creator_name}" added successfully.`]);
                if (fetchCreatorsAndBackgrounds) fetchCreatorsAndBackgrounds();
            } catch (error) {
                console.error("Error adding creator:", error);
                setUserMessages(prev => [...prev, `Error adding creator: ${error.message}`]);
            }
        }
        return { processed: true };
    } else if (commandCode === 505 /* ADD_BACKGROUND - from image ID */) {
        setUserMessages(prev => [...prev, "To save a generated image as a background, use the save option after an image is generated."]);
        return { processed: true };
    }

    let itemsToList = [];
    if (itemType === 'product') itemsToList = products;
    else if (itemType === 'creator') itemsToList = creators;
    else if (itemType === 'background') itemsToList = backgrounds;

    if (commandCode === 502 || commandCode === 504 || commandCode === 506) {
        if (!itemsToList || itemsToList.length === 0) {
            setUserMessages(prev => [...prev, `You have no ${itemType}s to delete.`]);
            return { processed: true };
        }
        if (!identifier) {
            setUserMessages(prev => [...prev, `Which ${itemType} would you like to delete? Please type its name or ID.`]);
            setPendingConfirmation({ type: `delete_${itemType}`, options: itemsToList, command });
        } else {
            const itemToDelete = itemsToList.find(item => item.name?.toLowerCase() === identifier.toLowerCase() || item.id === identifier);
            if (itemToDelete) {
                setUserMessages(prev => [...prev, `Are you sure you want to delete ${itemType} "${itemToDelete.name || itemToDelete.id}"? (yes/no)`]);
                setPendingConfirmation({ type: 'confirm_delete', identifier: itemToDelete.name || itemToDelete.id, item: itemToDelete, command });
            } else {
                setUserMessages(prev => [...prev, `${itemType.charAt(0).toUpperCase() + itemType.slice(1)} "${identifier}" not found. Available: ${itemsToList.map(i => i.name || i.id).join(', ') || 'None'}`]);
            }
        }
        return { processed: true };
    }

    setUserMessages(prev => [...prev, `Data management command ${commandName} not fully handled yet.`]);
    return { processed: true };
}

function handleUiControl(command, context) {
    const { commandCode, parameters } = command;
    const { navigate, toggleDarkMode, setUserMessages, commandDef } = context;

    const commandName = commandDef?.name || `Command ${commandCode}`;

    if (commandCode === 601) {
        const target = parameters.target_view?.toLowerCase();
        if (['generator', 'calendar', 'settings', 'pricing'].includes(target)) {
            const path = target === 'generator' ? '/' : `/${target}`;
            navigate(path);
            setUserMessages(prev => [...prev, `Okay, you're now on the ${target} page.`]);
        } else {
             setUserMessages(prev => [...prev, "I can take you to 'generator', 'calendar', 'settings', or 'pricing'. Which page would you like to see?"]);
        }
    } else if (commandCode === 602) {
        const tab = parameters.tab_name;
        if (tab && typeof tab === 'string' && ['User Profile', 'Plan & Billing', 'Products', 'TikTok Accounts', 'UGC Creators', 'Background Images', 'Feature Requests'].some(validTab => tab.toLowerCase().includes(validTab.toLowerCase().split(' ')[0]))) {
            navigate('/settings', { state: { initialTab: tab } });
            setUserMessages(prev => [...prev, `Okay, you're now on the Settings > ${tab} page.`]);
        } else {
            setUserMessages(prev => [...prev, "I can navigate to these Settings tabs: User Profile, Plan & Billing, Products, TikTok Accounts, UGC Creators, Background Images, or Feature Requests. Which one did you mean?"]);
        }
    } else if (commandCode === 603) {
        toggleDarkMode();
        setUserMessages(prev => [...prev, "Theme updated!"]);
    } else if (commandCode === 604) {
         setUserMessages([]);
    } else if (commandCode === 605) {
         setUserMessages(prev => [...prev, "Filtering favorites is coming soon!"]);
    } else {
         setUserMessages(prev => [...prev, "I didn't understand that command. Please try again."]);
    }
    return { processed: true };
}

async function handleAuth(command, context) {
    const { commandCode } = command;
    const { setUserMessages, commandDef } = context;

    const commandName = commandDef?.name || `Command ${commandCode}`;

    if (commandCode === 701) {
        try {
            setUserMessages(prev => [...prev, "Signing you out now..."]);
            await auth.signOut();
        } catch (error) {
            console.error("Error signing out:", error);
            setUserMessages(prev => [...prev, "Oops, I couldn't sign you out. Please try again later."]);
        }
    } else {
        setUserMessages(prev => [...prev, "I'm not sure what you mean. Please try again."]);
    }
     return { processed: true };
}

async function handleBackendCommand(command, context) {
    const { commandCode, parameters } = command;
    const { 
        user, 
        setUserMessages, 
        setGeneratingItem, 
        refreshDashboardGenerations, 
        setActiveImageData,
        firestoreUserData
    } = context;

    if (!user || !user.uid) {
        setUserMessages(prev => [...prev, "User not authenticated for backend command."]);
        return Promise.reject(new Error("User not authenticated."));
    }
    const userId = user.uid;

    let imageCredit = 0;
    let videoCredit = 0;
    let slideshowCredit = 0;

    if (firestoreUserData) {
        imageCredit = parseInt(firestoreUserData.image_credit, 10) || 0;
        videoCredit = parseInt(firestoreUserData.video_credit, 10) || 0;
        slideshowCredit = parseInt(firestoreUserData.slideshow_credit, 10) || 0;
        // console.log(`[commandHandler] Credits from Firestore for user ${userId}: Images=${imageCredit}, Videos=${videoCredit}, Slideshows=${slideshowCredit}`);
            } else {
        console.warn(`[commandHandler] firestoreUserData was not available for user ${userId}. Assuming 0 credits for all types.`);
    }

    let callableFunctionName = null;
    let payload = { ...parameters, userId }; 
    let creditTypeNeeded = null;
    let currentCreditsForType = 0;

    if (commandCode >= 100 && commandCode < 200) {
        if (commandCode === 101) {
            callableFunctionName = 'requestImageGeneration'; 
            payload = {
                subject_description: parameters.subject_description,
                action_description: parameters.action_description,
                setting_description: parameters.setting_description,
                character_reaction: parameters.character_reaction,
                mentionedCreatorId: parameters.mentionedCreatorId,
                userId: userId
            };
        }
    } else if (commandCode >= 200 && commandCode < 300) {
        callableFunctionName = 'generateImage';
        payload = { commandCode, ...parameters, userId };
        creditTypeNeeded = 'image';
        currentCreditsForType = imageCredit;
    } else if (commandCode >= 300 && commandCode < 400) {
        callableFunctionName = 'generateImageSlideshow';
        payload = { ...parameters, userId };
        creditTypeNeeded = 'slideshow';
        currentCreditsForType = slideshowCredit;
    } else if (commandCode >= 400 && commandCode < 500) {
        callableFunctionName = 'editImage';
        payload = { ...parameters, userId };
        creditTypeNeeded = 'image';
        currentCreditsForType = imageCredit;
    }

    if (creditTypeNeeded) {
        // console.log(`[commandHandler] Credit Check for CMD ${commandCode} (User: ${userId}): Needs ${creditTypeNeeded}, Has ${currentCreditsForType}`);
        if (currentCreditsForType <= 0) {
            const errMessage = `Insufficient ${creditTypeNeeded} credits. You currently have ${currentCreditsForType}.`;
            console.warn(`[commandHandler] ${errMessage} Please upgrade or wait for renewal.`);
            setUserMessages(prev => [...prev, ` ${errMessage} Please upgrade your plan or wait for credits to renew.`]);
            return Promise.reject({ code: 'resource-exhausted', message: `Insufficient ${creditTypeNeeded} credits.` });
        }
    }

    if (!callableFunctionName) {
        setUserMessages(prev => [...prev, `Command ${commandCode} is not mapped to a known backend generation function.`]);
        console.error(`[commandHandler] No callableFunction for command code ${commandCode}`);
        return Promise.reject(new Error(`Configuration error: No backend function for command ${commandCode}.`));
    }

    const friendlyName = getFriendlyTaskNameEN(callableFunctionName);
    setUserMessages(prev => [...prev, `Starting ${friendlyName}... This may take a moment.`]);

    if (callableFunctionName === 'requestImageGeneration') {
         setGeneratingItem({ 
            type: 'video', 
            name: parameters.subject_description || 'UGC Video', 
            status: 'initiating', 
            commandCode: commandCode 
        });
    } else if (callableFunctionName === 'generateImage') { 
         setGeneratingItem({ 
            type: 'image', 
            name: parameters.subject_description || parameters.scene_description || parameters.image_subject || 'Image', 
            status: 'generating', 
            commandCode: commandCode 
        });
    } else if (callableFunctionName === 'generateImageSlideshow') {
         setGeneratingItem({ 
            type: 'slideshow', 
            name: parameters.topic || 'Slideshow', 
            status: 'generating', 
            commandCode: commandCode 
        });
    } else if (callableFunctionName === 'editImage') {
        setGeneratingItem({ 
            type: 'image_edit', 
            name: `Editing image ${parameters.image_id || ''}`.trim(), 
            status: 'editing', 
            commandCode: commandCode 
        });
    }

    const callable = httpsCallable(functions, callableFunctionName);

    try {
        // console.log(`[commandHandler] Calling backend function: ${callableFunctionName} for user ${userId} with payload:`, JSON.stringify(payload));
        const result = await callable(payload);
        const data = result.data;
        // console.log(`[commandHandler] Response from ${callableFunctionName} for user ${userId}:`, JSON.stringify(data));

        setUserMessages(prev => prev.filter(msg => !msg.includes(`⏳ Starting ${friendlyName}`)));

        if (data.success) {
            if (callableFunctionName === 'generateImage') {
                setUserMessages(prev => [...prev, `${friendlyName} successful! Image ready.`]);
                if (data.imageUrl) {
                    setActiveImageData({ 
                        url: data.imageUrl, 
                        commandCode: commandCode, 
                        generationData: { 
                            prompt: data.finalPrompt, 
                            style: parameters.image_style,
                            originalParameters: data.originalParameters, 
                            firestoreDocId: data.firestoreDocId 
                        }
                    });
                }
                setGeneratingItem(null);
                refreshDashboardGenerations();
            } else if (callableFunctionName === 'requestImageGeneration') {
                setUserMessages(prev => [...prev, `${friendlyName} initiated. Video is now being processed.`]);
                if (data.data && data.data.firestoreDocId) {
                        setGeneratingItem(prev => ({
                        ...(prev || {}),
                        type: 'video',
                        status: 'processing',
                        firestoreDocId: data.data.firestoreDocId,
                        name: parameters.subject_description || 'UGC Video'
                    }));
                } else {
                    console.error("[commandHandler] requestImageGeneration succeeded but firestoreDocId was missing.");
                    setUserMessages(prev => [...prev, "Video pipeline started but tracking ID is missing. Please check dashboard later."]);
                    setGeneratingItem(null);
                }
            } else if (callableFunctionName === 'generateImageSlideshow') {
                setUserMessages(prev => [...prev, `${friendlyName} successful! Slideshow generated.`]);
                // console.log("Slideshow data:", data.data);
                    setGeneratingItem(null); 
                refreshDashboardGenerations();
            } else if (callableFunctionName === 'editImage') {
                setUserMessages(prev => [...prev, `Image editing successful!`]);
                if (data.imageUrl) {
                    setActiveImageData({ url: data.imageUrl, commandCode: commandCode, generationData: { /* TODO: Pass relevant edit data if needed for save */ } });
                }
                setGeneratingItem(null);
                refreshDashboardGenerations();
            } else {
                 setUserMessages(prev => [...prev, `${friendlyName} request successful.`]);
                setGeneratingItem(null); 
            }
        } else { 
            const errorMessage = data.message || `Request to ${friendlyName} failed.`;
            console.error(`[commandHandler] Backend function ${callableFunctionName} (user ${userId}) reported failure:`, errorMessage, data.error || '');
            setUserMessages(prev => [...prev, `${errorMessage}`]);
            setGeneratingItem(null); 
        }
        return data; 
    } catch (error) {
        setUserMessages(prev => prev.filter(msg => !msg.includes(`⏳ Starting ${friendlyName}`)));
        console.error(`[commandHandler] Error calling ${callableFunctionName} for user ${userId}:`, error.code, error.message, error.details);
        
        let displayErrorMessage = `Error with ${friendlyName}: `;
        if (error && error.code === 'resource-exhausted') { 
            displayErrorMessage = error.message; 
        } else if (error.code === 'functions/resource-exhausted') { 
            displayErrorMessage += "You've run out of credits for this action.";
        } else if (error.message) {
            displayErrorMessage += error.message;
        } else {
            displayErrorMessage += "An unknown error occurred.";
        }
        setUserMessages(prev => [...prev, `${displayErrorMessage}`]);
        setGeneratingItem(null);
        throw error; 
    }
}

export const handleCommandExecution = async (command, executionContext) => {
    const { 
        setUserMessages, 
        firestoreUserData
    } = executionContext;

    if (!command || typeof command.commandCode === 'undefined') {
        console.error("[commandHandler] handleCommandExecution called with invalid command object:", command);
        if (setUserMessages) setUserMessages(prev => [...prev, "Error: Invalid command received by handler."]);
        return;
    }

    const commandCode = command.commandCode;
    const G_commandParams = command.parameters || {};
    const userId = executionContext.user?.uid;

    const commandDef = commandDefinitions.find(cmd => cmd.code === commandCode);
    if (!commandDef) {
        setUserMessages(prev => [...prev, "Sorry, I'm not sure how to handle that request (unknown command code)."]);
        return;
    }

    // console.log(`[commandHandler] Executing command: ${commandDef.name} (Code: ${commandCode}) for user ${userId || 'N/A'}`);
    // console.log(`[commandHandler] Executing command: ${commandDef.name} (Code: ${commandCode}) for user ${userId || 'N/A'}`, G_commandParams);
    // Keep a less verbose version if G_commandParams is too much:
    console.log(`[commandHandler] Executing command: ${commandDef.name} (Code: ${commandCode}) for user ${userId || 'N/A'}`);

    if (firestoreUserData) {
        /* console.log(
            `[commandHandler - handleCommandExecution] User ${userId || 'N/A'} Firestore Data for context (not necessarily checking credits here): `,
            `Images=${firestoreUserData.image_credit || 0}, Videos=${firestoreUserData.video_credit || 0}, Slideshows=${firestoreUserData.slideshow_credit || 0}`
        ); */
    } else {
        // console.log(`[commandHandler - handleCommandExecution] User ${userId || 'N/A'}: firestoreUserData not available at this stage.`);
    }

    if (commandCode >= 100 && commandCode < 500) {
        try {
            await handleBackendCommand(command, executionContext);
                     } catch (error) {
            // console.log(`[commandHandler] Error from handleBackendCommand for CMD ${commandCode} (user ${userId || 'N/A'}) was handled or re-thrown.`);
        }
    } else if (commandCode >= 500 && commandCode < 600) {
        if (commandCode === 507 || commandCode === 508) {
             console.warn(`[commandHandler] CMD ${commandCode} (SAVE_FROM_GEN) should be handled as an internal action in Layout.jsx.`);
             setUserMessages(prev => [...prev, `Info: Save from generation is an internal action.`]);
        } else {
            await handleDataManagement({ ...command, parameters: G_commandParams }, executionContext);
        }
    } else if (commandCode >= 600 && commandCode < 700) {
        handleUiControl({ ...command, parameters: G_commandParams }, executionContext);
    } else if (commandCode >= 700 && commandCode < 800) {
        await handleAuth({ ...command, parameters: G_commandParams }, executionContext);
    } else {
        console.warn(`[commandHandler] Unhandled command code: ${commandCode}`);
        setUserMessages(prev => [...prev, `Command code ${commandCode} is not recognized by the handler.`]);
    }
};

export const performDelete = async (itemToDelete, itemType, setUserMessages, userId) => {
    if (!userId || !itemToDelete || !itemToDelete.id || !itemType) {
        setUserMessages(prev => [...prev, "Error: Missing information for deletion."]);
        return false;
    }

    const collectionName = itemType === 'product' ? 'products' :
                           itemType === 'creator' ? 'creators' :
                           itemType === 'background' ? 'backgrounds' : null;

    if (!collectionName) {
        setUserMessages(prev => [...prev, `Error: Unknown item type "${itemType}" for deletion.`]);
         return false;
    }

    try {
        await deleteDoc(doc(db, 'users', userId, collectionName, itemToDelete.id));
        setUserMessages(prev => [...prev, `${itemType.charAt(0).toUpperCase() + itemType.slice(1)} "${itemToDelete.name || itemToDelete.id}" deleted successfully.`]);
        return true;
    } catch (error) {
        console.error(`Error deleting ${itemType} ${itemToDelete.id} for user ${userId}:`, error);
        setUserMessages(prev => [...prev, `Error deleting ${itemType}: ${error.message}`]);
        return false;
    }
}; 
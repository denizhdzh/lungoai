import React from 'react';
import { commandDefinitions } from '../command'; 
import { Compass, Hash, TextAa, ListChecks, CheckSquareOffset, XSquare, Info } from '@phosphor-icons/react'; 

// --- Simplified Language Helpers (Re-introduced and refined) ---

// More natural language titles
const getFriendlyTitle = (commandName) => {
  const names = {
    'GENERATE_UGC_TIKTOK_VIDEO': 'Create a TikTok-Style Video',
    'GENERATE_BACKGROUND_IMAGE': 'Create a Background Image',
    'GENERATE_UGC_IMAGE': 'Create an Influencer-Style Photo',
    'GENERATE_RANDOM_IMAGE': 'Create Any Custom Image',
    'GENERATE_IMAGE_TIKTOK_SLIDESHOW': 'Create a Photo Slideshow',
    'EDIT_IMAGE': 'Edit an Existing Image',
    'ADD_PRODUCT': 'Save a Product',
    'DELETE_PRODUCT': 'Remove a Saved Product',
    'ADD_CREATOR': 'Save a Creator Persona',
    'DELETE_CREATOR': 'Remove a Saved Creator',
    'ADD_BACKGROUND': 'Save a Background',
    'DELETE_BACKGROUND': 'Remove a Saved Background'
  };
  return names[commandName] || commandName.replace(/_/g, ' '); // Fallback
};

// Simplified descriptions
const getSimplifiedDescription = (cmd) => {
  const descriptions = {
    101: "Create a short video featuring a person talking about or showing your product - perfect for TikTok or Instagram.",
    201: "Generate a custom background image that you can use in your content or save for later.",
    202: "Create a realistic photo of a person that looks like authentic user-generated content or an influencer post.",
    203: "Generate any type of image you can imagine - from products to abstract concepts to specific scenes.",
    301: "Create a sequence of images that work together as a slideshow, often used for social media.",
    401: "Make changes to an image you've already created - adjust colors, add elements, or modify the style.",
    501: "Save product details (like name and description) so you can easily refer to it later using its name.",
    502: "Remove a previously saved product from your collection.",
    503: "Save a description of a person (a 'creator persona') to consistently use in your videos and images. Reference them using @CreatorName.",
    504: "Remove a previously saved creator persona from your collection.",
    505: "Save a background description or image style for easy reuse. Reference it using @BackgroundName.",
    506: "Remove a previously saved background from your collection."
  };
  return descriptions[cmd.code] || cmd.description;
};

// Clear examples
const getExample = (cmd) => {
  const examples = {
    101: "Create a TikTok video of @Sarah showing how to use my fitness product",
    201: "Make a background image of a cozy coffee shop",
    202: "Generate a photo of a young man using my new headphones on a white background",
    203: "Create an image of a futuristic city skyline at night, cartoon style",
    301: "Make a 5-image slideshow about the top uses for my 'Super Serum' product",
    401: "Edit my 'CoffeeShop' image to add a person sitting at a table",
    501: "Add product: Name 'Super Serum', Description 'Anti-aging facial serum'",
    502: "Delete product 'Old Moisturizer'",
    503: "Add creator: Name 'Sarah', Description 'Young woman, blonde hair, friendly smile'",
    504: "Delete creator 'Michael'",
    505: "Add background: Name 'CityBackground', Description 'Modern office window view'",
    506: "Delete background 'BeachScene'"
  };
  return examples[cmd.code] || "";
};

// Simplified parameter details
const getFriendlyParamName = (paramName) => paramName.replace(/_/g, ' ');
const getFriendlyType = (type) => (type === 'string' ? 'Text' : type === 'integer' ? 'Number' : type);
const getParamSuggestionText = (paramName) => {
    const suggestions = {
        "focus_topic": "e.g., 'healthy breakfast ideas', 'summer fashion'",
        "subject_description": "e.g., 'young woman with blonde hair', or use @YourSavedCreatorName",
        "action_description": "e.g., 'holding the product', 'smiling at camera'",
        "setting_description": "e.g., 'in a bright kitchen', 'outdoor cafe', or use @YourSavedBackgroundName",
        "hook_text": "e.g., 'This changed everything!', 'Wait until you see this!'",
        "character_reaction": "e.g., 'happy', 'surprised', 'thoughtful'",
        "language": "e.g., 'en' for English, 'tr' for Turkish",
        "scene_description": "e.g., 'modern office with plants', 'sunset beach'",
        "image_style": "e.g., 'realistic photo', 'cartoon style', 'watercolor painting'",
        "clothing_description": "e.g., 'wearing a blue t-shirt and jeans', 'modern business casual'",
        "image_subject": "e.g., 'a cat wearing a hat', 'futuristic cityscape'",
        "topic": "e.g., 'summer fashion trends', '5 quick cooking tips'",
        "num_images": "e.g., 5 or 7",
        "image_id": "The name or ID of the image from your gallery you want to change",
        "edit_instructions": "e.g., 'make the background blue', 'add sunglasses to the person'",
        "product_name": "The name you want to save the product under",
        "product_description": "A short description of the product",
        "creator_name": "The name for this creator persona (used with @)",
        "creator_description": "Detailed description of the person",
        "background_name": "The name for this background (used with @)",
        "background_description": "Description of the background scene or style"
    };
    return suggestions[paramName];
};

// --- Component Structure --- 

function CommandInfo() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-3">
        <Compass size={32} /> How to Talk to Lungo AI
      </h1>

      <p className="mb-8 text-gray-600 dark:text-zinc-400">
        Lungo AI understands everyday language! Here's a breakdown of what you can ask it to do and what details help get the best results. Remember to use '@' to mention specific Creators or Backgrounds you've saved (like @Sarah or @OfficeBackground).
      </p>

      <div className="space-y-6"> 
        {commandDefinitions
          // Filter out internal/less common commands AND codes 1 & 2
          .filter(cmd => ![1, 2 /* Add other codes to hide, e.g., 507, 508 */].includes(cmd.code))
          .map((command) => (
          // Use simpler div structure, remove borders/shadows for less technical look
          <div key={command.code} className="p-4 rounded-lg bg-gray-50 dark:bg-zinc-800/50">
            {/* 1. Friendly Title */}
            <h2 className="text-xl font-semibold text-gray-800 dark:text-zinc-100 mb-2">
              {getFriendlyTitle(command.name)}
            </h2>
            
            {/* 2. What it Does */}
            <p className="text-sm text-gray-600 dark:text-zinc-300 mb-4">
              {getSimplifiedDescription(command)}
            </p>

            {/* 3. What Details to Include (If any) */}
            {command.parameters && command.parameters.length > 0 && (
              <div className="mb-4">
                <h3 className="text-md font-medium text-gray-700 dark:text-zinc-200 mb-2 flex items-center gap-2">
                   <ListChecks size={16} /> What Details Help?
                </h3>
                <ul className="space-y-2 pl-1">
                  {command.parameters.map((param) => (
                    <li key={param.name} className="text-sm">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-gray-700 dark:text-zinc-200">
                          {getFriendlyParamName(param.name)}
                        </span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
                           {getFriendlyType(param.type)}
                        </span>
                        {param.required ? (
                          <span className="text-xs font-medium text-green-700 dark:text-green-400">(Needed)</span>
                        ) : (
                          <span className="text-xs text-gray-500 dark:text-zinc-400">(Optional)</span>
                        )}
                      </div>
                      {/* Parameter Description/Suggestion */}
                      <p className="text-xs text-gray-500 dark:text-zinc-400 pl-1">
                         {param.description} {getParamSuggestionText(param.name) && `(${getParamSuggestionText(param.name)})`}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {/* If no parameters needed */}
            {(!command.parameters || command.parameters.length === 0) && (
                <p className="text-sm text-gray-500 dark:text-zinc-500 italic mb-4">No specific details needed - just tell Lungo AI!</p>
            )}

            {/* 4. Example */}
            {getExample(command) && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-zinc-200 mb-1">Example:</h4>
                <p className="text-sm italic text-gray-600 dark:text-zinc-400 bg-white dark:bg-zinc-700/40 p-2 rounded">
                   "{getExample(command)}"
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default CommandInfo; 
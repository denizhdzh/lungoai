import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, Package, Sparkle, FilmSlate, ImagesSquare, CheckCircle, Circle, X, Info, 
  CircleNotch, RocketLaunch, Plus, Calendar, User, Play, Image, Globe, Target,
  ArrowRight, Check, Trash, PencilSimple, Eye
} from '@phosphor-icons/react';

// Mock data for existing campaigns
const mockCampaigns = [
  {
    id: 'camp_1',
    name: 'Summer Fitness Campaign',
    product: 'FitPro Protein',
    status: 'active',
    totalContent: 45,
    completedContent: 32,
    createdAt: '2024-01-15',
    nextPost: '2024-01-20',
    performance: { views: 125000, engagement: 8.5 }
  },
  {
    id: 'camp_2', 
    name: 'Winter Skincare Series',
    product: 'GlowUp Serum',
    status: 'completed',
    totalContent: 30,
    completedContent: 30,
    createdAt: '2024-01-01',
    nextPost: null,
    performance: { views: 89000, engagement: 12.3 }
  },
  {
    id: 'camp_3',
    name: 'Tech Review Marathon',
    product: 'SmartWatch Pro',
    status: 'draft',
    totalContent: 0,
    completedContent: 0,
    createdAt: '2024-01-18',
    nextPost: null,
    performance: { views: 0, engagement: 0 }
  }
];

function CampaignCreator() {
  const { isDarkMode, products, creators, backgrounds } = useOutletContext();
  const navigate = useNavigate();
  
  // Main view state
  const [currentView, setCurrentView] = useState('campaigns'); // 'campaigns' | 'create'
  
  // Campaign creation states
  const [step, setStep] = useState(1); // 1: Product, 2: Content, 3: Creators, 4: Settings, 5: Review
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedBackgrounds, setSelectedBackgrounds] = useState([]);
  const [selectedCreators, setSelectedCreators] = useState([]);
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [campaignName, setCampaignName] = useState('');
  const [contentConfig, setContentConfig] = useState({
    videos: 10,
    slideshows: 15,
    images: 5
  });

  // Language options
  const languageOptions = [
    { id: 'en', name: 'English', flag: '🇺🇸' },
    { id: 'tr', name: 'Türkçe', flag: '🇹🇷' },
    { id: 'es', name: 'Español', flag: '🇪🇸' },
    { id: 'fr', name: 'Français', flag: '🇫🇷' },
    { id: 'de', name: 'Deutsch', flag: '🇩🇪' }
  ];

  const getStatusColor = (status) => {
    switch (status) {
              case 'active': return 'bg-lime-100 text-lime-800 dark:bg-lime-900/20 dark:text-lime-400';
      case 'completed': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'draft': return 'bg-stone-100 text-stone-800 dark:bg-stone-800/50 dark:text-stone-400';
      default: return 'bg-stone-100 text-stone-800 dark:bg-stone-800/50 dark:text-stone-400';
    }
  };

  const calculateTotalCredits = () => {
    const { videos, slideshows, images } = contentConfig;
    return (videos * 175) + (slideshows * 50) + (images * 70); // Average credit costs
  };

  const renderCampaignsView = () => (
    <div className="space-y-8">
      {/* Header with Create Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
            Your Campaigns
          </h2>
          <p className="text-stone-600 dark:text-stone-400 mt-1">
            Manage and track your content campaigns
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setCurrentView('create')}
          className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors shadow-lg hover:shadow-red-500/25"
        >
          <Plus size={20} />
          New Campaign
        </motion.button>
      </div>

      {/* Campaigns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockCampaigns.map((campaign) => (
          <motion.div
            key={campaign.id}
            whileHover={{ y: -4 }}
            className="bg-white dark:bg-stone-800 rounded-2xl p-6 border border-stone-200 dark:border-stone-700 shadow-sm hover:shadow-lg transition-all duration-200"
          >
            {/* Campaign Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h3 className="font-semibold text-stone-900 dark:text-stone-100 mb-1">
                  {campaign.name}
                </h3>
                <p className="text-sm text-stone-600 dark:text-stone-400">
                  {campaign.product}
                </p>
              </div>
              <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getStatusColor(campaign.status)}`}>
                {campaign.status}
              </span>
            </div>

            {/* Progress Bar */}
            {campaign.status !== 'draft' && (
              <div className="mb-4">
                <div className="flex justify-between text-xs text-stone-600 dark:text-stone-400 mb-2">
                  <span>Progress</span>
                  <span>{campaign.completedContent}/{campaign.totalContent}</span>
                </div>
                <div className="w-full bg-stone-200 dark:bg-stone-700 rounded-full h-2">
                  <div 
                    className="bg-red-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(campaign.completedContent / campaign.totalContent) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Stats */}
            {campaign.status !== 'draft' && (
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-xs text-stone-600 dark:text-stone-400">Views</p>
                  <p className="font-semibold text-stone-900 dark:text-stone-100">
                    {campaign.performance.views.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-stone-600 dark:text-stone-400">Engagement</p>
                  <p className="font-semibold text-stone-900 dark:text-stone-100">
                    {campaign.performance.engagement}%
                  </p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 text-stone-700 dark:text-stone-300 rounded-lg text-sm font-medium transition-colors">
                <Eye size={16} />
                View
              </button>
              <button className="flex items-center justify-center p-2 bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 text-stone-700 dark:text-stone-300 rounded-lg transition-colors">
                <PencilSimple size={16} />
              </button>
              <button className="flex items-center justify-center p-2 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg transition-colors">
                <Trash size={16} />
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );

  const renderCreateView = () => (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setCurrentView('campaigns')}
          className="p-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-400 transition-colors"
        >
          <ArrowLeft size={20} />
        </motion.button>
        <div>
          <h2 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
            Create New Campaign
          </h2>
          <p className="text-stone-600 dark:text-stone-400">
            Step {step} of 5 - Set up your bulk content campaign
          </p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between mb-12">
        {[
          { num: 1, label: 'Product', icon: Package },
          { num: 2, label: 'Content', icon: Target },
          { num: 3, label: 'Creators', icon: User },
          { num: 4, label: 'Settings', icon: Globe },
          { num: 5, label: 'Review', icon: CheckCircle }
        ].map((stepItem, index) => (
          <div key={stepItem.num} className="flex items-center">
            <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all ${
              step >= stepItem.num 
                ? 'bg-red-600 border-red-600 text-white' 
                : 'border-stone-300 dark:border-stone-600 text-stone-400 dark:text-stone-500'
            }`}>
              {step > stepItem.num ? (
                <Check size={16} weight="bold" />
              ) : (
                <stepItem.icon size={16} />
              )}
            </div>
            <span className={`ml-2 text-sm font-medium ${
              step >= stepItem.num 
                ? 'text-stone-900 dark:text-stone-100' 
                : 'text-stone-500 dark:text-stone-400'
            }`}>
              {stepItem.label}
            </span>
            {index < 4 && (
              <div className={`w-16 h-0.5 mx-4 ${
                step > stepItem.num 
                  ? 'bg-red-600' 
                  : 'bg-stone-300 dark:bg-stone-600'
              }`} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="bg-white dark:bg-stone-800 rounded-2xl p-8 border border-stone-200 dark:border-stone-700 shadow-sm">
        {step === 1 && renderProductStep()}
        {step === 2 && renderContentStep()}
        {step === 3 && renderCreatorsStep()}
        {step === 4 && renderSettingsStep()}
        {step === 5 && renderReviewStep()}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-8">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setStep(Math.max(1, step - 1))}
          disabled={step === 1}
          className={`px-6 py-3 rounded-xl font-medium transition-colors ${
            step === 1 
              ? 'bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500 cursor-not-allowed'
              : 'bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-300 dark:hover:bg-stone-600'
          }`}
        >
          Previous
        </motion.button>
        
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            if (step === 5) {
              // Create campaign logic here
              alert('Campaign created successfully!');
              setCurrentView('campaigns');
              setStep(1);
            } else {
              setStep(Math.min(5, step + 1));
            }
          }}
          className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors shadow-lg hover:shadow-red-500/25"
        >
          {step === 5 ? 'Create Campaign' : 'Next Step'}
        </motion.button>
      </div>
    </div>
  );

  const renderProductStep = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-stone-900 dark:text-stone-100 mb-2">
          Select Product
        </h3>
        <p className="text-stone-600 dark:text-stone-400">
          Choose the product this campaign will focus on
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {products?.map((product) => (
          <motion.div
            key={product.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setSelectedProduct(product)}
            className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
              selectedProduct?.id === product.id
                ? 'border-red-500 bg-red-50 dark:bg-red-900/10'
                : 'border-stone-200 dark:border-stone-700 hover:border-stone-300 dark:hover:border-stone-600'
            }`}
          >
            <div className="flex items-center gap-3">
              {product.logoUrl ? (
                <img 
                  src={product.logoUrl} 
                  alt={product.name}
                  className="w-12 h-12 rounded-lg object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-stone-100 dark:bg-stone-700 flex items-center justify-center">
                  <Package size={24} className="text-stone-400" />
                </div>
              )}
              <div className="flex-1">
                <h4 className="font-medium text-stone-900 dark:text-stone-100">
                  {product.name}
                </h4>
                <p className="text-sm text-stone-600 dark:text-stone-400">
                  {product.category || 'Product'}
                </p>
              </div>
              {selectedProduct?.id === product.id && (
                <Check size={20} className="text-red-500" />
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );

  const renderContentStep = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-stone-900 dark:text-stone-100 mb-2">
          Content Configuration
        </h3>
        <p className="text-stone-600 dark:text-stone-400">
          Define how much content you want to create
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { type: 'videos', label: 'Videos', icon: Play, credits: 175, color: 'blue' },
          { type: 'slideshows', label: 'Slideshows', icon: ImagesSquare, credits: 50, color: 'lime' },
          { type: 'images', label: 'Images', icon: Image, credits: 70, color: 'purple' }
        ].map((contentType) => (
          <div key={contentType.type} className="space-y-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-${contentType.color}-100 dark:bg-${contentType.color}-900/20`}>
                <contentType.icon size={20} className={`text-${contentType.color}-600 dark:text-${contentType.color}-400`} />
              </div>
              <div>
                <h4 className="font-medium text-stone-900 dark:text-stone-100">
                  {contentType.label}
                </h4>
                <p className="text-xs text-stone-600 dark:text-stone-400">
                  {contentType.credits} credits each
                </p>
              </div>
            </div>
            
            <div className="space-y-2">
              <input
                type="range"
                min="0"
                max="50"
                value={contentConfig[contentType.type]}
                onChange={(e) => setContentConfig(prev => ({
                  ...prev,
                  [contentType.type]: parseInt(e.target.value)
                }))}
                className="w-full h-2 bg-stone-200 dark:bg-stone-700 rounded-lg appearance-none cursor-pointer slider-red"
              />
              <div className="flex justify-between text-sm">
                <span className="text-stone-600 dark:text-stone-400">0</span>
                <span className="font-medium text-stone-900 dark:text-stone-100">
                  {contentConfig[contentType.type]}
                </span>
                <span className="text-stone-600 dark:text-stone-400">50</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Total Credits Display */}
      <div className="bg-stone-50 dark:bg-stone-900/50 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <span className="text-stone-600 dark:text-stone-400">Total Credits Required:</span>
          <span className="text-xl font-semibold text-stone-900 dark:text-stone-100">
            {calculateTotalCredits().toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );

  const renderCreatorsStep = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-stone-900 dark:text-stone-100 mb-2">
          Select UGC Creators
        </h3>
        <p className="text-stone-600 dark:text-stone-400">
          Choose creators for your video content
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {creators?.map((creator) => (
          <motion.div
            key={creator.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              setSelectedCreators(prev => 
                prev.find(c => c.id === creator.id)
                  ? prev.filter(c => c.id !== creator.id)
                  : [...prev, creator]
              );
            }}
            className={`relative p-3 rounded-xl border-2 cursor-pointer transition-all ${
              selectedCreators.find(c => c.id === creator.id)
                ? 'border-red-500 bg-red-50 dark:bg-red-900/10'
                : 'border-stone-200 dark:border-stone-700 hover:border-stone-300 dark:hover:border-stone-600'
            }`}
          >
            <div className="aspect-[9/16] rounded-lg overflow-hidden mb-3">
              {creator.imageUrl ? (
                <img 
                  src={creator.imageUrl} 
                  alt={creator.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-stone-100 dark:bg-stone-700 flex items-center justify-center">
                  <User size={32} className="text-stone-400" />
                </div>
              )}
            </div>
            <h4 className="font-medium text-stone-900 dark:text-stone-100 text-center text-sm">
              {creator.name}
            </h4>
            {selectedCreators.find(c => c.id === creator.id) && (
              <div className="absolute top-2 right-2 bg-red-500 rounded-full p-1">
                <Check size={12} className="text-white" />
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );

  const renderSettingsStep = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-stone-900 dark:text-stone-100 mb-2">
          Campaign Settings
        </h3>
        <p className="text-stone-600 dark:text-stone-400">
          Configure language and campaign details
        </p>
      </div>

      <div className="space-y-6">
        {/* Campaign Name */}
        <div>
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">
            Campaign Name
          </label>
          <input
            type="text"
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            placeholder="Enter campaign name..."
            className="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-red-500 focus:border-transparent transition-colors"
          />
        </div>

        {/* Language Selection */}
        <div>
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-3">
            Content Language
          </label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {languageOptions.map((lang) => (
              <motion.button
                key={lang.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelectedLanguage(lang.id)}
                className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                  selectedLanguage === lang.id
                    ? 'border-red-500 bg-red-50 dark:bg-red-900/10'
                    : 'border-stone-200 dark:border-stone-700 hover:border-stone-300 dark:hover:border-stone-600'
                }`}
              >
                <span className="text-2xl">{lang.flag}</span>
                <span className="font-medium text-stone-900 dark:text-stone-100">
                  {lang.name}
                </span>
                {selectedLanguage === lang.id && (
                  <Check size={16} className="text-red-500 ml-auto" />
                )}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Background Selection */}
        <div>
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-3">
            Select Backgrounds
          </label>
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {backgrounds?.map((background) => (
              <motion.div
                key={background.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setSelectedBackgrounds(prev => 
                    prev.find(b => b.id === background.id)
                      ? prev.filter(b => b.id !== background.id)
                      : [...prev, background]
                  );
                }}
                className={`relative aspect-square rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                  selectedBackgrounds.find(b => b.id === background.id)
                    ? 'border-red-500'
                    : 'border-stone-200 dark:border-stone-700 hover:border-stone-300 dark:hover:border-stone-600'
                }`}
              >
                {background.imageUrl ? (
                  <img 
                    src={background.imageUrl} 
                    alt={background.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-stone-100 dark:bg-stone-700 flex items-center justify-center">
                    <ImagesSquare size={24} className="text-stone-400" />
                  </div>
                )}
                {selectedBackgrounds.find(b => b.id === background.id) && (
                  <div className="absolute top-1 right-1 bg-red-500 rounded-full p-1">
                    <Check size={10} className="text-white" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderReviewStep = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-stone-900 dark:text-stone-100 mb-2">
          Review Campaign
        </h3>
        <p className="text-stone-600 dark:text-stone-400">
          Review your campaign settings before creation
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Campaign Overview */}
        <div className="space-y-4">
          <h4 className="font-medium text-stone-900 dark:text-stone-100">Campaign Details</h4>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-stone-600 dark:text-stone-400">Name:</span>
              <span className="font-medium text-stone-900 dark:text-stone-100">
                {campaignName || 'Untitled Campaign'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-600 dark:text-stone-400">Product:</span>
              <span className="font-medium text-stone-900 dark:text-stone-100">
                {selectedProduct?.name || 'None selected'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-600 dark:text-stone-400">Language:</span>
              <span className="font-medium text-stone-900 dark:text-stone-100">
                {languageOptions.find(l => l.id === selectedLanguage)?.name}
              </span>
            </div>
          </div>
        </div>

        {/* Content Summary */}
        <div className="space-y-4">
          <h4 className="font-medium text-stone-900 dark:text-stone-100">Content Summary</h4>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-stone-600 dark:text-stone-400">Videos:</span>
              <span className="font-medium text-stone-900 dark:text-stone-100">
                {contentConfig.videos}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-600 dark:text-stone-400">Slideshows:</span>
              <span className="font-medium text-stone-900 dark:text-stone-100">
                {contentConfig.slideshows}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-600 dark:text-stone-400">Images:</span>
              <span className="font-medium text-stone-900 dark:text-stone-100">
                {contentConfig.images}
              </span>
            </div>
            <div className="border-t border-stone-200 dark:border-stone-700 pt-3">
              <div className="flex justify-between">
                <span className="font-medium text-stone-900 dark:text-stone-100">Total Credits:</span>
                <span className="font-semibold text-red-600 dark:text-red-400">
                  {calculateTotalCredits().toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Selected Items Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h4 className="font-medium text-stone-900 dark:text-stone-100 mb-3">
            Selected Creators ({selectedCreators.length})
          </h4>
          <div className="flex flex-wrap gap-2">
            {selectedCreators.map((creator) => (
              <span 
                key={creator.id}
                className="px-3 py-1 bg-stone-100 dark:bg-stone-700 text-stone-700 dark:text-stone-300 rounded-lg text-sm"
              >
                {creator.name}
              </span>
            ))}
          </div>
        </div>

        <div>
          <h4 className="font-medium text-stone-900 dark:text-stone-100 mb-3">
            Selected Backgrounds ({selectedBackgrounds.length})
          </h4>
          <div className="flex flex-wrap gap-2">
            {selectedBackgrounds.map((background) => (
              <span 
                key={background.id}
                className="px-3 py-1 bg-stone-100 dark:bg-stone-700 text-stone-700 dark:text-stone-300 rounded-lg text-sm"
              >
                {background.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <AnimatePresence mode="wait">
        {currentView === 'campaigns' ? (
          <motion.div
            key="campaigns"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            {renderCampaignsView()}
          </motion.div>
        ) : (
          <motion.div
            key="create"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            {renderCreateView()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default CampaignCreator; 
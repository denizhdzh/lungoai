import React, { useState, useEffect } from 'react';
import { LockKey, SignIn, CircleNotch, Warning, Users, CurrencyDollar, ChartBar, Star, Package, ImagesSquare, FilmSlate, ArrowUp } from '@phosphor-icons/react';
import { db } from '../firebase';
import { collection, getDocs, doc, getDoc, Timestamp } from "@firebase/firestore";
import ReactApexChart from 'react-apexcharts';

// --- IMPORTANT SECURITY WARNING ---
// Reading admin credentials directly from environment variables on the client-side
// is highly insecure. These credentials will be bundled with your JavaScript code
// and easily accessible to anyone using the application.
// This approach should ONLY be used for local development or internal tools
// where security is not a major concern.
// For production, implement proper authentication via a backend server.
// Ensure your build process (e.g., Vite) is configured to expose these variables,
// usually by prefixing them (e.g., VITE_ADMIN_EMAIL).
const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL;
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD;
// ---------------------------------

// Renk paleti - Daha canlı ve uyumlu renkler
const CHART_COLORS = {
  primary: '#4F46E5', // İndigo
  secondary: '#06B6D4', // Cyan
  tertiary: '#EC4899', // Pink
  quaternary: '#10B981', // Emerald
  accent: '#8B5CF6', // Violet
  danger: '#EF4444', // Red
  warning: '#F59E0B', // Amber
  success: '#22C55E', // Green
  info: '#3B82F6',    // Blue
  light: '#E5E7EB',   // Light gray
  dark: '#111827',    // Dark gray
  gradient: ['#4F46E5', '#06B6D4', '#EC4899', '#10B981'],
  chart1: ['#4F46E5', '#818CF8', '#A5B4FC', '#C7D2FE'], // Indigo shades
  chart2: ['#06B6D4', '#22D3EE', '#67E8F9', '#A5F3FC'], // Cyan shades
  chart3: ['#8B5CF6', '#A78BFA', '#C4B5FD', '#DDD6FE'], // Violet shades
  chart4: ['#EC4899', '#F472B6', '#F9A8D4', '#FBCFE8'], // Pink shades
  chart5: ['#EF4444', '#F87171', '#FCA5A5', '#FECACA'], // Red shades
  chartOrange: ['#F59E0B', '#FBBF24', '#FCD34D', '#FDE68A'], // <-- New Orange Shades (Amber)
  accentOrange: '#F59E0B', // <-- New Accent Orange (Amber 500)
};

// Chart ortak stilleri - Tekrarı azaltmak için
const CHART_DEFAULTS = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  foreColor: document.documentElement.classList.contains('dark') ? '#E5E7EB' : '#374151',
  background: 'transparent',
  toolbar: { show: false },
  animations: {
    enabled: true,
    speed: 800,
    dynamicAnimation: {
      enabled: true,
      speed: 350
    }
  }
};

// Zaman serileri için gün formatları
const DAY_FORMATS = {
  short: Array.from({length: 7}, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  }),
  thirtyDays: Array.from({length: 30}, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return d.toLocaleDateString('tr-TR', { day: 'numeric' });
  })
};

// --- NEW: Stripe Price ID to Internal Plan Mapping ---
// TODO: Replace placeholder Stripe Price IDs with your actual Price IDs
const STRIPE_PRICE_ID_TO_PLAN_MAP = {
  // Monthly Plans
  'price_MONTHLY_BASIC_ID': { id: 'basic', name: 'Basic Plan', cycle: 'monthly' },
  'price_MONTHLY_PRO_ID': { id: 'pro', name: 'Pro plan', cycle: 'monthly' },
  'price_MONTHLY_BUSINESS_ID': { id: 'business', name: 'Business plan', cycle: 'monthly' },
  // Yearly Plans
  'price_YEARLY_BASIC_ID': { id: 'basic', name: 'Basic Plan', cycle: 'yearly' },
  'price_YEARLY_PRO_ID': { id: 'pro', name: 'Pro plan', cycle: 'yearly' },
  'price_YEARLY_BUSINESS_ID': { id: 'business', name: 'Business plan', cycle: 'yearly' },
  // Add other Price IDs as needed (e.g., legacy plans, special offers)
};
// Helper function to get plan details from Stripe Price ID
const getPlanDetailsFromPriceId = (priceId) => {
  return STRIPE_PRICE_ID_TO_PLAN_MAP[priceId] || null; // Return null if not found
};
// --- End NEW Mapping ---

// Pricing Plans Data (Restored Hardcoded definition)
const plans = [
  {
    id: 'basic',
    name: 'Basic Plan',
    monthlyPrice: 59.00,
    yearlyMonthlyPrice: parseFloat((59.00 * 8 / 12).toFixed(2)),
  },
  {
    id: 'pro',
    name: 'Pro plan',
    monthlyPrice: 119.00,
    yearlyMonthlyPrice: parseFloat((119.00 * 8 / 12).toFixed(2)),
    mostPopular: true,
  },
  {
    id: 'business',
    name: 'Business plan',
    monthlyPrice: 299.00,
    yearlyMonthlyPrice: parseFloat((299.00 * 8 / 12).toFixed(2)),
  },
];
// Get price map for easier lookup (Restored)
const monthlyPrices = plans.reduce((acc, plan) => {
  acc[plan.id] = plan.monthlyPrice;
  return acc;
}, {});
const yearlyPrices = plans.reduce((acc, plan) => {
  acc[plan.id] = (plan.yearlyMonthlyPrice || 0) * 12; // Use calculated yearly price
  return acc;
}, {});

// Helper to format node names (e.g., 'search_engine' -> 'Search Engine')
const formatNodeName = (key) => key.split('_')
                                  .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                  .join(' ');

function Admin() {
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(true); // Show modal initially
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // New State for Admin Data
  const [stats, setStats] = useState(null);
  const [usersData, setUsersData] = useState([]);
  const [featureRequests, setFeatureRequests] = useState([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataError, setDataError] = useState('');
  const [recentSignups, setRecentSignups] = useState([]); // State for recent signups
  const [searchQuery, setSearchQuery] = useState(''); // State for search input
  const [searchResults, setSearchResults] = useState([]); // State for search results
  const [isSearching, setIsSearching] = useState(false); // State for search loading indicator
  const [sankeyData, setSankeyData] = useState({ series: [], options: {} }); // <-- Sankey State
  const [barChartData, setBarChartData] = useState({ series: [], options: {} }); // <-- Bar Chart State

  // --- Calculate Statistics & Process Data --- (Reverted to use hardcoded plans)
  const processUserData = (users, totalImages, totalVideos) => { // <-- Removed plansData parameter
    const totalUsers = users.length;
    // Price maps are now calculated outside from the hardcoded plans array
    
    if (totalUsers === 0) {
        // Return default structure if no users to prevent errors
        return {
            totalUsers: 0, totalActiveSubscribers: 0, totalInactiveSubscribers: 0,
            onboardingCompletedCount: 0, totalMRR: 0, totalARR: 0,
            planDistribution: {}, dailySignups: Array(7).fill(0),
            referralSources: {}, interestsCount: {}, 
            notificationOptInRate: 0, dataCollectionOptInRate: 0,
            totalGeneratedImages: 0, totalGeneratedVideos: 0,
            retentionRate: 0
        };
    }

    // Define active statuses
    const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing'];

    const activeSubscribers = users.filter(u => 
        u.stripePriceId && 
        u.subscriptionStatus && 
        ACTIVE_SUBSCRIPTION_STATUSES.includes(u.subscriptionStatus.toLowerCase())
    );
    const totalActiveSubscribers = activeSubscribers.length;
    
    // Calculate inactive subscribers (had a subscription before but not active now)
    const inactiveSubscribers = users.filter(u => 
        u.stripeSubscriptionId && // Check if they ever had a subscription ID
        (!u.subscriptionStatus || !ACTIVE_SUBSCRIPTION_STATUSES.includes(u.subscriptionStatus.toLowerCase()))
    );
    const totalInactiveSubscribers = inactiveSubscribers.length;
    
    // Calculate onboarding completion
    const onboardingCompletedCount = users.filter(u => u.onboardingCompleted === true).length;

    // --- Process Onboarding Data ---
    const referralSources = {};
    const interestsCount = {};
    let notificationOptIns = 0;
    let dataCollectionOptIns = 0;

    users.forEach(user => {
        // Referral Source
        if (user.referralSource) {
            referralSources[user.referralSource] = (referralSources[user.referralSource] || 0) + 1;
        }
        // Interests
        if (user.interests && Array.isArray(user.interests)) {
            user.interests.forEach(interest => {
                interestsCount[interest] = (interestsCount[interest] || 0) + 1;
            });
        }
        // Opt-ins
        if (user.notifications === true) notificationOptIns++;
        if (user.dataCollection === true) dataCollectionOptIns++;
    });

    const notificationOptInRate = totalUsers > 0 ? (notificationOptIns / totalUsers) * 100 : 0;
    const dataCollectionOptInRate = totalUsers > 0 ? (dataCollectionOptIns / totalUsers) * 100 : 0;
     // Sort interests by count descending
    const sortedInterests = Object.entries(interestsCount).sort(([,a],[,b]) => b-a);
    const topInterests = Object.fromEntries(sortedInterests.slice(0, 10)); // Show top 10 maybe

    let totalMRR = 0;
    let totalARR = 0;
    const planDistribution = {}; // Initialize for dynamic plan IDs

    // Populate planDistribution keys and calculate revenue
    activeSubscribers.forEach(user => {
      const priceId = user.stripePriceId;
      const planDetails = getPlanDetailsFromPriceId(priceId);

      if (planDetails) {
        const internalPlanId = planDetails.id; // e.g., 'basic', 'pro'
        const cycle = planDetails.cycle; // 'monthly' or 'yearly'

        // Initialize plan in distribution if not present (using internal ID)
        if (planDistribution[internalPlanId] === undefined) {
            planDistribution[internalPlanId] = 0;
        }
        planDistribution[internalPlanId]++;

        // Calculate revenue based on plan ID and cycle
        if (cycle === 'monthly' && monthlyPrices[internalPlanId]) {
            totalMRR += monthlyPrices[internalPlanId];
            totalARR += monthlyPrices[internalPlanId] * 12; // Simplified ARR
        } else if (cycle === 'yearly' && yearlyPrices[internalPlanId]) {
            // Add yearly price directly to ARR, and monthly equivalent to MRR
            totalARR += yearlyPrices[internalPlanId]; 
            totalMRR += yearlyPrices[internalPlanId] / 12; 
        } else {
            console.warn(`Price for plan ID "${internalPlanId}" (derived from Stripe Price ID "${priceId}") with cycle "${cycle}" not found in price maps. Skipping revenue calculation for user ${user.id}.`);
        }
      } else {
           console.warn(`Stripe Price ID "${priceId}" not found in STRIPE_PRICE_ID_TO_PLAN_MAP. Skipping plan distribution and revenue for user ${user.id}.`);
      }
    });

    // Calculate Daily Signups (Last 7 Days)
    const dailySignups = Array(7).fill(0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    users.forEach(user => {
        if (user.createdAt && user.createdAt.toDate) { // Ensure createdAt is a Timestamp
            const signupDate = user.createdAt.toDate();
            const diffDays = Math.floor((today - signupDate) / (1000 * 60 * 60 * 24));
            if (diffDays >= 0 && diffDays < 7) {
                dailySignups[6 - diffDays]++; // Index 6 is today, 0 is 6 days ago
            }
        }
    });

    // Calculate retention rate
    const retentionRate = totalUsers > 0 ? (totalActiveSubscribers / totalUsers) * 100 : 0;

    return {
      totalUsers,
      totalActiveSubscribers,
      totalInactiveSubscribers, // Added
      onboardingCompletedCount, // Added
      totalMRR,
      totalARR,
      planDistribution,
      dailySignups, // Added
      referralSources, // Added
      interestsCount: topInterests, // Added sorted/limited interests
      notificationOptInRate, // Added
      dataCollectionOptInRate, // Added
      totalGeneratedImages: totalImages,
      totalGeneratedVideos: totalVideos,
      retentionRate, // Added
    };
  };

  // --- NEW: Prepare Bar Chart Data ---
  const prepareBarChartData = (users) => {
    // Define structure based on internal plan names + cycle
    const distribution = plans.reduce((acc, plan) => {
        acc[`${plan.name} Monthly`] = 0;
        acc[`${plan.name} Yearly`] = 0;
        return acc;
    }, {});

    // Define active statuses
    const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing'];

    users.forEach(user => {
        const priceId = user.stripePriceId;
        const status = user.subscriptionStatus;
        const planDetails = getPlanDetailsFromPriceId(priceId);

        if (planDetails && status && ACTIVE_SUBSCRIPTION_STATUSES.includes(status.toLowerCase())) {
            const planName = planDetails.name;
            // Use planDetails.cycle directly if available, otherwise try subscriptionLength
            const cycle = planDetails.cycle || (user.subscriptionLength === 'yearly' ? 'Yearly' : 'Monthly'); 
            const key = `${planName} ${cycle === 'yearly' ? 'Yearly' : 'Monthly'}`; // Ensure consistent casing

            if (distribution.hasOwnProperty(key)) {
                distribution[key]++;
            } else {
                 console.warn(`Bar chart key "${key}" generated from price ID "${priceId}" not found in initial distribution.`);
            }
        }
    });

    // Prepare data in ApexCharts Grouped Bar format
    const planCategories = plans.map(p => p.name); // Use names from hardcoded plans
    const monthlyData = planCategories.map(planName => distribution[`${planName} Monthly`] || 0);
    const yearlyData = planCategories.map(planName => distribution[`${planName} Yearly`] || 0);

    const barChartOptions = {
        chart: {
            type: 'bar',
            height: 320, // Match height of adjacent chart if needed
            fontFamily: CHART_DEFAULTS.fontFamily,
            foreColor: CHART_DEFAULTS.foreColor,
            toolbar: { show: false },
            animations: CHART_DEFAULTS.animations,
            background: 'transparent',
        },
        plotOptions: {
            bar: {
              horizontal: false,
              columnWidth: '55%', // Adjust as needed for grouped bars
              borderRadius: 5,
              borderRadiusApplication: 'end'
            },
        },
        dataLabels: {
            enabled: false
        },
        stroke: {
            show: true,
            width: 2,
            colors: ['transparent']
        },
        xaxis: {
            categories: planCategories, // Categories are plan names
            labels: { 
              style: { 
                fontSize: '12px',
                colors: CHART_DEFAULTS.foreColor
              } 
            },
            axisBorder: { show: false },
            axisTicks: { show: false },
        },
        yaxis: {
            title: {
              text: 'Number of Subscribers'
            },
            labels: {
                 formatter: (value) => Math.round(value) // Ensure integer labels
            }
        },
        grid: {
            show: false,
        },
        fill: {
            opacity: 1,
            // Use accent orange for Monthly, info blue for Yearly
            colors: [CHART_COLORS.accentOrange, CHART_COLORS.info] 
        },
        legend: { 
          show: true, // Show legend to distinguish Monthly/Yearly
          position: 'top',
          horizontalAlign: 'left', 
          fontSize: '12px', 
          markers: { width: 10, height: 10 },
        },
        tooltip: {
            y: {
              formatter: function (val, { series, seriesIndex, dataPointIndex, w }) {
                // seriesName will be 'Monthly' or 'Yearly'
                return `${val} ${w.globals.seriesNames[seriesIndex]} subscribers`; 
              }
            }
        }
    };

     // Structure for Grouped Bar chart
    const finalSeries = [
        { name: 'Monthly', data: monthlyData },
        { name: 'Yearly', data: yearlyData }
    ]; 

    // Filter out series if all its data points are 0 (optional, but cleaner)
    const filteredSeries = finalSeries.filter(series => series.data.some(val => val > 0));

    return { series: filteredSeries, options: barChartOptions };
  };

  // --- Prepare Sankey Data --- (Restored Function Definition)
  const prepareSankeyData = (users) => {
    const links = {}; // { "sourceNode_targetNode": count }

    // Define Plan names for Sankey nodes using the mapping
    const getSankeyPlanNodeName = (priceId) => {
        const details = getPlanDetailsFromPriceId(priceId);
        return details ? `Subscribed - ${details.name}` : null; // Return null if not mapped
    };

    // Define stage nodes
    const STAGE_SIGNED_UP = "Signed Up";
    const STAGE_ONBOARDING_COMPLETE = "Completed Onboarding";
    const STAGE_ONBOARDING_INCOMPLETE = "Did Not Complete Onboarding";
    const STAGE_NOT_SUBSCRIBED = "Not Actively Subscribed";

    let countSignedUp = users.length;
    let countOnboardingComplete = 0;
    let countOnboardingIncomplete = 0;
    
    // Define active statuses
    const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing'];

    // Calculate transitions
    users.forEach(user => {
        const didCompleteOnboarding = user.onboardingCompleted === true;

        // Stage 1 to Stage 2: Signup -> Onboarding Status
        if (didCompleteOnboarding) {
            countOnboardingComplete++;
            const source = STAGE_ONBOARDING_COMPLETE;

            // Stage 2 to Stage 3: Completed Onboarding -> Subscription Status
            let target = STAGE_NOT_SUBSCRIBED; // Default target for completed but not active
            const priceId = user.stripePriceId;
            const status = user.subscriptionStatus;
            const sankeyPlanName = getSankeyPlanNodeName(priceId);

            if (sankeyPlanName && status && ACTIVE_SUBSCRIPTION_STATUSES.includes(status.toLowerCase())) {
                 target = sankeyPlanName; // Target specific mapped plan name
            }
            
            const keyStage2to3 = `${source}_${target}`;
            links[keyStage2to3] = (links[keyStage2to3] || 0) + 1;

        } else {
            countOnboardingIncomplete++;
            // Stage 2 to Stage 3 (Implicit): Incomplete Onboarding -> Not Subscribed
            const source = STAGE_ONBOARDING_INCOMPLETE;
            const target = STAGE_NOT_SUBSCRIBED;
            const keyStage2to3_incomplete = `${source}_${target}`;
            links[keyStage2to3_incomplete] = (links[keyStage2to3_incomplete] || 0) + 1;
        }
    });

    // Add Stage 1 to Stage 2 links
    if (countOnboardingComplete > 0) {
        links[`${STAGE_SIGNED_UP}_${STAGE_ONBOARDING_COMPLETE}`] = countOnboardingComplete;
    }
    if (countOnboardingIncomplete > 0) {
        links[`${STAGE_SIGNED_UP}_${STAGE_ONBOARDING_INCOMPLETE}`] = countOnboardingIncomplete;
    }

    // Format links for ApexCharts
    const seriesData = Object.entries(links)
        .map(([key, weight]) => {
            const nodes = key.split('_');
            const from = String(nodes[0] || 'Unknown');
            const to = String(nodes[1] || 'Unknown');
            return [from, to, weight];
        })
        .filter(link => link[2] > 0); 

    // Define Sankey Options (keeping previous theme)
    const sankeyChartOptions = {
         chart: {
            type: 'sankey',
            height: 450, 
            fontFamily: CHART_DEFAULTS.fontFamily,
            foreColor: CHART_DEFAULTS.foreColor,
            background: CHART_DEFAULTS.background,
            animations: CHART_DEFAULTS.animations,
         },
         plotOptions: {
            sankey: {
                 vertical: false,
            },
            theme: {
                mode: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
                monochrome: {
                  enabled: true,
                  color: CHART_COLORS.accentOrange, 
                  shadeTo: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
                  shadeIntensity: 0.65
                }
            }
         },
        tooltip: {
             style: {
                fontSize: '12px',
                fontFamily: CHART_DEFAULTS.fontFamily,
             },
            y: {
                formatter: function (val, { series, seriesIndex, dataPointIndex, w }) {
                   const link = w.globals.series.original[seriesIndex]?.data[dataPointIndex];
                   if (link && link.length === 3) {
                     const fromNode = link[0] || 'Source';
                     const toNode = link[1] || 'Target';
                     return `${fromNode} → ${toNode}: ${val} users`;
                   }
                   return val + " users"; 
                },
                 title: {
                    formatter: (seriesName) => '', 
                 }
            }
        },
    };

    const finalSeries = seriesData.length > 0 ? [{ name: 'User Journey', data: seriesData }] : []; 

    return { series: finalSeries, options: sankeyChartOptions };
  };

  // --- Fetch Data on Admin Login ---
  useEffect(() => {
    if (!isAdminLoggedIn) return; // Only run if admin is logged in

    const fetchAdminData = async () => {
      setIsLoadingData(true);
      setDataError('');
      console.log("Fetching admin data...");
      console.warn("Client-side aggregation of generation counts is inefficient and costly for large user bases. Consider using Cloud Functions for production.");

      try {
        // Fetch Users ONLY
        const usersQuery = collection(db, 'users');
        // const plansQuery = collection(db, 'plans'); // <-- REMOVED Query for plans collection

        const usersSnapshot = await getDocs(usersQuery);
        /* REMOVED Plan fetching logic
        const [usersSnapshot, plansSnapshot] = await Promise.all([
            getDocs(usersQuery),
            getDocs(plansQuery) // <-- Fetch plans
        ]);
        */

        let fetchedUsers = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // let fetchedPlans = plansSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); // <-- REMOVED
        // setDbPlans(fetchedPlans); // <-- REMOVED

        console.log("Fetched Users:", fetchedUsers.length);
        // console.log("Fetched Plans:", fetchedPlans.length); // REMOVED

        // 2. Fetch Generation Counts (Inefficient Client-Side)
        let totalGeneratedImages = 0;
        let totalGeneratedVideos = 0;
        const generationCountPromises = fetchedUsers.map(async (user) => {
            try {
                const generationsRef = collection(db, 'users', user.id, 'generations');
                const generationsSnapshot = await getDocs(generationsRef);
                let userImageCount = 0;
                let userVideoCount = 0;
                generationsSnapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.type === 'image') {
                        userImageCount++;
                    } else if (data.type === 'video') { // Assuming video type is 'video'
                        userVideoCount++;
                    } // Add other types if needed (e.g., 'image_slideshow')
                });
                return { userId: user.id, imageCount: userImageCount, videoCount: userVideoCount };
            } catch (genError) {
                console.error(`Error fetching generations for user ${user.id}:`, genError);
                return { userId: user.id, imageCount: 0, videoCount: 0 }; // Return 0 on error for this user
            }
        });

        const generationCounts = await Promise.all(generationCountPromises);
        
        // Add counts to user objects and sum totals
        fetchedUsers = fetchedUsers.map(user => {
            const counts = generationCounts.find(c => c.userId === user.id);
            const imageCount = counts ? counts.imageCount : 0;
            const videoCount = counts ? counts.videoCount : 0;
            totalGeneratedImages += imageCount;
            totalGeneratedVideos += videoCount;
            return {
                ...user,
                // Keep individual counts if needed for search display
                // generatedImagesCount: imageCount, 
                // generatedVideosCount: videoCount,
            };
        });
        console.log("Finished calculating generation counts.");

        // 3. Fetch Feature Requests
        const requestsDocRef = doc(db, 'system', 'feature-requests');
        const requestsDocSnap = await getDoc(requestsDocRef);
        let fetchedFeatures = [];
        if (requestsDocSnap.exists()) {
          const data = requestsDocSnap.data();
          fetchedFeatures = Object.entries(data)
            .map(([key, value]) => ({ // Use map key as feature ID/title
                id: key, 
                title: key, // Assuming key is the title
                votes: value?.vote || 0 // Safely access vote count
            }))
            .sort((a, b) => b.votes - a.votes); // Sort by votes descending
        } else {
          console.log("Feature requests document not found!");
        }
        setFeatureRequests(fetchedFeatures);
        console.log("Fetched Feature Requests:", fetchedFeatures.length);

        // 4. Calculate Stats (No longer needs plans passed)
        const calculatedStats = processUserData(fetchedUsers, totalGeneratedImages, totalGeneratedVideos);
        setStats(calculatedStats);
        console.log("Calculated Stats:", calculatedStats);

        // 5. Prepare Sankey Data (No longer needs plans passed)
        const sankeyChartData = prepareSankeyData(fetchedUsers);
        setSankeyData(sankeyChartData);
        console.log("Prepared Sankey Data:", sankeyChartData);

        // 6. Prepare Bar Chart Data (Instead of Treemap)
        const barData = prepareBarChartData(fetchedUsers);
        setBarChartData(barData);
        console.log("Prepared Bar Chart Data:", barData);

        // 7. Filter Recent Signups (e.g., last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const recent = fetchedUsers
            .filter(user => user.createdAt && user.createdAt.toDate() > sevenDaysAgo) // Filter by timestamp
            .sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate()); // Sort newest first
        setRecentSignups(recent);
        console.log("Recent Signups (Last 7 Days):", recent.length);

      } catch (error) {
        console.error("Error fetching admin data:", error);
        setDataError(error.message || 'An unknown error occurred');
      } finally {
        setIsLoadingData(false);
        console.log("Finished fetching admin data.");
      }
    };

    fetchAdminData();

  }, [isAdminLoggedIn]); // Re-run when isAdminLoggedIn changes to true

  // If credentials are not set in environment, prevent component from working fully
  useEffect(() => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      setLoginError('Admin credentials not configured in environment variables.');
      setShowLoginModal(false); // Hide login if config is missing
    }
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');

    // Simulate network request
    setTimeout(() => {
      if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
        setIsAdminLoggedIn(true);
        setShowLoginModal(false);
        console.log('Admin login successful');
        // --- Trigger data fetching --- Need to add this later
      } else {
        setLoginError('Invalid email or password.');
        console.error('Admin login failed');
      }
      setIsLoggingIn(false);
    }, 500); // Simulate delay
  };

  // --- Handle User Search --- 
  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    const lowerCaseQuery = searchQuery.toLowerCase();
    const results = usersData.filter(user => 
        user.email && user.email.toLowerCase().includes(lowerCaseQuery)
    );
    setSearchResults(results);
    // Simulate search delay/loading if needed, otherwise remove setTimeout
    setTimeout(() => setIsSearching(false), 300); 
  };

  // Render Login Modal
  const renderLoginModal = () => (
    <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-950 rounded-md border border-gray-200 dark:border-zinc-800 shadow-sm w-full max-w-sm overflow-hidden">
        <form onSubmit={handleLogin}>
          <div className="p-6 space-y-5">
            <div className="flex flex-col items-center text-center">
              <div className="p-2.5 bg-gray-100 dark:bg-zinc-800 rounded-md mb-4">
                 <LockKey size={22} weight="duotone" className="text-gray-700 dark:text-zinc-300" />
              </div>
              <h3 className="text-xl font-medium text-gray-800 dark:text-white mb-1">Admin Access</h3>
              <p className="text-sm text-gray-500 dark:text-zinc-400">
                Enter your credentials to access the dashboard
              </p>
            </div>

            {loginError && (
              <div className="p-3 bg-gray-50 dark:bg-zinc-800/70 border-l-2 border-red-500 dark:border-red-400 rounded-sm flex items-center gap-2">
                 <Warning size={14} weight="bold" className="text-red-500 dark:text-red-400 flex-shrink-0" />
                 <p className="text-xs text-gray-700 dark:text-zinc-300">{loginError}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800/70 border border-gray-200 dark:border-zinc-700/50 rounded-md text-black dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-black/30 dark:focus:ring-white/20"
                  placeholder="admin@example.com"
                />
              </div>
              <div>
                 <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800/70 border border-gray-200 dark:border-zinc-700/50 rounded-md text-black dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-black/30 dark:focus:ring-white/20"
                  placeholder="••••••••"
                />
              </div>
            </div>
          </div>
          <div className="px-6 py-4 border-t border-gray-100 dark:border-zinc-800/80">
            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors bg-black text-white dark:bg-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-100 disabled:opacity-50"
            >
              {isLoggingIn ? (
                 <>
                  <CircleNotch size={16} className="animate-spin" /> Authenticating...
                 </>
              ) : (
                 <>
                  <SignIn size={16} /> Continue
                 </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  // --- Render Admin Content Area ---
  const renderAdminContent = () => {
    // Helper to format currency
    const formatCurrency = (value) => 
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

    // ApexCharts Options (Plan Distribution - REMOVED)
    /*
    const planChartOptions = { ... };
    const planChartSeries = stats ? Object.values(stats.planDistribution) : [];
    */

    // --- Options for Onboarding Chart (Keep as is) ---
    const onboardingChartOptions = {
        chart: { 
          height: 280, // Adjust height for radial bar
          type: 'radialBar', 
          foreColor: document.documentElement.classList.contains('dark') ? '#d1d5db' : '#4b5563',
          background: 'transparent',
          fontFamily: 'inherit',
        },
        plotOptions: {
          radialBar: {
            hollow: {
              margin: 15,
              size: '70%',
            },
            track: {
              background: document.documentElement.classList.contains('dark') ? CHART_COLORS.dark : CHART_COLORS.light, // Use theme colors for track
            },
            dataLabels: {
              show: true,
              name: {
                offsetY: -10,
                show: true,
                color: CHART_DEFAULTS.foreColor,
                fontSize: '13px'
              },
              value: {
                formatter: function(val) {
                  return parseInt(val.toString(), 10) + "%"; // Show percentage
                },
                color: CHART_DEFAULTS.foreColor,
                fontSize: '30px',
                fontWeight: '700',
                show: true,
              }
            }
          }
        },
        fill: {
          colors: [CHART_COLORS.accentOrange] // Use accent orange for the bar
        },
        stroke: {
          lineCap: 'round'
        },
        labels: ['Completed'], // Label for the radial bar value
       // Removed legend, tooltip, etc. specific to donut
    };
    // Calculate percentage for radial bar series
    const onboardingPercentage = stats && stats.totalUsers > 0 ? 
        Math.round((stats.onboardingCompletedCount / stats.totalUsers) * 100) : 
        0;
    const onboardingChartSeries = [onboardingPercentage]; // Series is just the percentage value

    // --- Options for Daily Signups Chart ---
    const signupChartOptions = {
        chart: { 
          type: 'line',
          height: 280,
          fontFamily: CHART_DEFAULTS.fontFamily,
          foreColor: CHART_DEFAULTS.foreColor,
          background: CHART_DEFAULTS.background,
          toolbar: CHART_DEFAULTS.toolbar,
          animations: CHART_DEFAULTS.animations,
          zoom: { enabled: false },
        },
        stroke: {
          curve: 'smooth',
          width: 3
        },
        fill: {
          type: 'gradient',
          gradient: {
            shade: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
            gradientToColors: [ CHART_COLORS.accentOrange ], // Changed to orange
            shadeIntensity: 1,
            type: 'vertical',
            opacityFrom: 0.7,
            opacityTo: 0.2,
            stops: [0, 100]
          }
        },
        markers: {
          size: 4,
          colors: [CHART_COLORS.accentOrange], // Changed to orange
          strokeColors: '#fff',
          strokeWidth: 2,
          hover: {
            size: 6
          }
        },
        plotOptions: { 
          // Line chart için plotOptions gerekmez
        },
        dataLabels: { 
          enabled: false
        },
        states: {
          hover: {
            filter: {
              type: 'darken',
              value: 0.9,
            }
          },
          active: {
            allowMultipleDataPointsSelection: false,
            filter: {
              type: 'none',
            }
          },
        },
        xaxis: {
            categories: DAY_FORMATS.short,
            labels: { 
              style: { 
                fontSize: '11px',
                fontWeight: 500 
              } 
            },
            axisBorder: {
              show: false
            },
            axisTicks: {
              show: false,
            }
        },
        yaxis: { 
          title: { 
            text: 'Yeni Kullanıcılar',
            style: {
              fontSize: '13px',
              fontWeight: 500,
              color: CHART_DEFAULTS.foreColor
            }
          }, 
          labels: { 
            style: { 
              fontSize: '11px',
              colors: CHART_DEFAULTS.foreColor
            },
            formatter: (value) => Math.round(value)
          },
          min: 0,
          forceNiceScale: true,
        },
        grid: {
            borderColor: document.documentElement.classList.contains('dark') ? '#334155' : '#f1f5f9',
            strokeDashArray: 4,
            position: 'back',
            yaxis: { lines: { show: true } },
            xaxis: { lines: { show: false } }
        },
        colors: [CHART_COLORS.accentOrange], // Changed to orange
        tooltip: {
          shared: true,
          intersect: false,
          style: {
            fontSize: '12px',
            fontFamily: CHART_DEFAULTS.fontFamily,
          },
          x: {
            format: 'dd MMM'
          },
          y: {
            formatter: function(value) {
              return value + ' yeni kullanıcı';
            }
          }
        },
    };
    const signupChartSeries = [{ name: 'Kayıtlar', data: stats ? stats.dailySignups : [] }];

    // --- Options for Referral Source Chart (Changed to Radial Bar) ---
    const referralChartOptions = {
        chart: { 
          height: 320,
          type: 'radialBar', 
          offsetY: -10, // <-- From example
          foreColor: document.documentElement.classList.contains('dark') ? '#d1d5db' : '#4b5563',
          background: 'transparent',
          fontFamily: 'inherit',
        },
        plotOptions: {
          radialBar: {
            startAngle: -135, // <-- From example
            endAngle: 135, // <-- From example
            hollow: {
              margin: 5,
              size: '30%',
              background: 'transparent',
            },
            track: {
              background: document.documentElement.classList.contains('dark') ? CHART_COLORS.dark : CHART_COLORS.light,
              strokeWidth: '100%',
              margin: 5,
            },
            dataLabels: { // <-- Keep existing dataLabels for multi-series
              // Hide individual value labels inside, rely on legend
              name: {
                show: false,
              },
              value: {
                show: false,
              },
              total: { // Optional: Show total referrals in center
                show: true,
                label: 'Total Users',
                fontSize: '16px',
                fontWeight: 600,
                color: CHART_DEFAULTS.foreColor,
                formatter: function (w) {
                  const total = w.globals.seriesTotals.reduce((a, b) => a + b, 0);
                  return total;
                }
              }
            }
          }
        },
        fill: { // <-- From example
          type: 'gradient',
          gradient: {
              shade: 'dark',
              shadeIntensity: 0.15,
              inverseColors: false,
              opacityFrom: 1,
              opacityTo: 1,
              stops: [0, 50, 65, 91],
              gradientToColors: CHART_COLORS.chartOrange, // <-- Add orange colors
              inverseColors: false,
              opacityFrom: 1,
              opacityTo: 1,
              type: 'horizontal' // Ensure gradient direction suits radial bars
          },
        },
        // Format labels (e.g., 'search_engine' -> 'Search Engine')
        labels: stats ? Object.keys(stats.referralSources).map(key => 
            key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
        ) : [],
        legend: {
          show: true,
          position: 'bottom',
          fontWeight: 500,
          fontSize: '13px',
          markers: {
            width: 12,
            height: 12,
            radius: 6,
          },
           itemMargin: {
              horizontal: 8,
              vertical: 4
           }
        },
        stroke: {
            dashArray: 8, // <-- From example, increased value
            lineCap: 'round'
        },
         responsive: [{
            breakpoint: 480,
            options: {
              chart: {
                height: 280 // Adjust height for smaller screens
              },
              legend: {
                position: "bottom"
              }
            }
        }]
       // Removed options specific to donut
    };
    // Series data remains the same array of values
    const referralChartSeries = stats ? Object.values(stats.referralSources) : [];

    // --- NEW: Subscription Trend Chart (son 30 günlük abonelik trendi) ---
    const subscriptionTrendOptions = {
      chart: {
        type: 'line',
        height: 280,
        fontFamily: CHART_DEFAULTS.fontFamily,
        foreColor: CHART_DEFAULTS.foreColor,
        background: CHART_DEFAULTS.background,
        toolbar: CHART_DEFAULTS.toolbar,
        animations: CHART_DEFAULTS.animations,
        zoom: { enabled: false },
      },
      stroke: {
        curve: 'smooth',
        width: 3
      },
      fill: {
        type: 'gradient',
        gradient: {
          shade: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
          gradientToColors: [ CHART_COLORS.accentOrange ], // Changed to orange
          shadeIntensity: 1,
          type: 'vertical',
          opacityFrom: 0.7,
          opacityTo: 0.2,
          stops: [0, 100]
        }
      },
      markers: {
        size: 4,
        colors: [CHART_COLORS.accentOrange], // Changed to orange
        strokeColors: '#fff',
        strokeWidth: 2,
        hover: {
          size: 6
        }
      },
      plotOptions: { 
        // Line chart için plotOptions gerekmez
      },
      dataLabels: { 
        enabled: false
      },
      states: {
        hover: {
          filter: {
            type: 'darken',
            value: 0.9,
          }
        },
        active: {
          filter: {
            type: 'none',
          }
        },
      },
      xaxis: {
          categories: DAY_FORMATS.short,
          labels: { 
            style: { 
              fontSize: '11px',
              fontWeight: 500 
            } 
          },
          axisBorder: {
            show: false
          },
          axisTicks: {
            show: false,
          }
      },
      yaxis: { 
        title: { 
          text: 'Abonelik Oranı',
          style: {
            fontSize: '13px',
            fontWeight: 500,
            color: CHART_DEFAULTS.foreColor
          }
        }, 
        labels: { 
          style: { 
            fontSize: '11px',
            colors: CHART_DEFAULTS.foreColor
          },
          formatter: (value) => Math.round(value) + '%'
        },
        min: 0,
        max: 100,
        forceNiceScale: true,
      },
      grid: {
          borderColor: document.documentElement.classList.contains('dark') ? '#334155' : '#f1f5f9',
          strokeDashArray: 4,
          position: 'back',
          yaxis: { lines: { show: true } },
          xaxis: { lines: { show: false } }
      },
      colors: [CHART_COLORS.accentOrange], // Changed to orange
      tooltip: {
        shared: true,
        intersect: false,
        style: {
          fontSize: '12px',
          fontFamily: CHART_DEFAULTS.fontFamily,
        },
        x: {
          format: 'dd MMM'
        },
        y: {
          formatter: function(value) {
            return value + '%';
          }
        }
      },
    };

    // Stat Card Component (Internal for simplicity)
    const StatCard = ({ icon, title, value, format = (v) => v, smallText = false, trend = null, color = CHART_COLORS.primary }) => (
      <div className="bg-white dark:bg-zinc-950 p-5 rounded-sm border border-gray-200 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700 transition-colors">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 p-1 mt-0.5">
            {icon}
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-zinc-400 mb-1">{title}</p>
            <p className={`font-semibold text-gray-900 dark:text-white ${smallText ? 'text-xl' : 'text-2xl'}`}>{format(value)}</p>
          </div>
        </div>
      </div>
    );

    return (
    <div className="w-full">
      <div className="px-4 lg:px-0 max-w-screen-xl mx-auto pb-12"> {/* Added pb-12 for spacing */}
        {/* Header */}
        <div className="text-left mb-8 pt-8 pb-6 border-b border-gray-200 dark:border-zinc-800">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Admin Dashboard</h1>
          <p className="text-base text-gray-600 dark:text-zinc-400 max-w-2xl">
            Analytics overview and application insights
          </p>
        </div>

        {/* Data Loading / Error States */}
        {isLoadingData && (
            <div className="flex justify-center items-center py-20">
                <CircleNotch size={28} weight="regular" className="animate-spin text-gray-400 dark:text-zinc-500 mr-3" />
                <span className="text-base text-gray-500 dark:text-zinc-400">Loading data...</span>
            </div>
        )}
        {dataError && (
            <div className="p-5 bg-gray-50 dark:bg-zinc-800/70 border-l-2 border-red-500 dark:border-red-400 rounded-sm max-w-lg mx-auto">
                <div className="flex items-start gap-3">
                    <Warning size={18} weight="bold" className="text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-medium text-gray-800 dark:text-zinc-200 mb-1">Failed to Load Data</p>
                        <p className="text-sm text-gray-600 dark:text-zinc-400">Error: {dataError}</p>
                    </div>
                </div>
            </div>
        )}

        {/* --- Admin Dashboard Content --- */} 
        {!isLoadingData && !dataError && stats && (
          <div className="space-y-8">
            {/* Key Statistics Grid */} 
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard 
                icon={<Users size={22} weight="duotone" className="text-gray-700 dark:text-gray-300" />}
                title="Total Users" 
                value={stats.totalUsers} 
              />
              <StatCard 
                icon={<Users size={22} weight="duotone" className="text-gray-700 dark:text-gray-300" />}
                title="Active Subscribers" 
                value={stats.totalActiveSubscribers} 
              />
              <StatCard 
                icon={<CurrencyDollar size={22} weight="duotone" className="text-gray-700 dark:text-gray-300" />}
                title="Estimated MRR" 
                value={stats.totalMRR} 
                format={formatCurrency}
              />
              <StatCard 
                icon={<CurrencyDollar size={22} weight="duotone" className="text-gray-700 dark:text-gray-300" />}
                title="Estimated ARR" 
                value={stats.totalARR} 
                format={formatCurrency}
              />
              <StatCard 
                icon={<ImagesSquare size={22} weight="duotone" className="text-gray-700 dark:text-gray-300" />}
                title="Total Images Generated" 
                value={stats.totalGeneratedImages} 
              />
              <StatCard 
                icon={<FilmSlate size={22} weight="duotone" className="text-gray-700 dark:text-gray-300" />}
                title="Total Videos Generated" 
                value={stats.totalGeneratedVideos} 
              />
              <StatCard 
                icon={<Users size={22} weight="duotone" className="text-gray-700 dark:text-gray-300" />}
                title="Inactive Subscribers" 
                value={stats.totalInactiveSubscribers} 
              />
              <StatCard 
                icon={<ChartBar size={22} weight="duotone" className="text-gray-700 dark:text-gray-300" />}
                title="Onboarding Completion" 
                value={stats.totalUsers > 0 ? Math.round((stats.onboardingCompletedCount / stats.totalUsers) * 100) + '%' : '0%'} 
              />
            </div>

            {/* Daily Signups Chart (Moved Up) */}
            <div className="bg-white dark:bg-zinc-950 p-5 rounded-sm border border-gray-200 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700 transition-colors">
                 <div className="border-b border-gray-200 dark:border-zinc-800 pb-4 mb-4">
                   <h3 className="text-base font-medium text-gray-800 dark:text-zinc-200">Daily Signups (Last 7 Days)</h3>
                 </div>
                 <div>
                   <ReactApexChart
                     options={signupChartOptions}
                     series={signupChartSeries}
                     type="line"
                     height={260}
                   />
                 </div>
            </div>

            {/* Subscription Distribution Bar Chart (Replaced Treemap) */}
             <div className="bg-white dark:bg-zinc-950 p-5 rounded-sm border border-gray-200 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700 transition-colors">
                 <div className="border-b border-gray-200 dark:border-zinc-800 pb-4 mb-4">
                   <h3 className="text-base font-medium text-gray-800 dark:text-zinc-200">Subscription Distribution</h3>
                 </div>
                 <div>
                   {barChartData.series && barChartData.series.length > 0 && barChartData.series.some(s => s.data.some(count => count > 0)) ? ( // Check if ANY series has data > 0
                     <ReactApexChart
                       options={barChartData.options}
                       series={barChartData.series}
                       type="bar"
                       height={320}
                     />
                   ) : (
                     <div className="flex items-center justify-center h-40 text-sm text-gray-500 dark:text-zinc-400">
                       No active subscription data to display.
                     </div>
                   )}
                 </div>
             </div>

            {/* Subscription Trend Chart */}
            <div className="bg-white dark:bg-zinc-950 p-5 rounded-sm border border-gray-200 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700 transition-colors">
              <div>
                <h3 className="text-base font-medium text-gray-800 dark:text-zinc-200 pb-4 mb-4 border-b border-gray-200 dark:border-zinc-800">Subscription Trend</h3>
                <ReactApexChart 
                  options={subscriptionTrendOptions} 
                  series={[{
                    name: 'Abonelik Oranı',
                    data: [stats.retentionRate]
                  }]} 
                  type="line" 
                  height={260} 
                />
              </div>
            </div>
            
            {/* Onboarding & Referrals (Grid düzenlendi) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Onboarding Completion Chart */}
              <div className="bg-white dark:bg-zinc-950 p-5 rounded-sm border border-gray-200 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700 transition-colors">
                <div className="border-b border-gray-200 dark:border-zinc-800 pb-4 mb-4">
                  <h3 className="text-base font-medium text-gray-800 dark:text-zinc-200">Onboarding Completion</h3>
                </div>
                <div>
                  {stats.totalUsers > 0 ? (
                    <ReactApexChart 
                      options={onboardingChartOptions} 
                      series={onboardingChartSeries} 
                      type="radialBar" // <-- Changed chart type
                      height={280} // Adjusted height
                    />
                  ) : (
                    <div className="flex items-center justify-center h-40 text-sm text-gray-500 dark:text-zinc-400">
                      No users found.
                    </div>
                  )}
                </div>
              </div>

              {/* Referral Source Chart */} 
              <div className="bg-white dark:bg-zinc-950 p-5 rounded-sm border border-gray-200 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700 transition-colors">
                <div className="border-b border-gray-200 dark:border-zinc-800 pb-4 mb-4">
                  <h3 className="text-base font-medium text-gray-800 dark:text-white">Referans Kaynakları</h3>
                </div>
                <div>
                  {Object.keys(stats.referralSources || {}).length > 0 ? (
                    <ReactApexChart 
                      options={referralChartOptions} 
                      series={referralChartSeries} 
                      type="radialBar" // <-- Changed chart type
                      height={320} // Adjusted height
                    />
                  ) : (
                    <div className="flex items-center justify-center h-40 text-sm text-gray-500 dark:text-zinc-400">
                      Referans verisi bulunamadı.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* User Activity & Search */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4"> {/* Adjusted gap */}
                 {/* Recent Activity */}
                <div className="bg-white dark:bg-zinc-950 rounded-sm border border-gray-200 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700 transition-colors"> 
                  <div className="p-5 border-b border-gray-200 dark:border-zinc-800"> {/* Kept p-5 */} 
                    <h3 className="text-base font-medium text-gray-800 dark:text-zinc-200">Recent Signups</h3>
                  </div>
                  <div className="p-2"> {/* Kept p-2 */} 
                     {recentSignups.length > 0 ? (
                      <div className="max-h-72 overflow-y-auto">
                        <table className="w-full">
                          <tbody>
                            {recentSignups.map(user => (
                              <tr key={user.id} className="border-b border-gray-100 dark:border-zinc-800 last:border-0">
                                <td className="px-4 py-3 text-sm text-gray-700 dark:text-zinc-300 truncate" title={user.email}>
                                  {user.email}
                                </td>
                                <td className="px-4 py-3 text-right text-xs text-gray-500 dark:text-zinc-500 whitespace-nowrap">
                                  {user.createdAt ? user.createdAt.toDate().toLocaleDateString() : 'N/A'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                     ) : (
                         <div className="flex items-center justify-center h-40 text-sm text-gray-500 dark:text-zinc-400">
                            No signups in the last 7 days.
                         </div>
                     )}
                  </div>
                </div>
                {/* User Search */}
                <div className="bg-white dark:bg-zinc-950 rounded-sm border border-gray-200 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700 transition-colors"> 
                  <div className="p-5 border-b border-gray-200 dark:border-zinc-800"> {/* Kept p-5 */} 
                    <h3 className="text-base font-medium text-gray-800 dark:text-zinc-200">User Search</h3>
                  </div>
                  <div className="p-5"> {/* Kept p-5 */} 
                     <form onSubmit={handleSearch} className="flex gap-2 mb-4">
                        <input 
                            type="email"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by email..."
                            className="flex-grow px-3 py-2 bg-gray-50 dark:bg-zinc-800/70 border border-gray-200 dark:border-zinc-700/50 rounded-sm text-sm text-black dark:text-white focus:outline-none focus:ring-1 focus:ring-black/30 dark:focus:ring-white/20"
                        />
                        <button 
                            type="submit"
                            disabled={isSearching}
                            className="px-4 py-2 text-sm bg-black text-white dark:bg-white dark:text-black rounded-sm hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50 flex items-center justify-center"
                        >
                            {isSearching ? <CircleNotch size={16} className="animate-spin"/> : 'Search'}
                        </button>
                     </form>
                     
                     {/* Search Results */} 
                     <div className="max-h-44 overflow-y-auto">
                         {searchResults.length > 0 ? (
                            <div className="space-y-2">
                              {searchResults.map(user => (
                                <div key={user.id} className="py-2 px-3 border-b border-gray-100 dark:border-zinc-800 last:border-0">
                                  <p className="text-sm font-medium text-gray-800 dark:text-zinc-200 truncate" title={user.email}>{user.email}</p>
                                  <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">
                                    Plan: {getPlanDetailsFromPriceId(user.stripePriceId)?.name || 'N/A'} • 
                                    Status: {user.subscriptionStatus ? user.subscriptionStatus : 'N/A'}
                                  </p>
                                </div>
                              ))}
                            </div>
                         ) : (
                            <p className="text-sm text-gray-500 dark:text-zinc-500 pt-2">
                                {searchQuery && !isSearching ? 'No users found matching that email.' : 'Enter an email to search.'}
                            </p>
                         )}
                     </div>
                  </div>
                </div>
            </div>

            {/* Feature Requests */}
            <div className="bg-white dark:bg-zinc-950 rounded-sm border border-gray-200 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700 transition-colors"> 
              <div className="p-5 border-b border-gray-200 dark:border-zinc-800"> {/* Kept p-5 */} 
                <h3 className="text-base font-medium text-gray-800 dark:text-zinc-200">Feature Requests</h3>
              </div>
              <div className="p-2"> {/* Kept p-2 */} 
                {featureRequests.length > 0 ? (
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full">
                      <tbody>
                        {featureRequests.map((req, index) => (
                          <tr key={req.id} className="border-b border-gray-100 dark:border-zinc-800 last:border-0">
                            <td className="px-4 py-3 text-sm text-gray-700 dark:text-zinc-300">{index + 1}. {req.title}</td>
                            <td className="px-4 py-3 text-right">
                              <span className="text-xs font-medium inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-zinc-800 rounded-full text-gray-600 dark:text-zinc-400">
                                <ArrowUp size={12} weight="bold" /> {req.votes}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-40 text-sm text-gray-500 dark:text-zinc-400">
                    No feature requests found.
                  </div>
                )}
              </div>
            </div>

            {/* --- NEW: User Flow Sankey Chart --- */}
            <div className="bg-white dark:bg-zinc-950 p-5 rounded-sm border border-gray-200 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700 transition-colors">
              <div className="border-b border-gray-200 dark:border-zinc-800 pb-4 mb-4">
                  <h3 className="text-base font-medium text-gray-800 dark:text-zinc-200">User Journey: Signup to Subscription</h3>
              </div>
              <div>
                {sankeyData.series && sankeyData.series.length > 0 && sankeyData.series[0].data.length > 0 ? (
                    <ReactApexChart
                        options={sankeyData.options}
                        series={sankeyData.series}
                        type="sankey"
                        height={sankeyData.options?.chart?.height || 400}
                    />
                ) : (
                    <div className="flex items-center justify-center h-40 text-sm text-gray-500 dark:text-zinc-400">
                        Not enough data to display user flow.
                    </div>
                )}
              </div>
            </div>

            {/* Logout Area */}
            <div className="flex justify-end pt-6 border-t border-gray-200 dark:border-zinc-800">
              <button
                onClick={() => {
                  setIsAdminLoggedIn(false);
                  setShowLoginModal(true);
                  setEmail('');
                  setPassword('');
                  setLoginError('');
                  // Clear data states on logout
                  setStats(null);
                  setUsersData([]);
                  setFeatureRequests([]);
                  setDataError('');
                  setRecentSignups([]);
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-sm text-white bg-black hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-100 focus:outline-none transition-colors"
              >
                Log Out
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  )};

  // If credentials aren't configured, show an error message permanently.
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
     return (
        <div className="w-full h-full flex items-center justify-center p-8">
             <div className="p-6 bg-white dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-sm max-w-md">
                 <div className="flex items-start gap-4">
                     <Warning size={20} weight="bold" className="text-black dark:text-white flex-shrink-0 mt-0.5" />
                     <div>
                         <h3 className="text-lg font-medium text-gray-800 dark:text-white mb-2">Admin Panel Not Configured</h3>
                         <p className="text-sm text-gray-600 dark:text-zinc-400 mb-4">
                            Admin credentials are missing in your environment variables.
                         </p>
                         <div className="bg-gray-50 dark:bg-zinc-800/70 p-3 rounded-sm border-l-2 border-gray-300 dark:border-zinc-700 text-xs text-gray-700 dark:text-zinc-300 font-mono">
                            <p>1. Create a <code>.env</code> file in your project root</p>
                            <p>2. Add the following variables:</p>
                            <p className="mt-2 ml-4">VITE_ADMIN_EMAIL=your-email@example.com</p>
                            <p className="ml-4">VITE_ADMIN_PASSWORD=your-secure-password</p>
                         </div>
                     </div>
                 </div>
             </div>
        </div>
     );
  }

  return (
    <div className="relative min-h-screen"> {/* Removed bg-gray-50 */}
      {isAdminLoggedIn ? (
        renderAdminContent()
      ) : (
         // Render a placeholder or nothing while the modal is potentially active
         <div className="w-full h-full flex items-center justify-center">
             {/* Optionally show a loading indicator or just blank */}
         </div>
      )}
      {/* Show modal only if not logged in AND modal state is true */}
      {!isAdminLoggedIn && showLoginModal && renderLoginModal()}
    </div>
  );
}

export default Admin; 
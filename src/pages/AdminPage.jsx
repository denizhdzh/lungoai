import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, orderBy, query, where, getCountFromServer } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, storage, functions } from '../firebase';
import Header from '../components/Header.jsx';

const AdminPage = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalUsers: 0,
    onboardingCompleted: 0,
    activeSubscriptions: 0,
    totalGenerations: 0
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFeature, setEditingFeature] = useState(null);
  const [formData, setFormData] = useState({
    featureName: '',
    aiModel: '',
    type: 'static_image',
    imageUrl: '',
    beforeImage: '',
    afterImage: '',
    cta: '',
    link: ''
  });
  const [imageFile, setImageFile] = useState(null);
  const [beforeImageFile, setBeforeImageFile] = useState(null);
  const [afterImageFile, setAfterImageFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
    const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD;
    
    if (adminEmail && adminPassword) {
      const stored = localStorage.getItem('admin_auth');
      if (stored === `${adminEmail}:${adminPassword}`) {
        setIsAuthenticated(true);
        fetchFeatures();
        fetchStats();
      }
    }
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
    const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD;
    
    if (loginForm.email === adminEmail && loginForm.password === adminPassword) {
      localStorage.setItem('admin_auth', `${adminEmail}:${adminPassword}`);
      setIsAuthenticated(true);
      fetchFeatures();
      fetchStats();
    } else {
      alert('Invalid credentials');
    }
  };

  const fetchStats = async () => {
    try {
      setStatsLoading(true);
      console.log('🔍 Starting stats fetch...');
      
      // Call Firebase Function to get Auth user count (since we can't access Auth directly from frontend)
      console.log('📊 Calling getAdminStats function...');
      const getAdminStats = httpsCallable(functions, 'getAdminStats');
      const result = await getAdminStats();
      
      if (result.data.success) {
        console.log('✅ Got stats from function:', result.data.stats);
        setStats(result.data.stats);
      } else {
        throw new Error(result.data.error || 'Failed to fetch stats');
      }
      
    } catch (error) {
      console.error('❌ Error fetching stats:', error);
      
      // Fallback: Get what we can from Firestore
      try {
        console.log('🔄 Trying fallback Firestore stats...');
        const usersCollection = collection(db, 'users');
        
        const onboardingQuery = query(usersCollection, where('onboardingCompleted', '==', true));
        const onboardingSnapshot = await getCountFromServer(onboardingQuery);
        const onboardingCompleted = onboardingSnapshot.data().count;
        
        const activeSubsQuery = query(usersCollection, where('subscriptionStatus', '==', 'active'));
        const activeSubsSnapshot = await getCountFromServer(activeSubsQuery);
        const activeSubscriptions = activeSubsSnapshot.data().count;
        
        setStats({
          totalUsers: 'N/A', // Can't get from frontend
          onboardingCompleted,
          activeSubscriptions,
          totalGenerations: 0
        });
        
        console.log('✅ Fallback stats loaded');
      } catch (fallbackError) {
        console.error('❌ Fallback also failed:', fallbackError);
        setStats({
          totalUsers: 'Error',
          onboardingCompleted: 'Error',
          activeSubscriptions: 'Error',
          totalGenerations: 'Error'
        });
      }
    } finally {
      setStatsLoading(false);
      console.log('✅ Stats loading finished');
    }
  };

  const fetchFeatures = async () => {
    try {
      const featuresRef = collection(db, 'system', 'features', 'items');
      const q = query(featuresRef, orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      
      const featuresData = [];
      querySnapshot.forEach((doc) => {
        featuresData.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      setFeatures(featuresData);
    } catch (error) {
      console.error('Error fetching features:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (file) => {
    if (!file) return null;
    
    try {
      setUploading(true);
      const timestamp = Date.now();
      const storageRef = ref(storage, `features/${timestamp}_${file.name.replace(/\.[^/.]+$/, "")}.webp`);
      
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      
      return downloadURL;
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Failed to upload image');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      let imageUrl = formData.imageUrl;
      let beforeImageUrl = formData.beforeImage;
      let afterImageUrl = formData.afterImage;
      
      if (imageFile) {
        imageUrl = await handleImageUpload(imageFile);
        if (!imageUrl) return;
      }
      
      if (formData.type === 'edit_demo') {
        if (beforeImageFile) {
          beforeImageUrl = await handleImageUpload(beforeImageFile);
          if (!beforeImageUrl) return;
        }
        if (afterImageFile) {
          afterImageUrl = await handleImageUpload(afterImageFile);
          if (!afterImageUrl) return;
        }
      }

      const featureData = {
        ...formData,
        imageUrl: formData.type === 'static_image' ? imageUrl : '',
        beforeImage: formData.type === 'edit_demo' ? beforeImageUrl : '',
        afterImage: formData.type === 'edit_demo' ? afterImageUrl : '',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      if (editingFeature) {
        await updateDoc(doc(db, 'system', 'features', 'items', editingFeature.id), {
          ...featureData,
          updatedAt: new Date()
        });
      } else {
        await addDoc(collection(db, 'system', 'features', 'items'), featureData);
      }

      setIsModalOpen(false);
      setEditingFeature(null);
      setFormData({
        featureName: '',
        aiModel: '',
        type: 'static_image',
        imageUrl: '',
        beforeImage: '',
        afterImage: '',
        cta: '',
        link: ''
      });
      setImageFile(null);
      setBeforeImageFile(null);
      setAfterImageFile(null);
      fetchFeatures();
    } catch (error) {
      console.error('Error saving feature:', error);
      alert('Failed to save feature');
    }
  };

  const handleEdit = (feature) => {
    setEditingFeature(feature);
    setFormData({
      featureName: feature.featureName || '',
      aiModel: feature.aiModel || '',
      type: feature.type || 'static_image',
      imageUrl: feature.imageUrl || '',
      beforeImage: feature.beforeImage || '',
      afterImage: feature.afterImage || '',
      cta: feature.cta || '',
      link: feature.link || ''
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (featureId) => {
    if (!confirm('Are you sure you want to delete this feature?')) return;
    
    try {
      await deleteDoc(doc(db, 'system', 'features', 'items', featureId));
      fetchFeatures();
    } catch (error) {
      console.error('Error deleting feature:', error);
      alert('Failed to delete feature');
    }
  };

  const resetForm = () => {
    setEditingFeature(null);
    setFormData({
      featureName: '',
      aiModel: '',
      type: 'static_image',
      imageUrl: '',
      beforeImage: '',
      afterImage: '',
      cta: '',
      link: ''
    });
    setImageFile(null);
    setBeforeImageFile(null);
    setAfterImageFile(null);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="bg-neutral-900 rounded-xl p-8 w-full max-w-md border border-neutral-800">
          <h1 className="text-2xl font-light text-white mb-6 text-center">Admin Login</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">Email</label>
              <input
                type="email"
                value={loginForm.email}
                onChange={(e) => setLoginForm({...loginForm, email: e.target.value})}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-lime-400"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">Password</label>
              <input
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm({...loginForm, password: e.target.value})}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-lime-400"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full bg-lime-400 text-black px-4 py-2 rounded-lg font-medium hover:bg-lime-300 transition-colors"
            >
              Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950">
      <Header />
      
      <div className="max-w-6xl mx-auto p-8 mt-16">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-light text-white">Admin Dashboard</h1>
          <button
            onClick={() => fetchStats()}
            className="bg-neutral-800 text-white px-4 py-2 rounded-lg font-medium hover:bg-neutral-700 transition-colors"
          >
            Refresh Stats
          </button>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          {statsLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-neutral-900 rounded-xl p-6 border border-neutral-800 animate-pulse">
                <div className="h-4 bg-neutral-800 rounded mb-2"></div>
                <div className="h-8 bg-neutral-800 rounded"></div>
              </div>
            ))
          ) : (
            <>
              <div className="bg-neutral-900 rounded-xl p-6 border border-neutral-800">
                <h3 className="text-sm font-medium text-white/60 mb-2">Total Users</h3>
                <p className="text-2xl font-bold text-white">{stats.totalUsers.toLocaleString()}</p>
              </div>
              <div className="bg-neutral-900 rounded-xl p-6 border border-neutral-800">
                <h3 className="text-sm font-medium text-white/60 mb-2">Onboarding Complete</h3>
                <p className="text-2xl font-bold text-white">{stats.onboardingCompleted.toLocaleString()}</p>
                <p className="text-xs text-lime-400 mt-1">
                  {stats.totalUsers > 0 ? `${Math.round((stats.onboardingCompleted / stats.totalUsers) * 100)}%` : '0%'}
                </p>
              </div>
              <div className="bg-neutral-900 rounded-xl p-6 border border-neutral-800">
                <h3 className="text-sm font-medium text-white/60 mb-2">Active Subscriptions</h3>
                <p className="text-2xl font-bold text-white">{stats.activeSubscriptions.toLocaleString()}</p>
                <p className="text-xs text-lime-400 mt-1">
                  {stats.onboardingCompleted > 0 ? `${Math.round((stats.activeSubscriptions / stats.onboardingCompleted) * 100)}%` : '0%'}
                </p>
              </div>
              <div className="bg-neutral-900 rounded-xl p-6 border border-neutral-800">
                <h3 className="text-sm font-medium text-white/60 mb-2">Total Generations</h3>
                <p className="text-2xl font-bold text-white">{stats.totalGenerations.toLocaleString()}</p>
                <p className="text-xs text-white/60 mt-1">
                  {stats.onboardingCompleted > 0 ? `${Math.round(stats.totalGenerations / stats.onboardingCompleted)} avg/user` : '0 avg/user'}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Features Management Section */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-medium text-white">Features Management</h2>
          <button
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
            className="bg-lime-400 text-black px-4 py-2 rounded-lg font-medium hover:bg-lime-300 transition-colors"
          >
            Add Feature
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-lime-400/30 border-t-lime-400 rounded-full animate-spin mx-auto"></div>
            <p className="text-white/60 mt-4">Loading features...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div key={feature.id} className="bg-neutral-900 rounded-xl p-6 border border-neutral-800">
                {feature.imageUrl && (
                  <div className="aspect-video mb-4 rounded-lg overflow-hidden">
                    <img 
                      src={feature.imageUrl} 
                      alt={feature.featureName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <h3 className="text-lg font-medium text-white mb-2">{feature.featureName}</h3>
                <p className="text-sm text-white/60 mb-1">Powered by {feature.aiModel}</p>
                <p className="text-xs text-lime-400 mb-3">Type: {feature.type || 'static_image'}</p>
                {feature.cta && (
                  <p className="text-sm text-lime-400 mb-4">{feature.cta}</p>
                )}
                
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(feature)}
                    className="flex-1 bg-neutral-800 text-white px-3 py-2 rounded-lg text-sm hover:bg-neutral-700 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(feature.id)}
                    className="flex-1 bg-red-600/20 text-red-400 px-3 py-2 rounded-lg text-sm hover:bg-red-600/30 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-neutral-900 rounded-xl p-6 w-full max-w-md border border-neutral-800">
              <h2 className="text-xl font-medium text-white mb-4">
                {editingFeature ? 'Edit Feature' : 'Add Feature'}
              </h2>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">Feature Name</label>
                  <input
                    type="text"
                    value={formData.featureName}
                    onChange={(e) => setFormData({...formData, featureName: e.target.value})}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-lime-400"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">AI Model</label>
                  <input
                    type="text"
                    value={formData.aiModel}
                    onChange={(e) => setFormData({...formData, aiModel: e.target.value})}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-lime-400"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value})}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-lime-400"
                  >
                    <option value="static_image">Static Image</option>
                    <option value="edit_demo">Edit Demo (Before/After)</option>
                    <option value="video">Video</option>
                  </select>
                </div>

                {formData.type === 'static_image' && (
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">Image</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setImageFile(e.target.files[0])}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-lime-400"
                    />
                    {formData.imageUrl && !imageFile && (
                      <p className="text-xs text-white/60 mt-1">Current image will be kept</p>
                    )}
                  </div>
                )}
                
                {formData.type === 'edit_demo' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-2">Before Image</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setBeforeImageFile(e.target.files[0])}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-lime-400"
                        required={!formData.beforeImage}
                      />
                      {formData.beforeImage && !beforeImageFile && (
                        <p className="text-xs text-white/60 mt-1">Current before image will be kept</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-2">After Image</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setAfterImageFile(e.target.files[0])}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-lime-400"
                        required={!formData.afterImage}
                      />
                      {formData.afterImage && !afterImageFile && (
                        <p className="text-xs text-white/60 mt-1">Current after image will be kept</p>
                      )}
                    </div>
                  </>
                )}
                
                {formData.type === 'video' && (
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">Video URL</label>
                    <input
                      type="url"
                      value={formData.imageUrl}
                      onChange={(e) => setFormData({...formData, imageUrl: e.target.value})}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-lime-400"
                      placeholder="https://example.com/video.mp4"
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">CTA Text</label>
                  <input
                    type="text"
                    value={formData.cta}
                    onChange={(e) => setFormData({...formData, cta: e.target.value})}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-lime-400"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">Link</label>
                  <input
                    type="url"
                    value={formData.link}
                    onChange={(e) => setFormData({...formData, link: e.target.value})}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-lime-400"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      resetForm();
                    }}
                    className="flex-1 bg-neutral-800 text-white px-4 py-2 rounded-lg hover:bg-neutral-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={uploading}
                    className="flex-1 bg-lime-400 text-black px-4 py-2 rounded-lg font-medium hover:bg-lime-300 transition-colors disabled:opacity-50"
                  >
                    {uploading ? 'Uploading...' : editingFeature ? 'Update' : 'Add'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPage;
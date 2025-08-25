import { useState, useEffect, useRef } from 'react';
import { db, auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, orderBy, getDocs, limit, startAfter } from "@firebase/firestore";
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Heart, Download, X, Trash } from '@phosphor-icons/react';
import Header from './Header';

const Dashboard = () => {
  const [generations, setGenerations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState(null);
  const [user, setUser] = useState(null);
  const [columns, setColumns] = useState([[], [], [], []]);
  const [selectedGeneration, setSelectedGeneration] = useState(null);
  const gridRef = useRef(null);

  const ITEMS_PER_PAGE = 20;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      console.log('Auth state changed:', currentUser?.uid);
      setUser(currentUser);
      if (currentUser) {
        fetchGenerationsForUser(currentUser);
      }
    });

    return () => unsubscribe();
  }, []);

  // Organize generations into columns for masonry effect
  useEffect(() => {
    if (generations.length > 0) {
      const newColumns = [[], [], [], []];
      generations.forEach((gen, index) => {
        const columnIndex = index % 4;
        newColumns[columnIndex].push(gen);
      });
      setColumns(newColumns);
    }
  }, [generations]);

  const fetchGenerations = async (reset = true) => {
    return fetchGenerationsForUser(user, reset);
  };

  const fetchGenerationsForUser = async (currentUser, reset = true) => {
    try {
      console.log('Fetching generations, user:', currentUser?.uid, 'reset:', reset);
      
      if (reset) {
        setLoading(true);
        setGenerations([]);
        setLastDoc(null);
        setHasMore(true);
      } else {
        setLoadingMore(true);
      }

      const generationsColRef = collection(db, 'users', currentUser.uid, 'generations');
      console.log('Collection ref created');
      
      let q;
      if (reset || !lastDoc) {
        q = query(generationsColRef, orderBy('timestamp', 'desc'), limit(ITEMS_PER_PAGE));
      } else {
        q = query(generationsColRef, orderBy('timestamp', 'desc'), startAfter(lastDoc), limit(ITEMS_PER_PAGE));
      }
      
      console.log('Query created, fetching documents...');
      const snapshot = await getDocs(q);
      console.log('Documents fetched:', snapshot.docs.length);
      
      const processedGenerations = snapshot.docs.map(doc => {
        const data = doc.data();
        console.log('Document data:', doc.id, data);
        return { 
          id: doc.id, 
          ...data, 
          timestamp: data.timestamp?.toDate() || new Date()
        };
      });
      
      if (reset) {
        setGenerations(processedGenerations);
      } else {
        setGenerations(prev => [...prev, ...processedGenerations]);
      }

      // Set last document for pagination
      if (snapshot.docs.length > 0) {
        setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      }

      // Check if there are more documents
      setHasMore(snapshot.docs.length === ITEMS_PER_PAGE);
      
      console.log('Final generations count:', processedGenerations.length);
      
    } catch (error) {
      console.error('Error fetching generations:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMore = () => {
    if (!loadingMore && hasMore) {
      fetchGenerations(false);
    }
  };

  const GenerationCard = ({ generation }) => {
    const isVideo = generation.type === 'video' || generation.commandCode === 101;
    const mediaUrl = generation.finalUrl || generation.imageUrl || generation.videoUrl;

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="group relative overflow-hidden rounded-lg hover:scale-105 transition-transform duration-200 cursor-pointer"
        onClick={() => setSelectedGeneration(generation)}
      >
        {mediaUrl ? (
          <>
            {isVideo ? (
              <video
                className="w-full h-auto object-cover"
                poster={generation.thumbnailUrl}
                preload="metadata"
              >
                <source src={mediaUrl} type="video/mp4" />
              </video>
            ) : (
              <img
                src={mediaUrl}
                alt="Generated content"
                className="w-full h-auto object-cover"
              />
            )}
            
            {/* Play button overlay for videos */}
            {isVideo && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="bg-white/90 rounded-full p-3">
                  <Play size={24} className="text-black ml-1" />
                </div>
              </div>
            )}
            
            {/* Action buttons - show on hover */}
            <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button className="bg-black/70 backdrop-blur-sm rounded-full p-2 text-white hover:bg-black/90 transition-colors">
                <Heart size={16} />
              </button>
              <button className="bg-black/70 backdrop-blur-sm rounded-full p-2 text-white hover:bg-black/90 transition-colors">
                <Download size={16} />
              </button>
            </div>
          </>
        ) : (
          <div className="w-full aspect-square bg-neutral-800 flex items-center justify-center">
            <span className="text-neutral-400">No preview</span>
          </div>
        )}
      </motion.div>
    );
  };

  const ImageModal = () => {
    if (!selectedGeneration) return null;

    const isVideo = selectedGeneration.type === 'video' || selectedGeneration.commandCode === 101;
    const mediaUrl = selectedGeneration.finalUrl || selectedGeneration.imageUrl || selectedGeneration.videoUrl;

    const handleDownload = async () => {
      if (mediaUrl) {
        const link = document.createElement('a');
        link.href = mediaUrl;
        link.download = `generation-${selectedGeneration.id}.${isVideo ? 'mp4' : 'jpg'}`;
        link.click();
      }
    };

    const handleDelete = () => {
      // TODO: Implement delete functionality
      console.log('Delete generation:', selectedGeneration.id);
      setSelectedGeneration(null);
    };

    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedGeneration(null)}
        >
          {/* Blurred background */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-md" />
          
          {/* Modal content */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className="relative z-10 max-w-4xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Action buttons */}
            <div className="flex justify-end gap-2 mb-4">
              <button
                onClick={handleDownload}
                className="bg-white/10 backdrop-blur-sm hover:bg-white/20 text-white p-3 rounded-full transition-colors"
              >
                <Download size={20} />
              </button>
              <button
                onClick={handleDelete}
                className="bg-red-500/20 backdrop-blur-sm hover:bg-red-500/30 text-red-400 p-3 rounded-full transition-colors"
              >
                <Trash size={20} />
              </button>
              <button
                onClick={() => setSelectedGeneration(null)}
                className="bg-white/10 backdrop-blur-sm hover:bg-white/20 text-white p-3 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* Media content */}
            <div className="flex-1 flex items-center justify-center">
              {isVideo ? (
                <video
                  className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                  poster={selectedGeneration.thumbnailUrl}
                  controls
                  autoPlay
                >
                  <source src={mediaUrl} type="video/mp4" />
                </video>
              ) : (
                <img
                  src={mediaUrl}
                  alt="Generated content"
                  className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                />
              )}
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <Header />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 mt-16">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Recent Generations</h1>
          <p className="text-neutral-400">Your latest AI-generated content</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        ) : generations.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-neutral-400">No generations found.</p>
          </div>
        ) : (
          <>
            <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {columns.map((column, columnIndex) => (
                <div key={columnIndex} className="flex flex-col gap-6">
                  {column.map((gen) => (
                    <GenerationCard key={gen.id} generation={gen} />
                  ))}
                </div>
              ))}
            </div>
            
            {/* Load More Button */}
            {hasMore && (
              <div className="flex justify-center mt-8">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-6 py-3 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingMore ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Loading...
                    </div>
                  ) : (
                    'Load More'
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Image Modal */}
      {selectedGeneration && <ImageModal />}
    </div>
  );
};

export default Dashboard;
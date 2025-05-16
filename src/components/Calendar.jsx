import React, { useState, useEffect, useCallback } from 'react';
import { auth, db } from '../firebase';
import { collection, getDocs, Timestamp, where, query, doc, updateDoc } from "@firebase/firestore";
import { CaretLeft, CaretRight, Plus, Sun, Moon, Compass, VideoCamera, ImagesSquare, Trash } from '@phosphor-icons/react';
import { useOutletContext } from 'react-router-dom';

function Calendar() {
  const user = auth.currentUser;
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(currentDate.getMonth());
  const [currentYear, setCurrentYear] = useState(currentDate.getFullYear());
  const [viewMode, setViewMode] = useState('monthly');
  const [events, setEvents] = useState([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);
  const [showDayDetail, setShowDayDetail] = useState(false);

  // --- Get data from Layout context --- 
  const { 
      isDarkMode,
    } = useOutletContext() || { 
      isDarkMode: false,
    }; 

  // Month names for header
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June', 
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Day names for header
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // --- Fetch Scheduled Events ---
  const fetchEvents = useCallback(async () => {
    if (!user || !user.uid) {
      setEvents([]);
      setIsLoadingEvents(false);
      return;
    }
    setIsLoadingEvents(true);
    try {
      const fetchedEvents = [];

      // 1. Fetch scheduled slideshows from 'generations'
      const generationsRef = collection(db, 'users', user.uid, 'generations');
      const scheduledGenerationsQuery = query(
        generationsRef,
        where('isScheduled', '==', true),
        where('scheduledAt', '!=', null)
      );
      const generationsSnapshot = await getDocs(scheduledGenerationsQuery);
      generationsSnapshot.forEach(docSnap => { // Renamed doc to docSnap to avoid conflict
        const data = docSnap.data();
        if (data.type === 'slideshow' && data.scheduledAt) {
          fetchedEvents.push({
            id: docSnap.id,
            title: `🗓️ Slideshow: ${data.topic || data.slideTexts?.[0]?.substring(0,20) || 'Untitled'}`,
            date: data.scheduledAt.toDate(),
            type: 'slideshow',
            itemType: 'slideshow', // for modal
            sourceCollection: 'generations', // for unscheduling
            fullData: data, // Store full data for modal
          });
        }
      });

      // 2. Fetch scheduled videos from 'tiktok-posts'
      const tiktokPostsRef = collection(db, 'users', user.uid, 'tiktok-posts');
      const scheduledVideosQuery = query(
        tiktokPostsRef,
        where('isScheduled', '==', true),
        where('scheduledAt', '!=', null)
      );
      const tiktokPostsSnapshot = await getDocs(scheduledVideosQuery);
      tiktokPostsSnapshot.forEach(docSnap => { // Renamed doc to docSnap
        const data = docSnap.data();
        // Assuming videos are in tiktok-posts and don't have a 'type' field, or it might be 'video'
        // Add check for status if needed, e.g., data.status !== 'failed'
        if (data.scheduledAt && (data.status !== 'failed' && data.status !== 'image_gen_failed')) {
          let videoDescription = 'Video Content';
          if(data.originalParameters?.subject_description){
              videoDescription = data.originalParameters.subject_description;
          }
          fetchedEvents.push({
            id: docSnap.id,
            title: `🎬 Video: ${videoDescription.substring(0, 30)}`,
            date: data.scheduledAt.toDate(),
            type: 'video',
            itemType: 'video', // for modal
            sourceCollection: 'tiktok-posts', // for unscheduling
            fullData: data, // Store full data for modal
          });
        }
      });
      
      setEvents(fetchedEvents);
    } catch (error) {
      console.error("Error fetching scheduled events:", error);
    } finally {
      setIsLoadingEvents(false);
    }
  }, [user, db]); // Added db to dependencies, removed viewMode, currentDate, currentMonth, currentYear as fetch is global now

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]); // Fetch events when component mounts or user changes

  // --- Handle Unschedule ---
  const handleUnschedule = async (eventId, sourceCollection) => {
    if (!user || !user.uid || !eventId || !sourceCollection) return;
    console.log(`Attempting to unschedule: ID=${eventId}, Collection=${sourceCollection}`);
    try {
      const eventDocRef = doc(db, 'users', user.uid, sourceCollection, eventId);
      await updateDoc(eventDocRef, {
        isScheduled: false,
        scheduledAt: null
      });
      // Refresh events after unscheduling
      fetchEvents();
      setShowDayDetail(false); // Close modal
      // Optionally, show a success toast/message
      console.log(`Event ${eventId} from ${sourceCollection} unscheduled successfully.`);
    } catch (error) {
      console.error("Error unscheduling event:", error);
      // Optionally, show an error toast/message
    }
  };

  // --- Helper Functions for Weekly View ---
  const getWeekStartDate = (date) => {
    const dt = new Date(date);
    const dayOfWeek = dt.getDay(); // 0 = Sunday, 6 = Saturday
    dt.setDate(dt.getDate() - dayOfWeek);
    dt.setHours(0, 0, 0, 0); // Set to start of the day
    return dt;
  };

  const getWeekEndDate = (date) => {
    const dt = getWeekStartDate(date);
    dt.setDate(dt.getDate() + 6);
    dt.setHours(23, 59, 59, 999); // Set to end of the day
    return dt;
  };

  // --- Navigation functions ---
  const goToPrevious = () => {
    if (viewMode === 'monthly') {
      const newDate = new Date(currentYear, currentMonth - 1, 1);
      setCurrentMonth(newDate.getMonth());
      setCurrentYear(newDate.getFullYear());
      setCurrentDate(newDate); // Keep currentDate somewhat synced
    } else { // Weekly view
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() - 7);
      setCurrentDate(newDate);
    }
  };

  const goToNext = () => {
    if (viewMode === 'monthly') {
      const newDate = new Date(currentYear, currentMonth + 1, 1);
      setCurrentMonth(newDate.getMonth());
      setCurrentYear(newDate.getFullYear());
      setCurrentDate(newDate); // Keep currentDate somewhat synced
    } else { // Weekly view
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() + 7);
      setCurrentDate(newDate);
    }
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setCurrentMonth(today.getMonth()); // Update month/year for monthly view consistency
    setCurrentYear(today.getFullYear());
    // No need to change viewMode here, just go to today's date/week/month
  };

  // Generate calendar grid
  const generateCalendarDays = () => {
    const calendarDays = [];
    const processDayEvents = (dayDate) => {
      return events.filter(event => {
        const eventDate = event.date; // Already a JS Date object from fetchEvents
        return eventDate.getDate() === dayDate.getDate() &&
               eventDate.getMonth() === dayDate.getMonth() &&
               eventDate.getFullYear() === dayDate.getFullYear();
      });
    };

    if (viewMode === 'monthly') {
      const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
      const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday, 1 = Monday, etc.
      
      // Add empty cells (Match new default background)
      for (let i = 0; i < startingDayOfWeek; i++) {
        calendarDays.push(
          <div key={`empty-${i}`} className="h-24 md:h-32 p-3 rounded-lg bg-gray-100 dark:bg-zinc-800"></div>
        );
      }
      
      // Add cells for each day of the month - Monthly View
      for (let day = 1; day <= daysInMonth; day++) {
        const dayDate = new Date(currentYear, currentMonth, day);
        const isToday = isCurrentDay(dayDate);
        const dayEvents = processDayEvents(dayDate);
        
        // Reusing the day rendering logic (could be extracted to a helper)
        calendarDays.push(
          <div 
            key={`day-${day}`} 
            className={`
              h-24 md:h-32 p-3 rounded-lg relative transition-colors cursor-pointer
              ${isToday 
                ? 'bg-white dark:bg-zinc-700 ring-1 ring-inset ring-gray-400 dark:ring-zinc-600'
                : 'bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700/70'}
            `}
            onClick={() => {
              setSelectedDay({ date: dayDate, day: day, events: dayEvents }); // Pass full date
              setShowDayDetail(true);
            }}
          >
            <div className="flex justify-between items-start">
              <span className={`
                inline-flex h-6 w-6 rounded-full items-center justify-center text-sm
                ${isToday 
                  ? 'bg-black dark:bg-white text-white dark:text-black' 
                  : 'text-gray-700 dark:text-zinc-300'}
              `}>
                {day}
              </span>
              {dayEvents.length > 0 && (
                <span className="text-xs bg-gray-500 dark:bg-zinc-600 text-white dark:text-zinc-200 rounded-full px-1.5 py-0.5">
                  {dayEvents.length}
                </span>
              )}
            </div>
            <div className="mt-1 space-y-1 overflow-y-auto">
              {dayEvents.slice(0, 2).map((event, idx) => (
                <div 
                  key={`event-${day}-${idx}`}
                  className={`
                    text-xs p-1 rounded truncate
                    bg-gray-200 dark:bg-zinc-700/60 text-gray-800 dark:text-zinc-200
                  `}
                >
                  {event.title}
                </div>
              ))}
              {dayEvents.length > 2 && (
                <div className="text-xs text-gray-500 dark:text-zinc-400 pl-1">
                  +{dayEvents.length - 2} more
                </div>
              )}
            </div>
          </div>
        );
      }
    } else { // Weekly View
      const weekStartDate = getWeekStartDate(currentDate);
      
      for (let i = 0; i < 7; i++) {
        const dayDate = new Date(weekStartDate);
        dayDate.setDate(dayDate.getDate() + i);
        const day = dayDate.getDate();
        const month = dayDate.getMonth();
        const year = dayDate.getFullYear();
        const isToday = isCurrentDay(dayDate);

        const dayEvents = processDayEvents(dayDate);

        // Reusing the day rendering logic - REMOVE fixed height for weekly view
        calendarDays.push(
          <div 
            key={`day-${day}-${month}`} 
            className={`
              p-3 rounded-lg relative transition-colors cursor-pointer flex flex-col
              ${isToday 
                ? 'bg-white dark:bg-zinc-700 ring-1 ring-inset ring-gray-400 dark:ring-zinc-600'
                : 'bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700/70'}
            `}
             onClick={() => {
              setSelectedDay({ date: dayDate, day: day, events: dayEvents }); // Pass full date
              setShowDayDetail(true);
            }}
          >
            <div className="flex justify-between items-start">
              <span className={`
                inline-flex h-6 w-6 rounded-full items-center justify-center text-sm
                ${isToday 
                  ? 'bg-black dark:bg-white text-white dark:text-black' 
                  : 'text-gray-700 dark:text-zinc-300'}
              `}>
                {day}
              </span>
              {dayEvents.length > 0 && (
                <span className="text-xs bg-gray-500 dark:bg-zinc-600 text-white dark:text-zinc-200 rounded-full px-1.5 py-0.5">
                  {dayEvents.length}
                </span>
              )}
            </div>
            {/* Event list - Remove flex-grow */}
            <div className="mt-1 space-y-1 overflow-y-auto"> 
              {dayEvents.slice(0, 2).map((event, idx) => (
                <div 
                  key={`event-${day}-${idx}`}
                  className={`
                    text-xs p-1 rounded truncate
                    bg-gray-200 dark:bg-zinc-700/60 text-gray-800 dark:text-zinc-200
                  `}
                >
                  {event.title}
                </div>
              ))}
              {dayEvents.length > 2 && (
                <div className="text-xs text-gray-500 dark:text-zinc-400 pl-1">
                  +{dayEvents.length - 2} more
                </div>
              )}
            </div>
          </div>
        );
      }
    }
    
    return calendarDays;
  };

  // Helper function to check if a day is the current day (compare full date)
  const isCurrentDay = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize today to start of day
    date.setHours(0, 0, 0, 0); // Normalize input date to start of day
    return date.getTime() === today.getTime();
  };

  return (
    <div className="relative z-10 flex flex-col flex-grow w-full">
      {/* Calendar Navigation */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevious}
            className="p-2 rounded-full text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <CaretLeft size={18} />
          </button>
          <h2 className="text-lg font-medium text-black dark:text-zinc-100 w-48 text-center">
            {viewMode === 'monthly' 
              ? `${months[currentMonth]} ${currentYear}`
              : `${months[getWeekStartDate(currentDate).getMonth()]} ${getWeekStartDate(currentDate).getDate()} - ${getWeekStartDate(currentDate).getMonth() !== getWeekEndDate(currentDate).getMonth() ? months[getWeekEndDate(currentDate).getMonth()] + ' ' : ''}${getWeekEndDate(currentDate).getDate()}, ${getWeekEndDate(currentDate).getFullYear()}`
            }
          </h2>
          <button
            onClick={goToNext}
            className="p-2 rounded-full text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <CaretRight size={18} />
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={goToToday}
            className="px-3 py-1.5 text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            Today
          </button>
          {/* View Mode Toggle */}
          <div className="inline-flex rounded-md shadow-sm bg-gray-100 dark:bg-zinc-800 p-0.5">
            <button
              onClick={() => setViewMode('weekly')}
              className={`px-3 py-1 text-xs font-medium rounded ${viewMode === 'weekly' ? 'bg-white text-black dark:bg-black dark:text-white' : 'text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-700/50'} transition-colors`}
            >
              Weekly
            </button>
            <button
              onClick={() => setViewMode('monthly')}
              className={`px-3 py-1 text-xs font-medium rounded ${viewMode === 'monthly' ? 'bg-white text-black dark:bg-black dark:text-white' : 'text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-700/50'} transition-colors`}
            >
              Monthly
            </button>
          </div>
        </div>
      </div>

      {/* Calendar Day Headers */} 
      <div className="grid grid-cols-7 gap-1.5 mb-1.5 flex-shrink-0"> 
        {days.map(day => (
          <div 
            key={day} 
            className="py-2 text-center text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wider"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid - Only contains day boxes now */}
      <div className="grid grid-cols-7 gap-1.5 min-h-96 flex-grow"> 
        {/* Calendar Body (Generated Days) */}
        {generateCalendarDays()}
      </div>

      {/* Day Detail Modal */}
      {showDayDetail && selectedDay && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-md w-full max-h-[80vh] overflow-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-medium text-black dark:text-zinc-100">
                  {months[selectedDay.date.getMonth()]} {selectedDay.day}, {selectedDay.date.getFullYear()}
                </h3>
                <button 
                  onClick={() => setShowDayDetail(false)}
                  className="text-gray-500 dark:text-zinc-400 hover:text-black dark:hover:text-white"
                >
                  ✕
                </button>
              </div>
              
              {selectedDay.events.length === 0 ? (
                <p className="text-gray-500 dark:text-zinc-400 text-center py-4">
                  No tiktoks scheduled for this day
                </p>
              ) : (
                <div className="space-y-3">
                  {selectedDay.events.map((event) => (
                    <div 
                      key={event.id}
                      className="p-3 rounded-lg border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900/80"
                    >
                      <div className="flex justify-between">
                        <h4 className="font-medium text-black dark:text-zinc-100">{event.title}</h4>
                        {/* Grayscale badge for event type in modal */}
                        <span className={`
                          text-xs px-2 py-0.5 rounded-full
                          bg-gray-100 dark:bg-zinc-700/50 text-gray-800 dark:text-zinc-200
                        `}>
                          {event.type}
                        </span>
                      </div>
                      {event.description && (
                        <p className="mt-2 text-sm text-gray-600 dark:text-zinc-400">
                          {event.description}
                        </p>
                      )}
                      {event.time && (
                        <div className="mt-2 text-xs text-gray-500 dark:text-zinc-500">
                          {event.time}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Calendar; 
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "@firebase/firestore"; // Import Firestore
import { getAuth } from "firebase/auth"; // Import Auth
// Import Storage
import { getStorage } from "firebase/storage";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDYRjp3nzIlgnOnAZ7EqiZzKtU7ooArAO0",
  authDomain: "ugcai-f429e.firebaseapp.com",
  projectId: "ugcai-f429e",
  storageBucket: "ugcai-f429e.firebasestorage.app", // Corrected domain
  messagingSenderId: "255783145788",
  appId: "1:255783145788:web:cdd22f37fc9aa43a424e39",
  measurementId: "G-2XZEYCWBGG"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// const analytics = getAnalytics(app); // Analytics can be initialized if needed

// Initialize Firebase services
const auth = getAuth(app);
const db = getFirestore(app); // Initialize Firestore
// Initialize Storage
const storage = getStorage(app);

// Export Firebase app instance and other services if needed
export default app; // Exporting app might not be necessary if services are exported
// Export auth, db, and storage instances
export { auth, db, storage };
// export { analytics }; // Uncomment if you need analytics elsewhere 
// Firebase konfiguratsiyasi - Nasiya Daftari
const firebaseConfig = {
  apiKey: "AIzaSyDzTuIaYtPjLXHL6Wn0cGRuYMFGNLNrWd0",
  authDomain: "nasiya-daftari-49062.firebaseapp.com",
  projectId: "nasiya-daftari-49062",
  storageBucket: "nasiya-daftari-49062.firebasestorage.app",
  messagingSenderId: "411174479732",
  appId: "1:411174479732:web:cb360e9d5ca422f899ae21"
};

// Firebase'ni ishga tushirish
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

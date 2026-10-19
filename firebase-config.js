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
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = typeof firebase !== 'undefined' && firebase.firestore ? firebase.firestore() : null;
const auth = typeof firebase !== 'undefined' && firebase.auth ? firebase.auth() : null;


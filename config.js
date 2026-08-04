// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBa9NWi5FfpmAx0ExJh1fJ3b1ipUEEBRxU",
  authDomain: "dark-fortport.firebaseapp.com",
  projectId: "dark-fortport",
  storageBucket: "dark-fortport.firebasestorage.app",
  messagingSenderId: "3814531503",
  appId: "1:3814531503:web:a8200e1f337935a3530f5a",
  measurementId: "G-KF9GGGL43L"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

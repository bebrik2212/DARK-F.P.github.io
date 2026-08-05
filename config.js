// config.js - Firebase конфигурация
const firebaseConfig = {
    apiKey: "AIzaSyBa9NWi5FpmAx6ExJh1fJ3b1ipUEEBRxU",
    authDomain: "dark-fortport.firebaseapp.com",
    projectId: "dark-fortport",
    storageBucket: "dark-fortport.firebasestorage.app",
    messagingSenderId: "3814531503",
    appId: "1:3814531503:web:a8200e1f337935a3530f5a"
};

// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Включаем оффлайн режим
db.enablePersistence()
    .then(() => console.log('🔥 Offline mode enabled'))
    .catch((err) => console.warn('Offline mode error:', err));

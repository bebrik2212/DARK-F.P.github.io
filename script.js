// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDZjG_HhLrFGhRQyJqLQRgVRhMoMCrEGfY",
    authDomain: "dark-fort.firebaseapp.com",
    projectId: "dark-fort",
    storageBucket: "dark-fort.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abc123def456ghi789"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Enable offline persistence
db.enablePersistence()
    .catch((err) => {
        if (err.code == 'failed-precondition') {
            console.warn('Оффлайн-режим: несколько вкладок открыто');
        } else if (err.code == 'unimplemented') {
            console.warn('Браузер не поддерживает оффлайн-режим');
        }
    });

// ============ GLOBAL STATE ============
let currentUser = {
    uid: generateUID(),
    nickname: '',
    avatar: 'https://i.pinimg.com/236x/ca/32/a0/ca32a08ba5cdefbffa115c6cced9f519.jpg'
};

let notifications = [];
let currentTab = 'feed';
let editingPostId = null;

// ============ DOM ELEMENTS ============
const profileAvatar = document.getElementById('profileAvatar');
const avatarUpload = document.getElementById('avatarUpload');
const nicknameInput = document.getElementById('nicknameInput');
const nickErrorMsg = document.getElementById('nickErrorMsg');
const bellBtn = document.getElementById('bellBtn');
const notifCount = document.getElementById('notifCount');
const notificationPanel = document.getElementById('notificationPanel');
const postsListFeed = document.getElementById('postsListFeed');
const postsListProfile = document.getElementById('postsListProfile');
const postText = document.getElementById('postText');
const mediaPreview = document.getElementById('mediaPreview');
const attachBtn = document.getElementById('attachBtn');
const mediaUpload = document.getElementById('mediaUpload');
const uploadStatus = document.getElementById('uploadStatus');
const publishBtn = document.getElementById('publishBtn');
const profileBigAvatar = document.getElementById('profileBigAvatar');
const profileNickname = document.getElementById('profileNickname');

let mediaFiles = [];

// ============ UTILITY FUNCTIONS ============
function generateUID() {
    return 'user_' + Math.random().toString(36).substr(2, 9);
}

function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.className = 'toast' + (isError ? ' error' : '');
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function formatDate(timestamp) {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Только что';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' мин. назад';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' ч. назад';
    
    return date.toLocaleDateString('ru-RU', { 
        day: 'numeric', 
        month: 'short', 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

function compressImage(file, maxWidth = 800) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                if (width > maxWidth) {
                    height = (maxWidth / width) * height;
                    width = maxWidth;
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob((blob) => {
                    resolve(new File([blob], file.name, { type: 'image/jpeg' }));
                }, 'image/jpeg', 0.7);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// ============ LOCAL STORAGE ============
function saveUserToLocal() {
    localStorage.setItem('darkfort_user', JSON.stringify(currentUser));
}

function loadUserFromLocal() {
    const saved = localStorage.getItem('darkfort_user');
    if (saved) {
        currentUser = JSON.parse(saved);
        nicknameInput.value = currentUser.nickname;
        profileAvatar.src = currentUser.avatar;
        profileBigAvatar.src = currentUser.avatar;
        profileNickname.textContent = currentUser.nickname || 'ТВОЙ НИК';
    }
}

function saveNotificationsToLocal() {
    localStorage.setItem('darkfort_notifications', JSON.stringify(notifications));
}

function loadNotificationsFromLocal() {
    const saved = localStorage.getItem('darkfort_notifications');
    if (saved) {
        notifications = JSON.parse(saved);
        updateNotificationUI();
    }
}

// ============ NOTIFICATIONS ============
function addNotification(type, data) {
    const notification = {
        id: Date.now().toString(),
        type: type,
        data: data,
        timestamp: new Date().toISOString(),
        read: false
    };
    
    notifications.unshift(notification);
    if (notifications.length > 50) notifications.pop();
    
    saveNotificationsToLocal();
    updateNotificationUI();
}

function updateNotificationUI() {
    const unreadCount = notifications.filter(n => !n.read).length;
    notifCount.textContent = unreadCount;
    
    if (unreadCount > 0) {
        notifCount.classList.add('visible');
    } else {
        notifCount.classList.remove('visible');
    }
    
    renderNotifications();
}

function renderNotifications() {
    if (notifications.length === 0) {
        notificationPanel.innerHTML = '<div class="notif-item">Нет уведомлений</div>';
        return;
    }
    
    notificationPanel.innerHTML = notifications.slice(0, 20).map(n => {
        const time = new Date(n.timestamp);
        const timeStr = formatDate(time);
        
        let message = '';
        switch(n.type) {
            case 'like':
                message = `❤️ ${n.data.nickname} лайкнул ваш пост`;
                break;
            case 'dislike':
                message = `👎 ${n.data.nickname} дизлайкнул ваш пост`;
                break;
            case 'comment':
                message = `💬 ${n.data.nickname} прокомментировал ваш пост`;
                break;
            default:
                message = 'Новое уведомление';
        }
        
        return `<div class="notif-item">
            ${message}
            <span class="notif-time">${timeStr}</span>
        </div>`;
    }).join('');
}

// ============ USER ACTIONS ============
nicknameInput.addEventListener('input', () => {
    const nickname = nicknameInput.value.trim();
    if (nickname.length > 0) {
        checkNicknameAvailability(nickname);
    } else {
        nickErrorMsg.classList.remove('visible');
    }
});

async function checkNicknameAvailability(nickname) {
    try {
        const snapshot = await db.collection('users')
            .where('nickname', '==', nickname)
            .get();
        
        if (!snapshot.empty && snapshot.docs[0].id !== currentUser.uid) {
            nickErrorMsg.classList.add('visible');
            publishBtn.disabled = true;
        } else {
            nickErrorMsg.classList.remove('visible');
            if (nickname.length >= 2) {
                publishBtn.disabled = false;
            }
        }
    } catch (error) {
        console.error('Ошибка проверки ника:', error);
    }
}

async function saveNickname() {
    const nickname = nicknameInput.value.trim();
    if (!nickname || nickname.length < 2) return;
    
    try {
        // Check if nickname is taken
        const snapshot = await db.collection('users')
            .where('nickname', '==', nickname)
            .get();
        
        if (!snapshot.empty && snapshot.docs[0].id !== currentUser.uid) {
            nickErrorMsg.classList.add('visible');
            showToast('Этот ник уже занят', true);
            return;
        }
        
        // Save to Firestore
        await db.collection('users').doc(currentUser.uid).set({
            nickname: nickname,
            avatar: currentUser.avatar,
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        currentUser.nickname = nickname;
        saveUserToLocal();
        profileNickname.textContent = nickname;
        nickErrorMsg.classList.remove('visible');
        showToast('Ник сохранён!');
        
        // Update all posts by this user
        updateUserPostsNickname(nickname);
    } catch (error) {
        console.error('Ошибка сохранения ника:', error);
        showToast('Ошибка сохранения', true);
    }
}

async function updateUserPostsNickname(newNickname) {
    try {
        const snapshot = await db.collection('posts')
            .where('authorId', '==', currentUser.uid)
            .get();
        
        const batch = db.batch();
        snapshot.docs.forEach(doc => {
            batch.update(doc.ref, { 
                authorNick: newNickname,
                authorAvatar: currentUser.avatar
            });
        });
        
        await batch.commit();
    } catch (error) {
        console.error('Ошибка обновления постов:', error);
    }
}

profileAvatar.addEventListener('click', () => {
    avatarUpload.click();
});

avatarUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
        // Compress image
        const compressed = await compressImage(file, 200);
        const reader = new FileReader();
        
        reader.onload = async (event) => {
            const avatarUrl = event.target.result;
            
            // Update UI
            profileAvatar.src = avatarUrl;
            profileBigAvatar.src = avatarUrl;
            currentUser.avatar = avatarUrl;
            saveUserToLocal();
            
            // Save to Firestore
            if (currentUser.nickname) {
                await db.collection('users').doc(currentUser.uid).update({
                    avatar: avatarUrl
                });
            }
            
            // Update all posts
            updateUserPostsAvatar(avatarUrl);
            showToast('Аватар обновлён!');
        };
        
        reader.readAsDataURL(compressed);
    } catch (error) {
        console.error('Ошибка загрузки аватара:', error);
        showToast('Ошибка загрузки', true);
    }
});

async function updateUserPostsAvatar(newAvatar) {
    try {
        const snapshot = await db.collection('posts')
            .where('authorId', '==', currentUser.uid)
            .get();
        
        const batch = db.batch();
        snapshot.docs.forEach(doc => {
            batch.update(doc.ref, { authorAvatar: newAvatar });
        });
        
        await batch.commit();
    } catch (error) {
        console.error('Ошибка обновления аватаров в постах:', error);
    }
}

// ============ MEDIA HANDLING ============
attachBtn.addEventListener('click', () => {
    mediaUpload.click();
});

mediaUpload.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    
    files.forEach(file => {
        if (mediaFiles.length >= 4) {
            showToast('Максимум 4 файла', true);
            return;
        }
        
        if (file.size > 10 * 1024 * 1024) {
            showToast('Файл слишком большой (макс. 10MB)', true);
            return;
        }
        
        mediaFiles.push(file);
        renderMediaPreview();
    });
    
    mediaUpload.value = '';
});

function renderMediaPreview() {
    mediaPreview.innerHTML = mediaFiles.map((file, index) => {
        const url = URL.createObjectURL(file);
        const isVideo = file.type.startsWith('video/');
        const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        
        return `<div class="preview-item">
            ${isVideo ? 
                `<video src="${url}" muted></video>` : 
                `<img src="${url}" alt="preview">`
            }
            <div class="preview-size">${sizeMB}MB</div>
            <button class="remove-media" onclick="removeMedia(${index})">×</button>
        </div>`;
    }).join('');
}

function removeMedia(index) {
    mediaFiles.splice(index, 1);
    renderMediaPreview();
}

// ============ POSTS ============
publishBtn.addEventListener('click', publishPost);

async function publishPost() {
    const text = postText.value.trim();
    const nickname = nicknameInput.value.trim();
    
    if (!nickname || nickname.length < 2) {
        showToast('Введите никнейм', true);
        return;
    }
    
    if (nickErrorMsg.classList.contains('visible')) {
        showToast('Этот ник занят', true);
        return;
    }
    
    if (!text && mediaFiles.length === 0) {
        showToast('Напишите текст или прикрепите файл', true);
        return;
    }
    
    publishBtn.disabled = true;
    uploadStatus.textContent = 'Публикация...';
    
    try {
        // Save nickname first
        await saveNickname();
        
        // Process media files
        const mediaUrls = await Promise.all(
            mediaFiles.map(async (file) => {
                return await fileToBase64(file);
            })
        );
        
        const post = {
            authorId: currentUser.uid,
            authorNick: currentUser.nickname,
            authorAvatar: currentUser.avatar,
            text: text,
            media: mediaUrls,
            mediaTypes: mediaFiles.map(f => f.type),
            likes: [],
            dislikes: [],
            comments: [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        if (editingPostId) {
            // Update existing post
            await db.collection('posts').doc(editingPostId).update({
                text: text,
                media: mediaUrls,
                mediaTypes: mediaFiles.map(f => f.type),
                editedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            editingPostId = null;
            publishBtn.textContent = 'ОПУБЛИКОВАТЬ';
            showToast('Пост обновлён!');
        } else {
            // Create new post
            await db.collection('posts').add(post);
            showToast('Пост опубликован!');
        }
        
        // Clear form
        postText.value = '';
        mediaFiles = [];
        mediaPreview.innerHTML = '';
        uploadStatus.textContent = '';
        
    } catch (error) {
        console.error('Ошибка публикации:', error);
        showToast('Ошибка публикации', true);
    } finally {
        publishBtn.disabled = false;
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ============ LOAD POSTS ============
function loadPosts(container, filterByUser = false) {
    let query = db.collection('posts').orderBy('createdAt', 'desc');
    
    if (filterByUser) {
        query = query.where('authorId', '==', currentUser.uid);
    }
    
    query.onSnapshot((snapshot) => {
        const posts = [];
        snapshot.forEach((doc) => {
            posts.push({ id: doc.id, ...doc.data() });
        });
        
        renderPosts(container, posts, filterByUser);
    }, (error) => {
        console.error('Ошибка загрузки постов:', error);
        container.innerHTML = '<div class="empty-posts">ОШИБКА ЗАГРУЗКИ</div>';
    });
}

function renderPosts(container, posts, isProfile = false) {
    if (posts.length === 0) {
        container.innerHTML = '<div class="empty-posts">НЕТ ПОСТОВ</div>';
        return;
    }
    
    container.innerHTML = posts.map(post => {
        const isOwner = post.authorId === currentUser.uid;
        const hasLiked = post.likes && post.likes.includes(currentUser.uid);
        const hasDisliked = post.dislikes && post.dislikes.includes(currentUser.uid);
        const likeCount = post.likes ? post.likes.length : 0;
        const dislikeCount = post.dislikes ? post.dislikes.length : 0;
        const commentCount = post.comments ? post.comments.length : 0;
        
        return `
            <div class="post-card" id="post-${post.id}">
                <div class="post-header">
                    <img class="post-avatar" src="${post.authorAvatar || 'https://i.pinimg.com/236x/ca/32/a0/ca32a08ba5cdefbffa115c6cced9f519.jpg'}" alt="avatar">
                    <span class="post-nick">${post.authorNick || 'Аноним'}</span>
                    <span class="post-time">${post.createdAt ? formatDate(post.createdAt) : ''}</span>
                    ${isOwner ? `<button class="delete-post-btn" onclick="deletePost('${post.id}')">×</button>` : ''}
                </div>
                ${post.text ? `<div class="post-text">${escapeHtml(post.text)}</div>` : ''}
                ${post.media && post.media.length > 0 ? renderPostMedia(post) : ''}
                <div class="post-footer">
                    <button class="vote-btn ${hasLiked ? 'liked' : ''}" onclick="likePost('${post.id}')">
                        ❤️ ${likeCount}
                    </button>
                    <button class="vote-btn ${hasDisliked ? 'disliked' : ''}" onclick="dislikePost('${post.id}')">
                        👎 ${dislikeCount}
                    </button>
                    <button class="comment-btn" onclick="toggleComments('${post.id}')">
                        💬 ${commentCount}
                    </button>
                    ${isOwner ? `<button class="comment-btn" onclick="editPost('${post.id}')">✏️</button>` : ''}
                </div>
                <div class="comments-section" id="comments-${post.id}">
                    ${renderComments(post)}
                </div>
            </div>
        `;
    }).join('');
}

function renderPostMedia(post) {
    return `
        <div class="post-media">
            ${post.media.map((url, index) => {
                const type = post.mediaTypes ? post.mediaTypes[index] : 'image/jpeg';
                if (type && type.startsWith('video/')) {
                    return `<video src="${url}" controls></video>`;
                } else {
                    return `<img src="${url}" alt="media" loading="lazy">`;
                }
            }).join('')}
        </div>
    `;
}

function renderComments(post) {
    if (!post.comments || post.comments.length === 0) {
        return '<div style="padding:10px;color:var(--muted);">Нет комментариев</div>';
    }
    
    return post.comments.map(comment => `
        <div class="comment">
            <img class="comment-avatar" src="${comment.avatar || 'https://i.pinimg.com/236x/ca/32/a0/ca32a08ba5cdefbffa115c6cced9f519.jpg'}" alt="avatar">
            <div class="comment-content">
                <div class="comment-nick">${comment.nickname || 'Аноним'}</div>
                <div class="comment-text">${escapeHtml(comment.text)}</div>
            </div>
        </div>
    `).join('') + `
        <div class="comment-input-row">
            <input type="text" class="comment-input" id="comment-input-${post.id}" placeholder="Комментарий..." maxlength="500">
            <button class="btn add-comment-btn" onclick="addComment('${post.id}')">ОТПРАВИТЬ</button>
        </div>
    `;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============ POST ACTIONS ============
async function likePost(postId) {
    if (!currentUser.nickname) {
        showToast('Сначала введите ник', true);
        return;
    }
    
    try {
        const postRef = db.collection('posts').doc(postId);
        const post = await postRef.get();
        const data = post.data();
        
        let likes = data.likes || [];
        let dislikes = data.dislikes || [];
        
        if (likes.includes(currentUser.uid)) {
            // Unlike
            likes = likes.filter(id => id !== currentUser.uid);
        } else {
            // Like
            likes.push(currentUser.uid);
            dislikes = dislikes.filter(id => id !== currentUser.uid);
            
            // Notify post owner
            if (data.authorId !== currentUser.uid) {
                addNotification('like', {
                    postId: postId,
                    nickname: currentUser.nickname
                });
            }
        }
        
        await postRef.update({ likes, dislikes });
    } catch (error) {
        console.error('Ошибка лайка:', error);
    }
}

async function dislikePost(postId) {
    if (!currentUser.nickname) {
        showToast('Сначала введите ник', true);
        return;
    }
    
    try {
        const postRef = db.collection('posts').doc(postId);
        const post = await postRef.get();
        const data = post.data();
        
        let likes = data.likes || [];
        let dislikes = data.dislikes || [];
        
        if (dislikes.includes(currentUser.uid)) {
            // Remove dislike
            dislikes = dislikes.filter(id => id !== currentUser.uid);
        } else {
            // Dislike
            dislikes.push(currentUser.uid);
            likes = likes.filter(id => id !== currentUser.uid);
            
            // Notify post owner
            if (data.authorId !== currentUser.uid) {
                addNotification('dislike', {
                    postId: postId,
                    nickname: currentUser.nickname
                });
            }
        }
        
        await postRef.update({ likes, dislikes });
    } catch (error) {
        console.error('Ошибка дизлайка:', error);
    }
}

async function addComment(postId) {
    if (!currentUser.nickname) {
        showToast('Сначала введите ник', true);
        return;
    }
    
    const input = document.getElementById(`comment-input-${postId}`);
    if (!input) return;
    
    const text = input.value.trim();
    if (!text) return;
    
    try {
        const postRef = db.collection('posts').doc(postId);
        const post = await postRef.get();
        const data = post.data();
        
        const comments = data.comments || [];
        comments.push({
            nickname: currentUser.nickname,
            avatar: currentUser.avatar,
            text: text,
            timestamp: new Date().toISOString()
        });
        
        await postRef.update({ comments });
        input.value = '';
        
        // Notify post owner
        if (data.authorId !== currentUser.uid) {
            addNotification('comment', {
                postId: postId,
                nickname: currentUser.nickname
            });
        }
    } catch (error) {
        console.error('Ошибка комментария:', error);
    }
}

async function deletePost(postId) {
    if (!confirm('Удалить пост?')) return;
    
    try {
        await db.collection('posts').doc(postId).delete();
        showToast('Пост удалён');
    } catch (error) {
        console.error('Ошибка удаления:', error);
        showToast('Ошибка удаления', true);
    }
}

async function editPost(postId) {
    try {
        const post = await db.collection('posts').doc(postId).get();
        const data = post.data();
        
        // Switch to create tab
        switchTab('create');
        
        // Fill form
        postText.value = data.text || '';
        editingPostId = postId;
        publishBtn.textContent = 'СОХРАНИТЬ';
        
        // Clear media preview (editing media not supported in this simple version)
        mediaFiles = [];
        mediaPreview.innerHTML = '';
        
        showToast('Редактирование поста');
    } catch (error) {
        console.error('Ошибка редактирования:', error);
    }
}

function toggleComments(postId) {
    const commentsSection = document.getElementById(`comments-${postId}`);
    if (commentsSection) {
        if (commentsSection.style.display === 'block') {
            commentsSection.style.display = 'none';
        } else {
            commentsSection.style.display = 'block';
        }
    }
}

// ============ TABS ============
const tabFeed = document.getElementById('tabFeed');
const tabCreate = document.getElementById('tabCreate');
const tabProfile = document.getElementById('tabProfile');
const feedSection = document.getElementById('feedSection');
const createSection = document.getElementById('createSection');
const profileSection = document.getElementById('profileSection');

tabFeed.addEventListener('click', () => switchTab('feed'));
tabCreate.addEventListener('click', () => switchTab('create'));
tabProfile.addEventListener('click', () => switchTab('profile'));

function switchTab(tab) {
    currentTab = tab;
    
    // Update buttons
    [tabFeed, tabCreate, tabProfile].forEach(btn => btn.classList.remove('active'));
    [feedSection, createSection, profileSection].forEach(section => section.classList.remove('active'));
    
    switch(tab) {
        case 'feed':
            tabFeed.classList.add('active');
            feedSection.classList.add('active');
            break;
        case 'create':
            tabCreate.classList.add('active');
            createSection.classList.add('active');
            break;
        case 'profile':
            tabProfile.classList.add('active');
            profileSection.classList.add('active');
            break;
    }
}

// ============ NOTIFICATION PANEL ============
bellBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (notificationPanel.style.display === 'block') {
        notificationPanel.style.display = 'none';
    } else {
        notificationPanel.style.display = 'block';
        // Mark all as read
        notifications.forEach(n => n.read = true);
        saveNotificationsToLocal();
        updateNotificationUI();
    }
});

document.addEventListener('click', () => {
    notificationPanel.style.display = 'none';
});

// ============ INITIALIZATION ============
async function init() {
    loadUserFromLocal();
    
    // Load posts
    loadPosts(postsListFeed, false);
    loadPosts(postsListProfile, true);
    
    // Load notifications
    loadNotificationsFromLocal();
    
    // Auto-save nickname on blur
    nicknameInput.addEventListener('blur', () => {
        const nickname = nicknameInput.value.trim();
        if (nickname && nickname !== currentUser.nickname) {
            saveNickname();
        }
    });
    
    // Keyboard shortcut for publish
    postText.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            publishPost();
        }
    });
    
    console.log('DARK FORT initialized');
    console.log('Your UID:', currentUser.uid);
}

// Start the app
init();

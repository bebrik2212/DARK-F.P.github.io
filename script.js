// ============================================================
// DARK FORT - FIREBASE (ИСПРАВЛЕННЫЙ)
// ============================================================

// ============================================================
// 🔥 КОНФИГ FIREBASE
// ============================================================

const firebaseConfig = {
    apiKey: "AIzaSyBa9NWi5FfpmAx0ExJh1fJ3b1ipUEEBRxU",
    authDomain: "dark-fortport.firebaseapp.com",
    projectId: "DARK FORTPORT",
    storageBucket: "DARK FORTPORT.firebasestorage.app",
    messagingSenderId: "3814531503",
    appId: "1:3814531503:web:a8200e1f337935a3530f5a",
    measurementId: "G-KF9GGGL43L"
};

// ============================================================
// ИНИЦИАЛИЗАЦИЯ FIREBASE С ОБРАБОТКОЙ ОШИБОК
// ============================================================

let db = null;
let firebaseReady = false;

try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    
    // Включаем оффлайн-режим
    db.enablePersistence()
        .then(() => {
            console.log('🔥 Offline persistence enabled');
        })
        .catch((err) => {
            console.warn('Offline persistence error:', err);
        });
    
    firebaseReady = true;
    console.log('🔥 Firebase initialized');
} catch (error) {
    console.error('Ошибка инициализации Firebase:', error);
    firebaseReady = false;
}

// ============================================================
// КОНСТАНТЫ
// ============================================================

const DEFAULT_AVATAR = 'https://i.pinimg.com/236x/ca/32/a0/ca32a08ba5cdefbffa115c6cced9f519.jpg';
const MAX_FILE_SIZE = 67 * 1024 * 1024;
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

// --- ID ПОЛЬЗОВАТЕЛЯ ---
let profileId = localStorage.getItem('df_profile_id');
if (!profileId) {
    profileId = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    localStorage.setItem('df_profile_id', profileId);
}

// --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
let currentProfile = null;
let allPosts = [];
let pendingMedia = [];
let saveTimer = 0;
let notifOpen = false;
const openComments = new Set();
let unsubscribePosts = null;
let isInitialized = false;

// --- DOM ЭЛЕМЕНТЫ ---
const nicknameInput = document.getElementById('nicknameInput');
const profileAvatarEl = document.getElementById('profileAvatar');
const profileBigAvatarEl = document.getElementById('profileBigAvatar');
const profileNicknameEl = document.getElementById('profileNickname');
const avatarUploadEl = document.getElementById('avatarUpload');
const bellBtnEl = document.getElementById('bellBtn');
const notifCountEl = document.getElementById('notifCount');
const notificationPanelEl = document.getElementById('notificationPanel');
const nickErrorMsg = document.getElementById('nickErrorMsg');
const postTextEl = document.getElementById('postText');
const mediaUploadEl = document.getElementById('mediaUpload');
const mediaPreviewEl = document.getElementById('mediaPreview');
const publishBtnEl = document.getElementById('publishBtn');
const uploadStatusEl = document.getElementById('uploadStatus');
const postsListFeedEl = document.getElementById('postsListFeed');
const postsListProfileEl = document.getElementById('postsListProfile');

// ============================================================
// КЭШИРОВАНИЕ (если Firebase не работает)
// ============================================================

function getCachedData() {
    try {
        const raw = localStorage.getItem('df_cache_data');
        if (raw) {
            const data = JSON.parse(raw);
            // Проверяем, что данные не старые (меньше 1 часа)
            if (data._timestamp && (Date.now() - data._timestamp) < 3600000) {
                return data;
            }
        }
    } catch (e) {}
    return null;
}

function setCachedData(data) {
    try {
        data._timestamp = Date.now();
        localStorage.setItem('df_cache_data', JSON.stringify(data));
    } catch (e) {}
}

function getCachedProfile() {
    try {
        const raw = localStorage.getItem('df_cache_profile');
        if (raw) {
            return JSON.parse(raw);
        }
    } catch (e) {}
    return null;
}

function setCachedProfile(profile) {
    try {
        localStorage.setItem('df_cache_profile', JSON.stringify(profile));
    } catch (e) {}
}

// ============================================================
// РАБОТА С ПРОФИЛЕМ
// ============================================================

async function getOrCreateProfile() {
    // Если Firebase не готов, используем кэш
    if (!firebaseReady || !db) {
        const cached = getCachedProfile();
        if (cached) {
            currentProfile = cached;
            updateUI();
            showToast('ОФФЛАЙН РЕЖИМ (КЭШ)', true);
            return currentProfile;
        }
        // Создаём локальный профиль
        currentProfile = {
            id: profileId,
            nickname: '',
            avatarData: DEFAULT_AVATAR,
            createdAt: new Date().toISOString()
        };
        setCachedProfile(currentProfile);
        updateUI();
        return currentProfile;
    }

    try {
        const doc = await db.collection('profiles').doc(profileId).get();
        if (doc.exists) {
            currentProfile = { id: profileId, ...doc.data() };
            setCachedProfile(currentProfile);
            return currentProfile;
        }
    } catch (error) {
        console.warn('Ошибка получения профиля, используем кэш:', error);
        const cached = getCachedProfile();
        if (cached) {
            currentProfile = cached;
            updateUI();
            return currentProfile;
        }
    }

    // Создаём новый профиль
    const newProfile = {
        nickname: '',
        avatarData: DEFAULT_AVATAR,
        createdAt: new Date().toISOString()
    };

    try {
        if (firebaseReady && db) {
            await db.collection('profiles').doc(profileId).set(newProfile);
        }
        currentProfile = { id: profileId, ...newProfile };
        setCachedProfile(currentProfile);
        return currentProfile;
    } catch (error) {
        console.warn('Ошибка создания профиля:', error);
        currentProfile = { id: profileId, ...newProfile };
        setCachedProfile(currentProfile);
        return currentProfile;
    }
}

async function saveProfile(nickname, avatarData) {
    if (!currentProfile) await getOrCreateProfile();
    if (!currentProfile) return false;

    // Проверка занятости ника (только если Firebase доступен)
    if (nickname && nickname !== currentProfile.nickname && firebaseReady && db) {
        try {
            const snapshot = await db.collection('profiles')
                .where('nickname', '==', nickname)
                .get();
            
            if (!snapshot.empty) {
                nicknameInput.classList.add('error');
                nickErrorMsg.classList.add('visible');
                return false;
            }
        } catch (error) {
            console.warn('Ошибка проверки ника:', error);
        }
    }

    const updateData = {
        nickname: nickname !== undefined ? nickname : currentProfile.nickname,
        avatarData: avatarData !== undefined ? avatarData : currentProfile.avatarData,
        updatedAt: new Date().toISOString()
    };

    // Обновляем локально
    Object.assign(currentProfile, updateData);
    setCachedProfile(currentProfile);
    nicknameInput.classList.remove('error');
    nickErrorMsg.classList.remove('visible');
    updateUI();

    // Пытаемся обновить в Firebase
    if (firebaseReady && db) {
        try {
            await db.collection('profiles').doc(profileId).update(updateData);
        } catch (error) {
            console.warn('Ошибка обновления профиля в Firebase:', error);
            showToast('ПРОФИЛЬ СОХРАНЁН ЛОКАЛЬНО', true);
        }
    }

    return true;
}

// ============================================================
// РАБОТА С ПОСТАМИ
// ============================================================

function subscribeToPosts() {
    // Показываем кэш сразу
    const cached = getCachedData();
    if (cached && cached.posts) {
        allPosts = cached.posts.map(p => ({
            ...p,
            authorName: p.authorName || 'АНОНИМ',
            authorAvatar: p.authorAvatar || DEFAULT_AVATAR
        }));
        renderAllPosts();
    }

    // Если Firebase не готов, выходим
    if (!firebaseReady || !db) {
        postsListFeedEl.innerHTML = `
            <div class="empty-posts" style="padding:60px 20px;text-align:center;color:#8d9098;line-height:2;">
                <div style="font-size:48px;margin-bottom:12px;">📡</div>
                <div>ОФФЛАЙН РЕЖИМ</div>
                <div style="font-size:0.85rem;color:#5a5d66;">ДАННЫЕ ИЗ КЭША</div>
            </div>
        `;
        return;
    }

    if (unsubscribePosts) {
        unsubscribePosts();
        unsubscribePosts = null;
    }

    unsubscribePosts = db.collection('posts')
        .orderBy('createdAt', 'desc')
        .limit(100)
        .onSnapshot(async (snapshot) => {
            const posts = [];
            const profilesCache = {};

            for (const doc of snapshot.docs) {
                const data = doc.data();
                const postId = doc.id;

                let authorName = 'АНОНИМ';
                let authorAvatar = DEFAULT_AVATAR;

                if (data.authorId) {
                    if (profilesCache[data.authorId]) {
                        authorName = profilesCache[data.authorId].nickname || 'АНОНИМ';
                        authorAvatar = profilesCache[data.authorId].avatarData || DEFAULT_AVATAR;
                    } else {
                        try {
                            const authorDoc = await db.collection('profiles').doc(data.authorId).get();
                            if (authorDoc.exists) {
                                const authorData = authorDoc.data();
                                profilesCache[data.authorId] = authorData;
                                authorName = authorData.nickname || 'АНОНИМ';
                                authorAvatar = authorData.avatarData || DEFAULT_AVATAR;
                            }
                        } catch (e) {}
                    }
                }

                posts.push({
                    id: postId,
                    ...data,
                    authorName: authorName,
                    authorAvatar: authorAvatar
                });
            }

            allPosts = posts;
            
            // Сохраняем в кэш
            setCachedData({ posts: posts, profiles: profilesCache });
            
            renderAllPosts();
            updateNotifCount();
        }, (error) => {
            console.warn('Ошибка подписки на посты:', error);
            // Показываем кэш
            const cached = getCachedData();
            if (cached && cached.posts) {
                allPosts = cached.posts;
                renderAllPosts();
                showToast('ОФФЛАЙН РЕЖИМ', true);
            } else {
                postsListFeedEl.innerHTML = `
                    <div class="empty-posts" style="padding:60px 20px;text-align:center;color:#8d9098;line-height:2;">
                        <div style="font-size:48px;margin-bottom:12px;">⚠️</div>
                        <div>НЕТ ПОДКЛЮЧЕНИЯ</div>
                        <div style="font-size:0.85rem;color:#5a5d66;">ПРОВЕРЬТЕ ИНТЕРНЕТ</div>
                    </div>
                `;
            }
        });
}

async function createPost(text, media) {
    if (!currentProfile?.nickname) {
        showToast('СНАЧАЛА УСТАНОВИТЕ НИК', true);
        return false;
    }

    const post = {
        id: 'local_' + Date.now().toString(36),
        authorId: profileId,
        authorName: currentProfile.nickname,
        authorAvatar: currentProfile.avatarData || DEFAULT_AVATAR,
        text: text || '',
        media: media || [],
        likes: 0,
        dislikes: 0,
        votes: {},
        comments: [],
        createdAt: new Date().toISOString(),
        _local: true
    };

    // Добавляем локально сразу
    allPosts.unshift(post);
    renderAllPosts();
    showToast('ПОСТ ПУБЛИКУЕТСЯ...');

    // Если Firebase не готов, сохраняем в кэш
    if (!firebaseReady || !db) {
        const cached = getCachedData() || { posts: [] };
        cached.posts.unshift(post);
        setCachedData(cached);
        showToast('ПОСТ СОХРАНЁН ЛОКАЛЬНО');
        return true;
    }

    try {
        const docRef = await db.collection('posts').add({
            authorId: profileId,
            text: text || '',
            media: media || [],
            likes: 0,
            dislikes: 0,
            votes: {},
            comments: [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Обновляем ID поста
        const idx = allPosts.findIndex(p => p.id === post.id);
        if (idx !== -1) {
            allPosts[idx].id = docRef.id;
            allPosts[idx]._local = false;
            renderAllPosts();
        }
        
        showToast('ПОСТ ОПУБЛИКОВАН');
        return true;
    } catch (error) {
        console.warn('Ошибка создания поста:', error);
        // Сохраняем в кэш
        const cached = getCachedData() || { posts: [] };
        cached.posts.unshift(post);
        setCachedData(cached);
        showToast('ПОСТ СОХРАНЁН ЛОКАЛЬНО (ОФФЛАЙН)', true);
        return true;
    }
}

async function deletePost(postId) {
    // Локальное удаление
    const idx = allPosts.findIndex(p => p.id === postId);
    if (idx === -1) return false;
    if (allPosts[idx].authorId !== profileId) {
        showToast('НЕ ВАШ ПОСТ', true);
        return false;
    }
    
    allPosts.splice(idx, 1);
    renderAllPosts();

    // Если Firebase не готов, удаляем из кэша
    if (!firebaseReady || !db) {
        const cached = getCachedData() || { posts: [] };
        cached.posts = cached.posts.filter(p => p.id !== postId);
        setCachedData(cached);
        showToast('ПОСТ УДАЛЁН ЛОКАЛЬНО');
        return true;
    }

    try {
        await db.collection('posts').doc(postId).delete();
        showToast('ПОСТ УДАЛЁН');
        return true;
    } catch (error) {
        console.warn('Ошибка удаления поста:', error);
        // Удаляем из кэша
        const cached = getCachedData() || { posts: [] };
        cached.posts = cached.posts.filter(p => p.id !== postId);
        setCachedData(cached);
        showToast('ПОСТ УДАЛЁН ЛОКАЛЬНО', true);
        return true;
    }
}

async function votePost(postId, value) {
    if (!currentProfile?.nickname) {
        showToast('СНАЧАЛА УСТАНОВИТЕ НИК', true);
        return false;
    }

    // Локальное обновление
    const post = allPosts.find(p => p.id === postId);
    if (!post) return false;

    const currentVote = post.votes?.[profileId] || 0;
    
    if (currentVote === value) {
        delete post.votes[profileId];
        if (value === 1) post.likes--;
        else post.dislikes--;
    } else {
        if (currentVote === 1) post.likes--;
        else if (currentVote === -1) post.dislikes--;
        if (!post.votes) post.votes = {};
        post.votes[profileId] = value;
        if (value === 1) post.likes++;
        else post.dislikes++;
    }
    
    renderAllPosts();

    // Если Firebase не готов, сохраняем в кэш
    if (!firebaseReady || !db) {
        const cached = getCachedData() || { posts: [] };
        const idx = cached.posts.findIndex(p => p.id === postId);
        if (idx !== -1) {
            cached.posts[idx] = post;
            setCachedData(cached);
        }
        return true;
    }

    try {
        await db.collection('posts').doc(postId).update({
            likes: post.likes,
            dislikes: post.dislikes,
            votes: post.votes
        });
        return true;
    } catch (error) {
        console.warn('Ошибка голосования:', error);
        return true;
    }
}

async function addComment(postId, text) {
    if (!currentProfile?.nickname) {
        showToast('СНАЧАЛА УСТАНОВИТЕ НИК', true);
        return false;
    }

    const post = allPosts.find(p => p.id === postId);
    if (!post) return false;

    const comment = {
        id: 'c_' + Date.now().toString(36),
        authorId: profileId,
        text: text,
        createdAt: new Date().toISOString()
    };

    if (!post.comments) post.comments = [];
    post.comments.push(comment);
    renderAllPosts();

    if (!firebaseReady || !db) {
        const cached = getCachedData() || { posts: [] };
        const idx = cached.posts.findIndex(p => p.id === postId);
        if (idx !== -1) {
            cached.posts[idx] = post;
            setCachedData(cached);
        }
        return true;
    }

    try {
        await db.collection('posts').doc(postId).update({
            comments: post.comments
        });
        return true;
    } catch (error) {
        console.warn('Ошибка добавления комментария:', error);
        return true;
    }
}

// ============================================================
// UI ФУНКЦИИ (без изменений)
// ============================================================

function updateUI() {
    updateProfileUI();
    renderAllPosts();
    updateNotifCount();
}

function updateProfileUI() {
    if (!currentProfile) return;

    const nick = document.activeElement === nicknameInput
        ? nicknameInput.value.trim()
        : (currentProfile.nickname || '');

    if (document.activeElement !== nicknameInput) {
        nicknameInput.value = nick;
    }
    profileNicknameEl.textContent = nick || 'ТВОЙ НИК';

    const avatar = currentProfile.avatarData || DEFAULT_AVATAR;
    profileAvatarEl.src = avatar;
    profileBigAvatarEl.src = avatar;
}

function renderAllPosts() {
    const sorted = [...allPosts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (sorted.length) {
        postsListFeedEl.innerHTML = sorted.map(p => renderPostCard(p)).join('');
    } else {
        postsListFeedEl.innerHTML = `
            <div class="empty-posts" style="padding:60px 20px;text-align:center;color:#8d9098;line-height:2;">
                <div style="font-size:48px;margin-bottom:12px;">🌐</div>
                <div>ПОКА НЕТ ПОСТОВ</div>
                <div style="font-size:0.85rem;color:#5a5d66;">БУДЬТЕ ПЕРВЫМ</div>
            </div>
        `;
    }

    const myPosts = sorted.filter(p => p.authorId === profileId);
    if (myPosts.length) {
        postsListProfileEl.innerHTML = myPosts.map(p => renderPostCard(p)).join('');
    } else {
        postsListProfileEl.innerHTML = '<div class="empty-posts">У ВАС НЕТ ПОСТОВ</div>';
    }
}

function renderPostCard(post) {
    const isMine = post.authorId === profileId;
    const deleteBtn = isMine ? `
        <button class="delete-post-btn" data-delete="${post.id}" type="button">✕</button>
    ` : '';

    let mediaHTML = '';
    if (post.media && post.media.length) {
        mediaHTML = `<div class="post-media">${post.media.map(m => {
            if (m.type === 'video') {
                return `<video controls src="${m.data}"></video>`;
            } else {
                return `<img src="${m.data}" loading="lazy">`;
            }
        }).join('')}</div>`;
    }

    const comments = post.comments || [];
    const commentsHTML = comments.map(c => {
        return `
            <div class="comment">
                <img class="comment-avatar" src="${DEFAULT_AVATAR}">
                <div class="comment-content">
                    <span class="comment-nick">АНОНИМ</span>
                    <div class="comment-text">${escapeHtml(c.text)}</div>
                </div>
            </div>
        `;
    }).join('');

    const isOpen = openComments.has(post.id);
    const myVote = post.votes?.[profileId] || 0;
    const isLocal = post._local ? ' ⚡' : '';

    return `
        <div class="post-card" data-id="${post.id}">
            <div class="post-header">
                <img class="post-avatar" src="${post.authorAvatar || DEFAULT_AVATAR}">
                <span class="post-nick">${escapeHtml(post.authorName || 'АНОНИМ')}${isLocal}</span>
                <span class="post-time">${formatDate(post.createdAt)}</span>
                ${deleteBtn}
            </div>
            ${post.text ? `<div class="post-text">${escapeHtml(post.text)}</div>` : ''}
            ${mediaHTML}
            <div class="post-footer">
                <button class="vote-btn ${myVote === 1 ? 'liked' : ''}" data-vote="1" data-id="${post.id}">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 1.96-2.45l-1.38-7A2 2 0 0 0 17.05 11H14z"/><rect x="4" y="11" width="3" height="11" rx="1"/></svg>${post.likes || 0}
                </button>
                <button class="vote-btn ${myVote === -1 ? 'disliked' : ''}" data-vote="-1" data-id="${post.id}">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="transform:rotate(180deg)"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 1.96-2.45l-1.38-7A2 2 0 0 0 17.05 11H14z"/><rect x="4" y="11" width="3" height="11" rx="1"/></svg>${post.dislikes || 0}
                </button>
                <button class="comment-btn" data-toggle="${post.id}" type="button">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>${comments.length}
                </button>
            </div>
            <div class="comments-section" id="comments-${post.id}" style="display:${isOpen ? 'block' : 'none'}">
                ${commentsHTML}
                <div class="comment-input-row">
                    <input class="comment-input" id="comment-input-${post.id}" maxlength="1000" placeholder="КОММЕНТАРИЙ...">
                    <button class="btn add-comment-btn" data-comment="${post.id}" type="button">▶</button>
                </div>
            </div>
        </div>
    `;
}

function updateNotifCount() {
    const count = 0;
    notifCountEl.textContent = count;
    notifCountEl.classList.toggle('visible', count > 0);
}

function renderNotifications() {
    notificationPanelEl.innerHTML = '<div class="notif-item">НЕТ УВЕДОМЛЕНИЙ</div>';
}

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

function escapeHtml(v) {
    const d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
}

function formatDate(v) {
    if (!v) return '';
    try {
        const date = v.toDate ? v.toDate() : new Date(v);
        return new Intl.DateTimeFormat('ru-RU', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        }).format(date);
    } catch { return ''; }
}

function showToast(msg, err = false) {
    const old = document.querySelector('.toast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.className = `toast${err ? ' error' : ''}`;
    t.textContent = msg;
    document.body.append(t);
    setTimeout(() => t.remove(), 3000);
}

// ============================================================
// СОБЫТИЯ (сокращённо, без изменений)
// ============================================================

nicknameInput.addEventListener('input', function() {
    const nick = this.value.trim();
    profileNicknameEl.textContent = nick || 'ТВОЙ НИК';
    clearTimeout(saveTimer);
    if (!nick) {
        this.classList.remove('error');
        nickErrorMsg.classList.remove('visible');
        return;
    }
    saveTimer = setTimeout(() => saveProfile(nick), 500);
});

nicknameInput.addEventListener('blur', function() {
    clearTimeout(saveTimer);
    const nick = this.value.trim();
    if (nick) saveProfile(nick);
});

profileAvatarEl.addEventListener('click', () => avatarUploadEl.click());

avatarUploadEl.addEventListener('change', function() {
    const file = this.files[0];
    this.value = '';
    if (!file) return;
    if (!currentProfile?.nickname) {
        showToast('СНАЧАЛА УСТАНОВИТЕ НИК', true);
        return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
        showToast('АВАТАР МАКСИМУМ 5 МБ', true);
        return;
    }
    if (!file.type.startsWith('image/')) {
        showToast('ТОЛЬКО ИЗОБРАЖЕНИЯ', true);
        return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
        saveProfile(currentProfile.nickname, e.target.result);
        showToast('АВАТАР ОБНОВЛЁН');
    };
    reader.readAsDataURL(file);
});

document.getElementById('attachBtn').addEventListener('click', () => mediaUploadEl.click());

mediaUploadEl.addEventListener('change', function() {
    const files = Array.from(this.files);
    this.value = '';
    let total = pendingMedia.reduce((s, i) => s + i.file.size, 0);
    for (const file of files) {
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
            showToast('НЕПОДДЕРЖИВАЕМЫЙ ФАЙЛ', true);
            continue;
        }
        if (file.size > MAX_FILE_SIZE || total + file.size > MAX_FILE_SIZE) {
            showToast('МАКСИМУМ 67 МБ', true);
            break;
        }
        total += file.size;
        pendingMedia.push({ file, url: URL.createObjectURL(file) });
    }
    renderMediaPreview();
    updateUploadStatus();
});

function renderMediaPreview() {
    if (pendingMedia.length) {
        mediaPreviewEl.innerHTML = pendingMedia.map((item, i) => `
            <div class="preview-item">
                ${item.file.type.startsWith('video/')
                    ? `<video src="${item.url}" muted></video>`
                    : `<img src="${item.url}">`}
                <div class="preview-size">${escapeHtml(item.file.name)}</div>
                <button class="remove-media" data-remove="${i}" type="button">✕</button>
            </div>
        `).join('');
    } else {
        mediaPreviewEl.innerHTML = '';
    }
}

function updateUploadStatus(text) {
    if (text) {
        uploadStatusEl.textContent = text;
        return;
    }
    const total = pendingMedia.reduce((s, i) => s + i.file.size, 0);
    uploadStatusEl.textContent = pendingMedia.length
        ? `${pendingMedia.length} ФАЙЛОВ (${(total / 1048576).toFixed(1)} МБ)`
        : '';
}

mediaPreviewEl.addEventListener('click', function(e) {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    const idx = Number(btn.dataset.remove);
    const removed = pendingMedia.splice(idx, 1)[0];
    if (removed) URL.revokeObjectURL(removed.url);
    renderMediaPreview();
    updateUploadStatus();
});

publishBtnEl.addEventListener('click', async function() {
    if (!currentProfile?.nickname) {
        showToast('СНАЧАЛА УСТАНОВИТЕ НИК', true);
        return;
    }
    const text = postTextEl.value.trim();
    if (!text && pendingMedia.length === 0) {
        showToast('НАПИШИТЕ ТЕКСТ ИЛИ ПРИКРЕПИТЕ ФАЙЛ', true);
        return;
    }
    this.disabled = true;
    this.textContent = '...';
    try {
        const media = [];
        for (const item of pendingMedia) {
            const data = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsDataURL(item.file);
            });
            media.push({
                type: item.file.type.startsWith('video/') ? 'video' : 'image',
                data: data
            });
        }
        await createPost(text, media);
        postTextEl.value = '';
        pendingMedia.forEach((item) => URL.revokeObjectURL(item.url));
        pendingMedia = [];
        renderMediaPreview();
        updateUploadStatus();
        setActiveTab('tabFeed', 'feedSection');
    } catch (e) {
        showToast(e.message, true);
    } finally {
        this.disabled = false;
        this.textContent = 'ОПУБЛИКОВАТЬ';
    }
});

// ============================================================
// КЛИКИ
// ============================================================

document.addEventListener('click', function(e) {
    const voteBtn = e.target.closest('[data-vote]');
    if (voteBtn) {
        if (!currentProfile?.nickname) {
            showToast('СНАЧАЛА УСТАНОВИТЕ НИК', true);
            return;
        }
        votePost(voteBtn.dataset.id, Number(voteBtn.dataset.vote));
        return;
    }
    const toggleBtn = e.target.closest('[data-toggle]');
    if (toggleBtn) {
        const id = toggleBtn.dataset.toggle;
        const section = document.getElementById(`comments-${id}`);
        if (!section) return;
        const open = section.style.display !== 'block';
        section.style.display = open ? 'block' : 'none';
        open ? openComments.add(id) : openComments.delete(id);
        return;
    }
    const commentBtn = e.target.closest('[data-comment]');
    if (commentBtn) {
        if (!currentProfile?.nickname) {
            showToast('СНАЧАЛА УСТАНОВИТЕ НИК', true);
            return;
        }
        const id = commentBtn.dataset.comment;
        const input = document.getElementById(`comment-input-${id}`);
        const text = input?.value.trim();
        if (!text) return;
        addComment(id, text);
        openComments.add(id);
        input.value = '';
        return;
    }
    const delBtn = e.target.closest('[data-delete]');
    if (delBtn) {
        if (!confirm('УДАЛИТЬ ПОСТ?')) return;
        deletePost(delBtn.dataset.delete);
        return;
    }
});

document.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter' || e.shiftKey || !e.target.classList.contains('comment-input')) return;
    e.preventDefault();
    const btn = e.target.closest('.comment-input-row')?.querySelector('[data-comment]');
    if (btn) btn.click();
});

bellBtnEl.addEventListener('click', function() {
    notifOpen = !notifOpen;
    notificationPanelEl.style.display = notifOpen ? 'block' : 'none';
    if (notifOpen) {
        renderNotifications();
    }
});

document.addEventListener('click', function(e) {
    if (!notifOpen) return;
    if (bellBtnEl.contains(e.target) || notificationPanelEl.contains(e.target)) return;
    notifOpen = false;
    notificationPanelEl.style.display = 'none';
});

function setActiveTab(buttonId, sectionId) {
    document.querySelectorAll('.tabs button').forEach(btn => {
        btn.classList.toggle('active', btn.id === buttonId);
    });
    document.querySelectorAll('.section').forEach(section => {
        section.classList.toggle('active', section.id === sectionId);
    });
}

document.getElementById('tabFeed').addEventListener('click', () => setActiveTab('tabFeed', 'feedSection'));
document.getElementById('tabCreate').addEventListener('click', () => setActiveTab('tabCreate', 'createSection'));
document.getElementById('tabProfile').addEventListener('click', () => setActiveTab('tabProfile', 'profileSection'));

// ============================================================
// ЗАПУСК
// ============================================================

async function init() {
    try {
        // Показываем загрузку
        postsListFeedEl.innerHTML = '<div class="empty-posts">⏳ ПОДКЛЮЧЕНИЕ...</div>';
        
        // Получаем профиль
        await getOrCreateProfile();
        updateProfileUI();

        // Показываем кэш
        const cached = getCachedData();
        if (cached && cached.posts

// ============================================================
// FIREBASE
// ============================================// ============================================================
// FIREBASE
// ============================================================

const firebaseConfig = {
    apiKey: "AIzaSyBa9NWi5FpmAx6ExJh1fJ3b1ipUEEBRxU",
    authDomain: "dark-fortport.firebaseapp.com",
    projectId: "dark-fortport",
    storageBucket: "dark-fortport.firebasestorage.app",
    messagingSenderId: "3814531503",
    appId: "1:3814531503:web:a8200e1f337935a3530f5a"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

db.enablePersistence()
    .then(() => console.log('Offline enabled'))
    .catch(() => console.warn('Offline not available'));

// ============================================================
// КОНСТАНТЫ
// ============================================================

const ADMIN_NICKNAMES = ['amamammellstroy67'];
const DEFAULT_AVATAR = 'https://images.cults3d.com/Yhomf6nyQXApFBCKN8sOAd08eE4=/516x516/filters:no_upscale()/https://fbi.cults3d.com/uploaders/34092477/illustration-file/6f522b08-94f9-4f46-96e5-dd721b8693bb/iconmsg-cults.png';
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

const ICON_LIKE = 'https://fortport.ru/photo/25465';
const ICON_DISLIKE = 'https://fortport.ru/photo/25463';
const ICON_COMMENT = 'https://fortport.ru/photo/25466';
const ICON_BELL = 'https://fortport.ru/photo/25464';

let profileId = localStorage.getItem('df_profile_id');
if (!profileId) {
    profileId = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    localStorage.setItem('df_profile_id', profileId);
}

let currentProfile = null;
let allPosts = [];
let pendingMedia = [];
let saveTimer = 0;
let notifOpen = false;
const openComments = new Set();
let unsubscribePosts = null;
let chatWith = null;
let unsubscribeChat = null;
let searchMode = 'users';
let searchQuery = '';

// ============================================================
// DOM
// ============================================================

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
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const searchBtn = document.getElementById('searchBtn');
const friendsList = document.getElementById('friendsList');
const addFriendBtn = document.getElementById('addFriendBtn');
const chatModal = document.getElementById('chatModal');
const chatFriendName = document.getElementById('chatFriendName');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');
const closeChatBtn = document.getElementById('closeChatBtn');
const feedCount = document.getElementById('feedCount');

// ============================================================
// КЭШ
// ============================================================

function getCachedData() {
    try {
        const raw = localStorage.getItem('df_cache');
        if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
}

function setCachedData(data) {
    try {
        localStorage.setItem('df_cache', JSON.stringify(data));
    } catch (e) {}
}

// ============================================================
// ПРОФИЛЬ
// ============================================================

async function getOrCreateProfile() {
    try {
        const doc = await db.collection('profiles').doc(profileId).get();
        if (doc.exists) {
            currentProfile = { id: profileId, ...doc.data() };
            setCachedData({ profile: currentProfile });
            updateProfileUI();
            return currentProfile;
        }
    } catch (error) {
        console.warn('Ошибка получения профиля:', error);
        const cached = getCachedData();
        if (cached?.profile) {
            currentProfile = cached.profile;
            updateProfileUI();
            return currentProfile;
        }
    }

    const newProfile = {
        nickname: '',
        avatarData: DEFAULT_AVATAR,
        createdAt: new Date().toISOString(),
        friends: [],
        friendRequests: [],
        notifications: [],
        online: true
    };

    try {
        await db.collection('profiles').doc(profileId).set(newProfile);
    } catch (error) {
        console.warn('Ошибка создания профиля:', error);
    }

    currentProfile = { id: profileId, ...newProfile };
    setCachedData({ profile: currentProfile });
    updateProfileUI();
    return currentProfile;
}

async function saveProfile(nickname, avatarData) {
    if (!currentProfile) await getOrCreateProfile();
    if (!currentProfile) return false;

    if (nickname && nickname !== currentProfile.nickname) {
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

    const updateData = {};
    if (nickname !== undefined) updateData.nickname = nickname;
    if (avatarData !== undefined) updateData.avatarData = avatarData;
    updateData.updatedAt = new Date().toISOString();

    Object.assign(currentProfile, updateData);
    setCachedData({ profile: currentProfile });
    nicknameInput.classList.remove('error');
    nickErrorMsg.classList.remove('visible');
    updateProfileUI();

    try {
        await db.collection('profiles').doc(profileId).update(updateData);
        return true;
    } catch (error) {
        console.warn('Ошибка сохранения профиля:', error);
        return true;
    }
}

async function updateOnlineStatus(online) {
    if (!currentProfile) return;
    try {
        await db.collection('profiles').doc(profileId).update({ online });
    } catch (error) {
        console.warn('Ошибка обновления статуса:', error);
    }
}

// ============================================================
// ЗАЯВКИ В ДРУЗЬЯ
// ============================================================

async function sendFriendRequest(userId) {
    if (!currentProfile) return false;
    if (userId === profileId) {
        showToast('НЕЛЬЗЯ ДОБАВИТЬ СЕБЯ', true);
        return false;
    }

    try {
        const userDoc = await db.collection('profiles').doc(userId).get();
        if (!userDoc.exists) {
            showToast('ПОЛЬЗОВАТЕЛЬ НЕ НАЙДЕН', true);
            return false;
        }

        const userData = userDoc.data();
        const friendRequests = userData.friendRequests || [];
        
        if (friendRequests.some(req => req.fromId === profileId && req.status === 'pending')) {
            showToast('ЗАЯВКА УЖЕ ОТПРАВЛЕНА', true);
            return false;
        }

        if (userData.friends && userData.friends.includes(profileId)) {
            showToast('ВЫ УЖЕ ДРУЗЬЯ', true);
            return false;
        }

        friendRequests.push({
            fromId: profileId,
            fromName: currentProfile.nickname || 'АНОНИМ',
            fromAvatar: currentProfile.avatarData || DEFAULT_AVATAR,
            status: 'pending',
            createdAt: new Date().toISOString()
        });

        await db.collection('profiles').doc(userId).update({
            friendRequests: friendRequests
        });

        // Добавляем уведомление
        await addNotification(userId, 'friend_request', {
            fromId: profileId,
            fromName: currentProfile.nickname || 'АНОНИМ'
        });

        showToast('ЗАЯВКА ОТПРАВЛЕНА');
        return true;
    } catch (error) {
        console.error('Ошибка отправки заявки:', error);
        showToast('ОШИБКА ОТПРАВКИ ЗАЯВКИ', true);
        return false;
    }
}

// ============================================================
// УВЕДОМЛЕНИЯ
// ============================================================

async function addNotification(userId, type, data) {
    try {
        const userDoc = await db.collection('profiles').doc(userId).get();
        if (!userDoc.exists) return;

        const notifications = userDoc.data().notifications || [];
        notifications.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            type: type,
            data: data,
            read: false,
            createdAt: new Date().toISOString()
        });

        if (notifications.length > 50) {
            notifications.splice(0, notifications.length - 50);
        }

        await db.collection('profiles').doc(userId).update({
            notifications: notifications
        });
    } catch (error) {
        console.warn('Ошибка добавления уведомления:', error);
    }
}

async function acceptFriendRequest(fromId) {
    if (!currentProfile) return false;

    try {
        const userDoc = await db.collection('profiles').doc(profileId).get();
        const userData = userDoc.data();
        
        let friendRequests = userData.friendRequests || [];
        const requestIndex = friendRequests.findIndex(req => req.fromId === fromId && req.status === 'pending');
        
        if (requestIndex === -1) {
            showToast('ЗАЯВКА НЕ НАЙДЕНА', true);
            return false;
        }

        friendRequests[requestIndex].status = 'accepted';
        
        const friends = userData.friends || [];
        if (!friends.includes(fromId)) {
            friends.push(fromId);
        }

        const fromDoc = await db.collection('profiles').doc(fromId).get();
        if (fromDoc.exists) {
            const fromData = fromDoc.data();
            const fromFriends = fromData.friends || [];
            if (!fromFriends.includes(profileId)) {
                fromFriends.push(profileId);
            }
            await db.collection('profiles').doc(fromId).update({
                friends: fromFriends
            });
        }

        await db.collection('profiles').doc(profileId).update({
            friendRequests: friendRequests,
            friends: friends
        });

        showToast('ДРУГ ДОБАВЛЕН');
        loadFriends();
        loadNotifications();
        return true;
    } catch (error) {
        console.error('Ошибка принятия заявки:', error);
        showToast('ОШИБКА ПРИНЯТИЯ ЗАЯВКИ', true);
        return false;
    }
}

async function declineFriendRequest(fromId) {
    if (!currentProfile) return false;

    try {
        const userDoc = await db.collection('profiles').doc(profileId).get();
        const userData = userDoc.data();
        
        let friendRequests = userData.friendRequests || [];
        friendRequests = friendRequests.filter(req => req.fromId !== fromId || req.status !== 'pending');

        await db.collection('profiles').doc(profileId).update({
            friendRequests: friendRequests
        });

        showToast('ЗАЯВКА ОТКЛОНЕНА');
        loadNotifications();
        return true;
    } catch (error) {
        console.error('Ошибка отклонения заявки:', error);
        showToast('ОШИБКА ОТКЛОНЕНИЯ ЗАЯВКИ', true);
        return false;
    }
}

async function loadNotifications() {
    if (!currentProfile) return;
    try {
        const doc = await db.collection('profiles').doc(profileId).get();
        if (doc.exists) {
            const data = doc.data();
            const notifications = data.notifications || [];
            const pendingRequests = (data.friendRequests || []).filter(req => req.status === 'pending');
            
            // Обновляем счётчик
            const unreadCount = notifications.filter(n => !n.read).length + pendingRequests.length;
            notifCountEl.textContent = unreadCount;
            notifCountEl.classList.toggle('visible', unreadCount > 0);
            
            // Сохраняем для отображения
            currentProfile.notifications = notifications;
            currentProfile.friendRequests = data.friendRequests || [];
        }
    } catch (error) {
        console.warn('Ошибка загрузки уведомлений:', error);
    }
}

function renderNotifications() {
    const notifications = currentProfile?.notifications || [];
    const friendRequests = currentProfile?.friendRequests || [];
    const pendingRequests = friendRequests.filter(req => req.status === 'pending');
    
    let html = '';
    
    // Заявки в друзья
    pendingRequests.forEach(req => {
        html += `
            <div class="notif-item">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span>👤 ${escapeHtml(req.fromName)} хочет добавить вас в друзья</span>
                    <div>
                        <button class="btn" onclick="acceptFriendRequest('${req.fromId}')" style="padding:2px 8px;font-size:9px;">✅</button>
                        <button class="btn" onclick="declineFriendRequest('${req.fromId}')" style="padding:2px 8px;font-size:9px;background:rgba(255,0,0,0.1);">❌</button>
                    </div>
                </div>
                <span class="notif-time">${formatDate(new Date(req.createdAt))}</span>
            </div>
        `;
    });
    
    // Остальные уведомления
    notifications.forEach(n => {
        let message = '';
        switch(n.type) {
            case 'friend_request':
                message = `👤 ${escapeHtml(n.data.fromName)} отправил заявку в друзья`;
                break;
            default:
                message = 'Новое уведомление';
        }
        html += `
            <div class="notif-item">
                ${message}
                <span class="notif-time">${formatDate(new Date(n.createdAt))}</span>
            </div>
        `;
    });
    
    if (!html) {
        html = '<div class="notif-item">НЕТ УВЕДОМЛЕНИЙ</div>';
    }
    
    notificationPanelEl.innerHTML = html;
}

// ============================================================
// ПОСТЫ
// ============================================================

function subscribeToPosts() {
    if (unsubscribePosts) {
        unsubscribePosts();
        unsubscribePosts = null;
    }

    postsListFeedEl.innerHTML = '<div class="empty-posts">ЗАГРУЗКА...</div>';

    unsubscribePosts = db.collection('posts')
        .orderBy('createdAt', 'desc')
        .limit(100)
        .onSnapshot(async (snapshot) => {
            const posts = [];
            for (const doc of snapshot.docs) {
                const data = doc.data();
                let authorName = 'АНОНИМ';
                let authorAvatar = DEFAULT_AVATAR;
                if (data.authorId) {
                    try {
                        const authorDoc = await db.collection('profiles').doc(data.authorId).get();
                        if (authorDoc.exists) {
                            const authorData = authorDoc.data();
                            authorName = authorData.nickname || 'АНОНИМ';
                            authorAvatar = authorData.avatarData || DEFAULT_AVATAR;
                        }
                    } catch (e) {}
                }
                posts.push({
                    id: doc.id,
                    ...data,
                    authorName: authorName,
                    authorAvatar: authorAvatar
                });
            }
            allPosts = posts;
            renderAllPosts();
            loadNotifications();
            if (feedCount) feedCount.textContent = posts.length;
        }, (error) => {
            console.error('Ошибка подписки:', error);
            postsListFeedEl.innerHTML = `
                <div class="empty-posts">
                    <div>ОШИБКА ПОДКЛЮЧЕНИЯ</div>
                    <div style="font-size:0.85rem;color:#5a5d66;margin-top:8px;">${error.message}</div>
                    <button onclick="subscribeToPosts()" style="margin-top:12px;padding:8px 20px;background:rgba(79,195,247,0.08);border:1px solid rgba(79,195,247,0.1);border-radius:6px;color:white;cursor:pointer;">ПОВТОРИТЬ</button>
                </div>
            `;
        });
}

async function createPost(text, media) {
    if (!currentProfile?.nickname) {
        showToast('СНАЧАЛА УСТАНОВИТЕ НИК', true);
        return false;
    }
    try {
        await db.collection('posts').add({
            authorId: profileId,
            text: text || '',
            media: media || [],
            likes: 0,
            dislikes: 0,
            votes: {},
            comments: [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('ПОСТ ОПУБЛИКОВАН');
        return true;
    } catch (error) {
        console.error('Ошибка публикации:', error);
        showToast('ОШИБКА ПУБЛИКАЦИИ', true);
        return false;
    }
}

async function deletePost(postId) {
    try {
        const doc = await db.collection('posts').doc(postId).get();
        if (!doc.exists) {
            showToast('ПОСТ НЕ НАЙДЕН', true);
            return false;
        }
        const data = doc.data();
        const isAdmin = ADMIN_NICKNAMES.includes(currentProfile?.nickname);
        const isOwner = data.authorId === profileId;
        if (!isAdmin && !isOwner) {
            showToast('НЕ ВАШ ПОСТ', true);
            return false;
        }
        await db.collection('posts').doc(postId).delete();
        showToast(isAdmin ? 'ПОСТ УДАЛЁН (АДМИН)' : 'ПОСТ УДАЛЁН');
        return true;
    } catch (error) {
        console.error('Ошибка удаления:', error);
        showToast('ОШИБКА УДАЛЕНИЯ', true);
        return false;
    }
}

async function votePost(postId, value) {
    if (!currentProfile?.nickname) {
        showToast('СНАЧАЛА УСТАНОВИТЕ НИК', true);
        return false;
    }
    try {
        const docRef = db.collection('posts').doc(postId);
        const doc = await docRef.get();
        if (!doc.exists) return false;
        const data = doc.data();
        const votes = data.votes || {};
        const currentVote = votes[profileId] || 0;
        let likes = data.likes || 0;
        let dislikes = data.dislikes || 0;
        if (currentVote === value) {
            delete votes[profileId];
            if (value === 1) likes--;
            else dislikes--;
        } else {
            if (currentVote === 1) likes--;
            else if (currentVote === -1) dislikes--;
            votes[profileId] = value;
            if (value === 1) likes++;
            else dislikes++;
        }
        await docRef.update({ likes, dislikes, votes });
        return true;
    } catch (error) {
        console.error('Ошибка голосования:', error);
        return false;
    }
}

async function addComment(postId, text) {
    if (!currentProfile?.nickname) {
        showToast('СНАЧАЛА УСТАНОВИТЕ НИК', true);
        return false;
    }
    try {
        const docRef = db.collection('posts').doc(postId);
        const doc = await docRef.get();
        if (!doc.exists) return false;
        const data = doc.data();
        const comments = data.comments || [];
        comments.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            authorId: profileId,
            text: text,
            createdAt: new Date().toISOString()
        });
        await docRef.update({ comments });
        return true;
    } catch (error) {
        console.error('Ошибка комментария:', error);
        return false;
    }
}

// ============================================================
// UI
// ============================================================

function updateProfileUI() {
    if (!currentProfile) return;
    const nick = document.activeElement === nicknameInput ? nicknameInput.value.trim() : (currentProfile.nickname || '');
    if (document.activeElement !== nicknameInput) {
        nicknameInput.value = nick;
    }
    profileNicknameEl.textContent = nick || 'ТВОЙ НИК';
    const avatar = currentProfile.avatarData || DEFAULT_AVATAR;
    profileAvatarEl.src = avatar;
    profileBigAvatarEl.src = avatar;
}

function renderAllPosts() {
    const sorted = [...allPosts].sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
        return dateB - dateA;
    });
    if (sorted.length) {
        postsListFeedEl.innerHTML = sorted.map(p => renderPostCard(p)).join('');
    } else {
        postsListFeedEl.innerHTML = `
            <div class="empty-posts">
                <div>ПОКА НЕТ ПОСТОВ</div>
                <div style="font-size:0.85rem;color:#5a5d66;margin-top:4px;">БУДЬТЕ ПЕРВЫМ</div>
            </div>
        `;
    }
    const myPosts = sorted.filter(p => p.authorId === profileId);
    if (myPosts.length) {
        postsListProfileEl.innerHTML = myPosts.map(p => renderPostCard(p)).join('');
    } else {
        postsListProfileEl.innerHTML = '<div class="empty-posts">У ВАС НЕТ ПОСТОВ</div>';
    }
    if (feedCount) feedCount.textContent = sorted.length;
}

function renderPostCard(post) {
    const isMine = post.authorId === profileId;
    const isAdmin = ADMIN_NICKNAMES.includes(currentProfile?.nickname);
    const canDelete = isMine || isAdmin;
    const deleteBtn = canDelete ? `<button class="delete-post-btn" data-delete="${post.id}" type="button">X</button>` : '';
    
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
    const postTime = post.createdAt?.toDate ? post.createdAt.toDate() : new Date(post.createdAt);
    
    return `
        <div class="post-card" data-id="${post.id}">
            <div class="post-header">
                <img class="post-avatar" src="${post.authorAvatar || DEFAULT_AVATAR}">
                <span class="post-nick">${escapeHtml(post.authorName || 'АНОНИМ')}</span>
                <span class="post-time">${formatDate(postTime)}</span>
                ${deleteBtn}
            </div>
            ${post.text ? `<div class="post-text">${escapeHtml(post.text)}</div>` : ''}
            ${mediaHTML}
            <div class="post-footer">
                <button class="vote-btn ${myVote === 1 ? 'liked' : ''}" data-vote="1" data-id="${post.id}">
                    <img src="${ICON_LIKE}" alt="лайк"> ${post.likes || 0}
                </button>
                <button class="vote-btn ${myVote === -1 ? 'disliked' : ''}" data-vote="-1" data-id="${post.id}">
                    <img src="${ICON_DISLIKE}" alt="дизлайк"> ${post.dislikes || 0}
                </button>
                <button class="comment-btn" data-toggle="${post.id}" type="button">
                    <img src="${ICON_COMMENT}" alt="комментарии"> ${comments.length}
                </button>
            </div>
            <div class="comments-section" id="comments-${post.id}" style="display:${isOpen ? 'block' : 'none'}">
                ${commentsHTML}
                <div class="comment-input-row">
                    <input class="comment-input" id="comment-input-${post.id}" maxlength="1000" placeholder="КОММЕНТАРИЙ...">
                    <button class="btn add-comment-btn" data-comment="${post.id}" type="button">></button>
                </div>
            </div>
        </div>
    `;
}

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ
// ============================================================

function escapeHtml(v) {
    const d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
}

function formatDate(date) {
    if (!date) return '';
    try {
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
// ПОИСК
// ============================================================

async function searchUsers(query) {
    if (!query.trim()) {
        searchResults.innerHTML = '<div class="empty-posts">ВВЕДИТЕ ЗАПРОС ДЛЯ ПОИСКА</div>';
        return;
    }
    try {
        const snapshot = await db.collection('profiles')
            .where('nickname', '>=', query)
            .where('nickname', '<=', query + '\uf8ff')
            .limit(20)
            .get();
        if (snapshot.empty) {
            searchResults.innerHTML = '<div class="empty-posts">ПОЛЬЗОВАТЕЛИ НЕ НАЙДЕНЫ</div>';
            return;
        }
        let html = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const isFriend = currentProfile?.friends?.includes(doc.id) || false;
            const isSelf = doc.id === profileId;
            const hasPendingRequest = (currentProfile?.friendRequests || []).some(req => req.fromId === doc.id && req.status === 'pending');
            html += `
                <div class="search-result-item" data-id="${doc.id}">
                    <img class="search-result-avatar" src="${data.avatarData || DEFAULT_AVATAR}">
                    <div class="search-result-info">
                        <div class="search-result-nick">${escapeHtml(data.nickname || 'АНОНИМ')}</div>
                        <div class="search-result-status ${data.online ? 'online' : ''}">
                            ${data.online ? 'В СЕТИ' : 'ОФФЛАЙН'}
                            ${isSelf ? ' (ЭТО ВЫ)' : ''}
                            ${isFriend ? ' ДРУГ' : ''}
                            ${hasPendingRequest ? ' ЗАЯВКА ОТПРАВЛЕНА' : ''}
                        </div>
                    </div>
                    ${!isSelf && !isFriend && !hasPendingRequest ? `
                        <button class="btn" data-send-request="${doc.id}" style="font-size:9px;padding:2px 10px;">ДОБАВИТЬ</button>
                    ` : ''}
                    ${!isSelf && hasPendingRequest ? `
                        <button class="btn" style="font-size:9px;padding:2px 10px;opacity:0.5;" disabled>ОЖИДАНИЕ</button>
                    ` : ''}
                </div>
            `;
        });
        searchResults.innerHTML = html;
    } catch (error) {
        console.error('Ошибка поиска:', error);
        searchResults.innerHTML = '<div class="empty-posts">ОШИБКА ПОИСКА</div>';
    }
}

async function searchPosts(query) {
    if (!query.trim()) {
        searchResults.innerHTML = '<div class="empty-posts">ВВЕДИТЕ ЗАПРОС ДЛЯ ПОИСКА</div>';
        return;
    }
    try {
        const snapshot = await db.collection('posts')
            .orderBy('createdAt', 'desc')
            .limit(100)
            .get();
        const results = [];
        const queryLower = query.toLowerCase().trim();
        for (const doc of snapshot.docs) {
            const data = doc.data();
            const text = (data.text || '').toLowerCase();
            if (text.includes(queryLower)) {
                let authorName = 'АНОНИМ';
                if (data.authorId) {
                    try {
                        const authorDoc = await db.collection('profiles').doc(data.authorId).get();
                        if (authorDoc.exists) {
                            authorName = authorDoc.data().nickname || 'АНОНИМ';
                        }
                    } catch (e) {}
                }
                results.push({
                    id: doc.id,
                    ...data,
                    authorName: authorName
                });
            }
        }
        if (!results.length) {
            searchResults.innerHTML = '<div class="empty-posts">ПОСТЫ НЕ НАЙДЕНЫ</div>';
            return;
        }
        let html = '';
        results.forEach(post => {
            const postTime = post.createdAt?.toDate ? post.createdAt.toDate() : new Date(post.createdAt);
            html += `
                <div class="search-result-post" data-post="${post.id}">
                    <div class="post-author">${escapeHtml(post.authorName)}</div>
                    <div class="post-content">${escapeHtml(post.text || '')}</div>
                    <div class="post-date">${formatDate(postTime)}</div>
                </div>
            `;
        });
        searchResults.innerHTML = html;
    } catch (error) {
        console.error('Ошибка поиска постов:', error);
        searchResults.innerHTML = '<div class="empty-posts">ОШИБКА ПОИСКА</div>';
    }
}

function performSearch(query) {
    searchQuery = query;
    if (searchMode === 'users') {
        searchUsers(query);
    } else {
        searchPosts(query);
    }
}

// ============================================================
// ДРУЗЬЯ
// ============================================================

async function loadFriends() {
    if (!currentProfile) return;
    const friendIds = currentProfile.friends || [];
    if (!friendIds.length) {
        friendsList.innerHTML = '<div class="empty-posts">У ВАС НЕТ ДРУЗЕЙ</div>';
        return;
    }
    try {
        let html = '';
        for (const friendId of friendIds) {
            const doc = await db.collection('profiles').doc(friendId).get();
            if (doc.exists) {
                const data = doc.data();
                html += `
                    <div class="friend-item" data-id="${friendId}">
                        <img class="friend-avatar" src="${data.avatarData || DEFAULT_AVATAR}">
                        <div class="friend-info">
                            <div class="friend-nick">${escapeHtml(data.nickname || 'АНОНИМ')}</div>
                            <div class="friend-status ${data.online ? 'online' : ''}">
                                ${data.online ? 'В СЕТИ' : 'ОФФЛАЙН'}
                            </div>
                        </div>
                        <div class="friend-actions">
                            <button class="chat-friend" data-chat="${friendId}">ЧАТ</button>
                            <button class="remove-friend" data-remove-friend="${friendId}">X</button>
                        </div>
                    </div>
                `;
            }
        }
        friendsList.innerHTML = html || '<div class="empty-posts">ДРУЗЬЯ НЕ НАЙДЕНЫ</div>';
    } catch (error) {
        console.error('Ошибка загрузки друзей:', error);
        friendsList.innerHTML = '<div class="empty-posts">ОШИБКА ЗАГРУЗКИ</div>';
    }
}

async function addFriend(userId) {
    if (!currentProfile) return false;
    if (userId === profileId) {
        showToast('НЕЛЬЗЯ ДОБАВИТЬ СЕБЯ', true);
        return false;
    }
    const friends = currentProfile.friends || [];
    if (friends.includes(userId)) {
        showToast('УЖЕ В ДРУЗЬЯХ', true);
        return false;
    }
    friends.push(userId);
    currentProfile.friends = friends;
    try {
        await db.collection('profiles').doc(profileId).update({ friends });
        setCachedData({ profile: currentProfile });
        showToast('ДРУГ ДОБАВЛЕН');
        loadFriends();
        return true;
    } catch (error) {
        console.error('Ошибка добавления друга:', error);
        showToast('ОШИБКА ДОБАВЛЕНИЯ', true);
        return false;
    }
}

async function removeFriend(userId) {
    if (!currentProfile) return false;
    const friends = currentProfile.friends || [];
    const index = friends.indexOf(userId);
    if (index === -1) return false;
    friends.splice(index, 1);
    currentProfile.friends = friends;
    try {
        await db.collection('profiles').doc(profileId).update({ friends });
        setCachedData({ profile: currentProfile });
        showToast('ДРУГ УДАЛЁН');
        loadFriends();
        return true;
    } catch (error) {
        console.error('Ошибка удаления друга:', error);
        showToast('ОШИБКА УДАЛЕНИЯ', true);
        return false;
    }
}

// ============================================================
// ЧАТ
// ============================================================

function openChat(userId, userNickname) {
    chatWith = userId;
    chatFriendName.textContent = 'ЧАТ С ' + (userNickname || 'ДРУГОМ');
    chatModal.classList.add('open');
    loadChatMessages(userId);
}

function closeChat() {
    chatModal.classList.remove('open');
    if (unsubscribeChat) {
        unsubscribeChat();
        unsubscribeChat = null;
    }
    chatWith = null;
}

function loadChatMessages(userId) {
    if (unsubscribeChat) {
        unsubscribeChat();
        unsubscribeChat = null;
    }
    chatMessages.innerHTML = '<div class="empty-posts">ЗАГРУЗКА СООБЩЕНИЙ...</div>';
    const chatId = [profileId, userId].sort().join('_');
    unsubscribeChat = db.collection('chats').doc(chatId)
        .onSnapshot((doc) => {
            if (!doc.exists) {
                chatMessages.innerHTML = '<div class="empty-posts">НАЧНИТЕ ОБЩЕНИЕ</div>';
                return;
            }
            const data = doc.data();
            const messages = data.messages || [];
            if (!messages.length) {
                chatMessages.innerHTML = '<div class="empty-posts">НАЧНИТЕ ОБЩЕНИЕ</div>';
                return;
            }
            let html = '';
            messages.forEach(msg => {
                const isMine = msg.authorId === profileId;
                html += `
                    <div class="chat-message ${isMine ? 'mine' : ''}">
                        <div class="msg-nick">${isMine ? 'ВЫ' : escapeHtml(msg.authorName || 'ДРУГ')}</div>
                        <div class="msg-text">${escapeHtml(msg.text)}</div>
                        <span class="msg-time">${formatDate(new Date(msg.createdAt))}</span>
                    </div>
                `;
            });
            chatMessages.innerHTML = html;
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, (error) => {
            console.error('Ошибка загрузки чата:', error);
            chatMessages.innerHTML = '<div class="empty-posts">ОШИБКА ЗАГРУЗКИ</div>';
        });
}

async function sendMessage(text) {
    if (!chatWith) {
        showToast('ЧАТ НЕ ОТКРЫТ', true);
        return;
    }
    if (!text.trim()) {
        showToast('ВВЕДИТЕ СООБЩЕНИЕ', true);
        return;
    }
    try {
        const chatId = [profileId, chatWith].sort().join('_');
        const chatRef = db.collection('chats').doc(chatId);
        const doc = await chatRef.get();
        const messages = doc.exists ? (doc.data().messages || []) : [];
        const authorName = currentProfile?.nickname || 'АНОНИМ';
        messages.push({
            authorId: profileId,
            authorName: authorName,
            text: text.trim(),
            createdAt: new Date().toISOString()
        });
        await chatRef.set({ messages }, { merge: true });
        chatInput.value = '';
        showToast('СООБЩЕНИЕ ОТПРАВЛЕНО');
    } catch (error) {
        console.error('Ошибка отправки:', error);
        showToast('ОШИБКА ОТПРАВКИ', true);
    }
}

// ============================================================
// СОБЫТИЯ
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
            showToast('МАКСИМУМ 50 МБ', true);
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
                <button class="remove-media" data-remove="${i}" type="button">X</button>
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
        switchTab('feed');
    } catch (e) {
        showToast(e.message, true);
    } finally {
        this.disabled = false;
        this.textContent = 'ОПУБЛИКОВАТЬ';
    }
});

// ============================================================
// МЕНЮ / ВКЛАДКИ
// ============================================================

const sectionMap = {
    feed: 'feedSection',
    search: 'searchSection',
    friends: 'friendsSection',
    create: 'createSection',
    profile: 'profileSection'
};

function switchTab(tab) {
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
    
    const menuItem = document.querySelector(`.menu-item[data-tab="${tab}"]`);
    if (menuItem) menuItem.classList.add('active');
    
    const section = document.getElementById(sectionMap[tab]);
    if (section) section.classList.add('active');
    
    if (tab === 'friends') loadFriends();
    if (tab === 'search') performSearch(searchInput.value);
    if (tab === 'feed') {
        postsListFeedEl.scrollTop = 0;
        renderAllPosts();
    }
}

document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', function(e) {
        e.preventDefault();
        switchTab(this.dataset.tab);
    });
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
    
    // Отправка заявки в друзья
    const sendRequestBtn = e.target.closest('[data-send-request]');
    if (sendRequestBtn) {
        const userId = sendRequestBtn.dataset.sendRequest;
        sendFriendRequest(userId);
        performSearch(searchInput.value);
        return;
    }
    
    const removeFriendBtn = e.target.closest('[data-remove-friend]');
    if (removeFriendBtn) {
        if (!confirm('УДАЛИТЬ ИЗ ДРУЗЕЙ?')) return;
        removeFriend(removeFriendBtn.dataset.removeFriend);
        return;
    }
    const chatBtn = e.target.closest('[data-chat]');
    if (chatBtn) {
        const userId = chatBtn.dataset.chat;
        const friendItem = chatBtn.closest('.friend-item');
        const nickElement = friendItem?.querySelector('.friend-nick');
        const nick = nickElement ? nickElement.textContent : 'ДРУГ';
        openChat(userId, nick);
        return;
    }
    const postResult = e.target.closest('[data-post]');
    if (postResult) {
        const postId = postResult.dataset.post;
        switchTab('feed');
        setTimeout(() => {
            const postEl = document.querySelector(`.post-card[data-id="${postId}"]`);
            if (postEl) {
                postEl.scrollIntoView({ behavior: 'smooth' });
                postEl.style.borderColor = 'rgba(79,195,247,0.3)';
                setTimeout(() => {
                    postEl.style.borderColor = '';
                }, 3000);
            }
        }, 100);
        return;
    }
});

// ============================================================
// КЛАВИАТУРА
// ============================================================

document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && e.target === chatInput) {
        e.preventDefault();
        sendChatBtn.click();
    }
    if (e.key === 'Enter' && e.target === searchInput) {
        e.preventDefault();
        performSearch(searchInput.value);
    }
});

// ============================================================
// ПОИСК В РЕАЛЬНОМ ВРЕМЕНИ
// ============================================================

searchInput.addEventListener('input', function() {
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
        performSearch(this.value);
    }, 300);
});

// ============================================================
// ВКЛАДКИ ПОИСКА
// ============================================================

document.querySelectorAll('.search-tab').forEach(tab => {
    tab.addEventListener('click', function() {
        document.querySelectorAll('.search-tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        searchMode = this.dataset.search;
        performSearch(searchInput.value);
    });
});

// ============================================================
// КНОПКА ПОИСКА
// ============================================================

if (searchBtn) {
    searchBtn.addEventListener('click', function() {
        performSearch(searchInput.value);
    });
}

// ============================================================
// УВЕДОМЛЕНИЯ (КОЛОКОЛЬЧИК)
// ============================================================

bellBtnEl.addEventListener('click', function() {
    notifOpen = !notifOpen;
    notificationPanelEl.style.display = notifOpen ? 'block' : 'none';
    if (notifOpen) {
        renderNotifications();
        // Помечаем уведомления как прочитанные
        if (currentProfile?.notifications) {
            currentProfile.notifications.forEach(n => n.read = true);
            db.collection('profiles').doc(profileId).update({
                notifications: currentProfile.notifications
            }).catch(() => {});
            updateNotifCount();
        }
    }
});

function updateNotifCount() {
    const notifications = currentProfile?.notifications || [];
    const friendRequests = currentProfile?.friendRequests || [];
    const pendingRequests = friendRequests.filter(req => req.status === 'pending');
    const unreadCount = notifications.filter(n => !n.read).length + pendingRequests.length;
    notifCountEl.textContent = unreadCount;
    notifCountEl.classList.toggle('visible', unreadCount > 0);
}

document.addEventListener('click', function(e) {
    if (!notifOpen) return;
    if (bellBtnEl.contains(e.target) || notificationPanelEl.contains(e.target)) return;
    notifOpen = false;
    notificationPanelEl.style.display = 'none';
});

// ============================================================
// КНОПКА ДОБАВИТЬ ДРУЗЕЙ
// ============================================================

if (addFriendBtn) {
    addFriendBtn.addEventListener('click', function() {
        switchTab('search');
        searchMode = 'users';
        document.querySelectorAll('.search-tab').forEach(t => t.classList.remove('active'));
        document.querySelector('[data-search="users"]')?.classList.add('active');
        searchInput.placeholder = 'ВВЕДИТЕ НИК ПОЛЬЗОВАТЕЛЯ...';
        searchInput.focus();
    });
}

// ============================================================
// ЧАТ
// ============================================================

sendChatBtn.addEventListener('click', () => {
    sendMessage(chatInput.value);
});

closeChatBtn.addEventListener('click', closeChat);

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && chatModal.classList.contains('open')) {
        closeChat();
    }
});

// ============================================================
// ЗАПУСК
// ============================================================

async function init() {
    try {
        console.log('DARK FORT INIT');
        console.log('PROJECT:', firebaseConfig.projectId);
        await db.collection('_test').doc('test').set({ test: true });
        console.log('Firebase подключен');
        await getOrCreateProfile();
        subscribeToPosts();
        await updateOnlineStatus(true);
        if (!currentProfile?.nickname) {
            nicknameInput.focus();
        }
        window.addEventListener('beforeunload', () => {
            updateOnlineStatus(false);
        });
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                updateOnlineStatus(false);
            } else {
                updateOnlineStatus(true);
            }
        });
        console.log('DARK FORT ONLINE');
    } catch (error) {
        console.error('Ошибка:', error);
        showToast('ОШИБКА ПОДКЛЮЧЕНИЯ К FIREBASE', true);
        const cached = getCachedData();
        if (cached?.profile) {
            currentProfile = cached.profile;
            updateProfileUI();
        }
        postsListFeedEl.innerHTML = `
            <div class="empty-posts" style="padding:60px 20px;text-align:center;color:#8d9098;line-height:2;">
                <div style="font-size:48px;margin-bottom:12px;">⚠️</div>
                <div>ОФФЛАЙН РЕЖИМ</div>
                <div style="font-size:0.85rem;color:#5a5d66;">${error.message}</div>
                <button onclick="location.reload()" style="margin-top:12px;padding:8px 20px;background:rgba(79,195,247,0.08);border:1px solid rgba(79,195,247,0.1);border-radius:6px;color:white;cursor:pointer;">ПОВТОРИТЬ</button>
            </div>
        `;
    }
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
        loadingScreen.classList.add('hidden');
    }
}

document.addEventListener('DOMContentLoaded', init);

// ============================================================
// СТЕПАША
// ============================================================
const stepaGif = document.getElementById('stepaGif');
const stepaWrapper = document.getElementById('stepaWrapper');
const stepaModal = document.getElementById('stepaModal');
const stepaModalClose = document.getElementById('stepaModalClose');
const stepaPhrase = document.getElementById('stepaPhrase');
const stepaBotSay = document.getElementById('stepaBotSay');
const stepaResult = document.getElementById('stepaResult');
const stepaReset = document.getElementById('stepaReset');

let stepaGame = 'rps';
let stepaBoard = ['','','','','','','','',''];
let stepaActive = true;
let stepaPos = null;
let stepaSelected = null;
let stepaTurn = 'white';
let stepaPlayerColor = 'white';
let stepaBotColor = 'black';
let stepaGameOver = false;
let stepaChain = [];
let stepaChainTimer = null;
let stepaDifficulty = 'medium';

const STEPA_WHITE_PIECE = 'https://avatanplus.com/files/resources/original/5f394193cd6b2173f7a82981.png';

stepaGif.style.cssText = `
    width: 120px !important;
    height: 120px !important;
    object-fit: contain !important;
    image-rendering: pixelated !important;
    border: none !important;
    background: none !important;
    box-shadow: none !important;
    outline: none !important;
    border-radius: 0 !important;
    transition: transform 0.2s ease !important;
    cursor: grab !important;
    user-select: none !important;
    -webkit-user-select: none !important;
`;

stepaWrapper.style.cssText = `
    position: fixed !important;
    z-index: 999 !important;
    cursor: grab !important;
    user-select: none !important;
    -webkit-user-select: none !important;
`;

let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

stepaWrapper.addEventListener('mousedown', function(e) {
    if (e.target.closest('.stepa-modal')) return;
    isDragging = true;
    const rect = this.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    this.style.cursor = 'grabbing';
    stepaGif.style.cursor = 'grabbing';
    e.preventDefault();
});

document.addEventListener('mousemove', function(e) {
    if (!isDragging) return;
    let x = e.clientX - dragOffsetX;
    let y = e.clientY - dragOffsetY;
    
    const maxX = window.innerWidth - 140;
    const maxY = window.innerHeight - 140;
    x = Math.max(0, Math.min(x, maxX));
    y = Math.max(0, Math.min(y, maxY));
    
    stepaWrapper.style.left = x + 'px';
    stepaWrapper.style.top = y + 'px';
});

document.addEventListener('mouseup', function() {
    if (isDragging) {
        isDragging = false;
        stepaWrapper.style.cursor = 'grab';
        stepaGif.style.cursor = 'grab';
    }
});

stepaWrapper.addEventListener('click', function(e) {
    if (isDragging) return;
    e.stopPropagation();
    stepaModal.classList.toggle('open');
    if (stepaModal.classList.contains('open')) {
        stepaResetAll();
    }
});

stepaModalClose.addEventListener('click', function() {
    stepaModal.classList.remove('open');
});

document.addEventListener('click', function(e) {
    if (stepaModal.contains(e.target) || stepaWrapper.contains(e.target)) {
        return;
    }
    stepaModal.classList.remove('open');
});

stepaModal.addEventListener('click', function(e) {
    e.stopPropagation();
});

document.querySelectorAll('.stepa-rps-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
        const moves = ['камень','ножницы','бумага'];
        const player = this.dataset.move;
        const bot = moves[Math.floor(Math.random()*3)];
        const playerName = player === 'rock' ? 'камень' : player === 'scissors' ? 'ножницы' : 'бумага';
        stepaBotSay.textContent = 'Степаша: я выбрал ' + bot;
        if (playerName === bot) {
            stepaResult.textContent = 'ничья';
            stepaPhrase.textContent = 'ничья';
        } else if ((playerName==='камень'&&bot==='ножницы')||(playerName==='ножницы'&&bot==='бумага')||(playerName==='бумага'&&bot==='камень')) {
            stepaResult.textContent = 'ты победил';
            stepaPhrase.textContent = 'повезло...';
        } else {
            stepaResult.textContent = 'Степаша победил';
            stepaPhrase.textContent = 'бурмалда!';
        }
    });
});

function stepaCheckWin(b) {
    const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (const [a,b_,c] of wins) if (b[a] && b[a]===b[b_] && b[a]===b[c]) return b[a];
    return b.includes('') ? null : 'ничья';
}

function stepaMinimax(b, isMax) {
    const winner = stepaCheckWin(b);
    if (winner === 'X') return -10;
    if (winner === 'O') return 10;
    if (!b.includes('')) return 0;
    if (isMax) {
        let best = -999;
        for (let i=0; i<9; i++) {
            if (b[i] === '') { b[i] = 'O'; best = Math.max(best, stepaMinimax(b, false)); b[i] = ''; }
        }
        return best;
    } else {
        let best = 999;
        for (let i=0; i<9; i++) {
            if (b[i] === '') { b[i] = 'X'; best = Math.min(best, stepaMinimax(b, true)); b[i] = ''; }
        }
        return best;
    }
}

function stepaFindBestMove() {
    let bestScore = -999, bestMove = -1, empty = [];
    for (let i=0; i<9; i++) {
        if (stepaBoard[i] === '') {
            empty.push(i);
            stepaBoard[i] = 'O';
            const score = stepaMinimax(stepaBoard, false);
            stepaBoard[i] = '';
            if (score > bestScore) { bestScore = score; bestMove = i; }
        }
    }
    return bestMove;
}

function stepaRenderTtt() {
    const board = document.getElementById('stepaBoard');
    board.innerHTML = '';
    stepaBoard.forEach(function(cell, i) {
        const btn = document.createElement('button');
        btn.textContent = cell;
        btn.onclick = function() { stepaTttMove(i); };
        board.appendChild(btn);
    });
}

function stepaTttMove(i) {
    if (!stepaActive || stepaBoard[i] !== '') return;
    stepaBoard[i] = 'X';
    stepaRenderTtt();
    const winner = stepaCheckWin(stepaBoard);
    if (winner) {
        stepaActive = false;
        if (winner==='X') { stepaResult.textContent='ты победил'; stepaPhrase.textContent='повезло...'; }
        else { stepaResult.textContent='ничья'; stepaPhrase.textContent='ничья'; }
        stepaBotSay.textContent = 'Степаша: ...';
        return;
    }
    if (!stepaBoard.includes('')) {
        stepaActive = false;
        stepaResult.textContent='ничья'; stepaPhrase.textContent='ничья';
        stepaBotSay.textContent = 'Степаша: ничья';
        return;
    }
    setTimeout(function() {
        if (!stepaActive) return;
        const botMove = stepaFindBestMove();
        if (botMove >= 0) {
            stepaBoard[botMove] = 'O';
            stepaRenderTtt();
            stepaBotSay.textContent = 'Степаша: я сходил';
            const w = stepaCheckWin(stepaBoard);
            if (w) {
                stepaActive = false;
                if (w==='O') { stepaResult.textContent='Степаша победил'; stepaPhrase.textContent='бурмалда!'; }
                else { stepaResult.textContent='ничья'; stepaPhrase.textContent='ничья'; }
            } else if (!stepaBoard.includes('')) {
                stepaActive = false;
                stepaResult.textContent='ничья'; stepaPhrase.textContent='ничья';
            }
        }
    }, 300);
}

function stepaCreatePos() {
    const pos = [];
    for (let r=0; r<8; r++) {
        pos[r] = [];
        for (let c=0; c<8; c++) {
            if ((r+c)%2 === 1) {
                if (r<3) pos[r][c] = 'b';
                else if (r>4) pos[r][c] = 'w';
                else pos[r][c] = '';
            } else pos[r][c] = '';
        }
    }
    return pos;
}

function stepaClone(pos) { return pos.map(function(row) { return row.slice(); }); }

function stepaGetCaptures(pos, row, col) {
    const piece = pos[row][col];
    if (!piece) return [];
    const isWhite = piece === 'w' || piece === 'W';
    const isKing = piece === 'W' || piece === 'B';
    const caps = [];
    const dirs = isKing ? [[-1,-1],[-1,1],[1,-1],[1,1]] : [[isWhite?-1:1,-1],[isWhite?-1:1,1]];
    for (const [dr,dc] of dirs) {
        if (!isKing) {
            const r=row+dr,c=col+dc;
            if (r>=0&&r<8&&c>=0&&c<8&&pos[r][c]) {
                const tw=pos[r][c]==='w'||pos[r][c]==='W';
                if(isWhite!==tw){const r2=r+dr,c2=c+dc;if(r2>=0&&r2<8&&c2>=0&&c2<8&&!pos[r2][c2]) caps.push({row:r2,col:c2,captures:[{row:r,col:c}]});}
            }
        } else {
            for (let i=1; i<8; i++) {
                const r=row+dr*i,c=col+dc*i;
                if(r<0||r>=8||c<0||c>=8) break;
                if(pos[r][c]){const tw=pos[r][c]==='w'||pos[r][c]==='W'; if(isWhite!==tw){const r2=r+dr,c2=c+dc;if(r2>=0&&r2<8&&c2>=0&&c2<8&&!pos[r2][c2]) caps.push({row:r2,col:c2,captures:[{row:r,col:c}]});} break; }
            }
        }
    }
    return caps;
}

function stepaGetMoves(pos, row, col) {
    const piece = pos[row][col];
    if (!piece) return [];
    const isWhite = piece === 'w' || piece === 'W';
    const isKing = piece === 'W' || piece === 'B';
    const caps = stepaGetCaptures(pos, row, col);
    if (caps.length > 0) return caps;
    const moves = [];
    const dirs = isKing ? [[-1,-1],[-1,1],[1,-1],[1,1]] : [[isWhite?-1:1,-1],[isWhite?-1:1,1]];
    for (const [dr,dc] of dirs) {
        if (!isKing) {
            const r=row+dr,c=col+dc;
            if(r>=0&&r<8&&c>=0&&c<8&&!pos[r][c]) moves.push({row:r,col:c,captures:[]});
        } else {
            for (let i=1; i<8; i++) {
                const r=row+dr*i,c=col+dc*i;
                if(r<0||r>=8||c<0||c>=8) break;
                if(!pos[r][c]) moves.push({row:r,col:c,captures:[]});
                else break;
            }
        }
    }
    return moves;
}

function stepaAllMoves(pos, isWhite) {
    const all = []; let hasCaps = false;
    for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
        const p = pos[r][c];
        if (!p || (p==='w'||p==='W') !== isWhite) continue;
        const m = stepaGetMoves(pos, r, c);
        for (const mv of m) { if (mv.captures.length>0) hasCaps = true; all.push({fromRow:r,fromCol:c,toRow:mv.row,toCol:mv.col,captures:mv.captures}); }
    }
    if (hasCaps) return all.filter(function(m) { return m.captures.length > 0; });
    return all;
}

function stepaMakeMove(pos, move) {
    const np = stepaClone(pos);
    const piece = np[move.fromRow][move.fromCol];
    np[move.toRow][move.toCol] = piece;
    np[move.fromRow][move.fromCol] = '';
    move.captures.forEach(function(cap) { np[cap.row][cap.col] = ''; });
    if (piece==='w' && move.toRow===0) np[move.toRow][move.toCol] = 'W';
    if (piece==='b' && move.toRow===7) np[move.toRow][move.toCol] = 'B';
    return np;
}

function stepaHasMoreCaps(pos, row, col) { return stepaGetCaptures(pos, row, col).length > 0; }

function stepaEval(pos) {
    let score = 0;
    for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
        const p = pos[r][c];
        if (p==='w') score += 10;
        if (p==='W') score += 30;
        if (p==='b') score -= 10;
        if (p==='B') score -= 30;
    }
    return score;
}

function stepaMinimaxCheckers(pos, depth, isMax, alpha, beta) {
    if (depth===0) return stepaEval(pos);
    const moves = stepaAllMoves(pos, isMax);
    if (moves.length===0) return isMax ? -9999 : 9999;
    if (isMax) {
        let best = -99999;
        for (const m of moves) { const np = stepaMakeMove(pos, m); best = Math.max(best, stepaMinimaxCheckers(np, depth-1, false, alpha, beta)); alpha = Math.max(alpha, best); if (beta <= alpha) break; }
        return best;
    } else {
        let best = 99999;
        for (const m of moves) { const np = stepaMakeMove(pos, m); best = Math.min(best, stepaMinimaxCheckers(np, depth-1, true, alpha, beta)); beta = Math.min(beta, best); if (beta <= alpha) break; }
        return best;
    }
}

function stepaFindBestCheckers(pos) {
    const botIsWhite = stepaBotColor === 'white';
    const moves = stepaAllMoves(pos, botIsWhite);
    if (moves.length===0) return null;
    let depth = 1;
    if (stepaDifficulty === 'medium') depth = 3;
    if (stepaDifficulty === 'hard') depth = 5;
    let best = moves[0], bestScore = botIsWhite ? -99999 : 99999;
    for (const m of moves) {
        const np = stepaMakeMove(pos, m);
        const score = stepaMinimaxCheckers(np, depth-1, !botIsWhite, -99999, 99999);
        if (botIsWhite) { if (score > bestScore) { bestScore = score; best = m; } } else { if (score < bestScore) { bestScore = score; best = m; } }
    }
    return best;
}

function stepaBotCheckers() {
    if (stepaGameOver) return;
    const move = stepaFindBestCheckers(stepaPos);
    if (move) {
        stepaPos = stepaMakeMove(stepaPos, move);
        stepaBotSay.textContent = 'Степаша: я сходил';
    }
    stepaTurn = stepaPlayerColor;
    stepaRenderCheckers();
    const playerIsWhite = stepaPlayerColor === 'white';
    if (stepaAllMoves(stepaPos, playerIsWhite).length === 0) {
        stepaGameOver = true;
        stepaResult.textContent = 'Степаша победил';
        stepaPhrase.textContent = 'бурмалда!';
    }
}

function stepaRenderCheckers() {
    const board = document.getElementById('stepaCheckersBoard');
    board.innerHTML = '';
    for (let r=0; r<8; r++) for (let c=0; c<8; c++) {
        const btn = document.createElement('button');
        btn.className = (r+c)%2 === 0 ? 'white-cell' : 'black-cell';
        const p = stepaPos[r][c];
        if (p) {
            const img = document.createElement('img');
            img.src = STEPA_WHITE_PIECE;
            img.className = 'stepa-piece-img';
            if (p === 'w' || p === 'W') img.style.filter = 'none';
            else img.style.filter = 'invert(1)';
            btn.appendChild(img);
            if (p === 'W' || p === 'B') { const l=document.createElement('span'); l.textContent='Д'; l.style.position='absolute'; l.style.fontSize='0.5rem'; l.style.color=p==='W'?'#000':'#fff'; l.style.fontWeight='bold'; l.style.pointerEvents='none'; btn.appendChild(l); }
        }
        if (stepaChain.length>0) { const lp=stepaChain[stepaChain.length-1]; if(stepaGetCaptures(stepaPos,lp.row,lp.col).find(function(m){return m.row===r&&m.col===c;})) btn.classList.add('capture-hint'); }
        if (stepaSelected && stepaSelected.row===r && stepaSelected.col===c) btn.classList.add('selected');
        btn.onclick = function() { stepaCheckersClick(r,c); };
        board.appendChild(btn);
    }
}

function stepaCheckersClick(row, col) {
    if (stepaGameOver || stepaTurn !== stepaPlayerColor) return;
    const isPlayerWhite = stepaPlayerColor === 'white';
    if (stepaChain.length>0) {
        const lp = stepaChain[stepaChain.length-1];
        const caps = stepaGetCaptures(stepaPos, lp.row, lp.col);
        const valid = caps.find(function(m) { return m.row===row && m.col===col; });
        if (valid) {
            stepaPos = stepaMakeMove(stepaPos, {fromRow:lp.row,fromCol:lp.col,toRow:row,toCol:col,captures:valid.captures||[]});
            stepaChain.push({row,col});
            if (stepaHasMoreCaps(stepaPos, row, col)) {
                clearTimeout(stepaChainTimer);
                stepaChainTimer = setTimeout(function() { stepaChain=[]; stepaTurn=stepaPlayerColor==='white'?'black':'white'; stepaRenderCheckers(); if(stepaTurn!==stepaPlayerColor) setTimeout(stepaBotCheckers,200); }, 4000);
                stepaSelected = null; stepaRenderCheckers();
            } else { clearTimeout(stepaChainTimer); stepaChain=[]; stepaTurn=stepaBotColor; stepaSelected=null; stepaRenderCheckers(); if(stepaTurn!==stepaPlayerColor) setTimeout(stepaBotCheckers,200); }
        }
        return;
    }
    if (stepaSelected) {
        const p = stepaPos[stepaSelected.row][stepaSelected.col];
        if (p && (p==='w'||p==='W') === isPlayerWhite) {
            const moves = stepaGetMoves(stepaPos, stepaSelected.row, stepaSelected.col);
            const valid = moves.find(function(m) { return m.row===row && m.col===col; });
            if (valid) {
                stepaPos = stepaMakeMove(stepaPos, {fromRow:stepaSelected.row,fromCol:stepaSelected.col,toRow:row,toCol:col,captures:valid.captures||[]});
                if (valid.captures && valid.captures.length>0 && stepaHasMoreCaps(stepaPos,row,col)) {
                    stepaChain=[{row,col}];
                    clearTimeout(stepaChainTimer);
                    stepaChainTimer = setTimeout(function() { stepaChain=[]; stepaTurn=stepaPlayerColor==='white'?'black':'white'; stepaRenderCheckers(); if(stepaTurn!==stepaPlayerColor) setTimeout(stepaBotCheckers,200); }, 4000);
                    stepaSelected=null; stepaRenderCheckers(); return;
                }
                stepaSelected=null; stepaTurn=stepaBotColor; stepaRenderCheckers(); if(stepaTurn!==stepaPlayerColor) setTimeout(stepaBotCheckers,200);
                return;
            }
        }
        stepaSelected=null;
    }
    const p = stepaPos[row][col];
    if (p && (p==='w'||p==='W') === isPlayerWhite) stepaSelected = {row,col};
    stepaRenderCheckers();
}

document.querySelectorAll('.stepa-game-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.stepa-game-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        stepaGame = btn.dataset.stepaGame;
        document.getElementById('stepaRps').style.display = stepaGame === 'rps' ? 'block' : 'none';
        document.getElementById('stepaTtt').style.display = stepaGame === 'ttt' ? 'block' : 'none';
        document.getElementById('stepaCheckers').style.display = stepaGame === 'checkers' ? 'block' : 'none';
        stepaResetAll();
    });
});

stepaReset.addEventListener('click', stepaResetAll);
document.getElementById('stepaColor').addEventListener('change', stepaResetAll);
document.getElementById('stepaDifficulty').addEventListener('change', function() { stepaDifficulty = this.value; stepaResetAll(); });

function stepaUpdateColors() {
    stepaPlayerColor = document.getElementById('stepaColor').value;
    stepaBotColor = stepaPlayerColor === 'white' ? 'black' : 'white';
}

function stepaResetAll() {
    clearTimeout(stepaChainTimer);
    stepaChain = [];
    stepaUpdateColors();
    stepaPhrase.textContent = 'бурмалда';
    if (stepaGame === 'rps') {
        stepaBotSay.textContent = 'Степаша: жду';
        stepaResult.textContent = 'сделай выбор';
    } else if (stepaGame === 'ttt') {
        stepaBoard = ['','','','','','','','',''];
        stepaActive = true;
        stepaRenderTtt();
        stepaBotSay.textContent = 'Степаша: твой ход';
        stepaResult.textContent = 'крестики нолики';
    } else if (stepaGame === 'checkers') {
        stepaDifficulty = document.getElementById('stepaDifficulty').value;
        stepaPos = stepaCreatePos();
        stepaSelected = null;
        stepaTurn = 'white';
        stepaGameOver = false;
        stepaRenderCheckers();
        if (stepaPlayerColor === 'white') {
            stepaBotSay.textContent = 'Степаша: твой ход (белые)';
        } else {
            stepaBotSay.textContent = 'Степаша: я хожу (белые)';
            setTimeout(stepaBotCheckers, 500);
        }
        stepaResult.textContent = 'шашки';
    }
}

stepaResetAll();

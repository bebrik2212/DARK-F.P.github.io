const firebaseConfig = { ... };
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
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

const ADMIN_NICKNAMES = ['amamammellstroy67'];
const DEFAULT_AVATAR = 'https://i.pinimg.com/236x/ca/32/a0/ca32a08ba5cdefbffa115c6cced9f519.jpg';
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

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
const friendsList = document.getElementById('friendsList');
const addFriendBtn = document.getElementById('addFriendBtn');
const chatModal = document.getElementById('chatModal');
const chatFriendName = document.getElementById('chatFriendName');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');
const closeChatBtn = document.getElementById('closeChatBtn');
const searchUsersTab = document.getElementById('searchUsersTab');
const searchPostsTab = document.getElementById('searchPostsTab');

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
            updateNotifCount();
        }, (error) => {
            console.error('Ошибка подписки:', error);
            postsListFeedEl.innerHTML = `
                <div class="empty-posts" style="padding:60px 20px;text-align:center;color:#8d9098;line-height:2;">
                    <div style="font-size:48px;margin-bottom:12px;">⚠️</div>
                    <div>ОШИБКА ПОДКЛЮЧЕНИЯ</div>
                    <div style="font-size:0.85rem;color:#5a5d66;">${error.message}</div>
                    <button onclick="location.reload()" style="margin-top:12px;padding:8px 20px;background:#5b8cd6;border:none;border-radius:4px;color:white;cursor:pointer;">ПОВТОРИТЬ</button>
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
    const sorted = [...allPosts].sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
        return dateB - dateA;
    });

    if (sorted.length) {
        postsListFeedEl.innerHTML = sorted.map(p => renderPostCard(p)).join('');
    } else {
        postsListFeedEl.innerHTML = `
            <div class="empty-posts" style="padding:60px 20px;text-align:center;color:#8d9098;line-height:2;">
                <div style="font-size:48px;margin-bottom:12px;">📡</div>
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
    const isAdmin = ADMIN_NICKNAMES.includes(currentProfile?.nickname);
    const canDelete = isMine || isAdmin;
    
    const deleteBtn = canDelete ? `
        <button class="delete-post-btn" data-delete="${post.id}" type="button">X</button>
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
                    ❤️ ${post.likes || 0}
                </button>
                <button class="vote-btn ${myVote === -1 ? 'disliked' : ''}" data-vote="-1" data-id="${post.id}">
                    👎 ${post.dislikes || 0}
                </button>
                <button class="comment-btn" data-toggle="${post.id}" type="button">
                    💬 ${comments.length}
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
            
            html += `
                <div class="search-result-item" data-id="${doc.id}">
                    <img class="search-result-avatar" src="${data.avatarData || DEFAULT_AVATAR}">
                    <div class="search-result-info">
                        <div class="search-result-nick">${escapeHtml(data.nickname || 'АНОНИМ')}</div>
                        <div class="search-result-status ${data.online ? 'online' : ''}">
                            ${data.online ? 'В СЕТИ' : 'ОФФЛАЙН'}
                            ${isSelf ? ' (ЭТО ВЫ)' : ''}
                            ${isFriend ? ' ДРУГ' : ''}
                        </div>
                    </div>
                    ${!isSelf ? `
                        <button class="btn" data-add-friend="${doc.id}" style="font-size:9px;padding:2px 8px;">
                            ${isFriend ? 'УДАЛИТЬ' : 'ДОБАВИТЬ'}
                        </button>
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
    if (searchMode === 'users') {
        searchUsers(query);
    } else {
        searchPosts(query);
    }
}

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
                            <button class="chat-friend" data-chat="${friendId}">💬</button>
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

function openChat(userId, userNickname) {
    chatWith = userId;
    chatFriendName.textContent = userNickname || 'ДРУГ';
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
        setActiveTab('tabFeed', 'feedSection');
    } catch (e) {
        showToast(e.message, true);
    } finally {
        this.disabled = false;
        this.textContent = 'ОПУБЛИКОВАТЬ';
    }
});

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

    const addFriendBtn = e.target.closest('[data-add-friend]');
    if (addFriendBtn) {
        const userId = addFriendBtn.dataset.addFriend;
        const isFriend = currentProfile?.friends?.includes(userId);
        if (isFriend) {
            removeFriend(userId);
        } else {
            addFriend(userId);
        }
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
        setActiveTab('tabFeed', 'feedSection');
        setTimeout(() => {
            const postEl = document.querySelector(`.post-card[data-id="${postId}"]`);
            if (postEl) {
                postEl.scrollIntoView({ behavior: 'smooth' });
                postEl.style.borderColor = 'var(--accent)';
                setTimeout(() => {
                    postEl.style.borderColor = '';
                }, 3000);
            }
        }, 100);
        return;
    }
});

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

searchInput.addEventListener('input', function() {
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
        performSearch(this.value);
    }, 300);
});

searchUsersTab.addEventListener('click', function() {
    searchMode = 'users';
    searchUsersTab.classList.add('active');
    searchPostsTab.classList.remove('active');
    searchInput.placeholder = 'ВВЕДИТЕ НИК ПОЛЬЗОВАТЕЛЯ...';
    performSearch(searchInput.value);
});

searchPostsTab.addEventListener('click', function() {
    searchMode = 'posts';
    searchPostsTab.classList.add('active');
    searchUsersTab.classList.remove('active');
    searchInput.placeholder = 'ВВЕДИТЕ ТЕКСТ ДЛЯ ПОИСКА...';
    performSearch(searchInput.value);
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

    if (sectionId === 'friendsSection') {
        loadFriends();
    }
    if (sectionId === 'searchSection') {
        performSearch(searchInput.value);
    }
}

document.getElementById('tabFeed').addEventListener('click', () => setActiveTab('tabFeed', 'feedSection'));
document.getElementById('tabSearch').addEventListener('click', () => setActiveTab('tabSearch', 'searchSection'));
document.getElementById('tabFriends').addEventListener('click', () => setActiveTab('tabFriends', 'friendsSection'));
document.getElementById('tabCreate').addEventListener('click', () => setActiveTab('tabCreate', 'createSection'));
document.getElementById('tabProfile').addEventListener('click', () => setActiveTab('tabProfile', 'profileSection'));

addFriendBtn.addEventListener('click', function() {
    setActiveTab('tabSearch', 'searchSection');
    searchMode = 'users';
    searchUsersTab.classList.add('active');
    searchPostsTab.classList.remove('active');
    searchInput.placeholder = 'ВВЕДИТЕ НИК ПОЛЬЗОВАТЕЛЯ...';
    searchInput.focus();
});

sendChatBtn.addEventListener('click', () => {
    sendMessage(chatInput.value);
});

closeChatBtn.addEventListener('click', closeChat);

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && chatModal.classList.contains('open')) {
        closeChat();
    }
});

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
                <button onclick="location.reload()" style="margin-top:12px;padding:8px 20px;background:#5b8cd6;border:none;border-radius:4px;color:white;cursor:pointer;">ПОВТОРИТЬ</button>
            </div>
        `;
    }
}

document.addEventListener('DOMContentLoaded', init);

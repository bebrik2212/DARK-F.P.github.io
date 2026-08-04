// ============================================================
// DARK FORT - FIREBASE
// ============================================================

// ============================================================
// 🔥 ВАШ КОНФИГ FIREBASE
// ============================================================

const firebaseConfig = {
    apiKey: "AIzaSyBa9NWi5FfpmAx0ExJh1fJ3b1ipUEEBRxU",
    authDomain: "dark-fortport.firebaseapp.com",
    projectId: "dark-fortport",
    storageBucket: "dark-fortport.firebasestorage.app",
    messagingSenderId: "3814531503",
    appId: "1:3814531503:web:a8200e1f337935a3530f5a",
    measurementId: "G-KF9GGGL43L"
};

// ============================================================
// ИНИЦИАЛИЗАЦИЯ FIREBASE
// ============================================================

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ============================================================
// КОНСТАНТЫ
// ============================================================

const DEFAULT_AVATAR = 'https://i.pinimg.com/236x/ca/32/a0/ca32a08ba5cdefbffa115c6cced9f519.jpg';
const MAX_FILE_SIZE = 67 * 1024 * 1024;
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

// --- ID ПОЛЬЗОВАТЕЛЯ (анонимный) ---
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
// РАБОТА С ПРОФИЛЕМ
// ============================================================

async function getOrCreateProfile() {
    try {
        const doc = await db.collection('profiles').doc(profileId).get();
        if (doc.exists) {
            currentProfile = { id: profileId, ...doc.data() };
            return currentProfile;
        }
    } catch (error) {
        console.warn('Ошибка получения профиля:', error);
    }

    // Создаём новый профиль
    const newProfile = {
        nickname: '',
        avatarData: DEFAULT_AVATAR,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        await db.collection('profiles').doc(profileId).set(newProfile);
        currentProfile = { id: profileId, ...newProfile };
        return currentProfile;
    } catch (error) {
        console.warn('Ошибка создания профиля:', error);
        return null;
    }
}

async function saveProfile(nickname, avatarData) {
    if (!currentProfile) await getOrCreateProfile();
    if (!currentProfile) return false;

    // Проверка занятости ника
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
    updateData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    try {
        await db.collection('profiles').doc(profileId).update(updateData);
        Object.assign(currentProfile, updateData);
        nicknameInput.classList.remove('error');
        nickErrorMsg.classList.remove('visible');
        updateUI();
        return true;
    } catch (error) {
        console.warn('Ошибка обновления профиля:', error);
        return false;
    }
}

// ============================================================
// РАБОТА С ПОСТАМИ
// ============================================================

function subscribeToPosts() {
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
            renderAllPosts();
            updateNotifCount();
        }, (error) => {
            console.warn('Ошибка подписки на посты:', error);
            showToast('ОШИБКА ЗАГРУЗКИ ПОСТОВ', true);
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
        console.warn('Ошибка создания поста:', error);
        showToast('ОШИБКА ПУБЛИКАЦИИ', true);
        return false;
    }
}

async function deletePost(postId) {
    try {
        const doc = await db.collection('posts').doc(postId).get();
        if (!doc.exists) return false;
        const data = doc.data();
        if (data.authorId !== profileId) {
            showToast('НЕ ВАШ ПОСТ', true);
            return false;
        }
        await db.collection('posts').doc(postId).delete();
        showToast('ПОСТ УДАЛЁН');
        return true;
    } catch (error) {
        console.warn('Ошибка удаления поста:', error);
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

        await docRef.update({
            likes: likes,
            dislikes: dislikes,
            votes: votes
        });
        return true;
    } catch (error) {
        console.warn('Ошибка голосования:', error);
        showToast('ОШИБКА ГОЛОСОВАНИЯ', true);
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

        await docRef.update({ comments: comments });
        return true;
    } catch (error) {
        console.warn('Ошибка добавления комментария:', error);
        showToast('ОШИБКА КОММЕНТАРИЯ', true);
        return false;
    }
}

// ============================================================
// UI ФУНКЦИИ
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
    const sorted = [...allPosts];

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

    return `
        <div class="post-card" data-id="${post.id}">
            <div class="post-header">
                <img class="post-avatar" src="${post.authorAvatar || DEFAULT_AVATAR}">
                <span class="post-nick">${escapeHtml(post.authorName || 'АНОНИМ')}</span>
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
// СОБЫТИЯ
// ============================================================

// Никнейм
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

// Аватар
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

// Медиа
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

// Публикация
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

// Enter для комментариев
document.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter' || e.shiftKey || !e.target.classList.contains('comment-input')) return;
    e.preventDefault();
    const btn = e.target.closest('.comment-input-row')?.querySelector('[data-comment]');
    if (btn) btn.click();
});

// Уведомления
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

// Вкладки
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
        // Получаем профиль
        await getOrCreateProfile();
        updateProfileUI();

        // Подписываемся на посты
        subscribeToPosts();

        if (!currentProfile?.nickname) {
            nicknameInput.focus();
        }

        console.log('🔥 DARK FORT ONLINE');
        console.log('👤 ID:', profileId);
        console.log('📦 FIREBASE CONNECTED');

    } catch (error) {
        console.error('Ошибка инициализации:', error);
        showToast('ОШИБКА ПОДКЛЮЧЕНИЯ К FIREBASE', true);
    }
}

init();

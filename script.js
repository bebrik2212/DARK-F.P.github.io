// ============================================================
// DARK FORT - СОЦИАЛЬНАЯ СЕТЬ
// ВСЕ ПОСТЫ ОБЩИЕ, АНОНИМНО (ТОЛЬКО НИК И АВАТАР)
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

let currentProfile = null;
let allPosts = [];
let pendingMedia = [];
let saveTimer = 0;
let notifOpen = false;
const openComments = new Set();

// --- DOM ---
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

// --- РАБОТА С ДАННЫМИ ---

function getData() {
    try {
        const raw = localStorage.getItem('df_data');
        if (raw) {
            const data = JSON.parse(raw);
            if (!data.posts) data.posts = [];
            if (!data.profiles) data.profiles = {};
            if (!data.notifs) data.notifs = [];
            return data;
        }
    } catch (e) {}
    return { posts: [], profiles: {}, notifs: [] };
}

function saveData(data) {
    try {
        localStorage.setItem('df_data', JSON.stringify(data));
        // Синхронизация между вкладками
        try {
            const ch = new BroadcastChannel('df_channel');
            ch.postMessage({ type: 'update' });
            ch.close();
        } catch (e) {}
    } catch (e) {}
}

// --- ЗАГРУЗКА ДАННЫХ ---

function loadData() {
    const data = getData();
    
    // Профиль
    if (data.profiles[profileId]) {
        currentProfile = data.profiles[profileId];
    } else {
        data.profiles[profileId] = {
            nickname: '',
            avatarData: DEFAULT_AVATAR,
            created: new Date().toISOString()
        };
        saveData(data);
        currentProfile = data.profiles[profileId];
    }
    
    // Посты с данными авторов
    allPosts = data.posts.map(p => {
        const author = data.profiles[p.authorId];
        return {
            ...p,
            authorName: author?.nickname || 'АНОНИМ',
            authorAvatar: author?.avatarData || DEFAULT_AVATAR,
        };
    });
    
    updateUI();
}

// --- ОБНОВЛЕНИЕ UI ---

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
    
    // Лента
    if (sorted.length) {
        postsListFeedEl.innerHTML = sorted.map(p => renderPostCard(p)).join('');
    } else {
        postsListFeedEl.innerHTML = '<div class="empty-posts">ПОКА НЕТ ПОСТОВ</div>';
    }
    
    // Мои посты
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
    const data = getData();
    const commentsHTML = comments.map(c => {
        const author = data.profiles[c.authorId];
        return `
            <div class="comment">
                <img class="comment-avatar" src="${author?.avatarData || DEFAULT_AVATAR}">
                <div class="comment-content">
                    <span class="comment-nick">${escapeHtml(author?.nickname || 'АНОНИМ')}</span>
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
    const data = getData();
    const count = data.notifs?.filter(n => !n.read).length || 0;
    notifCountEl.textContent = count;
    notifCountEl.classList.toggle('visible', count > 0);
}

function renderNotifications() {
    const data = getData();
    const notifs = data.notifs || [];
    if (notifs.length) {
        notificationPanelEl.innerHTML = notifs.map(n => `
            <div class="notif-item">${escapeHtml(n.message)}<span class="notif-time">${formatDate(n.createdAt)}</span></div>
        `).join('');
    } else {
        notificationPanelEl.innerHTML = '<div class="notif-item">НЕТ УВЕДОМЛЕНИЙ</div>';
    }
}

// --- ВСПОМОГАТЕЛЬНЫЕ ---

function escapeHtml(v) {
    const d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
}

function formatDate(v) {
    if (!v) return '';
    try {
        return new Intl.DateTimeFormat('ru-RU', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        }).format(new Date(v));
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

function genId() {
    return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

// --- ПРОФИЛЬ ---

function saveProfile(nick, avatar) {
    const data = getData();
    
    const taken = Object.keys(data.profiles).some(id =>
        id !== profileId && data.profiles[id]?.nickname?.toLowerCase() === nick.toLowerCase()
    );
    
    if (taken && nick) {
        nicknameInput.classList.add('error');
        nickErrorMsg.classList.add('visible');
        return false;
    }
    
    if (!data.profiles[profileId]) {
        data.profiles[profileId] = {};
    }
    
    if (nick) data.profiles[profileId].nickname = nick;
    if (avatar) data.profiles[profileId].avatarData = avatar;
    data.profiles[profileId].updated = new Date().toISOString();
    
    saveData(data);
    currentProfile = data.profiles[profileId];
    
    nicknameInput.classList.remove('error');
    nickErrorMsg.classList.remove('visible');
    
    updateUI();
    return true;
}

// --- ПОСТЫ ---

function createPost(text, media) {
    const data = getData();
    
    if (!currentProfile?.nickname) {
        showToast('СНАЧАЛА УСТАНОВИТЕ НИК', true);
        return false;
    }
    
    const post = {
        id: genId(),
        authorId: profileId,
        text: text || '',
        media: media || [],
        likes: 0,
        dislikes: 0,
        votes: {},
        comments: [],
        createdAt: new Date().toISOString()
    };
    
    data.posts.unshift(post);
    saveData(data);
    loadData();
    showToast('ПОСТ ОПУБЛИКОВАН');
    return true;
}

function deletePost(id) {
    const data = getData();
    const idx = data.posts.findIndex(p => p.id === id);
    if (idx === -1) return false;
    if (data.posts[idx].authorId !== profileId) {
        showToast('НЕ ВАШ ПОСТ', true);
        return false;
    }
    data.posts.splice(idx, 1);
    saveData(data);
    loadData();
    showToast('ПОСТ УДАЛЁН');
    return true;
}

function votePost(id, val) {
    const data = getData();
    const post = data.posts.find(p => p.id === id);
    if (!post) return false;
    
    const cur = post.votes?.[profileId] || 0;
    
    if (cur === val) {
        delete post.votes[profileId];
        if (val === 1) post.likes--;
        else post.dislikes--;
    } else {
        if (cur === 1) post.likes--;
        else if (cur === -1) post.dislikes--;
        
        if (!post.votes) post.votes = {};
        post.votes[profileId] = val;
        if (val === 1) post.likes++;
        else post.dislikes++;
    }
    
    saveData(data);
    loadData();
    return true;
}

function addComment(postId, text) {
    const data = getData();
    const post = data.posts.find(p => p.id === postId);
    if (!post) return false;
    
    if (!currentProfile?.nickname) {
        showToast('СНАЧАЛА УСТАНОВИТЕ НИК', true);
        return false;
    }
    
    if (!post.comments) post.comments = [];
    post.comments.push({
        id: genId(),
        authorId: profileId,
        text: text,
        createdAt: new Date().toISOString()
    });
    
    saveData(data);
    loadData();
    return true;
}

// --- СОБЫТИЯ ---

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
    saveTimer = setTimeout(() => saveProfile(nick), 400);
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
        
        createPost(text, media);
        
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

// --- КЛИКИ ---

document.addEventListener('click', function(e) {
    // Голоса
    const voteBtn = e.target.closest('[data-vote]');
    if (voteBtn) {
        if (!currentProfile?.nickname) {
            showToast('СНАЧАЛА УСТАНОВИТЕ НИК', true);
            return;
        }
        votePost(voteBtn.dataset.id, Number(voteBtn.dataset.vote));
        return;
    }
    
    // Комментарии
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
    
    // Удаление
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
        const data = getData();
        if (data.notifs) {
            data.notifs.forEach(n => { n.read = true; });
            saveData(data);
            updateNotifCount();
        }
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

// --- СИНХРОНИЗАЦИЯ МЕЖДУ ВКЛАДКАМИ ---

function initSync() {
    try {
        const ch = new BroadcastChannel('df_channel');
        ch.onmessage = function(e) {
            if (e.data?.type === 'update') loadData();
        };
    } catch (e) {}
}

// --- ДЕМО-ПОСТЫ ---

function addDemoPosts() {
    const data = getData();
    if (data.posts.length > 0) return;
    
    if (!data.profiles['demo']) {
        data.profiles['demo'] = {
            nickname: 'DARK FORT',
            avatarData: DEFAULT_AVATAR,
            created: new Date().toISOString()
        };
    }
    
    data.posts = [
        {
            id: genId(),
            authorId: 'demo',
            text: 'DARK FORT PORT АКТИВИРОВАН.\nАНОНИМНАЯ СЕТЬ ГОТОВА К РАБОТЕ.\nУСТАНОВИТЕ СВОЙ НИК И АВАТАР.',
            media: [],
            likes: 2,
            dislikes: 0,
            votes: {},
            comments: [
                {
                    id: genId(),
                    authorId: profileId,
                    text: 'ПОДКЛЮЧЁН',
                    createdAt: new Date(Date.now() - 60000).toISOString()
                }
            ],
            createdAt: new Date(Date.now() - 120000).toISOString()
        }
    ];
    
    saveData(data);
}

// --- ЗАПУСК ---

function init() {
    addDemoPosts();
    initSync();
    loadData();
    
    if (!currentProfile?.nickname) {
        nicknameInput.focus();
    }
    
    setInterval(loadData, 10000);
    
    console.log('DARK FORT PORT ONLINE');
    console.log('ID:', profileId);
}

init();

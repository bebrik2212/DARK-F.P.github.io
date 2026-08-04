// ============================================================
// АНОНИМНАЯ СОЦИАЛЬНАЯ СЕТЬ - ТОЛЬКО LOCALSTORAGE
// НИКАКИХ FETCH ЗАПРОСОВ! РАБОТАЕТ МГНОВЕННО!
// ============================================================

const DEFAULT_AVATAR = 'https://i.pinimg.com/236x/ca/32/a0/ca32a08ba5cdefbffa115c6cced9f519.jpg';
const MAX_FILE_SIZE = 67 * 1024 * 1024;
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

// --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
let profileId = localStorage.getItem('anon_profile_id');
if (!profileId) {
    profileId = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    localStorage.setItem('anon_profile_id', profileId);
}

let currentProfile = null;
let allPosts = [];
let pendingMedia = [];
let profileSaveTimer = 0;
let notificationPanelOpen = false;
const openComments = new Set();

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

// --- РАБОТА С ДАННЫМИ ---

function getData() {
    try {
        const raw = localStorage.getItem('anon_social_data');
        if (raw) {
            const data = JSON.parse(raw);
            if (!data.posts) data.posts = [];
            if (!data.profiles) data.profiles = {};
            if (!data.notifications) data.notifications = [];
            return data;
        }
    } catch (e) {
        console.warn('Ошибка чтения данных:', e);
    }
    return { posts: [], profiles: {}, notifications: [] };
}

function saveData(data) {
    try {
        localStorage.setItem('anon_social_data', JSON.stringify(data));
        // Уведомляем другие вкладки
        try {
            const channel = new BroadcastChannel('social_channel');
            channel.postMessage({ type: 'update' });
            channel.close();
        } catch (e) {}
    } catch (e) {
        console.warn('Ошибка сохранения:', e);
    }
}

// --- ЗАГРУЗКА ДАННЫХ ---

function loadData() {
    const data = getData();
    
    // Загружаем профиль
    if (data.profiles[profileId]) {
        currentProfile = data.profiles[profileId];
    } else {
        data.profiles[profileId] = {
            nickname: '',
            avatarData: DEFAULT_AVATAR,
            createdAt: new Date().toISOString()
        };
        saveData(data);
        currentProfile = data.profiles[profileId];
    }
    
    // Загружаем посты с данными авторов
    allPosts = data.posts.map(post => {
        const authorProfile = data.profiles[post.authorId];
        return {
            ...post,
            author: authorProfile?.nickname || 'Аноним',
            avatarData: authorProfile?.avatarData || DEFAULT_AVATAR,
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
    
    const nickname = document.activeElement === nicknameInput
        ? nicknameInput.value.trim()
        : (currentProfile.nickname || '');
    
    if (document.activeElement !== nicknameInput) {
        nicknameInput.value = nickname;
    }
    profileNicknameEl.textContent = nickname || 'Без имени';
    
    const avatarData = currentProfile.avatarData || DEFAULT_AVATAR;
    profileAvatarEl.src = avatarData;
    profileBigAvatarEl.src = avatarData;
}

function renderAllPosts() {
    const sorted = [...allPosts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Лента
    if (sorted.length) {
        postsListFeedEl.innerHTML = sorted.map(p => renderPostCard(p)).join('');
    } else {
        postsListFeedEl.innerHTML = `
            <div class="empty-posts" style="padding:60px 20px;text-align:center;color:#8d9098;">
                <div style="font-size:48px;margin-bottom:12px;">🌐</div>
                <div>Пока нет постов</div>
                <div style="font-size:0.85rem;margin-top:8px;color:#5a5d66;">Будьте первым!</div>
            </div>
        `;
    }
    
    // Мои посты
    const myPosts = sorted.filter(p => p.authorId === profileId);
    if (myPosts.length) {
        postsListProfileEl.innerHTML = myPosts.map(p => renderPostCard(p)).join('');
    } else {
        postsListProfileEl.innerHTML = '<div class="empty-posts" style="padding:40px 20px;text-align:center;color:#8d9098;">У вас пока нет постов</div>';
    }
}

function renderPostCard(post) {
    const isMine = post.authorId === profileId;
    const deleteButton = isMine ? `
        <button class="delete-post-btn" type="button" data-delete-post="${post.id}" title="Удалить" style="background:none;border:none;color:#73767e;cursor:pointer;padding:4px 8px;">
            ✕
        </button>` : '';
    
    // Медиа
    let mediaHTML = '';
    if (post.media && post.media.length) {
        mediaHTML = `<div class="post-media">${post.media.map(m => {
            if (m.type === 'video') {
                return `<video controls src="${m.data || ''}" style="width:100%;max-height:400px;background:#07080a;"></video>`;
            } else {
                return `<img src="${m.data || ''}" alt="media" loading="lazy" style="width:100%;max-height:400px;object-fit:contain;background:#07080a;">`;
            }
        }).join('')}</div>`;
    }
    
    // Комментарии
    const comments = post.comments || [];
    const data = getData();
    const commentsHTML = comments.map(c => {
        const authorProfile = data.profiles[c.authorId];
        return `
            <div class="comment" style="display:flex;gap:8px;padding:8px 0;border-bottom:1px solid #23252b;">
                <img class="comment-avatar" src="${authorProfile?.avatarData || DEFAULT_AVATAR}" alt="avatar" style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0;">
                <div style="min-width:0;">
                    <span style="font-weight:600;color:#c8c9ce;font-size:0.8rem;">${escapeHtml(authorProfile?.nickname || 'Аноним')}</span>
                    <div style="margin-top:2px;color:#d1d2d6;font-size:0.85rem;line-height:1.4;word-wrap:break-word;">${escapeHtml(c.text)}</div>
                </div>
            </div>
        `;
    }).join('');
    
    const isOpen = openComments.has(post.id);
    const viewerVote = post.votes?.[profileId] || 0;
    
    return `
        <article class="post-card" data-postid="${post.id}" style="border:1px solid #2a2c32;border-radius:9px;background:#131419;overflow:hidden;">
            <div class="post-header" style="display:flex;align-items:center;gap:9px;padding:10px;">
                <img class="post-avatar" src="${post.avatarData || DEFAULT_AVATAR}" alt="avatar" style="width:34px;height:34px;border-radius:50%;object-fit:cover;">
                <span class="post-nick" style="font-weight:600;color:#e8e9ec;font-size:0.86rem;">${escapeHtml(post.author) || 'Аноним'}</span>
                <time class="post-time" style="margin-left:auto;color:#777a83;font-size:0.66rem;">${formatDate(post.createdAt)}</time>
                ${deleteButton}
            </div>
            ${post.text ? `<div class="post-text" style="padding:2px 12px 12px;font-size:0.92rem;line-height:1.48;white-space:pre-wrap;word-wrap:break-word;">${escapeHtml(post.text)}</div>` : ''}
            ${mediaHTML}
            <div class="post-footer" style="display:flex;gap:6px;padding:8px 10px;border-top:1px solid #2a2c32;">
                <button class="vote-btn ${viewerVote === 1 ? 'liked' : ''}" type="button" data-postid="${post.id}" data-vote="1" style="display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border:none;border-radius:6px;background:transparent;color:#92959d;cursor:pointer;${viewerVote === 1 ? 'color:#67b7ff;' : ''}">
                    👍 ${post.likes || 0}
                </button>
                <button class="vote-btn ${viewerVote === -1 ? 'disliked' : ''}" type="button" data-postid="${post.id}" data-vote="-1" style="display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border:none;border-radius:6px;background:transparent;color:#92959d;cursor:pointer;${viewerVote === -1 ? 'color:#ff5353;' : ''}">
                    👎 ${post.dislikes || 0}
                </button>
                <button class="comment-btn" type="button" data-toggle-comments="${post.id}" style="display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border:none;border-radius:6px;background:transparent;color:#92959d;cursor:pointer;">
                    💬 ${comments.length}
                </button>
            </div>
            <div class="comments-section" id="comments-${post.id}" style="display:${isOpen ? 'block' : 'none'};padding:0 10px 10px;border-top:1px solid #2a2c32;">
                ${commentsHTML}
                <div class="comment-input-row" style="display:flex;gap:7px;padding-top:10px;">
                    <input class="comment-input" id="comment-input-${post.id}" maxlength="1000" placeholder="Напишите комментарий..." style="flex:1;min-width:0;height:34px;padding:0 9px;border:1px solid #2a2c32;border-radius:6px;background:#0c0d10;color:#f3f3f4;outline:none;">
                    <button class="btn add-comment-btn" type="button" data-add-comment="${post.id}" style="padding:4px 12px;border:1px solid #4b4e57;border-radius:6px;background:#eeeeef;color:#111216;font-weight:700;cursor:pointer;">▶</button>
                </div>
            </div>
        </article>
    `;
}

function updateNotifCount() {
    const data = getData();
    const count = data.notifications?.filter(n => !n.read).length || 0;
    notifCountEl.textContent = String(count);
    notifCountEl.style.display = count > 0 ? 'grid' : 'none';
}

function renderNotifications() {
    const data = getData();
    const notifications = data.notifications || [];
    if (notifications.length) {
        notificationPanelEl.innerHTML = notifications.map(n => `
            <div class="notif-item" style="padding:10px;border-bottom:1px solid #27292f;font-size:0.83rem;line-height:1.35;">
                ${escapeHtml(n.message)}
                <span style="display:block;margin-top:3px;color:#70737b;font-size:0.68rem;">${formatDate(n.createdAt)}</span>
            </div>
        `).join('');
    } else {
        notificationPanelEl.innerHTML = '<div class="notif-item" style="padding:10px;color:#8d9098;">Нет уведомлений</div>';
    }
}

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
}

function formatDate(value) {
    if (!value) return '';
    try {
        return new Intl.DateTimeFormat('ru-RU', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        }).format(new Date(value));
    } catch {
        return '';
    }
}

function showToast(message, isError = false) {
    const old = document.querySelector('.toast');
    if (old) old.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast${isError ? ' error' : ''}`;
    toast.textContent = message;
    toast.style.cssText = `
        position:fixed;z-index:50;right:18px;bottom:18px;
        max-width:360px;padding:11px 14px;
        border:1px solid ${isError ? '#6c3030' : '#34363e'};
        border-radius:8px;
        background:#191b20;
        color:${isError ? '#ffc6c6' : '#f3f3f4'};
        font-size:0.82rem;
        box-shadow:0 15px 45px rgba(0,0,0,0.45);
    `;
    document.body.append(toast);
    setTimeout(() => toast.remove(), 3200);
}

function generateId() {
    return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// --- СОХРАНЕНИЕ ПРОФИЛЯ ---

function saveProfile(nickname, avatarData) {
    const data = getData();
    
    // Проверка на занятость ника
    const taken = Object.keys(data.profiles).some(id => 
        id !== profileId && data.profiles[id]?.nickname?.toLowerCase() === nickname.toLowerCase()
    );
    
    if (taken && nickname) {
        nicknameInput.classList.add('error');
        nickErrorMsg.textContent = '❌ Этот ник уже занят!';
        nickErrorMsg.style.display = 'block';
        return false;
    }
    
    if (!data.profiles[profileId]) {
        data.profiles[profileId] = {};
    }
    
    if (nickname) data.profiles[profileId].nickname = nickname;
    if (avatarData) data.profiles[profileId].avatarData = avatarData;
    data.profiles[profileId].updatedAt = new Date().toISOString();
    
    saveData(data);
    currentProfile = data.profiles[profileId];
    
    nicknameInput.classList.remove('error');
    nickErrorMsg.style.display = 'none';
    
    updateUI();
    return true;
}

// --- ПОСТЫ ---

function createPost(text, mediaData) {
    const data = getData();
    
    if (!currentProfile?.nickname) {
        showToast('Сначала установите ник!', true);
        return false;
    }
    
    const post = {
        id: generateId(),
        authorId: profileId,
        text: text || '',
        media: mediaData || [],
        likes: 0,
        dislikes: 0,
        votes: {},
        comments: [],
        createdAt: new Date().toISOString()
    };
    
    data.posts.unshift(post);
    saveData(data);
    loadData();
    showToast('✅ Пост опубликован!');
    return true;
}

function deletePost(postId) {
    const data = getData();
    const index = data.posts.findIndex(p => p.id === postId);
    if (index === -1) return false;
    if (data.posts[index].authorId !== profileId) {
        showToast('Это не ваш пост', true);
        return false;
    }
    data.posts.splice(index, 1);
    saveData(data);
    loadData();
    showToast('🗑️ Пост удалён');
    return true;
}

function votePost(postId, value) {
    const data = getData();
    const post = data.posts.find(p => p.id === postId);
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
    
    saveData(data);
    loadData();
    return true;
}

function addComment(postId, text) {
    const data = getData();
    const post = data.posts.find(p => p.id === postId);
    if (!post) return false;
    
    if (!currentProfile?.nickname) {
        showToast('Сначала установите ник!', true);
        return false;
    }
    
    if (!post.comments) post.comments = [];
    post.comments.push({
        id: generateId(),
        authorId: profileId,
        text: text,
        createdAt: new Date().toISOString()
    });
    
    saveData(data);
    loadData();
    return true;
}

// --- ОБРАБОТЧИКИ СОБЫТИЙ ---

// Никнейм
nicknameInput.addEventListener('input', function() {
    const nickname = this.value.trim();
    profileNicknameEl.textContent = nickname || 'Без имени';
    clearTimeout(profileSaveTimer);
    
    if (!nickname) {
        this.classList.remove('error');
        nickErrorMsg.style.display = 'none';
        return;
    }
    
    profileSaveTimer = setTimeout(() => {
        saveProfile(nickname);
    }, 400);
});

nicknameInput.addEventListener('blur', function() {
    clearTimeout(profileSaveTimer);
    const nickname = this.value.trim();
    if (nickname) saveProfile(nickname);
});

// Аватар
profileAvatarEl.addEventListener('click', () => avatarUploadEl.click());

avatarUploadEl.addEventListener('change', function(e) {
    const file = this.files[0];
    this.value = '';
    if (!file) return;
    
    if (!currentProfile?.nickname) {
        return showToast('Сначала установите ник!', true);
    }
    if (file.size > MAX_AVATAR_SIZE) {
        return showToast('Аватар должен быть меньше 5 МБ', true);
    }
    if (!file.type.startsWith('image/')) {
        return showToast('Выберите изображение', true);
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        saveProfile(currentProfile.nickname, e.target.result);
        showToast('✅ Аватар обновлён');
    };
    reader.readAsDataURL(file);
});

// Медиа
document.getElementById('attachBtn').addEventListener('click', () => mediaUploadEl.click());

mediaUploadEl.addEventListener('change', function(e) {
    const files = Array.from(this.files);
    this.value = '';
    
    let totalSize = pendingMedia.reduce((sum, item) => sum + item.file.size, 0);
    
    for (const file of files) {
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
            showToast(`Файл «${file.name}» не поддерживается`, true);
            continue;
        }
        if (file.size > MAX_FILE_SIZE || totalSize + file.size > MAX_FILE_SIZE) {
            showToast('Общий размер файлов превышает 67 МБ!', true);
            break;
        }
        totalSize += file.size;
        pendingMedia.push({ file, previewUrl: URL.createObjectURL(file) });
    }
    renderMediaPreview();
    updateUploadStatus();
});

function renderMediaPreview() {
    if (pendingMedia.length) {
        mediaPreviewEl.innerHTML = pendingMedia.map((item, index) => `
            <div class="preview-item" style="position:relative;width:108px;background:#0c0d10;border-radius:8px;overflow:hidden;">
                ${item.file.type.startsWith('video/')
                    ? `<video src="${item.previewUrl}" muted style="width:108px;height:82px;object-fit:cover;display:block;"></video>`
                    : `<img src="${item.previewUrl}" alt="${escapeHtml(item.file.name)}" style="width:108px;height:82px;object-fit:cover;display:block;">`}
                <div style="padding:4px 8px;font-size:0.6rem;color:#8d9098;background:#0c0d10;">${escapeHtml(item.file.name)}</div>
                <button class="remove-media" type="button" data-remove-media="${index}" style="position:absolute;top:-6px;right:-6px;width:22px;height:22px;border:none;border-radius:50%;background:#ff5353;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;">✕</button>
            </div>
        `).join('');
    } else {
        mediaPreviewEl.innerHTML = '';
    }
}

function updateUploadStatus(customText = '') {
    if (customText) {
        uploadStatusEl.textContent = customText;
        return;
    }
    const totalSize = pendingMedia.reduce((sum, item) => sum + item.file.size, 0);
    uploadStatusEl.textContent = pendingMedia.length
        ? `📎 ${pendingMedia.length} файлов (${(totalSize / 1048576).toFixed(1)} МБ)`
        : '';
}

mediaPreviewEl.addEventListener('click', function(e) {
    const btn = e.target.closest('[data-remove-media]');
    if (!btn) return;
    const index = Number(btn.dataset.removeMedia);
    const [removed] = pendingMedia.splice(index, 1);
    if (removed) URL.revokeObjectURL(removed.previewUrl);
    renderMediaPreview();
    updateUploadStatus();
});

// Публикация
publishBtnEl.addEventListener('click', async function() {
    if (!currentProfile?.nickname) {
        return showToast('Сначала установите ник!', true);
    }
    
    const text = postTextEl.value.trim();
    if (!text && pendingMedia.length === 0) {
        return showToast('Напишите текст или прикрепите медиа', true);
    }
    
    this.disabled = true;
    this.textContent = '📤 Публикация...';
    
    try {
        const mediaData = [];
        for (const item of pendingMedia) {
            const data = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsDataURL(item.file);
            });
            mediaData.push({
                type: item.file.type.startsWith('video/') ? 'video' : 'image',
                data: data
            });
        }
        
        createPost(text, mediaData);
        
        postTextEl.value = '';
        pendingMedia.forEach((item) => URL.revokeObjectURL(item.previewUrl));
        pendingMedia = [];
        renderMediaPreview();
        updateUploadStatus();
        
        setActiveTab('tabFeed', 'feedSection');
        
    } catch (error) {
        showToast(error.message, true);
    } finally {
        this.disabled = false;
        this.textContent = 'Опубликовать';
    }
});

// --- ОБРАБОТЧИКИ КЛИКОВ ---

document.addEventListener('click', function(e) {
    // Голоса
    const voteBtn = e.target.closest('[data-vote]');
    if (voteBtn) {
        if (!currentProfile?.nickname) {
            return showToast('Сначала установите ник!', true);
        }
        votePost(voteBtn.dataset.postid, Number(voteBtn.dataset.vote));
        return;
    }
    
    // Комментарии
    const toggleBtn = e.target.closest('[data-toggle-comments]');
    if (toggleBtn) {
        const postId = toggleBtn.dataset.toggleComments;
        const section = document.getElementById(`comments-${postId}`);
        if (!section) return;
        const opening = section.style.display !== 'block';
        section.style.display = opening ? 'block' : 'none';
        opening ? openComments.add(postId) : openComments.delete(postId);
        return;
    }
    
    const commentBtn = e.target.closest('[data-add-comment]');
    if (commentBtn) {
        if (!currentProfile?.nickname) {
            return showToast('Сначала установите ник!', true);
        }
        const postId = commentBtn.dataset.addComment;
        const input = document.getElementById(`comment-input-${postId}`);
        const text = input?.value.trim();
        if (!text) return;
        addComment(postId, text);
        openComments.add(postId);
        input.value = '';
        return;
    }
    
    // Удаление
    const deleteBtn = e.target.closest('[data-delete-post]');
    if (deleteBtn) {
        if (!confirm('Удалить этот пост?')) return;
        deletePost(deleteBtn.dataset.deletePost);
        return;
    }
});

// Enter для комментариев
document.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter' || e.shiftKey || !e.target.classList.contains('comment-input')) return;
    e.preventDefault();
    const btn = e.target.closest('.comment-input-row')?.querySelector('[data-add-comment]');
    if (btn) btn.click();
});

// Уведомления
bellBtnEl.addEventListener('click', function() {
    notificationPanelOpen = !notificationPanelOpen;
    notificationPanelEl.style.display = notificationPanelOpen ? 'block' : 'none';
    notificationPanelEl.style.cssText = `
        position:absolute;z-index:20;top:68px;right:14px;
        display:${notificationPanelOpen ? 'block' : 'none'};
        width:min(360px,calc(100% - 28px));
        max-height:340px;overflow:auto;
        border:1px solid #2a2c32;border-radius:8px;
        background:#14161a;box-shadow:0 18px 50px rgba(0,0,0,0.55);
    `;
    if (notificationPanelOpen) {
        renderNotifications();
        const data = getData();
        if (data.notifications) {
            data.notifications.forEach(n => { n.read = true; });
            saveData(data);
            updateNotifCount();
        }
    }
});

document.addEventListener('click', function(e) {
    if (!notificationPanelOpen) return;
    if (bellBtnEl.contains(e.target) || notificationPanelEl.contains(e.target)) return;
    notificationPanelOpen = false;
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

// --- ДЕМО-ПОСТЫ ---

function addDemoPosts() {
    const data = getData();
    if (data.posts.length > 0) return;
    
    if (!data.profiles['demo_user']) {
        data.profiles['demo_user'] = {
            nickname: '🌟 Демо-пользователь',
            avatarData: DEFAULT_AVATAR,
            createdAt: new Date().toISOString()
        };
    }
    
    data.posts = [
        {
            id: generateId(),
            authorId: 'demo_user',
            text: '👋 Добро пожаловать в DARK FORT\PORT!\n\nЗдесь вы можете:\n📝 Публиковать посты\n❤️ Ставить лайки\n💬 Комментировать\n🖼️ Прикреплять фото и видео\n\nУстановите свой ник и аватар!',
            media: [],
            likes: 2,
            dislikes: 0,
            votes: {},
            comments: [
                {
                    id: generateId(),
                    authorId: profileId,
                    text: '🔥 Круто!',
                    createdAt: new Date(Date.now() - 120000).toISOString()
                }
            ],
            createdAt: new Date(Date.now() - 300000).toISOString()
        },
        {
            id: generateId(),
            authorId: 'demo_user',
            text: '💡 Нажмите на аватар чтобы загрузить своё фото. Ник можно изменить в любой момент.',
            media: [],
            likes: 1,
            dislikes: 0,
            votes: {},
            comments: [],
            createdAt: new Date(Date.now() - 600000).toISOString()
        }
    ];
    
    saveData(data);
}

// --- СИНХРОНИЗАЦИЯ МЕЖДУ ВКЛАДКАМИ ---

function initSync() {
    try {
        const channel = new BroadcastChannel('social_channel');
        channel.onmessage = function(e) {
            if (e.data?.type === 'update') {
                loadData();
            }
        };
        return channel;
    } catch (e) {
        return null;
    }
}

// --- ИНИЦИАЛИЗАЦИЯ ---

function init() {
    addDemoPosts();
    initSync();
    loadData();
    
    if (!currentProfile?.nickname) {
        nicknameInput.focus();
        nicknameInput.placeholder = '👤 Введите ваш ник...';
    }
    
    // Авто-обновление
    setInterval(loadData, 10000);
    
    console.log('✅ Анонимная социальная сеть запущена!');
    console.log('👤 Ваш ID:', profileId);
    console.log('📦 Данные в localStorage');
}

init();

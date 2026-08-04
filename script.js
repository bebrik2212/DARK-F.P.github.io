// ============================================================
// DARK FORT - PORT
// ANONYMOUS SOCIAL NETWORK
// ============================================================

const DEFAULT_AVATAR = 'https://i.pinimg.com/236x/ca/32/a0/ca32a08ba5cdefbffa115c6cced9f519.jpg';
const MAX_FILE_SIZE = 67 * 1024 * 1024;
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

// --- ID ---
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
const nickInput = document.getElementById('nickInput');
const profileAvatar = document.getElementById('profileAvatar');
const profileBigAvatar = document.getElementById('profileBigAvatar');
const profileNick = document.getElementById('profileNick');
const avatarUpload = document.getElementById('avatarUpload');
const notifBtn = document.getElementById('notifBtn');
const notifBadge = document.getElementById('notifBadge');
const notifPanel = document.getElementById('notifPanel');
const nickError = document.getElementById('nickError');
const postText = document.getElementById('postText');
const mediaUpload = document.getElementById('mediaUpload');
const mediaPreview = document.getElementById('mediaPreview');
const publishBtn = document.getElementById('publishBtn');
const uploadInfo = document.getElementById('uploadInfo');
const postsFeed = document.getElementById('postsFeed');
const postsProfile = document.getElementById('postsProfile');

// --- DATA ---

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
        try {
            const ch = new BroadcastChannel('df_channel');
            ch.postMessage({ type: 'update' });
            ch.close();
        } catch (e) {}
    } catch (e) {}
}

// --- LOAD ---

function loadData() {
    const data = getData();
    
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
    
    allPosts = data.posts.map(p => {
        const author = data.profiles[p.authorId];
        return {
            ...p,
            authorName: author?.nickname || 'ANON',
            authorAvatar: author?.avatarData || DEFAULT_AVATAR,
        };
    });
    
    updateUI();
}

// --- UI ---

function updateUI() {
    updateProfileUI();
    renderPosts();
    updateNotifBadge();
}

function updateProfileUI() {
    if (!currentProfile) return;
    
    const nick = document.activeElement === nickInput
        ? nickInput.value.trim()
        : (currentProfile.nickname || '');
    
    if (document.activeElement !== nickInput) {
        nickInput.value = nick;
    }
    
    profileNick.textContent = nick || 'NICKNAME';
    
    const avatar = currentProfile.avatarData || DEFAULT_AVATAR;
    profileAvatar.src = avatar;
    profileBigAvatar.src = avatar;
}

function renderPosts() {
    const sorted = [...allPosts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    if (sorted.length) {
        postsFeed.innerHTML = sorted.map(p => renderPost(p)).join('');
    } else {
        postsFeed.innerHTML = '<div class="empty">NO POSTS</div>';
    }
    
    const myPosts = sorted.filter(p => p.authorId === profileId);
    if (myPosts.length) {
        postsProfile.innerHTML = myPosts.map(p => renderPost(p)).join('');
    } else {
        postsProfile.innerHTML = '<div class="empty">NO POSTS</div>';
    }
}

function renderPost(post) {
    const isMine = post.authorId === profileId;
    const deleteBtn = isMine ? `
        <button class="post-delete" data-delete="${post.id}">X</button>
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
                    <div class="comment-author">${escapeHtml(author?.nickname || 'ANON')}</div>
                    <div class="comment-text">${escapeHtml(c.text)}</div>
                </div>
            </div>
        `;
    }).join('');
    
    const isOpen = openComments.has(post.id);
    const myVote = post.votes?.[profileId] || 0;
    
    return `
        <div class="post" data-id="${post.id}">
            <div class="post-header">
                <img class="post-avatar" src="${post.authorAvatar || DEFAULT_AVATAR}">
                <span class="post-author">${escapeHtml(post.authorName || 'ANON')}</span>
                <span class="post-time">${formatTime(post.createdAt)}</span>
                ${deleteBtn}
            </div>
            ${post.text ? `<div class="post-text">${escapeHtml(post.text)}</div>` : ''}
            ${mediaHTML}
            <div class="post-footer">
                <button class="post-btn ${myVote === 1 ? 'liked' : ''}" data-vote="1" data-id="${post.id}">+ ${post.likes || 0}</button>
                <button class="post-btn ${myVote === -1 ? 'disliked' : ''}" data-vote="-1" data-id="${post.id}">- ${post.dislikes || 0}</button>
                <button class="post-btn" data-toggle="${post.id}">C ${comments.length}</button>
            </div>
            <div class="comments-section ${isOpen ? 'open' : ''}" id="comments-${post.id}">
                ${commentsHTML}
                <div class="comment-input-row">
                    <input class="comment-input" id="comment-input-${post.id}" maxlength="1000" placeholder="TYPE COMMENT...">
                    <button class="comment-send" data-comment="${post.id}">SEND</button>
                </div>
            </div>
        </div>
    `;
}

function updateNotifBadge() {
    const data = getData();
    const count = data.notifs?.filter(n => !n.read).length || 0;
    notifBadge.textContent = count;
    notifBadge.classList.toggle('visible', count > 0);
}

function renderNotifs() {
    const data = getData();
    const notifs = data.notifs || [];
    if (notifs.length) {
        notifPanel.innerHTML = notifs.map(n => `
            <div class="notif-item">
                ${escapeHtml(n.message)}
                <span class="notif-time">${formatTime(n.createdAt)}</span>
            </div>
        `).join('');
    } else {
        notifPanel.innerHTML = '<div class="notif-item">NO NOTIFICATIONS</div>';
    }
}

// --- HELPERS ---

function escapeHtml(v) {
    const d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
}

function formatTime(v) {
    if (!v) return '';
    try {
        return new Intl.DateTimeFormat('ru', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        }).format(new Date(v));
    } catch {
        return '';
    }
}

function toast(msg, err = false) {
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

// --- PROFILE ---

function saveProfile(nick, avatar) {
    const data = getData();
    
    const taken = Object.keys(data.profiles).some(id =>
        id !== profileId && data.profiles[id]?.nickname?.toLowerCase() === nick.toLowerCase()
    );
    
    if (taken && nick) {
        nickInput.classList.add('error');
        nickError.classList.add('visible');
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
    
    nickInput.classList.remove('error');
    nickError.classList.remove('visible');
    
    updateUI();
    return true;
}

// --- POSTS ---

function createPost(text, media) {
    const data = getData();
    
    if (!currentProfile?.nickname) {
        toast('SET NICKNAME FIRST', true);
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
    toast('POST PUBLISHED');
    return true;
}

function deletePost(id) {
    const data = getData();
    const idx = data.posts.findIndex(p => p.id === id);
    if (idx === -1) return false;
    if (data.posts[idx].authorId !== profileId) {
        toast('NOT YOUR POST', true);
        return false;
    }
    data.posts.splice(idx, 1);
    saveData(data);
    loadData();
    toast('POST DELETED');
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
        toast('SET NICKNAME FIRST', true);
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

// --- EVENTS ---

// Nickname
nickInput.addEventListener('input', function() {
    const nick = this.value.trim();
    profileNick.textContent = nick || 'NICKNAME';
    clearTimeout(saveTimer);
    if (!nick) {
        this.classList.remove('error');
        nickError.classList.remove('visible');
        return;
    }
    saveTimer = setTimeout(() => saveProfile(nick), 400);
});

nickInput.addEventListener('blur', function() {
    clearTimeout(saveTimer);
    const nick = this.value.trim();
    if (nick) saveProfile(nick);
});

// Avatar
profileAvatar.addEventListener('click', () => avatarUpload.click());

avatarUpload.addEventListener('change', function() {
    const file = this.files[0];
    this.value = '';
    if (!file) return;
    
    if (!currentProfile?.nickname) {
        toast('SET NICKNAME FIRST', true);
        return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
        toast('AVATAR MAX 5MB', true);
        return;
    }
    if (!file.type.startsWith('image/')) {
        toast('IMAGE ONLY', true);
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        saveProfile(currentProfile.nickname, e.target.result);
        toast('AVATAR UPDATED');
    };
    reader.readAsDataURL(file);
});

// Media attach
document.getElementById('attachBtn').addEventListener('click', () => mediaUpload.click());

mediaUpload.addEventListener('change', function() {
    const files = Array.from(this.files);
    this.value = '';
    
    let total = pendingMedia.reduce((s, i) => s + i.file.size, 0);
    
    for (const file of files) {
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
            toast('UNSUPPORTED FILE', true);
            continue;
        }
        if (file.size > MAX_FILE_SIZE || total + file.size > MAX_FILE_SIZE) {
            toast('MAX 67MB TOTAL', true);
            break;
        }
        total += file.size;
        pendingMedia.push({ file, url: URL.createObjectURL(file) });
    }
    renderMediaPreview();
    updateUploadInfo();
});

function renderMediaPreview() {
    if (pendingMedia.length) {
        mediaPreview.innerHTML = pendingMedia.map((item, i) => `
            <div class="preview-item">
                ${item.file.type.startsWith('video/')
                    ? `<video src="${item.url}" muted></video>`
                    : `<img src="${item.url}">`}
                <button class="preview-remove" data-remove="${i}">X</button>
            </div>
        `).join('');
    } else {
        mediaPreview.innerHTML = '';
    }
}

function updateUploadInfo(text) {
    if (text) {
        uploadInfo.textContent = text;
        return;
    }
    const total = pendingMedia.reduce((s, i) => s + i.file.size, 0);
    uploadInfo.textContent = pendingMedia.length
        ? `${pendingMedia.length} FILES (${(total / 1048576).toFixed(1)} MB)`
        : '';
}

mediaPreview.addEventListener('click', function(e) {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    const idx = Number(btn.dataset.remove);
    const removed = pendingMedia.splice(idx, 1)[0];
    if (removed) URL.revokeObjectURL(removed.url);
    renderMediaPreview();
    updateUploadInfo();
});

// Publish
publishBtn.addEventListener('click', async function() {
    if (!currentProfile?.nickname) {
        toast('SET NICKNAME FIRST', true);
        return;
    }
    
    const text = postText.value.trim();
    if (!text && pendingMedia.length === 0) {
        toast('TYPE SOMETHING', true);
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
        
        postText.value = '';
        pendingMedia.forEach((item) => URL.revokeObjectURL(item.url));
        pendingMedia = [];
        renderMediaPreview();
        updateUploadInfo();
        
        switchTab('feed');
        
    } catch (e) {
        toast(e.message, true

let adminToken = localStorage.getItem('adminToken');

const loginCard = document.getElementById('loginCard');
const panel = document.getElementById('panel');
const loginError = document.getElementById('loginError');
const adminLoginBtn = document.getElementById('adminLoginBtn');
const adminPasswordInput = document.getElementById('adminPassword');
const logoutBtn = document.getElementById('logoutBtn');
const refreshBtn = document.getElementById('refreshBtn');
const itemsBody = document.getElementById('itemsBody');
const linkForm = document.getElementById('linkForm');
const uploadForm = document.getElementById('uploadForm');
const linkMessage = document.getElementById('linkMessage');
const uploadMessage = document.getElementById('uploadMessage');

if (adminToken) {
    showPanel();
    loadItems();
}

adminLoginBtn.addEventListener('click', handleLogin);
adminPasswordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        handleLogin();
    }
});

logoutBtn.addEventListener('click', () => {
    adminToken = null;
    localStorage.removeItem('adminToken');
    hidePanel();
});

refreshBtn.addEventListener('click', loadItems);

linkForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    linkMessage.textContent = '';
    linkMessage.className = 'form-message';

    const payload = {
        name: linkForm.name.value.trim(),
        url: linkForm.url.value.trim(),
        description: linkForm.description.value.trim(),
        badge: linkForm.badge.value.trim(),
        version: linkForm.version.value.trim(),
        arch: linkForm.arch.value.trim()
    };

    try {
        const result = await apiFetch('/api/admin/link', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (result.success) {
            linkForm.reset();
            linkMessage.textContent = '链接已添加';
            linkMessage.classList.add('success');
            loadItems();
        } else {
            linkMessage.textContent = result.message || '添加失败';
            linkMessage.classList.add('error');
        }
    } catch (error) {
        linkMessage.textContent = '请求失败，请稍后重试';
        linkMessage.classList.add('error');
    }
});

uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    uploadMessage.textContent = '';
    uploadMessage.className = 'form-message';

    const formData = new FormData(uploadForm);

    try {
        const result = await apiFetch('/api/admin/upload', {
            method: 'POST',
            body: formData
        });

        if (result.success) {
            uploadForm.reset();
            uploadMessage.textContent = '文件已上传';
            uploadMessage.classList.add('success');
            loadItems();
        } else {
            uploadMessage.textContent = result.message || '上传失败';
            uploadMessage.classList.add('error');
        }
    } catch (error) {
        uploadMessage.textContent = '请求失败，请稍后重试';
        uploadMessage.classList.add('error');
    }
});

async function handleLogin() {
    loginError.textContent = '';

    const password = adminPasswordInput.value.trim();
    if (!password) {
        loginError.textContent = '请输入管理员密码';
        return;
    }

    adminLoginBtn.disabled = true;
    adminLoginBtn.textContent = '登录中...';

    try {
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ password })
        });
        const result = await response.json();

        if (result.success) {
            adminToken = result.token;
            localStorage.setItem('adminToken', adminToken);
            adminPasswordInput.value = '';
            showPanel();
            loadItems();
        } else {
            loginError.textContent = result.message || '登录失败';
        }
    } catch (error) {
        loginError.textContent = '登录失败，请稍后重试';
    } finally {
        adminLoginBtn.disabled = false;
        adminLoginBtn.textContent = '登录';
    }
}

function showPanel() {
    loginCard.classList.add('hidden');
    panel.classList.remove('hidden');
}

function hidePanel() {
    loginCard.classList.remove('hidden');
    panel.classList.add('hidden');
    adminPasswordInput.value = '';
}

async function loadItems() {
    itemsBody.innerHTML = '<tr><td colspan="5">加载中...</td></tr>';

    try {
        const result = await apiFetch('/api/admin/files');
        const items = result.items || [];

        if (!items.length) {
            itemsBody.innerHTML = '<tr><td colspan="5">暂无数据</td></tr>';
            return;
        }

        itemsBody.innerHTML = items.map(renderRow).join('');
        bindDeleteActions();
    } catch (error) {
        itemsBody.innerHTML = '<tr><td colspan="5">加载失败，请稍后重试</td></tr>';
    }
}

function renderRow(item) {
    const typeLabel = item.type === 'link' ? '链接' : '文件';
    const resource = item.type === 'link'
        ? `<a href="${item.url}" target="_blank" rel="noopener">${item.url}</a>`
        : item.filename;
    const description = item.description || '-';

    return `
        <tr>
            <td>${item.name}</td>
            <td><span class="type-pill">${typeLabel}</span></td>
            <td>${description}</td>
            <td>${resource}</td>
            <td>
                <button class="action-btn" data-id="${item.id}">删除</button>
            </td>
        </tr>
    `;
}

function bindDeleteActions() {
    const buttons = document.querySelectorAll('.action-btn');
    buttons.forEach((button) => {
        button.addEventListener('click', async () => {
            const id = button.getAttribute('data-id');
            if (!id) return;

            if (!confirm('确定要删除该资源吗？')) {
                return;
            }

            try {
                const result = await apiFetch(`/api/admin/files/${id}`, {
                    method: 'DELETE'
                });

                if (result.success) {
                    loadItems();
                }
            } catch (error) {
                alert('删除失败，请稍后重试');
            }
        });
    });
}

async function apiFetch(url, options = {}) {
    const headers = options.headers || {};
    if (adminToken) {
        headers.Authorization = `Bearer ${adminToken}`;
    }

    const response = await fetch(url, {
        ...options,
        headers
    });

    if (response.status === 401) {
        adminToken = null;
        localStorage.removeItem('adminToken');
        hidePanel();
        throw new Error('未授权');
    }

    return response.json();
}

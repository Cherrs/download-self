/* ========================================
   Modern Download Center - JavaScript
   ======================================== */

let authToken = null;
let pendingDownload = null;
let turnstileWidgetId = null;

document.addEventListener('DOMContentLoaded', function () {
    setupPasswordModal();
    loadDownloadItems();
    updateCopyright();
});

// 设置密码弹窗
function setupPasswordModal() {
    const modal = document.getElementById('passwordModal');
    const passwordInput = document.getElementById('passwordInput');
    const submitBtn = document.getElementById('submitPassword');
    const cancelBtn = document.getElementById('cancelPassword');
    const errorMessage = document.getElementById('errorMessage');
    const turnstileContainer = document.getElementById('turnstile-container');

    // 提交密码
    submitBtn.addEventListener('click', async () => {
        const password = passwordInput.value.trim();
        if (!password) {
            showError('请输入密码');
            return;
        }

        // 显示加载状态
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>验证中...</span>';

        // 获取Turnstile token（如果显示了验证码）
        let turnstileToken = null;
        if (turnstileContainer.style.display !== 'none' && window.turnstile) {
            turnstileToken = window.turnstile.getResponse(turnstileWidgetId);
            if (!turnstileToken) {
                showError('请完成验证码验证');
                resetSubmitButton();
                return;
            }
        }

        try {
            const response = await fetch('/api/verify-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    password,
                    turnstileToken
                })
            });

            const result = await response.json();

            if (result.success) {
                authToken = result.token;
                errorMessage.textContent = '';
                passwordInput.value = '';
                turnstileContainer.style.display = 'none';
                closeModal();

                // 执行待下载的文件
                if (pendingDownload) {
                    downloadFile(pendingDownload);
                    pendingDownload = null;
                }
            } else {
                showError(result.message || '密码错误，请重试');

                // 如果需要显示验证码
                if (result.requireCaptcha && turnstileContainer.style.display === 'none') {
                    showTurnstile();
                }

                // 重置验证码
                if (window.turnstile && turnstileWidgetId !== null) {
                    window.turnstile.reset(turnstileWidgetId);
                }
            }
        } catch (error) {
            showError('验证失败，请重试');
            console.error('密码验证错误:', error);
        } finally {
            resetSubmitButton();
        }
    });

    // 取消按钮
    cancelBtn.addEventListener('click', () => {
        closeModal();
    });

    // 回车提交
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            submitBtn.click();
        }
    });

    // 点击背景关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.classList.contains('modal-backdrop')) {
            closeModal();
        }
    });

    // ESC 键关闭
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeModal();
        }
    });
}

// 关闭模态框
function closeModal() {
    const modal = document.getElementById('passwordModal');
    const passwordInput = document.getElementById('passwordInput');
    const errorMessage = document.getElementById('errorMessage');
    const turnstileContainer = document.getElementById('turnstile-container');

    modal.classList.remove('active');
    passwordInput.value = '';
    errorMessage.textContent = '';
    turnstileContainer.style.display = 'none';
    pendingDownload = null;

    // 重置 Turnstile（如果存在）
    if (window.turnstile && turnstileWidgetId !== null) {
        window.turnstile.reset(turnstileWidgetId);
    }
}

// 显示错误信息
function showError(message) {
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = message;

    // 添加抖动动画
    errorMessage.style.animation = 'shake 0.4s';
    setTimeout(() => {
        errorMessage.style.animation = '';
    }, 400);
}

// 重置提交按钮
function resetSubmitButton() {
    const submitBtn = document.getElementById('submitPassword');
    submitBtn.disabled = false;
    submitBtn.innerHTML = `
        <span>确认下载</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14m-7-7l7 7-7 7"/>
        </svg>
    `;
}

// 显示Turnstile验证码
function showTurnstile() {
    const turnstileContainer = document.getElementById('turnstile-container');
    turnstileContainer.style.display = 'block';

    // 渲染Turnstile widget（仅渲染一次）
    if (window.turnstile && turnstileWidgetId === null) {
        // 创建 turnstile 元素
        turnstileContainer.innerHTML = '<div id="turnstile-widget"></div>';

        turnstileWidgetId = window.turnstile.render('#turnstile-widget', {
            sitekey: '0x4AAAAAACMhHDAC96MuwZzS',
            theme: 'light',
        });
    } else if (window.turnstile && turnstileWidgetId !== null) {
        // 如果已经渲染过，只需要重置
        window.turnstile.reset(turnstileWidgetId);
    }
}

// 设置下载按钮
function setupDownloadButtons() {
    const downloadButtons = document.querySelectorAll('.download-btn');
    const linkButtons = document.querySelectorAll('.link-btn');

    downloadButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const filename = button.getAttribute('data-file');

            if (authToken) {
                // 已有token，直接下载
                downloadFile(filename);
            } else {
                // 需要输入密码
                pendingDownload = filename;
                const modal = document.getElementById('passwordModal');
                modal.classList.add('active');

                // 聚焦输入框
                setTimeout(() => {
                    document.getElementById('passwordInput').focus();
                }, 100);
            }
        });

        // 添加触摸反馈（移动端优化）
        button.addEventListener('touchstart', function () {
            this.style.transform = 'translateY(0)';
        });

        button.addEventListener('touchend', function () {
            this.style.transform = '';
        });
    });

    linkButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const url = button.getAttribute('data-url');
            if (url) {
                window.open(url, '_blank', 'noopener');
                showToast('已打开链接', 'success');
            }
        });
    });
}

// 执行下载
function downloadFile(filename) {
    const downloadUrl = `/api/download/${encodeURIComponent(filename)}?token=${encodeURIComponent(authToken)}`;

    // 使用 window.location 触发下载（更可靠）
    window.location.href = downloadUrl;

    // 显示成功提示
    showToast('下载已开始', 'success');
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <span>${message}</span>
    `;

    const style = document.createElement('style');
    if (!document.getElementById('toast-styles')) {
        style.id = 'toast-styles';
        style.textContent = `
            .toast-notification {
                position: fixed;
                bottom: 2rem;
                right: 2rem;
                background: #10B981;
                color: white;
                padding: 1rem 1.5rem;
                border-radius: 0.75rem;
                box-shadow: 0 10px 15px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05);
                display: flex;
                align-items: center;
                gap: 0.75rem;
                font-weight: 600;
                animation: slideInRight 0.3s ease-out, slideOutRight 0.3s ease-in 2.7s;
                z-index: 9999;
            }

            .toast-notification.toast-error {
                background: #EF4444;
            }

            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }

            @keyframes slideOutRight {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }

            @keyframes shake {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-10px); }
                75% { transform: translateX(10px); }
            }

            @media (max-width: 480px) {
                .toast-notification {
                    bottom: 1rem;
                    right: 1rem;
                    left: 1rem;
                }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

async function loadDownloadItems() {
    const grid = document.querySelector('.tools-grid');
    if (!grid) return;

    grid.innerHTML = '<div class="loading">加载中...</div>';

    try {
        const response = await fetch('/api/files');
        const result = await response.json();
        const items = result.items || [];

        if (!items.length) {
            grid.innerHTML = '<div class="empty-state">暂无可下载资源</div>';
            return;
        }

        grid.innerHTML = items.map((item) => renderCard(item)).join('');
        setupDownloadButtons();
    } catch (error) {
        grid.innerHTML = '<div class="empty-state">加载失败，请刷新重试</div>';
        console.error('加载资源失败:', error);
    }
}

function renderCard(item) {
    const badgeText = item.badge || (item.type === 'link' ? '外部链接' : '可下载');
    const description = item.description || '暂无描述';
    const versionHtml = item.version
        ? `<div class="meta-item">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>版本 ${item.version}</span>
        </div>`
        : '';
    const archHtml = item.arch
        ? `<div class="meta-item">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4A2 2 0 0 0 12 22l7-4A2 2 0 0 0 21 16z" />
            </svg>
            <span>${item.arch}</span>
        </div>`
        : '';
    const actionButton = item.type === 'link'
        ? `<a href="#" class="download-btn link-btn" data-url="${item.url}">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5" />
                <path d="M14 11a5 5 0 0 0-7.07 0L5.5 12.5a5 5 0 0 0 7.07 7.07L14 19" />
            </svg>
            <span>打开链接</span>
        </a>`
        : `<a href="#" class="download-btn" data-file="${item.filename}">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m4-5l5 5 5-5m-5 5V3" />
            </svg>
            <span>立即下载</span>
        </a>`;

    return `
        <div class="tool-card">
            <div class="card-header">
                <div class="tool-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="4" />
                        <path d="M8 12h8" />
                        <path d="M12 8v8" />
                    </svg>
                </div>
                <span class="tool-badge">${badgeText}</span>
            </div>
            <div class="card-body">
                <h3 class="tool-name">${item.name}</h3>
                <p class="tool-description">${description}</p>
                <div class="tool-meta">
                    ${versionHtml}
                    ${archHtml}
                </div>
            </div>
            <div class="card-footer">
                ${actionButton}
            </div>
        </div>
    `;
}

// 更新版权年份
function updateCopyright() {
    const footerText = document.querySelector('.footer-text');
    if (footerText) {
        const currentYear = new Date().getFullYear();
        footerText.textContent = `© ${currentYear}`;
    }
}

/* ========================================
   Modern Download Center - JavaScript
   ======================================== */

let authToken = null;
let pendingDownload = null;
let turnstileWidgetId = null;

document.addEventListener('DOMContentLoaded', function () {
    setupPasswordModal();
    setupDownloadButtons();
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
}

// 执行下载
function downloadFile(filename) {
    const downloadUrl = `/api/download/${filename}?token=${encodeURIComponent(authToken)}`;

    // 创建隐藏的a标签触发下载
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // 显示成功提示
    showDownloadSuccess(filename);
}

// 显示下载成功提示
function showDownloadSuccess(filename) {
    // 创建提示元素
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <span>下载已开始</span>
    `;

    // 添加样式
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

    // 3秒后移除
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// 更新版权年份
function updateCopyright() {
    const footerText = document.querySelector('.footer-text');
    if (footerText) {
        const currentYear = new Date().getFullYear();
        footerText.textContent = `© ${currentYear}`;
    }
}
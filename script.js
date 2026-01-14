// 添加页面交互功能

let authToken = null;
let pendingDownload = null;
let turnstileWidgetId = null;

document.addEventListener('DOMContentLoaded', function () {
    setupPasswordModal();
    setupDownloadButtons();
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
        const password = passwordInput.value;
        if (!password) {
            errorMessage.textContent = '请输入密码';
            return;
        }

        // 获取Turnstile token（如果显示了验证码）
        let turnstileToken = null;
        if (turnstileContainer.style.display !== 'none' && window.turnstile) {
            turnstileToken = window.turnstile.getResponse(turnstileWidgetId);
            if (!turnstileToken) {
                errorMessage.textContent = '请完成验证码验证';
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
                modal.classList.remove('active');

                // 执行待下载的文件
                if (pendingDownload) {
                    downloadFile(pendingDownload);
                    pendingDownload = null;
                }
            } else {
                errorMessage.textContent = result.message || '密码错误';

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
            errorMessage.textContent = '验证失败，请重试';
            console.error('密码验证错误:', error);
        }
    });

    // 取消按钮
    cancelBtn.addEventListener('click', () => {
        modal.classList.remove('active');
        passwordInput.value = '';
        errorMessage.textContent = '';
        turnstileContainer.style.display = 'none';
        pendingDownload = null;
    });

    // 回车提交
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            submitBtn.click();
        }
    });

    // 点击背景关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
            passwordInput.value = '';
            errorMessage.textContent = '';
            turnstileContainer.style.display = 'none';
            pendingDownload = null;
        }
    });
}

// 显示Turnstile验证码
function showTurnstile() {
    const turnstileContainer = document.getElementById('turnstile-container');
    turnstileContainer.style.display = 'block';

    // 渲染Turnstile widget
    if (window.turnstile && turnstileWidgetId === null) {
        const turnstileElement = turnstileContainer.querySelector('.cf-turnstile');
        turnstileWidgetId = window.turnstile.render(turnstileElement, {
            sitekey: turnstileElement.getAttribute('data-sitekey'),
            theme: 'light',
        });
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
                document.getElementById('passwordModal').classList.add('active');
                setTimeout(() => {
                    document.getElementById('passwordInput').focus();
                }, 100);
            }
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
}

// 添加搜索功能
function addSearchFunctionality() {
    // 创建搜索框
    const header = document.querySelector('header');
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';
    searchContainer.innerHTML = `
        <input type="text" id="searchInput" placeholder="搜索工具..." />
    `;
    header.appendChild(searchContainer);

    // 添加搜索框样式
    const style = document.createElement('style');
    style.textContent = `
        .search-container {
            margin-top: 30px;
            max-width: 500px;
            margin-left: auto;
            margin-right: auto;
        }
        #searchInput {
            width: 100%;
            padding: 15px 20px;
            border: none;
            border-radius: 50px;
            font-size: 1rem;
            outline: none;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
        }
        .tool-card.hidden {
            display: none;
        }
        .category.hidden {
            display: none;
        }
    `;
    document.head.appendChild(style);

    // 搜索逻辑
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', function () {
        const searchTerm = this.value.toLowerCase();
        const categories = document.querySelectorAll('.category');

        categories.forEach(category => {
            const tools = category.querySelectorAll('.tool-card');
            let visibleCount = 0;

            tools.forEach(tool => {
                const title = tool.querySelector('h3').textContent.toLowerCase();
                const description = tool.querySelector('p').textContent.toLowerCase();

                if (title.includes(searchTerm) || description.includes(searchTerm)) {
                    tool.classList.remove('hidden');
                    visibleCount++;
                } else {
                    tool.classList.add('hidden');
                }
            });

            // 如果分类下没有可见的工具，隐藏整个分类
            if (visibleCount === 0) {
                category.classList.add('hidden');
            } else {
                category.classList.remove('hidden');
            }
        });
    });
}

// 添加滚动动画
function addScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -100px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    document.querySelectorAll('.category').forEach(category => {
        category.style.opacity = '0';
        category.style.transform = 'translateY(30px)';
        category.style.transition = 'all 0.6s ease';
        observer.observe(category);
    });
}

// 获取当前年份并更新版权信息
function updateCopyright() {
    const copyrightElement = document.querySelector('.copyright');
    if (copyrightElement) {
        const currentYear = new Date().getFullYear();
        copyrightElement.innerHTML = `© ${currentYear} 工具下载合集 | 所有链接指向官方网站`;
    }
}

updateCopyright();
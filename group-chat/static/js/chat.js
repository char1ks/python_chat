// === ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ===
let socket;
let currentUser = null;
let isTyping = false;
let typingTimeout;
let isDarkTheme = true;
let typingUsers = new Set(); // Пользователи, которые печатают
let longPressTimer = null;
let isLongPressing = false;
let effectsPanelVisible = false;

// === ИНИЦИАЛИЗАЦИЯ ===
document.addEventListener('DOMContentLoaded', function() {
    initializeChat();
    createParticles();
    setInterval(createParticles, 10000); // Создаём частицы каждые 10 секунд
});

function initializeChat() {
    // Инициализация Socket.IO
    socket = io();
    
    // Привязка событий
    bindEvents();
    
    // Настройка Socket.IO событий
    setupSocketEvents();
    
    // Показываем модальное окно входа
    showLoginModal();
}

// === СОБЫТИЯ ИНТЕРФЕЙСА ===
function bindEvents() {
    const joinBtn = document.getElementById('join-btn');
    const usernameInput = document.getElementById('username-input');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const themeToggle = document.getElementById('theme-toggle');
    const effectBtns = document.querySelectorAll('.effect-btn');
    
    // Вход в чат
    joinBtn.addEventListener('click', joinChat);
    usernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') joinChat();
    });
    
    // Отправка сообщений и показ эффектов
    sendBtn.addEventListener('mousedown', handleSendButtonDown);
    sendBtn.addEventListener('mouseup', handleSendButtonUp);
    sendBtn.addEventListener('mouseleave', handleSendButtonUp);
    sendBtn.addEventListener('touchstart', handleSendButtonDown);
    sendBtn.addEventListener('touchend', handleSendButtonUp);
    
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Индикатор печатания
    messageInput.addEventListener('input', handleTyping);
    
    // Смена темы
    themeToggle.addEventListener('click', toggleTheme);
    
    // Эффекты
    effectBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Добавляем анимацию нажатия
            btn.classList.add('effect-pulse');
            setTimeout(() => btn.classList.remove('effect-pulse'), 300);
            
            if (btn.classList.contains('emoji-btn')) {
                const emoji = btn.dataset.emoji;
                createEmojiAnimation(emoji);
                socket.emit('send_emoji_animation', { emoji });
            } else if (btn.classList.contains('special-effect')) {
                const effect = btn.dataset.effect;
                createSpecialEffect(effect);
                socket.emit('send_special_effect', { effect_type: effect });
            }
            
            // Скрываем панель эффектов после отправки
            hideEffectsPanel();
        });
    });
    
    // Добавляем анимацию при вводе текста
    messageInput.addEventListener('focus', () => {
        messageInput.classList.add('typing-animation');
    });
    
    messageInput.addEventListener('blur', () => {
        messageInput.classList.remove('typing-animation');
    });
}

// === ВХОД В ЧАТ ===
function joinChat() {
    const usernameInput = document.getElementById('username-input');
    const username = usernameInput.value.trim();
    
    if (!username) {
        showNotification('Пожалуйста, введите ваше имя!', 'warning');
        return;
    }
    
    if (username.length > 20) {
        showNotification('Имя не должно превышать 20 символов!', 'warning');
        return;
    }
    
    currentUser = username;
    socket.emit('join_chat', { username });
    
    // Скрываем модальное окно и показываем чат
    document.getElementById('login-modal').style.display = 'none';
    document.getElementById('chat-container').style.display = 'grid';
    
    // Фокус на поле ввода сообщения
    document.getElementById('message-input').focus();
    
    showNotification(`Добро пожаловать, ${username}! 🎉`, 'success');
}

// === ОБРАБОТКА КНОПКИ ОТПРАВКИ ===
function handleSendButtonDown(e) {
    e.preventDefault();
    
    const messageInput = document.getElementById('message-input');
    const message = messageInput.value.trim();
    
    // Если есть текст, начинаем таймер для долгого нажатия
    if (message) {
        isLongPressing = true;
        const sendBtn = document.getElementById('send-btn');
        sendBtn.classList.add('long-press');
        
        longPressTimer = setTimeout(() => {
            if (isLongPressing) {
                showEffectsPanel();
                showNotification('Выберите эффект для отправки! 🎨', 'info');
            }
        }, 500); // 0.5 секунды для активации
    }
}

function handleSendButtonUp(e) {
    e.preventDefault();
    
    const sendBtn = document.getElementById('send-btn');
    sendBtn.classList.remove('long-press');
    
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
    
    // Если это был короткий клик и панель эффектов не видна
    if (isLongPressing && !effectsPanelVisible) {
        sendMessage();
    }
    
    isLongPressing = false;
}

// === ОТПРАВКА СООБЩЕНИЙ ===
function sendMessage() {
    const messageInput = document.getElementById('message-input');
    const message = messageInput.value.trim();
    
    if (!message) return;
    
    if (message.length > 500) {
        showNotification('Сообщение слишком длинное!', 'warning');
        return;
    }
    
    socket.emit('send_message', { message });
    messageInput.value = '';
    
    // Создаём эффект отправки
    createSendEffect();
    
    // Сбрасываем индикатор печатания
    clearTypingTimeout();
    
    // Скрываем панель эффектов если она открыта
    hideEffectsPanel();
}

// === SOCKET.IO СОБЫТИЯ ===
function setupSocketEvents() {
    socket.on('user_joined', (data) => {
        addSystemMessage(`${data.username} присоединился к чату! 👋`);
        playNotificationSound();
    });
    
    socket.on('user_left', (data) => {
        addSystemMessage(`${data.username} покинул чат 👋`);
    });
    
    socket.on('user_count', (data) => {
        updateUserCount(data.count);
    });
    
    socket.on('new_message', (data) => {
        addMessage(data);
        playNotificationSound();
    });
    
    socket.on('chat_history', (data) => {
        data.messages.forEach(message => addMessage(message, false));
    });
    
    socket.on('emoji_animation', (data) => {
        createEmojiAnimation(data.emoji);
        showNotification(`${data.username} отправил ${data.emoji}`, 'info');
    });
    
    socket.on('special_effect', (data) => {
        createSpecialEffect(data.effect_type);
        showNotification(`${data.username} запустил эффект!`, 'info');
    });
    
    socket.on('user_typing', (data) => {
        if (data.typing) {
            typingUsers.add(data.username);
        } else {
            typingUsers.delete(data.username);
        }
        updateTypingIndicator();
    });
}

// === УПРАВЛЕНИЕ СООБЩЕНИЯМИ ===
function addMessage(data, animate = true) {
    const messagesContainer = document.getElementById('messages-container');
    const messageElement = createMessageElement(data, animate);
    messagesContainer.appendChild(messageElement);
    scrollToBottom();
}

function createMessageElement(data, animate) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${data.username === currentUser ? 'own' : ''}`;
    
    if (animate) {
        messageDiv.style.animationDelay = '0.1s';
    }
    
    const timestamp = new Date(data.timestamp).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    messageDiv.innerHTML = `
        <div class="message-content">
            <div class="message-header">
                <span class="username">${escapeHtml(data.username)}</span>
                <span class="timestamp">${timestamp}</span>
            </div>
            <div class="message-text">${escapeHtml(data.message)}</div>
        </div>
    `;
    
    return messageDiv;
}

function addSystemMessage(text) {
    const messagesContainer = document.getElementById('messages-container');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'system-message user-join-animation';
    messageDiv.textContent = text;
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
    
    // Добавляем магические искорки для системных сообщений
    createMagicSparkles(messageDiv);
}

function createMagicSparkles(element) {
    for (let i = 0; i < 5; i++) {
        setTimeout(() => {
            const sparkle = document.createElement('div');
            sparkle.className = 'magic-sparkle';
            sparkle.style.left = Math.random() * element.offsetWidth + 'px';
            sparkle.style.top = Math.random() * element.offsetHeight + 'px';
            
            element.appendChild(sparkle);
            
            setTimeout(() => {
                if (sparkle.parentNode) {
                    sparkle.parentNode.removeChild(sparkle);
                }
            }, 2000);
        }, i * 200);
    }
}

function scrollToBottom() {
    const messagesContainer = document.getElementById('messages-container');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// === ИНДИКАТОР ПЕЧАТАНИЯ ===
function handleTyping() {
    if (!isTyping) {
        isTyping = true;
        socket.emit('typing_start');
    }
    
    clearTypingTimeout();
    typingTimeout = setTimeout(() => {
        isTyping = false;
        socket.emit('typing_stop');
    }, 1000);
}

function clearTypingTimeout() {
    if (typingTimeout) {
        clearTimeout(typingTimeout);
        typingTimeout = null;
    }
}

function updateTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    const typingText = document.getElementById('typing-text');
    
    if (typingUsers.size === 0) {
        indicator.style.display = 'none';
        return;
    }
    
    let text = '';
    const usersArray = Array.from(typingUsers);
    
    if (usersArray.length === 1) {
        text = `${usersArray[0]} набирает сообщение...`;
    } else if (usersArray.length === 2) {
        text = `${usersArray[0]} и ${usersArray[1]} набирают сообщение...`;
    } else {
        text = `${usersArray[0]} и ещё ${usersArray.length - 1} человек набирают сообщение...`;
    }
    
    typingText.textContent = text;
    indicator.style.display = 'flex';
    indicator.style.animation = 'slideInMessage 0.3s ease-out';
}

// === АНИМАЦИИ СМАЙЛИКОВ ===
function createEmojiAnimation(emoji) {
    const overlay = document.getElementById('animations-overlay');
    const emojiElement = document.createElement('div');
    emojiElement.className = 'flying-emoji';
    emojiElement.textContent = emoji;
    
    // Случайная позиция старта справа
    const startX = window.innerWidth + 50;
    const startY = Math.random() * (window.innerHeight - 200) + 100;
    const endX = window.innerWidth / 2;
    const endY = window.innerHeight / 2;
    
    emojiElement.style.left = startX + 'px';
    emojiElement.style.top = startY + 'px';
    
    overlay.appendChild(emojiElement);
    
    // Анимация полёта к центру
    setTimeout(() => {
        emojiElement.style.left = endX + 'px';
        emojiElement.style.top = endY + 'px';
    }, 100);
    
    // Удаляем элемент через 3 секунды
    setTimeout(() => {
        if (emojiElement.parentNode) {
            emojiElement.parentNode.removeChild(emojiElement);
        }
    }, 3000);
}

// === СПЕЦИАЛЬНЫЕ ЭФФЕКТЫ ===
function createSpecialEffect(type) {
    switch (type) {
        case 'confetti':
            createConfetti();
            break;
        case 'fireworks':
            createFireworks();
            break;
        case 'rain':
            createRain();
            break;
        case 'snow':
            createSnow();
            break;
    }
}

function createConfetti() {
    const overlay = document.getElementById('animations-overlay');
    const colors = ['#667eea', '#764ba2', '#f093fb', '#4CAF50', '#ff9800'];
    
    for (let i = 0; i < 50; i++) {
        setTimeout(() => {
            const confetti = document.createElement('div');
            confetti.className = 'confetti-piece';
            confetti.style.left = Math.random() * window.innerWidth + 'px';
            confetti.style.top = '-10px';
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.transform = `rotate(${Math.random() * 360}deg)`;
            
            overlay.appendChild(confetti);
            
            setTimeout(() => {
                if (confetti.parentNode) {
                    confetti.parentNode.removeChild(confetti);
                }
            }, 3000);
        }, i * 50);
    }
}

function createFireworks() {
    const overlay = document.getElementById('animations-overlay');
    const colors = ['#667eea', '#764ba2', '#f093fb', '#ff9800', '#4CAF50'];
    
    for (let i = 0; i < 5; i++) {
        setTimeout(() => {
            const centerX = Math.random() * window.innerWidth;
            const centerY = Math.random() * (window.innerHeight / 2) + 100;
            
            for (let j = 0; j < 20; j++) {
                const firework = document.createElement('div');
                firework.className = 'firework';
                firework.style.left = centerX + 'px';
                firework.style.top = centerY + 'px';
                firework.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
                
                const angle = (j * 18) * Math.PI / 180;
                const distance = 100 + Math.random() * 100;
                const endX = centerX + Math.cos(angle) * distance;
                const endY = centerY + Math.sin(angle) * distance;
                
                overlay.appendChild(firework);
                
                setTimeout(() => {
                    firework.style.left = endX + 'px';
                    firework.style.top = endY + 'px';
                }, 50);
                
                setTimeout(() => {
                    if (firework.parentNode) {
                        firework.parentNode.removeChild(firework);
                    }
                }, 2000);
            }
        }, i * 300);
    }
}

function createRain() {
    const overlay = document.getElementById('animations-overlay');
    
    for (let i = 0; i < 100; i++) {
        setTimeout(() => {
            const drop = document.createElement('div');
            drop.className = 'rain-drop';
            drop.style.left = Math.random() * window.innerWidth + 'px';
            drop.style.top = '-20px';
            drop.style.animationDelay = Math.random() * 2 + 's';
            
            overlay.appendChild(drop);
            
            setTimeout(() => {
                if (drop.parentNode) {
                    drop.parentNode.removeChild(drop);
                }
            }, 2000);
        }, i * 20);
    }
}

function createSnow() {
    const overlay = document.getElementById('animations-overlay');
    const snowflakes = ['❄', '❅', '❆'];
    
    for (let i = 0; i < 50; i++) {
        setTimeout(() => {
            const flake = document.createElement('div');
            flake.className = 'snow-flake';
            flake.textContent = snowflakes[Math.floor(Math.random() * snowflakes.length)];
            flake.style.left = Math.random() * window.innerWidth + 'px';
            flake.style.top = '-30px';
            flake.style.fontSize = (Math.random() * 1 + 0.5) + 'rem';
            flake.style.animationDuration = (Math.random() * 2 + 3) + 's';
            
            overlay.appendChild(flake);
            
            setTimeout(() => {
                if (flake.parentNode) {
                    flake.parentNode.removeChild(flake);
                }
            }, 4000);
        }, i * 100);
    }
}

// === ЭФФЕКТ ОТПРАВКИ ===
function createSendEffect() {
    const sendBtn = document.getElementById('send-btn');
    sendBtn.style.transform = 'scale(0.9)';
    setTimeout(() => {
        sendBtn.style.transform = '';
    }, 150);
}

// === ФОНОВЫЕ ЧАСТИЦЫ ===
function createParticles() {
    const container = document.getElementById('particles-container');
    
    for (let i = 0; i < 5; i++) {
        setTimeout(() => {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.left = Math.random() * window.innerWidth + 'px';
            particle.style.animationDuration = (Math.random() * 3 + 5) + 's';
            
            container.appendChild(particle);
            
            setTimeout(() => {
                if (particle.parentNode) {
                    particle.parentNode.removeChild(particle);
                }
            }, 8000);
        }, i * 200);
    }
}

// === СМЕНА ТЕМЫ ===
function toggleTheme() {
    // Пока у нас только тёмная тема, но можно расширить
    showNotification('Скоро появятся новые темы! 🎨', 'info');
}

// === УВЕДОМЛЕНИЯ ===
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type} notification-bounce`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius);
        color: var(--text-primary);
        backdrop-filter: blur(20px);
        box-shadow: var(--shadow-medium);
        z-index: 10000;
        max-width: 300px;
        word-wrap: break-word;
    `;
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Добавляем искорки к уведомлениям
    createMagicSparkles(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-out forwards';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// === ЗВУКИ ===
function playNotificationSound() {
    const audio = document.getElementById('message-sound');
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {
            // Игнорируем ошибки воспроизведения
        });
    }
}

// === УТИЛИТЫ ===
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updateUserCount(count) {
    const userCountElement = document.getElementById('user-count');
    const word = count === 1 ? 'человек' : count < 5 ? 'человека' : 'человек';
    userCountElement.textContent = `${count} ${word} онлайн`;
}

function showLoginModal() {
    const modal = document.getElementById('login-modal');
    modal.style.display = 'flex';
    document.getElementById('username-input').focus();
}

// === УПРАВЛЕНИЕ ПАНЕЛЬЮ ЭФФЕКТОВ ===
function showEffectsPanel() {
    const panel = document.getElementById('effects-panel');
    panel.style.display = 'block';
    panel.style.animation = 'slideInFromRight 0.3s ease-out';
    effectsPanelVisible = true;
    
    // Создаём эффект появления
    createMagicSparkles(panel);
}

function hideEffectsPanel() {
    const panel = document.getElementById('effects-panel');
    if (effectsPanelVisible) {
        panel.style.animation = 'slideOutToRight 0.3s ease-out';
        setTimeout(() => {
            panel.style.display = 'none';
            effectsPanelVisible = false;
        }, 300);
    }
}

// Скрываем панель при клике вне её
document.addEventListener('click', (e) => {
    const panel = document.getElementById('effects-panel');
    const sendBtn = document.getElementById('send-btn');
    
    if (effectsPanelVisible && 
        !panel.contains(e.target) && 
        !sendBtn.contains(e.target)) {
        hideEffectsPanel();
    }
});

// === CSS АНИМАЦИИ ЧЕРЕЗ JS ===
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            opacity: 0;
            transform: translateX(100%);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }
    
    @keyframes slideOutRight {
        from {
            opacity: 1;
            transform: translateX(0);
        }
        to {
            opacity: 0;
            transform: translateX(100%);
        }
    }
    
    .notification-success {
        border-left: 4px solid var(--success-color);
    }
    
    .notification-warning {
        border-left: 4px solid var(--warning-color);
    }
    
    .notification-info {
        border-left: 4px solid var(--info-color);
    }
    
    .notification-danger {
        border-left: 4px solid var(--danger-color);
    }
`;
document.head.appendChild(style);


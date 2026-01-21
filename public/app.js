// API URL
const API_URL = '/api';

// State
let currentUser = null;
let authToken = null;

// Avatar base URL
const AVATAR_BASE_URL = 'https://forgeblock.onrender.com/faces/';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    checkServerStatus();
    setupForms();
    setupUsernameValidation();
    
    setInterval(checkServerStatus, 30000);
    
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeSettings();
        });
    }
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeSettings();
    });
});

// Username validation
function setupUsernameValidation() {
    const usernameInputs = [
        document.getElementById('regUsername'),
        document.getElementById('newUsername')
    ];
    
    usernameInputs.forEach(input => {
        if (!input) return;
        
        input.addEventListener('input', (e) => {
            const cleaned = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
            if (cleaned !== e.target.value) {
                e.target.value = cleaned;
            }
        });
        
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text');
            const cleaned = text.replace(/[^a-zA-Z0-9_]/g, '');
            document.execCommand('insertText', false, cleaned);
        });
    });
}

function isValidUsername(username) {
    return /^[a-zA-Z0-9_]{3,24}$/.test(username);
}

// Tab switching
function showTab(tab) {
    const loginTab = document.getElementById('loginTab');
    const registerTab = document.getElementById('registerTab');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    
    // Сброс всех сообщений
    clearMessages();
    
    if (tab === 'login') {
        loginTab.classList.add('active');
        registerTab.classList.remove('active');
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
    } else {
        registerTab.classList.add('active');
        loginTab.classList.remove('active');
        registerForm.classList.remove('hidden');
        loginForm.classList.add('hidden');
    }
}

function clearMessages() {
    document.querySelectorAll('.message').forEach(msg => {
        msg.textContent = '';
        msg.className = 'message';
    });
}

function showMessage(elementId, message, isError = true) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = message;
        el.className = 'message ' + (isError ? 'error' : 'success');
    }
}

// Show Auth Section
function showAuthSection() {
    const authSection = document.getElementById('authSection');
    const userSection = document.getElementById('userSection');
    
    if (authSection) {
        authSection.style.display = 'block';
        authSection.classList.remove('hidden');
    }
    if (userSection) {
        userSection.style.display = 'none';
        userSection.classList.add('hidden');
    }
    
    console.log('Showing auth section');
}

// Show User Panel
function showUserPanel() {
    const authSection = document.getElementById('authSection');
    const userSection = document.getElementById('userSection');
    
    // Hide auth section
    if (authSection) {
        authSection.style.display = 'none';
        authSection.classList.add('hidden');
    }
    
    // Show user panel
    if (userSection) {
        userSection.style.display = 'block';
        userSection.classList.remove('hidden');
    }
    
    // Update user data
    const userNameEl = document.getElementById('userName');
    const avatarPlaceholder = document.getElementById('avatarPlaceholder');
    
    if (userNameEl) userNameEl.textContent = currentUser || 'Player';
    if (avatarPlaceholder) {
        avatarPlaceholder.textContent = (currentUser || '?').charAt(0).toUpperCase();
    }
    
    // Load avatar
    if (currentUser) {
        loadPlayerAvatar(currentUser);
    }
    
    console.log('Showing user panel for:', currentUser);
}

// Load Player Avatar
async function loadPlayerAvatar(username) {
    const placeholder = document.getElementById('avatarPlaceholder');
    const loading = document.getElementById('avatarLoading');
    const avatarImg = document.getElementById('userFaceImg');
    
    if (!placeholder || !loading || !avatarImg) return;
    
    // Show loading state
    placeholder.style.display = 'none';
    loading.style.display = 'flex';
    avatarImg.style.display = 'none';
    
    try {
        // Try to load avatar from server
        const avatarUrl = `${AVATAR_BASE_URL}${username}.png?t=${Date.now()}`;
        
        // Create image element and test if it loads
        const img = new Image();
        img.onload = function() {
            avatarImg.src = avatarUrl;
            loading.style.display = 'none';
            avatarImg.style.display = 'block';
        };
        
        img.onerror = function() {
            // If avatar not found, load default
            avatarImg.src = `${AVATAR_BASE_URL}default.png`;
            avatarImg.onload = function() {
                loading.style.display = 'none';
                avatarImg.style.display = 'block';
            };
        };
        
        img.src = avatarUrl;
        
    } catch (error) {
        console.error('Failed to load avatar:', error);
        // Show first letter as fallback
        loading.style.display = 'none';
        placeholder.textContent = username.charAt(0).toUpperCase();
        placeholder.style.display = 'flex';
    }
}

// Settings Modal
function openSettings() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        loadSettings();
    }
}

function closeSettings() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
    clearMessages();
}

async function loadSettings() {
    try {
        const tokenResponse = await fetch(`${API_URL}/get-token`, {
            headers: { 'Authorization': `Bearer ${authToken}` },
            credentials: 'include'
        });
        const tokenData = await tokenResponse.json();
        const authTokenEl = document.getElementById('authToken');
        if (authTokenEl) {
            authTokenEl.textContent = tokenData.token || authToken || 'Error loading token';
        }
        
        const settingsResponse = await fetch(`${API_URL}/settings`, {
            headers: { 'Authorization': `Bearer ${authToken}` },
            credentials: 'include'
        });
        
        if (settingsResponse.ok) {
            const data = await settingsResponse.json();
            
            const userEmail = document.getElementById('userEmail');
            const userJoined = document.getElementById('userJoined');
            const newUsername = document.getElementById('newUsername');
            
            if (userEmail) userEmail.textContent = data.email || '-';
            if (userJoined) {
                const date = new Date(data.createdAt);
                userJoined.textContent = date.toLocaleDateString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric'
                });
            }
            if (newUsername) newUsername.placeholder = data.username;
        }
    } catch (error) {
        console.error('Load settings error:', error);
    }
}

// Setup form handlers
function setupForms() {
    // Login
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const username = document.getElementById('loginUsername').value.trim();
            const password = document.getElementById('loginPassword').value;
            const rememberEl = document.getElementById('rememberMe');
            const remember = rememberEl ? rememberEl.checked : true;
            
            const btn = document.getElementById('loginBtn');
            if (!btn) return;
            
            btn.disabled = true;
            btn.classList.add('loading');
            clearMessages();
            
            try {
                const response = await fetch(`${API_URL}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ username, password, remember })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showMessage('loginMessage', 'Login successful!', false);
                    
                    authToken = data.token;
                    currentUser = data.username;
                    
                    if (remember) {
                        localStorage.setItem('authToken', data.token);
                        localStorage.setItem('username', data.username);
                    }
                    
                    // Switch to user panel
                    setTimeout(() => {
                        showUserPanel();
                    }, 300);
                } else {
                    showMessage('loginMessage', data.message || 'Login failed');
                }
            } catch (error) {
                console.error('Login error:', error);
                showMessage('loginMessage', 'Connection error. Please try again.');
            }
            
            btn.disabled = false;
            btn.classList.remove('loading');
        });
    }
    
    // Register
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const username = document.getElementById('regUsername').value.trim();
            const email = document.getElementById('regEmail').value.trim();
            const password = document.getElementById('regPassword').value;
            const confirm = document.getElementById('regConfirm').value;
            
            if (password !== confirm) {
                showMessage('registerMessage', 'Passwords do not match');
                return;
            }
            
            if (!isValidUsername(username)) {
                showMessage('registerMessage', 'Username: 3-24 chars, only a-z, 0-9, _');
                return;
            }
            
            const btn = document.getElementById('registerBtn');
            if (!btn) return;
            
            btn.disabled = true;
            btn.classList.add('loading');
            clearMessages();
            
            try {
                const response = await fetch(`${API_URL}/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, email, password })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showMessage('registerMessage', 'Account created! Logging in...', false);
                    
                    // Auto-login after registration
                    setTimeout(async () => {
                        try {
                            const loginResponse = await fetch(`${API_URL}/login`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                credentials: 'include',
                                body: JSON.stringify({ username, password, remember: true })
                            });
                            
                            const loginData = await loginResponse.json();
                            
                            if (loginData.success) {
                                authToken = loginData.token;
                                currentUser = loginData.username;
                                localStorage.setItem('authToken', loginData.token);
                                localStorage.setItem('username', loginData.username);
                                
                                // Switch to user panel
                                showUserPanel();
                            } else {
                                // If auto-login fails - switch to login tab
                                showTab('login');
                                document.getElementById('loginUsername').value = username;
                                showMessage('loginMessage', 'Please login with your new account', false);
                            }
                        } catch (err) {
                            console.error('Auto-login error:', err);
                            showTab('login');
                            document.getElementById('loginUsername').value = username;
                        }
                    }, 500);
                } else {
                    showMessage('registerMessage', data.message || 'Registration failed');
                }
            } catch (error) {
                console.error('Register error:', error);
                showMessage('registerMessage', 'Connection error. Please try again.');
            }
            
            btn.disabled = false;
            btn.classList.remove('loading');
        });
    }
    
    // Change Username Form
    const changeUsernameForm = document.getElementById('changeUsernameForm');
    if (changeUsernameForm) {
        changeUsernameForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const newUsername = document.getElementById('newUsername').value.trim();
            const password = document.getElementById('confirmPassword').value;
            
            if (!isValidUsername(newUsername)) {
                showMessage('usernameChangeMessage', 'Username: 3-24 chars, only a-z, 0-9, _');
                return;
            }
            
            const btn = changeUsernameForm.querySelector('button[type="submit"]');
            if (btn) {
                btn.disabled = true;
                btn.classList.add('loading');
            }
            
            try {
                const response = await fetch(`${API_URL}/change-username`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authToken}`
                    },
                    credentials: 'include',
                    body: JSON.stringify({ newUsername, password })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showMessage('usernameChangeMessage', 'Username changed!', false);
                    
                    currentUser = data.newUsername;
                    authToken = data.newToken;
                    localStorage.setItem('authToken', data.newToken);
                    localStorage.setItem('username', data.newUsername);
                    
                    const userName = document.getElementById('userName');
                    const avatarPlaceholder = document.getElementById('avatarPlaceholder');
                    if (userName) userName.textContent = data.newUsername;
                    if (avatarPlaceholder) avatarPlaceholder.textContent = data.newUsername.charAt(0).toUpperCase();
                    
                    document.getElementById('newUsername').value = '';
                    document.getElementById('confirmPassword').value = '';
                    
                    setTimeout(() => loadSettings(), 500);
                } else {
                    showMessage('usernameChangeMessage', data.message || 'Failed');
                }
            } catch (error) {
                console.error('Change username error:', error);
                showMessage('usernameChangeMessage', 'Connection error');
            }
            
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('loading');
            }
        });
    }
}

// Check existing session
async function checkSession() {
    const savedToken = localStorage.getItem('authToken');
    const savedUser = localStorage.getItem('username');
    
    if (!savedToken || !savedUser) {
        showAuthSection();
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/verify`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${savedToken}`
            },
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.valid) {
            authToken = savedToken;
            currentUser = data.username || savedUser;
            showUserPanel();
        } else {
            localStorage.removeItem('authToken');
            localStorage.removeItem('username');
            showAuthSection();
        }
    } catch (error) {
        console.error('Session check error:', error);
        authToken = savedToken;
        currentUser = savedUser;
        showUserPanel();
    }
}

// Copy token
function copyToken() {
    const tokenEl = document.getElementById('authToken');
    if (!tokenEl) return;
    
    const token = tokenEl.textContent;
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(token).then(() => {
            showCopySuccess();
        }).catch(() => {
            fallbackCopy(token);
        });
    } else {
        fallbackCopy(token);
    }
}

function fallbackCopy(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
        document.execCommand('copy');
        showCopySuccess();
    } catch (err) {
        console.error('Copy failed:', err);
    }
    document.body.removeChild(textArea);
}

function showCopySuccess() {
    const btns = document.querySelectorAll('.token-display .btn-small');
    btns.forEach(btn => {
        const originalText = btn.textContent;
        btn.textContent = 'COPIED!';
        btn.style.background = '#238636';
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '';
        }, 2000);
    });
}

// Logout
async function logout() {
    try {
        await fetch(`${API_URL}/logout`, {
            method: 'POST',
            credentials: 'include'
        });
    } catch (e) {
        console.error('Logout error:', e);
    }
    
    localStorage.removeItem('authToken');
    localStorage.removeItem('username');
    authToken = null;
    currentUser = null;
    
    closeSettings();
    showAuthSection();
    
    const loginUsername = document.getElementById('loginUsername');
    const loginPassword = document.getElementById('loginPassword');
    if (loginUsername) loginUsername.value = '';
    if (loginPassword) loginPassword.value = '';
    clearMessages();
}

// Check server status
async function checkServerStatus() {
    const statusEl = document.getElementById('serverStatus');
    const usersEl = document.getElementById('totalUsers');
    
    try {
        const response = await fetch(`${API_URL}/status`);
        const data = await response.json();
        
        if (statusEl) {
            if (data.online) {
                statusEl.textContent = 'Online';
                statusEl.className = 'status-value online';
            } else {
                statusEl.textContent = 'Offline';
                statusEl.className = 'status-value offline';
            }
        }
        
        if (usersEl) usersEl.textContent = data.players || 0;
        
    } catch (error) {
        console.error('Status check error:', error);
        if (statusEl) {
            statusEl.textContent = 'Error';
            statusEl.className = 'status-value offline';
        }
    }
}
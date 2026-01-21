// API URL
const API_URL = '/api';

// State
let currentUser = null;
let authToken = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    checkServerStatus();
    setupForms();
    setupUsernameValidation();
    
    // Check status periodically
    setInterval(checkServerStatus, 30000);
    
    // Close modal on overlay click
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeSettings();
            }
        });
    }
    
    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeSettings();
        }
    });
});

// Username validation - only allow letters, numbers, underscore
function setupUsernameValidation() {
    const usernameInputs = [
        document.getElementById('regUsername'),
        document.getElementById('newUsername')
    ];
    
    usernameInputs.forEach(input => {
        if (!input) return;
        
        input.addEventListener('input', (e) => {
            // Remove any characters that aren't allowed
            const cleaned = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
            if (cleaned !== e.target.value) {
                e.target.value = cleaned;
            }
        });
        
        // Prevent paste of invalid characters
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text');
            const cleaned = text.replace(/[^a-zA-Z0-9_]/g, '');
            document.execCommand('insertText', false, cleaned);
        });
    });
}

// Validate username
function isValidUsername(username) {
    return /^[a-zA-Z0-9_]{3,24}$/.test(username);
}

// Tab switching
function showTab(tab) {
    const loginTab = document.getElementById('loginTab');
    const registerTab = document.getElementById('registerTab');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    
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
    
    clearMessages();
}

function clearMessages() {
    const messages = document.querySelectorAll('.message');
    messages.forEach(msg => {
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

// Show auth section
function showAuthSection() {
    const authSection = document.getElementById('authSection');
    const userSection = document.getElementById('userSection');
    
    if (authSection) authSection.classList.remove('hidden');
    if (userSection) userSection.classList.add('hidden');
}

// Show user panel
function showUserPanel() {
    const authSection = document.getElementById('authSection');
    const userSection = document.getElementById('userSection');
    
    if (authSection) authSection.classList.add('hidden');
    if (userSection) userSection.classList.remove('hidden');
    
    const userName = document.getElementById('userName');
    const userAvatar = document.getElementById('userAvatar');
    
    if (userName) userName.textContent = currentUser || 'Player';
    if (userAvatar) userAvatar.textContent = (currentUser || '?').charAt(0).toUpperCase();
}

// Settings Modal
function openSettings() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.classList.remove('hidden');
        loadSettings();
    }
}

function closeSettings() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.classList.add('hidden');
    }
    clearMessages();
}

async function loadSettings() {
    try {
        // Load token
        const tokenResponse = await fetch(`${API_URL}/get-token`, {
            headers: { 'Authorization': `Bearer ${authToken}` },
            credentials: 'include'
        });
        const tokenData = await tokenResponse.json();
        const authTokenEl = document.getElementById('authToken');
        if (authTokenEl) {
            authTokenEl.textContent = tokenData.token || authToken || 'Error loading token';
        }
        
        // Load user info
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
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
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
                    
                    setTimeout(() => showUserPanel(), 500);
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
            
            // Validation
            if (password !== confirm) {
                showMessage('registerMessage', 'Passwords do not match');
                return;
            }
            
            if (!isValidUsername(username)) {
                showMessage('registerMessage', 'Username: 3-24 characters, only letters (a-z), numbers, underscore');
                return;
            }
            
            const btn = document.getElementById('registerBtn');
            if (!btn) return;
            
            btn.disabled = true;
            btn.classList.add('loading');
            
            try {
                const response = await fetch(`${API_URL}/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, email, password })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showMessage('registerMessage', 'Account created! Logging in...', false);
                    
                    // Auto-login
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
                                showUserPanel();
                            } else {
                                showTab('login');
                                const loginUsername = document.getElementById('loginUsername');
                                if (loginUsername) loginUsername.value = username;
                            }
                        } catch (err) {
                            console.error('Auto-login error:', err);
                            showTab('login');
                        }
                    }, 1000);
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
                showMessage('usernameChangeMessage', 'Username: 3-24 characters, only letters (a-z), numbers, underscore');
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
                    showMessage('usernameChangeMessage', 'Username changed successfully!', false);
                    
                    // Update local state
                    currentUser = data.newUsername;
                    authToken = data.newToken;
                    localStorage.setItem('authToken', data.newToken);
                    localStorage.setItem('username', data.newUsername);
                    
                    // Update UI
                    const userName = document.getElementById('userName');
                    const userAvatar = document.getElementById('userAvatar');
                    if (userName) userName.textContent = data.newUsername;
                    if (userAvatar) userAvatar.textContent = data.newUsername.charAt(0).toUpperCase();
                    
                    // Clear form
                    document.getElementById('newUsername').value = '';
                    document.getElementById('confirmPassword').value = '';
                    
                    // Reload settings
                    setTimeout(() => loadSettings(), 500);
                } else {
                    showMessage('usernameChangeMessage', data.message || 'Failed to change username');
                }
            } catch (error) {
                console.error('Change username error:', error);
                showMessage('usernameChangeMessage', 'Connection error. Please try again.');
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
        // Network error - use cached data
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
    
    // Clear forms
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
    const dbEl = document.getElementById('dbStatus');
    
    try {
        const response = await fetch(`${API_URL}/status`);
        const data = await response.json();
        
        if (statusEl) {
            if (data.online) {
                statusEl.textContent = '● Online';
                statusEl.className = 'status-value online';
            } else {
                statusEl.textContent = '● Offline';
                statusEl.className = 'status-value offline';
            }
        }
        
        if (usersEl) {
            usersEl.textContent = data.players || 0;
        }
        
        if (dbEl) {
            dbEl.textContent = data.database || 'unknown';
            dbEl.className = 'status-value ' + (data.database === 'connected' ? 'online' : 'offline');
        }
        
    } catch (error) {
        console.error('Status check error:', error);
        if (statusEl) {
            statusEl.textContent = '● Error';
            statusEl.className = 'status-value offline';
        }
        if (dbEl) {
            dbEl.textContent = 'error';
            dbEl.className = 'status-value offline';
        }
    }
}
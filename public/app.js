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
    
    // Check status periodically
    setInterval(checkServerStatus, 30000);
});

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
    const loginMsg = document.getElementById('loginMessage');
    const regMsg = document.getElementById('registerMessage');
    if (loginMsg) {
        loginMsg.textContent = '';
        loginMsg.className = 'message';
    }
    if (regMsg) {
        regMsg.textContent = '';
        regMsg.className = 'message';
    }
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
    const authTokenEl = document.getElementById('authToken');
    
    if (userName) userName.textContent = currentUser || 'Player';
    if (userAvatar) userAvatar.textContent = (currentUser || '?').charAt(0).toUpperCase();
    if (authTokenEl) authTokenEl.textContent = authToken || 'Error loading token';
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
            
            const originalText = btn.textContent;
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
                    
                    // Save to localStorage
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
            btn.textContent = originalText;
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
            
            if (!/^[a-zA-Z0-9_]+$/.test(username)) {
                showMessage('registerMessage', 'Username: only letters, numbers, underscore');
                return;
            }
            
            const btn = document.getElementById('registerBtn');
            if (!btn) return;
            
            const originalText = btn.textContent;
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
            btn.textContent = originalText;
        });
    }
}

// Check existing session
async function checkSession() {
    // Try localStorage first
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
            // Token invalid, clear storage
            localStorage.removeItem('authToken');
            localStorage.removeItem('username');
            showAuthSection();
        }
    } catch (error) {
        console.error('Session check error:', error);
        // Network error - try to use cached data anyway for offline support
        // Or show auth section
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
    navigator.clipboard.writeText(token).then(() => {
        const btn = document.getElementById('copyBtn');
        if (btn) {
            btn.textContent = 'COPIED!';
            btn.style.background = '#238636';
            setTimeout(() => {
                btn.textContent = 'COPY';
                btn.style.background = '';
            }, 2000);
        }
    }).catch(err => {
        console.error('Copy failed:', err);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = token;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
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
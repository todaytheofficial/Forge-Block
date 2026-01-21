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
    document.getElementById('loginMessage').textContent = '';
    document.getElementById('loginMessage').className = 'message';
    document.getElementById('registerMessage').textContent = '';
    document.getElementById('registerMessage').className = 'message';
}

function showMessage(elementId, message, isError = true) {
    const el = document.getElementById(elementId);
    el.textContent = message;
    el.className = 'message ' + (isError ? 'error' : 'success');
}

// Setup form handlers
function setupForms() {
    // Login
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;
        const remember = document.getElementById('rememberMe').checked;
        
        const btn = document.getElementById('loginBtn');
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
                
                // Save to localStorage as backup
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
    
    // Register
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
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
                        document.getElementById('loginUsername').value = username;
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

// Check existing session
async function checkSession() {
    // Try localStorage first
    const savedToken = localStorage.getItem('authToken');
    const savedUser = localStorage.getItem('username');
    
    if (savedToken && savedUser) {
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
                currentUser = data.username;
                showUserPanel();
                return;
            }
        } catch (error) {
            console.error('Session check error:', error);
        }
        
        // Token invalid, clear storage
        localStorage.removeItem('authToken');
        localStorage.removeItem('username');
    }
}

// Show user panel
function showUserPanel() {
    document.getElementById('authSection').classList.add('hidden');
    document.getElementById('userSection').classList.remove('hidden');
    
    document.getElementById('userName').textContent = currentUser;
    document.getElementById('userAvatar').textContent = currentUser.charAt(0).toUpperCase();
    document.getElementById('authToken').textContent = authToken || 'Error loading token';
}

// Copy token
function copyToken() {
    const token = document.getElementById('authToken').textContent;
    navigator.clipboard.writeText(token).then(() => {
        const btn = document.getElementById('copyBtn');
        btn.textContent = 'COPIED!';
        btn.style.background = '#238636';
        setTimeout(() => {
            btn.textContent = 'COPY';
            btn.style.background = '';
        }, 2000);
    }).catch(err => {
        console.error('Copy failed:', err);
    });
}

// Logout
async function logout() {
    try {
        await fetch(`${API_URL}/logout`, {
            method: 'POST',
            credentials: 'include'
        });
    } catch (e) {}
    
    localStorage.removeItem('authToken');
    localStorage.removeItem('username');
    authToken = null;
    currentUser = null;
    
    document.getElementById('authSection').classList.remove('hidden');
    document.getElementById('userSection').classList.add('hidden');
    
    // Clear forms
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
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
        
        if (data.online) {
            statusEl.textContent = '● Online';
            statusEl.className = 'status-value online';
        } else {
            statusEl.textContent = '● Offline';
            statusEl.className = 'status-value offline';
        }
        
        usersEl.textContent = data.players || 0;
        dbEl.textContent = data.database || 'unknown';
        dbEl.className = 'status-value ' + (data.database === 'connected' ? 'online' : 'offline');
        
    } catch (error) {
        statusEl.textContent = '● Error';
        statusEl.className = 'status-value offline';
        dbEl.textContent = 'error';
        dbEl.className = 'status-value offline';
    }
}
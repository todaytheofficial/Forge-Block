// API Base URL - change this to your Render deployment URL
const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api' 
    : 'https://your-app-name.onrender.com/api';

// State
let currentUser = null;
let authToken = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    checkServerStatus();
    setupForms();
    
    // Check server status every 30 seconds
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
    
    // Clear messages
    document.getElementById('loginMessage').textContent = '';
    document.getElementById('registerMessage').textContent = '';
}

// Setup form handlers
function setupForms() {
    // Login form
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;
        const remember = document.getElementById('rememberMe').checked;
        
        const btn = e.target.querySelector('button[type="submit"]');
        const msg = document.getElementById('loginMessage');
        
        btn.disabled = true;
        btn.classList.add('loading');
        btn.textContent = '';
        
        try {
            const response = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, remember })
            });
            
            const data = await response.json();
            
            if (data.success) {
                msg.textContent = 'Login successful!';
                msg.className = 'message success';
                
                // Save token
                if (remember) {
                    localStorage.setItem('authToken', data.token);
                    localStorage.setItem('username', data.username);
                } else {
                    sessionStorage.setItem('authToken', data.token);
                    sessionStorage.setItem('username', data.username);
                }
                
                authToken = data.token;
                currentUser = data.username;
                
                setTimeout(() => showUserPanel(), 500);
            } else {
                msg.textContent = data.message || 'Login failed';
                msg.className = 'message error';
            }
        } catch (error) {
            msg.textContent = 'Connection error. Try again.';
            msg.className = 'message error';
            console.error('Login error:', error);
        }
        
        btn.disabled = false;
        btn.classList.remove('loading');
        btn.textContent = 'LOGIN';
    });
    
    // Register form
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('regUsername').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const password = document.getElementById('regPassword').value;
        const confirm = document.getElementById('regConfirm').value;
        
        const btn = e.target.querySelector('button[type="submit"]');
        const msg = document.getElementById('registerMessage');
        
        // Validation
        if (password !== confirm) {
            msg.textContent = 'Passwords do not match';
            msg.className = 'message error';
            return;
        }
        
        if (username.length < 3) {
            msg.textContent = 'Username must be at least 3 characters';
            msg.className = 'message error';
            return;
        }
        
        btn.disabled = true;
        btn.classList.add('loading');
        btn.textContent = '';
        
        try {
            const response = await fetch(`${API_URL}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password })
            });
            
            const data = await response.json();
            
            if (data.success) {
                msg.textContent = 'Registration successful! You can now login.';
                msg.className = 'message success';
                
                // Switch to login tab after 2 seconds
                setTimeout(() => {
                    showTab('login');
                    document.getElementById('loginUsername').value = username;
                }, 2000);
            } else {
                msg.textContent = data.message || 'Registration failed';
                msg.className = 'message error';
            }
        } catch (error) {
            msg.textContent = 'Connection error. Try again.';
            msg.className = 'message error';
            console.error('Register error:', error);
        }
        
        btn.disabled = false;
        btn.classList.remove('loading');
        btn.textContent = 'REGISTER';
    });
}

// Check if already authenticated
function checkAuth() {
    authToken = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
    currentUser = localStorage.getItem('username') || sessionStorage.getItem('username');
    
    if (authToken && currentUser) {
        // Verify token is still valid
        verifyToken();
    }
}

// Verify token with server
async function verifyToken() {
    try {
        const response = await fetch(`${API_URL}/verify`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.valid) {
            showUserPanel();
        } else {
            // Token invalid, clear storage
            logout(false);
        }
    } catch (error) {
        console.error('Token verification error:', error);
    }
}

// Show user panel after login
function showUserPanel() {
    document.getElementById('authSection').classList.add('hidden');
    document.getElementById('guestDownload').classList.add('hidden');
    document.getElementById('userSection').classList.remove('hidden');
    
    // Set user info
    document.getElementById('userName').textContent = currentUser;
    document.getElementById('userAvatar').textContent = currentUser.charAt(0).toUpperCase();
    document.getElementById('authToken').textContent = authToken;
}

// Copy token to clipboard
function copyToken() {
    navigator.clipboard.writeText(authToken).then(() => {
        const btn = document.querySelector('.btn-copy');
        btn.textContent = 'COPIED!';
        setTimeout(() => btn.textContent = 'COPY', 2000);
    });
}

// Download game with token
function downloadGame() {
    // Create a special download link with token embedded
    // The token will be saved to a config file in the game directory
    
    // Option 1: Download ZIP with embedded token config
    const tokenData = {
        username: currentUser,
        token: authToken,
        timestamp: Date.now()
    };
    
    // Create token file content
    const tokenContent = btoa(JSON.stringify(tokenData));
    
    // Store in localStorage for the download handler
    localStorage.setItem('downloadToken', tokenContent);
    
    // Trigger download
    window.location.href = `${API_URL}/download?token=${encodeURIComponent(authToken)}`;
}

// Logout
function logout(redirect = true) {
    localStorage.removeItem('authToken');
    localStorage.removeItem('username');
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('username');
    
    authToken = null;
    currentUser = null;
    
    if (redirect) {
        document.getElementById('authSection').classList.remove('hidden');
        document.getElementById('guestDownload').classList.remove('hidden');
        document.getElementById('userSection').classList.add('hidden');
        
        // Clear form fields
        document.getElementById('loginUsername').value = '';
        document.getElementById('loginPassword').value = '';
    }
}

// Check server status
async function checkServerStatus() {
    const statusEl = document.getElementById('serverStatus');
    const playersEl = document.getElementById('playersOnline');
    
    try {
        const response = await fetch(`${API_URL}/status`);
        const data = await response.json();
        
        if (data.online) {
            statusEl.textContent = '● Online';
            statusEl.className = 'online';
            playersEl.textContent = data.players || 0;
        } else {
            statusEl.textContent = '● Offline';
            statusEl.className = 'offline';
            playersEl.textContent = '0';
        }
    } catch (error) {
        statusEl.textContent = '● Offline';
        statusEl.className = 'offline';
        playersEl.textContent = '0';
    }
}
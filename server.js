require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Create faces directory
const FACES_DIR = path.join(__dirname, 'public', 'faces');
if (!fs.existsSync(FACES_DIR)) {
    fs.mkdirSync(FACES_DIR, { recursive: true });
}

// Middleware
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/faces', express.static(FACES_DIR));

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'forgeblock-secret-key-change-in-production';

// MySQL Connection Pool
let pool = null;

async function createPool() {
    try {
        pool = mysql.createPool({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
        });
        
        const conn = await pool.getConnection();
        console.log('MySQL connected successfully');
        conn.release();
        
        return true;
    } catch (error) {
        console.error('MySQL connection error:', error.message);
        return false;
    }
}

// Initialize database tables
async function initDatabase() {
    if (!pool) {
        console.log('No database connection, using memory storage');
        return false;
    }
    
    try {
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(32) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                face VARCHAR(255) DEFAULT 'default.png',
                auth_token VARCHAR(512),
                token_expires DATETIME,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP NULL,
                is_banned BOOLEAN DEFAULT FALSE,
                INDEX idx_username (username),
                INDEX idx_token (auth_token(255))
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        
        try {
            await pool.execute(`ALTER TABLE users ADD COLUMN face VARCHAR(255) DEFAULT 'default.png'`);
            console.log('Added face column to users table');
        } catch (e) {
            // Column exists
        }
        
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS player_data (
                user_id INT PRIMARY KEY,
                place_id TINYINT DEFAULT 1,
                pos_x FLOAT DEFAULT 0,
                pos_y FLOAT DEFAULT 5,
                pos_z FLOAT DEFAULT 0,
                play_time INT DEFAULT 0,
                last_save TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        
        console.log('Database tables initialized');
        return true;
    } catch (error) {
        console.error('Database init error:', error.message);
        return false;
    }
}

// In-memory fallback storage
const memoryUsers = new Map();
let memoryIdCounter = 1;

// Generate JWT token
function generateToken(userId, username) {
    return jwt.sign(
        { userId, username, iat: Date.now() },
        JWT_SECRET,
        { expiresIn: '30d' }
    );
}

// Verify JWT token
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (e) {
        return null;
    }
}

// Auth middleware
function authMiddleware(req, res, next) {
    const token = req.cookies.authToken || req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Invalid token' });
    }
    
    req.user = decoded;
    next();
}

// Validate username (only letters, numbers, underscore - no spaces, emoji, cyrillic)
function isValidUsername(username) {
    return /^[a-zA-Z0-9_]{3,24}$/.test(username);
}

// Cookie options
const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000
};

// ==================== API ROUTES ====================

// Register
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        if (!username || !email || !password) {
            return res.json({ success: false, message: 'All fields are required' });
        }
        
        if (!isValidUsername(username)) {
            return res.json({ success: false, message: 'Username: 3-24 characters, only letters, numbers, underscore. No spaces or special characters.' });
        }
        
        if (password.length < 4) {
            return res.json({ success: false, message: 'Password must be at least 4 characters' });
        }
        
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.json({ success: false, message: 'Invalid email format' });
        }
        
        const passwordHash = await bcrypt.hash(password, 10);
        
        if (pool) {
            const [existing] = await pool.execute(
                'SELECT id FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)',
                [username, email]
            );
            
            if (existing.length > 0) {
                return res.json({ success: false, message: 'Username or email already exists' });
            }
            
            const [result] = await pool.execute(
                'INSERT INTO users (username, email, password_hash, face) VALUES (?, ?, ?, ?)',
                [username, email.toLowerCase(), passwordHash, 'default.png']
            );
            
            await pool.execute(
                'INSERT INTO player_data (user_id) VALUES (?)',
                [result.insertId]
            );
            
            console.log(`User registered: ${username} (ID: ${result.insertId})`);
        } else {
            const lowerUsername = username.toLowerCase();
            const lowerEmail = email.toLowerCase();
            
            for (const [, user] of memoryUsers) {
                if (user.username.toLowerCase() === lowerUsername || user.email === lowerEmail) {
                    return res.json({ success: false, message: 'Username or email already exists' });
                }
            }
            
            const userId = memoryIdCounter++;
            memoryUsers.set(userId, {
                id: userId,
                username,
                email: lowerEmail,
                passwordHash,
                face: 'default.png',
                createdAt: new Date()
            });
            
            console.log(`User registered (memory): ${username} (ID: ${userId})`);
        }
        
        res.json({ success: true, message: 'Registration successful! You can now login.' });
        
    } catch (error) {
        console.error('Register error:', error);
        res.json({ success: false, message: 'Registration failed. Please try again.' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password, remember } = req.body;
        
        if (!username || !password) {
            return res.json({ success: false, message: 'Username and password required' });
        }
        
        let user = null;
        
        if (pool) {
            const [users] = await pool.execute(
                'SELECT id, username, password_hash, face, is_banned FROM users WHERE username = ?',
                [username]
            );
            
            if (users.length > 0) {
                user = users[0];
            }
        } else {
            for (const [, u] of memoryUsers) {
                if (u.username.toLowerCase() === username.toLowerCase()) {
                    user = { id: u.id, username: u.username, password_hash: u.passwordHash, face: u.face };
                    break;
                }
            }
        }
        
        if (!user) {
            return res.json({ success: false, message: 'Invalid username or password' });
        }
        
        if (user.is_banned) {
            return res.json({ success: false, message: 'Account is banned' });
        }
        
        const validPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!validPassword) {
            return res.json({ success: false, message: 'Invalid username or password' });
        }
        
        const token = generateToken(user.id, user.username);
        
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + (remember ? 30 : 1));
        
        if (pool) {
            await pool.execute(
                'UPDATE users SET auth_token = ?, token_expires = ?, last_login = NOW() WHERE id = ?',
                [token, expiresAt, user.id]
            );
        }
        
        if (remember) {
            res.cookie('authToken', token, cookieOptions);
            res.cookie('username', user.username, { ...cookieOptions, httpOnly: false });
        }
        
        console.log(`User logged in: ${user.username}`);
        
        res.json({
            success: true,
            message: 'Login successful',
            token,
            username: user.username,
            userId: user.id,
            face: user.face || 'default.png'
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.json({ success: false, message: 'Login failed' });
    }
});

// Verify token
app.post('/api/verify', async (req, res) => {
    try {
        const token = req.cookies.authToken || req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.json({ valid: false });
        }
        
        const decoded = verifyToken(token);
        if (!decoded) {
            return res.json({ valid: false });
        }
        
        if (pool) {
            const [users] = await pool.execute(
                'SELECT id, username, face, token_expires, is_banned FROM users WHERE id = ? AND auth_token = ?',
                [decoded.userId, token]
            );
            
            if (users.length === 0 || users[0].is_banned) {
                return res.json({ valid: false });
            }
            
            const user = users[0];
            if (user.token_expires && new Date(user.token_expires) < new Date()) {
                return res.json({ valid: false });
            }
            
            res.json({
                valid: true,
                username: user.username,
                userId: user.id,
                face: user.face || 'default.png'
            });
        } else {
            res.json({ valid: true, username: decoded.username, userId: decoded.userId, face: 'default.png' });
        }
        
    } catch (error) {
        console.error('Verify error:', error);
        res.json({ valid: false });
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    res.clearCookie('authToken');
    res.clearCookie('username');
    res.json({ success: true });
});

// ==================== SETTINGS API ====================

// Get user settings
app.get('/api/settings', authMiddleware, async (req, res) => {
    try {
        if (pool) {
            const [users] = await pool.execute(
                'SELECT username, email, face, created_at FROM users WHERE id = ?',
                [req.user.userId]
            );
            
            if (users.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }
            
            res.json({
                username: users[0].username,
                email: users[0].email,
                face: users[0].face || 'default.png',
                createdAt: users[0].created_at
            });
        } else {
            const user = memoryUsers.get(req.user.userId);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            res.json({
                username: user.username,
                email: user.email,
                face: user.face || 'default.png',
                createdAt: user.createdAt
            });
        }
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ error: 'Failed to get settings' });
    }
});

// Change username
app.post('/api/change-username', authMiddleware, async (req, res) => {
    try {
        const { newUsername, password } = req.body;
        
        if (!newUsername || !password) {
            return res.json({ success: false, message: 'Username and password required' });
        }
        
        // Validate new username
        if (!isValidUsername(newUsername)) {
            return res.json({ success: false, message: 'Username: 3-24 characters, only letters (a-z), numbers, underscore. No spaces, emoji or special characters.' });
        }
        
        if (pool) {
            // Get current user
            const [users] = await pool.execute(
                'SELECT id, username, password_hash FROM users WHERE id = ?',
                [req.user.userId]
            );
            
            if (users.length === 0) {
                return res.json({ success: false, message: 'User not found' });
            }
            
            // Verify password
            const validPassword = await bcrypt.compare(password, users[0].password_hash);
            if (!validPassword) {
                return res.json({ success: false, message: 'Invalid password' });
            }
            
            // Check if new username is taken
            const [existing] = await pool.execute(
                'SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ?',
                [newUsername, req.user.userId]
            );
            
            if (existing.length > 0) {
                return res.json({ success: false, message: 'Username already taken' });
            }
            
            // Update username
            await pool.execute(
                'UPDATE users SET username = ? WHERE id = ?',
                [newUsername, req.user.userId]
            );
            
            // Generate new token with new username
            const newToken = generateToken(req.user.userId, newUsername);
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 30);
            
            await pool.execute(
                'UPDATE users SET auth_token = ?, token_expires = ? WHERE id = ?',
                [newToken, expiresAt, req.user.userId]
            );
            
            res.cookie('authToken', newToken, cookieOptions);
            res.cookie('username', newUsername, { ...cookieOptions, httpOnly: false });
            
            console.log(`Username changed: ${users[0].username} -> ${newUsername}`);
            
            res.json({ 
                success: true, 
                message: 'Username changed successfully',
                newUsername,
                newToken
            });
        } else {
            const user = memoryUsers.get(req.user.userId);
            if (!user) {
                return res.json({ success: false, message: 'User not found' });
            }
            
            const validPassword = await bcrypt.compare(password, user.passwordHash);
            if (!validPassword) {
                return res.json({ success: false, message: 'Invalid password' });
            }
            
            // Check if taken
            for (const [id, u] of memoryUsers) {
                if (id !== req.user.userId && u.username.toLowerCase() === newUsername.toLowerCase()) {
                    return res.json({ success: false, message: 'Username already taken' });
                }
            }
            
            user.username = newUsername;
            const newToken = generateToken(req.user.userId, newUsername);
            
            res.json({ 
                success: true, 
                message: 'Username changed successfully',
                newUsername,
                newToken
            });
        }
    } catch (error) {
        console.error('Change username error:', error);
        res.json({ success: false, message: 'Failed to change username' });
    }
});

// Get auth token (for settings page)
app.get('/api/get-token', authMiddleware, async (req, res) => {
    try {
        const token = req.cookies.authToken || req.headers.authorization?.replace('Bearer ', '');
        res.json({ token });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get token' });
    }
});

// ==================== FACE API ====================

app.get('/api/face/:username', async (req, res) => {
    try {
        const { username } = req.params;
        
        if (pool) {
            const [users] = await pool.execute(
                'SELECT face FROM users WHERE username = ?',
                [username]
            );
            
            if (users.length === 0) {
                return res.json({ face: 'default.png' });
            }
            
            res.json({ face: users[0].face || 'default.png' });
        } else {
            for (const [, u] of memoryUsers) {
                if (u.username.toLowerCase() === username.toLowerCase()) {
                    return res.json({ face: u.face || 'default.png' });
                }
            }
            res.json({ face: 'default.png' });
        }
    } catch (error) {
        console.error('Get face error:', error);
        res.json({ face: 'default.png' });
    }
});

const upload = multer({
    storage: multer.diskStorage({
        destination: FACES_DIR,
        filename: (req, file, cb) => {
            const uniqueName = `face_${req.user.userId}_${Date.now()}.png`;
            cb(null, uniqueName);
        }
    }),
    limits: { fileSize: 256 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'image/png') {
            cb(null, true);
        } else {
            cb(new Error('Only PNG files allowed'));
        }
    }
});

app.post('/api/upload-face', authMiddleware, upload.single('face'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        
        const faceFilename = req.file.filename;
        
        if (pool) {
            const [old] = await pool.execute('SELECT face FROM users WHERE id = ?', [req.user.userId]);
            if (old.length > 0 && old[0].face && old[0].face !== 'default.png') {
                const oldPath = path.join(FACES_DIR, old[0].face);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }
            
            await pool.execute(
                'UPDATE users SET face = ? WHERE id = ?',
                [faceFilename, req.user.userId]
            );
        } else {
            const user = memoryUsers.get(req.user.userId);
            if (user) {
                user.face = faceFilename;
            }
        }
        
        console.log(`User ${req.user.username} uploaded face: ${faceFilename}`);
        
        res.json({ success: true, face: faceFilename });
    } catch (error) {
        console.error('Upload face error:', error);
        res.status(500).json({ success: false, message: 'Upload failed' });
    }
});

app.get('/api/my-face', authMiddleware, async (req, res) => {
    try {
        if (pool) {
            const [users] = await pool.execute(
                'SELECT face FROM users WHERE id = ?',
                [req.user.userId]
            );
            res.json({ face: users[0]?.face || 'default.png' });
        } else {
            const user = memoryUsers.get(req.user.userId);
            res.json({ face: user?.face || 'default.png' });
        }
    } catch (error) {
        res.json({ face: 'default.png' });
    }
});

// ==================== GAME SERVER API ====================

app.post('/api/game-auth', async (req, res) => {
    try {
        const { token } = req.body;
        
        if (!token) {
            return res.json({ success: false, message: 'Token required' });
        }
        
        const decoded = verifyToken(token);
        if (!decoded) {
            return res.json({ success: false, message: 'Invalid token' });
        }
        
        if (pool) {
            const [users] = await pool.execute(
                'SELECT u.id, u.username, u.face, u.is_banned, p.place_id, p.pos_x, p.pos_y, p.pos_z ' +
                'FROM users u LEFT JOIN player_data p ON u.id = p.user_id ' +
                'WHERE u.id = ?',
                [decoded.userId]
            );
            
            if (users.length === 0) {
                return res.json({ success: false, message: 'User not found' });
            }
            
            const user = users[0];
            
            if (user.is_banned) {
                return res.json({ success: false, message: 'Account banned' });
            }
            
            res.json({
                success: true,
                userId: user.id,
                username: user.username,
                face: user.face || 'default.png',
                placeId: user.place_id || 1,
                posX: user.pos_x || 0,
                posY: user.pos_y || 5,
                posZ: user.pos_z || 0
            });
        } else {
            res.json({
                success: true,
                userId: decoded.userId,
                username: decoded.username,
                face: 'default.png',
                placeId: 1,
                posX: 0,
                posY: 5,
                posZ: 0
            });
        }
        
    } catch (error) {
        console.error('Game auth error:', error);
        res.json({ success: false, message: 'Auth failed' });
    }
});

app.post('/api/save-player', async (req, res) => {
    try {
        const { userId, placeId, posX, posY, posZ } = req.body;
        
        if (!pool) {
            return res.json({ success: true });
        }
        
        await pool.execute(
            'UPDATE player_data SET place_id = ?, pos_x = ?, pos_y = ?, pos_z = ? WHERE user_id = ?',
            [placeId || 1, posX || 0, posY || 5, posZ || 0, userId]
        );
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Save error:', error);
        res.json({ success: false });
    }
});

app.get('/api/status', async (req, res) => {
    let playerCount = 0;
    let dbStatus = 'disconnected';
    
    if (pool) {
        try {
            const [result] = await pool.execute('SELECT COUNT(*) as count FROM users');
            playerCount = result[0].count;
            dbStatus = 'connected';
        } catch (e) {
            dbStatus = 'error';
        }
    }
    
    res.json({
        online: true,
        players: playerCount,
        version: '0.1',
        database: dbStatus
    });
});

app.get('/api/stats', async (req, res) => {
    try {
        if (!pool) {
            return res.json({ totalUsers: memoryUsers.size, onlineNow: 0 });
        }
        
        const [users] = await pool.execute('SELECT COUNT(*) as count FROM users');
        const [recent] = await pool.execute(
            'SELECT COUNT(*) as count FROM users WHERE last_login > DATE_SUB(NOW(), INTERVAL 24 HOUR)'
        );
        
        res.json({
            totalUsers: users[0].count,
            recentActive: recent[0].count
        });
    } catch (error) {
        res.json({ totalUsers: 0, recentActive: 0 });
    }
});

app.get('/downloads/:filename', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(__dirname, 'downloads', filename);
    
    if (filename.includes('..') || !filename.endsWith('.zip')) {
        return res.status(404).send('Not found');
    }
    
    res.download(filepath, filename, (err) => {
        if (err) {
            console.error('Download error:', err.message);
            res.status(404).send('File not found');
        }
    });
});

// SPA fallback
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
async function start() {
    await createPool();
    await initDatabase();
    
    app.listen(PORT, () => {
        console.log(`ForgeBlock API running on port ${PORT}`);
        console.log(`Database: ${pool ? 'MySQL connected' : 'Memory mode'}`);
    });
}

start();
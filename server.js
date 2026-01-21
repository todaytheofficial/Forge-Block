require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

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
        
        // Test connection
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
        // Users table
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(32) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                auth_token VARCHAR(512),
                token_expires DATETIME,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP NULL,
                is_banned BOOLEAN DEFAULT FALSE,
                INDEX idx_username (username),
                INDEX idx_token (auth_token(255))
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        
        // Player game data
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

// In-memory fallback storage (for testing without DB)
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

// Cookie options
const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
};

// ==================== API ROUTES ====================

// Register
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        // Validation
        if (!username || !email || !password) {
            return res.json({ success: false, message: 'All fields are required' });
        }
        
        if (username.length < 3 || username.length > 24) {
            return res.json({ success: false, message: 'Username must be 3-24 characters' });
        }
        
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return res.json({ success: false, message: 'Username can only contain letters, numbers and underscore' });
        }
        
        if (password.length < 4) {
            return res.json({ success: false, message: 'Password must be at least 4 characters' });
        }
        
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.json({ success: false, message: 'Invalid email format' });
        }
        
        const passwordHash = await bcrypt.hash(password, 10);
        
        if (pool) {
            // MySQL storage
            const [existing] = await pool.execute(
                'SELECT id FROM users WHERE username = ? OR email = ?',
                [username.toLowerCase(), email.toLowerCase()]
            );
            
            if (existing.length > 0) {
                return res.json({ success: false, message: 'Username or email already exists' });
            }
            
            const [result] = await pool.execute(
                'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
                [username, email.toLowerCase(), passwordHash]
            );
            
            // Create player data
            await pool.execute(
                'INSERT INTO player_data (user_id) VALUES (?)',
                [result.insertId]
            );
            
            console.log(`User registered: ${username} (ID: ${result.insertId})`);
        } else {
            // Memory storage fallback
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
            // MySQL
            const [users] = await pool.execute(
                'SELECT id, username, password_hash, is_banned FROM users WHERE username = ?',
                [username]
            );
            
            if (users.length > 0) {
                user = users[0];
            }
        } else {
            // Memory fallback
            for (const [, u] of memoryUsers) {
                if (u.username.toLowerCase() === username.toLowerCase()) {
                    user = { id: u.id, username: u.username, password_hash: u.passwordHash };
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
        
        // Generate token
        const token = generateToken(user.id, user.username);
        
        // Calculate expiry
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + (remember ? 30 : 1));
        
        if (pool) {
            // Save to MySQL
            await pool.execute(
                'UPDATE users SET auth_token = ?, token_expires = ?, last_login = NOW() WHERE id = ?',
                [token, expiresAt, user.id]
            );
        }
        
        // Set cookie
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
            userId: user.id
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.json({ success: false, message: 'Login failed' });
    }
});

// Verify token / Check session
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
                'SELECT id, username, token_expires, is_banned FROM users WHERE id = ? AND auth_token = ?',
                [decoded.userId, token]
            );
            
            if (users.length === 0 || users[0].is_banned) {
                return res.json({ valid: false });
            }
            
            const user = users[0];
            if (user.token_expires && new Date(user.token_expires) < new Date()) {
                return res.json({ valid: false });
            }
            
            res.json({ valid: true, username: user.username, userId: user.id });
        } else {
            // Memory fallback
            res.json({ valid: true, username: decoded.username, userId: decoded.userId });
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

// Game server auth (called by game server to verify player token)
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
                'SELECT u.id, u.username, u.is_banned, p.place_id, p.pos_x, p.pos_y, p.pos_z ' +
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

// Save player data
app.post('/api/save-player', async (req, res) => {
    try {
        const { userId, placeId, posX, posY, posZ } = req.body;
        
        if (!pool) {
            return res.json({ success: true }); // No DB, just acknowledge
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

// Server status
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

// Get user stats
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
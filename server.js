require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// MySQL Connection Pool
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: {
        rejectUnauthorized: false
    }
});

// Initialize database tables
async function initDatabase() {
    try {
        const connection = await pool.getConnection();
        
        // Users table
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(32) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                auth_token VARCHAR(255),
                token_expires DATETIME,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP NULL,
                is_banned BOOLEAN DEFAULT FALSE
            )
        `);
        
        // Player data table
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS player_data (
                user_id INT PRIMARY KEY,
                place_id TINYINT DEFAULT 1,
                pos_x FLOAT DEFAULT 0,
                pos_y FLOAT DEFAULT 5,
                pos_z FLOAT DEFAULT 0,
                play_time INT DEFAULT 0,
                last_save TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        
        // Sessions table for game server verification
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS active_sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                session_token VARCHAR(255) NOT NULL,
                ip_address VARCHAR(45),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        
        connection.release();
        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Database initialization error:', error);
        process.exit(1);
    }
}

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');

// Generate auth token
function generateToken(userId, username) {
    return jwt.sign(
        { userId, username },
        JWT_SECRET,
        { expiresIn: '30d' }
    );
}

// Verify JWT token middleware
function verifyTokenMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ success: false, message: 'No token provided' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ success: false, message: 'Invalid token' });
    }
}

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
        
        if (password.length < 4) {
            return res.json({ success: false, message: 'Password must be at least 4 characters' });
        }
        
        // Check if username or email exists
        const [existing] = await pool.execute(
            'SELECT id FROM users WHERE username = ? OR email = ?',
            [username, email]
        );
        
        if (existing.length > 0) {
            return res.json({ success: false, message: 'Username or email already exists' });
        }
        
        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);
        
        // Create user
        const [result] = await pool.execute(
            'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
            [username, email, passwordHash]
        );
        
        // Create player data entry
        await pool.execute(
            'INSERT INTO player_data (user_id) VALUES (?)',
            [result.insertId]
        );
        
        res.json({ success: true, message: 'Registration successful' });
        
    } catch (error) {
        console.error('Register error:', error);
        res.json({ success: false, message: 'Registration failed' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password, remember } = req.body;
        
        if (!username || !password) {
            return res.json({ success: false, message: 'Username and password required' });
        }
        
        // Find user
        const [users] = await pool.execute(
            'SELECT id, username, password_hash, is_banned FROM users WHERE username = ?',
            [username]
        );
        
        if (users.length === 0) {
            return res.json({ success: false, message: 'Invalid username or password' });
        }
        
        const user = users[0];
        
        if (user.is_banned) {
            return res.json({ success: false, message: 'Account is banned' });
        }
        
        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!validPassword) {
            return res.json({ success: false, message: 'Invalid username or password' });
        }
        
        // Generate token
        const token = generateToken(user.id, user.username);
        
        // Calculate expiry
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + (remember ? 30 : 1));
        
        // Save token to database
        await pool.execute(
            'UPDATE users SET auth_token = ?, token_expires = ?, last_login = NOW() WHERE id = ?',
            [token, expiresAt, user.id]
        );
        
        res.json({
            success: true,
            message: 'Login successful',
            token: token,
            username: user.username
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.json({ success: false, message: 'Login failed' });
    }
});

// Verify token
app.post('/api/verify', verifyTokenMiddleware, async (req, res) => {
    try {
        const [users] = await pool.execute(
            'SELECT id, username, auth_token, token_expires FROM users WHERE id = ?',
            [req.user.userId]
        );
        
        if (users.length === 0) {
            return res.json({ valid: false });
        }
        
        const user = users[0];
        
        // Check if token matches and not expired
        if (user.token_expires && new Date(user.token_expires) > new Date()) {
            res.json({ valid: true, username: user.username });
        } else {
            res.json({ valid: false });
        }
        
    } catch (error) {
        console.error('Verify error:', error);
        res.json({ valid: false });
    }
});

// Game server authentication (called by game server)
app.post('/api/game-auth', async (req, res) => {
    try {
        const { token } = req.body;
        
        if (!token) {
            return res.json({ success: false, message: 'Token required' });
        }
        
        // Verify JWT
        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (e) {
            return res.json({ success: false, message: 'Invalid token' });
        }
        
        // Check in database
        const [users] = await pool.execute(
            'SELECT id, username, is_banned, token_expires FROM users WHERE id = ? AND auth_token = ?',
            [decoded.userId, token]
        );
        
        if (users.length === 0) {
            return res.json({ success: false, message: 'Token not found' });
        }
        
        const user = users[0];
        
        if (user.is_banned) {
            return res.json({ success: false, message: 'Account banned' });
        }
        
        if (user.token_expires && new Date(user.token_expires) < new Date()) {
            return res.json({ success: false, message: 'Token expired' });
        }
        
        // Get player data
        const [playerData] = await pool.execute(
            'SELECT * FROM player_data WHERE user_id = ?',
            [user.id]
        );
        
        res.json({
            success: true,
            userId: user.id,
            username: user.username,
            playerData: playerData[0] || null
        });
        
    } catch (error) {
        console.error('Game auth error:', error);
        res.json({ success: false, message: 'Authentication failed' });
    }
});

// Save player data (called by game server)
app.post('/api/save-player', async (req, res) => {
    try {
        const { userId, placeId, posX, posY, posZ, playTime } = req.body;
        
        await pool.execute(`
            UPDATE player_data 
            SET place_id = ?, pos_x = ?, pos_y = ?, pos_z = ?, 
                play_time = play_time + ?, last_save = NOW()
            WHERE user_id = ?
        `, [placeId, posX, posY, posZ, playTime || 0, userId]);
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Save player error:', error);
        res.json({ success: false });
    }
});

// Server status
app.get('/api/status', async (req, res) => {
    try {
        // You can add actual game server status check here
        const [sessions] = await pool.execute(
            'SELECT COUNT(*) as count FROM active_sessions WHERE expires_at > NOW()'
        );
        
        res.json({
            online: true,
            players: sessions[0].count || 0,
            version: '0.1'
        });
    } catch (error) {
        res.json({ online: false, players: 0 });
    }
});

// Download with token
app.get('/api/download', verifyTokenMiddleware, async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        
        // Create a temporary config file with the token
        const configContent = JSON.stringify({
            authToken: token,
            username: req.user.username,
            serverUrl: process.env.GAME_SERVER_URL || 'localhost:7777',
            apiUrl: process.env.API_URL || `http://localhost:${PORT}`
        }, null, 2);
        
        // Path to the game files
        const gameDir = path.join(__dirname, 'game_files');
        const configPath = path.join(gameDir, 'auth_config.json');
        
        // Write config
        fs.writeFileSync(configPath, configContent);
        
        // Create ZIP archive
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        res.attachment('ForgeBlock_Setup.zip');
        archive.pipe(res);
        
        // Add game files
        archive.directory(gameDir, false);
        
        await archive.finalize();
        
        // Clean up config file after sending
        setTimeout(() => {
            try { fs.unlinkSync(configPath); } catch (e) {}
        }, 5000);
        
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
});
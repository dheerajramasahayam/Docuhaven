const jwt = require('jsonwebtoken');
const { db } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }

        // Get fresh user data from database
        const user = db.prepare('SELECT id, username, email, role, is_active FROM users WHERE id = ?').get(decoded.userId);

        if (!user || !user.is_active) {
            return res.status(403).json({ error: 'User account is inactive' });
        }

        req.user = user;
        next();
    });
}

function generateToken(user) {
    return jwt.sign(
        { userId: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
}

module.exports = {
    authenticateToken,
    generateToken,
    JWT_SECRET
};

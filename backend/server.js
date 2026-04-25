// OTTER Finance App — API Server v1.0.0
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

const mongoose = require('mongoose');
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const uploadRoutes = require('./routes/uploadRoutes');
const User = require('./models/userModel');

const app = express();
const server = createServer(app);

// Trust proxy — required for Azure + express-rate-limit
app.set('trust proxy', 1);

const port = process.env.PORT || 4000;
const dbURI = process.env.MONGODB_URI;

// ─────────────────────────────────────────────────────────────────────────────
//  MIDDLEWARE IMPORTS
// ─────────────────────────────────────────────────────────────────────────────
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { doubleCsrf } = require('csrf-csrf');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');

// ─────────────────────────────────────────────────────────────────────────────
//  ROUTE IMPORTS
// ─────────────────────────────────────────────────────────────────────────────
const authRoutes = require('./routes/authRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const debtRoutes = require('./routes/debtRoutes');
const userRoutes = require('./routes/userRoutes');
const barcodeRoutes = require('./routes/barcodeRoutes');
const recurringBillRoutes = require('./routes/recurringBillRoutes');
const budgetRoutes = require('./routes/budgetRoutes');
const savingsRoutes = require('./routes/savingsRoutes');
const shoppingRoutes = require('./routes/shoppingRoutes');
const currencyRoutes = require('./routes/currencyRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const walletRoutes = require('./routes/walletRoutes');
const friendRoutes = require('./routes/friendRoutes');

// ─────────────────────────────────────────────────────────────────────────────
//  HELMET — Secure HTTP headers
// ─────────────────────────────────────────────────────────────────────────────
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Serve uploads statically
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}
app.use('/uploads', express.static(uploadsDir));

// ─────────────────────────────────────────────────────────────────────────────
//  CORS — Must be before rate limiters so OPTIONS passes safely
//  Origins: localhost (dev) + Azure App Service URLs (prod)
// ─────────────────────────────────────────────────────────────────────────────
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    // Azure App Service URL — update once deployed
    process.env.AZURE_FRONTEND_URL,
].filter(Boolean);

app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? allowedOrigins : true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
}));

// ─────────────────────────────────────────────────────────────────────────────
//  RATE LIMITERS
// ─────────────────────────────────────────────────────────────────────────────

// Login: 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
});

// General API: 200 req/15min in production, 1000 in dev
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 200 : 1000,
    message: { error: 'Too many requests from this IP. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
});

// Financial mutations: 60 writes per 15min per IP (transactions, debts, savings)
const mutationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 60 : 500,
    message: { error: 'Too many requests. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
});

app.use('/api/', generalLimiter);

// ─────────────────────────────────────────────────────────────────────────────
//  SOCKET.IO — Real-time events (debt reminders, balance updates)
//  Mobile app can subscribe to user-scoped rooms
// ─────────────────────────────────────────────────────────────────────────────
const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST', 'PATCH', 'DELETE'],
        credentials: true,
    }
});

app.set('io', io); // Access via req.app.get('io') in controllers

const onlineUsers = new Set();
const socketToUser = new Map();

io.on('connection', (socket) => {
    // Mobile client joins a personal room (scoped by userId)
    socket.on('join_user_room', async (userId) => {
        if (userId) {
            socket.join(`user:${userId}`);
            onlineUsers.add(userId.toString());
            socketToUser.set(socket.id, userId.toString());
            console.log(`[SOCKET] Client ${socket.id} joined room user:${userId}`);

            // Notify friends that this user is online
            try {
                const user = await User.findById(userId).select('friends');
                if (user && user.friends) {
                    user.friends.forEach(friendId => {
                        io.to(`user:${friendId.toString()}`).emit('user_online', userId.toString());
                    });
                }
            } catch (err) {
                console.error('[SOCKET] Online notify error:', err);
            }
        }
    });

    socket.on('leave_user_room', (userId) => {
        if (userId) {
            socket.leave(`user:${userId}`);
            onlineUsers.delete(userId.toString());
            socketToUser.delete(socket.id);
        }
    });

    // Chat Typing Indicators
    socket.on('typing', ({ senderId, receiverId }) => {
        io.to(`user:${receiverId}`).emit('typing', { senderId });
    });

    socket.on('stop_typing', ({ senderId, receiverId }) => {
        io.to(`user:${receiverId}`).emit('stop_typing', { senderId });
    });

    socket.on('disconnect', async () => {
        const userId = socketToUser.get(socket.id);
        if (userId) {
            socketToUser.delete(socket.id);
            
            // Check if user has other active sockets before declaring offline
            const activeSockets = await io.in(`user:${userId}`).fetchSockets();
            if (activeSockets.length === 0) {
                onlineUsers.delete(userId);
                console.log(`[SOCKET] User ${userId} went offline`);

                // Notify friends
                try {
                    const user = await User.findById(userId).select('friends');
                    if (user && user.friends) {
                        user.friends.forEach(friendId => {
                            io.to(`user:${friendId.toString()}`).emit('user_offline', userId);
                        });
                    }
                } catch (err) {
                    console.error('[SOCKET] Offline notify error:', err);
                }
            }
        }
        console.log(`[SOCKET] Client disconnected: ${socket.id}`);
    });
});

// Expose onlineUsers for other controllers
app.set('onlineUsers', onlineUsers);

// ─────────────────────────────────────────────────────────────────────────────
//  BODY PARSERS
// ─────────────────────────────────────────────────────────────────────────────
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.json({ limit: '10mb' }));

// ─────────────────────────────────────────────────────────────────────────────
//  COOKIE PARSER — Required before CSRF
// ─────────────────────────────────────────────────────────────────────────────
app.use(cookieParser());

// ─────────────────────────────────────────────────────────────────────────────
//  SANITIZATION — Must run AFTER body parsers, BEFORE routes
//  1. express-mongo-sanitize: strips $ and . from req.body/params
//     → Prevents MongoDB operator injection attacks (e.g. {"$gt": ""})
//     NOTE: We skip req.query — it's a read-only getter in Node 18+
//  2. XSS is handled per-route by express-validator .escape() chains
//     + helmet sets X-XSS-Protection and Content-Security-Policy headers
// ─────────────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
    if (req.body) mongoSanitize.sanitize(req.body, { replaceWith: '_' });
    if (req.params) mongoSanitize.sanitize(req.params, { replaceWith: '_' });
    next();
});

// ─────────────────────────────────────────────────────────────────────────────
//  DEBUG LOGGER — Remove or gate this in production if too verbose
// ─────────────────────────────────────────────────────────────────────────────
app.use('/api', (req, res, next) => {
    console.log(`[API_REQUEST] ${req.method} ${req.originalUrl}`);
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        console.log('  └─ Body:', JSON.stringify(req.body, null, 2));
    }
    next();
});

// ─────────────────────────────────────────────────────────────────────────────
//  CSRF — Double Submit Cookie Pattern
//  Mobile app (Bearer token) is exempt from CSRF by design.
//  Web dashboard (if/when added) uses cookie-based CSRF.
// ─────────────────────────────────────────────────────────────────────────────
const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
    getSecret: () => process.env.JWT_SECRET || 'csrf-fallback-secret',
    cookieName: 'csrf',
    cookieOptions: {
        httpOnly: true,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
    },
    getSessionIdentifier: () => 'stateless',
    getTokenFromRequest: (req) => req.headers['x-csrf-token'],
});

// Endpoint: Web frontend calls this to get a CSRF token before mutating requests
app.get('/api/csrf-token', (req, res) => {
    const token = generateCsrfToken(req, res);
    res.json({ csrfToken: token });
});

// ─── CSRF Middleware — Bearer token requests bypass automatically ───
const csrfMiddleware = (req, res, next) => {
    // Mobile app: stateless Bearer tokens are inherently CSRF-safe
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        return next();
    }
    // Mobile register/login/2FA: no token yet, source: 'mobile' signals mobile origin
    const publicAuthRoutes = [
        '/api/auth/register',
        '/api/auth/login',
        '/api/auth/verify-2fa',
        '/api/auth/2fa/resend',
        '/api/auth/google',
        '/api/auth/forgot-password',
        '/api/auth/verify-reset-code',
        '/api/auth/reset-password'
    ];
    if (publicAuthRoutes.includes(req.path)) {
        return next();
    }
    doubleCsrfProtection(req, res, next);
};

app.use(csrfMiddleware);

// ─────────────────────────────────────────────────────────────────────────────
//  ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// Auth: register + login (login rate-limited)
app.post('/api/auth/login', loginLimiter);
app.use('/api/auth', authRoutes);

// Transactions (expenses + income) — mutation limiter on writes
app.use('/api/transactions', transactionRoutes);
app.post('/api/transactions', mutationLimiter);
app.patch('/api/transactions/:id', mutationLimiter);
app.delete('/api/transactions/:id', mutationLimiter);

// Debts (money owed to/from user)
app.use('/api/debts', debtRoutes);

// User profile + push token
app.use('/api/users', userRoutes);

// Barcode price history
app.use('/api/barcodes', barcodeRoutes);

// Recurring bills
app.use('/api/recurring-bills', recurringBillRoutes);

// Monthly budgets
app.use('/api/budgets', budgetRoutes);

// Savings goals & transfers
app.use('/api/savings', savingsRoutes);

// Multi-currency support
app.use('/api/currency', currencyRoutes);

// Shopping sessions
app.use('/api/shopping', shoppingRoutes);

// File uploads
app.use('/api/uploads', uploadRoutes);

// In-app Notifications
app.use('/api/notifications', notificationRoutes);

// Custom Transaction Categories
app.use('/api/categories', categoryRoutes);

// Wallets
app.use('/api/wallets', walletRoutes);

// Friends & Connections
const chatRoutes = require('./routes/chatRoutes');
app.use('/api/friends', friendRoutes);
app.use('/api/chat', chatRoutes);

// ─────────────────────────────────────────────────────────────────────────────
//  GLOBAL ERROR HANDLER
// ─────────────────────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
        console.warn(`[CSRF] Invalid token for ${req.method} ${req.originalUrl}`);
        return res.status(403).json({ error: 'Form security verification failed. Please refresh the page.' });
    }
    console.error(`[SERVER_ERROR] ${err.message}`);
    res.status(err.status || 500).json({ error: err.message || 'An internal server error occurred.' });
});

// ─────────────────────────────────────────────────────────────────────────────
//  START SERVER
// ─────────────────────────────────────────────────────────────────────────────
server.listen(port, '0.0.0.0', () => {
    console.log(`✅ OTTER API live at http://0.0.0.0:${port}`);
});

// ─────────────────────────────────────────────────────────────────────────────
//  CONNECT TO MONGODB ATLAS
// ─────────────────────────────────────────────────────────────────────────────
mongoose.connect(dbURI)
    .then(() => {
        console.log('✅ Connected to MongoDB Atlas — OTTER DB');
    })
    .catch(err => {
        console.error('❌ Database connection error:', err);
        process.exit(1);
    });

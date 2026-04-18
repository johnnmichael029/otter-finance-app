// OTTER Finance App — API Server v1.0.0
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

const mongoose = require('mongoose');
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

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

// ─────────────────────────────────────────────────────────────────────────────
//  ROUTE IMPORTS
// ─────────────────────────────────────────────────────────────────────────────
const authRoutes = require('./routes/authRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const debtRoutes = require('./routes/debtRoutes');
const userRoutes = require('./routes/userRoutes');

// ─────────────────────────────────────────────────────────────────────────────
//  HELMET — Secure HTTP headers
// ─────────────────────────────────────────────────────────────────────────────
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

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
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
}));

// ─────────────────────────────────────────────────────────────────────────────
//  RATE LIMITERS
// ─────────────────────────────────────────────────────────────────────────────

// Normalize IP — Azure proxy sometimes includes port (e.g. '1.2.3.4:11998')
const keyGenerator = (req) => (req.ip || '').replace(/:[0-9]+$/, '') || req.ip;

// Login: 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
});

// General API: 200 req/15min in production, 1000 in dev
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 200 : 1000,
    message: { error: 'Too many requests from this IP. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
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

io.on('connection', (socket) => {
    // Mobile client joins a personal room (scoped by userId)
    socket.on('join_user_room', (userId) => {
        if (userId) {
            socket.join(`user:${userId}`);
            console.log(`[SOCKET] Client ${socket.id} joined room user:${userId}`);
        }
    });

    socket.on('leave_user_room', (userId) => {
        if (userId) {
            socket.leave(`user:${userId}`);
        }
    });

    socket.on('disconnect', () => {
        console.log(`[SOCKET] Client disconnected: ${socket.id}`);
    });
});

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
    // Mobile register/login: no token yet, source: 'mobile' signals mobile origin
    if (['/api/auth/register', '/api/auth/login'].includes(req.path) && req.body?.source === 'mobile') {
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

// Transactions (expenses + income)
app.use('/api/transactions', transactionRoutes);

// Debts (money owed to/from user)
app.use('/api/debts', debtRoutes);

// User profile + push token
app.use('/api/users', userRoutes);

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
server.listen(port, () => {
    console.log(`✅ OTTER API live at http://localhost:${port}`);
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

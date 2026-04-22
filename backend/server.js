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
//  SANITIZATION — Must run AFTER body parsers, BEFORE routes
//  1. express-mongo-sanitize: strips $ and . from req.body/params
//     → Prevents MongoDB operator injection attacks (e.g. {"$gt": ""})
//     NOTE: We skip req.query — it's a read-only getter in Node 18+
//  2. XSS is handled per-route by express-validator .escape() chains
//     + helmet sets X-XSS-Protection and Content-Security-Policy headers
// ─────────────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
    if (req.body)   mongoSanitize.sanitize(req.body,   { replaceWith: '_' });
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
        '/api/auth/2fa/resend'
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

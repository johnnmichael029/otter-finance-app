/**
 * OTTER — Input Validation & Sanitization Chains
 * ──────────────────────────────────────────────────────────────────────────────
 * Uses express-validator to validate and sanitize all user inputs.
 * Prevents: XSS, SQL-like injection, type confusion, oversized payloads.
 *
 * Usage in routes:
 *   router.post('/', validate.createTransaction, createTransaction)
 */
const { body, param, query, validationResult } = require('express-validator');

// ── Handler: return 400 if any validator failed ───────────────────────────────
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            error: 'Validation failed.',
            details: errors.array().map(e => ({ field: e.path, message: e.msg })),
        });
    }
    next();
};

// ── Transaction Validators ────────────────────────────────────────────────────
const createTransaction = [
    body('type')
        .isIn(['expense', 'income']).withMessage('type must be "expense" or "income".'),
    body('amount')
        .isFloat({ gt: 0 }).withMessage('amount must be a positive number.')
        .toFloat(),
    body('category')
        .notEmpty().withMessage('category is required.')
        .isLength({ max: 50 }).withMessage('category must be 50 chars or less.')
        .trim().escape(),
    body('description')
        .optional()
        .isLength({ max: 200 }).withMessage('description must be 200 chars or less.')
        .trim().escape(),
    body('note')
        .optional({ checkFalsy: true })
        .isLength({ max: 500 }).withMessage('note must be 500 chars or less.')
        .trim(),   // Do NOT escape — we encrypt notes, XSS handled by xss-clean
    body('date')
        .optional({ checkFalsy: true, nullable: true })
        .isISO8601().withMessage('date must be a valid ISO 8601 date.')
        .toDate(),
    body('currency')
        .optional()
        .isLength({ min: 3, max: 3 }).withMessage('currency must be a 3-letter code.')
        .toUpperCase(),
    body('originalAmount')
        .optional({ nullable: true })
        .isFloat({ min: 0 }).withMessage('originalAmount must be a positive number.'),
    body('exchangeRate')
        .optional({ nullable: true })
        .isFloat({ gt: 0 }).withMessage('exchangeRate must be positive.'),
    handleValidationErrors,
];

const updateTransaction = [
    param('id')
        .isMongoId().withMessage('Invalid transaction ID.'),
    body('amount')
        .optional()
        .isFloat({ gt: 0 }).withMessage('amount must be a positive number.')
        .toFloat(),
    body('category')
        .optional()
        .isLength({ max: 50 }).withMessage('category must be 50 chars or less.')
        .trim().escape(),
    body('description')
        .optional()
        .isLength({ max: 200 }).withMessage('description must be 200 chars or less.')
        .trim().escape(),
    body('note')
        .optional()
        .isLength({ max: 500 }).withMessage('note must be 500 chars or less.')
        .trim(),
    body('date')
        .optional()
        .isISO8601().withMessage('date must be a valid ISO 8601 date.')
        .toDate(),
    body('currency')
        .optional()
        .isLength({ min: 3, max: 3 }).withMessage('currency must be a 3-letter code.')
        .toUpperCase(),
    body('originalAmount')
        .optional({ nullable: true })
        .isFloat({ min: 0 }).withMessage('originalAmount must be a positive number.'),
    body('exchangeRate')
        .optional({ nullable: true })
        .isFloat({ gt: 0 }).withMessage('exchangeRate must be positive.'),
    handleValidationErrors,
];

// ── Debt Validators ───────────────────────────────────────────────────────────
const createDebt = [
    body('direction')
        .isIn(['owed_by_me', 'owed_to_me']).withMessage('direction must be "owed_by_me" or "owed_to_me".'),
    body('amount')
        .isFloat({ gt: 0 }).withMessage('amount must be a positive number.')
        .toFloat(),
    body('personName')
        .notEmpty().withMessage('personName is required.')
        .isLength({ max: 100 }).withMessage('personName must be 100 chars or less.')
        .trim().escape(),
    body('description')
        .optional({ checkFalsy: true })
        .isLength({ max: 300 }).withMessage('description must be 300 chars or less.')
        .trim().escape(),
    body('dateBorrowed')
        .optional({ checkFalsy: true })
        .isISO8601().withMessage('dateBorrowed must be a valid ISO 8601 date.')
        .toDate(),
    body('dueDate')
        .optional({ checkFalsy: true })
        .isISO8601().withMessage('dueDate must be a valid ISO 8601 date.')
        .toDate(),
    body('isInstallment').optional({ checkFalsy: true }).isBoolean(),
    body('monthlyPayment').optional({ checkFalsy: true }).isFloat({ min: 0 }).toFloat(),
    body('gracePeriodMonths').optional({ checkFalsy: true }).isInt({ min: 0 }).toInt(),
    body('penaltyRate').optional({ checkFalsy: true }).isFloat({ min: 0 }).toFloat(),
    handleValidationErrors,
];

const updateDebt = [
    param('id')
        .isMongoId().withMessage('Invalid debt ID.'),
    body('direction')
        .optional()
        .isIn(['owed_by_me', 'owed_to_me']).withMessage('direction must be "owed_by_me" or "owed_to_me".'),
    body('amount')
        .optional()
        .isFloat({ gt: 0 }).withMessage('amount must be a positive number.')
        .toFloat(),
    body('personName')
        .optional()
        .isLength({ max: 100 }).withMessage('personName must be 100 chars or less.')
        .trim().escape(),
    body('description')
        .optional({ checkFalsy: true })
        .isLength({ max: 300 }).withMessage('description must be 300 chars or less.')
        .trim().escape(),
    body('dateBorrowed')
        .optional({ checkFalsy: true })
        .isISO8601().withMessage('dateBorrowed must be a valid ISO 8601 date.')
        .toDate(),
    body('dueDate')
        .optional({ checkFalsy: true })
        .isISO8601().withMessage('dueDate must be a valid ISO 8601 date.')
        .toDate(),
    body('status')
        .optional()
        .isIn(['pending', 'partial', 'settled']).withMessage('status must be pending, partial, or settled.'),
    body('isInstallment').optional({ checkFalsy: true }).isBoolean(),
    body('monthlyPayment').optional({ checkFalsy: true }).isFloat({ min: 0 }).toFloat(),
    body('gracePeriodMonths').optional({ checkFalsy: true }).isInt({ min: 0 }).toInt(),
    body('penaltyRate').optional({ checkFalsy: true }).isFloat({ min: 0 }).toFloat(),
    handleValidationErrors,
];

// ── User Profile Validators ───────────────────────────────────────────────────
const updateProfile = [
    body('name')
        .optional()
        .isLength({ min: 1, max: 80 }).withMessage('name must be between 1 and 80 characters.')
        .trim().escape(),
    body('currency')
        .optional()
        .isLength({ min: 1, max: 10 }).withMessage('currency must be a valid currency code.')
        .trim().escape(),
    body('email')
        .optional()
        .isEmail().withMessage('Must be a valid email address.')
        .normalizeEmail(),
    handleValidationErrors,
];

// ── Savings Goal Validators ───────────────────────────────────────────────────
const createSavingsGoal = [
    body('name')
        .notEmpty().withMessage('Goal name is required.')
        .isLength({ max: 80 }).withMessage('Goal name must be 80 chars or less.')
        .trim().escape(),
    body('targetAmount')
        .isFloat({ gt: 0 }).withMessage('targetAmount must be a positive number.')
        .toFloat(),
    body('currentAmount')
        .optional()
        .isFloat({ min: 0 }).withMessage('currentAmount must be 0 or more.')
        .toFloat(),
    body('deadline')
        .optional({ nullable: true })
        .isISO8601().withMessage('deadline must be a valid ISO 8601 date.')
        .toDate(),
    handleValidationErrors,
];

module.exports = {
    createTransaction,
    updateTransaction,
    createDebt,
    updateDebt,
    updateProfile,
    createSavingsGoal,
    handleValidationErrors,
};

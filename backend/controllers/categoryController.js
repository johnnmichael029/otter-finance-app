const Category = require('../models/categoryModel');

const DEFAULT_CATEGORIES = [
    { name: 'Salary', type: 'income', icon: 'briefcase', color: '#22c55e' },
    { name: 'Business', type: 'income', icon: 'trending-up', color: '#3b82f6' },
    { name: 'Gifts', type: 'income', icon: 'gift', color: '#f59e0b' },
    { name: 'Food', type: 'expense', icon: 'coffee', color: '#f59e0b' },
    { name: 'Transport', type: 'expense', icon: 'truck', color: '#3b82f6' },
    { name: 'Shopping', type: 'expense', icon: 'shopping-bag', color: '#ec4899' },
    { name: 'Bills', type: 'expense', icon: 'file-text', color: '#ef4444' },
    { name: 'Health', type: 'expense', icon: 'heart', color: '#22c55e' },
    { name: 'Entertainment', type: 'expense', icon: 'tv', color: '#8b5cf6' },
    { name: 'Subscriptions', type: 'expense', icon: 'wifi', color: '#06b6d4' }
];

const getCategories = async (req, res) => {
    try {
        let categories = await Category.find({ user: req.user._id });

        if (categories.length === 0) {
            // Seed defaults
            const defaultDocs = DEFAULT_CATEGORIES.map(c => ({
                ...c,
                user: req.user._id
            }));
            categories = await Category.insertMany(defaultDocs);
        }

        res.json({ categories });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const createCategory = async (req, res) => {
    try {
        const { name, type, icon, color } = req.body;
        const newCategory = new Category({
            user: req.user._id,
            name,
            type,
            icon,
            color
        });
        const saved = await newCategory.save();
        res.status(201).json(saved);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

const updateCategory = async (req, res) => {
    try {
        const updated = await Category.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            req.body,
            { new: true }
        );
        if (!updated) return res.status(404).json({ error: 'Category not found' });
        res.json(updated);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

const deleteCategory = async (req, res) => {
    try {
        const deleted = await Category.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        if (!deleted) return res.status(404).json({ error: 'Category not found' });
        res.json({ message: 'Category deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory
};

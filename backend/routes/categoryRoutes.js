const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const {
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory
} = require('../controllers/categoryController');

router.use(requireAuth);
router.route('/').get(getCategories).post(createCategory);
router.route('/:id').put(updateCategory).delete(deleteCategory);

module.exports = router;

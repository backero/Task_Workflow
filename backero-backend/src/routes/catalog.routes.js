const router = require('express').Router();
const ctrl = require('../controllers/catalog.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');
const { authorizeManagerOrAbove, authorizeAdminOrAbove, authorizeCatalogDelete } = require('../middleware/role.middleware');
const multer = require('multer');

const imgUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (_, f, cb) => cb(null, f.mimetype.startsWith('image/')) });
const fileUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.use(authenticate, orgIsolation);

router.get('/stats',             ctrl.getStats);
router.get('/products',          ctrl.getProducts);
router.get('/products/:id',      ctrl.getProduct);
router.post('/products',         authorizeManagerOrAbove, ctrl.createProduct);
router.put('/products/:id',      authorizeManagerOrAbove, ctrl.updateProduct);
router.delete('/products/:id',   authorizeCatalogDelete,  ctrl.deleteProduct);
router.post('/products/:id/image', authorizeManagerOrAbove, imgUpload.single('image'), ctrl.uploadImage);
router.post('/products/:id/attachment',   authorizeManagerOrAbove, fileUpload.single('file'), ctrl.uploadAttachment);
router.delete('/products/:id/attachment', authorizeManagerOrAbove, ctrl.removeAttachment);
router.post('/import',           authorizeAdminOrAbove,   ctrl.importProducts);
router.post('/resolve-ingredients', authorizeManagerOrAbove, ctrl.resolveIngredients);

module.exports = router;

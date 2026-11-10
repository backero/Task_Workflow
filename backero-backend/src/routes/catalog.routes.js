const router = require('express').Router();
const ctrl = require('../controllers/catalog.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');
const { authorizeAdminOrAbove, authorizeCatalogDelete, authorizeCatalogWrite } = require('../middleware/role.middleware');
const multer = require('multer');

const imgUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (_, f, cb) => cb(null, f.mimetype.startsWith('image/')) });
const fileUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.use(authenticate, orgIsolation);

router.get('/stats',             ctrl.getStats);
router.get('/products',          ctrl.getProducts);
router.get('/products/:id',      ctrl.getProduct);
router.post('/products',         authorizeCatalogWrite, ctrl.createProduct);
router.put('/products/:id',      authorizeCatalogWrite, ctrl.updateProduct);
router.delete('/products/:id',   authorizeCatalogDelete,  ctrl.deleteProduct);
router.post('/products/:id/image', authorizeCatalogWrite, imgUpload.single('image'), ctrl.uploadImage);
router.post('/products/:id/attachment',   authorizeCatalogWrite, fileUpload.single('file'), ctrl.uploadAttachment);
router.delete('/products/:id/attachment', authorizeCatalogWrite, ctrl.removeAttachment);
router.post('/products/:id/formulation-versions',            authorizeCatalogWrite, ctrl.createFormulationVersion);
router.put('/products/:id/formulation-versions/:versionId',  authorizeCatalogWrite, ctrl.updateFormulationVersion);
router.post('/products/:id/formulation-versions/:versionId/activate', authorizeCatalogWrite, ctrl.activateFormulationVersion);
router.delete('/products/:id/formulation-versions/:versionId', authorizeCatalogWrite, ctrl.deleteFormulationVersion);
router.post('/products/:id/formulation-versions/:versionId/rnd-attachment',   authorizeCatalogWrite, fileUpload.single('file'), ctrl.uploadFormulationVersionRndAttachment);
router.delete('/products/:id/formulation-versions/:versionId/rnd-attachment', authorizeCatalogWrite, ctrl.removeFormulationVersionRndAttachment);
router.get('/products/:id/cogs-breakdown', ctrl.getCogsBreakdown);
router.post('/import',           authorizeAdminOrAbove,   ctrl.importProducts);
router.post('/resolve-ingredients', authorizeCatalogWrite, ctrl.resolveIngredients);

module.exports = router;

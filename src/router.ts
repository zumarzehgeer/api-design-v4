import exp from 'constants';
import { Router } from 'express';

const router = Router();
/**
 * Product
 */

router.get('/product', (req, res) => {
  res.status(200);
  res.json({ message: 'Get Request: /product' });
});
router.get('/product/:id', () => {});
router.put('/product/:id', () => {});
router.post('/product', () => {});
router.post('/product/:id', () => {});

/**
 * Update
 */

router.get('/update', () => {});
router.get('/update/:id', () => {});
router.put('/update/:id', () => {});
router.post('/update', () => {});
router.post('/update/:id', () => {});

/**
 * Update Point
 */

router.get('/updatepoint', () => {});
router.get('/updatepoint/:id', () => {});
router.put('/updatepoint/:id', () => {});
router.post('/updatepoint', () => {});
router.post('/updatepoint/:id', () => {});

export default router;

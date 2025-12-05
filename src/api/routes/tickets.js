const express = require('express');
const router = express.Router();

// TODO: Implement ticket routes
// GET    /              - List tickets
// POST   /              - Create ticket
// GET    /:id           - Get ticket
// PUT    /:id           - Update ticket
// DELETE /:id           - Delete ticket
// POST   /:id/messages  - Add message
// POST   /:id/resolve   - Resolve ticket
// GET    /:id/assist    - Get operator assist

router.get('/', (req, res) => {
  res.json({ message: 'Tickets list - TODO' });
});

router.post('/', (req, res) => {
  res.json({ message: 'Create ticket - TODO' });
});

router.get('/:id', (req, res) => {
  res.json({ message: `Get ticket ${req.params.id} - TODO` });
});

module.exports = router;

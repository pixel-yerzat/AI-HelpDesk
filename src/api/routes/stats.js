const express = require('express');
const router = express.Router();

// TODO: Implement stats routes
// GET /dashboard  - Dashboard stats
// GET /sla        - SLA metrics
// GET /accuracy   - Classification accuracy

router.get('/dashboard', (req, res) => {
  res.json({ message: 'Dashboard stats - TODO' });
});

module.exports = router;

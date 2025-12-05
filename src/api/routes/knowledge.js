const express = require('express');
const router = express.Router();

// TODO: Implement knowledge base routes
// GET    /         - List articles
// POST   /         - Create article
// GET    /:id      - Get article
// PUT    /:id      - Update article
// DELETE /:id      - Delete article
// GET    /search   - Search articles (RAG)

router.get('/', (req, res) => {
  res.json({ message: 'Knowledge base - TODO' });
});

router.get('/search', (req, res) => {
  res.json({ message: 'Search knowledge base - TODO' });
});

module.exports = router;

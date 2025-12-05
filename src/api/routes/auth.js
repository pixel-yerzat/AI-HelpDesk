const express = require('express');
const router = express.Router();

// TODO: Implement auth routes
// POST /register - Register user
// POST /login    - Login user
// POST /refresh  - Refresh token
// GET  /me       - Get current user

router.post('/login', (req, res) => {
  res.json({ message: 'Login - TODO' });
});

router.post('/register', (req, res) => {
  res.json({ message: 'Register - TODO' });
});

module.exports = router;

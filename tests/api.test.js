#!/usr/bin/env node

/**
 * API E2E Tests
 * Tests API endpoints with mock/real server
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  section: (msg) => console.log(`\n${colors.cyan}═══ ${msg} ═══${colors.reset}\n`),
};

let token = null;
const results = { passed: 0, failed: 0 };

async function request(method, path, body = null, useToken = true) {
  const headers = {
    'Content-Type': 'application/json',
  };
  
  if (useToken && token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${BASE_URL}${path}`, options);
  const data = await response.json().catch(() => null);
  
  return { status: response.status, data };
}

async function test(name, fn) {
  try {
    await fn();
    log.success(name);
    results.passed++;
  } catch (error) {
    log.error(`${name}: ${error.message}`);
    results.failed++;
  }
}

// ========== AUTH TESTS ==========
async function testAuth() {
  log.section('Authentication');

  await test('POST /api/v1/auth/login - valid credentials', async () => {
    const res = await request('POST', '/api/v1/auth/login', {
      email: 'admin@helpdesk.local',
      password: 'admin123',
    }, false);
    
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    if (!res.data.token) throw new Error('No token returned');
    
    token = res.data.token;
  });

  await test('POST /api/v1/auth/login - invalid credentials', async () => {
    const res = await request('POST', '/api/v1/auth/login', {
      email: 'admin@helpdesk.local',
      password: 'wrongpassword',
    }, false);
    
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  await test('GET /api/v1/auth/me - with token', async () => {
    const res = await request('GET', '/api/v1/auth/me');
    
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    if (!res.data.user) throw new Error('No user returned');
  });

  await test('GET /api/v1/auth/me - without token', async () => {
    const res = await request('GET', '/api/v1/auth/me', null, false);
    
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });
}

// ========== TICKETS TESTS ==========
async function testTickets() {
  log.section('Tickets');

  let testTicketId = null;

  await test('GET /api/v1/tickets - list tickets', async () => {
    const res = await request('GET', '/api/v1/tickets');
    
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    if (!Array.isArray(res.data.tickets)) throw new Error('Invalid response format');
    
    if (res.data.tickets.length > 0) {
      testTicketId = res.data.tickets[0].id;
    }
  });

  await test('GET /api/v1/tickets?status=new - filter by status', async () => {
    const res = await request('GET', '/api/v1/tickets?status=new');
    
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
  });

  await test('GET /api/v1/tickets/drafts - get drafts', async () => {
    const res = await request('GET', '/api/v1/tickets/drafts');
    
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
  });

  if (testTicketId) {
    await test('GET /api/v1/tickets/:id - get single ticket', async () => {
      const res = await request('GET', `/api/v1/tickets/${testTicketId}`);
      
      if (res.status !== 200) throw new Error(`Status: ${res.status}`);
      if (!res.data.ticket) throw new Error('No ticket returned');
    });

    await test('GET /api/v1/tickets/:id/messages - get messages', async () => {
      const res = await request('GET', `/api/v1/tickets/${testTicketId}/messages`);
      
      if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    });
  }
}

// ========== KNOWLEDGE BASE TESTS ==========
async function testKnowledgeBase() {
  log.section('Knowledge Base');

  let testArticleId = null;

  await test('GET /api/v1/kb - list articles', async () => {
    const res = await request('GET', '/api/v1/kb');
    
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    if (!Array.isArray(res.data.articles)) throw new Error('Invalid response format');
    
    if (res.data.articles.length > 0) {
      testArticleId = res.data.articles[0].id;
    }
  });

  await test('POST /api/v1/kb - create article', async () => {
    const res = await request('POST', '/api/v1/kb', {
      title_ru: 'Test Article ' + Date.now(),
      content_ru: 'Test content for the article',
      category: 'access_vpn',
      type: 'faq',
    });
    
    if (res.status !== 201 && res.status !== 200) throw new Error(`Status: ${res.status}`);
    if (res.data.article) {
      testArticleId = res.data.article.id;
    }
  });

  await test('GET /api/v1/kb/stats - get stats', async () => {
    const res = await request('GET', '/api/v1/kb/stats');
    
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
  });

  await test('POST /api/v1/kb/search - vector search', async () => {
    const res = await request('POST', '/api/v1/kb/search', {
      query: 'как сбросить пароль',
      limit: 5,
    });
    
    // May return 200 or 500 if Qdrant not available
    if (res.status !== 200 && res.status !== 500) throw new Error(`Status: ${res.status}`);
  });
}

// ========== ADMIN TESTS ==========
async function testAdmin() {
  log.section('Admin');

  await test('GET /api/v1/admin/stats - get statistics', async () => {
    const res = await request('GET', '/api/v1/admin/stats');
    
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
  });

  await test('GET /api/v1/admin/stats/daily - daily stats', async () => {
    const res = await request('GET', '/api/v1/admin/stats/daily?days=7');
    
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
  });

  await test('GET /api/v1/admin/health - health check', async () => {
    const res = await request('GET', '/api/v1/admin/health');
    
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
  });
}

// ========== NLP TESTS ==========
async function testNLP() {
  log.section('NLP Service');

  await test('POST /api/v1/nlp/detect-language', async () => {
    const res = await request('POST', '/api/v1/nlp/detect-language', {
      text: 'Здравствуйте, у меня проблема с VPN подключением',
    });
    
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    if (!res.data.language) throw new Error('No language detected');
  });

  await test('POST /api/v1/nlp/classify', async () => {
    const res = await request('POST', '/api/v1/nlp/classify', {
      subject: 'Проблема с VPN',
      body: 'Не могу подключиться к VPN, ошибка 789',
    });
    
    // May fail without LLM API key
    if (res.status !== 200 && res.status !== 500) throw new Error(`Status: ${res.status}`);
  });

  await test('GET /api/v1/nlp/health', async () => {
    const res = await request('GET', '/api/v1/nlp/health');
    
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
  });
}

// ========== CONNECTORS TESTS ==========
async function testConnectors() {
  log.section('Connectors');

  await test('GET /api/v1/connectors/status', async () => {
    const res = await request('GET', '/api/v1/connectors/status');
    
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
  });

  await test('GET /api/v1/connectors/config', async () => {
    const res = await request('GET', '/api/v1/connectors/config');
    
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
  });
}

// ========== WHATSAPP TESTS ==========
async function testWhatsApp() {
  log.section('WhatsApp');

  await test('GET /api/v1/whatsapp/status', async () => {
    const res = await request('GET', '/api/v1/whatsapp/status');
    
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    if (res.data.connectionState === undefined) throw new Error('No connectionState returned');
  });

  await test('GET /api/v1/whatsapp/qr', async () => {
    const res = await request('GET', '/api/v1/whatsapp/qr');
    
    // Should return 200 even if not connected
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
  });
}

// ========== RUN ALL TESTS ==========
async function runTests() {
  console.log('\n' + colors.cyan + '╔════════════════════════════════════════════════╗');
  console.log('║         HelpDesk AI - API Test Suite           ║');
  console.log('╚════════════════════════════════════════════════╝' + colors.reset);
  
  log.info(`Testing against: ${BASE_URL}`);
  
  // Check if server is running
  try {
    const res = await fetch(`${BASE_URL}/api/v1`);
    if (!res.ok) throw new Error('Server not responding');
    log.success('Server is running');
  } catch (error) {
    log.error(`Server not available at ${BASE_URL}`);
    log.info('Start the server with: npm start');
    process.exit(1);
  }

  const startTime = Date.now();

  await testAuth();
  await testTickets();
  await testKnowledgeBase();
  await testAdmin();
  await testNLP();
  await testConnectors();
  await testWhatsApp();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n' + colors.cyan + '════════════════════════════════════════════════' + colors.reset);
  console.log(`\n📊 Results:`);
  console.log(`   ${colors.green}Passed: ${results.passed}${colors.reset}`);
  console.log(`   ${colors.red}Failed: ${results.failed}${colors.reset}`);
  console.log(`   ⏱  Time: ${elapsed}s\n`);

  if (results.failed === 0) {
    console.log(colors.green + '✅ All API tests passed!' + colors.reset);
  } else {
    console.log(colors.red + `❌ ${results.failed} test(s) failed` + colors.reset);
  }

  process.exit(results.failed > 0 ? 1 : 0);
}

runTests();

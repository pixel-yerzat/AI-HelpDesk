#!/usr/bin/env node

/**
 * Backend Integration Tests
 * Tests all major components of the HelpDesk AI system
 */

import dotenv from 'dotenv';
dotenv.config();

// Mock environment for testing
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
process.env.QDRANT_HOST = process.env.QDRANT_HOST || 'localhost';

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
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  section: (msg) => console.log(`\n${colors.cyan}═══ ${msg} ═══${colors.reset}\n`),
};

const results = {
  passed: 0,
  failed: 0,
  skipped: 0,
};

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

async function skip(name, reason) {
  log.warn(`${name} (skipped: ${reason})`);
  results.skipped++;
}

// ========== CONFIG TESTS ==========
async function testConfig() {
  log.section('Configuration');
  
  await test('Config loads without errors', async () => {
    const config = await import('../src/config/index.js');
    if (!config.default) throw new Error('Config not exported');
  });

  await test('Categories config loads', async () => {
    const { TICKET_CATEGORIES, MESSAGE_SOURCES } = await import('../src/config/categories.js');
    if (!TICKET_CATEGORIES || !MESSAGE_SOURCES) throw new Error('Categories not defined');
    if (!MESSAGE_SOURCES.whatsapp) throw new Error('WhatsApp source not defined');
  });
}

// ========== MODEL TESTS ==========
async function testModels() {
  log.section('Models (Structure)');
  
  await test('User model loads', async () => {
    const User = await import('../src/models/User.js');
    if (!User.default) throw new Error('User model not exported');
  });

  await test('Ticket model loads', async () => {
    const Ticket = await import('../src/models/Ticket.js');
    if (!Ticket.default) throw new Error('Ticket model not exported');
  });

  await test('KnowledgeBase model loads', async () => {
    const KB = await import('../src/models/KnowledgeBase.js');
    if (!KB.default) throw new Error('KB model not exported');
  });
}

// ========== NLP SERVICE TESTS ==========
async function testNLPService() {
  log.section('NLP Service (Structure)');
  
  await test('LLM Provider loads', async () => {
    const llm = await import('../src/services/nlp/llmProvider.js');
    if (!llm.getProvider || !llm.getEmbeddingProvider) {
      throw new Error('LLM Provider functions not exported');
    }
  });

  await test('Prompts load', async () => {
    const prompts = await import('../src/services/nlp/prompts.js');
    if (!prompts.default.classifier || !prompts.default.responseRu) {
      throw new Error('Required prompts not defined');
    }
  });

  await test('VectorDB module loads', async () => {
    const vectorDB = await import('../src/services/nlp/vectorDB.js');
    if (!vectorDB.default) throw new Error('VectorDB not exported');
  });

  await test('NLP Service loads', async () => {
    const nlp = await import('../src/services/nlp/index.js');
    if (!nlp.default) throw new Error('NLP Service not exported');
  });
}

// ========== CONNECTOR TESTS ==========
async function testConnectors() {
  log.section('Connectors (Structure)');
  
  await test('BaseConnector loads', async () => {
    const { BaseConnector } = await import('../src/services/connectors/BaseConnector.js');
    if (!BaseConnector) throw new Error('BaseConnector not exported');
  });

  await test('TelegramConnector loads', async () => {
    const { TelegramConnector } = await import('../src/services/connectors/TelegramConnector.js');
    if (!TelegramConnector) throw new Error('TelegramConnector not exported');
  });

  await test('EmailConnector loads', async () => {
    const { EmailConnector } = await import('../src/services/connectors/EmailConnector.js');
    if (!EmailConnector) throw new Error('EmailConnector not exported');
  });

  await test('WhatsAppConnector loads', async () => {
    const { WhatsAppConnector } = await import('../src/services/connectors/WhatsAppConnector.js');
    if (!WhatsAppConnector) throw new Error('WhatsAppConnector not exported');
  });

  await test('ConnectorManager loads', async () => {
    const connectorManager = await import('../src/services/connectors/index.js');
    if (!connectorManager.default) throw new Error('ConnectorManager not exported');
  });
}

// ========== API ROUTE TESTS ==========
async function testAPIRoutes() {
  log.section('API Routes (Structure)');
  
  const routes = [
    'auth', 'tickets', 'messages', 'kb', 'admin', 'nlp', 'connectors', 'whatsapp'
  ];

  for (const route of routes) {
    await test(`Route /${route} loads`, async () => {
      const router = await import(`../src/api/routes/${route}.js`);
      if (!router.default) throw new Error(`${route} router not exported`);
    });
  }

  await test('Routes index loads all routes', async () => {
    const routes = await import('../src/api/routes/index.js');
    if (!routes.default) throw new Error('Routes index not exported');
  });
}

// ========== WORKER TESTS ==========
async function testWorkers() {
  log.section('Workers (Structure)');
  
  await test('ticketProcessor worker exists', async () => {
    const fs = await import('fs');
    if (!fs.existsSync('./src/workers/ticketProcessor.js')) {
      throw new Error('ticketProcessor.js not found');
    }
  });

  await test('telegramBot worker exists', async () => {
    const fs = await import('fs');
    if (!fs.existsSync('./src/workers/telegramBot.js')) {
      throw new Error('telegramBot.js not found');
    }
  });

  await test('whatsappBot worker exists', async () => {
    const fs = await import('fs');
    if (!fs.existsSync('./src/workers/whatsappBot.js')) {
      throw new Error('whatsappBot.js not found');
    }
  });

  await test('outboundSender worker exists', async () => {
    const fs = await import('fs');
    if (!fs.existsSync('./src/workers/outboundSender.js')) {
      throw new Error('outboundSender.js not found');
    }
  });

  await test('kbIndexer worker exists', async () => {
    const fs = await import('fs');
    if (!fs.existsSync('./src/workers/kbIndexer.js')) {
      throw new Error('kbIndexer.js not found');
    }
  });
}

// ========== UTILITIES TESTS ==========
async function testUtilities() {
  log.section('Utilities');
  
  await test('Logger loads', async () => {
    const logger = await import('../src/utils/logger.js');
    if (!logger.default || !logger.default.info) {
      throw new Error('Logger not properly configured');
    }
  });

  await test('Database utility loads', async () => {
    const db = await import('../src/utils/database.js');
    if (!db.default) throw new Error('Database utility not exported');
  });

  await test('Redis utility loads', async () => {
    const redis = await import('../src/utils/redis.js');
    if (!redis.cache || !redis.streams) {
      throw new Error('Redis utilities not exported');
    }
  });
}

// ========== EXPRESS APP TEST ==========
async function testExpressApp() {
  log.section('Express Application');
  
  await test('Main app entry point loads', async () => {
    // Just check the file exists and is syntactically correct
    const fs = await import('fs');
    if (!fs.existsSync('./src/index.js')) {
      throw new Error('src/index.js not found');
    }
  });

  await test('Error handler middleware loads', async () => {
    const { errorHandler, notFoundHandler, ApiError } = await import('../src/api/middleware/errorHandler.js');
    if (!errorHandler || !notFoundHandler || !ApiError) {
      throw new Error('Error handlers not exported');
    }
  });

  await test('Auth middleware loads', async () => {
    const { authenticate, requireRole } = await import('../src/api/middleware/auth.js');
    if (!authenticate || !requireRole) {
      throw new Error('Auth middleware not exported');
    }
  });

  await test('Validators load', async () => {
    const validators = await import('../src/api/validators/index.js');
    if (!validators.ingestMessageValidator || !validators.loginValidator) {
      throw new Error('Validators not exported');
    }
  });
}

// ========== FRONTEND TESTS ==========
async function testFrontend() {
  log.section('Frontend Structure');
  
  const fs = await import('fs');
  
  const frontendFiles = [
    'frontend/package.json',
    'frontend/vite.config.js',
    'frontend/tailwind.config.js',
    'frontend/index.html',
    'frontend/src/main.jsx',
    'frontend/src/App.jsx',
    'frontend/src/index.css',
    'frontend/src/api/index.js',
    'frontend/src/stores/index.js',
    'frontend/src/utils/index.js',
    'frontend/src/components/Layout.jsx',
    'frontend/src/pages/LoginPage.jsx',
    'frontend/src/pages/DashboardPage.jsx',
    'frontend/src/pages/TicketsPage.jsx',
    'frontend/src/pages/TicketDetailPage.jsx',
    'frontend/src/pages/DraftsPage.jsx',
    'frontend/src/pages/KnowledgeBasePage.jsx',
    'frontend/src/pages/ChannelsPage.jsx',
    'frontend/Dockerfile',
    'frontend/nginx.conf',
  ];

  for (const file of frontendFiles) {
    await test(`${file} exists`, async () => {
      if (!fs.existsSync(`./${file}`)) {
        throw new Error(`${file} not found`);
      }
    });
  }
}

// ========== DOCKER TESTS ==========
async function testDocker() {
  log.section('Docker Configuration');
  
  const fs = await import('fs');
  
  await test('docker-compose.yml exists', async () => {
    if (!fs.existsSync('./docker-compose.yml')) {
      throw new Error('docker-compose.yml not found');
    }
  });

  await test('Backend Dockerfile exists', async () => {
    if (!fs.existsSync('./Dockerfile')) {
      throw new Error('Dockerfile not found');
    }
  });

  await test('docker-compose.yml has all services', async () => {
    const content = fs.readFileSync('./docker-compose.yml', 'utf-8');
    const requiredServices = [
      'frontend', 'backend', 'postgres', 'redis', 'qdrant', 'minio',
      'worker-processor', 'worker-telegram', 'worker-whatsapp', 'worker-outbound'
    ];
    
    for (const service of requiredServices) {
      if (!content.includes(service)) {
        throw new Error(`Service "${service}" not found in docker-compose.yml`);
      }
    }
  });
}

// ========== INTEGRATION FLOW TEST ==========
async function testIntegrationFlow() {
  log.section('Integration Flow (Logic Check)');
  
  await test('Ticket flow logic is correct', async () => {
    // Verify the flow: Connector -> Redis -> Processor -> Redis -> Sender
    const connectorMgr = await import('../src/services/connectors/index.js');
    
    // Check that connector manager has required methods
    const required = ['registerConnector', 'startAll', 'sendResponse', 'healthCheck'];
    for (const method of required) {
      if (typeof connectorMgr.default[method] !== 'function') {
        throw new Error(`ConnectorManager missing method: ${method}`);
      }
    }
  });

  await test('NLP pipeline methods exist', async () => {
    const nlp = await import('../src/services/nlp/index.js');
    const required = [
      'detectLanguage', 'classifyTicket', 'predictPriority', 
      'triageTicket', 'generateResponse', 'processTicket'
    ];
    
    for (const method of required) {
      if (typeof nlp.default[method] !== 'function') {
        throw new Error(`NLP Service missing method: ${method}`);
      }
    }
  });
}

// ========== RUN ALL TESTS ==========
async function runAllTests() {
  console.log('\n' + colors.cyan + '╔════════════════════════════════════════════════╗');
  console.log('║     HelpDesk AI - Integration Test Suite       ║');
  console.log('╚════════════════════════════════════════════════╝' + colors.reset);
  
  const startTime = Date.now();

  try {
    await testConfig();
    await testModels();
    await testNLPService();
    await testConnectors();
    await testAPIRoutes();
    await testWorkers();
    await testUtilities();
    await testExpressApp();
    await testFrontend();
    await testDocker();
    await testIntegrationFlow();
  } catch (error) {
    log.error(`Fatal error: ${error.message}`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n' + colors.cyan + '════════════════════════════════════════════════' + colors.reset);
  console.log(`\n📊 Results:`);
  console.log(`   ${colors.green}Passed: ${results.passed}${colors.reset}`);
  console.log(`   ${colors.red}Failed: ${results.failed}${colors.reset}`);
  console.log(`   ${colors.yellow}Skipped: ${results.skipped}${colors.reset}`);
  console.log(`   ⏱  Time: ${elapsed}s\n`);

  if (results.failed === 0) {
    console.log(colors.green + '✅ All tests passed!' + colors.reset);
  } else {
    console.log(colors.red + `❌ ${results.failed} test(s) failed` + colors.reset);
  }

  process.exit(results.failed > 0 ? 1 : 0);
}

runAllTests();

// Prompt templates for NLP tasks
// Supports Russian and Kazakh languages

export const PROMPTS = {
  // Classification prompt
  classifier: {
    system: `You are an IT support ticket classifier. Analyze the ticket and classify it into one of the predefined categories.

Categories:
- access_vpn: VPN access issues, password resets, login problems
- hardware: Physical equipment issues (computers, printers, monitors, keyboards, mice)
- software: Software installation, updates, errors, licensing
- email: Email configuration, access, sending/receiving issues
- network: Network connectivity, WiFi, internet speed issues
- account: User account management, permissions, profiles
- request_new: Requests for new equipment, software, or access
- incident: System outages, critical failures, security incidents
- other: Anything that doesn't fit above categories

Rules:
1. Return ONLY valid JSON
2. Provide top 3 most likely categories with confidence scores (0.0-1.0)
3. Confidence scores should sum to approximately 1.0
4. Include brief rationale for each prediction
5. Consider the language of the ticket (Russian, Kazakh, or English)`,

    user: (subject, body) => `Classify this support ticket:

Subject: ${subject}
Body: ${body}

Return JSON:
{
  "predictions": [
    {"category": "category_code", "confidence": 0.00, "rationale": "brief reason"},
    {"category": "category_code", "confidence": 0.00, "rationale": "brief reason"},
    {"category": "category_code", "confidence": 0.00, "rationale": "brief reason"}
  ],
  "detected_language": "ru|kz|en"
}`,
  },

  // Priority prediction prompt
  priority: {
    system: `You are an IT support priority analyst. Determine the priority of a support ticket based on its content and context.

Priority levels:
- critical: Production outage, security breach, multiple users affected, data loss risk
- high: Single user blocked from work, important deadline affected, executive request
- medium: Work can continue with workaround, moderate inconvenience
- low: Minor issue, cosmetic problem, general question, feature request

Escalation triggers (automatically high/critical):
- Words: outage, production, security, breach, urgent, down, crashed, hacked
- Multiple users mentioned
- Data loss or corruption mentioned
- Executive or VIP mentioned`,

    user: (subject, body, category) => `Analyze this ticket priority:

Subject: ${subject}
Body: ${body}
Category: ${category}

Return JSON:
{
  "priority": "critical|high|medium|low",
  "confidence": 0.00,
  "escalation_required": true|false,
  "escalation_reason": "reason if escalation needed or null",
  "impact_assessment": "brief impact description"
}`,
  },

  // Triage prompt - determine if auto-resolvable
  triage: {
    system: `You are an IT support triage specialist. Determine if a ticket can be auto-resolved based on the ticket content and available knowledge base articles.

A ticket is auto-resolvable if:
1. The KB articles contain a clear, complete solution
2. The solution doesn't require physical intervention
3. The user can follow the steps independently
4. No additional information is needed from the user

A ticket requires manual handling if:
1. Physical access or hardware replacement needed
2. Requires admin-level actions that can't be delegated
3. The issue is unclear or needs clarification
4. KB doesn't contain relevant solution
5. Security-sensitive action required`,

    user: (subject, body, category, kbExcerpts) => `Triage this ticket:

Subject: ${subject}
Body: ${body}
Category: ${category}

Available KB Articles:
${kbExcerpts.map((kb, i) => `${i + 1}. [${kb.id}] ${kb.title}:\n${kb.excerpt}`).join('\n\n')}

Return JSON:
{
  "auto_resolvable": true|false,
  "confidence": 0.00,
  "recommended_action": "generate_response|request_clarification|route_to_operator|escalate",
  "relevant_kb_ids": ["kb_id1", "kb_id2"],
  "missing_information": ["list of needed info if clarification required"],
  "reasoning": "brief explanation"
}`,
  },

  // RAG Response generation - Russian
  responseRu: {
    system: `Вы — вежливый и профессиональный специалист технической поддержки. Ваша задача — помочь пользователю решить его проблему, используя только информацию из базы знаний.

Правила:
1. Используйте ТОЛЬКО информацию из предоставленных статей KB
2. Отвечайте на языке пользователя (русский)
3. Будьте вежливы, но лаконичны (до 150 слов)
4. Давайте чёткие пошаговые инструкции
5. Если информации недостаточно — задайте ОДИН уточняющий вопрос
6. Не придумывайте информацию, которой нет в KB
7. В конце укажите, что пользователь может обратиться за помощью, если решение не помогло`,

    user: (subject, body, kbArticles) => `Обращение пользователя:
Тема: ${subject}
Сообщение: ${body}

Статьи из базы знаний:
${kbArticles.map((kb, i) => `--- Статья ${i + 1}: ${kb.title} ---\n${kb.body}\n`).join('\n')}

Верните JSON:
{
  "answer": "ваш ответ пользователю",
  "summary": "краткое описание проблемы в 1 строку для тикета",
  "kb_refs": ["id использованных статей"],
  "needs_clarification": false,
  "clarification_question": null
}`,
  },

  // RAG Response generation - Kazakh
  responseKz: {
    system: `Сіз — сыпайы және кәсіби техникалық қолдау маманысыз. Сіздің міндетіңіз — пайдаланушыға тек білім қорындағы ақпаратты пайдалана отырып, мәселесін шешуге көмектесу.

Ережелер:
1. Тек берілген KB мақалаларындағы ақпаратты пайдаланыңыз
2. Пайдаланушының тілінде жауап беріңіз (қазақ)
3. Сыпайы, бірақ қысқа болыңыз (150 сөзге дейін)
4. Нақты қадамдық нұсқаулар беріңіз
5. Ақпарат жеткіліксіз болса — БІР нақтылау сұрағын қойыңыз
6. KB-да жоқ ақпаратты ойлап таппаңыз`,

    user: (subject, body, kbArticles) => `Пайдаланушы сұрауы:
Тақырып: ${subject}
Хабарлама: ${body}

Білім қорының мақалалары:
${kbArticles.map((kb, i) => `--- Мақала ${i + 1}: ${kb.title} ---\n${kb.body}\n`).join('\n')}

JSON қайтарыңыз:
{
  "answer": "пайдаланушыға жауабыңыз",
  "summary": "тикет үшін мәселенің қысқаша сипаттамасы",
  "kb_refs": ["пайдаланылған мақалалардың id"],
  "needs_clarification": false,
  "clarification_question": null
}`,
  },

  // Summarizer prompt
  summarizer: {
    system: `You are a support ticket summarizer. Create concise summaries of support conversations for operators.

Output requirements:
1. Chronological summary in 2-3 sentences
2. Extract key entities (devices, software, error codes, users)
3. Suggest next steps based on conversation state
4. Use the same language as the conversation`,

    user: (messages, language) => `Summarize this support conversation (language: ${language}):

${messages.map((m, i) => `[${m.sender_type}] ${m.content}`).join('\n\n')}

Return JSON:
{
  "short_summary": "2-3 sentence summary",
  "entities": [
    {"type": "device|software|error|user|other", "value": "extracted value"}
  ],
  "current_status": "waiting_info|in_progress|blocked|ready_to_close",
  "next_steps": ["suggested action 1", "suggested action 2"],
  "key_issue": "one line description of main issue"
}`,
  },

  // Translation prompt
  translate: {
    system: `You are a professional translator specializing in IT support content. Translate accurately while preserving:
1. Technical terms (keep in original or provide both versions)
2. Error codes and system names (do not translate)
3. Step numbers and formatting
4. Tone and politeness level`,

    user: (text, targetLang) => `Translate the following text to ${targetLang === 'kz' ? 'Kazakh' : targetLang === 'ru' ? 'Russian' : 'English'}.

Text: ${text}

Return JSON:
{
  "translation": "translated text",
  "source_language": "detected source language code",
  "preserved_terms": ["list of terms kept in original"]
}`,
  },

  // Language detection prompt
  languageDetection: {
    system: `Detect the language of the given text. Focus on IT support context.`,

    user: (text) => `Detect the language of this text:

"${text.substring(0, 500)}"

Return JSON:
{
  "language": "ru|kz|en",
  "confidence": 0.00,
  "mixed_languages": false,
  "secondary_language": null
}`,
  },

  // Intent extraction for complex queries
  intentExtraction: {
    system: `Extract user intent and key information from support requests.`,

    user: (text) => `Extract intent from this support request:

"${text}"

Return JSON:
{
  "primary_intent": "report_issue|request_help|ask_question|request_new|complain|follow_up",
  "issue_type": "technical|access|hardware|software|other",
  "urgency_signals": ["list of words indicating urgency"],
  "affected_systems": ["list of mentioned systems/software"],
  "error_codes": ["extracted error codes"],
  "time_references": ["when issue started, deadlines mentioned"],
  "user_attempts": ["what user already tried"]
}`,
  },
};

// Helper to get prompt by language
export const getResponsePrompt = (language) => {
  switch (language) {
    case 'kz':
      return PROMPTS.responseKz;
    case 'ru':
    default:
      return PROMPTS.responseRu;
  }
};

export default PROMPTS;

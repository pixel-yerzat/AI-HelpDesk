import { v4 as uuidv4 } from 'uuid';
import db from '../utils/database.js';
import { TICKET_STATUSES, TICKET_PRIORITIES } from '../config/categories.js';

// Create new ticket
export const createTicket = async (ticketData) => {
  const {
    source,
    sourceId,
    userId,
    subject,
    body,
    language = 'ru',
    attachments = [],
  } = ticketData;

  const id = uuidv4();
  
  const result = await db.query(
    `INSERT INTO tickets (
      id, source, source_id, user_id, subject, body, 
      language, status, attachments, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
    RETURNING *`,
    [id, source, sourceId, userId, subject, body, language, 'new', JSON.stringify(attachments)]
  );

  return result.rows[0];
};

// Get ticket by ID
export const getTicketById = async (id) => {
  const ticket = await db.getOne(
    `SELECT t.*, tn.category, tn.category_conf, tn.priority, tn.priority_conf,
            tn.triage, tn.triage_conf, tn.summary, tn.suggested_response
     FROM tickets t
     LEFT JOIN ticket_nlp tn ON t.id = tn.ticket_id
     WHERE t.id = $1`,
    [id]
  );
  
  if (ticket) {
    ticket.messages = await getTicketMessages(id);
  }
  
  return ticket;
};

// Get ticket by source and source_id
export const getTicketBySourceId = async (source, sourceId) => {
  return await db.getOne(
    `SELECT * FROM tickets WHERE source = $1 AND source_id = $2 
     AND status NOT IN ('closed', 'resolved')
     ORDER BY created_at DESC LIMIT 1`,
    [source, sourceId]
  );
};

// Update ticket
export const updateTicket = async (id, updates) => {
  const allowedFields = ['subject', 'body', 'status', 'priority', 'assigned_to', 'resolved_by', 'resolution_text'];
  const setClause = [];
  const values = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      setClause.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  }

  if (setClause.length === 0) return null;

  setClause.push(`updated_at = NOW()`);
  
  // Handle special status updates
  if (updates.status === 'resolved') {
    setClause.push(`resolved_at = NOW()`);
  }

  values.push(id);

  const result = await db.query(
    `UPDATE tickets SET ${setClause.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  return result.rows[0];
};

// Get tickets with filters
export const getTickets = async (filters = {}, pagination = { page: 1, limit: 20 }) => {
  const { status, source, category, priority, assignedTo, search } = filters;
  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  let whereClause = [];
  let values = [];
  let paramIndex = 1;

  if (status) {
    whereClause.push(`t.status = $${paramIndex}`);
    values.push(status);
    paramIndex++;
  }

  if (source) {
    whereClause.push(`t.source = $${paramIndex}`);
    values.push(source);
    paramIndex++;
  }

  if (category) {
    whereClause.push(`tn.category = $${paramIndex}`);
    values.push(category);
    paramIndex++;
  }

  if (priority) {
    whereClause.push(`tn.priority = $${paramIndex}`);
    values.push(priority);
    paramIndex++;
  }

  if (assignedTo) {
    whereClause.push(`t.assigned_to = $${paramIndex}`);
    values.push(assignedTo);
    paramIndex++;
  }

  if (search) {
    whereClause.push(`(t.subject ILIKE $${paramIndex} OR t.body ILIKE $${paramIndex})`);
    values.push(`%${search}%`);
    paramIndex++;
  }

  const whereString = whereClause.length > 0 ? `WHERE ${whereClause.join(' AND ')}` : '';

  // Get total count
  const countResult = await db.query(
    `SELECT COUNT(*) FROM tickets t 
     LEFT JOIN ticket_nlp tn ON t.id = tn.ticket_id 
     ${whereString}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // Get tickets
  values.push(limit, offset);
  const result = await db.query(
    `SELECT t.*, tn.category, tn.category_conf, tn.priority, tn.priority_conf, tn.summary
     FROM tickets t
     LEFT JOIN ticket_nlp tn ON t.id = tn.ticket_id
     ${whereString}
     ORDER BY t.created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    values
  );

  return {
    tickets: result.rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// Add message to ticket
export const addTicketMessage = async (ticketId, messageData) => {
  const { sender, senderType, content, attachments = [] } = messageData;
  const id = uuidv4();

  const result = await db.query(
    `INSERT INTO ticket_messages (id, ticket_id, sender, sender_type, content, attachments, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     RETURNING *`,
    [id, ticketId, sender, senderType, content, JSON.stringify(attachments)]
  );

  // Update ticket's updated_at
  await db.query('UPDATE tickets SET updated_at = NOW() WHERE id = $1', [ticketId]);

  return result.rows[0];
};

// Get ticket messages
export const getTicketMessages = async (ticketId) => {
  return await db.getMany(
    `SELECT * FROM ticket_messages WHERE ticket_id = $1 ORDER BY created_at ASC`,
    [ticketId]
  );
};

// Save NLP results
export const saveTicketNlp = async (ticketId, nlpData) => {
  const {
    category,
    categoryConf,
    priority,
    priorityConf,
    triage,
    triageConf,
    summary,
    suggestedResponse,
    embeddingsRef,
  } = nlpData;

  const result = await db.query(
    `INSERT INTO ticket_nlp (
      ticket_id, category, category_conf, priority, priority_conf,
      triage, triage_conf, summary, suggested_response, embeddings_ref
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (ticket_id) DO UPDATE SET
      category = $2, category_conf = $3, priority = $4, priority_conf = $5,
      triage = $6, triage_conf = $7, summary = $8, suggested_response = $9,
      embeddings_ref = $10
    RETURNING *`,
    [ticketId, category, categoryConf, priority, priorityConf, triage, triageConf, summary, suggestedResponse, embeddingsRef]
  );

  return result.rows[0];
};

// Get pending drafts for approval
export const getPendingDrafts = async (limit = 20) => {
  return await db.getMany(
    `SELECT t.*, tn.category, tn.category_conf, tn.priority, tn.suggested_response, tn.summary
     FROM tickets t
     JOIN ticket_nlp tn ON t.id = tn.ticket_id
     WHERE t.status = 'draft_pending'
     ORDER BY t.created_at ASC
     LIMIT $1`,
    [limit]
  );
};

// Get statistics
export const getStats = async (dateFrom, dateTo) => {
  const stats = await db.getOne(
    `SELECT 
      COUNT(*) as total_tickets,
      COUNT(*) FILTER (WHERE status = 'resolved') as resolved_tickets,
      COUNT(*) FILTER (WHERE status = 'closed') as closed_tickets,
      COUNT(*) FILTER (WHERE resolved_by = 'auto') as auto_resolved,
      AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600) FILTER (WHERE resolved_at IS NOT NULL) as avg_resolution_hours
     FROM tickets
     WHERE created_at >= $1 AND created_at <= $2`,
    [dateFrom, dateTo]
  );

  const bySource = await db.getMany(
    `SELECT source, COUNT(*) as count 
     FROM tickets 
     WHERE created_at >= $1 AND created_at <= $2
     GROUP BY source`,
    [dateFrom, dateTo]
  );

  const byCategory = await db.getMany(
    `SELECT tn.category, COUNT(*) as count 
     FROM tickets t
     JOIN ticket_nlp tn ON t.id = tn.ticket_id
     WHERE t.created_at >= $1 AND t.created_at <= $2
     GROUP BY tn.category
     ORDER BY count DESC`,
    [dateFrom, dateTo]
  );

  return {
    ...stats,
    bySource,
    byCategory,
  };
};

export default {
  createTicket,
  getTicketById,
  getTicketBySourceId,
  updateTicket,
  getTickets,
  addTicketMessage,
  getTicketMessages,
  saveTicketNlp,
  getPendingDrafts,
  getStats,
};

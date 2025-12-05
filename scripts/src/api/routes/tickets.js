import { Router } from 'express';
import { validationResult } from 'express-validator';
import Ticket from '../../models/Ticket.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { asyncHandler, ApiError, formatValidationErrors } from '../middleware/errorHandler.js';
import { ticketIdValidator, ticketActionValidator, ticketListValidator } from '../validators/index.js';
import { logAudit } from '../../utils/logger.js';
import { streams } from '../../utils/redis.js';

const router = Router();

// Get tickets list
router.get('/',
  authenticate,
  requirePermission('tickets:read'),
  ticketListValidator,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw ApiError.badRequest('Validation failed', formatValidationErrors(errors));
    }

    const { page = 1, limit = 20, status, source, category, priority, assigned_to, search } = req.query;

    const result = await Ticket.getTickets(
      { status, source, category, priority, assignedTo: assigned_to, search },
      { page: parseInt(page), limit: parseInt(limit) }
    );

    res.json(result);
  })
);

// Get pending drafts (for operator approval)
router.get('/drafts',
  authenticate,
  requirePermission('tickets:approve'),
  asyncHandler(async (req, res) => {
    const drafts = await Ticket.getPendingDrafts(50);
    res.json({ drafts });
  })
);

// Get single ticket
router.get('/:id',
  authenticate,
  requirePermission('tickets:read'),
  ticketIdValidator,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw ApiError.badRequest('Validation failed', formatValidationErrors(errors));
    }

    const ticket = await Ticket.getTicketById(req.params.id);
    
    if (!ticket) {
      throw ApiError.notFound('Ticket not found');
    }

    // Check if user can access this ticket (own tickets for regular users)
    if (req.user.role === 'user' && ticket.user_id !== req.user.id) {
      throw ApiError.forbidden('Access denied to this ticket');
    }

    res.json({ ticket });
  })
);

// Perform action on ticket
router.post('/:id/action',
  authenticate,
  requirePermission('tickets:update'),
  ticketActionValidator,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw ApiError.badRequest('Validation failed', formatValidationErrors(errors));
    }

    const { id } = req.params;
    const { action, comment, response_text, assigned_to } = req.body;

    const ticket = await Ticket.getTicketById(id);
    if (!ticket) {
      throw ApiError.notFound('Ticket not found');
    }

    let updates = {};
    let auditAction = action;

    switch (action) {
      case 'approve':
        // Approve auto-generated response and send
        if (ticket.status !== 'draft_pending') {
          throw ApiError.badRequest('Ticket is not in draft_pending status');
        }
        updates = { status: 'resolved', resolved_by: 'auto_approved', resolution_text: response_text || ticket.suggested_response };
        // TODO: Send response to user via appropriate channel
        await streams.addToStream('outbound_messages', {
          ticketId: id,
          source: ticket.source,
          sourceId: ticket.source_id,
          message: response_text || ticket.suggested_response,
        });
        break;

      case 'reject':
        // Reject auto-generated response, set to manual handling
        if (ticket.status !== 'draft_pending') {
          throw ApiError.badRequest('Ticket is not in draft_pending status');
        }
        updates = { status: 'in_progress' };
        if (comment) {
          await Ticket.addTicketMessage(id, {
            sender: req.user.id,
            senderType: 'operator',
            content: `Draft rejected: ${comment}`,
          });
        }
        break;

      case 'escalate':
        updates = { status: 'escalated', priority: 'high' };
        break;

      case 'assign':
        if (!assigned_to) {
          throw ApiError.badRequest('assigned_to is required for assign action');
        }
        updates = { assigned_to, status: ticket.status === 'new' ? 'in_progress' : ticket.status };
        break;

      case 'close':
        updates = { status: 'closed' };
        if (response_text) {
          updates.resolution_text = response_text;
        }
        break;

      case 'reopen':
        if (!['resolved', 'closed'].includes(ticket.status)) {
          throw ApiError.badRequest('Can only reopen resolved or closed tickets');
        }
        updates = { status: 'in_progress', resolved_at: null, resolved_by: null };
        break;

      case 'add_note':
        if (!comment) {
          throw ApiError.badRequest('comment is required for add_note action');
        }
        await Ticket.addTicketMessage(id, {
          sender: req.user.id,
          senderType: 'operator',
          content: comment,
        });
        break;

      default:
        throw ApiError.badRequest('Unknown action');
    }

    let updatedTicket = ticket;
    if (Object.keys(updates).length > 0) {
      updatedTicket = await Ticket.updateTicket(id, updates);
    }

    // Log audit event
    logAudit(id, req.user.id, auditAction, { comment, response_text, assigned_to });

    res.json({ 
      success: true, 
      ticket: await Ticket.getTicketById(id),
      message: `Action '${action}' completed successfully`
    });
  })
);

// Add message to ticket (operator reply)
router.post('/:id/messages',
  authenticate,
  requirePermission('tickets:update'),
  ticketIdValidator,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw ApiError.badRequest('Validation failed', formatValidationErrors(errors));
    }

    const { id } = req.params;
    const { content, send_to_user = false } = req.body;

    if (!content || !content.trim()) {
      throw ApiError.badRequest('Message content is required');
    }

    const ticket = await Ticket.getTicketById(id);
    if (!ticket) {
      throw ApiError.notFound('Ticket not found');
    }

    const message = await Ticket.addTicketMessage(id, {
      sender: req.user.id,
      senderType: 'operator',
      content: content.trim(),
    });

    // If send_to_user, queue outbound message
    if (send_to_user) {
      await streams.addToStream('outbound_messages', {
        ticketId: id,
        source: ticket.source,
        sourceId: ticket.source_id,
        message: content.trim(),
      });
    }

    // Update ticket status if it was waiting
    if (ticket.status === 'new') {
      await Ticket.updateTicket(id, { status: 'in_progress' });
    }

    logAudit(id, req.user.id, 'message_added', { send_to_user });

    res.json({ success: true, message });
  })
);

// Get ticket messages/history
router.get('/:id/messages',
  authenticate,
  requirePermission('tickets:read'),
  ticketIdValidator,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw ApiError.badRequest('Validation failed', formatValidationErrors(errors));
    }

    const ticket = await Ticket.getTicketById(req.params.id);
    if (!ticket) {
      throw ApiError.notFound('Ticket not found');
    }

    // Check access
    if (req.user.role === 'user' && ticket.user_id !== req.user.id) {
      throw ApiError.forbidden('Access denied');
    }

    const messages = await Ticket.getTicketMessages(req.params.id);
    res.json({ messages });
  })
);

export default router;

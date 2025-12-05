import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import db from '../utils/database.js';

// User roles
export const USER_ROLES = {
  admin: { name: 'Administrator', permissions: ['*'] },
  operator: { name: 'Operator', permissions: ['tickets:read', 'tickets:update', 'tickets:approve', 'kb:read'] },
  performer: { name: 'Performer', permissions: ['tickets:read', 'tickets:update', 'tickets:close'] },
  user: { name: 'End User', permissions: ['tickets:create', 'tickets:read:own'] },
};

// Create user
export const createUser = async (userData) => {
  const { email, password, name, role = 'user', externalId, source } = userData;
  const id = uuidv4();
  
  let passwordHash = null;
  if (password) {
    passwordHash = await bcrypt.hash(password, 10);
  }

  const result = await db.query(
    `INSERT INTO users (id, email, password_hash, name, role, external_id, source, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
     RETURNING id, email, name, role, external_id, source, created_at`,
    [id, email, passwordHash, name, role, externalId, source]
  );

  return result.rows[0];
};

// Get user by ID
export const getUserById = async (id) => {
  return await db.getOne(
    `SELECT id, email, name, role, external_id, source, created_at, updated_at 
     FROM users WHERE id = $1`,
    [id]
  );
};

// Get user by email
export const getUserByEmail = async (email) => {
  return await db.getOne(
    `SELECT * FROM users WHERE email = $1`,
    [email]
  );
};

// Get user by external ID (e.g., Telegram user ID)
export const getUserByExternalId = async (externalId, source) => {
  return await db.getOne(
    `SELECT id, email, name, role, external_id, source, created_at, updated_at 
     FROM users WHERE external_id = $1 AND source = $2`,
    [externalId, source]
  );
};

// Find or create user by external ID
export const findOrCreateByExternalId = async (externalId, source, userData = {}) => {
  let user = await getUserByExternalId(externalId, source);
  
  if (!user) {
    user = await createUser({
      email: userData.email || `${source}_${externalId}@external.local`,
      name: userData.name || `${source} User`,
      role: 'user',
      externalId,
      source,
    });
  }

  return user;
};

// Verify password
export const verifyPassword = async (user, password) => {
  if (!user.password_hash) return false;
  return await bcrypt.compare(password, user.password_hash);
};

// Update user
export const updateUser = async (id, updates) => {
  const allowedFields = ['email', 'name', 'role'];
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

  if (updates.password) {
    setClause.push(`password_hash = $${paramIndex}`);
    values.push(await bcrypt.hash(updates.password, 10));
    paramIndex++;
  }

  if (setClause.length === 0) return null;

  setClause.push(`updated_at = NOW()`);
  values.push(id);

  const result = await db.query(
    `UPDATE users SET ${setClause.join(', ')} WHERE id = $${paramIndex} 
     RETURNING id, email, name, role, external_id, source, created_at, updated_at`,
    values
  );

  return result.rows[0];
};

// Get users list (for admin)
export const getUsers = async (filters = {}, pagination = { page: 1, limit: 20 }) => {
  const { role, search } = filters;
  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  let whereClause = [];
  let values = [];
  let paramIndex = 1;

  if (role) {
    whereClause.push(`role = $${paramIndex}`);
    values.push(role);
    paramIndex++;
  }

  if (search) {
    whereClause.push(`(name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`);
    values.push(`%${search}%`);
    paramIndex++;
  }

  const whereString = whereClause.length > 0 ? `WHERE ${whereClause.join(' AND ')}` : '';

  const countResult = await db.query(
    `SELECT COUNT(*) FROM users ${whereString}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  values.push(limit, offset);
  const result = await db.query(
    `SELECT id, email, name, role, external_id, source, created_at, updated_at
     FROM users ${whereString}
     ORDER BY created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    values
  );

  return {
    users: result.rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// Get operators (for assignment)
export const getOperators = async () => {
  return await db.getMany(
    `SELECT id, email, name, role FROM users WHERE role IN ('admin', 'operator', 'performer')`,
    []
  );
};

// Check permission
export const hasPermission = (user, permission) => {
  const role = USER_ROLES[user.role];
  if (!role) return false;
  return role.permissions.includes('*') || role.permissions.includes(permission);
};

export default {
  USER_ROLES,
  createUser,
  getUserById,
  getUserByEmail,
  getUserByExternalId,
  findOrCreateByExternalId,
  verifyPassword,
  updateUser,
  getUsers,
  getOperators,
  hasPermission,
};

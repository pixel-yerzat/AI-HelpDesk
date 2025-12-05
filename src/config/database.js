const knex = require('knex');
const config = require('./index');

const db = knex({
  client: 'pg',
  connection: config.database.url,
  pool: {
    min: 2,
    max: 10
  },
  migrations: {
    tableName: 'knex_migrations',
    directory: '../scripts/migrations'
  },
  seeds: {
    directory: '../scripts/seeds'
  }
});

module.exports = db;

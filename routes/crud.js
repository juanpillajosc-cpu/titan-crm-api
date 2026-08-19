import { Router } from 'express';
import { pool } from '../db/pool.js';
import { rowsToCamel, rowToCamel, bodyToSnake } from '../db/caseUtils.js';

// Fábrica de rutas CRUD reutilizable para cada tabla (prospects, clients, products,
// quotes, orders, users). Evita repetir la misma lógica de SELECT/INSERT/UPDATE 6 veces.
//
// idPrefix/idStart/idPadding replican exactamente el esquema de IDs que ya usaba el
// frontend (P001, C100, COT-001, PED-101, PR01, U001) para que la migración sea transparente.
export function createCrudRouter({ table, idPrefix, idStart = 1, idPadding = 0, jsonbSnakeFields = [], hasUpdatedAt = false }) {
  const router = Router();

  const stringifyJsonb = (snakeBody) => {
    for (const field of jsonbSnakeFields) {
      if (snakeBody[field] !== undefined) snakeBody[field] = JSON.stringify(snakeBody[field]);
    }
    return snakeBody;
  };

  router.get('/', async (_req, res) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM ${table} ORDER BY created_at ASC`);
      res.json(rowsToCamel(rows));
    } catch (err) {
      console.error(`GET /${table} error:`, err);
      res.status(500).json({ error: `Error consultando ${table}` });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
      res.json(rowToCamel(rows[0]));
    } catch (err) {
      console.error(`GET /${table}/:id error:`, err);
      res.status(500).json({ error: `Error consultando ${table}` });
    }
  });

  router.post('/', async (req, res) => {
    try {
      const body = { ...req.body };
      if (!body.id) {
        const { rows } = await pool.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
        const idNumber = idStart + rows[0].count;
        const idStr = idPadding ? String(idNumber).padStart(idPadding, '0') : String(idNumber);
        body.id = `${idPrefix}${idStr}`;
      }
      const snake = stringifyJsonb(bodyToSnake(body));
      const keys = Object.keys(snake);
      const values = Object.values(snake);
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const { rows } = await pool.query(
        `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`,
        values
      );
      res.status(201).json(rowToCamel(rows[0]));
    } catch (err) {
      console.error(`POST /${table} error:`, err);
      res.status(500).json({ error: `Error creando registro en ${table}`, detail: err.message });
    }
  });

  router.patch('/:id', async (req, res) => {
    try {
      const snake = stringifyJsonb(bodyToSnake(req.body));
      if (hasUpdatedAt) snake.updated_at = new Date();
      const keys = Object.keys(snake);
      const values = Object.values(snake);
      const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
      const { rows } = await pool.query(
        `UPDATE ${table} SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`,
        [...values, req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
      res.json(rowToCamel(rows[0]));
    } catch (err) {
      console.error(`PATCH /${table}/:id error:`, err);
      res.status(500).json({ error: `Error actualizando ${table}`, detail: err.message });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      await pool.query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
      res.status(204).end();
    } catch (err) {
      console.error(`DELETE /${table}/:id error:`, err);
      res.status(500).json({ error: `Error eliminando en ${table}` });
    }
  });

  return router;
}

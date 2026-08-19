import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pool } from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  console.log('Ejecutando schema.sql contra la base de datos...');
  try {
    await pool.query(sql);
    console.log('Listo. Tablas creadas/verificadas y datos semilla (usuarios, productos) insertados.');
  } catch (err) {
    console.error('Error ejecutando la migración:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();

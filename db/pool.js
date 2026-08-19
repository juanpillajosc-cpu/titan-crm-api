import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error('Falta la variable de entorno DATABASE_URL. En Railway se genera automáticamente al agregar el plugin de PostgreSQL.');
}

// Railway (y la mayoría de proveedores cloud de Postgres) requieren SSL, pero con
// certificado no verificado por defecto en su capa gratuita/estándar.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL:', err);
});

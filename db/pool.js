import pg from 'pg';
import 'dotenv/config';

const { Pool, types } = pg;

// node-postgres devuelve las columnas NUMERIC como STRING por defecto (para no perder precisión
// decimal). El frontend hace aritmética normal con estos valores (subtotales, IVA, cupos de
// crédito, deuda) — si llegan como string, sumas como `c.debt + q.total` concatenan texto en vez
// de sumar números ("10000" + "1200" = "100001200"). Forzamos que NUMERIC se parsee como float.
types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val))); // numeric/decimal

// DATE por defecto se convierte a un objeto Date de JS interpretado en UTC, lo que puede correr
// la fecha un día dependiendo de la zona horaria del navegador. Todo el frontend ya trabaja con
// fechas como texto plano "YYYY-MM-DD", así que dejamos el valor tal cual viene de la base.
types.setTypeParser(1082, (val) => val); // date

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

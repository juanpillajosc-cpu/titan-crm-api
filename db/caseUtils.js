// Convierte una fila de Postgres (snake_case) al formato que espera el frontend (camelCase),
// y viceversa. Así el resto del código de la API puede pensar en JS "normal" sin acordarse
// de que la base de datos usa snake_case.

export const toCamel = (str) => str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
export const toSnake = (str) => str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

export const rowToCamel = (row) => {
  if (!row) return row;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[toCamel(key)] = value;
  }
  return out;
};

export const rowsToCamel = (rows) => rows.map(rowToCamel);

export const bodyToSnake = (body) => {
  const out = {};
  for (const [key, value] of Object.entries(body)) {
    out[toSnake(key)] = value;
  }
  return out;
};

import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { pool } from './db/pool.js';
import { createCrudRouter } from './routes/crud.js';
import aiRouter from './routes/ai.js';

const app = express();

// CORS: en producción, restringe a la URL real del frontend vía la variable FRONTEND_URL.
// Mientras se configura, permite cualquier origen para no bloquear las pruebas iniciales.
const allowedOrigin = process.env.FRONTEND_URL;
app.use(cors(allowedOrigin ? { origin: allowedOrigin } : {}));
app.use(express.json({ limit: '5mb' })); // fotos de perfil/producto van en base64

// ---------- Rutas de recursos (mismo esquema de IDs que usaba el frontend) ----------
app.use('/api/users', createCrudRouter({ table: 'users', idPrefix: 'U', idStart: 1, idPadding: 3 }));

app.use('/api/prospects', createCrudRouter({
  table: 'prospects', idPrefix: 'P', idStart: 1, idPadding: 3, hasUpdatedAt: true,
  jsonbSnakeFields: ['history'],
}));

app.use('/api/clients', createCrudRouter({
  table: 'clients', idPrefix: 'C', idStart: 100, idPadding: 0, hasUpdatedAt: true,
  jsonbSnakeFields: ['documents', 'collections_history', 'activities'],
}));

app.use('/api/products', createCrudRouter({
  table: 'products', idPrefix: 'PR', idStart: 1, idPadding: 2, hasUpdatedAt: true,
  jsonbSnakeFields: ['entries', 'exits'],
}));

app.use('/api/quotes', createCrudRouter({
  table: 'quotes', idPrefix: 'COT-', idStart: 1, idPadding: 3, hasUpdatedAt: true,
  jsonbSnakeFields: ['items', 'versions', 'sent_info'],
}));

app.use('/api/orders', createCrudRouter({ table: 'orders', idPrefix: 'PED-', idStart: 101, idPadding: 0 }));

// ---------- IA real (lead scoring y recomendación de crédito) ----------
app.use('/api/ai', aiRouter);

// ---------- Salud del servicio ----------
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', database: 'disconnected', detail: err.message });
  }
});

app.get('/', (_req, res) => {
  res.json({ service: 'titan-crm-api', status: 'running' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Titán CRM API escuchando en el puerto ${PORT}`);
});

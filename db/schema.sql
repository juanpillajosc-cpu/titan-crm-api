-- ============================================================
-- Titán CRM — Esquema de base de datos (PostgreSQL)
-- Los campos con estructura compleja (documentos, historial, items
-- de cotización, entradas/salidas de inventario) se guardan como
-- JSONB: misma forma de dato que ya usa el frontend, para que la
-- migración desde localStorage sea directa.
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('Ejecutivo de Cuenta', 'Jefe de Ventas Institucionales')),
  photo       TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prospects (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  type          TEXT,
  city          TEXT,
  contact       TEXT,
  position      TEXT,
  phone         TEXT,
  email         TEXT,
  size          TEXT,
  exec          TEXT,
  observations  TEXT,
  ruc           TEXT,
  address       TEXT,
  legal_rep     TEXT,
  taxpayer_type TEXT,
  regimen_tributario TEXT,
  status        TEXT DEFAULT 'Prospecto',
  ai_score      INTEGER,
  ai_reasoning  TEXT,
  ai_cluster    TEXT,
  ai_analysis   JSONB DEFAULT '{}',
  priority      TEXT,
  history       JSONB DEFAULT '[]',
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Columnas agregadas después del primer despliegue: ALTER TABLE es seguro de re-correr,
-- no borra ni afecta las filas que ya existen en producción.
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS regimen_tributario TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS ai_cluster TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS ai_analysis JSONB DEFAULT '{}';

CREATE TABLE IF NOT EXISTS clients (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  ruc                   TEXT UNIQUE,
  segment               TEXT,
  status                TEXT DEFAULT 'Pendiente',
  credit_quota          NUMERIC DEFAULT 0,
  available_quota       NUMERIC DEFAULT 0,
  debt                  NUMERIC DEFAULT 0,
  days_in_mora          INTEGER DEFAULT 0,
  exec                  TEXT,
  address               TEXT,
  legal_rep             TEXT,
  taxpayer_type         TEXT,
  contact               TEXT,
  commercial_refs       TEXT,
  source_prospect_id    TEXT,
  last_purchase_date    DATE,
  credit_line_expiry    DATE,
  agreement_expiry      DATE,
  approval_observations TEXT,
  approval_history      JSONB DEFAULT '[]',
  documents             JSONB DEFAULT '[]',
  collections_history   JSONB DEFAULT '[]',
  activities            JSONB DEFAULT '[]',
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- Columnas agregadas después del primer despliegue: seguro de re-correr, no borra datos existentes.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS commercial_refs TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS approval_history JSONB DEFAULT '[]';

CREATE TABLE IF NOT EXISTS products (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  price       NUMERIC NOT NULL DEFAULT 0,
  iva_type    TEXT NOT NULL DEFAULT 'gravado15' CHECK (iva_type IN ('gravado15', 'tarifa0', 'no_objeto')),
  description TEXT,
  supplier    TEXT,
  image       TEXT DEFAULT '',
  stock_min   INTEGER DEFAULT 0,
  entries     JSONB DEFAULT '[]',
  exits       JSONB DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quotes (
  id                     TEXT PRIMARY KEY,
  client                 TEXT,
  client_id              TEXT,
  exec                   TEXT,
  date                   DATE,
  valid_until            DATE,
  payment_condition      TEXT,
  credit_days            INTEGER,
  items                  JSONB DEFAULT '[]',
  subtotal               NUMERIC DEFAULT 0,
  iva_total              NUMERIC DEFAULT 0,
  total                  NUMERIC DEFAULT 0,
  conditions             TEXT,
  status                 TEXT DEFAULT 'Borrador',
  versions               JSONB DEFAULT '[]',
  sent_info              JSONB,
  client_response_reason TEXT,
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS client_response_reason TEXT;

CREATE TABLE IF NOT EXISTS orders (
  id                TEXT PRIMARY KEY,
  client            TEXT,
  client_id         TEXT,
  quote_id          TEXT,
  date              DATE,
  total             NUMERIC DEFAULT 0,
  status            TEXT,
  payment_condition TEXT,
  validation_note   TEXT,
  items             JSONB DEFAULT '[]',
  created_at        TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS quote_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]';

-- ============================================================
-- Usuarios reales del equipo (segregación de funciones)
-- ============================================================
INSERT INTO users (id, name, role, photo) VALUES
  ('U001', 'Edgar Andrés Freire Engracia', 'Jefe de Ventas Institucionales', ''),
  ('U002', 'Domenica Fabiana Jaramillo Samaniego', 'Ejecutivo de Cuenta', ''),
  ('U003', 'Paola Andrea Muñoz Fajardo', 'Ejecutivo de Cuenta', ''),
  ('U004', 'José Andrés Pillasagua Pilay', 'Ejecutivo de Cuenta', ''),
  ('U005', 'Juan Sebastián Pillajo Cuasqui', 'Ejecutivo de Cuenta', '')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Catálogo de productos inicial (mismo set que traía el frontend)
-- ============================================================
INSERT INTO products (id, name, price, iva_type, description, supplier, stock_min, entries) VALUES
  ('PR01', 'Detergente Industrial 20L', 45, 'gravado15', 'Detergente concentrado de alto rendimiento para superficies industriales.', 'Química del Pacífico', 20, '[{"date":"2026-07-01","quantity":120,"note":"Compra inicial"}]'),
  ('PR02', 'Papel Higiénico Institucional (paquete x24)', 18, 'gravado15', 'Paquete institucional de papel higiénico doble hoja.', 'Distribuidora Andina', 30, '[{"date":"2026-07-01","quantity":80,"note":"Compra inicial"}]'),
  ('PR03', 'Desinfectante Multiusos 5L', 22, 'gravado15', 'Desinfectante multiusos de amplio espectro, presentación 5 litros.', 'Química del Pacífico', 25, '[{"date":"2026-07-05","quantity":40,"note":"Compra inicial"}]'),
  ('PR04', 'Guantes de Nitrilo (caja x100)', 12, 'gravado15', 'Guantes de nitrilo sin polvo, caja de 100 unidades.', 'Suministros MedSafe', 20, '[{"date":"2026-07-05","quantity":60,"note":"Compra inicial"}]'),
  ('PR05', 'Servilletas Dispensador (paquete x500)', 9, 'gravado15', 'Servilletas para dispensador institucional, paquete de 500.', 'Distribuidora Andina', 30, '[{"date":"2026-07-01","quantity":90,"note":"Compra inicial"}]'),
  ('PR06', 'Café Molido Premium 1kg', 14, 'tarifa0', 'Café molido premium, tarifa 0% de IVA por ser producto alimenticio de primera necesidad.', 'Hacienda Café Andino', 15, '[{"date":"2026-07-10","quantity":35,"note":"Compra inicial"}]'),
  ('PR07', 'Kit Amenities Hotel (x50 unidades)', 65, 'gravado15', 'Kit de amenities para hotel: shampoo, jabón y gorro de ducha, 50 unidades.', 'Hotel Supply Ecuador', 10, '[{"date":"2026-07-10","quantity":15,"note":"Compra inicial"}]'),
  ('PR08', 'Bolsas de Basura Industrial (rollo x25)', 11, 'gravado15', 'Rollo de bolsas de basura industrial reforzadas, 25 unidades.', 'Distribuidora Andina', 25, '[{"date":"2026-07-01","quantity":70,"note":"Compra inicial"}]')
ON CONFLICT (id) DO NOTHING;

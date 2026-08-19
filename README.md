# Titán CRM API

Backend en Node/Express + PostgreSQL para Titán CRM. Reemplaza el localStorage del
frontend por una base de datos real en la nube, y expone dos endpoints de IA real
(Lead Scoring y recomendación de crédito) que llaman a la API de Anthropic con la
API key protegida en el servidor.

## Endpoints

- `GET/POST /api/prospects`, `GET/PATCH/DELETE /api/prospects/:id`
- `GET/POST /api/clients`, `GET/PATCH/DELETE /api/clients/:id`
- `GET/POST /api/products`, `GET/PATCH/DELETE /api/products/:id`
- `GET/POST /api/quotes`, `GET/PATCH/DELETE /api/quotes/:id`
- `GET/POST /api/orders`, `GET/PATCH/DELETE /api/orders/:id`
- `GET/POST /api/users`, `GET/PATCH/DELETE /api/users/:id`
- `POST /api/ai/score-prospect` — Lead Scoring real con IA
- `POST /api/ai/credit-recommendation` — Recomendación de cupo de crédito con IA
- `GET /api/health` — verifica conexión a la base de datos

## Desarrollo local

Necesitas PostgreSQL corriendo localmente (o usa la URL de Railway directamente).

```bash
npm install
cp .env.example .env   # y completa DATABASE_URL, ANTHROPIC_API_KEY
npm run migrate        # crea las tablas y siembra usuarios/productos iniciales
npm run dev
```

## Desplegar en Railway

1. Sube esta carpeta a un repositorio de GitHub nuevo, ej. `titan-crm-api` (mismo proceso que hicimos con el frontend: `git init`, `git add .`, `git commit`, crear el repo en GitHub, `git push`).
2. En el **mismo proyecto de Railway** donde está `titan-crm` (el frontend): botón **+ New** → **Database** → **Add PostgreSQL**. Railway crea la base y genera automáticamente la variable `DATABASE_URL`.
3. **+ New** → **GitHub Repo** → selecciona `titan-crm-api`. Railway detecta Node y lo despliega.
4. En el servicio `titan-crm-api` → **Variables**:
   - `DATABASE_URL`: click en **Add Reference** → selecciona la variable `DATABASE_URL` del servicio Postgres (así quedan conectados automáticamente, sin copiar/pegar).
   - `ANTHROPIC_API_KEY`: tu API key de Anthropic (console.anthropic.com).
   - `AI_MODEL` (opcional): por defecto usa `claude-sonnet-5`.
   - `FRONTEND_URL`: la URL pública de tu frontend en Railway (ej. `https://titan-crm-production.up.railway.app`), para que solo ese sitio pueda llamar a la API.
5. En **Settings → Deploy**, agrega como comando de build/deploy previo: en la pestaña **Settings → Deploy**, bajo "Custom Start Command" puedes dejar `npm start`, pero **antes del primer arranque necesitas correr la migración una vez**. La forma más simple: en Railway, abre la pestaña **Console** de este servicio (o conéctate por `railway run`) y ejecuta `npm run migrate` una sola vez. Alternativamente, cambia temporalmente el Start Command a `npm run migrate && npm start` para el primer deploy, y reviértelo a `npm start` después.
6. **Settings → Networking → Generate Domain** para obtener la URL pública del backend (algo como `titan-crm-api-production.up.railway.app`).

## Variables de entorno necesarias

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Cadena de conexión a PostgreSQL (Railway la genera sola) |
| `ANTHROPIC_API_KEY` | API key de Anthropic, para los endpoints de IA real |
| `AI_MODEL` | Opcional. Modelo a usar (default: `claude-sonnet-5`) |
| `FRONTEND_URL` | URL del frontend, para restringir CORS |
| `PORT` | Puerto del servidor (Railway lo inyecta automáticamente) |

## Seguridad

- La `ANTHROPIC_API_KEY` vive solo en el servidor — nunca se envía al navegador.
- Las contraseñas todavía no existen en el sistema (selector de cuentas, no login con clave). Cuando se necesite autenticación real, se agrega aquí, nunca en el frontend.

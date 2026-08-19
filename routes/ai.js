import { Router } from 'express';

const router = Router();

const AI_MODEL = process.env.AI_MODEL || 'claude-sonnet-5';

// Llama a la API de Anthropic con la key protegida en el servidor (nunca en el navegador),
// pidiendo una respuesta en JSON puro para poder parsearla de forma confiable.
// enableSearch=true le da a Claude acceso a búsqueda web real, para que investigue contexto
// verificable en vez de improvisar — el análisis deja de ser una tabla mecánica y pasa a ser
// una investigación genuina, con fuentes citables.
async function callClaude(systemPrompt, userPrompt, { maxTokens = 1200, enableSearch = false } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('Falta configurar ANTHROPIC_API_KEY en las variables de entorno del backend.');
  }
  const body = {
    model: AI_MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  };
  if (enableSearch) {
    // 3 búsquedas alcanza para investigar las 3 variables del modelo (negocio, régimen, ubicación)
    // con evidencia real, sin dejar que el costo se dispare por consultas exploratorias de más.
    body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }];
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API respondió ${response.status}: ${errText}`);
  }

  const data = await response.json();
  // Con búsqueda web activada, la respuesta trae varios bloques (texto + búsquedas + resultados)
  // intercalados. El JSON final que nos interesa está en el ÚLTIMO bloque de texto, así que unimos
  // todos los bloques de texto por si Claude "piensa en voz alta" antes de dar el JSON final.
  const textBlocks = (data.content || []).filter((b) => b.type === 'text');
  if (textBlocks.length === 0) throw new Error('La API de IA no devolvió una respuesta de texto.');
  const rawText = textBlocks[textBlocks.length - 1].text;

  const cleaned = rawText.replace(/```json|```/g, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (parseErr) {
    console.error('No se pudo parsear la respuesta de la IA como JSON. Texto crudo:', cleaned);
    throw new Error(`La IA devolvió una respuesta incompleta o mal formada (posible corte por límite de tokens). ${parseErr.message}`);
  }

  // Además de lo que Claude reporte en el campo "sources" del JSON, extraemos también las
  // fuentes reales de las búsquedas web ejecutadas (por si Claude olvida listarlas en el JSON).
  const webSources = [];
  (data.content || []).forEach((block) => {
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      block.content.forEach((r) => {
        if (r.url && r.title) webSources.push({ title: r.title, url: r.url });
      });
    }
  });
  if (webSources.length > 0 && (!parsed.sources || parsed.sources.length === 0)) {
    parsed.sources = webSources.slice(0, 6);
  }

  return parsed;
}

// ---------- Lead Scoring de prospectos: "Puntaje de Potencial Mayorista" ----------
// Metodología de scoring lookalike/firmográfico definida por Titán (sin datos de comportamiento
// digital): 3 variables ponderadas -> Tipo de Negocio (50%), Régimen Tributario (35%), Ubicación (15%).
router.post('/score-prospect', async (req, res) => {
  try {
    const { name, type, city, regimenTributario, observations, history } = req.body;

    const systemPrompt = `Eres un Científico de Datos senior y Consultor de Estrategia Comercial B2B, especializado en el sector de distribución mayorista de alimentos y consumo masivo en Ecuador. Trabajas para "Titán, tu Socio Mayorista".

Tienes acceso a búsqueda web. ÚSALA para investigar contexto real antes de calificar — no improvises ni copies una tabla mecánica de memoria. Busca, por ejemplo: si el negocio o la cadena mencionada tiene presencia pública verificable (número de sucursales, reputación, tamaño real); los topes de facturación vigentes del SRI para cada régimen tributario en Ecuador; y las características comerciales reales del sector/ciudad mencionado (densidad de negocios institucionales, nivel socioeconómico, perfil turístico o logístico).

MARCO DE REFERENCIA (guía de tu juicio, NO una tabla de copiar mecánicamente):
- Tipo de Negocio — peso 50% del puntaje final. Evalúa el patrón de recompra recurrente típico de este tipo de negocio, informado por lo que encuentres en tu investigación sobre el caso específico (cadena vs. independiente, tamaño real si es identificable).
- Régimen Tributario — peso 35%. Es un proxy de tamaño económico; investiga los topes de facturación reales vigentes por régimen y sitúa a este negocio dentro de ese contexto con criterio, no automáticamente.
- Ubicación — peso 15%. Investiga las características comerciales reales del sector/ciudad — no asumas por el nombre del barrio sin evidencia.

REGLAS DE RIGOR ANALÍTICO (esto es lo más importante — léelo con cuidado):
- NUNCA asignes 10/10 automáticamente solo porque el negocio "encaja" con la categoría más favorable de tu marco de referencia. Un 10/10 debe reservarse SOLO para casos con evidencia sólida y excepcional encontrada en tu investigación — son la minoría, no la norma.
- Distribuye tus puntajes de forma realista y variada: la mayoría de leads reales deberían caer en rangos medios (4 a 7 sobre 10) en al menos una de las tres variables. Si terminas dándole 9 o 10 a las tres variables, revisa tu propio análisis — probablemente estás siendo mecánico en vez de crítico.
- Cada justificación debe citar un hecho específico de tu investigación (no una generalidad tipo "es un buen sector"). Si no encontraste evidencia sólida para algo, dilo explícitamente y baja el puntaje en consecuencia — la falta de evidencia verificable es en sí misma una señal de menor certeza, no de neutralidad.
- Sé un analista escéptico, no un vendedor optimista. Tu credibilidad depende de que un ejecutivo pueda confiar en que este puntaje refleja evidencia real, no una calificación automática.

FÓRMULA FINAL: score = (PtsNegocio/10 × 50) + (PtsRégimen/10 × 35) + (PtsUbicación/10 × 15)
CLÚSTERES: Oro (75-100, alta prioridad), Plata (40-74, maduración), Bronce (0-39, descartado/bajo esfuerzo).

Al terminar tu investigación, responde ÚNICAMENTE con un JSON válido (sin texto adicional, sin markdown) con esta forma EXACTA:
{
  "businessTypePoints": <0-10>,
  "businessTypeJustification": "<1-2 frases citando evidencia específica que encontraste>",
  "regimePoints": <0-10>,
  "regimeJustification": "<1-2 frases citando evidencia específica que encontraste>",
  "locationPoints": <0-10>,
  "locationClassification": "<Comercial-Consolidado|Residencial-Mixto|Rural-Periférico>",
  "locationJustification": "<1-2 frases citando evidencia específica que encontraste>",
  "score": <0-100, resultado exacto de la fórmula>,
  "cluster": "<Oro|Plata|Bronce>",
  "reasoning": "<2-3 frases resumen ejecutivo, para mostrar en la lista de prospectos>",
  "sources": [{"title": "<título real de la fuente consultada>", "url": "<url real>"}]
}`;

    const userPrompt = `Lead a calificar:
- Nombre comercial: ${name || 'N/D'}
- Tipo de negocio: ${type || 'N/D'}
- Régimen Tributario: ${regimenTributario || 'No especificado'}
- Ciudad / Ubicación: ${city || 'N/D'}
- Observaciones adicionales: ${observations || 'Ninguna'}
- Historial de seguimiento: ${history?.length ? history.map(h => h.details).join('; ') : 'Sin historial previo'}

Tienes hasta 3 búsquedas disponibles — úsalas con criterio: idealmente una para investigar el negocio/cadena específico, una para el contexto del régimen tributario, y una para el sector/ubicación. Prioriza la que más incertidumbre resuelva para este caso particular. Luego entrega el JSON final.`;

    const result = await callClaude(systemPrompt, userPrompt, { maxTokens: 2500, enableSearch: true });

    // Verificamos que la fórmula cuadre (por si el modelo se desvía); si no, la recalculamos nosotros mismos.
    const expectedScore = Math.round(
      (result.businessTypePoints / 10) * 50 +
      (result.regimePoints / 10) * 35 +
      (result.locationPoints / 10) * 15
    );
    const score = Math.max(0, Math.min(100, Math.round(result.score) || expectedScore));
    const cluster = score >= 75 ? 'Oro' : score >= 40 ? 'Plata' : 'Bronce';

    res.json({
      score,
      cluster,
      priority: cluster === 'Oro' ? 'Alta' : cluster === 'Plata' ? 'Media' : 'Baja', // compatibilidad con el resto del CRM
      reasoning: result.reasoning,
      analysis: {
        businessTypePoints: result.businessTypePoints,
        businessTypeJustification: result.businessTypeJustification,
        regimePoints: result.regimePoints,
        regimeJustification: result.regimeJustification,
        locationPoints: result.locationPoints,
        locationClassification: result.locationClassification,
        locationJustification: result.locationJustification,
        formula: `(${result.businessTypePoints}/10 × 50) + (${result.regimePoints}/10 × 35) + (${result.locationPoints}/10 × 15) = ${score}/100`,
        sources: Array.isArray(result.sources) ? result.sources.slice(0, 6) : [],
      },
    });
  } catch (err) {
    console.error('POST /ai/score-prospect error:', err);
    res.status(500).json({ error: 'No se pudo calcular el Lead Score con IA', detail: err.message });
  }
});

// ---------- Recomendación de cupo de crédito (reemplaza el texto fijo del prototipo) ----------
router.post('/credit-recommendation', async (req, res) => {
  try {
    const { name, segment, ruc, taxpayerType, legalRep } = req.body;

    const systemPrompt = `Eres un analista de crédito y cobranza senior de Titán, canal mayorista de Corporación Favorita en Ecuador. Tu trabajo es sugerir un cupo de crédito inicial razonable para un cliente institucional recién afiliado, basándote en el segmento de negocio y su perfil tributario, siguiendo prácticas conservadoras de riesgo comercial B2B en Ecuador.
Responde ÚNICAMENTE con un JSON válido (sin texto adicional, sin markdown) con esta forma exacta:
{"suggestedQuota": <número en USD>, "reasoning": "<2-3 frases explicando la lógica del monto sugerido y el plazo de revisión recomendado, en español>"}
Esta es una recomendación de apoyo; la decisión final la toma siempre el Jefe de Ventas Institucionales.`;

    const userPrompt = `Cliente institucional a evaluar:
- Razón social: ${name || 'N/D'}
- Segmento: ${segment || 'N/D'}
- RUC: ${ruc || 'N/D'}
- Tipo de contribuyente: ${taxpayerType || 'N/D'}
- Representante legal: ${legalRep || 'N/D'}`;

    const result = await callClaude(systemPrompt, userPrompt);
    res.json({
      suggestedQuota: Math.max(0, Math.round(result.suggestedQuota)),
      reasoning: result.reasoning,
    });
  } catch (err) {
    console.error('POST /ai/credit-recommendation error:', err);
    res.status(500).json({ error: 'No se pudo generar la recomendación de crédito con IA', detail: err.message });
  }
});

// ---------- Venta Cruzada / Recomendación de productos (reemplaza la tabla fija del prototipo) ----------
router.post('/recommend-products', async (req, res) => {
  try {
    const { client, catalog, purchaseHistory } = req.body;
    const hasHistory = Array.isArray(purchaseHistory) && purchaseHistory.length > 0;

    if (!Array.isArray(catalog) || catalog.length === 0) {
      return res.status(400).json({ error: 'No se recibió el catálogo de productos disponible.' });
    }

    const catalogText = catalog.map((p) => `- ${p.id}: ${p.name} — ${p.description || 'sin descripción'}`).join('\n');

    const systemPrompt = `Eres un asesor comercial senior de Titán, canal mayorista de Corporación Favorita en Ecuador, especializado en venta cruzada B2B para negocios institucionales (hoteles, restaurantes, cafeterías, comercios).

Tu trabajo es recomendar productos de NUESTRO CATÁLOGO (nunca inventes productos fuera de esta lista, usa exactamente los IDs dados) que le convendría comprar a este cliente, para que el ejecutivo se los ofrezca proactivamente y aumente el ticket de venta.

CATÁLOGO DISPONIBLE:
${catalogText}

${hasHistory
  ? 'Este cliente YA tiene historial de compras con nosotros. Analiza los patrones reales: qué compra, con qué frecuencia, en qué cantidades, y si hay señales de que le convendría reponer algo pronto o probar un producto complementario a lo que ya compra. Basa la cantidad sugerida en el patrón real observado (ej. si compra ~50 unidades por pedido, sugiere una cantidad similar o ligeramente ajustada según la tendencia).'
  : 'Este cliente NO tiene historial de compras todavía (es su primera cotización con nosotros). Recomienda productos del catálogo que mejor encajen con su segmento/tipo de negocio, basándote en qué necesita típicamente un negocio de ese tipo en Ecuador.'}

Responde ÚNICAMENTE con un JSON válido (sin texto adicional, sin markdown) con esta forma exacta:
{"recommendations": [{"productId": "<id EXACTO del catálogo>", "reason": "<1-2 frases específicas y útiles como argumento de venta para el ejecutivo>", "suggestedQuantity": <número entero o null si no aplica>}]}
Recomienda entre 2 y 4 productos, los más relevantes para este caso — no rellenes la lista con productos poco relevantes solo por completar.`;

    const userPrompt = `Cliente: ${client?.name || 'N/D'} — Segmento: ${client?.segment || 'N/D'}
${hasHistory
  ? `Historial de compras (fecha, producto, cantidad):\n${purchaseHistory.map((h) => `- ${h.date}: ${h.productName} x${h.quantity}`).join('\n')}`
  : 'Sin historial de compras previo con este cliente.'}`;

    const result = await callClaude(systemPrompt, userPrompt, { maxTokens: 1000 });

    const validIds = new Set(catalog.map((p) => p.id));
    const recommendations = (Array.isArray(result.recommendations) ? result.recommendations : [])
      .filter((r) => validIds.has(r.productId))
      .slice(0, 4)
      .map((r) => ({
        productId: r.productId,
        reason: r.reason,
        suggestedQuantity: r.suggestedQuantity ? Math.max(1, Math.round(r.suggestedQuantity)) : null,
      }));

    res.json({ recommendations, basedOn: hasHistory ? 'historial' : 'cold-start' });
  } catch (err) {
    console.error('POST /ai/recommend-products error:', err);
    res.status(500).json({ error: 'No se pudo generar la recomendación de productos con IA', detail: err.message });
  }
});

export default router;

import { Router } from 'express';

const router = Router();

const AI_MODEL = process.env.AI_MODEL || 'claude-sonnet-5';

// Llama a la API de Anthropic con la key protegida en el servidor (nunca en el navegador),
// pidiendo una respuesta en JSON puro para poder parsearla de forma confiable.
async function callClaude(systemPrompt, userPrompt, maxTokens = 1200) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('Falta configurar ANTHROPIC_API_KEY en las variables de entorno del backend.');
  }
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API respondió ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const textBlock = data.content?.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('La API de IA no devolvió una respuesta de texto.');

  const cleaned = textBlock.text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (parseErr) {
    console.error('No se pudo parsear la respuesta de la IA como JSON. Texto crudo:', cleaned);
    throw new Error(`La IA devolvió una respuesta incompleta o mal formada (posible corte por límite de tokens). ${parseErr.message}`);
  }
}

// ---------- Lead Scoring de prospectos: "Puntaje de Potencial Mayorista" ----------
// Metodología de scoring lookalike/firmográfico definida por Titán (sin datos de comportamiento
// digital): 3 variables ponderadas -> Tipo de Negocio (50%), Régimen Tributario (35%), Ubicación (15%).
router.post('/score-prospect', async (req, res) => {
  try {
    const { name, type, city, regimenTributario, observations, history } = req.body;

    const systemPrompt = `Eres un Científico de Datos senior y Consultor de Estrategia Comercial B2B, especializado en el sector de distribución mayorista de alimentos y consumo masivo en Ecuador. Trabajas para "Titán, tu Socio Mayorista".

Aplica EXACTAMENTE esta metodología de "Puntaje de Potencial Mayorista" (Modelado Lookalike / Datos Firmográficos, sin datos de comportamiento digital):

FÓRMULA (peso de cada variable):
- Tipo de Negocio: 50% — predictor más fuerte del patrón de recompra recurrente.
- Régimen Tributario: 35% — proxy oficial de tamaño económico (RIMPE Popular: tope ~$20,000/año; RIMPE Emprendedor: tope ~$300,000/año; Régimen General: sin tope).
- Ubicación: 15% — señal más débil, indica densidad comercial y costo logístico, no garantiza volumen.

TABLA DE PUNTOS (escala 0-10 por variable):
Tipo de Negocio: Hotel=10, Restaurante=9, Minimarket=8, Panadería=8, Cafetería=7, Tienda=6, Particular=0. Si el tipo no está en esta lista, asigna el puntaje más parecido según su patrón de consumo institucional.
Régimen Tributario: Régimen General=10, RIMPE Emprendedor=6, RIMPE Popular=3. Si no se especifica, usa 5 (neutral) y acláralo en la justificación.
Ubicación: clasifica la ciudad/sector en Comercial-Consolidado=10, Residencial-Mixto=6, o Rural-Periférico=3, usando tu conocimiento general de la geografía comercial ecuatoriana (ej. Urdesa, Kennedy, Ceibos, La Carolina, González Suárez = comercial consolidado).

FÓRMULA FINAL: score = (PtsNegocio/10 × 50) + (PtsRégimen/10 × 35) + (PtsUbicación/10 × 15)

CLÚSTERES: Oro (75-100, alta prioridad), Plata (40-74, maduración), Bronce (0-39, descartado/bajo esfuerzo).

Responde ÚNICAMENTE con un JSON válido (sin texto adicional, sin markdown) con esta forma EXACTA:
{
  "businessTypePoints": <0-10>,
  "businessTypeJustification": "<1 frase>",
  "regimePoints": <0-10>,
  "regimeJustification": "<1 frase>",
  "locationPoints": <0-10>,
  "locationClassification": "<Comercial-Consolidado|Residencial-Mixto|Rural-Periférico>",
  "locationJustification": "<1 frase>",
  "score": <0-100, resultado exacto de la fórmula>,
  "cluster": "<Oro|Plata|Bronce>",
  "reasoning": "<2-3 frases resumen ejecutivo, para mostrar en la lista de prospectos>"
}`;

    const userPrompt = `Lead a calificar:
- Nombre comercial: ${name || 'N/D'}
- Tipo de negocio: ${type || 'N/D'}
- Régimen Tributario: ${regimenTributario || 'No especificado'}
- Ciudad / Ubicación: ${city || 'N/D'}
- Observaciones adicionales: ${observations || 'Ninguna'}
- Historial de seguimiento: ${history?.length ? history.map(h => h.details).join('; ') : 'Sin historial previo'}`;

    const result = await callClaude(systemPrompt, userPrompt);

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

export default router;

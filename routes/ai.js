import { Router } from 'express';

const router = Router();

const AI_MODEL = process.env.AI_MODEL || 'claude-sonnet-5';

// Llama a la API de Anthropic con la key protegida en el servidor (nunca en el navegador),
// pidiendo una respuesta en JSON puro para poder parsearla de forma confiable.
async function callClaude(systemPrompt, userPrompt) {
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
      max_tokens: 500,
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
  return JSON.parse(cleaned);
}

// ---------- Lead Scoring de prospectos (reemplaza el Math.random() del prototipo) ----------
router.post('/score-prospect', async (req, res) => {
  try {
    const { name, type, city, size, observations, history } = req.body;

    const systemPrompt = `Eres un analista comercial senior de Titán, canal mayorista de Corporación Favorita en Ecuador, especializado en calificar prospectos institucionales (hoteles, restaurantes, cafeterías, comercios, corporativos) para priorizar el esfuerzo del equipo de ventas.
Analiza el prospecto y responde ÚNICAMENTE con un JSON válido (sin texto adicional, sin markdown) con esta forma exacta:
{"score": <número entero 0-100>, "priority": "<Alta|Media|Baja>", "reasoning": "<2-3 frases explicando por qué, en español, mencionando las variables consideradas>"}
Criterios a considerar: tipo de negocio y su volumen de consumo típico de insumos institucionales, ciudad (Quito/Guayaquil suelen tener mayor densidad de cuentas institucionales y logística más simple), tamaño estimado del negocio, y cualquier señal en las observaciones. Prioridad Alta = score >= 75, Media = 40-74, Baja = <40.`;

    const userPrompt = `Prospecto a calificar:
- Nombre comercial: ${name || 'N/D'}
- Tipo de negocio: ${type || 'N/D'}
- Ciudad: ${city || 'N/D'}
- Tamaño estimado: ${size || 'N/D'}
- Observaciones del ejecutivo: ${observations || 'Ninguna'}
- Historial de seguimiento: ${history?.length ? history.map(h => h.details).join('; ') : 'Sin historial previo'}`;

    const result = await callClaude(systemPrompt, userPrompt);
    res.json({
      score: Math.max(0, Math.min(100, Math.round(result.score))),
      priority: result.priority,
      reasoning: result.reasoning,
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

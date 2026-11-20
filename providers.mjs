import { AppError, SYSTEM } from './core.mjs';

export function providerConfig(env = process.env) {
  return {
    gemini: {key:env.GEMINI_API_KEY, model:env.GEMINI_MODEL},
    grok: {key:env.XAI_API_KEY, model:env.XAI_MODEL},
    openai: {key:env.OPENAI_API_KEY, model:env.OPENAI_MODEL}
  };
}
export function buildRequest(provider, config, messages) {
  const { key, model } = config;
  if (!key || !model) throw new AppError('Add this provider’s key and model to .env, then restart Jarvis.',409);
  if (!/^[a-zA-Z0-9._:/-]{1,160}$/.test(model)) throw new AppError('Invalid model ID in .env.',409);
  if (provider === 'gemini') return {
    url:`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    headers:{'Content-Type':'application/json','x-goog-api-key':key},
    body:{systemInstruction:{parts:[{text:SYSTEM}]},contents:messages.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]})),generationConfig:{maxOutputTokens:1500}}
  };
  if (!['openai','grok'].includes(provider)) throw new AppError('Unknown provider.');
  return {
    url:provider === 'openai' ? 'https://api.openai.com/v1/responses' : 'https://api.x.ai/v1/responses',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},
    body:{model,input:[{role:'system',content:SYSTEM},...messages],max_output_tokens:1500,store:false}
  };
}
export function extractText(provider, data) {
  const text = provider === 'gemini'
    ? (data.candidates?.[0]?.content?.parts || []).filter(p=>!p.thought).map(p=>p.text||'').join('')
    : (data.output || []).filter(o=>o.type==='message').flatMap(o=>o.content||[]).map(c=>c.text||c.refusal||'').join('\n');
  if (!text.trim()) throw new AppError('The provider returned no answer. Check model access or try a shorter message.',502);
  return text;
}
export async function checkedFetch(url, options, signal) {
  let response;
  try { response = await fetch(url,{...options,redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(60000)])}); }
  catch { throw new AppError(signal.aborted ? 'Request stopped.' : 'Provider connection failed or timed out. Check your network.',502); }
  if (!response.ok) {
    const status = response.status;
    await response.body?.cancel();
    const hint = {401:'Check your API key.',402:'Check provider credits.',403:'Check account and model access.',404:'Check the model ID.',429:'Rate limit reached; wait before trying again.'}[status] || 'Check provider status and model configuration.';
    throw new AppError(`Provider returned ${status}. ${hint}`,502);
  }
  return response;
}
export async function chat(provider, messages, signal) {
  const request = buildRequest(provider,providerConfig()[provider] || {},messages);
  const response = await checkedFetch(request.url,{method:'POST',headers:request.headers,body:JSON.stringify(request.body)},signal);
  return extractText(provider,await response.json());
}

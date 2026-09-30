import express from 'express';
import cors from 'cors';
import { chromium } from 'playwright';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import path from 'node:path';

const app = express();
app.use(cors());
app.use(express.json({ limit: '12mb' }));
const port = Number(process.env.PORT || 8787);
type Analysis = { url: string; title: string; description: string; text: string; headings: string[]; links: { label: string; href: string }[]; images: { src: string; alt: string }[]; colors: string[]; fonts: string[]; screenshot: string; sections: { heading: string; text: string }[] };

async function launchBrowser() {
  if (process.platform === 'win32') {
    try { return await chromium.launch({ channel: 'msedge', headless: true }); }
    catch (edgeError) {
      try { return await chromium.launch({ headless: true }); }
      catch (chromiumError) {
        const detail = chromiumError instanceof Error ? chromiumError.message : String(edgeError);
        throw new Error(`Sitecraft could not start Microsoft Edge or Playwright Chromium. Make sure Edge is installed, or run "npx playwright install chromium" in a normal PowerShell window. Details: ${detail}`);
      }
    }
  }
  try { return await chromium.launch({ headless: true }); }
  catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Sitecraft could not start Playwright Chromium. Run "npx playwright install chromium" and restart the server. Details: ${detail}`);
  }
}

function forbiddenIp(ip: string) {
  if (ip === '::1' || ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) return true;
  const p = ip.split('.').map(Number);
  return p.length === 4 && (p[0] === 10 || p[0] === 127 || p[0] === 0 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168 || p[0] === 100 && p[1] >= 64 && p[1] <= 127));
}
async function assertPublicUrl(value: string) {
  let u: URL;
  try { u = new URL(value); } catch { throw new Error('Enter a valid website URL, such as https://example.com'); }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error('Only public HTTP or HTTPS website URLs are supported.');
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) throw new Error('Local and private network addresses are not supported.');
  if (isIP(host)) { if (forbiddenIp(host)) throw new Error('Local and private network addresses are not supported.'); }
  else {
    const records = await lookup(host, { all: true }).catch(() => []);
    if (!records.length || records.some(r => forbiddenIp(r.address))) throw new Error('The URL must resolve to a publicly reachable website.');
  }
  return u;
}

const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const geminiModel = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const geminiFallbackModel = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite';
app.get('/api/health', (_req, res) => res.json({ ok: true, aiConfigured: Boolean(geminiApiKey), model: geminiModel }));
app.post('/api/analyze', async (req, res) => {
  let browser;
  try {
    const u = await assertPublicUrl(String(req.body?.url || ''));
    browser = await launchBrowser();
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1, ignoreHTTPSErrors: false });
    await context.route('**/*', async route => {
      try { await assertPublicUrl(route.request().url()); await route.continue(); }
      catch { await route.abort(); }
    });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(35000);
    const response = await page.goto(u.href, { waitUntil: 'domcontentloaded' });
    if (!response || response.status() >= 400) throw new Error(`The website returned ${response?.status() || 'no response'}. Check the URL and try again.`);
    await page.waitForTimeout(1200);
    const extracted = await page.evaluate(() => {
      const clean = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').trim();
      const visible = (el: Element) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden'; };
      const main = (document.querySelector('main') || document.body) as HTMLElement;
      const text = clean(main.innerText).slice(0, 14000);
      const headings = [...main.querySelectorAll('h1,h2,h3')].filter(visible).map(x => clean(x.textContent)).filter(Boolean).slice(0, 32);
      const sections = [...main.querySelectorAll('section,header,footer,article')].filter(visible).map(el => ({ heading: clean(el.querySelector('h1,h2,h3')?.textContent) || 'Section', text: clean((el as HTMLElement).innerText).slice(0, 480) })).filter(x => x.text).slice(0, 18);
      const links = [...document.querySelectorAll('header a, nav a, main a')].filter(visible).map(a => ({ label: clean(a.textContent), href: (a as HTMLAnchorElement).href })).filter(x => x.label).slice(0, 30);
      const images = [...main.querySelectorAll('img')].filter(visible).map(i => ({ src: (i as HTMLImageElement).currentSrc || (i as HTMLImageElement).src, alt: clean(i.getAttribute('alt')) })).filter(x => x.src.startsWith('http')).slice(0, 24);
      const colors = [...document.querySelectorAll('body,header,main,section,button,h1')].filter(visible).map(e => getComputedStyle(e).backgroundColor).filter(c => c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent');
      const fonts = [...document.querySelectorAll('body,h1,h2,button')].filter(visible).map(e => getComputedStyle(e).fontFamily.split(',')[0].replace(/["']/g, '').trim());
      return { title: document.title, description: document.querySelector('meta[name="description"]')?.getAttribute('content') || '', text, headings, sections, links, images, colors: [...new Set(colors)].slice(0, 10), fonts: [...new Set(fonts)].slice(0, 6) };
    });
    const shot = await page.screenshot({ type: 'jpeg', quality: 62, fullPage: false, timeout: 10000 }).catch(() => null);
    const result: Analysis = { url: u.href, ...extracted, screenshot: shot ? `data:image/jpeg;base64,${shot.toString('base64')}` : '' };
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Website analysis failed.';
    res.status(message.startsWith('Sitecraft could not start') ? 503 : 400).json({ error: message });
  }
  finally { await browser?.close().catch(() => {}); }
});

const systemPrompt = `You are Sitecraft, an expert frontend engineer. Produce a self-contained HTML document for a responsive website recreation using only HTML, CSS, and small vanilla JS. Return ONLY the HTML, no markdown. Build a new implementation; never embed the original site in an iframe. Respect supplied content, imagery and brand characteristics. Use supplied image URLs where useful. Make links/buttons meaningful and include responsive styles. Keep output under 12,000 characters. Never include scripts that access parent, top, cookies, storage, network APIs, or external resources other than image/font URLs.`;
async function askModel(prompt: string) {
  const key = geminiApiKey;
  if (!key) return null;
  const request = (model: string) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.35, maxOutputTokens: 8192 },
    }),
  });
  const requestWithRetry = async (model: string) => {
    let response = await request(model);
    if (response.status === 503) {
      await new Promise(resolve => setTimeout(resolve, 1200));
      response = await request(model);
    }
    return response;
  };
  let activeModel = geminiModel;
  let response = await requestWithRetry(activeModel);
  if (response.status === 503 && geminiFallbackModel !== geminiModel) {
    activeModel = geminiFallbackModel;
    response = await requestWithRetry(activeModel);
  }
  if (!response.ok) {
    const errorData = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    const detail = errorData?.error?.message?.replace(/\s+/g, ' ').slice(0, 280);
    if (response.status === 401) throw new Error(`Gemini rejected the API key. Check GEMINI_API_KEY in .env.${detail ? ` ${detail}` : ''}`);
    if (response.status === 403) throw new Error(`This Gemini API key does not have access to the Gemini API.${detail ? ` ${detail}` : ''}`);
    if (response.status === 404) throw new Error(`The Gemini model "${activeModel}" was not found. Check GEMINI_MODEL or GEMINI_FALLBACK_MODEL.${detail ? ` ${detail}` : ''}`);
    if (response.status === 429) throw new Error(`Gemini rate limit or quota reached. Check your Google AI Studio quota.${detail ? ` ${detail}` : ''}`);
    if (response.status === 503) throw new Error(`Gemini is temporarily unavailable on ${geminiModel} and ${geminiFallbackModel}. Wait a minute and try again.${detail ? ` Provider: ${detail}` : ''}`);
    throw new Error(`Gemini request failed (${response.status}).${detail ? ` Provider: ${detail}` : ' Check the key, model, and network connection.'}`);
  }
  const data: any = await response.json();
  const output = (data.candidates?.[0]?.content?.parts || []).map((part: { text?: string }) => part.text || '').join('').replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/, '').trim();
  if (!output) throw new Error('Gemini returned an empty response. Try the request again.');
  if (!output.toLowerCase().startsWith('<!doctype') && !output.toLowerCase().startsWith('<html')) throw new Error('The AI response did not contain a valid HTML page. Try again.');
  return output;
}
function fallback(analysis: Analysis) {
  const e = (s: string) => s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!));
  const image = analysis.images[0]?.src;
  const headline = analysis.headings[0] || analysis.title || 'A better digital experience';
  const lead = analysis.sections.find(s => s.text.length > headline.length)?.text || analysis.description || analysis.text.slice(0, 260);
  const nav = analysis.links.slice(0, 5).map(l => `<a href="${e(l.href)}">${e(l.label)}</a>`).join('');
  const cards = (analysis.sections.length ? analysis.sections : analysis.headings.slice(1).map(heading => ({ heading, text: analysis.text.slice(0, 180) }))).slice(0, 6).map((s, i) => `<article class="card"><span class="num">0${i + 1}</span><h2>${e(s.heading)}</h2><p>${e(s.text.slice(0, 210))}</p></article>`).join('');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(analysis.title)}</title><style>*{box-sizing:border-box}body{margin:0;color:#17231e;background:#fafaf7;font:16px/1.6 Inter,Arial,sans-serif}header{height:76px;padding:0 7vw;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e8e9e3}.brand{font-weight:800;font-size:20px}nav{display:flex;gap:26px}a{color:inherit;text-decoration:none;font-size:14px}.hero{min-height:560px;padding:90px 9vw;display:grid;grid-template-columns:1.05fr .95fr;align-items:center;gap:56px}.eyebrow,.num{color:#71836f;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}h1{font-size:clamp(42px,6vw,76px);line-height:1.04;letter-spacing:-.06em;max-width:680px;margin:16px 0}p{color:#626d65}.hero p{font-size:18px;max-width:500px}.cta{display:inline-block;margin-top:18px;padding:14px 21px;background:#273d32;color:white;border-radius:4px;font-size:14px}.photo{height:410px;width:100%;object-fit:cover;border-radius:4px;background:#e8ebe5}.section{padding:76px 9vw;background:#f0f1ec}.section>h2{font-size:38px;letter-spacing:-.04em}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.card{padding:28px;background:#fafaf7;min-height:210px}.card h2{font-size:21px}.card p{font-size:14px}footer{padding:36px 9vw;color:#6a746c}@media(max-width:700px){header{padding:0 6vw}nav{gap:12px}nav a:nth-child(n+4){display:none}.hero{grid-template-columns:1fr;padding:56px 7vw;gap:30px}.photo{height:280px}.grid{grid-template-columns:1fr}.section{padding:56px 7vw}h1{font-size:48px}}</style></head><body><header><div class="brand">${e(new URL(analysis.url).hostname.replace(/^www\./,''))}</div><nav>${nav}</nav></header><main><section class="hero"><div><div class="eyebrow">${e(new URL(analysis.url).hostname)}</div><h1>${e(headline)}</h1><p>${e(lead.slice(0,340))}</p><a class="cta" href="#explore">Explore more&nbsp; →</a></div>${image ? `<img class="photo" src="${e(image)}" alt="${e(analysis.images[0]?.alt || 'Featured image')}">` : `<div class="photo"></div>`}</section><section class="section" id="explore"><div class="eyebrow">Discover</div><h2>Made for what’s next.</h2><div class="grid">${cards || `<article class="card"><h2>${e(analysis.title)}</h2><p>${e(analysis.description || analysis.text.slice(0,200))}</p></article>`}</div></section></main><footer>Inspired by ${e(new URL(analysis.url).hostname)} · Recreated with Sitecraft</footer></body></html>`;
}
app.post('/api/generate', async (req, res) => {
  try {
    const analysis = req.body?.analysis as Analysis;
    if (!analysis?.url || !Array.isArray(analysis.headings)) return res.status(400).json({ error: 'Analyze a website before generating its frontend.' });
    const prompt = `Recreate this public website as a distinct, responsive frontend. Analyze the screenshot reference and structured inspection. Prioritize matching visual hierarchy, layout, brand color, navigation and text. Source URL: ${analysis.url}\nTitle: ${analysis.title}\nDescription: ${analysis.description}\nHeadings: ${JSON.stringify(analysis.headings)}\nSections and visible text: ${JSON.stringify(analysis.sections)}\nLinks: ${JSON.stringify(analysis.links)}\nImages (use original public image URLs directly in img tags): ${JSON.stringify(analysis.images)}\nObserved colors: ${JSON.stringify(analysis.colors)}\nFonts: ${JSON.stringify(analysis.fonts)}\nBody copy: ${analysis.text.slice(0,8000)}\nReturn a single complete responsive HTML document. Avoid generic template copy; use the actual visible content.`;
    const html = await askModel(prompt) || fallback(analysis);
    res.json({ html, mode: geminiApiKey ? 'ai' : 'fallback' });
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : 'Generation failed.' }); }
});
app.post('/api/modify', async (req, res) => {
  try {
    const { html, instruction } = req.body || {};
    if (typeof html !== 'string' || !html.startsWith('<!doctype')) return res.status(400).json({ error: 'Generate a frontend before editing it.' });
    if (typeof instruction !== 'string' || instruction.trim().length < 3 || instruction.length > 500) return res.status(400).json({ error: 'Enter an edit instruction between 3 and 500 characters.' });
    if (!geminiApiKey) return res.status(503).json({ error: 'Natural-language edits need a Gemini API key. Add GEMINI_API_KEY to .env and restart the server.' });
    const output = await askModel(`Modify the existing frontend according to the user's instruction. Preserve all unrelated layout and styles. User instruction: ${instruction.trim()}\n\nCurrent HTML:\n${html.slice(0,14000)}`);
    res.json({ html: output });
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : 'Modification failed.' }); }
});
app.use(express.static(path.resolve('dist')));
app.get('*', (_req, res) => res.sendFile(path.resolve('dist/index.html')));
app.listen(port, () => console.log(`Sitecraft API listening on http://localhost:${port}`));

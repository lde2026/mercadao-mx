/**
 * POST /api/admin/bulk-import
 * Importa múltiplos anúncios a partir de URLs do OLX (ou outras plataformas).
 * Para cada URL:
 *   1. Tenta scraping real da página OLX
 *   2. Se falhar, usa Claude AI para inferir os dados pelo URL
 *   3. Salva no Supabase como anúncio do usuário mercadao-mx
 */

import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { scrapeOLXListing } from '@/lib/olxScraper';

const ANTHROPIC_KEY = process.env['ANTHROPIC_API_KEY'] ?? '';
const SUPABASE_URL = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '';
const SUPABASE_KEY = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? '';
const USE_SUPABASE = SUPABASE_URL.startsWith('https://') && SUPABASE_KEY.length > 20;

const MERCADAO_USER_ID = 'mercadao-mx'; // user id on Supabase

// Map state abbreviation → full name (for display)
const STATE_MAP: Record<string, string> = {
  AC: 'AC', AL: 'AL', AP: 'AP', AM: 'AM', BA: 'BA', CE: 'CE',
  DF: 'DF', ES: 'ES', GO: 'GO', MA: 'MA', MT: 'MT', MS: 'MS',
  MG: 'MG', PA: 'PA', PB: 'PB', PR: 'PR', PE: 'PE', PI: 'PI',
  RJ: 'RJ', RN: 'RN', RS: 'RS', RO: 'RO', RR: 'RR', SC: 'SC',
  SP: 'SP', SE: 'SE', TO: 'TO',
};

function detectPlatform(url: string): 'olx' | 'facebook' | 'icarros' | 'other' {
  if (url.includes('olx.com.br')) return 'olx';
  if (url.includes('facebook.com') || url.includes('fb.com')) return 'facebook';
  if (url.includes('icarros.com')) return 'icarros';
  return 'other';
}

// ── Claude fallback: infer listing data from URL alone ────────────────────────

const AI_SYSTEM = `Você é um especialista em anúncios de motos off-road brasileiras.
Com base somente no URL fornecido, infira os dados do anúncio e retorne APENAS JSON válido no formato:
{
  "title": "Marca Modelo Ano — Descrição curta",
  "brand": "KTM|Honda|Yamaha|Kawasaki|Suzuki|Husqvarna|GasGas|Beta|Sherco|MXF|Pro Tork|Outra",
  "model": "modelo ex: CRF 250R",
  "year": 2022,
  "displacement": "50cc|65cc|85cc|125cc|150cc|200cc|230cc|250cc|350cc|450cc|500cc",
  "engineType": "two_stroke|four_stroke",
  "category": "motocross|enduro|trilha|infantil|competicao|lazer",
  "productType": "moto|peca|equipamento",
  "price": 28500,
  "city": "Curitiba",
  "state": "PR",
  "description": "3-4 frases detalhadas sobre o produto baseadas no URL.",
  "condition": "Novo|Seminovo|Bom estado|Precisa revisão",
  "documentation": "Com documento|Apenas nota fiscal|Sem documento",
  "acceptsTrade": false,
  "acceptsProposals": true
}`;

async function inferFromUrl(url: string): Promise<Record<string, unknown> | null> {
  if (!ANTHROPIC_KEY) return null;
  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_KEY });
    const resp = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 800,
      system: AI_SYSTEM,
      messages: [{ role: 'user', content: `URL: ${url}` }],
    });
    const text = resp.content[0].type === 'text' ? resp.content[0].text : '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ── Build MotoListing from scraped + inferred data ────────────────────────────

function buildListing(
  scraped: Awaited<ReturnType<typeof scrapeOLXListing>>,
  inferred: Record<string, unknown> | null,
  url: string,
  platform: ReturnType<typeof detectPlatform>
) {
  const now = new Date().toISOString();
  const id = `import-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const title = scraped?.title || String(inferred?.['title'] ?? 'Anúncio importado');
  const price = scraped?.price || Number(inferred?.['price'] ?? 0);
  const description = scraped?.description || String(inferred?.['description'] ?? '');
  const city = scraped?.city || String(inferred?.['city'] ?? '');
  const stateRaw = scraped?.state || String(inferred?.['state'] ?? '');
  const state = STATE_MAP[stateRaw.toUpperCase()] ?? stateRaw;
  const photos = (scraped?.photos?.length ?? 0) > 0
    ? scraped!.photos
    : [`https://picsum.photos/seed/${id}/800/600`];

  return {
    id,
    user_id: MERCADAO_USER_ID,
    product_type: String(inferred?.['productType'] ?? 'moto'),
    title,
    description,
    brand: String(inferred?.['brand'] ?? 'Outra'),
    model: String(inferred?.['model'] ?? ''),
    year: Number(inferred?.['year'] ?? new Date().getFullYear()),
    displacement: String(inferred?.['displacement'] ?? '250cc'),
    engine_type: String(inferred?.['engineType'] ?? 'four_stroke'),
    category: String(inferred?.['category'] ?? 'trilha'),
    price,
    accepts_trade: Boolean(inferred?.['acceptsTrade'] ?? false),
    accepts_proposals: Boolean(inferred?.['acceptsProposals'] ?? true),
    city,
    state,
    documentation: String(inferred?.['documentation'] ?? 'Sem documento'),
    condition: String(inferred?.['condition'] ?? 'Seminovo'),
    status: 'active',
    photos,
    main_photo: photos[0],
    views: 0,
    featured: false,
    source: 'imported',
    source_url: url,
    source_platform: platform,
    created_at: now,
    updated_at: now,
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { urls: string[] };
    const urls: string[] = Array.isArray(body.urls) ? body.urls.slice(0, 50) : [];

    if (urls.length === 0) {
      return NextResponse.json({ error: 'Nenhuma URL fornecida' }, { status: 400 });
    }

    const results: { url: string; status: 'ok' | 'error'; title?: string; error?: string }[] = [];

    // Process each URL sequentially (to avoid rate limits)
    for (const url of urls) {
      try {
        const platform = detectPlatform(url);

        // Step 1: Try real scraping
        const scraped = await scrapeOLXListing(url);

        // Step 2: Always run AI inference for structured fields (brand, category, etc.)
        const inferred = await inferFromUrl(url);

        const listing = buildListing(scraped, inferred, url, platform);

        // Step 3: Save to Supabase (if configured) or just return
        if (USE_SUPABASE) {
          const cookieStore = await cookies();
          const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
            cookies: {
              getAll: () => cookieStore.getAll(),
              setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
            },
          });
          const { error } = await supabase.from('listings').insert(listing);
          if (error) throw new Error(error.message);
        }

        results.push({ url, status: 'ok', title: listing.title });

        // Small delay to avoid hammering OLX
        await new Promise((r) => setTimeout(r, 800));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro desconhecido';
        results.push({ url, status: 'error', error: msg });
      }
    }

    const ok = results.filter((r) => r.status === 'ok').length;
    const errors = results.filter((r) => r.status === 'error').length;

    return NextResponse.json({ imported: ok, errors, results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

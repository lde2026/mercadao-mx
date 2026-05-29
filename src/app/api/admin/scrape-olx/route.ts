/**
 * POST /api/admin/scrape-olx
 * Busca no OLX por termos de motocross e retorna lista de URLs encontrados.
 */

import { NextRequest, NextResponse } from 'next/server';
import { scrapeOLXSearch, OLX_SEARCH_URLS } from '@/lib/olxScraper';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { searchUrls?: string[] };
    const searchUrls = body.searchUrls ?? OLX_SEARCH_URLS;

    const allResults: { url: string; title: string; price: number; thumb: string; city: string }[] = [];
    const seen = new Set<string>();

    for (const searchUrl of searchUrls.slice(0, 8)) {
      const results = await scrapeOLXSearch(searchUrl);
      for (const r of results) {
        if (!seen.has(r.url)) {
          seen.add(r.url);
          allResults.push(r);
        }
      }
      // Rate limit: 1 request/sec
      await new Promise((res) => setTimeout(res, 1000));
    }

    return NextResponse.json({
      found: allResults.length,
      listings: allResults,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

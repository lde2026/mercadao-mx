/**
 * OLX Scraper — extrai dados de anúncios e resultados de busca do OLX
 * usando fetch nativo com headers de browser + parsing do __NEXT_DATA__
 */

export interface OLXListing {
  title: string;
  price: number;
  description: string;
  city: string;
  state: string;
  photos: string[];
  sourceUrl: string;
  brand?: string;
  condition?: string;
}

const BROWSER_HEADERS: HeadersInit = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractNextData(html: string): Record<string, unknown> | null {
  const m = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getIn(obj: unknown, ...keys: string[]): unknown {
  let cur: unknown = obj;
  for (const k of keys) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

function parsePrice(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const n = parseFloat(raw.replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

// ── Parse listing page ────────────────────────────────────────────────────────

export async function scrapeOLXListing(url: string): Promise<OLXListing | null> {
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: 'follow' });
    if (!res.ok) return null;
    const html = await res.text();

    const nextData = extractNextData(html);
    if (!nextData) return null;

    // OLX embeds ad data in different paths depending on version
    const pageProps = getIn(nextData, 'props', 'pageProps') as Record<string, unknown> | undefined;
    if (!pageProps) return null;

    // Try different data paths OLX uses
    const ad =
      (pageProps['ad'] as Record<string, unknown> | undefined) ??
      (getIn(pageProps, 'adData', 'ad') as Record<string, unknown> | undefined) ??
      null;

    if (!ad) return null;

    // Title
    const title = String(ad['subject'] ?? ad['title'] ?? '').trim();
    if (!title) return null;

    // Price
    const priceRaw =
      getIn(ad, 'price', 'value', 'raw') ??
      getIn(ad, 'priceValue') ??
      getIn(ad, 'price');
    const price = parsePrice(priceRaw);

    // Description
    const description = String(ad['body'] ?? ad['description'] ?? '').trim();

    // Location
    const locationObj = (ad['location'] ?? ad['address']) as Record<string, unknown> | undefined;
    const city = String(
      getIn(locationObj, 'municipality') ?? getIn(locationObj, 'city') ?? ''
    ).trim();
    const state = String(
      getIn(locationObj, 'uf') ?? getIn(locationObj, 'state') ?? ''
    ).trim();

    // Photos
    const imagesRaw = (ad['images'] ?? ad['photos'] ?? []) as unknown[];
    const photos: string[] = [];
    for (const img of imagesRaw) {
      const imgObj = img as Record<string, unknown>;
      const photoUrl =
        String(imgObj['original'] ?? imgObj['large'] ?? imgObj['medium'] ?? imgObj['url'] ?? '');
      if (photoUrl.startsWith('http')) photos.push(photoUrl);
    }

    return { title, price, description, city, state, photos, sourceUrl: url };
  } catch {
    return null;
  }
}

// ── Parse search results page ─────────────────────────────────────────────────

export interface OLXSearchResult {
  url: string;
  title: string;
  price: number;
  thumb: string;
  city: string;
}

export async function scrapeOLXSearch(
  searchUrl: string
): Promise<OLXSearchResult[]> {
  try {
    const res = await fetch(searchUrl, { headers: BROWSER_HEADERS, redirect: 'follow' });
    if (!res.ok) return [];
    const html = await res.text();

    const nextData = extractNextData(html);
    if (!nextData) return [];

    const pageProps = getIn(nextData, 'props', 'pageProps') as Record<string, unknown> | undefined;
    if (!pageProps) return [];

    // OLX puts listings in different keys
    const rawList =
      (pageProps['listings'] as unknown[]) ??
      (pageProps['adList'] as unknown[]) ??
      (getIn(pageProps, 'data', 'adList') as unknown[]) ??
      [];

    const results: OLXSearchResult[] = [];

    for (const item of rawList) {
      const it = item as Record<string, unknown>;
      // Some OLX versions nest under 'ad'
      const ad = (it['ad'] ?? it) as Record<string, unknown>;

      const url = String(
        getIn(ad, 'url') ??
        getIn(ad, 'linkData', 'url') ??
        getIn(it, 'url') ?? ''
      );
      if (!url.startsWith('http')) continue;

      const title = String(ad['subject'] ?? ad['title'] ?? '').trim();
      const price = parsePrice(
        getIn(ad, 'price', 'value', 'raw') ?? getIn(ad, 'priceValue') ?? 0
      );

      const thumbRaw = (ad['images'] ?? ad['photos'] ?? []) as unknown[];
      const firstImg = thumbRaw[0] as Record<string, unknown> | undefined;
      const thumb = String(
        getIn(firstImg, 'thumbnail') ??
        getIn(firstImg, 'small') ??
        getIn(firstImg, 'medium') ?? ''
      );

      const locationObj = (ad['location'] ?? {}) as Record<string, unknown>;
      const city = String(getIn(locationObj, 'municipality') ?? '').trim();

      results.push({ url, title, price, thumb, city });
    }

    return results;
  } catch {
    return [];
  }
}

// ── Predefined OLX search URLs for motocross content ─────────────────────────

export const OLX_SEARCH_URLS = [
  // Motos
  'https://www.olx.com.br/brasil/autos-e-pecas/motos?q=motocross',
  'https://www.olx.com.br/brasil/autos-e-pecas/motos?q=enduro',
  'https://www.olx.com.br/brasil/autos-e-pecas/motos?q=trilha+off+road',
  'https://www.olx.com.br/brasil/autos-e-pecas/motos?q=ktm+moto',
  'https://www.olx.com.br/brasil/autos-e-pecas/motos?q=husqvarna',
  'https://www.olx.com.br/brasil/autos-e-pecas/motos?q=gas+gas+moto',
  'https://www.olx.com.br/brasil/autos-e-pecas/motos?q=crf+250',
  'https://www.olx.com.br/brasil/autos-e-pecas/motos?q=yz+250',
  // Equipamentos
  'https://www.olx.com.br/brasil?q=capacete+motocross',
  'https://www.olx.com.br/brasil?q=bota+motocross',
  'https://www.olx.com.br/brasil?q=oculos+motocross',
  'https://www.olx.com.br/brasil?q=joelheira+motocross',
  'https://www.olx.com.br/brasil?q=roupa+motocross+conjunto',
  // Peças
  'https://www.olx.com.br/brasil/autos-e-pecas/pecas-e-acessorios?q=escape+motocross',
  'https://www.olx.com.br/brasil/autos-e-pecas/pecas-e-acessorios?q=pistao+ktm',
];

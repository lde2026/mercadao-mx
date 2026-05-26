import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

function getApiKey(): string {
  const fromEnv = process.env['ANTHROPIC_API_KEY'];
  if (fromEnv) return fromEnv;
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8');
    const match = raw.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    if (match?.[1]) return match[1].trim();
  } catch { /* ignore */ }
  return '';
}

const SYSTEM_PROMPT = `Você é um extrator de dados especializado em anúncios de motos off-road brasileiros.
Dado um URL de anúncio de OLX, Facebook Marketplace ou outra plataforma, você deve:
1. Analisar o URL e inferir os dados prováveis do anúncio
2. Retornar os dados estruturados no formato JSON exato abaixo

IMPORTANTE: Retorne SOMENTE o JSON, sem texto antes ou depois.

Formato de resposta:
{
  "title": "Marca Modelo Ano — Descrição curta",
  "brand": "Honda|Yamaha|Kawasaki|Suzuki|KTM|Husqvarna|GasGas|Beta|Sherco|TM Racing|MXF|Pro Tork|Outra",
  "model": "modelo exato ex: CRF 250R",
  "year": 2022,
  "displacement": "50cc|65cc|85cc|125cc|150cc|200cc|230cc|250cc|350cc|450cc|500cc",
  "engineType": "two_stroke|four_stroke",
  "category": "motocross|enduro|trilha|infantil|competicao|lazer",
  "price": 28500,
  "city": "São Paulo",
  "state": "SP",
  "description": "Descrição detalhada de 3-5 frases sobre a moto, baseada nas informações disponíveis no URL",
  "condition": "Novo|Seminovo|Bom estado|Precisa revisão",
  "documentation": "Com documento|Apenas nota fiscal|Sem documento",
  "acceptsTrade": false,
  "acceptsProposals": true,
  "platform": "olx|facebook|icarros|other",
  "confidence": "high|medium|low"
}

Regras:
- Se o URL é do OLX (olx.com.br), platform = "olx"
- Se o URL é do Facebook (facebook.com/marketplace), platform = "facebook"
- Se o URL é do iCarros, platform = "icarros"
- Caso contrário, platform = "other"
- Infira os dados da moto com base no URL e no contexto. Use dados realistas para o mercado brasileiro.
- Para preço, use valores típicos do mercado brasileiro de motos off-road
- confidence: "high" se o URL contém muita informação, "medium" se moderada, "low" se pouca`;

function detectPlatform(url: string): 'olx' | 'facebook' | 'icarros' | 'other' {
  if (url.includes('olx.com.br')) return 'olx';
  if (url.includes('facebook.com') || url.includes('fb.com')) return 'facebook';
  if (url.includes('icarros.com.br')) return 'icarros';
  return 'other';
}

export async function POST(req: NextRequest) {
  const client = new Anthropic({ apiKey: getApiKey() });
  try {
    const { url } = await req.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL inválida' }, { status: 400 });
    }

    // Validate it looks like a URL
    try { new URL(url); } catch {
      return NextResponse.json({ error: 'URL inválida. Insira uma URL completa (ex: https://...)' }, { status: 400 });
    }

    const platform = detectPlatform(url);

    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Extraia os dados do anúncio neste URL: ${url}\n\nPlataforma detectada: ${platform}\n\nRetorne apenas o JSON estruturado.`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';

    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Não foi possível extrair os dados deste anúncio' }, { status: 422 });
    }

    const extracted = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      success: true,
      data: {
        ...extracted,
        sourceUrl: url,
        sourcePlatform: platform,
        source: 'imported',
        userId: 'mercadao-mx',
      },
    });
  } catch (error) {
    console.error('Import listing error:', error);
    return NextResponse.json({ error: 'Erro ao processar o anúncio' }, { status: 500 });
  }
}

import type { Category, EngineType, Brand, ListingStatus, Displacement } from '@/types';

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(dateString));
}

export function formatRelativeDate(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 60) return `Há ${diffMinutes} min`;
  if (diffHours < 24) return `Há ${diffHours}h`;
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) return `Há ${diffDays} dias`;
  if (diffDays < 30) return `Há ${Math.floor(diffDays / 7)} sem.`;
  return formatDate(dateString);
}

export const CATEGORY_LABELS: Record<Category, string> = {
  motocross: 'Motocross',
  enduro: 'Enduro',
  trilha: 'Trilha',
  infantil: 'Infantil',
  competicao: 'Competição',
  lazer: 'Lazer',
};

export const ENGINE_TYPE_LABELS: Record<EngineType, string> = {
  two_stroke: 'Dois Tempos',
  four_stroke: 'Quatro Tempos',
};

export const STATUS_LABELS: Record<ListingStatus, string> = {
  active: 'Ativo',
  paused: 'Pausado',
  sold: 'Vendido',
};

export const BRANDS: Brand[] = [
  'Honda', 'Yamaha', 'Kawasaki', 'Suzuki', 'KTM', 'Husqvarna',
  'GasGas', 'Beta', 'Sherco', 'TM Racing', 'MXF', 'Pro Tork', 'Outra',
];

export const DISPLACEMENTS: Displacement[] = [
  '50cc', '60cc', '65cc', '80cc', '85cc', '90cc', '100cc', '105cc',
  '110cc', '112cc', '125cc', '150cc', '200cc', '230cc', '250cc',
  '350cc', '450cc', '500cc',
];

export const CATEGORIES: Category[] = [
  'motocross', 'enduro', 'trilha', 'infantil', 'competicao', 'lazer',
];

export const STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
];

export const DOCUMENTATION_OPTIONS = [
  'Com documento', 'Sem documento', 'Documento em transferência', 'Apenas nota fiscal',
];

export const CONDITION_OPTIONS = [
  'Novo', 'Seminovo', 'Bom estado', 'Precisa revisão', 'Para restauro',
];

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function generateQuickDescription(listing: Partial<{
  brand: string; model: string; year: number; engineType: string;
  category: string; city: string; state: string; displacement: string;
}>): string {
  const parts: string[] = [];

  if (listing.brand && listing.model) {
    parts.push(`${listing.brand} ${listing.model}`);
  }
  if (listing.year) parts.push(`ano ${listing.year}`);
  if (listing.displacement) parts.push(listing.displacement);
  if (listing.engineType) {
    parts.push(listing.engineType === 'two_stroke' ? 'motor dois tempos' : 'motor quatro tempos');
  }
  if (listing.category) {
    const catLabels: Record<string, string> = {
      motocross: 'motocross', enduro: 'enduro e trilha', trilha: 'trilha',
      infantil: 'uso infantil', competicao: 'competição', lazer: 'lazer',
    };
    parts.push(`ideal para ${catLabels[listing.category] ?? listing.category}`);
  }

  const base = parts.length > 0 ? `Vendo ${parts.join(', ')}.` : 'Moto em ótimas condições.';
  const location = listing.city && listing.state
    ? ` Moto localizada em ${listing.city}, ${listing.state}.`
    : '';

  return `${base}${location} Entre em contato para mais detalhes.`;
}

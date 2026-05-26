export type ListingStatus = 'active' | 'paused' | 'sold';
export type EngineType = 'two_stroke' | 'four_stroke';

/** Categoria de moto */
export type Category =
  | 'motocross'
  | 'enduro'
  | 'trilha'
  | 'infantil'
  | 'competicao'
  | 'lazer';

/** Tipo de produto no marketplace */
export type ProductType = 'moto' | 'peca' | 'equipamento';

export type Brand =
  | 'Honda'
  | 'Yamaha'
  | 'Kawasaki'
  | 'Suzuki'
  | 'KTM'
  | 'Husqvarna'
  | 'GasGas'
  | 'Beta'
  | 'Sherco'
  | 'TM Racing'
  | 'MXF'
  | 'Pro Tork'
  | 'Outra';

export type Displacement =
  | '50cc' | '60cc' | '65cc' | '80cc' | '85cc' | '90cc' | '100cc'
  | '105cc' | '110cc' | '112cc' | '125cc' | '150cc' | '200cc'
  | '230cc' | '250cc' | '350cc' | '450cc' | '500cc';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  cpf?: string;
  cep?: string;
  avatar?: string;
  createdAt: string;
}

export interface MotoListing {
  id: string;
  userId: string;
  productType: ProductType;
  title: string;
  description: string;
  brand: Brand;
  model: string;
  year: number;
  displacement: Displacement;
  engineType: EngineType;
  category: Category;
  price: number;
  acceptsTrade: boolean;
  acceptsProposals: boolean;
  city: string;
  state: string;
  documentation: string;
  condition: string;
  status: ListingStatus;
  photos: string[];
  mainPhoto: string;
  videoUrl?: string;
  audioUrl?: string;
  views: number;
  /** Está em destaque pago? */
  featured: boolean;
  /** Data/hora até quando o destaque está ativo (ISO string) */
  featuredUntil?: string;
  /** Origem do anúncio: manual pelo dono ou importado de outra plataforma */
  source?: 'manual' | 'imported';
  /** URL original do anúncio na plataforma de origem */
  sourceUrl?: string;
  /** Plataforma de origem */
  sourcePlatform?: 'olx' | 'facebook' | 'icarros' | 'other';
  createdAt: string;
  updatedAt: string;
  soldAt?: string;
}

export interface ChatConversation {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export type ChatMessageType = 'text' | 'image' | 'video' | 'audio' | 'proposal' | 'proposal_response' | 'contact_share';

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  message: string;
  type: ChatMessageType;
  mediaUrl?: string;
  /** Para propostas */
  proposalValue?: number;
  proposalStatus?: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
  readAt?: string;
}

export interface Proposal {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  value: number;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

export interface Favorite {
  id: string;
  userId: string;
  listingId: string;
  createdAt: string;
}

export interface ListingFilters {
  search: string;
  brand: string;
  model: string;
  displacement: string;
  engineType: string;
  category: string;
  productType: string;
  minPrice: string;
  maxPrice: string;
  yearFrom: string;
  yearTo: string;
  city: string;
  state: string;
  status: string;
  sortBy: string;
  showSold: boolean;
}

/** Mensagem do chat de cadastro via IA */
export interface BotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

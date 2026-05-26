import type { ListingStatus } from '@/types';
import { STATUS_LABELS } from '@/lib/utils';

interface Props {
  status: ListingStatus;
  size?: 'sm' | 'md';
}

const STATUS_STYLES: Record<ListingStatus, string> = {
  active: 'bg-green-50 text-green-700 border border-green-200',
  paused: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
  sold: 'bg-red-50 text-red-600 border border-red-200',
};

const DOT_STYLES: Record<ListingStatus, string> = {
  active: 'bg-green-500',
  paused: 'bg-yellow-500',
  sold: 'bg-red-500',
};

export default function ListingStatusBadge({ status, size = 'sm' }: Props) {
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeClass} ${STATUS_STYLES[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${DOT_STYLES[status]}`} />
      {STATUS_LABELS[status]}
    </span>
  );
}

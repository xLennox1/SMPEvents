import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', {
  variants: {
    tone: {
      neutral: 'border-line bg-raised text-muted',
      blue: 'border-primary/40 bg-primary/10 text-badge',
      live: 'border-live/40 bg-live/10 text-live',
      gold: 'border-gold/40 bg-gold/10 text-gold',
      ok: 'border-ok/40 bg-ok/10 text-ok',
      danger: 'border-danger/40 bg-danger/10 text-danger',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

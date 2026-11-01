import type { ReactNode } from 'react';

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold md:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-prose text-muted">{description}</p>}
      </div>
      {children}
    </header>
  );
}

export function EmptyState({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="panel p-8 text-center">
      <p className="font-medium">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{hint}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

export function DataError() {
  return (
    <div role="alert" className="panel border-danger/40 p-4 text-sm text-danger">
      Die Daten konnten nicht geladen werden. Prüfe die Supabase-Verbindung und ob alle Migrationen eingespielt sind (siehe README).
    </div>
  );
}

export function SectionTitle({ children, id }: { children: ReactNode; id?: string }) {
  return <h2 id={id} className="mb-3 text-xl font-semibold">{children}</h2>;
}

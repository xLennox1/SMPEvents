import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-muted md:px-6">
        <p>
          SMPEvents ist ein Community-Projekt und kein Angebot von Mojang oder Microsoft.
          Der blaue Haken bestätigt den Abschluss unseres Prüfverfahrens und garantiert nicht, dass jedes Event seriös ist.
        </p>
        <nav aria-label="Rechtliches und Regeln" className="flex flex-wrap gap-x-5 gap-y-1">
          <Link href="/regeln" className="hover:text-foreground hover:underline">Community-Regeln</Link>
          <Link href="/datenschutz" className="hover:text-foreground hover:underline">Datenschutz</Link>
          <Link href="/impressum" className="hover:text-foreground hover:underline">Impressum</Link>
        </nav>
      </div>
    </footer>
  );
}

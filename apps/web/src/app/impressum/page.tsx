import { PageHeader } from '@/components/page-bits';
import { operator } from '@/lib/env';

export const metadata = { title: 'Impressum' };

export default function ImprintPage() {
  const o = operator();
  const missing = !o.name || !o.address || !o.email;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Impressum" />
      {missing && (
        <div role="status" className="rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold">
          Hinweis für den Betreiber: Die Anbieterangaben fehlen noch. Setze NEXT_PUBLIC_OPERATOR_NAME, NEXT_PUBLIC_OPERATOR_ADDRESS und NEXT_PUBLIC_OPERATOR_EMAIL in der Umgebung (siehe docs/DEPLOYMENT.md). Bevor die Seite öffentlich läuft, sollte das Impressum rechtlich geprüft werden.
        </div>
      )}
      <section className="panel space-y-3 p-5">
        <h2 className="text-xl font-semibold">Anbieter</h2>
        <p className="whitespace-pre-line">{o.name ?? 'Name: noch nicht angegeben'}</p>
        <p className="whitespace-pre-line">{o.address ?? 'Anschrift: noch nicht angegeben'}</p>
        <p>{o.email ? <>E-Mail: <a href={`mailto:${o.email}`} className="link">{o.email}</a></> : 'E-Mail: noch nicht angegeben'}</p>
      </section>
      <section className="panel space-y-2 p-5 text-sm text-muted">
        <p>SMPEvents ist ein Community-Projekt rund um den Minecraft-Server WindSMP. Es steht in keiner Verbindung zu Mojang Studios oder Microsoft. Minecraft ist eine Marke von Mojang Studios.</p>
      </section>
    </div>
  );
}

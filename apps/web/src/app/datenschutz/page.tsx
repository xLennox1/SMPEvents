import Link from 'next/link';
import { PageHeader } from '@/components/page-bits';
import { operator } from '@/lib/env';

export const metadata = { title: 'Datenschutz' };

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel p-5">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-2 space-y-2 text-muted">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  const o = operator();
  const missing = !o.name || !o.address || !o.email;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Datenschutzinformationen" description="Was SMPEvents mit deinen Daten macht, in einfachen Worten." />
      {missing && (
        <div role="status" className="rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold">
          Hinweis für den Betreiber: Die Angaben zum Verantwortlichen fehlen noch (NEXT_PUBLIC_OPERATOR_NAME, _ADDRESS, _EMAIL). Diese Seite beschreibt die tatsächliche technische Verarbeitung der Anwendung; lass sie vor dem Livegang rechtlich prüfen und ergänze, was für dein Setup zusätzlich gilt.
        </div>
      )}
      <Block title="Verantwortlich">
        <p className="whitespace-pre-line">{[o.name, o.address].filter(Boolean).join('\n') || 'Noch nicht angegeben.'}</p>
        {o.email && <p>Kontakt: <a href={`mailto:${o.email}`} className="link">{o.email}</a></p>}
      </Block>
      <Block title="Welche Daten wir verarbeiten">
        <p><strong className="text-foreground">Konto:</strong> E-Mail-Adresse, Passwort (nur als Hash bei Supabase Auth, nie im Klartext), Benutzername, optional Avatar, Kurzbeschreibung und Twitch-Link. Zweck: Anmeldung und die Funktionen der Plattform.</p>
        <p><strong className="text-foreground">Inhalte:</strong> Rezensionen, Chatnachrichten im SMPEvents Chatall (nur für angemeldete Nutzer sichtbar), Favoriten, Folgen, Erinnerungen und Benachrichtigungen. Streamer zusätzlich Profil und Events.</p>
        <p><strong className="text-foreground">Verifizierung:</strong> dein Antrag mit optionalem Discord-Namen. Das Ticket selbst läuft auf Discord, dort gelten deren Datenschutzhinweise.</p>
        <p><strong className="text-foreground">Premium und Zahlungen:</strong> Minecraft-Name, angegebener Betrag, Notiz, Entscheidung und Laufzeiten sowie ein Protokoll von Admin-Aktionen. Wir verarbeiten keine Bank- oder Kartendaten, denn bezahlt wird im Spiel.</p>
        <p><strong className="text-foreground">Minecraft-Mod (nur wenn du sie nutzt und ein Token erzeugst):</strong> erkannte Zahlungs-Chatzeile, Spielernamen, Betrag und Zeitpunkt. Das Token speichern wir nur als Hash. Die Mod meldet nur Zeilen, die zu deinen eigenen Mustern passen.</p>
        <p><strong className="text-foreground">Technische Daten:</strong> Die Hosting-Dienste verarbeiten beim Aufruf technisch notwendige Verbindungsdaten (zum Beispiel IP-Adresse). Für Rate-Limits speichern wir nur eine gehashte Kurzkennung, die regelmäßig bereinigt wird.</p>
        <p><strong className="text-foreground">Cookies:</strong> nur technisch notwendige Anmelde-Cookies. Kein Tracking, keine Werbung, keine Analyse-Dienste.</p>
      </Block>
      <Block title="Dienstleister">
        <p><strong className="text-foreground">Supabase:</strong> Datenbank, Anmeldung, Dateispeicher (Avatare, Zahlungsnachweise) und Echtzeit-Chat. <strong className="text-foreground">Vercel:</strong> Hosting der Website.</p>
        <p><strong className="text-foreground">Twitch:</strong> Der eingebettete Player lädt erst, wenn der Stream live ist oder du „Player laden“ klickst, und überträgt dann Daten an Twitch. Den Live-Status fragen wir serverseitig bei der Twitch-API ab, ohne Daten von dir. <strong className="text-foreground">Discord:</strong> nur ein Link zum Ticket-Kanal.</p>
        <p>Angaben zu Serverstandorten und Garantien bei Übermittlungen außerhalb der EU stellen die Anbieter in ihren eigenen Datenschutzhinweisen bereit.</p>
      </Block>
      <Block title="Speicherdauer">
        <p>Konto- und Inhaltsdaten bleiben bis zur Löschung deines Kontos gespeichert. Gemeldete Inhalte werden für die Bearbeitung der Meldung als Kopie festgehalten. Das Protokoll der Admin-Aktionen und Zahlungsentscheidungen bleibt zur Nachvollziehbarkeit bestehen.</p>
      </Block>
      <Block title="Deine Rechte">
        <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch sowie auf Beschwerde bei einer Datenschutzaufsichtsbehörde.{o.email ? ' Schreibe uns dazu an die oben genannte E-Mail-Adresse.' : ''} Dein Profil bearbeitest du selbst unter <Link href="/profile" className="link">Profil</Link>.</p>
      </Block>
      <Block title="Sicherheit">
        <p>Die Übertragung läuft über HTTPS. Zugriffe auf Daten sind in der Datenbank per Row Level Security eingeschränkt; Rollen, Verifizierung und Premium lassen sich von Nutzern nicht selbst ändern. Admin-Aktionen werden protokolliert.</p>
      </Block>
    </div>
  );
}

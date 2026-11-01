import Link from 'next/link';
import { PageHeader } from '@/components/page-bits';

export const metadata = { title: 'Community-Regeln' };

function Rule({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel p-5">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-2 space-y-2 text-muted">{children}</div>
    </section>
  );
}

export default function RulesPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Community-Regeln" description="Damit SMPEvents für alle nützlich bleibt. Wer sich daran hält, hat nichts zu befürchten." />
      <Rule title="Umgang miteinander">
        <p>Bleib respektvoll. Beleidigungen, Hetze, Diskriminierung und Drohungen sind nicht erlaubt, im Chat genauso wenig wie in Rezensionen, Profilen oder Events.</p>
        <p>Veröffentliche keine privaten Daten anderer Personen (Adressen, Telefonnummern, Klarnamen, Zugangsdaten).</p>
      </Rule>
      <Rule title="Chat (SMPEvents Chatall)">
        <p>Kein Spam, keine Werbung, keine wiederholten Nachrichten und keine Links zu Schadsoftware oder Betrugsseiten. Es gelten Limits: höchstens 5 Nachrichten in 10 Sekunden und 500 Zeichen pro Nachricht.</p>
        <p>Melde Verstöße über „Melden“ an der Nachricht. Die Moderation kann Nachrichten löschen und Nutzer zeitweise stummschalten.</p>
      </Rule>
      <Rule title="Events">
        <p>Beschreibe Belohnungen und Teilnahmebedingungen vollständig und ehrlich. Fake-Giveaways, versteckte Bedingungen und Täuschung sind verboten. Die Moderation kann Events mit Begründung ausblenden.</p>
        <p>Nimm nur an Events teil, deren Bedingungen du verstehst. Der blaue Haken bestätigt den Abschluss unseres Prüfverfahrens für den Streamer, er garantiert nicht, dass jedes Event oder jede Verlosung seriös ist.</p>
      </Rule>
      <Rule title="Rezensionen">
        <p>Bewerte nur auf Basis eigener Erfahrung, sachlich und ohne Beleidigungen. Pro Streamer ist eine Rezension möglich; du kannst sie jederzeit bearbeiten oder löschen. Rezensionen mit mehreren Konten zu vervielfältigen, gegenseitig abzusprechen oder zu kaufen ist verboten.</p>
        <p><strong className="text-foreground">Negative Rezensionen werden nicht allein deshalb entfernt, weil sie negativ sind.</strong> Entfernt wird nur bei Regelverstößen (Beleidigung, Spam, Werbung, persönliche Daten, offensichtlich Gefälschtes), immer mit dokumentiertem Grund. Streamer können fremde Rezensionen nicht selbst löschen.</p>
      </Rule>
      <Rule title="Verifizierung">
        <p>Streamer beantragen den blauen Haken im Profil und über ein Ticket auf unserem Discord. Ein Administrator entscheidet; ein Ticket allein verifiziert nie. Bei einem Wechsel des Twitch-Kanals entfällt der Haken, bis erneut geprüft wurde.</p>
      </Rule>
      <Rule title="Premium und Zahlungen">
        <p>Bezahlt wird im Spiel in WindSMP-Coins. Ein Administrator prüft jede Zahlung von Hand; erst danach startet oder verlängert sich Premium. Screenshots, Chatnachrichten und Meldungen der Minecraft-Mod sind kein Beweis und schalten nichts frei. Betrugsversuche führen zum Ausschluss.</p>
      </Rule>
      <Rule title="Moderation und Folgen">
        <p>Je nach Schwere können Inhalte entfernt oder ausgeblendet, Nutzer im Chat stummgeschaltet oder der blaue Haken entzogen werden. Bei schweren oder wiederholten Verstößen können Konten gesperrt werden. Sensible Moderationsentscheidungen werden protokolliert.</p>
        <p>Fragen oder Einsprüche klärst du im Discord-Ticket oder per Kontakt aus dem <Link href="/impressum" className="link">Impressum</Link>.</p>
      </Rule>
    </div>
  );
}

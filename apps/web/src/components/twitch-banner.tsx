import Link from 'next/link';
import { Tv } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TwitchPlayer } from '@/components/twitch-player';
import { twitchChannel } from '@/lib/env';
import { getTwitchStatus } from '@/lib/twitch';

export async function TwitchBanner() {
  const channel = twitchChannel();
  const status = await getTwitchStatus(channel);
  const url = `https://www.twitch.tv/${channel.toLowerCase()}`;

  return (
    <section aria-labelledby="twitch-heading" className="stage overflow-hidden rounded-2xl border border-line">
      <div className="grid gap-6 p-5 md:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center">
        <div>
          {status.state === 'live' ? (
            <Badge tone="live"><span className="live-dot size-1.5 rounded-full bg-live" />Live, {status.viewers.toLocaleString('de-DE')} Zuschauer</Badge>
          ) : status.state === 'offline' ? (
            <Badge>Offline</Badge>
          ) : (
            <Badge>Live-Status nicht verfügbar</Badge>
          )}
          <h2 id="twitch-heading" className="mt-3 text-4xl font-bold md:text-5xl">{channel}</h2>
          <p className="mt-3 max-w-prose text-muted">
            {status.state === 'live'
              ? `${status.title}${status.game ? `, gespielt wird ${status.game}.` : ''}`
              : status.state === 'offline'
                ? 'Gerade offline. Schau auf Twitch vorbei, sobald der Stream startet, und verpasse kein Giveaway.'
                : 'Der Twitch-Kanal hinter SMPEvents. Der Live-Status lässt sich hier gerade nicht abfragen, der Kanal ist trotzdem direkt erreichbar.'}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <a href={url} target="_blank" rel="noopener noreferrer"><Tv aria-hidden />Auf Twitch ansehen</a>
            </Button>
            <Button asChild size="lg" variant="secondary"><Link href="/events">Events entdecken</Link></Button>
          </div>
        </div>
        <TwitchPlayer channel={channel} live={status.state === 'live'} />
      </div>
    </section>
  );
}

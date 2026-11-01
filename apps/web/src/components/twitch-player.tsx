'use client';
import { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Lädt den Twitch-Player erst bei Live-Status oder auf Klick (Datenschutz). `parent` kommt aus der echten Domain. */
export function TwitchPlayer({ channel, live }: { channel: string; live: boolean }) {
  const [host, setHost] = useState<string | null>(null);
  const [armed, setArmed] = useState(live);
  useEffect(() => setHost(window.location.hostname), []);

  return (
    <div className="aspect-video overflow-hidden rounded-lg border border-line bg-black">
      {armed && host ? (
        <iframe
          title={`Twitch-Stream von ${channel}`}
          src={`https://player.twitch.tv/?channel=${encodeURIComponent(channel.toLowerCase())}&parent=${encodeURIComponent(host)}&muted=true`}
          allowFullScreen
          className="size-full"
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-raised to-background p-4 text-center">
          <p className="font-display text-xl font-semibold">{channel}</p>
          <p className="max-w-xs text-sm text-muted">Der Player lädt erst nach deinem Klick und überträgt dann Daten an Twitch.</p>
          <Button variant="secondary" onClick={() => setArmed(true)}><Play aria-hidden />Player laden</Button>
        </div>
      )}
    </div>
  );
}

'use client';
import { useState } from 'react';
import { Avatar } from '@/components/avatar';
import { createClient } from '@/lib/supabase/client';

const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

export function AvatarUpload({ userId, username, current }: { userId: string; username: string; current: string | null }) {
  const [url, setUrl] = useState(current);
  const [msg, setMsg] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = TYPES[file.type];
    if (!ext || file.size > 1_000_000) { setMsg('Erlaubt sind PNG, JPEG oder WebP bis 1 MB.'); return; }
    const supabase = createClient();
    const path = `${userId}/avatar-${Date.now()}.${ext}`; // Ordner = eigene Nutzer-ID (Storage-Policy)
    const up = await supabase.storage.from('avatars').upload(path, file, { contentType: file.type });
    if (up.error) { setMsg('Der Upload hat nicht geklappt.'); return; }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    const save = await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', userId);
    if (save.error) { setMsg('Das Speichern hat nicht geklappt.'); return; }
    setUrl(data.publicUrl);
    setMsg('Avatar aktualisiert.');
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar name={username} url={url} size={64} />
      <div>
        <label htmlFor="avatar" className="label">Avatar</label>
        <input id="avatar" type="file" accept="image/png,image/jpeg,image/webp" onChange={onChange} className="text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-raised file:px-3 file:py-1.5 file:text-foreground" />
        {msg && <p role="status" className="mt-1 text-sm text-muted">{msg}</p>}
      </div>
    </div>
  );
}

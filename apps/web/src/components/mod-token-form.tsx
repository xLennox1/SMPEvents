'use client';
import { useActionState } from 'react';
import { createModToken, type TokenState } from '@/actions/account';
import { Button } from '@/components/ui/button';

export function ModTokenForm() {
  const [state, action, pending] = useActionState<TokenState, FormData>(createModToken, {});
  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div><label htmlFor="token-label" className="label">Bezeichnung</label><input id="token-label" name="label" maxLength={40} placeholder="z. B. Mein PC" className="field" /></div>
        <Button type="submit" disabled={pending}>{pending ? 'Erstelle …' : 'Neues Token erstellen'}</Button>
      </div>
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      {state.token && (
        <div role="status" className="rounded-lg border border-gold/40 bg-gold/10 p-3 text-sm">
          <p className="font-medium text-gold">Das Token wird nur jetzt angezeigt. Kopiere es in die Konfigurationsdatei der Mod (apiToken).</p>
          <code className="mt-2 block select-all break-all rounded bg-background p-2 text-foreground">{state.token}</code>
        </div>
      )}
    </form>
  );
}

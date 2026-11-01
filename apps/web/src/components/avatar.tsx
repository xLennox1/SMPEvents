export function Avatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
  const style = { width: size, height: size };
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" referrerPolicy="no-referrer" style={style} className="shrink-0 rounded-full bg-raised object-cover" />
  ) : (
    <span aria-hidden style={style} className="inline-flex shrink-0 items-center justify-center rounded-full bg-raised text-xs font-semibold text-muted">
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

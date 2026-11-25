/** The marcas of a movement, shown as small labels under its concept. */
export function TagChips({ tags }: { tags: string[] }) {
  if (tags.length === 0) {
    return null;
  }
  return (
    <ul className="tag-chips" aria-label="Marcas">
      {tags.map((t) => (
        <li key={t} className="tag-chip">
          {t}
        </li>
      ))}
    </ul>
  );
}

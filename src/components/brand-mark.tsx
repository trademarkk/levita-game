export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand-mark" aria-label="LEVITA — Золотая Саванна: Путь к Вершине">
      <span className="brand-sun" aria-hidden="true">♛</span>
      <span>
        <b>LEVITA</b>
        {!compact && <small>Золотая Саванна: Путь к Вершине</small>}
      </span>
    </div>
  );
}

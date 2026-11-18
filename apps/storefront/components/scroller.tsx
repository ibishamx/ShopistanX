/** A row of items that scrolls sideways forever; pauses on hover, static when motion is reduced. */
export function Scroller({
  items,
  separator,
  itemClassName,
  direction = 'left',
  seconds = 30,
}: {
  items: string[];
  separator: string;
  itemClassName: string;
  direction?: 'left' | 'right';
  seconds?: number;
}) {
  // Repeat short lists so one copy is wider than the screen.
  const unit = Array.from({ length: Math.max(1, Math.ceil(8 / items.length)) }, () => items).flat();
  const copy = (hidden: boolean) => (
    <div className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {unit.map((text, i) => (
        <span key={i} className={itemClassName}>
          {text}
          <span aria-hidden className="opacity-70">{separator}</span>
        </span>
      ))}
    </div>
  );
  return (
    <div className="sf-scroller overflow-hidden">
      <div className="sf-track" data-direction={direction} style={{ ['--sf-duration' as string]: `${seconds}s` }}>
        {copy(false)}
        {copy(true)}
      </div>
    </div>
  );
}

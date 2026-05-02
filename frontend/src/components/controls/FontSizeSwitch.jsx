export function FontSizeSwitch({ value, onChange, t, maxSize = 32 }) {
  const minSize = 16;
  const maxSizeValue = maxSize;
  const step = 4;

  const decrease = () => {
    const newSize = Math.max(minSize, value - step);
    onChange(newSize);
  };

  const increase = () => {
    const newSize = Math.min(maxSizeValue, value + step);
    onChange(newSize);
  };

  return (
    <div className="font-size-switch" aria-label={t.textSizeLabel}>
      <button
        type="button"
        onClick={decrease}
        disabled={value <= minSize}
        title={t.textSizeLabel}
      >
        {t.textSizeDecrease}
      </button>
      <span className="font-size-value">{value}px</span>
      <button
        type="button"
        onClick={increase}
        disabled={value >= maxSizeValue}
        title={t.textSizeLabel}
      >
        {t.textSizeIncrease}
      </button>
    </div>
  );
}

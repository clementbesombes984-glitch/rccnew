// UTC slot selection: no mutable counter, including across restarts or missed slots.
export const ROTATION_CATEGORIES = Object.freeze(['M6', 'M8', 'M10', 'M12', 'M14', 'M16', 'M19', 'Cadettes', 'Seniors']);
export function sportEasySlot(scheduledTime) {
  if (!Number.isSafeInteger(scheduledTime) || scheduledTime < 0) throw new Error('invalid_scheduled_time');
  const slot = Math.floor(scheduledTime / 600000);
  const slotOfDay = slot % 144;
  return {
    slot,
    category: ROTATION_CATEGORIES[slot % ROTATION_CATEGORIES.length],
    day: new Date(scheduledTime).toISOString().slice(0, 10),
    // First nine slots of the UTC day spread one full pass per category.
    dailyFullSlot: slotOfDay < ROTATION_CATEGORIES.length
  };
}

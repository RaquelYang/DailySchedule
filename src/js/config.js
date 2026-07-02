export const STORAGE_KEY = "dailySchedule.v1";
export const START_HOUR = 6;
export const END_HOUR = 24;
export const MINUTES_PER_DAY_VIEW = (END_HOUR - START_HOUR) * 60;
export const TIME_STEP = 30;
export const LONG_PRESS_DELAY = 450;
export const MOVE_TOLERANCE = 8;
export const VALID_COLORS = new Set(["green", "red", "blue"]);
export const VALID_TODO_PRIORITIES = new Set(["high", "medium", "low"]);
export const VALID_MOBILE_PANELS = new Set(["schedule", "todo"]);
export const TODO_PRIORITY_LABELS = {
  high: "高",
  medium: "中",
  low: "低",
};
export const TODO_PRIORITY_RANKS = {
  high: 0,
  medium: 1,
  low: 2,
};

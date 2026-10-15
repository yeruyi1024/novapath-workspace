import { i18nService } from '../../services/i18n';

export interface ConversationRelativeTime {
  compact: string;
  full: string;
}

const Milliseconds = {
  Minute: 60000,
  Hour: 3600000,
  Day: 86400000,
} as const;

const CalendarUnit = {
  HoursPerDay: 24,
  DaysPerWeek: 7,
  DaysPerMonth: 30,
  MonthsPerYear: 12,
} as const;

const formatDuration = (value: number, unitKey: string): ConversationRelativeTime => {
  const unit = i18nService.t(unitKey);
  const compact = i18nService.getLanguage() === 'zh' ? `${value} ${unit}` : `${value}${unit}`;
  return {
    compact,
    full: compact,
  };
};

export const formatConversationRelativeTime = (timestamp: number): ConversationRelativeTime => {
  const safeTimestamp = Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now();
  const diff = Math.max(0, Date.now() - safeTimestamp);
  const minutes = Math.max(1, Math.floor(diff / Milliseconds.Minute));
  if (minutes <= 60) {
    return formatDuration(minutes, 'conversationMinuteShort');
  }

  const hours = Math.floor(diff / Milliseconds.Hour);

  if (hours < CalendarUnit.HoursPerDay) {
    return formatDuration(hours, 'conversationHourShort');
  }

  const days = Math.floor(diff / Milliseconds.Day);
  if (days < CalendarUnit.DaysPerWeek) {
    return formatDuration(days, 'conversationDayShort');
  }

  if (days < CalendarUnit.DaysPerMonth) {
    return formatDuration(Math.floor(days / CalendarUnit.DaysPerWeek), 'conversationWeekShort');
  }

  const months = Math.floor(days / CalendarUnit.DaysPerMonth);
  if (months < CalendarUnit.MonthsPerYear) {
    return formatDuration(months, 'conversationMonthShort');
  }

  return formatDuration(Math.floor(months / CalendarUnit.MonthsPerYear), 'conversationYearShort');
};

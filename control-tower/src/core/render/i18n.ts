/**
 * Panel language: every word a MODULE writes on the e-paper panel, in French
 * and English, behind one typed key set.
 *
 * Scope, deliberately narrow:
 *
 *  - Words the machine writes (conditions, "feels like", unavailable states,
 *    unit words, moon phases, date formats) are looked up here.
 *  - Module DEFAULT copy (a heading such as "À VENIR") is stored in a saved
 *    composition as plain French text. At render time a text that is still
 *    exactly the French default is swapped for its English twin; anything the
 *    owner typed is never matched and so never translated.
 *  - Tower chrome (the web UI) is English and is not in here.
 *
 * French is the default and the reference: with `fr` every lookup returns the
 * string the modules hard-coded before this file existed, which is what keeps
 * every stored composition and every golden digest byte-identical.
 */

export const PANEL_LANGS = ["fr", "en"] as const;
export type PanelLang = (typeof PANEL_LANGS)[number];
export const DEFAULT_PANEL_LANG: PanelLang = "fr";

export function isPanelLang(value: unknown): value is PanelLang {
  return value === "fr" || value === "en";
}

const FR = {
  // Weather conditions, lower-case, as written inside the compact line.
  "cond.sunny": "ensoleillé",
  "cond.clear-night": "dégagé",
  "cond.partlycloudy": "éclaircies",
  "cond.cloudy": "nuageux",
  "cond.fog": "brouillard",
  "cond.rainy": "pluie",
  "cond.snowy": "neige",
  "cond.lightning-rainy": "orage",
  // Compact weather labels.
  "weather.feelsLike": "ressenti {value}°",
  "weather.wind": "vent {value} km/h",
  "weather.rain": "pluie {value} %",
  // Compass, 8 points from N clockwise.
  "dir.N": "N",
  "dir.NE": "NE",
  "dir.E": "E",
  "dir.SE": "SE",
  "dir.S": "S",
  "dir.SW": "SO",
  "dir.W": "O",
  "dir.NW": "NO",
  // Parts of the day (written by the weather source, translated at render).
  "part.morning": "Matin",
  "part.noon": "Midi",
  "part.evening": "Soir",
  // Shared unavailable / stale defaults.
  "weather.unavailable": "Météo indisponible",
  "weather.noInvented": "Aucune valeur inventée",
  "weather.staleShown": "Prévision périmée, affichée telle quelle",
  "weather.stalePlural": "Prévisions périmées",
  "weather.stalePluralShown": "Prévisions périmées, affichées telles quelles",
  "weather24h.heading": "LES PROCHAINES 24H",
  "weather24h.range": "{low} à {high} {unit} · {hours} h disponibles",
  "weatherWeek.unavailable": "Prévisions 7 j indisponibles",
  // Calendar.
  "calendar.heading": "À VENIR",
  "calendar.emptyTitle": "Aucun événement",
  "calendar.emptyNote": "sur les {jours} prochains jours",
  "calendar.emptyNoteLegacy": "sur les 366 prochains jours",
  "calendar.noHorizon": "pour le moment",
  "calendar.stale": "Instantané périmé",
  "calendar.unavailable": "Calendrier indisponible",
  "calendar.unavailableNote": "Accès EventKit à vérifier",
  "calendar.allDay": "journée",
  // Sensors.
  "sensor.label": "Capteur",
  "sensor.staleSuffix": " · périmé",
  "sensor.stale": "périmé",
  "sensor.unavailable": "indisponible",
  "sensors.empty": "Aucun capteur choisi",
  // Countdown.
  "countdown.label": "AVANT",
  "countdown.passed": "C'est arrivé",
  "countdown.unsetTitle": "Compte à rebours",
  "countdown.unsetNote": "Aucune date cible définie",
  "unit.day": "jour",
  "unit.days": "jours",
  "unit.hour": "heure",
  "unit.hours": "heures",
  "unit.minute": "minute",
  "unit.minutes": "minutes",
  // List.
  "list.title": "LISTE",
  "list.empty": "Rien pour l'instant",
  "list.more": "+{count} de plus",
  // Headline defaults.
  "headline.kicker": "AUJOURD'HUI",
  "headline.headline": "Bonjour",
  "headline.subline": "Une bonne journée à la maison",
  // Message / conditional / image.
  "message.invalidExpiry": "Message : date d'expiration invalide",
  "conditional.unsetTitle": "Message conditionnel",
  "conditional.unsetNote": "Condition à définir",
  "image.unsetTitle": "Photo",
  "image.unsetNote": "Ajoutez une image",
  // Timestamp.
  "timestamp.label": "MAJ {stamp}",
  "timestamp.prefix": "MAJ",
  // Sky.
  "sky.title": "LE CIEL",
  "sky.polarDay": "Jour polaire",
  "sky.polarNight": "Nuit polaire",
  "moon.new": "Nouvelle lune",
  "moon.waxing-crescent": "Premier croissant",
  "moon.first-quarter": "Premier quartier",
  "moon.waxing-gibbous": "Gibbeuse croissante",
  "moon.full": "Pleine lune",
  "moon.waning-gibbous": "Gibbeuse décroissante",
  "moon.last-quarter": "Dernier quartier",
  "moon.waning-crescent": "Dernier croissant",
} as const;

export type PanelStringKey = keyof typeof FR;

const EN: Record<PanelStringKey, string> = {
  "cond.sunny": "sunny",
  "cond.clear-night": "clear",
  "cond.partlycloudy": "partly cloudy",
  "cond.cloudy": "cloudy",
  "cond.fog": "fog",
  "cond.rainy": "rain",
  "cond.snowy": "snow",
  "cond.lightning-rainy": "storm",
  "weather.feelsLike": "feels {value}°",
  "weather.wind": "wind {value} km/h",
  "weather.rain": "rain {value} %",
  "dir.N": "N",
  "dir.NE": "NE",
  "dir.E": "E",
  "dir.SE": "SE",
  "dir.S": "S",
  "dir.SW": "SW",
  "dir.W": "W",
  "dir.NW": "NW",
  "part.morning": "Morning",
  "part.noon": "Noon",
  "part.evening": "Evening",
  "weather.unavailable": "Weather unavailable",
  "weather.noInvented": "No value invented",
  "weather.staleShown": "Forecast out of date, shown as is",
  "weather.stalePlural": "Forecast out of date",
  "weather.stalePluralShown": "Forecast out of date, shown as is",
  "weather24h.heading": "NEXT 24 HOURS",
  "weather24h.range": "{low} to {high} {unit} · {hours} h available",
  "weatherWeek.unavailable": "7-day forecast unavailable",
  "calendar.heading": "UPCOMING",
  "calendar.emptyTitle": "No events",
  "calendar.emptyNote": "in the next {jours} days",
  "calendar.emptyNoteLegacy": "in the next 366 days",
  "calendar.noHorizon": "for now",
  "calendar.stale": "Snapshot out of date",
  "calendar.unavailable": "Calendar unavailable",
  "calendar.unavailableNote": "Check EventKit access",
  "calendar.allDay": "all day",
  "sensor.label": "Sensor",
  "sensor.staleSuffix": " · stale",
  "sensor.stale": "stale",
  "sensor.unavailable": "unavailable",
  "sensors.empty": "No sensor chosen",
  "countdown.label": "UNTIL",
  "countdown.passed": "It's here",
  "countdown.unsetTitle": "Countdown",
  "countdown.unsetNote": "No target date set",
  "unit.day": "day",
  "unit.days": "days",
  "unit.hour": "hour",
  "unit.hours": "hours",
  "unit.minute": "minute",
  "unit.minutes": "minutes",
  "list.title": "LIST",
  "list.empty": "Nothing for now",
  "list.more": "+{count} more",
  "headline.kicker": "TODAY",
  "headline.headline": "Hello",
  "headline.subline": "Have a good day at home",
  "message.invalidExpiry": "Message: invalid expiry date",
  "conditional.unsetTitle": "Conditional message",
  "conditional.unsetNote": "Condition not set",
  "image.unsetTitle": "Photo",
  "image.unsetNote": "Add an image",
  "timestamp.label": "UPD {stamp}",
  "timestamp.prefix": "UPD",
  "sky.title": "THE SKY",
  "sky.polarDay": "Polar day",
  "sky.polarNight": "Polar night",
  "moon.new": "New moon",
  "moon.waxing-crescent": "Waxing crescent",
  "moon.first-quarter": "First quarter",
  "moon.waxing-gibbous": "Waxing gibbous",
  "moon.full": "Full moon",
  "moon.waning-gibbous": "Waning gibbous",
  "moon.last-quarter": "Last quarter",
  "moon.waning-crescent": "Waning crescent",
};

export const PANEL_STRINGS: Record<PanelLang, Record<PanelStringKey, string>> = {
  fr: FR,
  en: EN,
};

export const PANEL_STRING_KEYS = Object.keys(FR) as PanelStringKey[];

/** One panel string, optionally with {placeholders} filled. */
export function pt(
  lang: PanelLang | undefined,
  key: PanelStringKey,
  values?: Record<string, string | number>,
): string {
  const table = PANEL_STRINGS[lang ?? DEFAULT_PANEL_LANG];
  let text = table[key] ?? FR[key];
  if (values) {
    for (const [name, value] of Object.entries(values)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

/** French text -> key, for recognising untouched defaults. */
const FR_REVERSE = new Map<string, PanelStringKey>();
for (const key of PANEL_STRING_KEYS) {
  // Machine vocabulary (conditions, compass points, unit words, moons) is
  // looked up by key where it is written; matching it by value against option
  // strings could catch an enum value or a one-letter word the owner typed.
  if (/^(cond|dir|unit|moon)\./.test(key)) continue;
  if (!FR_REVERSE.has(FR[key])) FR_REVERSE.set(FR[key], key);
}

/**
 * A stored string, in the panel language, IF it is a known French default.
 * Anything else (the owner's words) comes back unchanged. With `fr` this is
 * always the identity, which is the byte-identity guarantee.
 */
export function localizeDefault(text: string, lang: PanelLang | undefined): string {
  if (!lang || lang === "fr") return text;
  const key = FR_REVERSE.get(text);
  return key ? PANEL_STRINGS[lang][key] : text;
}

/** The same, applied to a text element ({ text, visible, style }). */
export function localizeElement<T extends { text: string }>(
  element: T,
  lang: PanelLang | undefined,
): T {
  if (!lang || lang === "fr") return element;
  const text = localizeDefault(element.text, lang);
  return text === element.text ? element : { ...element, text };
}

/**
 * Swap untouched French defaults in a module's TOP-LEVEL options: text
 * elements and plain string fields. Nested arrays (list rows, sensor
 * entities) are the owner's content and are never walked.
 */
export function localizeOptions<T>(options: T, lang: PanelLang | undefined): T {
  if (!lang || lang === "fr" || typeof options !== "object" || options === null) return options;
  let out: Record<string, unknown> | null = null;
  for (const [field, value] of Object.entries(options as Record<string, unknown>)) {
    let next: unknown = value;
    if (typeof value === "string") next = localizeDefault(value, lang);
    else if (value && typeof value === "object" && !Array.isArray(value) && typeof (value as { text?: unknown }).text === "string") {
      next = localizeElement(value as { text: string }, lang);
    }
    if (next !== value) {
      out ??= { ...(options as Record<string, unknown>) };
      out[field] = next;
    }
  }
  return (out ?? options) as T;
}

/** Localise the shared unavailable/stale elements a module carries, if any. */
export function localizeCommon<T extends object>(options: T, lang: PanelLang | undefined): T {
  if (!lang || lang === "fr") return options;
  const out: Record<string, unknown> = { ...(options as Record<string, unknown>) };
  for (const field of ["unavailableTitle", "unavailableNote", "staleLabel"]) {
    const el = out[field] as { text?: unknown } | undefined;
    if (el && typeof el.text === "string") out[field] = localizeElement(el as { text: string }, lang);
  }
  return out as T;
}

const COMPASS = ["dir.N", "dir.NE", "dir.E", "dir.SE", "dir.S", "dir.SW", "dir.W", "dir.NW"] as const;

/** 8-point compass for a meteorological "from" bearing. */
export function compass(deg: number, lang: PanelLang | undefined): string {
  const key = COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
  return key ? pt(lang, key) : "";
}

/** Intl locale used for any locale-dependent date part. */
export function panelLocale(lang: PanelLang | undefined): string {
  return lang === "en" ? "en-US" : "fr-FR";
}

/**
 * Short date for the panel. French keeps the historical "dd/mm"; English
 * says "Sep 12", because "09/12" reads as a different day to half of English
 * readers and "12/09" to the other half.
 */
export function formatPanelDate(date: Date, timeZone: string, lang: PanelLang | undefined): string {
  if (lang === "en") {
    return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" }).format(date);
  }
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, day: "2-digit", month: "2-digit" }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? "00";
  return `${pick("day")}/${pick("month")}`;
}

/** "HH:MM", 24-hour, in either language. */
export function formatPanelTime(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? "00";
  return `${pick("hour")}:${pick("minute")}`;
}

/** Short upper-case weekday, e.g. "LUN" / "MON". */
export function formatWeekday(date: Date, timeZone: string, lang: PanelLang | undefined): string {
  return new Intl.DateTimeFormat(panelLocale(lang), { timeZone, weekday: "short" })
    .format(date)
    .replace(/\.$/, "")
    .toUpperCase();
}

/** "12 h 34" (fr) or "12h 34m" (en) for a duration in minutes. */
export function formatPanelDuration(totalMinutes: number, lang: PanelLang | undefined): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return lang === "en" ? `${h}h ${m.toString().padStart(2, "0")}m` : `${h} h ${m.toString().padStart(2, "0")}`;
}

const EN_WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const FR_WEEKDAYS = ["DIM", "LUN", "MAR", "MER", "JEU", "VEN", "SAM"];

/**
 * The 7-day module's weekday label. The source writes English three-letter
 * abbreviations ("MON"); English renders them as given, French as given too
 * (historical bytes) unless the caller opts into translation.
 */
export function localizeWeekdayLabel(label: string, lang: PanelLang | undefined): string {
  if (lang !== "en") return label;
  const fr = FR_WEEKDAYS.indexOf(label);
  return fr >= 0 ? (EN_WEEKDAYS[fr] ?? label) : label;
}

/** Shared occasion keyword detection for stylist + coordinator. */

export const OCCASION_KEYWORDS = [
  { id: "wedding", keys: ["wedding", "formal", "gala", "black tie", "ceremony", "boda", "mariage", "formel"] },
  { id: "funeral", keys: ["funeral", "memorial", "wake", "mourning", "bereavement", "entierro", "funérailles"] },
  { id: "dinner", keys: ["dinner", "date night", "first date", "evening", "restaurant", "cena", "dîner", "soirée", "rendez-vous"] },
  { id: "work", keys: ["work", "office", "meeting", "client", "interview", "job interview", "trabajo", "bureau", "réunion"] },
  { id: "travel", keys: ["travel", "airport", "trip", "flight", "viaje", "voyage", "avion"] },
  { id: "weekend", keys: ["weekend", "casual", "brunch", "weekend casual", "fin de semana", "week-end"] },
  { id: "event", keys: ["event", "party", "celebration", "cocktail", "evento", "fête"] },
  { id: "everyday", keys: ["everyday", "daily", "nothing fussy", "diario", "quotidien"] },
  { id: "street", keys: ["streetwear", "street", "urban", "hype", "sneaker", "urbano"] },
  { id: "active", keys: ["gym", "workout", "athletic", "run", "sport", "ejercicio", "sportif", "active"] },
  { id: "sexy", keys: ["sexy", "seductive", "club", "night out", "noche sexy", "soirée sexy"] },
];

export function detectOccasions(text) {
  const lower = (text || "").toLowerCase();
  const hits = [];
  for (const row of OCCASION_KEYWORDS) {
    if (row.keys.some((k) => {
      if (k.length <= 4) {
        return new RegExp(`(?:^|[^a-z])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^a-z]|$)`).test(lower);
      }
      return lower.includes(k);
    })) hits.push(row.id);
  }
  return hits;
}

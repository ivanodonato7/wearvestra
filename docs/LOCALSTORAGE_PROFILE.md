# LocalStorage → Supabase mapping

## Current device blob: `vestra.profile.v1`

```json
{
  "lang": "en",
  "stage": "app",
  "step": 0,
  "tab": "home",
  "profile": {
    "name": "Alex",
    "archetype": "Quiet Tailored",
    "fit": "Fitted & tailored",
    "lifestyle": "Office / client-facing",
    "palette": ["Navy", "Ivory / Cream", "Black", "Camel / Tan"],
    "avoid": [],
    "budget": "balanced",
    "occasions": ["Work", "Events & celebrations"],
    "favoriteStores": ["zara", "uniqlo", "nordstrom", "suitsupply"]
  },
  "answers": {
    "name": "",
    "lifestyle": null,
    "archetype": null,
    "fit": null,
    "palette": [],
    "avoid": [],
    "budget": null,
    "occasions": [],
    "sizes": {}
  },
  "savedOutfits": [
    {
      "id": "claude-…",
      "option": 1,
      "items": ["aw-…", "aw-…"],
      "whyThisWorks": "…",
      "rationale": "…",
      "styleFamily": "classy",
      "silhouette": "…"
    }
  ],
  "messages": []
}
```

## Tables

| localStorage | Supabase |
|--------------|----------|
| `profile.*` | `profiles` columns (`favorite_stores` = `favoriteStores`) |
| `answers`, `lang` | `profiles.answers` jsonb + `profiles.lang` |
| `savedOutfits[]` | `saved_outfits.outfit` jsonb rows |
| `messages`, `stage`, `tab`, `step` | stay on device for now |

Guest / Skip for testing → localStorage only.  
Signed in → localStorage cache + Supabase source of truth for Style DNA + saved outfits.

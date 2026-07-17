import React, { useState, useRef, useEffect, useId, createContext, useContext } from "react";
import { Home, MessageCircle, Bookmark, ShoppingBag, User, Send, RefreshCw, Check, Sparkles, ArrowLeft, ExternalLink } from "lucide-react";

// ==================== LANGUAGE / i18n ====================
// A real backend barely needs any of this — Claude already answers fluently
// in dozens of languages, so the AI side of localization is close to a
// one-line system-prompt change. What actually takes engineering work is
// translating the app's fixed UI text, which is what this section does.
const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
];

const UI = {
  en: {
    welcomeEyebrow: "Vestra", welcomeTitleLine1: "Let's get you", welcomeTitleLine2: "dressed properly.",
    welcomeSub: "A few quick questions, then meet your stylist.", getStarted: "Get Started", skipTesting: "Skip for testing → see the app",
    createAccountEyebrow: "Create Your Account", whereReachYouLine1: "Where should we", whereReachYouLine2: "reach you?",
    emailPlaceholder: "your@email.com", continueBtn: "Continue", signupNote: "This is a prototype — no account is actually created.",
    step0Title: "Let's get you dressed properly.", step0Prompt: "How would you describe your day-to-day?",
    step1Title: "Which of these feels most like you?", step1Prompt: "Pick the look that pulls you in first.",
    step2Title: "How do you like things to fit?", step2Prompt: "When you get dressed, you lean toward—",
    step3Title: "Let's talk color.", step3Prompt: "Which of these do you find yourself reaching for? Pick a few.",
    step4Title: "Every stylist should respect your budget.", step4Prompt: "For a typical piece, where are you most comfortable?",
    step5Title: "What do you find yourself dressing for most?", step5Prompt: "Select all that sound like you.",
    step6Title: "Last thing — just so we get the fit right.", step6Prompt: "You can skip this and add it later.",
    anyColorsAvoid: "Any colors to avoid?", colorsToAvoidLabel: "Colors to avoid",
    sizeTops: "Tops", sizeBottoms: "Bottoms", sizeShoes: "Shoes", sizePlaceholder: "e.g. M, 32, 10", finishBtn: "Finish",
    yourStyleDna: "Your Style DNA", gravitateToward: "You gravitate toward", piecesIn: "pieces in",
    dressWithIntentionFor: "and dress with intention for", everydayLife: "everyday life", consideredPalette: "a considered palette",
    oneMoreThing: "One More Thing", anythingHorizonLine1: "Anything on the", anythingHorizonLine2: "horizon?",
    occasionSub: "Tell us and we'll have a real outfit ready the moment you meet your stylist.",
    occasionPlaceholder: "e.g. wedding in June, semi-formal", meetYourStylist: "Meet Your Stylist", notSureYet: "Not sure yet — just exploring",
    chipWedding: "Wedding", chipWorkEvent: "Work event", chipDateNight: "Date night", chipWeekendTrip: "Weekend trip",
    goodEvening: "Good evening", styleDnaLabel: "Style DNA", silhouettesWord: "silhouettes", budgetWord: "budget",
    askYourStylist: "Ask your stylist", askPlaceholder: "Tell your stylist what you need…",
    chipDressWedding: "Dress me for a wedding", chipWorkDinner: "Work dinner tonight", chipWeekendCasual: "Weekend, nothing fussy",
    yourStylist: "Your Stylist", chatEmpty: "Tell me what you're dressing for — an occasion, a mood, anything.",
    composing: "Composing your outfit…", chatInputPlaceholder: "e.g. wedding in June, semi-formal",
    stylistSuggests: "Your Stylist Suggests", saveOutfit: "Save Outfit", savedLabel: "Saved",
    wardrobeTitle: "Wardrobe", wardrobeEmpty: "Outfits you save from your stylist will live here.",
    bagTitle: "Bag", bagEmpty: "Save an outfit to see its items here, grouped by retailer.", checkoutWith: "Checkout with",
    profileTitle: "Profile", styleArchetypeLabel: "Style Archetype", fitPreferenceLabel: "Fit Preference",
    paletteLabel: "Palette", budgetLabel: "Budget", dressesForLabel: "Dresses For",
    prototypeNote: "This is a click-through prototype — no real account exists yet.", languageLabel: "Language",
    navHome: "Home", navStylist: "Stylist", navWardrobe: "Wardrobe", navBag: "Bag", navProfile: "Profile",
    viewProduct: "View product page", swapItem: "Swap this item",
  },
  es: {
    welcomeEyebrow: "Vestra", welcomeTitleLine1: "Vamos a vestirte", welcomeTitleLine2: "como es debido.",
    welcomeSub: "Unas preguntas rápidas y luego conoces a tu estilista.", getStarted: "Empezar", skipTesting: "Saltar para probar → ver la app",
    createAccountEyebrow: "Crea tu cuenta", whereReachYouLine1: "¿Dónde podemos", whereReachYouLine2: "contactarte?",
    emailPlaceholder: "tu@email.com", continueBtn: "Continuar", signupNote: "Esto es un prototipo — no se crea ninguna cuenta real.",
    step0Title: "Vamos a vestirte como es debido.", step0Prompt: "¿Cómo describirías tu día a día?",
    step1Title: "¿Cuál de estos se parece más a ti?", step1Prompt: "Elige el look que más te atrae.",
    step2Title: "¿Cómo te gusta que te quede la ropa?", step2Prompt: "Cuando te vistes, prefieres—",
    step3Title: "Hablemos de color.", step3Prompt: "¿Cuáles sueles elegir? Marca varios.",
    step4Title: "Tu estilista debe respetar tu presupuesto.", step4Prompt: "Para una prenda típica, ¿dónde te sientes más cómodo/a?",
    step5Title: "¿Para qué sueles vestirte más?", step5Prompt: "Selecciona todo lo que te describa.",
    step6Title: "Última cosa — para que la talla sea correcta.", step6Prompt: "Puedes omitir esto y añadirlo después.",
    anyColorsAvoid: "¿Algún color que evitas?", colorsToAvoidLabel: "Colores a evitar",
    sizeTops: "Parte superior", sizeBottoms: "Parte inferior", sizeShoes: "Calzado", sizePlaceholder: "ej. M, 32, 10", finishBtn: "Finalizar",
    yourStyleDna: "Tu ADN de Estilo", gravitateToward: "Te inclinas por prendas", piecesIn: "en tonos",
    dressWithIntentionFor: "y te vistes con intención para", everydayLife: "la vida cotidiana", consideredPalette: "una paleta cuidada",
    oneMoreThing: "Una Cosa Más", anythingHorizonLine1: "¿Algo especial", anythingHorizonLine2: "próximamente?",
    occasionSub: "Cuéntanoslo y tendremos un look real listo en cuanto conozcas a tu estilista.",
    occasionPlaceholder: "ej. boda en junio, semi-formal", meetYourStylist: "Conoce a tu Estilista", notSureYet: "Aún no lo sé — solo estoy explorando",
    chipWedding: "Boda", chipWorkEvent: "Evento de trabajo", chipDateNight: "Cita", chipWeekendTrip: "Viaje de fin de semana",
    goodEvening: "Buenas tardes", styleDnaLabel: "ADN de Estilo", silhouettesWord: "siluetas", budgetWord: "presupuesto",
    askYourStylist: "Pregunta a tu estilista", askPlaceholder: "Dile a tu estilista qué necesitas…",
    chipDressWedding: "Vísteme para una boda", chipWorkDinner: "Cena de trabajo esta noche", chipWeekendCasual: "Fin de semana, sin complicaciones",
    yourStylist: "Tu Estilista", chatEmpty: "Cuéntame para qué te estás vistiendo — una ocasión, un estado de ánimo, lo que sea.",
    composing: "Componiendo tu look…", chatInputPlaceholder: "ej. boda en junio, semi-formal",
    stylistSuggests: "Tu Estilista Sugiere", saveOutfit: "Guardar Look", savedLabel: "Guardado",
    wardrobeTitle: "Armario", wardrobeEmpty: "Los looks que guardes de tu estilista aparecerán aquí.",
    bagTitle: "Bolsa", bagEmpty: "Guarda un look para ver sus prendas aquí, agrupadas por tienda.", checkoutWith: "Comprar en",
    profileTitle: "Perfil", styleArchetypeLabel: "Arquetipo de Estilo", fitPreferenceLabel: "Preferencia de Ajuste",
    paletteLabel: "Paleta", budgetLabel: "Presupuesto", dressesForLabel: "Se Viste Para",
    prototypeNote: "Esto es un prototipo interactivo — aún no existe ninguna cuenta real.", languageLabel: "Idioma",
    navHome: "Inicio", navStylist: "Estilista", navWardrobe: "Armario", navBag: "Bolsa", navProfile: "Perfil",
    viewProduct: "Ver página del producto", swapItem: "Cambiar esta prenda",
  },
  fr: {
    welcomeEyebrow: "Vestra", welcomeTitleLine1: "Habillons-vous", welcomeTitleLine2: "comme il se doit.",
    welcomeSub: "Quelques questions rapides, puis rencontrez votre styliste.", getStarted: "Commencer", skipTesting: "Passer pour tester → voir l'app",
    createAccountEyebrow: "Créez votre compte", whereReachYouLine1: "Où pouvons-nous", whereReachYouLine2: "vous joindre ?",
    emailPlaceholder: "votre@email.com", continueBtn: "Continuer", signupNote: "Ceci est un prototype — aucun compte n'est réellement créé.",
    step0Title: "Habillons-vous comme il se doit.", step0Prompt: "Comment décririez-vous votre quotidien ?",
    step1Title: "Lequel vous ressemble le plus ?", step1Prompt: "Choisissez le style qui vous attire en premier.",
    step2Title: "Comment aimez-vous que ça tombe ?", step2Prompt: "Quand vous vous habillez, vous préférez—",
    step3Title: "Parlons couleur.", step3Prompt: "Lesquelles portez-vous le plus souvent ? Choisissez-en plusieurs.",
    step4Title: "Votre styliste doit respecter votre budget.", step4Prompt: "Pour une pièce typique, où êtes-vous le plus à l'aise ?",
    step5Title: "Pour quoi vous habillez-vous le plus souvent ?", step5Prompt: "Sélectionnez tout ce qui vous correspond.",
    step6Title: "Dernière chose — pour bien ajuster la taille.", step6Prompt: "Vous pouvez passer cette étape et l'ajouter plus tard.",
    anyColorsAvoid: "Des couleurs à éviter ?", colorsToAvoidLabel: "Couleurs à éviter",
    sizeTops: "Hauts", sizeBottoms: "Bas", sizeShoes: "Chaussures", sizePlaceholder: "ex. M, 32, 10", finishBtn: "Terminer",
    yourStyleDna: "Votre ADN Style", gravitateToward: "Vous privilégiez des pièces", piecesIn: "dans les tons",
    dressWithIntentionFor: "et vous habillez avec intention pour", everydayLife: "le quotidien", consideredPalette: "une palette réfléchie",
    oneMoreThing: "Encore Une Chose", anythingHorizonLine1: "Quelque chose", anythingHorizonLine2: "à l'horizon ?",
    occasionSub: "Dites-le-nous et une vraie tenue sera prête dès que vous rencontrerez votre styliste.",
    occasionPlaceholder: "ex. mariage en juin, semi-habillé", meetYourStylist: "Rencontrer Votre Styliste", notSureYet: "Pas encore sûr — j'explore seulement",
    chipWedding: "Mariage", chipWorkEvent: "Événement professionnel", chipDateNight: "Rendez-vous", chipWeekendTrip: "Week-end",
    goodEvening: "Bonsoir", styleDnaLabel: "ADN Style", silhouettesWord: "silhouettes", budgetWord: "budget",
    askYourStylist: "Demandez à votre styliste", askPlaceholder: "Dites à votre styliste ce dont vous avez besoin…",
    chipDressWedding: "Habillez-moi pour un mariage", chipWorkDinner: "Dîner professionnel ce soir", chipWeekendCasual: "Week-end, sans prise de tête",
    yourStylist: "Votre Styliste", chatEmpty: "Dites-moi pour quoi vous vous habillez — une occasion, une humeur, n'importe quoi.",
    composing: "Composition de votre tenue…", chatInputPlaceholder: "ex. mariage en juin, semi-habillé",
    stylistSuggests: "Votre Styliste Suggère", saveOutfit: "Enregistrer la Tenue", savedLabel: "Enregistré",
    wardrobeTitle: "Garde-robe", wardrobeEmpty: "Les tenues que vous enregistrez apparaîtront ici.",
    bagTitle: "Panier", bagEmpty: "Enregistrez une tenue pour voir ses articles ici, regroupés par enseigne.", checkoutWith: "Payer chez",
    profileTitle: "Profil", styleArchetypeLabel: "Archétype de Style", fitPreferenceLabel: "Préférence de Coupe",
    paletteLabel: "Palette", budgetLabel: "Budget", dressesForLabel: "S'habille Pour",
    prototypeNote: "Ceci est un prototype interactif — aucun compte réel n'existe encore.", languageLabel: "Langue",
    navHome: "Accueil", navStylist: "Styliste", navWardrobe: "Garde-robe", navBag: "Panier", navProfile: "Profil",
    viewProduct: "Voir la fiche produit", swapItem: "Changer cet article",
  },
};

const OPTIONS_I18N = {
  es: {
    "Office / client-facing": "Oficina / cara al cliente", "Creative or flexible workplace": "Trabajo creativo o flexible",
    "Remote, mostly at home": "Remoto, mayormente en casa", "On the move — travel, events, varied": "En movimiento — viajes, eventos, variado",
    "Student life": "Vida de estudiante",
    "Quiet & Tailored": "Discreto y Sastre", "Relaxed & Considered": "Relajado y Cuidado", "Modern & Sharp": "Moderno y Definido",
    "Warm & Layered": "Cálido y en Capas", "Classic & Polished": "Clásico y Pulido", "Minimal & Directional": "Minimalista y Vanguardista",
    "Romantic & Soft": "Romántico y Suave", "Bold & Expressive": "Audaz y Expresivo",
    "Quiet Tailored": "Discreto Sastre", "Relaxed Considered": "Relajado Cuidado", "Modern Sharp": "Moderno Definido",
    "Warm Layered": "Cálido en Capas", "Classic Polished": "Clásico Pulido", "Minimal Directional": "Minimalista Vanguardista",
    "Romantic Soft": "Romántico Suave", "Bold Expressive": "Audaz Expresivo",
    "Fitted & tailored": "Ajustado y entallado", "True to size, structured": "Talla exacta, estructurado",
    "Relaxed, room to move": "Relajado, con movimiento", "Oversized, intentionally loose": "Oversize, holgado a propósito",
    "Black": "Negro", "Ivory / Cream": "Marfil / Crema", "Grey / Charcoal": "Gris / Antracita", "Camel / Tan": "Camel / Canela",
    "Olive": "Oliva", "Navy": "Azul Marino", "Burgundy": "Burdeos", "Forest Green": "Verde Bosque", "Sand / Beige": "Arena / Beige",
    "Rust / Terracotta": "Óxido / Terracota", "Blush / Dusty Pink": "Rosa Empolvado", "Bold Color": "Color Atrevido",
    "Considered": "Cuidado", "Balanced": "Equilibrado", "Elevated": "Elevado", "Show me a mix": "Muéstrame una mezcla",
    "Value-driven, quality basics": "Prendas básicas de calidad, buen precio", "Mid-range, invest in key pieces": "Gama media, invertir en piezas clave",
    "Premium fabrics & craftsmanship": "Telas y confección premium", "I'll decide per piece": "Decido según la prenda",
    "Work": "Trabajo", "Date nights": "Citas", "Travel": "Viajes", "Events & celebrations": "Eventos y celebraciones",
    "Everyday, just want to feel put together": "Diario, solo quiero verme arreglado/a",
  },
  fr: {
    "Office / client-facing": "Bureau / relation client", "Creative or flexible workplace": "Travail créatif ou flexible",
    "Remote, mostly at home": "Télétravail, surtout à la maison", "On the move — travel, events, varied": "En mouvement — voyages, événements, varié",
    "Student life": "Vie étudiante",
    "Quiet & Tailored": "Discret et Tailleur", "Relaxed & Considered": "Détendu et Réfléchi", "Modern & Sharp": "Moderne et Affûté",
    "Warm & Layered": "Chaleureux et Superposé", "Classic & Polished": "Classique et Soigné", "Minimal & Directional": "Minimaliste et Avant-gardiste",
    "Romantic & Soft": "Romantique et Doux", "Bold & Expressive": "Audacieux et Expressif",
    "Quiet Tailored": "Discret Tailleur", "Relaxed Considered": "Détendu Réfléchi", "Modern Sharp": "Moderne Affûté",
    "Warm Layered": "Chaleureux Superposé", "Classic Polished": "Classique Soigné", "Minimal Directional": "Minimaliste Avant-gardiste",
    "Romantic Soft": "Romantique Doux", "Bold Expressive": "Audacieux Expressif",
    "Fitted & tailored": "Ajusté et cintré", "True to size, structured": "Taille normale, structuré",
    "Relaxed, room to move": "Décontracté, ample", "Oversized, intentionally loose": "Oversize, volontairement ample",
    "Black": "Noir", "Ivory / Cream": "Ivoire / Crème", "Grey / Charcoal": "Gris / Anthracite", "Camel / Tan": "Camel / Fauve",
    "Olive": "Olive", "Navy": "Bleu Marine", "Burgundy": "Bordeaux", "Forest Green": "Vert Forêt", "Sand / Beige": "Sable / Beige",
    "Rust / Terracotta": "Rouille / Terre Cuite", "Blush / Dusty Pink": "Rose Poudré", "Bold Color": "Couleur Audacieuse",
    "Considered": "Réfléchi", "Balanced": "Équilibré", "Elevated": "Élevé", "Show me a mix": "Montrez-moi un mélange",
    "Value-driven, quality basics": "Basiques de qualité, bon rapport qualité-prix", "Mid-range, invest in key pieces": "Milieu de gamme, investir dans des pièces clés",
    "Premium fabrics & craftsmanship": "Tissus et confection haut de gamme", "I'll decide per piece": "Je décide au cas par cas",
    "Work": "Travail", "Date nights": "Rendez-vous amoureux", "Travel": "Voyages", "Events & celebrations": "Événements et célébrations",
    "Everyday, just want to feel put together": "Quotidien, je veux juste être bien mis",
  },
};

const BUDGET_DESCRIPTOR = {
  en: { considered: "Considered Minimalist", balanced: "Balanced Investor", elevated: "Elevated Collector", mixed: "Adaptive Dresser" },
  es: { considered: "Minimalista Cuidado", balanced: "Inversor Equilibrado", elevated: "Coleccionista Elevado", mixed: "Vestidor Adaptable" },
  fr: { considered: "Minimaliste Réfléchi", balanced: "Investisseur Équilibré", elevated: "Collectionneur Élevé", mixed: "Habilleur Adaptable" },
};
const FIT_PHRASE = {
  en: { "Fitted & tailored": "fitted, tailored", "True to size, structured": "structured, true-to-size", "Relaxed, room to move": "relaxed", "Oversized, intentionally loose": "oversized" },
  es: { "Fitted & tailored": "ajustadas y entalladas", "True to size, structured": "estructuradas, de talla exacta", "Relaxed, room to move": "relajadas", "Oversized, intentionally loose": "oversize" },
  fr: { "Fitted & tailored": "ajustées et cintrées", "True to size, structured": "structurées, taille normale", "Relaxed, room to move": "décontractées", "Oversized, intentionally loose": "oversize" },
};
const FIT_SHORT = {
  en: { "Fitted & tailored": "Fitted", "True to size, structured": "Structured", "Relaxed, room to move": "Relaxed", "Oversized, intentionally loose": "Oversized" },
  es: { "Fitted & tailored": "Ajustado", "True to size, structured": "Estructurado", "Relaxed, room to move": "Relajado", "Oversized, intentionally loose": "Oversize" },
  fr: { "Fitted & tailored": "Ajusté", "True to size, structured": "Structuré", "Relaxed, room to move": "Décontracté", "Oversized, intentionally loose": "Oversize" },
};
const PRODUCT_NAMES_I18N = {
  es: {
    p1: "Blazer Sastre de Mezcla de Lana", p1b: "Blazer de Lino sin Estructura", p2: "Camisa de Algodón Impecable",
    p2b: "Cuello Alto de Merino Fino", p3: "Pantalón Recto Sastre", p3b: "Pantalón de Lana de Pierna Ancha",
    p4: "Zapato Derby de Piel", p4b: "Botín Chelsea de Ante", p5: "Bufanda de Lana Fina", p5b: "Pañuelo de Bolsillo de Cachemira",
  },
  fr: {
    p1: "Blazer Cintré en Mélange de Laine", p1b: "Blazer en Lin Déstructuré", p2: "Chemise en Coton Impeccable",
    p2b: "Col Roulé en Mérinos Fin", p3: "Pantalon Droit Tailleur", p3b: "Pantalon en Laine Large",
    p4: "Chaussure Derby en Cuir", p4b: "Boot Chelsea en Daim", p5: "Écharpe en Laine Fine", p5b: "Pochette en Cachemire",
  },
};
const RATIONALES_I18N = {
  es: [
    "Un blazer sastre en oliva mantiene el look cálido y con los pies en la tierra, sin resultar rígido — perfecto para un momento semi-formal al aire libre. La camisa marfil lo eleva, y el zapato derby se mantiene clásico sin parecer disfraz.",
    "Elegante, sin rigidez — el mismo pantalón sastre da base al look, mientras la camisa impecable sola (sin blazer) lo hace fácil para una cena. Añade la bufanda si hace fresco.",
    "Un look diario, discreto y cuidado, construido alrededor de tu paleta — líneas limpias, nada que grite por atención, fácil de llevar de verdad.",
  ],
  fr: [
    "Un blazer tailleur olive garde cette tenue chaleureuse et ancrée plutôt que rigide — idéal pour un moment semi-habillé en extérieur. La chemise ivoire l'élève, et la chaussure derby reste classique sans donner l'impression d'un déguisement.",
    "Chic, sans rigidité — le même pantalon tailleur ancre la tenue, tandis que la chemise seule (sans veste) la rend facile pour un dîner. Ajoutez l'écharpe s'il fait frais.",
    "Une tenue quotidienne discrète et réfléchie, construite autour de votre palette — des lignes nettes, rien qui attire l'attention, facile à porter au quotidien.",
  ],
};
const GREETINGS = {
  en: {
    withOccasion: (a) => `I've got a good sense of your style already — ${a}. Let's start with what you told me.`,
    without: (a) => `I've got a good sense of your style already — ${a}. Tell me what you're dressing for, and let's start.`,
  },
  es: {
    withOccasion: (a) => `Ya tengo una buena idea de tu estilo — ${a}. Empecemos con lo que me contaste.`,
    without: (a) => `Ya tengo una buena idea de tu estilo — ${a}. Dime para qué te vas a vestir y empecemos.`,
  },
  fr: {
    withOccasion: (a) => `J'ai déjà une bonne idée de votre style — ${a}. Commençons avec ce que vous m'avez dit.`,
    without: (a) => `J'ai déjà une bonne idée de votre style — ${a}. Dites-moi pour quoi vous vous habillez, et commençons.`,
  },
};

const LangContext = createContext({ lang: "en", setLang: () => {}, t: (k) => k, tOpt: (v) => v, tName: (item) => item.name });
function useLang() { return useContext(LangContext); }

function LanguageSwitcher({ corner }) {
  const { lang, setLang } = useLang();
  return (
    <div className={`lang-switcher ${corner ? "lang-switcher-corner" : ""}`}>
      {LANGUAGES.map((l) => (
        <button key={l.code} className={`lang-pill ${lang === l.code ? "active" : ""}`} onClick={() => setLang(l.code)}>{l.code.toUpperCase()}</button>
      ))}
    </div>
  );
}

// ---------- Garment render (photographic-feeling product illustration) ----------
// Real product photos in the live app come straight from each retailer's own
// feed (see Product.imageUrl in the database schema) — this prototype can't
// legally borrow real photos from real brands for made-up products, so this
// renders an original, shaded illustration in the item's actual color instead.
function lighten(hex, amt) {
  const num = parseInt(hex.replace("#", ""), 16);
  let r = (num >> 16) + amt, g = ((num >> 8) & 0x00ff) + amt, b = (num & 0x0000ff) + amt;
  r = Math.min(255, Math.max(0, r)); g = Math.min(255, Math.max(0, g)); b = Math.min(255, Math.max(0, b));
  return "#" + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
}

function GarmentPhoto({ type, color = "#3E4228" }) {
  const uid = useId().replace(/:/g, "");
  const light = lighten(color, 55);
  const dark = lighten(color, -35);
  const gradId = `grad-${type}-${uid}`;

  const bodies = {
    blazer: (
      <g>
        <path d="M22 10 L44 3 L60 14 L76 3 L98 10 L104 30 L88 35 L84 92 L36 92 L32 35 L16 30 Z" fill={`url(#${gradId})`} stroke={dark} strokeWidth="1.2" />
        <path d="M44 3 L54 26 L60 14 Z M76 3 L66 26 L60 14 Z" fill={dark} opacity="0.18" />
        <circle cx="60" cy="52" r="2" fill={dark} opacity="0.5" /><circle cx="60" cy="64" r="2" fill={dark} opacity="0.5" />
        <path d="M36 40 Q60 46 84 40" stroke={dark} strokeWidth="0.8" opacity="0.3" fill="none" />
      </g>
    ),
    shirt: (
      <g>
        <path d="M34 4 H86 L94 14 L78 20 L78 92 H42 L42 20 L26 14 Z" fill={`url(#${gradId})`} stroke={dark} strokeWidth="1.2" />
        <path d="M34 4 L60 18 L86 4" stroke={dark} strokeWidth="1" opacity="0.35" fill="none" />
        <line x1="60" y1="20" x2="60" y2="90" stroke={dark} strokeWidth="0.8" opacity="0.3" />
        <circle cx="60" cy="34" r="1.6" fill={dark} opacity="0.5" /><circle cx="60" cy="50" r="1.6" fill={dark} opacity="0.5" /><circle cx="60" cy="66" r="1.6" fill={dark} opacity="0.5" />
      </g>
    ),
    trouser: (
      <g>
        <path d="M26 3 H66 L68 92 H50 L46 30 L42 92 H28 Z" fill={`url(#${gradId})`} stroke={dark} strokeWidth="1.2" />
        <rect x="26" y="3" width="40" height="7" rx="1" fill={dark} opacity="0.22" />
        <line x1="46" y1="14" x2="46" y2="86" stroke={dark} strokeWidth="0.7" opacity="0.28" />
      </g>
    ),
    shoe: (
      <g>
        <path d="M8 58 H20 L28 36 Q40 26 62 32 L92 44 Q100 48 100 58 L100 66 H8 Z" fill={`url(#${gradId})`} stroke={dark} strokeWidth="1.2" />
        <path d="M8 66 H100 L96 72 H12 Z" fill={dark} opacity="0.35" />
        <path d="M28 36 Q40 26 62 32" stroke={dark} strokeWidth="0.8" opacity="0.4" fill="none" />
        <line x1="45" y1="38" x2="55" y2="30" stroke={dark} strokeWidth="0.8" opacity="0.4" />
      </g>
    ),
    scarf: (
      <g>
        <path d="M10 18 Q60 2 110 18 L110 32 Q60 20 10 32 Z" fill={`url(#${gradId})`} stroke={dark} strokeWidth="1.2" />
        <path d="M14 32 L10 44 M22 33 L19 46 M98 33 L101 46 M106 32 L110 44" stroke={dark} strokeWidth="1" opacity="0.4" />
      </g>
    ),
  };

  return (
    <svg viewBox="0 0 118 96" width="100%" height="100%">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={light} />
          <stop offset="100%" stopColor={color} />
        </linearGradient>
      </defs>
      {bodies[type]}
    </svg>
  );
}

// ---------- Product catalog (mirrors the seed data in the real backend) ----------
const CATALOG = {
  blazer: { id: "p1", name: "Wool-Blend Tailored Blazer", price: 320, retailer: "Considered Studio", type: "blazer", color: "#3E4228", productUrl: "https://example.com/considered-studio/products/wool-blend-tailored-blazer" },
  blazerAlt: { id: "p1b", name: "Unstructured Linen Blazer", price: 265, retailer: "North & Field", type: "blazer", color: "#cbb994", productUrl: "https://example.com/north-and-field/products/unstructured-linen-blazer" },
  shirt: { id: "p2", name: "Crisp Cotton Shirt", price: 95, retailer: "Considered Studio", type: "shirt", color: "#F5F2E9", productUrl: "https://example.com/considered-studio/products/crisp-cotton-shirt" },
  shirtAlt: { id: "p2b", name: "Fine Merino Turtleneck", price: 110, retailer: "North & Field", type: "shirt", color: "#4a4a48", productUrl: "https://example.com/north-and-field/products/fine-merino-turtleneck" },
  trouser: { id: "p3", name: "Tailored Straight Trouser", price: 140, retailer: "Considered Studio", type: "trouser", color: "#3E4228", productUrl: "https://example.com/considered-studio/products/tailored-straight-trouser" },
  trouserAlt: { id: "p3b", name: "Wide-Leg Wool Trouser", price: 165, retailer: "Considered Studio", type: "trouser", color: "#6b6b63", productUrl: "https://example.com/considered-studio/products/wide-leg-wool-trouser" },
  shoe: { id: "p4", name: "Leather Derby Shoe", price: 210, retailer: "Aldern & Co.", type: "shoe", color: "#6b3f22", productUrl: "https://example.com/aldern-and-co/products/leather-derby-shoe" },
  shoeAlt: { id: "p4b", name: "Suede Chelsea Boot", price: 245, retailer: "Aldern & Co.", type: "shoe", color: "#4a3527", productUrl: "https://example.com/aldern-and-co/products/suede-chelsea-boot" },
  scarf: { id: "p5", name: "Fine Wool Scarf", price: 85, retailer: "North & Field", type: "scarf", color: "#b08a5c", productUrl: "https://example.com/north-and-field/products/fine-wool-scarf" },
  scarfAlt: { id: "p5b", name: "Cashmere Pocket Square", price: 65, retailer: "Aldern & Co.", type: "scarf", color: "#C6A567", productUrl: "https://example.com/aldern-and-co/products/cashmere-pocket-square" },
};
const RETAILER_SITES = {
  "Considered Studio": "https://example.com/considered-studio",
  "North & Field": "https://example.com/north-and-field",
  "Aldern & Co.": "https://example.com/aldern-and-co",
};
const ALT_MAP = { blazer: "blazerAlt", shirt: "shirtAlt", trouser: "trouserAlt", shoe: "shoeAlt", scarf: "scarfAlt" };

const OUTFIT_TEMPLATES = [
  {
    keywords: ["wedding", "formal", "event"],
    rationale: "A tailored olive blazer keeps this warm and grounded rather than stiff — right for an outdoor, semi-formal moment. The ivory shirt lifts it, and the derby shoe stays classic without reading costume-y.",
    items: ["blazer", "shirt", "trouser", "shoe"],
  },
  {
    keywords: ["dinner", "date", "work"],
    rationale: "Smart, not stiff — the same tailored trouser grounds the look, while the crisp shirt alone (no jacket) keeps it easy for a dinner setting. Add the scarf if the room runs cool.",
    items: ["shirt", "trouser", "shoe", "scarf"],
  },
  {
    keywords: [],
    rationale: "A quiet, considered everyday look built around your palette — clean lines, nothing shouting for attention, easy to actually live in.",
    items: ["shirt", "trouser", "shoe"],
  },
];

function pickOutfitIndex(text) {
  const lower = text.toLowerCase();
  const idx = OUTFIT_TEMPLATES.findIndex((t) => t.keywords.some((k) => lower.includes(k)));
  return idx === -1 ? OUTFIT_TEMPLATES.length - 1 : idx;
}

// ==================== ONBOARDING DATA ====================
const LIFESTYLE_OPTIONS = ["Office / client-facing", "Creative or flexible workplace", "Remote, mostly at home", "On the move — travel, events, varied", "Student life"];
const ARCHETYPE_OPTIONS = ["Quiet & Tailored", "Relaxed & Considered", "Modern & Sharp", "Warm & Layered", "Classic & Polished", "Minimal & Directional", "Romantic & Soft", "Bold & Expressive"];
const FIT_OPTIONS = ["Fitted & tailored", "True to size, structured", "Relaxed, room to move", "Oversized, intentionally loose"];
const COLOR_OPTIONS = [
  { label: "Black", hex: "#161616" },
  { label: "Ivory / Cream", hex: "#F6F1E7" },
  { label: "Grey / Charcoal", hex: "#4a4a48" },
  { label: "Camel / Tan", hex: "#b08a5c" },
  { label: "Olive", hex: "#3E4228" },
  { label: "Navy", hex: "#1f2a44" },
  { label: "Burgundy", hex: "#5c1f2e" },
  { label: "Forest Green", hex: "#22432f" },
  { label: "Sand / Beige", hex: "#d8c9a9" },
  { label: "Rust / Terracotta", hex: "#a85832" },
  { label: "Blush / Dusty Pink", hex: "#d9a9a0" },
  { label: "Bold Color", hex: "#C6A567" },
];
const BUDGET_OPTIONS = [
  { key: "considered", label: "Considered", sub: "Value-driven, quality basics" },
  { key: "balanced", label: "Balanced", sub: "Mid-range, invest in key pieces" },
  { key: "elevated", label: "Elevated", sub: "Premium fabrics & craftsmanship" },
  { key: "mixed", label: "Show me a mix", sub: "I'll decide per piece" },
];
const OCCASION_OPTIONS = ["Work", "Date nights", "Travel", "Events & celebrations", "Everyday, just want to feel put together"];

const STEPS = [
  { id: "lifestyle", titleKey: "step0Title", promptKey: "step0Prompt", type: "single", options: LIFESTYLE_OPTIONS },
  { id: "archetype", titleKey: "step1Title", promptKey: "step1Prompt", type: "single", options: ARCHETYPE_OPTIONS },
  { id: "fit", titleKey: "step2Title", promptKey: "step2Prompt", type: "single", options: FIT_OPTIONS },
  { id: "palette", titleKey: "step3Title", promptKey: "step3Prompt", type: "palette", options: COLOR_OPTIONS },
  { id: "budget", titleKey: "step4Title", promptKey: "step4Prompt", type: "budget", options: BUDGET_OPTIONS },
  { id: "occasions", titleKey: "step5Title", promptKey: "step5Prompt", type: "multi", options: OCCASION_OPTIONS },
  { id: "sizes", titleKey: "step6Title", promptKey: "step6Prompt", type: "sizes" },
];

const DEFAULT_PROFILE = {
  archetype: "Quiet Tailored",
  fit: "Fitted & tailored",
  palette: ["Olive", "Ivory / Cream", "Black", "Camel / Tan"],
  budget: "balanced",
  occasions: ["Work", "Events & celebrations"],
};

// ==================== ONBOARDING SCREENS ====================
function WelcomeScreen({ onStart, onSkip }) {
  const { t } = useLang();
  return (
    <div className="onb-screen onb-center">
      <LanguageSwitcher corner />
      <div className="onb-eyebrow">{t("welcomeEyebrow")}</div>
      <h1 className="onb-hero-title">{t("welcomeTitleLine1")}<br />{t("welcomeTitleLine2")}</h1>
      <p className="onb-hero-sub">{t("welcomeSub")}</p>
      <button className="onb-primary-btn" onClick={onStart}>{t("getStarted")}</button>
      <button className="onb-skip-link" onClick={onSkip}>{t("skipTesting")}</button>
    </div>
  );
}

function SignupScreen({ onContinue, onBack }) {
  const { t } = useLang();
  const [email, setEmail] = useState("");
  return (
    <div className="onb-screen">
      <button className="onb-back" onClick={onBack}><ArrowLeft size={16} /></button>
      <div className="onb-center" style={{ marginTop: 60 }}>
        <div className="onb-eyebrow">{t("createAccountEyebrow")}</div>
        <h2 className="onb-title">{t("whereReachYouLine1")}<br />{t("whereReachYouLine2")}</h2>
        <input
          className="onb-input"
          type="email"
          placeholder={t("emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button className="onb-primary-btn" onClick={onContinue} style={{ marginTop: 20 }}>{t("continueBtn")}</button>
        <p className="onb-fine-print">{t("signupNote")}</p>
      </div>
    </div>
  );
}

function OnboardingScreen({ step, totalSteps, question, answers, setAnswers, onNext, onBack }) {
  const { t, tOpt } = useLang();
  const [showAvoid, setShowAvoid] = useState(false);

  function selectSingle(value) {
    setAnswers((a) => ({ ...a, [question.id]: value }));
  }
  function toggleMulti(value) {
    setAnswers((a) => {
      const current = a[question.id] || [];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      return { ...a, [question.id]: next };
    });
  }
  function toggleAvoid(value) {
    setAnswers((a) => {
      const current = a.avoid || [];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      return { ...a, avoid: next };
    });
  }
  function setSize(field, value) {
    setAnswers((a) => ({ ...a, sizes: { ...a.sizes, [field]: value } }));
  }

  const canContinue =
    question.type === "sizes"
      ? true
      : question.type === "single" || question.type === "budget"
      ? !!answers[question.id]
      : (answers[question.id] || []).length > 0;

  return (
    <div className="onb-screen">
      <div className="onb-progress-row">
        <button className="onb-back" onClick={onBack}><ArrowLeft size={16} /></button>
        <div className="onb-progress-track"><div className="onb-progress-fill" style={{ width: `${((step + 1) / totalSteps) * 100}%` }} /></div>
      </div>

      <div className="onb-body">
        <h2 className="onb-question-title">{t(question.titleKey)}</h2>
        <p className="onb-question-prompt">{t(question.promptKey)}</p>

        {question.type === "single" && (
          <div className="onb-card-grid">
            {question.options.map((opt) => (
              <button key={opt} className={`onb-option-card ${answers[question.id] === opt ? "selected" : ""}`} onClick={() => selectSingle(opt)}>
                {tOpt(opt)}
              </button>
            ))}
          </div>
        )}

        {question.type === "multi" && (
          <div className="onb-card-grid">
            {question.options.map((opt) => (
              <button key={opt} className={`onb-option-card ${(answers[question.id] || []).includes(opt) ? "selected" : ""}`} onClick={() => toggleMulti(opt)}>
                {tOpt(opt)}
              </button>
            ))}
          </div>
        )}

        {question.type === "budget" && (
          <div className="onb-budget-list">
            {question.options.map((opt) => (
              <button key={opt.key} className={`onb-budget-card ${answers.budget === opt.key ? "selected" : ""}`} onClick={() => selectSingle(opt.key)}>
                <div className="onb-budget-label">{tOpt(opt.label)}</div>
                <div className="onb-budget-sub">{tOpt(opt.sub)}</div>
              </button>
            ))}
          </div>
        )}

        {question.type === "palette" && (
          <>
            <div className="onb-swatch-grid">
              {question.options.map((c) => (
                <button key={c.label} className={`onb-swatch-card ${(answers.palette || []).includes(c.label) ? "selected" : ""}`} onClick={() => toggleMulti(c.label)}>
                  <span className="onb-swatch-dot" style={{ background: c.hex }} />
                  <span className="onb-swatch-label">{tOpt(c.label)}</span>
                </button>
              ))}
            </div>
            {!showAvoid ? (
              <button className="onb-link" onClick={() => setShowAvoid(true)}>{t("anyColorsAvoid")}</button>
            ) : (
              <>
                <div className="onb-mini-label">{t("colorsToAvoidLabel")}</div>
                <div className="onb-swatch-grid">
                  {question.options.map((c) => (
                    <button key={c.label} className={`onb-swatch-card avoid ${(answers.avoid || []).includes(c.label) ? "selected" : ""}`} onClick={() => toggleAvoid(c.label)}>
                      <span className="onb-swatch-dot" style={{ background: c.hex }} />
                      <span className="onb-swatch-label">{tOpt(c.label)}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {question.type === "sizes" && (
          <div className="onb-sizes">
            {[["tops", "sizeTops"], ["bottoms", "sizeBottoms"], ["shoes", "sizeShoes"]].map(([field, labelKey]) => (
              <div key={field} className="onb-size-row">
                <label className="onb-size-label">{t(labelKey)}</label>
                <input
                  className="onb-size-input"
                  placeholder={t("sizePlaceholder")}
                  value={(answers.sizes && answers.sizes[field]) || ""}
                  onChange={(e) => setSize(field, e.target.value)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <button className="onb-primary-btn onb-continue" onClick={onNext} disabled={!canContinue}>
        {question.type === "sizes" ? t("finishBtn") : t("continueBtn")}
      </button>
    </div>
  );
}

function RevealScreen({ answers, onContinue }) {
  const { lang, t, tOpt } = useLang();
  const archetypeShortEn = answers.archetype.replace(" & ", " ");
  const archetypeShort = tOpt(archetypeShortEn);
  const descriptor = (BUDGET_DESCRIPTOR[lang] && BUDGET_DESCRIPTOR[lang][answers.budget]) || BUDGET_DESCRIPTOR.en[answers.budget] || "";
  const fitPhrase = (FIT_PHRASE[lang] && FIT_PHRASE[lang][answers.fit]) || FIT_PHRASE.en[answers.fit] || answers.fit;
  const colorList = (answers.palette || []).slice(0, 3).map(tOpt).join(", ");
  const occasionPhrase = (answers.occasions || []).length ? answers.occasions.map(tOpt).join(", ") : t("everydayLife");

  return (
    <div className="onb-screen onb-center">
      <div className="onb-eyebrow">{t("yourStyleDna")}</div>
      <h1 className="reveal-title">{archetypeShort}<br /><span className="reveal-gold">{descriptor}</span></h1>
      <p className="reveal-summary">
        {t("gravitateToward")} {fitPhrase} {t("piecesIn")} {colorList || t("consideredPalette")}, {t("dressWithIntentionFor")} {occasionPhrase}.
      </p>
      <button className="onb-primary-btn" onClick={onContinue}>{t("continueBtn")}</button>
    </div>
  );
}

function OccasionScreen({ onSubmit, onSkip }) {
  const { t } = useLang();
  const [text, setText] = useState("");
  const chipKeys = ["chipWedding", "chipWorkEvent", "chipDateNight", "chipWeekendTrip"];

  return (
    <div className="onb-screen onb-center">
      <div className="onb-eyebrow">{t("oneMoreThing")}</div>
      <h2 className="onb-title">{t("anythingHorizonLine1")}<br />{t("anythingHorizonLine2")}</h2>
      <p className="onb-hero-sub" style={{ marginBottom: 24 }}>{t("occasionSub")}</p>
      <form
        style={{ width: "100%", maxWidth: 280 }}
        onSubmit={(e) => { e.preventDefault(); if (text.trim()) onSubmit(text); }}
      >
        <input
          className="onb-input"
          style={{ maxWidth: "none", marginBottom: 12 }}
          placeholder={t("occasionPlaceholder")}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </form>
      <div className="chip-row" style={{ justifyContent: "center", marginBottom: 24 }}>
        {chipKeys.map((k) => <button key={k} className="chip" onClick={() => onSubmit(t(k))}>{t(k)}</button>)}
      </div>
      <button className="onb-primary-btn" onClick={() => text.trim() ? onSubmit(text) : onSkip()}>
        {text.trim() ? t("continueBtn") : t("meetYourStylist")}
      </button>
      {!text.trim() && <button className="onb-skip-link" onClick={onSkip}>{t("notSureYet")}</button>}
    </div>
  );
}

// ==================== CROQUIS FIGURE ====================
// A stylized fashion-sketch figure wearing the outfit's real colors —
// not a photo or a likeness of the actual user. Real photo-based try-on
// was deliberately left out of V1: it needs specialized, expensive AI
// image generation, is inconsistent in quality, and raises real privacy
// questions about handling users' body photos. This gets most of the
// visual payoff without any of that.
function CroquisFigure({ items }) {
  const byType = {};
  items.forEach((it) => { byType[it.type] = it; });
  const topColor = (byType.shirt || {}).color || "#F5F2E9";
  const bottomColor = (byType.trouser || {}).color || "#e6e0d2";
  const shoeColor = (byType.shoe || {}).color || "#4a3527";
  const outerColor = byType.blazer ? byType.blazer.color : null;
  const accessoryColor = byType.scarf ? byType.scarf.color : null;
  const skin = "#e8dbc8";
  const line = "#0B0B0C";

  return (
    <svg viewBox="0 0 140 340" width="100%" height="100%">
      <path d="M58 176 L52 288 L64 288 L68 190 L72 190 L76 288 L88 288 L82 176 Z" fill={bottomColor} stroke={line} strokeWidth="1" />
      <path d="M48 288 H66 L70 296 Q66 300 56 300 Q46 300 46 294 Z" fill={shoeColor} stroke={line} strokeWidth="1" />
      <path d="M74 288 H92 L94 294 Q94 300 84 300 Q74 300 70 296 Z" fill={shoeColor} stroke={line} strokeWidth="1" />
      <path d="M50 58 Q70 50 90 58 L94 100 Q92 150 84 176 L56 176 Q48 150 46 100 Z" fill={topColor} stroke={line} strokeWidth="1" />
      <path d="M50 60 Q34 90 40 140" stroke={line} strokeWidth="1.4" fill="none" />
      <path d="M90 60 Q106 90 100 140" stroke={line} strokeWidth="1.4" fill="none" />
      {outerColor && (
        <>
          <path d="M46 56 L58 50 L70 66 L82 50 L94 56 L100 96 Q98 150 90 178 L50 178 Q42 150 40 96 Z" fill={outerColor} stroke={line} strokeWidth="1" />
          <path d="M65 66 L75 66 L73 150 L67 150 Z" fill={topColor} opacity="0.92" />
        </>
      )}
      {accessoryColor && <path d="M52 54 Q70 66 88 54 L86 62 Q70 74 54 62 Z" fill={accessoryColor} stroke={line} strokeWidth="1" />}
      <rect x="64" y="42" width="12" height="14" fill={skin} stroke={line} strokeWidth="0.8" />
      <ellipse cx="70" cy="28" rx="14" ry="16" fill={skin} stroke={line} strokeWidth="1" />
    </svg>
  );
}

// ==================== OUTFIT CARD ====================
function OutfitCard({ outfit, onSwap, onSave, saved }) {
  const { t, tName } = useLang();
  const items = outfit.items.map((key) => CATALOG[key]);
  return (
    <div className="card">
      <div className="eyebrow gold">{t("stylistSuggests")}</div>
      <div className="outfit-visual">
        <div className="croquis-wrap"><CroquisFigure items={items} /></div>
        <div className="item-list">
          {outfit.items.map((key) => {
            const item = CATALOG[key];
            return (
              <div key={item.id} className="item-row">
                <span className="item-row-swatch" style={{ background: item.color }} />
                <a className="item-row-info" href={item.productUrl} target="_blank" rel="noopener noreferrer" title={t("viewProduct")}>
                  <div className="item-row-name">{tName(item)}</div>
                  <div className="item-row-meta">{item.retailer} · ${item.price}</div>
                </a>
                <a className="link-btn-sm" href={item.productUrl} target="_blank" rel="noopener noreferrer" title={t("viewProduct")}>
                  <ExternalLink size={11} />
                </a>
                <button className="swap-btn-sm" onClick={() => onSwap(key)} title={t("swapItem")}><RefreshCw size={11} /></button>
              </div>
            );
          })}
        </div>
      </div>
      <p className="rationale">{outfit.rationale}</p>
      <button className="save-btn" onClick={onSave} disabled={saved}>
        {saved ? <><Check size={12} /> {t("savedLabel")}</> : t("saveOutfit")}
      </button>
    </div>
  );
}

// ==================== APP SCREENS ====================
function HomeScreen({ profile, onPrompt, homeInput, setHomeInput }) {
  const { lang, t, tOpt } = useLang();
  const chipKeys = ["chipDressWedding", "chipWorkDinner", "chipWeekendCasual"];
  const fitLabel = (FIT_SHORT[lang] && FIT_SHORT[lang][profile.fit]) || FIT_SHORT.en[profile.fit] || profile.fit;
  const budgetLabel = tOpt((BUDGET_OPTIONS.find((b) => b.key === profile.budget) || {}).label || "Balanced");
  const swatchHexes = (profile.palette || []).map((label) => (COLOR_OPTIONS.find((c) => c.label === label) || {}).hex).filter(Boolean).slice(0, 5);

  return (
    <div className="screen">
      <div className="eyebrow muted">{t("goodEvening")}</div>
      <h1 className="home-name">Alex</h1>
      <div className="dna-card">
        <div className="eyebrow gold-on-dark">{t("styleDnaLabel")}</div>
        <div className="dna-title">{tOpt(profile.archetype)}</div>
        <div className="dna-sub">{fitLabel} {t("silhouettesWord")} · {budgetLabel} {t("budgetWord")}</div>
        <div className="dna-swatches">
          {swatchHexes.map((hex, i) => <span key={i} className="swatch" style={{ background: hex }} />)}
        </div>
      </div>
      <div className="section-label">{t("askYourStylist")}</div>
      <form className="home-ask-row" onSubmit={(e) => { e.preventDefault(); if (homeInput.trim()) onPrompt(homeInput); }}>
        <input value={homeInput} onChange={(e) => setHomeInput(e.target.value)} placeholder={t("askPlaceholder")} className="home-ask-input" />
        <button type="submit" className="send-btn"><Send size={15} /></button>
      </form>
      <div className="chip-row">
        {chipKeys.map((k) => <button key={k} className="chip" onClick={() => onPrompt(t(k))}>{t(k)}</button>)}
      </div>
    </div>
  );
}

function ChatScreen({ messages, onSend, input, setInput, onSwap, onSave, savedIds, pending }) {
  const { t } = useLang();
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, pending]);

  return (
    <div className="chat-wrap">
      <div className="chat-header"><Sparkles size={14} color="#C6A567" /><span>{t("yourStylist")}</span></div>
      <div className="chat-body">
        {messages.length === 0 && <div className="chat-empty">{t("chatEmpty")}</div>}
        {messages.map((m, i) => {
          if (m.role === "user") return <div key={i} className="bubble-user">{m.text}</div>;
          if (m.outfit) {
            return (
              <div key={i} className="bubble-assistant">
                <OutfitCard outfit={m.outfit} onSwap={(key) => onSwap(i, key)} onSave={() => onSave(i)} saved={savedIds.has(i)} />
              </div>
            );
          }
          return <div key={i} className="bubble-assistant-text">{m.text}</div>;
        })}
        {pending && <div className="typing"><span className="dot" />{t("composing")}</div>}
        <div ref={endRef} />
      </div>
      <form className="chat-input-row" onSubmit={(e) => { e.preventDefault(); onSend(); }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t("chatInputPlaceholder")} className="chat-input" />
        <button type="submit" className="send-btn"><Send size={15} /></button>
      </form>
    </div>
  );
}

function WardrobeScreen({ savedOutfits }) {
  const { t } = useLang();
  return (
    <div className="screen">
      <h2 className="screen-title">{t("wardrobeTitle")}</h2>
      {savedOutfits.length === 0 ? (
        <p className="empty-note">{t("wardrobeEmpty")}</p>
      ) : (
        <div className="stack">{savedOutfits.map((o, i) => <OutfitCard key={i} outfit={o} onSwap={() => {}} onSave={() => {}} saved />)}</div>
      )}
    </div>
  );
}

function BagScreen({ savedOutfits }) {
  const { t, tName } = useLang();
  const allItems = savedOutfits.flatMap((o) => o.items.map((k) => CATALOG[k]));
  const byRetailer = allItems.reduce((acc, item) => {
    acc[item.retailer] = acc[item.retailer] || [];
    acc[item.retailer].push(item);
    return acc;
  }, {});
  return (
    <div className="screen">
      <h2 className="screen-title">{t("bagTitle")}</h2>
      {Object.keys(byRetailer).length === 0 ? (
        <p className="empty-note">{t("bagEmpty")}</p>
      ) : (
        Object.entries(byRetailer).map(([retailer, items]) => (
          <div key={retailer} className="retailer-group">
            <div className="section-label">{retailer}</div>
            {items.map((item, idx) => (
              <a key={item.id + idx} className="bag-row" href={item.productUrl} target="_blank" rel="noopener noreferrer" title={t("viewProduct")}>
                <div className="bag-icon"><GarmentPhoto type={item.type} color={item.color} /></div>
                <div className="bag-info"><div className="bag-name">{tName(item)}</div><div className="bag-price">${item.price}</div></div>
                <ExternalLink size={13} color="#8b877a" />
              </a>
            ))}
            <a className="checkout-btn" href={RETAILER_SITES[retailer] || "#"} target="_blank" rel="noopener noreferrer">{t("checkoutWith")} {retailer} →</a>
          </div>
        ))
      )}
    </div>
  );
}

function ProfileScreen({ profile }) {
  const { t, tOpt } = useLang();
  const budgetLabel = tOpt((BUDGET_OPTIONS.find((b) => b.key === profile.budget) || {}).label || "Balanced");
  const rows = [
    [t("styleArchetypeLabel"), tOpt(profile.archetype)],
    [t("fitPreferenceLabel"), tOpt(profile.fit)],
    [t("paletteLabel"), (profile.palette || []).map(tOpt).join(", ")],
    [t("budgetLabel"), budgetLabel],
    [t("dressesForLabel"), (profile.occasions || []).map(tOpt).join(", ") || "—"],
  ];
  return (
    <div className="screen">
      <h2 className="screen-title">{t("profileTitle")}</h2>
      <div className="profile-card">
        {rows.map(([label, val]) => (
          <div key={label} className="profile-row"><span className="muted">{label}</span><span>{val}</span></div>
        ))}
      </div>
      <div className="profile-lang-row">
        <span className="muted">{t("languageLabel")}</span>
        <LanguageSwitcher />
      </div>
      <p className="empty-note" style={{ marginTop: 16 }}>{t("prototypeNote")}</p>
    </div>
  );
}

// ==================== ROOT APP ====================
export default function VestraPrototype() {
  const [lang, setLang] = useState("en");
  const [stage, setStage] = useState("welcome"); // welcome | signup | onboarding | reveal | occasion | app
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({ lifestyle: null, archetype: null, fit: null, palette: [], avoid: [], budget: null, occasions: [], sizes: {} });
  const [profile, setProfile] = useState(DEFAULT_PROFILE);

  const [tab, setTab] = useState("home");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [homeInput, setHomeInput] = useState("");
  const [pending, setPending] = useState(false);
  const [savedIds, setSavedIds] = useState(new Set());
  const [savedOutfits, setSavedOutfits] = useState([]);

  const t = (key) => (UI[lang] && UI[lang][key]) || UI.en[key] || key;
  const tOpt = (value) => (OPTIONS_I18N[lang] && OPTIONS_I18N[lang][value]) || value;
  const tName = (item) => (PRODUCT_NAMES_I18N[lang] && PRODUCT_NAMES_I18N[lang][item.id]) || item.name;

  function sendMessage(text) {
    const finalText = text ?? input;
    if (!finalText.trim()) return;
    setMessages((m) => [...m, { role: "user", text: finalText }]);
    setInput("");
    setPending(true);
    setTimeout(() => {
      const idx = pickOutfitIndex(finalText);
      const template = OUTFIT_TEMPLATES[idx];
      const rationale = (RATIONALES_I18N[lang] && RATIONALES_I18N[lang][idx]) || template.rationale;
      setMessages((m) => [...m, { role: "assistant", outfit: { items: [...template.items], rationale } }]);
      setPending(false);
    }, 1100);
  }

  function handlePrompt(p) {
    setTab("chat");
    setHomeInput("");
    sendMessage(p);
  }

  function handleSwap(msgIndex, key) {
    const altKey = ALT_MAP[key];
    if (!altKey) return;
    setMessages((m) =>
      m.map((msg, i) => {
        if (i !== msgIndex || msg.role !== "assistant" || !msg.outfit) return msg;
        const newItems = msg.outfit.items.map((k) => (k === key ? altKey : k));
        return { ...msg, outfit: { ...msg.outfit, items: newItems } };
      })
    );
  }

  function handleSave(msgIndex) {
    setSavedIds((s) => new Set(s).add(msgIndex));
    const outfit = messages[msgIndex].outfit;
    setSavedOutfits((prev) => [...prev, outfit]);
  }

  function finishOnboarding(occasionText) {
    const archetypeShortEn = answers.archetype.replace(" & ", " ");
    const built = {
      archetype: archetypeShortEn,
      fit: answers.fit,
      palette: answers.palette.length ? answers.palette : DEFAULT_PROFILE.palette,
      budget: answers.budget,
      occasions: answers.occasions,
    };
    setProfile(built);
    const translatedArchetype = tOpt(archetypeShortEn);
    const greetFns = GREETINGS[lang] || GREETINGS.en;
    const greeting = occasionText ? greetFns.withOccasion(translatedArchetype) : greetFns.without(translatedArchetype);
    setMessages([{ role: "assistant", text: greeting }]);
    if (occasionText) {
      setTab("chat");
      sendMessage(occasionText);
    } else {
      setTab("home");
    }
    setStage("app");
  }

  function skipToApp() {
    setProfile(DEFAULT_PROFILE);
    setStage("app");
  }

  const tabs = [
    { id: "home", labelKey: "navHome", icon: Home },
    { id: "chat", labelKey: "navStylist", icon: MessageCircle },
    { id: "wardrobe", labelKey: "navWardrobe", icon: Bookmark },
    { id: "bag", labelKey: "navBag", icon: ShoppingBag },
    { id: "profile", labelKey: "navProfile", icon: User },
  ];

  const langCtxValue = { lang, setLang, t, tOpt, tName };

  return (
    <LangContext.Provider value={langCtxValue}>
    <div className="app-outer">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@300;400;500;600&display=swap');
        .app-outer{ min-height:100vh; background:#e9e4d6; display:flex; align-items:center; justify-content:center; padding:24px; font-family:'Inter',sans-serif; }
        .phone{ width:380px; height:780px; background:#F6F1E7; border-radius:2.2rem; border:8px solid #0B0B0C; box-shadow:0 30px 60px rgba(0,0,0,0.35); overflow:hidden; position:relative; display:flex; flex-direction:column; }
        .notch{ position:absolute; top:0; left:50%; transform:translateX(-50%); width:112px; height:20px; background:#0B0B0C; border-radius:0 0 12px 12px; z-index:20; }
        .phone-body{ flex:1; overflow:hidden; padding-top:20px; }
        .screen{ padding:24px 20px 90px; height:100%; overflow-y:auto; box-sizing:border-box; }
        .eyebrow{ font-size:10px; letter-spacing:0.18em; text-transform:uppercase; font-weight:600; margin-bottom:4px; }
        .eyebrow.muted{ color:#A8895C; }
        .eyebrow.gold{ color:#C6A567; margin-bottom:12px; }
        .eyebrow.gold-on-dark{ color:#C6A567; margin-bottom:8px; }
        .home-name{ font-family:'Fraunces',serif; font-size:26px; color:#0B0B0C; margin:0 0 24px; font-weight:400; }
        .dna-card{ background:#3E4228; border-radius:4px; padding:16px; margin-bottom:24px; color:#F6F1E7; }
        .dna-title{ font-family:'Fraunces',serif; font-size:19px; margin-bottom:4px; }
        .dna-sub{ font-size:12px; color:#E9E2D2; font-weight:300; }
        .dna-swatches{ display:flex; gap:6px; margin-top:12px; }
        .swatch{ width:18px; height:18px; border-radius:50%; border:1px solid rgba(246,241,231,0.3); display:inline-block; }
        .section-label{ font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:#8b877a; margin-bottom:12px; }
        .home-ask-row{ display:flex; gap:8px; align-items:center; margin-bottom:12px; }
        .home-ask-input{ flex:1; font-size:13px; background:#fff; border:1px solid #e6e0d2; border-radius:4px; padding:13px 14px; outline:none; font-family:'Inter',sans-serif; }
        .home-ask-input:focus{ border-color:#C6A567; box-shadow:0 0 0 2px rgba(198,165,103,0.25); }
        .chip-row{ display:flex; flex-wrap:wrap; gap:8px; }
        .chip{ font-size:11.5px; color:#5b5748; background:#fff; border:1px solid #e6e0d2; border-radius:999px; padding:8px 14px; cursor:pointer; font-family:'Inter',sans-serif; transition:all .2s; }
        .chip:hover{ border-color:#C6A567; color:#0B0B0C; }

        .chat-wrap{ display:flex; flex-direction:column; height:100%; }
        .chat-header{ padding:16px 20px; border-bottom:1px solid #e6e0d2; display:flex; align-items:center; gap:8px; font-size:13px; font-weight:500; color:#0B0B0C; }
        .chat-body{ flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:12px; }
        .chat-empty{ text-align:center; font-size:12px; color:#8b877a; font-weight:300; margin-top:40px; padding:0 24px; }
        .bubble-user{ align-self:flex-end; background:#0B0B0C; color:#F6F1E7; font-size:13px; border-radius:4px; padding:10px 14px; max-width:80%; }
        .bubble-assistant{ align-self:flex-start; max-width:94%; width:100%; }
        .bubble-assistant-text{ align-self:flex-start; max-width:85%; background:#fff; border:1px solid #e6e0d2; color:#0B0B0C; font-size:13px; font-weight:300; line-height:1.5; border-radius:4px; padding:10px 14px; }
        .typing{ align-self:flex-start; font-size:12px; color:#8b877a; display:flex; align-items:center; gap:6px; padding:0 4px; }
        .dot{ width:6px; height:6px; background:#C6A567; border-radius:50%; display:inline-block; animation:pulse 1.2s infinite; }
        @keyframes pulse{ 0%,100%{opacity:.3;} 50%{opacity:1;} }
        .chat-input-row{ padding:12px; border-top:1px solid #e6e0d2; display:flex; gap:8px; align-items:center; }
        .chat-input{ flex:1; font-size:13px; background:#f4efe4; border:none; border-radius:4px; padding:11px 14px; outline:none; font-family:'Inter',sans-serif; }
        .chat-input:focus{ box-shadow:0 0 0 2px #C6A567; }
        .send-btn{ background:#0B0B0C; color:#C6A567; border:none; border-radius:4px; padding:10px; cursor:pointer; display:flex; align-items:center; justify-content:center; }

        .card{ background:#0B0B0C; border:1px solid #2a2a26; border-radius:4px; padding:16px; color:#F6F1E7; }
        .outfit-visual{ display:flex; gap:12px; margin-bottom:14px; }
        .croquis-wrap{ width:104px; flex-shrink:0; background:radial-gradient(ellipse at 50% 30%, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 65%); border-radius:4px; padding:6px 2px; }
        .croquis-wrap svg{ width:100%; height:auto; filter:drop-shadow(0 4px 6px rgba(0,0,0,0.3)); }
        .item-list{ flex:1; display:flex; flex-direction:column; gap:6px; min-width:0; }
        .item-row{ display:flex; align-items:center; gap:8px; background:#151513; border:1px solid #2a2a26; border-radius:4px; padding:8px; }
        .item-row-swatch{ width:16px; height:16px; border-radius:50%; flex-shrink:0; border:1px solid rgba(246,241,231,0.25); }
        .item-row-info{ flex:1; min-width:0; color:inherit; text-decoration:none; display:block; cursor:pointer; }
        .item-row-name{ font-size:10.5px; line-height:1.3; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .item-row-meta{ font-size:9.5px; color:#8b877a; margin-top:1px; }
        .swap-btn-sm{ flex-shrink:0; background:none; border:1px solid #2a2a26; border-radius:4px; color:#8b877a; padding:6px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .2s; }
        .swap-btn-sm:hover{ color:#C6A567; border-color:#C6A567; }
        .link-btn-sm{ flex-shrink:0; background:none; border:1px solid #2a2a26; border-radius:4px; color:#8b877a; padding:6px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .2s; text-decoration:none; }
        .link-btn-sm:hover{ color:#C6A567; border-color:#C6A567; }
        .rationale{ font-size:12.5px; line-height:1.6; color:#E9E2D2; font-weight:300; margin:0 0 16px; }
        .save-btn{ width:100%; display:flex; align-items:center; justify-content:center; gap:6px; font-size:11px; letter-spacing:0.05em; text-transform:uppercase; font-weight:600; padding:11px; border-radius:4px; background:#C6A567; color:#0B0B0C; border:none; cursor:pointer; font-family:'Inter',sans-serif; transition:background .2s; }
        .save-btn:hover:not(:disabled){ background:#F6F1E7; }
        .save-btn:disabled{ opacity:0.55; cursor:default; }

        .screen-title{ font-family:'Fraunces',serif; font-size:21px; color:#0B0B0C; font-weight:400; margin:0 0 20px; }
        .empty-note{ font-size:12.5px; color:#8b877a; font-weight:300; }
        .stack{ display:flex; flex-direction:column; gap:12px; }

        .retailer-group{ margin-bottom:20px; }
        .bag-row{ display:flex; align-items:center; gap:12px; background:#fff; border:1px solid #e6e0d2; border-radius:4px; padding:10px; margin-bottom:8px; text-decoration:none; color:inherit; transition:border-color .2s; }
        .bag-row:hover{ border-color:#C6A567; }
        .bag-icon{ width:44px; height:44px; background:radial-gradient(ellipse at center, #fbf8f1 0%, #f4efe4 100%); border-radius:4px; display:flex; align-items:center; justify-content:center; padding:4px; }
        .bag-icon svg{ width:36px; height:30px; filter:drop-shadow(0 2px 3px rgba(0,0,0,0.12)); }
        .bag-info{ flex:1; }
        .bag-name{ font-size:12px; color:#0B0B0C; }
        .bag-price{ font-size:11px; color:#8b877a; margin-top:2px; }
        .checkout-btn{ width:100%; box-sizing:border-box; display:flex; align-items:center; justify-content:center; font-size:10.5px; letter-spacing:0.05em; text-transform:uppercase; color:#0B0B0C; background:none; border:1px solid #0B0B0C; border-radius:4px; padding:10px; cursor:pointer; margin-top:4px; font-family:'Inter',sans-serif; text-decoration:none; transition:all .2s; }
        .checkout-btn:hover{ background:#0B0B0C; color:#C6A567; }

        .profile-card{ background:#fff; border:1px solid #e6e0d2; border-radius:4px; }
        .profile-row{ display:flex; justify-content:space-between; gap:12px; padding:12px 16px; font-size:12.5px; border-bottom:1px solid #e6e0d2; }
        .profile-row span:last-child{ text-align:right; }
        .profile-row:last-child{ border-bottom:none; }
        .profile-lang-row{ display:flex; align-items:center; justify-content:space-between; margin-top:16px; font-size:12.5px; }
        .muted{ color:#8b877a; }

        .tabbar{ border-top:1px solid #e6e0d2; background:#F6F1E7; display:flex; justify-content:space-around; align-items:center; padding:10px 8px; }
        .tab-btn{ display:flex; flex-direction:column; align-items:center; gap:4px; background:none; border:none; cursor:pointer; padding:0 8px; }
        .tab-btn span{ font-size:9px; letter-spacing:0.02em; color:#8b877a; }
        .tab-btn.active span{ color:#0B0B0C; }

        .lang-switcher{ display:flex; gap:6px; }
        .lang-switcher-corner{ position:absolute; top:20px; right:16px; z-index:5; }
        .lang-pill{ font-size:10px; letter-spacing:0.04em; padding:5px 9px; border-radius:999px; border:1px solid #e6e0d2; background:#fff; color:#8b877a; cursor:pointer; font-family:'Inter',sans-serif; transition:all .15s; }
        .lang-pill.active{ background:#0B0B0C; color:#C6A567; border-color:#0B0B0C; }

        /* ---- Onboarding ---- */
        .onb-screen{ height:100%; display:flex; flex-direction:column; padding:24px 20px; box-sizing:border-box; overflow-y:auto; position:relative; }
        .onb-center{ align-items:center; text-align:center; justify-content:center; flex:1; display:flex; flex-direction:column; }
        .onb-eyebrow{ font-size:10px; letter-spacing:0.2em; text-transform:uppercase; color:#A8895C; font-weight:600; margin-bottom:14px; }
        .onb-hero-title{ font-family:'Fraunces',serif; font-size:30px; color:#0B0B0C; line-height:1.2; margin:0 0 12px; font-weight:400; }
        .onb-hero-sub{ font-size:13px; color:#5b5748; font-weight:300; margin-bottom:32px; }
        .onb-title{ font-family:'Fraunces',serif; font-size:24px; color:#0B0B0C; line-height:1.25; margin:0 0 24px; font-weight:400; }
        .onb-primary-btn{ background:#0B0B0C; color:#C6A567; border:none; border-radius:4px; padding:15px 32px; font-size:12.5px; letter-spacing:0.06em; text-transform:uppercase; font-weight:600; cursor:pointer; font-family:'Inter',sans-serif; width:100%; max-width:280px; }
        .onb-primary-btn:disabled{ opacity:0.35; cursor:default; }
        .onb-skip-link{ margin-top:18px; background:none; border:none; color:#8b877a; font-size:11.5px; cursor:pointer; font-family:'Inter',sans-serif; text-decoration:underline; }
        .onb-input{ width:100%; max-width:280px; font-size:14px; padding:14px 16px; border:1px solid #e6e0d2; border-radius:4px; outline:none; font-family:'Inter',sans-serif; box-sizing:border-box; }
        .onb-input:focus{ border-color:#C6A567; }
        .onb-fine-print{ font-size:11px; color:#a39d8c; margin-top:14px; }
        .onb-back{ background:none; border:none; cursor:pointer; color:#0B0B0C; padding:6px; position:absolute; top:20px; left:16px; z-index:5; }
        .onb-progress-row{ display:flex; align-items:center; gap:12px; padding-top:4px; margin-bottom:28px; padding-left:34px; }
        .onb-progress-track{ flex:1; height:3px; background:#e6e0d2; border-radius:2px; overflow:hidden; }
        .onb-progress-fill{ height:100%; background:#C6A567; transition:width .3s ease; }
        .onb-body{ flex:1; overflow-y:auto; }
        .onb-question-title{ font-family:'Fraunces',serif; font-size:22px; color:#0B0B0C; font-weight:400; margin:0 0 8px; }
        .onb-question-prompt{ font-size:13px; color:#5b5748; font-weight:300; margin-bottom:22px; }
        .onb-card-grid{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .onb-option-card{ text-align:left; font-size:12.5px; color:#0B0B0C; background:#fff; border:1.5px solid #e6e0d2; border-radius:4px; padding:16px 12px; cursor:pointer; font-family:'Inter',sans-serif; line-height:1.35; transition:all .15s; }
        .onb-option-card.selected{ border-color:#C6A567; background:#faf6ec; }
        .onb-budget-list{ display:flex; flex-direction:column; gap:10px; }
        .onb-budget-card{ text-align:left; background:#fff; border:1.5px solid #e6e0d2; border-radius:4px; padding:14px 16px; cursor:pointer; font-family:'Inter',sans-serif; transition:all .15s; }
        .onb-budget-card.selected{ border-color:#C6A567; background:#faf6ec; }
        .onb-budget-label{ font-size:13.5px; color:#0B0B0C; margin-bottom:2px; }
        .onb-budget-sub{ font-size:11px; color:#8b877a; }
        .onb-swatch-grid{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:14px; }
        .onb-swatch-card{ display:flex; flex-direction:column; align-items:center; gap:6px; background:#fff; border:1.5px solid #e6e0d2; border-radius:4px; padding:10px 4px; cursor:pointer; font-family:'Inter',sans-serif; transition:all .15s; }
        .onb-swatch-card.selected{ border-color:#C6A567; background:#faf6ec; }
        .onb-swatch-card.avoid.selected{ border-color:#a85832; background:#fbf1ec; }
        .onb-swatch-dot{ width:22px; height:22px; border-radius:50%; border:1px solid rgba(0,0,0,0.12); }
        .onb-swatch-label{ font-size:9.5px; color:#5b5748; text-align:center; line-height:1.25; }
        .onb-link{ background:none; border:none; color:#8b877a; font-size:11.5px; text-decoration:underline; cursor:pointer; font-family:'Inter',sans-serif; padding:0; margin-bottom:8px; }
        .onb-mini-label{ font-size:10px; letter-spacing:0.1em; text-transform:uppercase; color:#a85832; margin-bottom:10px; }
        .onb-sizes{ display:flex; flex-direction:column; gap:14px; }
        .onb-size-row{ display:flex; flex-direction:column; gap:6px; }
        .onb-size-label{ font-size:11px; letter-spacing:0.06em; text-transform:uppercase; color:#8b877a; }
        .onb-size-input{ font-size:13px; padding:12px 14px; border:1px solid #e6e0d2; border-radius:4px; outline:none; font-family:'Inter',sans-serif; }
        .onb-size-input:focus{ border-color:#C6A567; }
        .onb-continue{ margin-top:20px; align-self:center; }
        .reveal-title{ font-family:'Fraunces',serif; font-size:28px; color:#0B0B0C; line-height:1.3; margin-bottom:18px; font-weight:400; }
        .reveal-gold{ color:#C6A567; font-style:italic; }
        .reveal-summary{ font-size:13.5px; color:#5b5748; font-weight:300; line-height:1.6; max-width:280px; margin-bottom:32px; }
      `}</style>

      <div className="phone">
        <div className="notch" />
        <div className="phone-body">
          {stage === "welcome" && <WelcomeScreen onStart={() => setStage("signup")} onSkip={skipToApp} />}
          {stage === "signup" && <SignupScreen onContinue={() => setStage("onboarding")} onBack={() => setStage("welcome")} />}
          {stage === "onboarding" && (
            <OnboardingScreen
              step={step}
              totalSteps={STEPS.length}
              question={STEPS[step]}
              answers={answers}
              setAnswers={setAnswers}
              onBack={() => (step === 0 ? setStage("signup") : setStep(step - 1))}
              onNext={() => (step === STEPS.length - 1 ? setStage("reveal") : setStep(step + 1))}
            />
          )}
          {stage === "reveal" && <RevealScreen answers={answers} onContinue={() => setStage("occasion")} />}
          {stage === "occasion" && <OccasionScreen onSubmit={finishOnboarding} onSkip={() => finishOnboarding(null)} />}
          {stage === "app" && (
            <>
              {tab === "home" && <HomeScreen profile={profile} onPrompt={handlePrompt} homeInput={homeInput} setHomeInput={setHomeInput} />}
              {tab === "chat" && (
                <ChatScreen messages={messages} input={input} setInput={setInput} onSend={() => sendMessage()} onSwap={handleSwap} onSave={handleSave} savedIds={savedIds} pending={pending} />
              )}
              {tab === "wardrobe" && <WardrobeScreen savedOutfits={savedOutfits} />}
              {tab === "bag" && <BagScreen savedOutfits={savedOutfits} />}
              {tab === "profile" && <ProfileScreen profile={profile} />}
            </>
          )}
        </div>
        {stage === "app" && (
          <div className="tabbar">
            {tabs.map(({ id, labelKey, icon: Icon }) => (
              <button key={id} className={`tab-btn ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
                <Icon size={18} color={tab === id ? "#C6A567" : "#8b877a"} strokeWidth={tab === id ? 2.2 : 1.6} />
                <span>{t(labelKey)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
    </LangContext.Provider>
  );
}

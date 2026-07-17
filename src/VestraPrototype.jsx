import React, { useState, useRef, useEffect, createContext, useContext } from "react";
import { Home, MessageCircle, Bookmark, ShoppingBag, User, Send, RefreshCw, Check, Sparkles, ArrowLeft, ExternalLink, X } from "lucide-react";

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
    stepAudienceTitle: "Who are we dressing?", stepAudiencePrompt: "This helps us show the right fits and inspiration.",
    step0Title: "Let's get you dressed properly.", step0Prompt: "How would you describe your day-to-day?",
    step1Title: "Which of these feels most like you?", step1Prompt: "Not sure of the name? Pick the photo that feels most like you.",
    archQuietDesc: "Clean lines, refined fits, nothing loud — polished without trying too hard.",
    archRelaxedDesc: "Easy fabrics, soft structure, put-together but never stiff.",
    archModernDesc: "Crisp silhouettes, strong shapes, contemporary and intentional.",
    archWarmDesc: "Textures, layers, and earthy tones that feel inviting and lived-in.",
    archClassicDesc: "Timeless pieces you’d wear for years — neat, reliable, elegant.",
    archMinimalDesc: "Fewer pieces, quieter colors, strong proportions that do the talking.",
    archRomanticDesc: "Soft fabrics, gentle movement, and a lighter, more delicate mood.",
    archBoldDesc: "Statement color, presence, and outfits people remember.",
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
    dressingForLabel: "Dressing for",
    paletteLabel: "Palette", budgetLabel: "Budget", dressesForLabel: "Dresses For",
    prototypeNote: "This is a click-through prototype — no real account exists yet.", languageLabel: "Language",
    navHome: "Home", navStylist: "Stylist", navWardrobe: "Wardrobe", navBag: "Bag", navProfile: "Profile",
    viewProduct: "Shop this item", swapItem: "Swap this item",
    modelOnHer: "Her", modelOnHim: "Him", modelLabel: "Shown on",
    shopAcross: "Shop across stores", shopAcrossSub: "Search this piece from budget to luxury",
    shopClose: "Close", shopTierBudget: "Budget", shopTierHighStreet: "High street", shopTierPremium: "Premium", shopTierLuxury: "Luxury",
    shopOpenAll: "Open Google Shopping",
    favoriteStoresLabel: "Favorite stores",
    favoriteStoresHint: "Tap to add or remove stores you shop from most.",
    favoriteStoresEmpty: "No favorites yet — pick a few below.",
    shopYourFavorites: "Your favorites",
    shopInStock: "In stock now",
    shopInStockSub: "Live listings scanned across retailers",
    shopInStockBadge: "In stock",
    shopBuyAt: "Buy",
    shopScanning: "Scanning stores for availability…",
    shopNoStock: "No live listings found — try Google Shopping or a store below.",
    shopMoreStores: "Search more stores",
  },
  es: {
    welcomeEyebrow: "Vestra", welcomeTitleLine1: "Vamos a vestirte", welcomeTitleLine2: "como es debido.",
    welcomeSub: "Unas preguntas rápidas y luego conoces a tu estilista.", getStarted: "Empezar", skipTesting: "Saltar para probar → ver la app",
    createAccountEyebrow: "Crea tu cuenta", whereReachYouLine1: "¿Dónde podemos", whereReachYouLine2: "contactarte?",
    emailPlaceholder: "tu@email.com", continueBtn: "Continuar", signupNote: "Esto es un prototipo — no se crea ninguna cuenta real.",
    stepAudienceTitle: "¿Para quién es el estilo?", stepAudiencePrompt: "Así te mostramos los cortes e inspiración adecuados.",
    step0Title: "Vamos a vestirte como es debido.", step0Prompt: "¿Cómo describirías tu día a día?",
    step1Title: "¿Cuál de estos se parece más a ti?", step1Prompt: "Si no sabes el nombre, elige la foto que más te represente.",
    archQuietDesc: "Líneas limpias, cortes refinados, nada estridente — elegancia sin esfuerzo.",
    archRelaxedDesc: "Tejidos cómodos, estructura suave, cuidado pero nunca rígido.",
    archModernDesc: "Siluetas nítidas, formas fuertes, contemporáneo e intencional.",
    archWarmDesc: "Texturas, capas y tonos tierra acogedores y naturales.",
    archClassicDesc: "Piezas atemporales para años — limpio, fiable, elegante.",
    archMinimalDesc: "Menos piezas, colores discretos, proporciones que hablan solas.",
    archRomanticDesc: "Telas suaves, movimiento ligero y un aire más delicado.",
    archBoldDesc: "Color con presencia y looks que se recuerdan.",
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
    dressingForLabel: "Vestuario para",
    paletteLabel: "Paleta", budgetLabel: "Presupuesto", dressesForLabel: "Se Viste Para",
    prototypeNote: "Esto es un prototipo interactivo — aún no existe ninguna cuenta real.", languageLabel: "Idioma",
    navHome: "Inicio", navStylist: "Estilista", navWardrobe: "Armario", navBag: "Bolsa", navProfile: "Perfil",
    viewProduct: "Comprar esta prenda", swapItem: "Cambiar esta prenda",
    modelOnHer: "Ella", modelOnHim: "Él", modelLabel: "Mostrado en",
    shopAcross: "Buscar en tiendas", shopAcrossSub: "Desde low-cost hasta lujo",
    shopClose: "Cerrar", shopTierBudget: "Económico", shopTierHighStreet: "High street", shopTierPremium: "Premium", shopTierLuxury: "Lujo",
    shopOpenAll: "Abrir Google Shopping",
    favoriteStoresLabel: "Tiendas favoritas",
    favoriteStoresHint: "Toca para añadir o quitar las tiendas donde más compras.",
    favoriteStoresEmpty: "Aún no hay favoritas — elige algunas abajo.",
    shopYourFavorites: "Tus favoritas",
    shopInStock: "Disponible ahora",
    shopInStockSub: "Listados en stock en varias tiendas",
    shopInStockBadge: "En stock",
    shopBuyAt: "Comprar",
    shopScanning: "Buscando disponibilidad en tiendas…",
    shopNoStock: "Sin listados en vivo — prueba Google Shopping o una tienda abajo.",
    shopMoreStores: "Buscar en más tiendas",
  },
  fr: {
    welcomeEyebrow: "Vestra", welcomeTitleLine1: "Habillons-vous", welcomeTitleLine2: "comme il se doit.",
    welcomeSub: "Quelques questions rapides, puis rencontrez votre styliste.", getStarted: "Commencer", skipTesting: "Passer pour tester → voir l'app",
    createAccountEyebrow: "Créez votre compte", whereReachYouLine1: "Où pouvons-nous", whereReachYouLine2: "vous joindre ?",
    emailPlaceholder: "votre@email.com", continueBtn: "Continuer", signupNote: "Ceci est un prototype — aucun compte n'est réellement créé.",
    stepAudienceTitle: "Pour qui s'habille-t-on ?", stepAudiencePrompt: "Cela nous aide à montrer les coupes et inspirations adaptées.",
    step0Title: "Habillons-vous comme il se doit.", step0Prompt: "Comment décririez-vous votre quotidien ?",
    step1Title: "Lequel vous ressemble le plus ?", step1Prompt: "Pas sûr du nom ? Choisissez la photo qui vous parle.",
    archQuietDesc: "Lignes nettes, coupes raffinées, rien de criard — élégance sans effort.",
    archRelaxedDesc: "Matières souples, structure douce, soigné sans rigidité.",
    archModernDesc: "Silhouettes précises, formes affirmées, contemporain et intentionnel.",
    archWarmDesc: "Textures, superpositions et tons terreux accueillants.",
    archClassicDesc: "Pièces intemporelles à garder des années — net, fiable, élégant.",
    archMinimalDesc: "Moins de pièces, couleurs discrètes, proportions qui parlent.",
    archRomanticDesc: "Tissus fluides, mouvement doux, une humeur plus délicate.",
    archBoldDesc: "Couleur affirmée et tenues dont on se souvient.",
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
    dressingForLabel: "S'habille pour",
    paletteLabel: "Palette", budgetLabel: "Budget", dressesForLabel: "S'habille Pour",
    prototypeNote: "Ceci est un prototype interactif — aucun compte réel n'existe encore.", languageLabel: "Langue",
    navHome: "Accueil", navStylist: "Styliste", navWardrobe: "Garde-robe", navBag: "Panier", navProfile: "Profil",
    viewProduct: "Acheter cet article", swapItem: "Changer cet article",
    modelOnHer: "Elle", modelOnHim: "Lui", modelLabel: "Porté par",
    shopAcross: "Chercher en boutiques", shopAcrossSub: "Du abordable au luxe",
    shopClose: "Fermer", shopTierBudget: "Budget", shopTierHighStreet: "High street", shopTierPremium: "Premium", shopTierLuxury: "Luxe",
    shopOpenAll: "Ouvrir Google Shopping",
    favoriteStoresLabel: "Boutiques préférées",
    favoriteStoresHint: "Touchez pour ajouter ou retirer vos boutiques habituelles.",
    favoriteStoresEmpty: "Aucune favorite — choisissez-en quelques-unes ci-dessous.",
    shopYourFavorites: "Vos favorites",
    shopInStock: "En stock maintenant",
    shopInStockSub: "Offres disponibles chez plusieurs enseignes",
    shopInStockBadge: "En stock",
    shopBuyAt: "Acheter",
    shopScanning: "Recherche de disponibilité…",
    shopNoStock: "Aucune offre trouvée — essayez Google Shopping ou une boutique ci-dessous.",
    shopMoreStores: "Chercher d'autres boutiques",
  },
};

const OPTIONS_I18N = {
  es: {
    "Office / client-facing": "Oficina / cara al cliente", "Creative or flexible workplace": "Trabajo creativo o flexible",
    "Remote, mostly at home": "Remoto, mayormente en casa", "On the move — travel, events, varied": "En movimiento — viajes, eventos, variado",
    "Student life": "Vida de estudiante",
    "Ladies": "Mujer", "Gentlemen": "Hombre", "Gender neutral": "Género neutro",
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
    "Ladies": "Femme", "Gentlemen": "Homme", "Gender neutral": "Non genré",
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

// ---------- Product catalog (mirrors the seed data in the real backend) ----------
const ASSET_V = "4";
const assetUrl = (path) => `${path}?v=${ASSET_V}`;

const CATALOG = {
  blazer: { key: "blazer", id: "p1", name: "Wool-Blend Tailored Blazer", price: 320, retailer: "Considered Studio", type: "blazer", color: "#3E4228", image: assetUrl("/products/blazer.jpg"), searchQuery: "olive green wool tailored blazer men women" },
  blazerAlt: { key: "blazerAlt", id: "p1b", name: "Unstructured Linen Blazer", price: 265, retailer: "North & Field", type: "blazer", color: "#cbb994", image: assetUrl("/products/blazer-alt.jpg"), searchQuery: "sand beige unstructured linen blazer" },
  shirt: { key: "shirt", id: "p2", name: "Crisp Cotton Shirt", price: 95, retailer: "Considered Studio", type: "shirt", color: "#F5F2E9", image: assetUrl("/products/shirt.jpg"), searchQuery: "ivory crisp cotton dress shirt" },
  shirtAlt: { key: "shirtAlt", id: "p2b", name: "Fine Merino Turtleneck", price: 110, retailer: "North & Field", type: "shirt", color: "#4a4a48", image: assetUrl("/products/shirt-alt.jpg"), searchQuery: "charcoal fine merino turtleneck sweater" },
  trouser: { key: "trouser", id: "p3", name: "Tailored Straight Trouser", price: 140, retailer: "Considered Studio", type: "trouser", color: "#3E4228", image: assetUrl("/products/trouser.jpg"), searchQuery: "olive tailored straight leg trousers" },
  trouserAlt: { key: "trouserAlt", id: "p3b", name: "Wide-Leg Wool Trouser", price: 165, retailer: "Considered Studio", type: "trouser", color: "#6b6b63", image: assetUrl("/products/trouser-alt.jpg"), searchQuery: "grey wide leg wool trousers" },
  shoe: { key: "shoe", id: "p4", name: "Leather Derby Shoe", price: 210, retailer: "Aldern & Co.", type: "shoe", color: "#6b3f22", image: assetUrl("/products/shoe.jpg"), searchQuery: "brown leather derby dress shoes" },
  shoeAlt: { key: "shoeAlt", id: "p4b", name: "Suede Chelsea Boot", price: 245, retailer: "Aldern & Co.", type: "shoe", color: "#4a3527", image: assetUrl("/products/shoe-alt.jpg"), searchQuery: "dark brown suede chelsea boots" },
  scarf: { key: "scarf", id: "p5", name: "Fine Wool Scarf", price: 85, retailer: "North & Field", type: "scarf", color: "#b08a5c", image: assetUrl("/products/scarf.jpg"), searchQuery: "camel tan fine wool scarf" },
  scarfAlt: { key: "scarfAlt", id: "p5b", name: "Cashmere Pocket Square", price: 65, retailer: "Aldern & Co.", type: "scarf", color: "#C6A567", image: assetUrl("/products/scarf-alt.jpg"), searchQuery: "gold cashmere pocket square" },
};

function catalogKeyForItem(item) {
  if (item?.key && CATALOG[item.key]) return item.key;
  return Object.keys(CATALOG).find((k) => CATALOG[k].id === item?.id) || null;
}

// Real multi-store search — budget → high street → premium → luxury
const STORE_DIRECTORY = [
  { id: "shein", name: "SHEIN", tier: "budget", url: (q) => `https://www.shein.com/pdsearch/${encodeURIComponent(q)}/` },
  { id: "temu", name: "Temu", tier: "budget", url: (q) => `https://www.temu.com/search_result.html?search_key=${encodeURIComponent(q)}` },
  { id: "hm", name: "H&M", tier: "highstreet", url: (q) => `https://www2.hm.com/en_us/search-results.html?q=${encodeURIComponent(q)}` },
  { id: "zara", name: "Zara", tier: "highstreet", url: (q) => `https://www.zara.com/us/en/search?searchTerm=${encodeURIComponent(q)}` },
  { id: "uniqlo", name: "Uniqlo", tier: "highstreet", url: (q) => `https://www.uniqlo.com/us/en/search?q=${encodeURIComponent(q)}` },
  { id: "asos", name: "ASOS", tier: "highstreet", url: (q) => `https://www.asos.com/us/search/?q=${encodeURIComponent(q)}` },
  { id: "mango", name: "Mango", tier: "highstreet", url: (q) => `https://shop.mango.com/us/en/search?kw=${encodeURIComponent(q)}` },
  { id: "gap", name: "Gap", tier: "highstreet", url: (q) => `https://www.gap.com/browse/search.do?searchText=${encodeURIComponent(q)}` },
  { id: "nordstrom", name: "Nordstrom", tier: "premium", url: (q) => `https://www.nordstrom.com/sr?keyword=${encodeURIComponent(q)}` },
  { id: "suitsupply", name: "SuitSupply", tier: "premium", url: (q) => `https://suitsupply.com/en-us/search?q=${encodeURIComponent(q)}` },
  { id: "revolve", name: "Revolve", tier: "premium", url: (q) => `https://www.revolve.com/r/Search.jsp?s=${encodeURIComponent(q)}` },
  { id: "bloomingdales", name: "Bloomingdale's", tier: "premium", url: (q) => `https://www.bloomingdales.com/shop/search?keyword=${encodeURIComponent(q)}` },
  { id: "ssense", name: "SSENSE", tier: "luxury", url: (q) => `https://www.ssense.com/en-us/search?q=${encodeURIComponent(q)}` },
  { id: "mrporter", name: "Mr Porter", tier: "luxury", url: (q) => `https://www.mrporter.com/en-us/mens/search?q=${encodeURIComponent(q)}` },
  { id: "netaporter", name: "Net-a-Porter", tier: "luxury", url: (q) => `https://www.net-a-porter.com/en-us/shop/search?q=${encodeURIComponent(q)}` },
  { id: "farfetch", name: "Farfetch", tier: "luxury", url: (q) => `https://www.farfetch.com/shopping/search/items.aspx?q=${encodeURIComponent(q)}` },
  { id: "saks", name: "Saks", tier: "luxury", url: (q) => `https://www.saksfifthavenue.com/search?text=${encodeURIComponent(q)}` },
  { id: "matches", name: "Matches", tier: "luxury", url: (q) => `https://www.matchesfashion.com/us/search?q=${encodeURIComponent(q)}` },
];

const STORE_TIERS = [
  { id: "budget", labelKey: "shopTierBudget" },
  { id: "highstreet", labelKey: "shopTierHighStreet" },
  { id: "premium", labelKey: "shopTierPremium" },
  { id: "luxury", labelKey: "shopTierLuxury" },
];

function googleShoppingUrl(query) {
  return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(query)}`;
}

function storeLinksForItem(item) {
  const q = item.searchQuery || item.name;
  return STORE_DIRECTORY.map((store) => ({
    ...store,
    href: store.url(q),
  }));
}
const ALT_MAP = { blazer: "blazerAlt", shirt: "shirtAlt", trouser: "trouserAlt", shoe: "shoeAlt", scarf: "scarfAlt" };
const ALT_MAP_REV = Object.fromEntries(Object.entries(ALT_MAP).map(([k, v]) => [v, k]));

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

// AI-generated model photos keyed by gender + outfit signature (catalog keys, stable order)
const MODEL_KEY_ORDER = ["blazer", "blazerAlt", "shirt", "shirtAlt", "trouser", "trouserAlt", "shoe", "shoeAlt", "scarf", "scarfAlt"];
function outfitSignature(itemKeys) {
  return [...itemKeys].sort((a, b) => MODEL_KEY_ORDER.indexOf(a) - MODEL_KEY_ORDER.indexOf(b)).join("+");
}

const MODEL_IMAGES = {
  woman: {
    "blazer+shirt+trouser+shoe": assetUrl("/models/model-woman-wedding.jpg"),
    "blazerAlt+shirt+trouser+shoe": assetUrl("/models/model-woman-wedding-linen.jpg"),
    "shirt+trouser+shoe+scarf": assetUrl("/models/model-woman-dinner.jpg"),
    "shirt+trouser+shoe": assetUrl("/models/model-woman-everyday.jpg"),
  },
  man: {
    "blazer+shirt+trouser+shoe": assetUrl("/models/model-man-wedding.jpg"),
    "blazerAlt+shirt+trouser+shoe": assetUrl("/models/model-man-wedding-alt.jpg"),
    "blazer+shirtAlt+trouser+shoe": assetUrl("/models/model-man-wedding-alt.jpg"),
    "blazerAlt+shirtAlt+trouser+shoe": assetUrl("/models/model-man-wedding-alt.jpg"),
    "shirt+trouser+shoe+scarf": assetUrl("/models/model-man-dinner.jpg"),
    "shirt+trouser+shoe": assetUrl("/models/model-man-everyday.jpg"),
  },
};

function resolveModelImage(itemKeys, gender) {
  const map = MODEL_IMAGES[gender] || MODEL_IMAGES.woman;
  const sig = outfitSignature(itemKeys);
  if (map[sig]) return map[sig];

  // Normalize alt keys to base family for fuzzy match (blazerAlt → blazer)
  const family = (k) => ALT_MAP_REV[k] || k;
  const want = new Set(itemKeys.map(family));
  let best = null;
  let bestScore = -1;
  for (const [key, src] of Object.entries(map)) {
    const parts = key.split("+");
    const have = new Set(parts.map(family));
    let score = 0;
    for (const w of want) if (have.has(w)) score += 2;
    for (const h of have) if (!want.has(h)) score -= 1;
    // Prefer exact blazer presence match
    if (want.has("blazer") === have.has("blazer")) score += 1;
    if (want.has("scarf") === have.has("scarf")) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = src;
    }
  }
  return best || map["shirt+trouser+shoe"] || Object.values(map)[0];
}

function pickOutfitIndex(text) {
  const lower = text.toLowerCase();
  const idx = OUTFIT_TEMPLATES.findIndex((t) => t.keywords.some((k) => lower.includes(k)));
  return idx === -1 ? OUTFIT_TEMPLATES.length - 1 : idx;
}

// ==================== ONBOARDING DATA ====================
const AUDIENCE_OPTIONS = ["Ladies", "Gentlemen", "Gender neutral"];
const AUDIENCE_META = {
  Ladies: { image: assetUrl("/onboarding/audience-ladies.jpg"), modelGender: "woman" },
  Gentlemen: { image: assetUrl("/onboarding/audience-gentlemen.jpg"), modelGender: "man" },
  "Gender neutral": { image: assetUrl("/onboarding/audience-neutral.jpg"), modelGender: "woman" },
};

/** Pick woman/man photo from option meta based on audience choice. */
function resolveAudienceImage(meta, audience, optionIndex = 0) {
  if (!meta) return "";
  if (meta.image) return meta.image; // audience step itself
  if (audience === "Gentlemen") return meta.man || meta.woman || "";
  if (audience === "Ladies") return meta.woman || meta.man || "";
  // Gender neutral: alternate so both presentations appear
  const pair = optionIndex % 2 === 0 ? meta.woman : meta.man;
  return pair || meta.woman || meta.man || "";
}

const LIFESTYLE_OPTIONS = ["Office / client-facing", "Creative or flexible workplace", "Remote, mostly at home", "On the move — travel, events, varied", "Student life"];
const LIFESTYLE_META = {
  "Office / client-facing": {
    woman: assetUrl("/onboarding/life-office.jpg"),
    man: assetUrl("/onboarding/life-office-man.jpg"),
  },
  "Creative or flexible workplace": {
    woman: assetUrl("/onboarding/life-creative.jpg"),
    man: assetUrl("/onboarding/life-creative-man.jpg"),
  },
  "Remote, mostly at home": {
    woman: assetUrl("/onboarding/life-remote.jpg"),
    man: assetUrl("/onboarding/life-remote-man.jpg"),
  },
  "On the move — travel, events, varied": {
    woman: assetUrl("/onboarding/life-travel.jpg"),
    man: assetUrl("/onboarding/life-travel-man.jpg"),
  },
  "Student life": {
    woman: assetUrl("/onboarding/life-student.jpg"),
    man: assetUrl("/onboarding/life-student-man.jpg"),
  },
};
const ARCHETYPE_OPTIONS = ["Quiet & Tailored", "Relaxed & Considered", "Modern & Sharp", "Warm & Layered", "Classic & Polished", "Minimal & Directional", "Romantic & Soft", "Bold & Expressive"];

const ARCHETYPE_META = {
  "Quiet & Tailored": {
    woman: assetUrl("/styles/style-quiet-tailored.jpg"),
    man: assetUrl("/styles/style-quiet-tailored-man.jpg"),
    descKey: "archQuietDesc",
  },
  "Relaxed & Considered": {
    woman: assetUrl("/styles/style-relaxed-considered.jpg"),
    man: assetUrl("/styles/style-relaxed-considered-man.jpg"),
    descKey: "archRelaxedDesc",
  },
  "Modern & Sharp": {
    woman: assetUrl("/styles/style-modern-sharp.jpg"),
    man: assetUrl("/styles/style-modern-sharp-man.jpg"),
    descKey: "archModernDesc",
  },
  "Warm & Layered": {
    woman: assetUrl("/styles/style-warm-layered.jpg"),
    man: assetUrl("/styles/style-warm-layered-man.jpg"),
    descKey: "archWarmDesc",
  },
  "Classic & Polished": {
    woman: assetUrl("/styles/style-classic-polished.jpg"),
    man: assetUrl("/styles/style-classic-polished-man.jpg"),
    descKey: "archClassicDesc",
  },
  "Minimal & Directional": {
    woman: assetUrl("/styles/style-minimal-directional.jpg"),
    man: assetUrl("/styles/style-minimal-directional-man.jpg"),
    descKey: "archMinimalDesc",
  },
  "Romantic & Soft": {
    woman: assetUrl("/styles/style-romantic-soft.jpg"),
    man: assetUrl("/styles/style-romantic-soft-man.jpg"),
    descKey: "archRomanticDesc",
  },
  "Bold & Expressive": {
    woman: assetUrl("/styles/style-bold-expressive.jpg"),
    man: assetUrl("/styles/style-bold-expressive-man.jpg"),
    descKey: "archBoldDesc",
  },
};
const FIT_OPTIONS = ["Fitted & tailored", "True to size, structured", "Relaxed, room to move", "Oversized, intentionally loose"];
const FIT_META = {
  "Fitted & tailored": {
    woman: assetUrl("/onboarding/fit-fitted.jpg"),
    man: assetUrl("/onboarding/fit-fitted-man.jpg"),
  },
  "True to size, structured": {
    woman: assetUrl("/onboarding/fit-structured.jpg"),
    man: assetUrl("/onboarding/fit-structured-man.jpg"),
  },
  "Relaxed, room to move": {
    woman: assetUrl("/onboarding/fit-relaxed.jpg"),
    man: assetUrl("/onboarding/fit-relaxed-man.jpg"),
  },
  "Oversized, intentionally loose": {
    woman: assetUrl("/onboarding/fit-oversized.jpg"),
    man: assetUrl("/onboarding/fit-oversized-man.jpg"),
  },
};
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
  { id: "audience", titleKey: "stepAudienceTitle", promptKey: "stepAudiencePrompt", type: "visual", options: AUDIENCE_OPTIONS, meta: AUDIENCE_META },
  { id: "lifestyle", titleKey: "step0Title", promptKey: "step0Prompt", type: "visual", options: LIFESTYLE_OPTIONS, meta: LIFESTYLE_META },
  { id: "archetype", titleKey: "step1Title", promptKey: "step1Prompt", type: "archetype", options: ARCHETYPE_OPTIONS },
  { id: "fit", titleKey: "step2Title", promptKey: "step2Prompt", type: "visual", options: FIT_OPTIONS, meta: FIT_META },
  { id: "palette", titleKey: "step3Title", promptKey: "step3Prompt", type: "palette", options: COLOR_OPTIONS },
  { id: "budget", titleKey: "step4Title", promptKey: "step4Prompt", type: "budget", options: BUDGET_OPTIONS },
  { id: "occasions", titleKey: "step5Title", promptKey: "step5Prompt", type: "multi", options: OCCASION_OPTIONS },
  { id: "sizes", titleKey: "step6Title", promptKey: "step6Prompt", type: "sizes" },
];

const DEFAULT_PROFILE = {
  audience: "Ladies",
  archetype: "Quiet Tailored",
  fit: "Fitted & tailored",
  palette: ["Olive", "Ivory / Cream", "Black", "Camel / Tan"],
  budget: "balanced",
  occasions: ["Work", "Events & celebrations"],
  modelGender: "woman",
  favoriteStores: ["zara", "uniqlo", "nordstrom", "suitsupply"],
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
  const audience = answers.audience || "Ladies";

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
      : question.type === "single" || question.type === "budget" || question.type === "archetype" || question.type === "visual"
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

        {question.type === "archetype" && (
          <div className="onb-style-grid">
            {question.options.map((opt, idx) => {
              const meta = ARCHETYPE_META[opt] || {};
              const image = resolveAudienceImage(meta, audience, idx);
              return (
                <button
                  key={opt}
                  type="button"
                  className={`onb-style-card ${answers[question.id] === opt ? "selected" : ""}`}
                  onClick={() => selectSingle(opt)}
                >
                  <img className="onb-style-image" src={image} alt={tOpt(opt)} loading="lazy" />
                  <div className="onb-style-copy">
                    <div className="onb-style-title">{tOpt(opt)}</div>
                    <div className="onb-style-desc">{t(meta.descKey)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {question.type === "visual" && (
          <div className={`onb-visual-grid ${question.options.length === 3 ? "onb-visual-grid-3" : ""}`}>
            {question.options.map((opt, idx) => {
              const meta = (question.meta && question.meta[opt]) || {};
              const image = resolveAudienceImage(meta, audience, idx);
              return (
                <button
                  key={opt}
                  type="button"
                  className={`onb-visual-card ${answers[question.id] === opt ? "selected" : ""}`}
                  onClick={() => selectSingle(opt)}
                >
                  <img className="onb-visual-image" src={image} alt={tOpt(opt)} loading="lazy" />
                  <span className="onb-visual-label">{tOpt(opt)}</span>
                </button>
              );
            })}
          </div>
        )}

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

// ==================== MODEL HERO ====================
// AI-generated model photos wearing the suggested pieces.
// Swaps pick the closest matching pre-rendered look.
function ModelHero({ itemKeys, gender }) {
  const src = resolveModelImage(itemKeys, gender);
  return (
    <div className="model-wrap">
      <img
        className="model-photo"
        src={src}
        alt="Outfit on model"
        loading="lazy"
        decoding="async"
        sizes="(max-width: 767px) 100vw, (max-width: 1023px) 42vw, 340px"
      />
    </div>
  );
}

// ==================== SHOP ACROSS STORES ====================
function ShopSheet({ item, onClose, favoriteStores = [] }) {
  const { t, tName } = useLang();
  const [stock, setStock] = useState({ status: "loading", products: [], scannedAt: null });
  const [showStores, setShowStores] = useState(false);

  useEffect(() => {
    if (!item) return undefined;
    const key = catalogKeyForItem(item);
    if (!key) {
      setStock({ status: "empty", products: [], scannedAt: null });
      return undefined;
    }
    let cancelled = false;
    setStock({ status: "loading", products: [], scannedAt: null });
    fetch(`/stock/${key}.json`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("missing"))))
      .then((data) => {
        if (cancelled) return;
        const products = Array.isArray(data.products) ? data.products : [];
        setStock({
          status: products.length ? "ready" : "empty",
          products,
          scannedAt: data.scannedAt || null,
        });
      })
      .catch(() => {
        if (!cancelled) setStock({ status: "empty", products: [], scannedAt: null });
      });
    return () => {
      cancelled = true;
    };
  }, [item]);

  if (!item) return null;
  const links = storeLinksForItem(item);
  const shoppingUrl = googleShoppingUrl(item.searchQuery || item.name);
  const favSet = new Set(favoriteStores);
  const favoriteLinks = links.filter((s) => favSet.has(s.id));

  const productThumb = (product) => {
    const src = product.image || "";
    if (src && !src.startsWith("data:")) return src;
    return item.image;
  };

  return (
    <div className="shop-overlay" onClick={onClose} role="presentation">
      <div className="shop-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t("shopAcross")}>
        <button type="button" className="shop-close" onClick={onClose} aria-label={t("shopClose")}>
          <X size={16} />
        </button>
        <div className="shop-hero">
          <img className="shop-hero-image" src={item.image} alt={tName(item)} />
          <div className="shop-hero-copy">
            <div className="shop-hero-brand">{item.retailer}</div>
            <div className="shop-hero-name">{tName(item)}</div>
            <div className="shop-hero-sub">{t("shopInStockSub")}</div>
          </div>
        </div>

        <div className="shop-stock">
          <div className="shop-tier-label">{t("shopInStock")}</div>
          {stock.status === "loading" && <div className="shop-stock-status">{t("shopScanning")}</div>}
          {stock.status === "empty" && <div className="shop-stock-status">{t("shopNoStock")}</div>}
          {stock.status === "ready" && (
            <div className="shop-stock-list">
              {stock.products.map((product, idx) => (
                <a
                  key={`${product.url}-${idx}`}
                  className="shop-stock-card"
                  href={product.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <img className="shop-stock-image" src={productThumb(product)} alt="" loading="lazy" />
                  <div className="shop-stock-info">
                    <div className="shop-stock-merchant">{product.merchant || "Retailer"}</div>
                    <div className="shop-stock-title">{product.title}</div>
                    <div className="shop-stock-meta">
                      <span className="shop-stock-price">{product.price}</span>
                      <span className="shop-stock-badge">{product.availability || t("shopInStockBadge")}</span>
                    </div>
                  </div>
                  <span className="shop-stock-buy">
                    {t("shopBuyAt")} <ExternalLink size={12} />
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>

        <a className="shop-google" href={shoppingUrl} target="_blank" rel="noopener noreferrer">
          {t("shopOpenAll")} <ExternalLink size={13} />
        </a>

        <button type="button" className="shop-more-toggle" onClick={() => setShowStores((v) => !v)}>
          {t("shopMoreStores")} {showStores ? "−" : "+"}
        </button>

        {showStores && (
          <>
            {favoriteLinks.length > 0 && (
              <div className="shop-tier">
                <div className="shop-tier-label">{t("shopYourFavorites")}</div>
                <div className="shop-store-grid">
                  {favoriteLinks.map((store) => (
                    <a
                      key={`fav-${store.id}`}
                      className="shop-store-link shop-store-link-fav"
                      href={store.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span>{store.name}</span>
                      <ExternalLink size={12} />
                    </a>
                  ))}
                </div>
              </div>
            )}
            <div className="shop-tiers">
              {STORE_TIERS.map((tier) => {
                const stores = links.filter((s) => s.tier === tier.id);
                if (!stores.length) return null;
                return (
                  <div key={tier.id} className="shop-tier">
                    <div className="shop-tier-label">{t(tier.labelKey)}</div>
                    <div className="shop-store-grid">
                      {stores.map((store) => (
                        <a
                          key={store.id}
                          className={`shop-store-link ${favSet.has(store.id) ? "shop-store-link-fav" : ""}`}
                          href={store.href}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <span>{store.name}</span>
                          <ExternalLink size={12} />
                        </a>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ==================== OUTFIT CARD ====================
function OutfitCard({ outfit, onSwap, onSave, saved, modelGender, onModelGenderChange, favoriteStores }) {
  const { t, tName } = useLang();
  const [shopItem, setShopItem] = useState(null);
  return (
    <div className="card">
      <div className="eyebrow gold">{t("stylistSuggests")}</div>
      <div className="model-gender-row">
        <span className="model-gender-label">{t("modelLabel")}</span>
        <div className="model-gender-switch">
          <button
            type="button"
            className={`model-gender-pill ${modelGender === "woman" ? "active" : ""}`}
            onClick={() => onModelGenderChange?.("woman")}
          >
            {t("modelOnHer")}
          </button>
          <button
            type="button"
            className={`model-gender-pill ${modelGender === "man" ? "active" : ""}`}
            onClick={() => onModelGenderChange?.("man")}
          >
            {t("modelOnHim")}
          </button>
        </div>
      </div>
      <div className="outfit-visual">
        <ModelHero itemKeys={outfit.items} gender={modelGender} />
        <div className="item-list">
          {outfit.items.map((key) => {
            const item = CATALOG[key];
            return (
              <div key={item.id} className="item-row">
                <button
                  type="button"
                  className="item-row-shop"
                  onClick={() => setShopItem(item)}
                  title={t("viewProduct")}
                >
                  <img className="item-row-image" src={item.image} alt={tName(item)} loading="lazy" />
                  <div className="item-row-info">
                    <div className="item-row-brand">{item.retailer}</div>
                    <div className="item-row-name">{tName(item)}</div>
                    <div className="item-row-meta">${item.price} · {t("shopInStock")}</div>
                  </div>
                  <span className="link-btn-sm" aria-hidden="true">
                    <ExternalLink size={11} />
                  </span>
                </button>
                <button
                  type="button"
                  className="swap-btn-sm"
                  onClick={() => onSwap(key)}
                  title={t("swapItem")}
                >
                  <RefreshCw size={11} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <p className="rationale">{outfit.rationale}</p>
      <button className="save-btn" onClick={onSave} disabled={saved}>
        {saved ? <><Check size={12} /> {t("savedLabel")}</> : t("saveOutfit")}
      </button>
      {shopItem && (
        <ShopSheet
          item={shopItem}
          onClose={() => setShopItem(null)}
          favoriteStores={favoriteStores}
        />
      )}
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

function ChatScreen({ messages, onSend, input, setInput, onSwap, onSave, savedIds, pending, modelGender, onModelGenderChange, favoriteStores }) {
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
                <OutfitCard
                  outfit={m.outfit}
                  onSwap={(key) => onSwap(i, key)}
                  onSave={() => onSave(i)}
                  saved={savedIds.has(i)}
                  modelGender={modelGender}
                  onModelGenderChange={onModelGenderChange}
                  favoriteStores={favoriteStores}
                />
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

function WardrobeScreen({ savedOutfits, modelGender, onModelGenderChange, favoriteStores }) {
  const { t } = useLang();
  return (
    <div className="screen">
      <h2 className="screen-title">{t("wardrobeTitle")}</h2>
      {savedOutfits.length === 0 ? (
        <p className="empty-note">{t("wardrobeEmpty")}</p>
      ) : (
        <div className="stack">
          {savedOutfits.map((o, i) => (
            <OutfitCard
              key={i}
              outfit={o}
              onSwap={() => {}}
              onSave={() => {}}
              saved
              modelGender={modelGender}
              onModelGenderChange={onModelGenderChange}
              favoriteStores={favoriteStores}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BagScreen({ savedOutfits, favoriteStores }) {
  const { t, tName } = useLang();
  const [shopItem, setShopItem] = useState(null);
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
              <button
                key={item.id + idx}
                type="button"
                className="bag-row"
                onClick={() => setShopItem(item)}
                title={t("viewProduct")}
              >
                <img className="bag-image" src={item.image} alt={tName(item)} loading="lazy" />
                <div className="bag-info">
                  <div className="bag-brand">{item.retailer}</div>
                  <div className="bag-name">{tName(item)}</div>
                  <div className="bag-price">${item.price} · {t("shopInStock")}</div>
                </div>
                <ExternalLink size={13} color="#8b877a" />
              </button>
            ))}
          </div>
        ))
      )}
      {shopItem && (
        <ShopSheet
          item={shopItem}
          onClose={() => setShopItem(null)}
          favoriteStores={favoriteStores}
        />
      )}
    </div>
  );
}

function ProfileScreen({ profile, onToggleFavoriteStore }) {
  const { t, tOpt } = useLang();
  const favorites = profile.favoriteStores || [];
  const favSet = new Set(favorites);
  const budgetLabel = tOpt((BUDGET_OPTIONS.find((b) => b.key === profile.budget) || {}).label || "Balanced");
  const rows = [
    [t("dressingForLabel"), tOpt(profile.audience || DEFAULT_PROFILE.audience)],
    [t("styleArchetypeLabel"), tOpt(profile.archetype)],
    [t("fitPreferenceLabel"), tOpt(profile.fit)],
    [t("paletteLabel"), (profile.palette || []).map(tOpt).join(", ")],
    [t("budgetLabel"), budgetLabel],
    [t("dressesForLabel"), (profile.occasions || []).map(tOpt).join(", ") || "—"],
  ];
  const favoriteNames = STORE_DIRECTORY.filter((s) => favSet.has(s.id)).map((s) => s.name);

  return (
    <div className="screen">
      <h2 className="screen-title">{t("profileTitle")}</h2>
      <div className="profile-card">
        {rows.map(([label, val]) => (
          <div key={label} className="profile-row"><span className="muted">{label}</span><span>{val}</span></div>
        ))}
      </div>

      <div className="fav-stores-block">
        <div className="section-label">{t("favoriteStoresLabel")}</div>
        <p className="fav-stores-hint">{t("favoriteStoresHint")}</p>
        {favoriteNames.length === 0 ? (
          <p className="empty-note" style={{ marginBottom: 12 }}>{t("favoriteStoresEmpty")}</p>
        ) : (
          <div className="fav-stores-summary">
            {favoriteNames.map((name) => (
              <span key={name} className="fav-store-chip active">{name}</span>
            ))}
          </div>
        )}
        {STORE_TIERS.map((tier) => {
          const stores = STORE_DIRECTORY.filter((s) => s.tier === tier.id);
          return (
            <div key={tier.id} className="fav-store-tier">
              <div className="fav-store-tier-label">{t(tier.labelKey)}</div>
              <div className="fav-store-grid">
                {stores.map((store) => {
                  const selected = favSet.has(store.id);
                  return (
                    <button
                      key={store.id}
                      type="button"
                      className={`fav-store-chip ${selected ? "active" : ""}`}
                      onClick={() => onToggleFavoriteStore?.(store.id)}
                    >
                      {store.name}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
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
  const [answers, setAnswers] = useState({ audience: null, lifestyle: null, archetype: null, fit: null, palette: [], avoid: [], budget: null, occasions: [], sizes: {} });
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
    const nextKey = ALT_MAP[key] || ALT_MAP_REV[key];
    if (!nextKey) return;
    setMessages((m) =>
      m.map((msg, i) => {
        if (i !== msgIndex || msg.role !== "assistant" || !msg.outfit) return msg;
        const newItems = msg.outfit.items.map((k) => (k === key ? nextKey : k));
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
    const audience = answers.audience || DEFAULT_PROFILE.audience;
    const audienceMeta = AUDIENCE_META[audience] || AUDIENCE_META.Ladies;
    const built = {
      audience,
      archetype: archetypeShortEn,
      fit: answers.fit,
      palette: answers.palette.length ? answers.palette : DEFAULT_PROFILE.palette,
      budget: answers.budget,
      occasions: answers.occasions,
      modelGender: audienceMeta.modelGender || DEFAULT_PROFILE.modelGender,
      favoriteStores: profile.favoriteStores || DEFAULT_PROFILE.favoriteStores,
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
        .app-outer{ min-height:100vh; min-height:100dvh; background:#e9e4d6; display:flex; align-items:stretch; justify-content:center; padding:0; font-family:'Inter',sans-serif; }
        .phone{ width:100%; max-width:100%; height:100dvh; background:#F6F1E7; border-radius:0; border:none; box-shadow:none; overflow:hidden; position:relative; display:flex; flex-direction:column; }
        .notch{ display:none; }
        .phone-body{ flex:1; overflow:hidden; padding-top:0; min-height:0; display:flex; flex-direction:column; }
        .desktop-sidebar{ display:none; }
        .screen{ padding:24px 20px 90px; height:100%; overflow-y:auto; box-sizing:border-box; -webkit-overflow-scrolling:touch; }

        /* Phone */
        @media (max-width: 767px) {
          .app-outer{ background:#F6F1E7; }
          .phone-body{ padding-top: env(safe-area-inset-top, 0px); }
          .tabbar{ padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px)); }
          .lang-switcher-corner{ top: calc(12px + env(safe-area-inset-top, 0px)); }
          .outfit-visual{ flex-direction:column; }
          .model-wrap{ width:100%; max-width:none; aspect-ratio:3/4; max-height:min(58vh, 520px); }
          .bubble-assistant{ max-width:100%; }
          .card{ padding:14px; }
          .item-row-image{ width:64px; height:64px; }
        }

        /* Tablet */
        @media (min-width: 768px) and (max-width: 1023px) {
          .app-outer{ padding:0; }
          .phone{ height:100dvh; }
          .outfit-visual{ gap:16px; }
          .model-wrap{ width:46%; max-width:340px; }
          .bubble-assistant{ max-width:100%; }
          .screen{ padding:28px 32px 100px; max-width:820px; width:100%; margin:0 auto; }
          .chat-body{ padding:20px 28px; }
          .home-name{ font-size:32px; }
          .onb-screen{ max-width:560px; margin:0 auto; }
          .item-row-image{ width:68px; height:68px; }
        }

        /* Desktop / PC — real website layout */
        @media (min-width: 1024px) {
          .app-outer{
            padding:0;
            background:
              radial-gradient(ellipse at 12% 0%, rgba(198,165,103,0.16), transparent 42%),
              radial-gradient(ellipse at 90% 100%, rgba(62,66,40,0.08), transparent 38%),
              #efe9da;
          }
          .phone{
            max-width:none;
            width:100%;
            height:100dvh;
            background:transparent;
            display:flex;
            flex-direction:row;
            align-items:stretch;
          }
          .desktop-sidebar{
            display:flex;
            flex-direction:column;
            width:232px;
            flex-shrink:0;
            background:#0B0B0C;
            color:#F6F1E7;
            padding:28px 18px;
            box-sizing:border-box;
          }
          .desktop-brand{
            font-family:'Fraunces',serif;
            font-size:28px;
            color:#C6A567;
            margin:0 0 8px;
            font-weight:400;
            letter-spacing:0.02em;
          }
          .desktop-brand-sub{
            font-size:11px;
            color:#8b877a;
            letter-spacing:0.12em;
            text-transform:uppercase;
            margin-bottom:36px;
          }
          .desktop-nav{ display:flex; flex-direction:column; gap:6px; flex:1; }
          .desktop-nav-btn{
            display:flex; align-items:center; gap:12px;
            background:transparent; border:none; color:#bdb7a8;
            padding:12px 14px; border-radius:6px; cursor:pointer;
            font-family:'Inter',sans-serif; font-size:13.5px; text-align:left;
            transition:background .15s, color .15s;
          }
          .desktop-nav-btn:hover{ background:rgba(246,241,231,0.06); color:#F6F1E7; }
          .desktop-nav-btn.active{ background:rgba(198,165,103,0.14); color:#C6A567; }
          .phone-body{
            flex:1;
            background:#F6F1E7;
            min-width:0;
          }
          .tabbar{ display:none !important; }
          .screen{ padding:40px 56px 48px; max-width:1100px; width:100%; margin:0 auto; box-sizing:border-box; }
          .chat-wrap{ height:100%; }
          .chat-header{ padding:22px 56px; max-width:1100px; width:100%; margin:0 auto; box-sizing:border-box; }
          .chat-body{ padding:28px 56px; max-width:1100px; width:100%; margin:0 auto; box-sizing:border-box; gap:18px; }
          .chat-input-row{ padding:18px 56px; max-width:1100px; width:100%; margin:0 auto; box-sizing:border-box; }
          .bubble-assistant{ max-width:900px; }
          .bubble-user{ max-width:50%; font-size:14px; }
          .home-name{ font-size:42px; }
          .dna-card{ padding:24px; max-width:640px; }
          .outfit-visual{ gap:28px; }
          .model-wrap{ width:48%; max-width:380px; min-height:480px; }
          .item-row{ padding:12px 14px; }
          .item-row-image{ width:72px; height:72px; }
          .item-row-brand{ font-size:10.5px; }
          .item-row-name{ font-size:13px; white-space:normal; }
          .item-row-meta{ font-size:12px; }
          .item-row-meta{ font-size:12px; }
          .rationale{ font-size:15px; max-width:56ch; }
          .card{ padding:24px; }
          .onb-screen{ max-width:640px; margin:0 auto; padding:48px 40px; }
          .onb-hero-title{ font-size:48px; }
          .onb-primary-btn{ max-width:320px; }
          .onb-card-grid{ grid-template-columns:1fr 1fr; gap:14px; }
          /* When onboarding (no sidebar), center the welcome experience */
          .phone.onboarding-mode{ justify-content:center; }
          .phone.onboarding-mode .phone-body{ max-width:720px; margin:24px auto; border-radius:16px; border:1px solid #d9d2c2; box-shadow:0 20px 50px rgba(0,0,0,0.08); height:calc(100dvh - 48px); }
        }
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
        .outfit-visual{ display:flex; gap:12px; margin-bottom:14px; align-items:stretch; }
        .model-wrap{ width:148px; flex-shrink:0; border-radius:6px; overflow:hidden; background:#151513; aspect-ratio:3/4; }
        .model-photo{ width:100%; height:100%; object-fit:cover; object-position:center top; display:block; image-rendering:auto; -webkit-backface-visibility:hidden; transform:translateZ(0); }
        .model-gender-row{ display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px; }
        .model-gender-label{ font-size:10px; letter-spacing:0.08em; text-transform:uppercase; color:#8b877a; }
        .model-gender-switch{ display:flex; gap:4px; }
        .model-gender-pill{ font-size:10px; letter-spacing:0.04em; padding:5px 10px; border-radius:999px; border:1px solid #2a2a26; background:#151513; color:#8b877a; cursor:pointer; font-family:'Inter',sans-serif; }
        .model-gender-pill.active{ background:#C6A567; color:#0B0B0C; border-color:#C6A567; }
        .item-list{ flex:1; display:flex; flex-direction:column; gap:8px; min-width:0; }
        .item-row{ display:flex; align-items:center; gap:8px; background:#151513; border:1px solid #2a2a26; border-radius:4px; padding:6px; color:inherit; }
        .item-row:hover{ border-color:#C6A567; }
        .item-row-shop{ flex:1; min-width:0; display:flex; align-items:center; gap:10px; background:none; border:none; padding:2px; cursor:pointer; text-align:left; color:inherit; font-family:'Inter',sans-serif; }
        .item-row-image{ width:60px; height:60px; border-radius:5px; object-fit:cover; flex-shrink:0; background:#1c1c19; }
        .item-row-info{ flex:1; min-width:0; display:block; }
        .item-row-brand{ font-size:9.5px; letter-spacing:0.08em; text-transform:uppercase; color:#C6A567; margin-bottom:2px; }
        .item-row-name{ font-size:11.5px; line-height:1.3; color:#F6F1E7; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .item-row-meta{ font-size:10.5px; color:#8b877a; margin-top:2px; }
        .swap-btn-sm{ flex-shrink:0; background:none; border:1px solid #2a2a26; border-radius:4px; color:#8b877a; padding:6px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .2s; }
        .swap-btn-sm:hover{ color:#C6A567; border-color:#C6A567; }
        .link-btn-sm{ flex-shrink:0; background:none; border:1px solid #2a2a26; border-radius:4px; color:#8b877a; padding:6px; display:flex; align-items:center; justify-content:center; }

        .shop-overlay{ position:fixed; inset:0; background:rgba(11,11,12,0.55); z-index:80; display:flex; align-items:flex-end; justify-content:center; padding:16px; box-sizing:border-box; }
        .shop-sheet{ width:min(560px, 100%); max-height:min(88vh, 760px); overflow:auto; background:#F6F1E7; border-radius:16px 16px 12px 12px; padding:20px 18px 24px; position:relative; box-shadow:0 24px 60px rgba(0,0,0,0.35); }
        .shop-close{ position:absolute; top:14px; right:14px; background:#fff; border:1px solid #e6e0d2; border-radius:999px; width:32px; height:32px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#0B0B0C; }
        .shop-hero{ display:flex; gap:14px; align-items:center; padding-right:36px; margin-bottom:16px; }
        .shop-hero-image{ width:104px; height:104px; border-radius:10px; object-fit:cover; background:#fff; flex-shrink:0; }
        .shop-hero-brand{ font-size:10px; letter-spacing:0.1em; text-transform:uppercase; color:#A8895C; margin-bottom:4px; }
        .shop-hero-name{ font-family:'Fraunces',serif; font-size:20px; color:#0B0B0C; line-height:1.25; margin-bottom:6px; }
        .shop-hero-sub{ font-size:12.5px; color:#5b5748; font-weight:300; }
        .shop-google{ display:flex; align-items:center; justify-content:center; gap:8px; width:100%; box-sizing:border-box; background:#0B0B0C; color:#C6A567; text-decoration:none; border-radius:6px; padding:12px 14px; font-size:12px; letter-spacing:0.04em; text-transform:uppercase; font-weight:600; margin-bottom:12px; }
        .shop-more-toggle{ width:100%; background:transparent; border:none; color:#5b5748; font-size:11px; letter-spacing:0.1em; text-transform:uppercase; padding:8px 0 14px; cursor:pointer; text-align:left; }
        .shop-stock{ margin-bottom:16px; }
        .shop-stock-status{ font-size:13px; color:#5b5748; font-weight:300; padding:8px 0 4px; }
        .shop-stock-list{ display:flex; flex-direction:column; gap:8px; }
        .shop-stock-card{ display:grid; grid-template-columns:64px 1fr auto; gap:10px; align-items:center; background:#fff; border:1px solid #e6e0d2; border-radius:8px; padding:10px; text-decoration:none; color:#0B0B0C; transition:border-color .15s; }
        .shop-stock-card:hover{ border-color:#C6A567; }
        .shop-stock-image{ width:64px; height:64px; object-fit:cover; border-radius:6px; background:#f0ebe0; }
        .shop-stock-merchant{ font-size:10px; letter-spacing:0.08em; text-transform:uppercase; color:#A8895C; margin-bottom:2px; }
        .shop-stock-title{ font-size:12.5px; line-height:1.3; color:#0B0B0C; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
        .shop-stock-meta{ display:flex; align-items:center; gap:8px; margin-top:6px; flex-wrap:wrap; }
        .shop-stock-price{ font-size:13px; font-weight:600; color:#0B0B0C; }
        .shop-stock-badge{ font-size:10px; letter-spacing:0.06em; text-transform:uppercase; color:#2f6b45; background:#e8f3eb; padding:3px 7px; border-radius:4px; }
        .shop-stock-buy{ display:inline-flex; align-items:center; gap:4px; font-size:11px; letter-spacing:0.04em; text-transform:uppercase; color:#8b877a; white-space:nowrap; }
        .shop-tiers{ display:flex; flex-direction:column; gap:16px; }
        .shop-tier-label{ font-size:10px; letter-spacing:0.12em; text-transform:uppercase; color:#8b877a; margin-bottom:8px; }
        .shop-store-grid{ display:grid; grid-template-columns:1fr 1fr; gap:8px; }
        .shop-store-link{ display:flex; align-items:center; justify-content:space-between; gap:8px; background:#fff; border:1px solid #e6e0d2; border-radius:6px; padding:11px 12px; text-decoration:none; color:#0B0B0C; font-size:12.5px; transition:border-color .15s; }
        .shop-store-link:hover{ border-color:#C6A567; }

        @media (min-width: 1024px) {
          .shop-overlay{ align-items:center; }
          .shop-sheet{ border-radius:14px; max-height:min(82vh, 820px); padding:24px; }
          .shop-store-grid{ grid-template-columns:1fr 1fr 1fr; }
        }
        .rationale{ font-size:12.5px; line-height:1.6; color:#E9E2D2; font-weight:300; margin:0 0 16px; }
        .save-btn{ width:100%; display:flex; align-items:center; justify-content:center; gap:6px; font-size:11px; letter-spacing:0.05em; text-transform:uppercase; font-weight:600; padding:11px; border-radius:4px; background:#C6A567; color:#0B0B0C; border:none; cursor:pointer; font-family:'Inter',sans-serif; transition:background .2s; }
        .save-btn:hover:not(:disabled){ background:#F6F1E7; }
        .save-btn:disabled{ opacity:0.55; cursor:default; }

        .screen-title{ font-family:'Fraunces',serif; font-size:21px; color:#0B0B0C; font-weight:400; margin:0 0 20px; }
        .empty-note{ font-size:12.5px; color:#8b877a; font-weight:300; }
        .stack{ display:flex; flex-direction:column; gap:12px; }

        .retailer-group{ margin-bottom:20px; }
        .bag-row{ display:flex; align-items:center; gap:12px; width:100%; box-sizing:border-box; background:#fff; border:1px solid #e6e0d2; border-radius:4px; padding:10px; margin-bottom:8px; text-decoration:none; color:inherit; transition:border-color .2s; cursor:pointer; font-family:'Inter',sans-serif; text-align:left; }
        .bag-row:hover{ border-color:#C6A567; }
        .bag-image{ width:72px; height:72px; border-radius:6px; object-fit:cover; flex-shrink:0; background:#f4efe4; }
        .bag-info{ flex:1; min-width:0; }
        .bag-brand{ font-size:10px; letter-spacing:0.08em; text-transform:uppercase; color:#A8895C; margin-bottom:2px; }
        .bag-name{ font-size:13px; color:#0B0B0C; }
        .bag-price{ font-size:12px; color:#8b877a; margin-top:2px; }
        .checkout-btn{ width:100%; box-sizing:border-box; display:flex; align-items:center; justify-content:center; font-size:10.5px; letter-spacing:0.05em; text-transform:uppercase; color:#0B0B0C; background:none; border:1px solid #0B0B0C; border-radius:4px; padding:10px; cursor:pointer; margin-top:4px; font-family:'Inter',sans-serif; text-decoration:none; transition:all .2s; }
        .checkout-btn:hover{ background:#0B0B0C; color:#C6A567; }

        .profile-card{ background:#fff; border:1px solid #e6e0d2; border-radius:4px; }
        .profile-row{ display:flex; justify-content:space-between; gap:12px; padding:12px 16px; font-size:12.5px; border-bottom:1px solid #e6e0d2; }
        .profile-row span:last-child{ text-align:right; }
        .profile-row:last-child{ border-bottom:none; }
        .profile-lang-row{ display:flex; align-items:center; justify-content:space-between; margin-top:16px; font-size:12.5px; }
        .muted{ color:#8b877a; }
        .fav-stores-block{ margin-top:28px; }
        .fav-stores-hint{ font-size:12.5px; color:#5b5748; font-weight:300; margin:0 0 14px; }
        .fav-stores-summary{ display:flex; flex-wrap:wrap; gap:8px; margin-bottom:18px; }
        .fav-store-tier{ margin-bottom:16px; }
        .fav-store-tier-label{ font-size:10px; letter-spacing:0.1em; text-transform:uppercase; color:#8b877a; margin-bottom:8px; }
        .fav-store-grid{ display:flex; flex-wrap:wrap; gap:8px; }
        .fav-store-chip{
          font-size:12px; padding:9px 12px; border-radius:999px; border:1px solid #e6e0d2;
          background:#fff; color:#5b5748; cursor:pointer; font-family:'Inter',sans-serif; transition:all .15s;
        }
        .fav-store-chip.active{ background:#0B0B0C; color:#C6A567; border-color:#0B0B0C; }
        .shop-store-link-fav{ border-color:#C6A567; background:#faf6ec; }

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
        .onb-style-grid{ display:grid; grid-template-columns:1fr; gap:14px; padding-bottom:12px; }
        .onb-style-card{
          display:flex; gap:14px; align-items:stretch; text-align:left;
          background:#fff; border:1.5px solid #e6e0d2; border-radius:12px; padding:10px;
          cursor:pointer; font-family:'Inter',sans-serif; transition:all .15s; color:#0B0B0C;
        }
        .onb-style-card.selected{ border-color:#C6A567; background:#faf6ec; box-shadow:0 0 0 1px #C6A567; }
        .onb-style-image{ width:112px; height:150px; object-fit:cover; border-radius:8px; flex-shrink:0; background:#efe9da; }
        .onb-style-copy{ display:flex; flex-direction:column; justify-content:center; min-width:0; padding-right:4px; }
        .onb-style-title{ font-family:'Fraunces',serif; font-size:17px; margin-bottom:6px; line-height:1.25; }
        .onb-style-desc{ font-size:12.5px; color:#5b5748; font-weight:300; line-height:1.45; }
        @media (min-width: 768px) {
          .onb-style-grid{ grid-template-columns:1fr 1fr; gap:16px; }
          .onb-style-image{ width:128px; height:170px; }
          .onb-style-title{ font-size:18px; }
          .onb-style-desc{ font-size:13px; }
        }
        @media (min-width: 1024px) {
          .onb-style-grid{ grid-template-columns:1fr 1fr; max-width:760px; }
        }
        .onb-budget-list{ display:flex; flex-direction:column; gap:10px; }
        .onb-budget-card{ text-align:left; background:#fff; border:1.5px solid #e6e0d2; border-radius:4px; padding:14px 16px; cursor:pointer; font-family:'Inter',sans-serif; transition:all .15s; }
        .onb-budget-card.selected{ border-color:#C6A567; background:#faf6ec; }
        .onb-budget-label{ font-size:13.5px; color:#0B0B0C; margin-bottom:2px; }
        .onb-budget-sub{ font-size:11px; color:#8b877a; }
        .onb-visual-grid{ display:grid; grid-template-columns:1fr 1fr; gap:12px; padding-bottom:12px; }
        .onb-visual-grid-3{ grid-template-columns:1fr 1fr 1fr; gap:10px; }
        .onb-visual-card{
          display:flex; flex-direction:column; gap:10px; text-align:left;
          background:#fff; border:1.5px solid #e6e0d2; border-radius:12px; padding:8px 8px 12px;
          cursor:pointer; font-family:'Inter',sans-serif; transition:all .15s; overflow:hidden;
        }
        .onb-visual-card.selected{ border-color:#C6A567; background:#faf6ec; box-shadow:0 0 0 1px #C6A567; }
        .onb-visual-image{ width:100%; aspect-ratio:3/4; object-fit:cover; border-radius:8px; background:#efe9da; display:block; }
        .onb-visual-label{ font-family:'Fraunces',serif; font-size:14px; line-height:1.3; color:#0B0B0C; padding:0 4px; }
        .onb-visual-grid-3 .onb-visual-label{ font-size:12.5px; text-align:center; padding:0 2px; }
        @media (min-width:720px){
          .onb-visual-grid{ grid-template-columns:1fr 1fr; gap:16px; max-width:680px; }
          .onb-visual-grid-3{ grid-template-columns:1fr 1fr 1fr; max-width:780px; }
          .onb-visual-label{ font-size:15px; }
          .onb-visual-grid-3 .onb-visual-label{ font-size:14px; }
        }
        .onb-swatch-grid{ display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px; }
        .onb-swatch-card{ display:flex; flex-direction:column; align-items:center; gap:10px; background:#fff; border:1.5px solid #e6e0d2; border-radius:10px; padding:14px 10px 12px; cursor:pointer; font-family:'Inter',sans-serif; transition:all .15s; }
        .onb-swatch-card.selected{ border-color:#C6A567; background:#faf6ec; box-shadow:0 0 0 1px #C6A567; }
        .onb-swatch-card.avoid.selected{ border-color:#a85832; background:#fbf1ec; box-shadow:0 0 0 1px #a85832; }
        .onb-swatch-dot{ width:56px; height:56px; border-radius:14px; border:1px solid rgba(0,0,0,0.1); box-shadow:inset 0 0 0 1px rgba(255,255,255,0.25); flex-shrink:0; }
        .onb-swatch-label{ font-size:12px; color:#5b5748; text-align:center; line-height:1.3; font-weight:500; }
        @media (min-width:720px){
          .onb-swatch-grid{ grid-template-columns:1fr 1fr 1fr; gap:14px; }
          .onb-swatch-dot{ width:64px; height:64px; border-radius:16px; }
          .onb-swatch-label{ font-size:12.5px; }
        }
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

      <div className={`phone ${stage !== "app" ? "onboarding-mode" : ""}`}>
        <div className="notch" />
        {stage === "app" && (
          <aside className="desktop-sidebar" aria-label="Main navigation">
            <div className="desktop-brand">Vestra</div>
            <div className="desktop-brand-sub">AI Stylist</div>
            <nav className="desktop-nav">
              {tabs.map(({ id, labelKey, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={`desktop-nav-btn ${tab === id ? "active" : ""}`}
                  onClick={() => setTab(id)}
                >
                  <Icon size={18} color={tab === id ? "#C6A567" : "#8b877a"} strokeWidth={tab === id ? 2.2 : 1.6} />
                  <span>{t(labelKey)}</span>
                </button>
              ))}
            </nav>
          </aside>
        )}
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
                <ChatScreen
                  messages={messages}
                  input={input}
                  setInput={setInput}
                  onSend={() => sendMessage()}
                  onSwap={handleSwap}
                  onSave={handleSave}
                  savedIds={savedIds}
                  pending={pending}
                  modelGender={profile.modelGender || "woman"}
                  onModelGenderChange={(g) => setProfile((p) => ({ ...p, modelGender: g }))}
                  favoriteStores={profile.favoriteStores || []}
                />
              )}
              {tab === "wardrobe" && (
                <WardrobeScreen
                  savedOutfits={savedOutfits}
                  modelGender={profile.modelGender || "woman"}
                  onModelGenderChange={(g) => setProfile((p) => ({ ...p, modelGender: g }))}
                  favoriteStores={profile.favoriteStores || []}
                />
              )}
              {tab === "bag" && (
                <BagScreen
                  savedOutfits={savedOutfits}
                  favoriteStores={profile.favoriteStores || []}
                />
              )}
              {tab === "profile" && (
                <ProfileScreen
                  profile={profile}
                  onToggleFavoriteStore={(storeId) => {
                    setProfile((p) => {
                      const current = p.favoriteStores || [];
                      const next = current.includes(storeId)
                        ? current.filter((id) => id !== storeId)
                        : [...current, storeId];
                      return { ...p, favoriteStores: next };
                    });
                  }}
                />
              )}
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

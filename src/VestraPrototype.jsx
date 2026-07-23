import React, { useState, useRef, useEffect, useCallback, useMemo, memo, createContext, useContext } from "react";
import { Home, MessageCircle, Bookmark, ShoppingBag, User, Send, RefreshCw, Check, Sparkles, ArrowLeft, ExternalLink, X } from "lucide-react";
import { fetchStylistLooks, isWeekPlanPrompt } from "./stylistApi";
import { clearHeroCache } from "./heroApi";
import { supabase, supabaseConfigured } from "./supabaseClient";
import { CatalogImage } from "./CatalogImage";
import {
  signUpWithEmail,
  signInWithEmail,
  signOut,
  getSessionUser,
  fetchCloudProfile,
  upsertCloudProfile,
  fetchCloudSavedOutfits,
  syncCloudSavedOutfits,
  rowToProfile,
  localHasImportableData,
} from "./cloudProfile";
import {
  fetchBillingStatus,
  startCheckout,
  openCustomerPortal,
  cancelProSubscription,
  requestAccountDeletion,
  getAccessToken,
  FREE_STYLIST_LIMIT,
} from "./billingApi";
import { pickHomeHeroPhoto } from "./homeHeroPhotos";
import { pickOutfitHeroPhoto } from "./outfitHeroPhotos";
import {
  CATALOG,
  ITEM_FAMILY_VARIANTS,
  catalogSource,
  pickLiveForFamily,
  occasionFormalityTarget,
  liveCatalogItems,
  itemFitsOccasion,
} from "./catalogStore";
import { ensureProductCatalog } from "./productCatalogApi";
import { formalityScore } from "./formality";
import {
  detectOccasions as detectOccasionsShared,
  remapOutfitItemsToLive as remapOutfitItemsToLiveShared,
  sanitizeOutfitForOccasion as sanitizeOutfitForOccasionShared,
  catalogPayloadForStylist as catalogPayloadForStylistShared,
  composeLiveOccasionOutfits,
} from "./occasionPipeline";
import { buildWhyThisWorks } from "./styleAttributes";

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
    welcomeSub: "Vestra is an AI personal stylist for men. Describe an occasion, get a complete coordinated outfit, and buy each piece from top retailers.", getStarted: "Get Started", skipTesting: "Skip for testing → see the app",
    downloadAppLabel: "Get the app",
    downloadIos: "Download for iPhone",
    downloadAndroid: "Download for Android",
    downloadIosTitle: "Install Vestra on iPhone",
    downloadAndroidTitle: "Install Vestra on Android",
    downloadIosSteps: "1. Open this page in Safari\n2. Tap the Share button\n3. Tap “Add to Home Screen”\n4. Tap Add — Vestra installs like an app",
    downloadAndroidSteps: "1. Open this page in Chrome\n2. Tap “Install” or the menu (⋮)\n3. Tap “Install app” / “Add to Home screen”\n4. Open Vestra from your home screen",
    downloadInstallNow: "Install now",
    downloadGotIt: "Got it",
    downloadOpenStore: "Open store",
    downloadUnavailable: "Store listing coming soon — install to your home screen for the full app.",
    createAccountEyebrow: "Account", whereReachYouLine1: "Create your account", whereReachYouLine2: "or log in to sync Style DNA.",
    namePlaceholder: "Your first name", emailPlaceholder: "your@email.com", continueBtn: "Continue",
    signupEmailLabel: "Email", signupPasswordLabel: "Password", passwordPlaceholder: "At least 6 characters",
    signupNote: "Guests can still skip — Style DNA stays on this device until you create an account.",
    signupLegalAgree: "By signing up, you agree to our {terms} and {privacy}.",
    footerTerms: "Terms",
    footerPrivacy: "Privacy",
    footerSupport: "Support",
    nameRequired: "Please enter your name to continue.",
    emailRequired: "Add a valid email.",
    passwordRequired: "Password must be at least 6 characters.",
    authModeSignup: "Sign up", authModeLogin: "Log in",
    authSubmitSignup: "Create account", authSubmitLogin: "Log in",
    authBusy: "One moment…",
    authErrorGeneric: "Couldn’t sign in. Check your email and password.",
    authCloudOff: "Cloud accounts aren’t configured yet — continue with name only, or skip for testing.",
    authCheckEmailTitle: "Check your email",
    authCheckEmailBody: "We sent a confirmation link to {email}. Open it, then come back and log in.",
    authCheckEmailHint: "Tip: for faster testing, in Supabase → Authentication → Providers → Email, turn Confirm email OFF.",
    authAccountExists: "That email already has an account — switch to Log in.",
    authSignedInAs: "Signed in as {email}",
    authLogOut: "Log out",
    authLocalOnly: "Saved on this device only",
    importLocalTitle: "Save your Style DNA to this account?",
    importLocalBody: "We found a style profile on this device. Import it so your looks sync when you log in elsewhere — or start fresh.",
    importLocalYes: "Save to my account",
    importLocalNo: "Start fresh",
    step0Title: "How would you describe your day-to-day?", step0Prompt: "Pick the photo that feels closest to your days.",
    lifeOfficeDesc: "Meetings, clients, and polished days that need to look intentional.",
    lifeCreativeDesc: "Flexible workplaces where you can dress with a little more ease.",
    lifeRemoteDesc: "Mostly at home — elevated casual that still feels put together.",
    lifeTravelDesc: "Travel, events, and days that change — versatile layers.",
    lifeStudentDesc: "Campus life and moving between classes, work, and evenings.",
    step1Title: "Which of these feels most like you?", step1Prompt: "Not sure of the name? Pick the photo that feels most like you.",
    archQuietDesc: "Clean lines, refined fits, nothing loud — polished without trying too hard.",
    archRelaxedDesc: "Easy fabrics, soft structure, put-together but never stiff.",
    archModernDesc: "Crisp silhouettes, strong shapes, contemporary and intentional.",
    archWarmDesc: "Textures, layers, and earthy tones that feel inviting and lived-in.",
    archClassicDesc: "Classy, timeless pieces you’d wear for years — neat, reliable, elegant.",
    archMinimalDesc: "Fewer pieces, quieter colors, strong proportions that do the talking.",
    archRomanticDesc: "Soft fabrics, easy drape, and a warmer, more relaxed mood.",
    archBoldDesc: "Statement color, presence, and outfits people remember.",
    archStreetDesc: "Urban ease — sunglasses, looser cuts, cool without trying for the boardroom.",
    archSexyDesc: "Evening-ready energy — darker tones, sharper lines, intentional presence.",
    archEdgyDesc: "Contrast and attitude — modern with a harder edge, never too polite.",
    step2Title: "How do you like things to fit?", step2Prompt: "When you get dressed, you lean toward—",
    step3Title: "Let's talk color.", step3Prompt: "Which of these do you find yourself reaching for? Pick a few.",
    step4Title: "Every stylist should respect your budget.", step4Prompt: "For a typical piece, where are you most comfortable?",
    step5Title: "What do you find yourself dressing for most?", step5Prompt: "Pick all that fit — photos help.",
    occWorkDesc: "Office days, meetings, and looking sharp at work.",
    occDateDesc: "Dinner out, evenings, and dressing up a little.",
    occTravelDesc: "Trips, airports, and outfits that move with you.",
    occEventsDesc: "Weddings, parties, and celebrations that call for polish.",
    occEverydayDesc: "Regular days when you just want to feel put together.",
    step6Title: "Last thing — just so we get the fit right.", step6Prompt: "You can skip this and add it later.",
    anyColorsAvoid: "Any colors to avoid?", colorsToAvoidLabel: "Colors to avoid",
    sizeTops: "Tops", sizeBottoms: "Bottoms", sizeShoes: "Shoes", sizePlaceholder: "e.g. M, 32, 10", finishBtn: "Finish",
    yourStyleDna: "Your Style DNA", gravitateToward: "You gravitate toward", piecesIn: "pieces in",
    dressWithIntentionFor: "and dress with intention for", everydayLife: "everyday life", consideredPalette: "a considered palette",
    oneMoreThing: "One More Thing", anythingHorizonLine1: "Anything on the", anythingHorizonLine2: "horizon?",
    occasionSub: "Tell us and we'll have a real outfit ready the moment you meet your stylist.",
    occasionPlaceholder: "e.g. wedding in June, semi-formal", meetYourStylist: "Meet Your Stylist", notSureYet: "Not sure yet — just exploring",
    chipWedding: "Wedding", chipWorkEvent: "Work event", chipDateNight: "Dinner plans", chipWeekendTrip: "Weekend trip",
    goodEvening: "Good evening", styleDnaLabel: "Style DNA", silhouettesWord: "silhouettes", budgetWord: "budget",
    askYourStylist: "Ask your stylist", askPlaceholder: "Tell your stylist what you need…",
    chipDressWedding: "Dress me for a wedding", chipWorkDinner: "Work dinner tonight", chipWeekendCasual: "Weekend, nothing fussy",
    chipWeekPlan: "Plan my week — 5 looks",
    chipStreetwear: "Streetwear vibes", chipClassy: "Classy & elegant", chipSexyNight: "Sexy night out", chipModernLook: "Modern & sharp",
    chipMoreCasual: "More casual", chipAddBlazer: "Add a blazer", chipUnder200: "Under $200 / piece", chipDifferentBelt: "Different belt",
    chipMoreStreet: "More streetwear", chipMakeSexy: "Make it sexier", chipMoreClassy: "More classy", chipMoreModern: "More modern",
    refineLooks: "Refine these looks",
    stylistLive: "Styled with your profile live.",
    yourStylist: "Your Stylist", chatEmpty: "Tell me what you're dressing for — streetwear, classy, sexy, modern, an occasion, anything.",
    composing: "Composing your outfit…", revising: "Tweaking that piece…",
    chatInputPlaceholder: "e.g. streetwear, sexy dinner, classy event…",
    stylistSuggests: "Your Stylist Suggests", stylistLook: "Look", saveOutfit: "Save Outfit", savedLabel: "Saved",
    stylistPicksIntro: "Three different style directions — tap any piece to shop what's in stock.",
    stylistMoodIntro: "Three looks in this style — each piece shops the matching genre, not a generic dress code.",
    weekPlanIntro: "Your Mon–Fri plan — five looks, no repeat silhouettes, one shopping list.",
    weekShoppingList: "Week shopping list",
    weekDayMon: "Monday", weekDayTue: "Tuesday", weekDayWed: "Wednesday", weekDayThu: "Thursday", weekDayFri: "Friday",
    styleFamilyStreetwear: "Streetwear", styleFamilyClassy: "Classy", styleFamilySexy: "Sexy",
    styleFamilyModern: "Modern", styleFamilyEdgy: "Edgy", styleFamilyRomantic: "Romantic",
    styleFamilyMinimal: "Minimal", styleFamilyBold: "Bold", styleFamilyRelaxed: "Relaxed",
    stylistRevisionIntro: "Updated — I changed the {item}. Everything else stays.",
    stylistRevisionMulti: "Updated — I swapped the pieces you flagged. Everything else stays.",
    stylistRevisionRemoved: "Updated — I dropped the {item} and finished the look differently.",
    wardrobeTitle: "Wardrobe", wardrobeEmpty: "Outfits you save from your stylist will live here.",
    bagTitle: "Bag", bagEmpty: "Save an outfit to see its items here, grouped by retailer.", checkoutWith: "Checkout with",
    profileTitle: "Profile", nameLabel: "Name", styleArchetypeLabel: "Style Archetype", fitPreferenceLabel: "Fit Preference",
    lifestyleLabel: "Day-to-day",
    paletteLabel: "Palette", budgetLabel: "Budget", dressesForLabel: "Dresses For",
    prototypeNote: "Guests: Style DNA stays on this device. Create an account to sync across phones.", languageLabel: "Language",
    deleteProfileLabel: "Start over",
    deleteProfileTitle: "Delete your style profile?",
    deleteProfileBody: "This clears your Style DNA, saved outfits, bag, and stylist chat so you can retake the quiz. Style changes — start fresh whenever you want.",
    deleteProfileConfirm: "Delete & start over",
    deleteProfileCancel: "Keep my profile",
    navHome: "Home", navStylist: "Stylist", navWardrobe: "Wardrobe", navBag: "Bag", navProfile: "Profile",
    viewProduct: "Shop this item", swapItem: "Swap this item",
    heroGenerating: "Dressing the model…",
    heroInspiration: "Style inspiration",
    shopAcross: "Shop across stores", shopAcrossSub: "Search this piece from budget to luxury",
    shopClose: "Close", shopTierBudget: "Value", shopTierMarketplace: "Marketplaces", shopTierCatalog: "In our catalog", shopTierHighStreet: "High street", shopTierPremium: "Premium", shopTierLuxury: "Luxury", shopTierOutlet: "Outlet & resale",
    shopOpenAll: "Open Google Shopping",
    favoriteStoresLabel: "Favorite stores",
    favoriteStoresHint: "Tap to add or remove stores you shop from most.",
    favoriteStoresEmpty: "No favorites yet — pick a few below.",
    shopYourFavorites: "Your favorites",
    shopInStock: "In stock now",
    shopInStockSub: "Listings matched to your palette",
    shopInStockBadge: "In stock",
    shopBuyAt: "Buy",
    shopScanning: "Scanning stores for availability…",
    shopNoStock: "No in-palette listings yet — search Google or a store with your colors below.",
    shopMoreStores: "Browse all stores",
    shopStoreCount: "{count} stores",
    shopPaletteFilter: "Colors: {colors}",
    shopSearchingAs: "Searching as: {query}",
    billingTitle: "Plan & billing",
    billingFreePlan: "Free",
    billingProPlan: "Vestra Pro",
    billingFreeBlurb: "{used} of {limit} stylist requests used this month. Pro unlocks unlimited styling and saved outfits.",
    billingProBlurb: "Unlimited stylist requests and saved outfits.",
    billingUpgradeMonthly: "Upgrade — $8.99/mo",
    billingUpgradeYearly: "Upgrade — $69/yr",
    billingManage: "Manage billing",
    billingCancelPro: "Cancel Pro",
    billingCancelConfirmTitle: "Cancel Vestra Pro?",
    billingCancelConfirmBody: "Are you sure you want to cancel your Pro subscription? Monthly plans get a full refund of the latest payment; annual plans get a prorated refund for unused days only — per our refund policy.",
    billingCancelConfirmYes: "Yes, cancel & refund",
    billingCancelConfirmNo: "Keep Pro",
    billingCancelSuccess: "Pro canceled — your refund is on the way. You’re back on the free plan.",
    billingCancelBusy: "Canceling…",
    deleteAccountLabel: "Delete Account",
    deleteAccountTitle: "Delete your Vestra account?",
    deleteAccountBody: "This will permanently delete your account and all your data (Style DNA, saved outfits, account info) in 30 days. You’ll be signed out immediately. If you change your mind, contact support@wearvestra.com before then.",
    deleteAccountTypePrompt: "Type DELETE to confirm",
    deleteAccountConfirm: "Permanently delete my account",
    deleteAccountCancel: "Keep my account",
    deleteAccountBusy: "Deleting…",
    deleteAccountError: "Couldn’t delete your account. Try again or email support@wearvestra.com.",
    billingSignInHint: "Sign in to upgrade or track your free stylist allowance.",
    billingBusy: "Opening Stripe…",
    billingError: "Couldn’t open billing. Try again in a moment.",
    billingQuotaTitle: "You’ve used your 3 free stylist looks this month.",
    billingQuotaBody: "Upgrade to Vestra Pro for unlimited styling — or refine pieces on looks you already have.",
    billingAuthRequired: "Create an account to use the live stylist (3 free looks/month).",
    billingSaveProOnly: "Saved outfits are a Pro feature. Upgrade to keep looks across devices.",
    billingSuccessNote: "Welcome to Pro — unlimited styling is on.",
    signupProNote: "Free plan includes 3 stylist requests/month. Upgrade to Pro anytime for unlimited requests — $8.99/mo or $69/yr.",
    homeProUsed: "{remaining} of {limit} looks left this month",
    homeProTeaser: "Get 3 free looks a month · Upgrade to Pro for unlimited",
    homeProUpgradeCta: "Upgrade to Pro",
    onbProEyebrow: "Vestra Pro",
    onbProTitle: "3 free looks a month — or go unlimited.",
    onbProBody: "Free gets you started. Pro keeps every look going: unlimited stylist requests, saved outfits across devices, and AI hero images as they roll out.",
    onbProBullet1: "Unlimited stylist requests",
    onbProBullet2: "Saved outfits, synced",
    onbProBullet3: "AI hero images (coming soon)",
    onbProContinue: "Continue with free",
    onbProSkipNote: "You can upgrade anytime from Home or Profile.",
    billingQuotaUpgradeCta: "Upgrade to Pro",
  },
  es: {
    welcomeEyebrow: "Vestra", welcomeTitleLine1: "Vamos a vestirte", welcomeTitleLine2: "como es debido.",
    welcomeSub: "Vestra es un estilista personal con IA para hombres. Describe una ocasión, recibe un outfit completo y compra cada prenda en las mejores tiendas.", getStarted: "Empezar", skipTesting: "Saltar para probar → ver la app",
    downloadAppLabel: "Consigue la app",
    downloadIos: "Descargar para iPhone",
    downloadAndroid: "Descargar para Android",
    downloadIosTitle: "Instala Vestra en iPhone",
    downloadAndroidTitle: "Instala Vestra en Android",
    downloadIosSteps: "1. Abre esta página en Safari\n2. Toca el botón Compartir\n3. Toca “Añadir a pantalla de inicio”\n4. Toca Añadir — Vestra se instala como una app",
    downloadAndroidSteps: "1. Abre esta página en Chrome\n2. Toca “Instalar” o el menú (⋮)\n3. Toca “Instalar app” / “Añadir a pantalla de inicio”\n4. Abre Vestra desde tu pantalla de inicio",
    downloadInstallNow: "Instalar ahora",
    downloadGotIt: "Entendido",
    downloadOpenStore: "Abrir tienda",
    downloadUnavailable: "La ficha en la tienda llega pronto — instálala en tu pantalla de inicio.",
    createAccountEyebrow: "Cuenta", whereReachYouLine1: "Crea tu cuenta", whereReachYouLine2: "o inicia sesión.",
    namePlaceholder: "Tu nombre", emailPlaceholder: "tu@email.com", continueBtn: "Continuar",
    signupEmailLabel: "Email", signupPasswordLabel: "Contraseña", passwordPlaceholder: "Mínimo 6 caracteres",
    signupNote: "También puedes saltar — tu ADN de estilo queda en este dispositivo.",
    signupLegalAgree: "Al registrarte, aceptas nuestros {terms} y la {privacy}.",
    footerTerms: "Términos",
    footerPrivacy: "Privacidad",
    footerSupport: "Soporte",
    nameRequired: "Escribe tu nombre para continuar.",
    emailRequired: "Añade un email válido.",
    passwordRequired: "La contraseña debe tener al menos 6 caracteres.",
    authModeSignup: "Crear cuenta", authModeLogin: "Entrar",
    authSubmitSignup: "Crear cuenta", authSubmitLogin: "Entrar",
    authBusy: "Un momento…",
    authErrorGeneric: "No se pudo entrar. Revisa email y contraseña.",
    authCloudOff: "Las cuentas en la nube aún no están configuradas — continúa con el nombre o salta para probar.",
    authCheckEmailTitle: "Revisa tu email",
    authCheckEmailBody: "Enviamos un enlace a {email}. Ábrelo y luego vuelve a iniciar sesión.",
    authCheckEmailHint: "Tip: en Supabase → Authentication → Providers → Email, desactiva Confirm email para probar más rápido.",
    authAccountExists: "Ese email ya tiene cuenta — cambia a Entrar.",
    authSignedInAs: "Sesión: {email}",
    authLogOut: "Cerrar sesión",
    authLocalOnly: "Solo en este dispositivo",
    importLocalTitle: "¿Guardar tu ADN de estilo en esta cuenta?",
    importLocalBody: "Hay un perfil en este dispositivo. Impórtalo para sincronizar, o empieza de cero.",
    importLocalYes: "Guardar en mi cuenta",
    importLocalNo: "Empezar de cero",
    step0Title: "¿Cómo describirías tu día a día?", step0Prompt: "Elige la foto que más se parezca a tus días.",
    lifeOfficeDesc: "Reuniones, clientes y días que piden un look intencional.",
    lifeCreativeDesc: "Espacios flexibles donde puedes vestirte con más soltura.",
    lifeRemoteDesc: "Mayormente en casa — casual elevado pero cuidado.",
    lifeTravelDesc: "Viajes, eventos y días cambiantes — capas versátiles.",
    lifeStudentDesc: "Vida de campus entre clases, trabajo y noches.",
    step1Title: "¿Cuál de estos se parece más a ti?", step1Prompt: "Si no sabes el nombre, elige la foto que más te represente.",
    archQuietDesc: "Líneas limpias, cortes refinados, nada estridente — elegancia sin esfuerzo.",
    archRelaxedDesc: "Tejidos cómodos, estructura suave, cuidado pero nunca rígido.",
    archModernDesc: "Siluetas nítidas, formas fuertes, contemporáneo e intencional.",
    archWarmDesc: "Texturas, capas y tonos tierra acogedores y naturales.",
    archClassicDesc: "Clásico y elegante — piezas atemporales, limpias y fiables.",
    archMinimalDesc: "Menos piezas, colores discretos, proporciones que hablan solas.",
    archRomanticDesc: "Telas suaves, caída fácil y un aire más cálido y relajado.",
    archBoldDesc: "Color con presencia y looks que se recuerdan.",
    archStreetDesc: "Energía urbana — gafas, cortes más holgados, cool sin look de oficina.",
    archSexyDesc: "Energía de noche — tonos oscuros, líneas marcadas, presencia intencional.",
    archEdgyDesc: "Contraste y actitud — moderno con un filo más duro.",
    step2Title: "¿Cómo te gusta que te quede la ropa?", step2Prompt: "Cuando te vistes, prefieres—",
    step3Title: "Hablemos de color.", step3Prompt: "¿Cuáles sueles elegir? Marca varios.",
    step4Title: "Tu estilista debe respetar tu presupuesto.", step4Prompt: "Para una prenda típica, ¿dónde te sientes más cómodo/a?",
    step5Title: "¿Para qué sueles vestirte más?", step5Prompt: "Elige todas las que encajen — con fotos.",
    occWorkDesc: "Días de oficina, reuniones y verte impecable en el trabajo.",
    occDateDesc: "Cenas, noches y vestirte un poco más especial.",
    occTravelDesc: "Viajes, aeropuertos y looks que se mueven contigo.",
    occEventsDesc: "Bodas, fiestas y celebraciones que piden elegancia.",
    occEverydayDesc: "Días normales en los que solo quieres verte arreglado/a.",
    step6Title: "Última cosa — para que la talla sea correcta.", step6Prompt: "Puedes omitir esto y añadirlo después.",
    anyColorsAvoid: "¿Algún color que evitas?", colorsToAvoidLabel: "Colores a evitar",
    sizeTops: "Parte superior", sizeBottoms: "Parte inferior", sizeShoes: "Calzado", sizePlaceholder: "ej. M, 32, 10", finishBtn: "Finalizar",
    yourStyleDna: "Tu ADN de Estilo", gravitateToward: "Te inclinas por prendas", piecesIn: "en tonos",
    dressWithIntentionFor: "y te vistes con intención para", everydayLife: "la vida cotidiana", consideredPalette: "una paleta cuidada",
    oneMoreThing: "Una Cosa Más", anythingHorizonLine1: "¿Algo especial", anythingHorizonLine2: "próximamente?",
    occasionSub: "Cuéntanoslo y tendremos un look real listo en cuanto conozcas a tu estilista.",
    occasionPlaceholder: "ej. boda en junio, semi-formal", meetYourStylist: "Conoce a tu Estilista", notSureYet: "Aún no lo sé — solo estoy explorando",
    chipWedding: "Boda", chipWorkEvent: "Evento de trabajo", chipDateNight: "Planes de cena", chipWeekendTrip: "Viaje de fin de semana",
    goodEvening: "Buenas tardes", styleDnaLabel: "ADN de Estilo", silhouettesWord: "siluetas", budgetWord: "presupuesto",
    askYourStylist: "Pregunta a tu estilista", askPlaceholder: "Dile a tu estilista qué necesitas…",
    chipDressWedding: "Vísteme para una boda", chipWorkDinner: "Cena de trabajo esta noche", chipWeekendCasual: "Fin de semana, sin complicaciones",
    chipWeekPlan: "Planifica mi semana — 5 looks",
    chipStreetwear: "Estilo streetwear", chipClassy: "Clásico y elegante", chipSexyNight: "Noche sexy", chipModernLook: "Moderno y definido",
    chipMoreCasual: "Más casual", chipAddBlazer: "Añade un blazer", chipUnder200: "Menos de $200 / prenda", chipDifferentBelt: "Otro cinturón",
    chipMoreStreet: "Más streetwear", chipMakeSexy: "Hazlo más sexy", chipMoreClassy: "Más clásico", chipMoreModern: "Más moderno",
    refineLooks: "Afina estos looks",
    stylistLive: "Estilizado en vivo con tu perfil.",
    yourStylist: "Tu Estilista", chatEmpty: "Cuéntame para qué te vistes — streetwear, clásico, sexy, moderno, una ocasión…",
    composing: "Componiendo tu look…", revising: "Ajustando esa prenda…",
    chatInputPlaceholder: "ej. streetwear, cena sexy, evento elegante…",
    stylistSuggests: "Tu Estilista Sugiere", stylistLook: "Look", saveOutfit: "Guardar Look", savedLabel: "Guardado",
    stylistPicksIntro: "Tres direcciones de estilo distintas — toca cualquier prenda para ver stock.",
    stylistMoodIntro: "Tres looks de este estilo — cada prenda busca el género correcto, no un código genérico.",
    weekPlanIntro: "Tu plan de lunes a viernes — cinco looks, sin siluetas repetidas, una lista de compras.",
    weekShoppingList: "Lista de compras de la semana",
    weekDayMon: "Lunes", weekDayTue: "Martes", weekDayWed: "Miércoles", weekDayThu: "Jueves", weekDayFri: "Viernes",
    styleFamilyStreetwear: "Streetwear", styleFamilyClassy: "Clásico", styleFamilySexy: "Sexy",
    styleFamilyModern: "Moderno", styleFamilyEdgy: "Edgy", styleFamilyRomantic: "Romántico",
    styleFamilyMinimal: "Minimal", styleFamilyBold: "Audaz", styleFamilyRelaxed: "Relajado",
    stylistRevisionIntro: "Listo — cambié el {item}. El resto se queda.",
    stylistRevisionMulti: "Listo — cambié las piezas que mencionaste. El resto se queda.",
    stylistRevisionRemoved: "Listo — quité el {item} y cerré el look de otra forma.",
    wardrobeTitle: "Armario", wardrobeEmpty: "Los looks que guardes de tu estilista aparecerán aquí.",
    bagTitle: "Bolsa", bagEmpty: "Guarda un look para ver sus prendas aquí, agrupadas por tienda.", checkoutWith: "Comprar en",
    profileTitle: "Perfil", nameLabel: "Nombre", styleArchetypeLabel: "Arquetipo de Estilo", fitPreferenceLabel: "Preferencia de Ajuste",
    lifestyleLabel: "Día a día",
    paletteLabel: "Paleta", budgetLabel: "Presupuesto", dressesForLabel: "Se Viste Para",
    prototypeNote: "Invitados: el ADN de estilo queda en este dispositivo. Crea una cuenta para sincronizar.", languageLabel: "Idioma",
    deleteProfileLabel: "Empezar de nuevo",
    deleteProfileTitle: "¿Borrar tu perfil de estilo?",
    deleteProfileBody: "Esto borra tu ADN de estilo, looks guardados, bolsa y chat del estilista para que puedas repetir el cuestionario. El estilo cambia — empieza de cero cuando quieras.",
    deleteProfileConfirm: "Borrar y empezar de nuevo",
    deleteProfileCancel: "Conservar mi perfil",
    navHome: "Inicio", navStylist: "Estilista", navWardrobe: "Armario", navBag: "Bolsa", navProfile: "Perfil",
    viewProduct: "Comprar esta prenda", swapItem: "Cambiar esta prenda",
    heroGenerating: "Vistiendo al modelo…",
    heroInspiration: "Inspiración de estilo",
    shopAcross: "Buscar en tiendas", shopAcrossSub: "Desde low-cost hasta lujo",
    shopClose: "Cerrar", shopTierBudget: "Valor", shopTierMarketplace: "Marketplaces", shopTierCatalog: "En nuestro catálogo", shopTierHighStreet: "High street", shopTierPremium: "Premium", shopTierLuxury: "Lujo", shopTierOutlet: "Outlet y segunda mano",
    shopOpenAll: "Abrir Google Shopping",
    favoriteStoresLabel: "Tiendas favoritas",
    favoriteStoresHint: "Toca para añadir o quitar las tiendas donde más compras.",
    favoriteStoresEmpty: "Aún no hay favoritas — elige algunas abajo.",
    shopYourFavorites: "Tus favoritas",
    shopInStock: "Disponible ahora",
    shopInStockSub: "Listados alineados con tu paleta",
    shopInStockBadge: "En stock",
    shopBuyAt: "Comprar",
    shopScanning: "Buscando disponibilidad en tiendas…",
    shopNoStock: "Sin listados en tu paleta — busca en Google o en una tienda con tus colores.",
    shopMoreStores: "Ver todas las tiendas",
    shopStoreCount: "{count} tiendas",
    shopPaletteFilter: "Colores: {colors}",
    shopSearchingAs: "Buscando: {query}",
    billingTitle: "Plan y facturación",
    billingFreePlan: "Gratis",
    billingProPlan: "Vestra Pro",
    billingFreeBlurb: "{used} de {limit} peticiones de estilista este mes. Pro desbloquea estilo ilimitado y looks guardados.",
    billingProBlurb: "Estilista ilimitado y looks guardados.",
    billingUpgradeMonthly: "Mejorar — 8,99 $/mes",
    billingUpgradeYearly: "Mejorar — 69 $/año",
    billingManage: "Gestionar facturación",
    billingCancelPro: "Cancelar Pro",
    billingCancelConfirmTitle: "¿Cancelar Vestra Pro?",
    billingCancelConfirmBody: "¿Seguro que quieres cancelar tu suscripción Pro? En el plan mensual reembolsamos el último pago completo; en el anual, solo la parte no usada (prorrateo) — según nuestra política de reembolsos.",
    billingCancelConfirmYes: "Sí, cancelar y reembolsar",
    billingCancelConfirmNo: "Mantener Pro",
    billingCancelSuccess: "Pro cancelado — el reembolso está en camino. Has vuelto al plan gratis.",
    billingCancelBusy: "Cancelando…",
    deleteAccountLabel: "Eliminar cuenta",
    deleteAccountTitle: "¿Eliminar tu cuenta de Vestra?",
    deleteAccountBody: "Esto eliminará permanentemente tu cuenta y todos tus datos (ADN de estilo, looks guardados, info de cuenta) en 30 días. Se cerrará tu sesión de inmediato. Si cambias de opinión, escribe a support@wearvestra.com antes.",
    deleteAccountTypePrompt: "Escribe DELETE para confirmar",
    deleteAccountConfirm: "Eliminar mi cuenta definitivamente",
    deleteAccountCancel: "Conservar mi cuenta",
    deleteAccountBusy: "Eliminando…",
    deleteAccountError: "No se pudo eliminar la cuenta. Inténtalo de nuevo o escribe a support@wearvestra.com.",
    billingSignInHint: "Inicia sesión para mejorar o ver tu cupo gratis.",
    billingBusy: "Abriendo Stripe…",
    billingError: "No se pudo abrir la facturación. Inténtalo de nuevo.",
    billingQuotaTitle: "Has usado tus 3 looks gratis de este mes.",
    billingQuotaBody: "Pasa a Vestra Pro para estilo ilimitado — o ajusta piezas en looks que ya tengas.",
    billingAuthRequired: "Crea una cuenta para el estilista en vivo (3 looks gratis/mes).",
    billingSaveProOnly: "Guardar looks es Pro. Mejora tu plan para sincronizarlos.",
    billingSuccessNote: "Bienvenido a Pro — estilo ilimitado activado.",
    signupProNote: "El plan gratis incluye 3 peticiones de estilista al mes. Pasa a Pro cuando quieras para peticiones ilimitadas — 8,99 $/mes o 69 $/año.",
    homeProUsed: "{remaining} de {limit} looks restantes este mes",
    homeProTeaser: "3 looks gratis al mes · Pasa a Pro para ilimitadas",
    homeProUpgradeCta: "Pasar a Pro",
    onbProEyebrow: "Vestra Pro",
    onbProTitle: "3 looks gratis al mes — o ilimitados con Pro.",
    onbProBody: "Gratis te pone en marcha. Pro mantiene el ritmo: estilista ilimitado, looks guardados en todos tus dispositivos y hero images con IA cuando lleguen.",
    onbProBullet1: "Peticiones de estilista ilimitadas",
    onbProBullet2: "Looks guardados, sincronizados",
    onbProBullet3: "Hero images con IA (próximamente)",
    onbProContinue: "Seguir con el plan gratis",
    onbProSkipNote: "Puedes pasar a Pro cuando quieras desde Inicio o Perfil.",
    billingQuotaUpgradeCta: "Pasar a Pro",
  },
  fr: {
    welcomeEyebrow: "Vestra", welcomeTitleLine1: "Habillons-vous", welcomeTitleLine2: "comme il se doit.",
    welcomeSub: "Vestra est un styliste personnel IA pour hommes. Décrivez une occasion, obtenez une tenue complète et achetez chaque pièce chez de grands retailers.", getStarted: "Commencer", skipTesting: "Passer pour tester → voir l'app",
    downloadAppLabel: "Télécharger l'app",
    downloadIos: "Télécharger pour iPhone",
    downloadAndroid: "Télécharger pour Android",
    downloadIosTitle: "Installer Vestra sur iPhone",
    downloadAndroidTitle: "Installer Vestra sur Android",
    downloadIosSteps: "1. Ouvrez cette page dans Safari\n2. Appuyez sur Partager\n3. Appuyez sur « Sur l'écran d'accueil »\n4. Appuyez sur Ajouter — Vestra s'installe comme une app",
    downloadAndroidSteps: "1. Ouvrez cette page dans Chrome\n2. Appuyez sur « Installer » ou le menu (⋮)\n3. Appuyez sur « Installer l'application »\n4. Ouvrez Vestra depuis l'écran d'accueil",
    downloadInstallNow: "Installer maintenant",
    downloadGotIt: "Compris",
    downloadOpenStore: "Ouvrir le store",
    downloadUnavailable: "Fiche store bientôt disponible — installez sur l'écran d'accueil.",
    createAccountEyebrow: "Compte", whereReachYouLine1: "Créez votre compte", whereReachYouLine2: "ou connectez-vous.",
    namePlaceholder: "Votre prénom", emailPlaceholder: "votre@email.com", continueBtn: "Continuer",
    signupEmailLabel: "Email", signupPasswordLabel: "Mot de passe", passwordPlaceholder: "Au moins 6 caractères",
    signupNote: "Vous pouvez aussi passer — l’ADN Style reste sur cet appareil.",
    signupLegalAgree: "En vous inscrivant, vous acceptez nos {terms} et notre {privacy}.",
    footerTerms: "Conditions",
    footerPrivacy: "Confidentialité",
    footerSupport: "Support",
    nameRequired: "Indiquez votre prénom pour continuer.",
    emailRequired: "Ajoutez un email valide.",
    passwordRequired: "Le mot de passe doit contenir au moins 6 caractères.",
    authModeSignup: "S’inscrire", authModeLogin: "Connexion",
    authSubmitSignup: "Créer le compte", authSubmitLogin: "Se connecter",
    authBusy: "Un instant…",
    authErrorGeneric: "Connexion impossible. Vérifiez email et mot de passe.",
    authCloudOff: "Les comptes cloud ne sont pas encore configurés — continuez avec le prénom ou passez pour tester.",
    authCheckEmailTitle: "Vérifiez votre email",
    authCheckEmailBody: "Nous avons envoyé un lien à {email}. Ouvrez-le, puis reconnectez-vous.",
    authCheckEmailHint: "Astuce : dans Supabase → Authentication → Providers → Email, désactivez Confirm email pour tester plus vite.",
    authAccountExists: "Cet email a déjà un compte — passez à Connexion.",
    authSignedInAs: "Connecté : {email}",
    authLogOut: "Se déconnecter",
    authLocalOnly: "Enregistré sur cet appareil seulement",
    importLocalTitle: "Enregistrer votre ADN Style sur ce compte ?",
    importLocalBody: "Un profil existe sur cet appareil. Importez-le pour synchroniser, ou repartez de zéro.",
    importLocalYes: "Enregistrer sur mon compte",
    importLocalNo: "Repartir de zéro",
    step0Title: "Comment décririez-vous votre quotidien ?", step0Prompt: "Choisissez la photo qui ressemble le plus à vos journées.",
    lifeOfficeDesc: "Réunions, clients, et des journées qui demandent une allure intentionnelle.",
    lifeCreativeDesc: "Espaces flexibles où l'on peut s'habiller avec plus de souplesse.",
    lifeRemoteDesc: "Surtout à la maison — un casual élevé mais soigné.",
    lifeTravelDesc: "Voyages, événements, journées changeantes — des couches versatiles.",
    lifeStudentDesc: "Vie de campus entre cours, travail et soirées.",
    step1Title: "Lequel vous ressemble le plus ?", step1Prompt: "Pas sûr du nom ? Choisissez la photo qui vous parle.",
    archQuietDesc: "Lignes nettes, coupes raffinées, rien de criard — élégance sans effort.",
    archRelaxedDesc: "Matières souples, structure douce, soigné sans rigidité.",
    archModernDesc: "Silhouettes précises, formes affirmées, contemporain et intentionnel.",
    archWarmDesc: "Textures, superpositions et tons terreux accueillants.",
    archClassicDesc: "Classique et élégant — des pièces intemporelles, nettes et fiables.",
    archMinimalDesc: "Moins de pièces, couleurs discrètes, proportions qui parlent.",
    archRomanticDesc: "Tissus souples, tombé facile, une humeur plus chaleureuse et détendue.",
    archBoldDesc: "Couleur affirmée et tenues dont on se souvient.",
    archStreetDesc: "Énergie urbaine — lunettes, coupes plus amples, cool sans look de bureau.",
    archSexyDesc: "Énergie du soir — tons sombres, lignes marquées, présence intentionnelle.",
    archEdgyDesc: "Contraste et attitude — moderne avec un bord plus tranché.",
    step2Title: "Comment aimez-vous que ça tombe ?", step2Prompt: "Quand vous vous habillez, vous préférez—",
    step3Title: "Parlons couleur.", step3Prompt: "Lesquelles portez-vous le plus souvent ? Choisissez-en plusieurs.",
    step4Title: "Votre styliste doit respecter votre budget.", step4Prompt: "Pour une pièce typique, où êtes-vous le plus à l'aise ?",
    step5Title: "Pour quoi vous habillez-vous le plus souvent ?", step5Prompt: "Choisissez tout ce qui convient — avec photos.",
    occWorkDesc: "Journées de bureau, réunions, et une allure soignée au travail.",
    occDateDesc: "Dîners, soirées, et s'habiller un peu plus élégamment.",
    occTravelDesc: "Voyages, aéroports, et des tenues qui bougent avec vous.",
    occEventsDesc: "Mariages, fêtes et célébrations qui demandent de la tenue.",
    occEverydayDesc: "Les jours ordinaires où l'on veut juste être bien habillé.",
    step6Title: "Dernière chose — pour bien ajuster la taille.", step6Prompt: "Vous pouvez passer cette étape et l'ajouter plus tard.",
    anyColorsAvoid: "Des couleurs à éviter ?", colorsToAvoidLabel: "Couleurs à éviter",
    sizeTops: "Hauts", sizeBottoms: "Bas", sizeShoes: "Chaussures", sizePlaceholder: "ex. M, 32, 10", finishBtn: "Terminer",
    yourStyleDna: "Votre ADN Style", gravitateToward: "Vous privilégiez des pièces", piecesIn: "dans les tons",
    dressWithIntentionFor: "et vous habillez avec intention pour", everydayLife: "le quotidien", consideredPalette: "une palette réfléchie",
    oneMoreThing: "Encore Une Chose", anythingHorizonLine1: "Quelque chose", anythingHorizonLine2: "à l'horizon ?",
    occasionSub: "Dites-le-nous et une vraie tenue sera prête dès que vous rencontrerez votre styliste.",
    occasionPlaceholder: "ex. mariage en juin, semi-habillé", meetYourStylist: "Rencontrer Votre Styliste", notSureYet: "Pas encore sûr — j'explore seulement",
    chipWedding: "Mariage", chipWorkEvent: "Événement professionnel", chipDateNight: "Dîner prévu", chipWeekendTrip: "Week-end",
    goodEvening: "Bonsoir", styleDnaLabel: "ADN Style", silhouettesWord: "silhouettes", budgetWord: "budget",
    askYourStylist: "Demandez à votre styliste", askPlaceholder: "Dites à votre styliste ce dont vous avez besoin…",
    chipDressWedding: "Habillez-moi pour un mariage", chipWorkDinner: "Dîner professionnel ce soir", chipWeekendCasual: "Week-end, sans prise de tête",
    chipWeekPlan: "Planifier ma semaine — 5 looks",
    chipStreetwear: "Vibes streetwear", chipClassy: "Classique & élégant", chipSexyNight: "Soirée sexy", chipModernLook: "Moderne & affûté",
    chipMoreCasual: "Plus casual", chipAddBlazer: "Ajouter un blazer", chipUnder200: "Moins de 200 $ / pièce", chipDifferentBelt: "Autre ceinture",
    chipMoreStreet: "Plus streetwear", chipMakeSexy: "Plus sexy", chipMoreClassy: "Plus classique", chipMoreModern: "Plus moderne",
    refineLooks: "Affiner ces looks",
    stylistLive: "Stylisé en direct selon votre profil.",
    yourStylist: "Votre Styliste", chatEmpty: "Dites-moi pour quoi vous vous habillez — streetwear, classique, sexy, moderne, une occasion…",
    composing: "Composition de votre tenue…", revising: "Ajustement de cette pièce…",
    chatInputPlaceholder: "ex. streetwear, dîner sexy, événement élégant…",
    stylistSuggests: "Votre Styliste Suggère", stylistLook: "Look", saveOutfit: "Enregistrer la Tenue", savedLabel: "Enregistré",
    stylistPicksIntro: "Trois directions de style différentes — touchez une pièce pour voir le stock.",
    stylistMoodIntro: "Trois looks dans ce style — chaque pièce cherche le bon genre, pas un code générique.",
    weekPlanIntro: "Votre plan lun–ven — cinq looks, aucune silhouette répétée, une liste de courses.",
    weekShoppingList: "Liste de courses de la semaine",
    weekDayMon: "Lundi", weekDayTue: "Mardi", weekDayWed: "Mercredi", weekDayThu: "Jeudi", weekDayFri: "Vendredi",
    styleFamilyStreetwear: "Streetwear", styleFamilyClassy: "Classique", styleFamilySexy: "Sexy",
    styleFamilyModern: "Moderne", styleFamilyEdgy: "Edgy", styleFamilyRomantic: "Romantique",
    styleFamilyMinimal: "Minimal", styleFamilyBold: "Audacieux", styleFamilyRelaxed: "Détendu",
    stylistRevisionIntro: "C’est noté — j’ai changé le {item}. Le reste reste.",
    stylistRevisionMulti: "C’est noté — j’ai changé les pièces que vous avez signalées. Le reste reste.",
    stylistRevisionRemoved: "C’est noté — j’ai retiré le {item} et fini autrement.",
    wardrobeTitle: "Garde-robe", wardrobeEmpty: "Les tenues que vous enregistrez apparaîtront ici.",
    bagTitle: "Panier", bagEmpty: "Enregistrez une tenue pour voir ses articles ici, regroupés par enseigne.", checkoutWith: "Payer chez",
    profileTitle: "Profil", nameLabel: "Prénom", styleArchetypeLabel: "Archétype de Style", fitPreferenceLabel: "Préférence de Coupe",
    lifestyleLabel: "Quotidien",
    paletteLabel: "Palette", budgetLabel: "Budget", dressesForLabel: "S'habille Pour",
    prototypeNote: "Invités : l’ADN Style reste sur cet appareil. Créez un compte pour synchroniser.", languageLabel: "Langue",
    deleteProfileLabel: "Recommencer",
    deleteProfileTitle: "Supprimer votre profil de style ?",
    deleteProfileBody: "Cela efface votre ADN Style, tenues enregistrées, panier et chat styliste pour refaire le quiz. Le style évolue — recommencez quand vous voulez.",
    deleteProfileConfirm: "Supprimer et recommencer",
    deleteProfileCancel: "Garder mon profil",
    navHome: "Accueil", navStylist: "Styliste", navWardrobe: "Garde-robe", navBag: "Panier", navProfile: "Profil",
    viewProduct: "Acheter cet article", swapItem: "Changer cet article",
    heroGenerating: "Habillage du mannequin…",
    heroInspiration: "Inspiration style",
    shopAcross: "Chercher en boutiques", shopAcrossSub: "Du abordable au luxe",
    shopClose: "Fermer", shopTierBudget: "Valeur", shopTierMarketplace: "Marketplaces", shopTierCatalog: "Dans notre catalogue", shopTierHighStreet: "High street", shopTierPremium: "Premium", shopTierLuxury: "Luxe", shopTierOutlet: "Outlet & seconde main",
    shopOpenAll: "Ouvrir Google Shopping",
    favoriteStoresLabel: "Boutiques préférées",
    favoriteStoresHint: "Touchez pour ajouter ou retirer vos boutiques habituelles.",
    favoriteStoresEmpty: "Aucune favorite — choisissez-en quelques-unes ci-dessous.",
    shopYourFavorites: "Vos favorites",
    shopInStock: "En stock maintenant",
    shopInStockSub: "Offres alignées sur votre palette",
    shopInStockBadge: "En stock",
    shopBuyAt: "Acheter",
    shopScanning: "Recherche de disponibilité…",
    shopNoStock: "Aucune offre dans votre palette — cherchez sur Google ou en boutique avec vos couleurs.",
    shopMoreStores: "Voir toutes les boutiques",
    shopStoreCount: "{count} boutiques",
    shopPaletteFilter: "Couleurs : {colors}",
    shopSearchingAs: "Recherche : {query}",
    billingTitle: "Offre et facturation",
    billingFreePlan: "Gratuit",
    billingProPlan: "Vestra Pro",
    billingFreeBlurb: "{used} sur {limit} demandes styliste ce mois. Pro : stylisme illimité et looks enregistrés.",
    billingProBlurb: "Stylisme illimité et looks enregistrés.",
    billingUpgradeMonthly: "Passer Pro — 8,99 $/mois",
    billingUpgradeYearly: "Passer Pro — 69 $/an",
    billingManage: "Gérer la facturation",
    billingCancelPro: "Résilier Pro",
    billingCancelConfirmTitle: "Résilier Vestra Pro ?",
    billingCancelConfirmBody: "Voulez-vous vraiment résilier votre abonnement Pro ? Mensuel : remboursement intégral du dernier paiement ; annuel : remboursement au prorata des jours non utilisés — selon notre politique de remboursement.",
    billingCancelConfirmYes: "Oui, résilier et rembourser",
    billingCancelConfirmNo: "Garder Pro",
    billingCancelSuccess: "Pro résilié — remboursement en cours. Vous êtes de retour sur l’offre gratuite.",
    billingCancelBusy: "Résiliation…",
    deleteAccountLabel: "Supprimer le compte",
    deleteAccountTitle: "Supprimer votre compte Vestra ?",
    deleteAccountBody: "Cela supprimera définitivement votre compte et toutes vos données (ADN Style, tenues enregistrées, infos de compte) dans 30 jours. Vous serez déconnecté immédiatement. Si vous changez d’avis, contactez support@wearvestra.com avant.",
    deleteAccountTypePrompt: "Tapez DELETE pour confirmer",
    deleteAccountConfirm: "Supprimer définitivement mon compte",
    deleteAccountCancel: "Garder mon compte",
    deleteAccountBusy: "Suppression…",
    deleteAccountError: "Impossible de supprimer le compte. Réessayez ou écrivez à support@wearvestra.com.",
    billingSignInHint: "Connectez-vous pour passer Pro ou suivre votre quota gratuit.",
    billingBusy: "Ouverture de Stripe…",
    billingError: "Facturation indisponible. Réessayez dans un instant.",
    billingQuotaTitle: "Vous avez utilisé vos 3 looks gratuits ce mois-ci.",
    billingQuotaBody: "Passez à Vestra Pro pour un stylisme illimité — ou affinez les looks déjà obtenus.",
    billingAuthRequired: "Créez un compte pour le styliste live (3 looks gratuits/mois).",
    billingSaveProOnly: "Enregistrer des looks est réservé à Pro. Passez Pro pour synchroniser.",
    billingSuccessNote: "Bienvenue sur Pro — stylisme illimité activé.",
    signupProNote: "L’offre gratuite inclut 3 demandes styliste/mois. Passez à Pro quand vous voulez pour un stylisme illimité — 8,99 $/mois ou 69 $/an.",
    homeProUsed: "{remaining} sur {limit} looks restants ce mois",
    homeProTeaser: "3 looks gratuits par mois · Passez à Pro pour l’illimité",
    homeProUpgradeCta: "Passer à Pro",
    onbProEyebrow: "Vestra Pro",
    onbProTitle: "3 looks gratuits par mois — ou l’illimité avec Pro.",
    onbProBody: "L’offre gratuite vous lance. Pro garde le rythme : stylisme illimité, looks enregistrés sur tous vos appareils, et hero images IA à venir.",
    onbProBullet1: "Demandes styliste illimitées",
    onbProBullet2: "Looks enregistrés, synchronisés",
    onbProBullet3: "Hero images IA (bientôt)",
    onbProContinue: "Continuer en gratuit",
    onbProSkipNote: "Passez à Pro quand vous voulez depuis Accueil ou Profil.",
    billingQuotaUpgradeCta: "Passer à Pro",
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
    "Streetwear & Cool": "Streetwear y Cool", "Sexy & Evening": "Sexy y Noche", "Edgy & Contemporary": "Edgy y Contemporáneo",
    "Quiet Tailored": "Discreto Sastre", "Relaxed Considered": "Relajado Cuidado", "Modern Sharp": "Moderno Definido",
    "Warm Layered": "Cálido en Capas", "Classic Polished": "Clásico Pulido", "Minimal Directional": "Minimalista Vanguardista",
    "Romantic Soft": "Romántico Suave", "Bold Expressive": "Audaz Expresivo",
    "Streetwear Cool": "Streetwear Cool", "Sexy Evening": "Sexy Noche", "Edgy Contemporary": "Edgy Contemporáneo",
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
    "Streetwear & Cool": "Streetwear et Cool", "Sexy & Evening": "Sexy et Soir", "Edgy & Contemporary": "Edgy et Contemporain",
    "Quiet Tailored": "Discret Tailleur", "Relaxed Considered": "Détendu Réfléchi", "Modern Sharp": "Moderne Affûté",
    "Warm Layered": "Chaleureux Superposé", "Classic Polished": "Classique Soigné", "Minimal Directional": "Minimaliste Avant-gardiste",
    "Romantic Soft": "Romantique Doux", "Bold Expressive": "Audacieux Expressif",
    "Streetwear Cool": "Streetwear Cool", "Sexy Evening": "Sexy Soir", "Edgy Contemporary": "Edgy Contemporain",
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
    p1: "Blazer Sastre de Mezcla de Lana", p1b: "Blazer de Lino sin Estructura", p1c: "Blazer Sastre Marino", p1d: "Blazer Sastre Negro",
    p2: "Camisa de Algodón Impecable", p2b: "Cuello Alto de Merino Fino",
    p3: "Pantalón Recto Sastre", p3b: "Pantalón de Lana de Pierna Ancha", p3c: "Pantalón Sastre Marino", p3d: "Pantalón Sastre Negro",
    p4: "Zapato Derby de Piel", p4b: "Botín Chelsea de Ante", p4c: "Derby de Piel Negro",
    p5: "Bufanda de Lana Fina", p5b: "Pañuelo de Bolsillo de Cachemira", p5c: "Bufanda de Lana Burdeos",
    p6: "Cinturón de Piel", p6b: "Cinturón de Piel Negro", p7: "Gafas de Sol de Acetato", p7b: "Gafas de Sol Negras",
  },
  fr: {
    p1: "Blazer Cintré en Mélange de Laine", p1b: "Blazer en Lin Déstructuré", p1c: "Blazer Cintré Marine", p1d: "Blazer Cintré Noir",
    p2: "Chemise en Coton Impeccable", p2b: "Col Roulé en Mérinos Fin",
    p3: "Pantalon Droit Tailleur", p3b: "Pantalon en Laine Large", p3c: "Pantalon Tailleur Marine", p3d: "Pantalon Tailleur Noir",
    p4: "Chaussure Derby en Cuir", p4b: "Boot Chelsea en Daim", p4c: "Derby en Cuir Noir",
    p5: "Écharpe en Laine Fine", p5b: "Pochette en Cachemire", p5c: "Écharpe en Laine Bordeaux",
    p6: "Ceinture en Cuir", p6b: "Ceinture en Cuir Noir", p7: "Lunettes de Soleil en Acétate", p7b: "Lunettes de Soleil Noires",
  },
};
const RATIONALES_I18N = {
  es: [
    "Un blazer sastre en oliva mantiene el look cálido y con los pies en la tierra, sin resultar rígido — perfecto para un momento semi-formal al aire libre. La camisa marfil lo eleva, el zapato derby se mantiene clásico, y un cinturón de piel remata las proporciones.",
    "Elegante, sin rigidez — el mismo pantalón sastre da base al look, mientras la camisa impecable sola (sin blazer) lo hace fácil para una cena. Añade la bufanda si hace fresco.",
    "Piezas fáciles de diario con gafas de sol para rematar — líneas limpias, nada complicado, listo para el sol y el movimiento.",
    "Un look diario, discreto y cuidado, construido alrededor de tu paleta — líneas limpias, nada que grite por atención, fácil de llevar de verdad. Gafas de sol cuando sales.",
  ],
  fr: [
    "Un blazer tailleur olive garde cette tenue chaleureuse et ancrée plutôt que rigide — idéal pour un moment semi-habillé en extérieur. La chemise ivoire l'élève, la chaussure derby reste classique, et une ceinture en cuir finalise les proportions.",
    "Chic, sans rigidité — le même pantalon tailleur ancre la tenue, tandis que la chemise seule (sans veste) la rend facile pour un dîner. Ajoutez l'écharpe s'il fait frais.",
    "Des pièces faciles du quotidien avec des lunettes de soleil pour finir — lignes nettes, rien de compliqué, prêt pour le soleil et le mouvement.",
    "Une tenue quotidienne discrète et réfléchie, construite autour de votre palette — des lignes nettes, rien qui attire l'attention, facile à porter au quotidien. Lunettes de soleil dès que vous sortez.",
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
const ASSET_V = "10";
const assetUrl = (path) => `${path}?v=${ASSET_V}`;

const GREEN_PALETTE = new Set(["Olive", "Forest Green"]);
const NEUTRAL_PALETTE = new Set(["Black", "Ivory / Cream", "White", "Grey / Charcoal"]);

/** Search phrases for each palette swatch — used to make shopping precise. */
const COLOR_SEARCH_TERMS = {
  Black: ["black"],
  "Ivory / Cream": ["ivory", "cream", "off-white"],
  "Grey / Charcoal": ["charcoal", "grey", "gray"],
  "Camel / Tan": ["camel", "tan", "cognac", "brown"],
  Olive: ["olive", "olive green"],
  Navy: ["navy", "navy blue"],
  Burgundy: ["burgundy", "wine"],
  "Forest Green": ["forest green", "dark green"],
  "Sand / Beige": ["beige", "sand", "khaki"],
  "Rust / Terracotta": ["rust", "terracotta"],
  "Blush / Dusty Pink": ["blush", "dusty pink"],
  "Bold Color": ["bold", "statement color"],
};

function colorTermsForLabels(labels = []) {
  return labels.flatMap((l) => COLOR_SEARCH_TERMS[l] || [String(l).toLowerCase()]);
}

function itemIsGreen(itemKey) {
  const tags = CATALOG[itemKey]?.paletteTags || [];
  return tags.some((t) => GREEN_PALETTE.has(t));
}

function paletteWantsGreen(palette = []) {
  return (palette || []).some((t) => GREEN_PALETTE.has(t));
}

function itemPaletteScore(itemKey, palette = [], avoid = []) {
  const item = CATALOG[itemKey];
  if (!item) return 0;
  const tags = item.paletteTags || [];
  let score = 0;
  for (const tag of tags) {
    if (avoid.includes(tag)) score -= 50;
    if (palette.includes(tag)) score += 20;
  }
  // Never push olive/forest when the user did not choose those colors
  if (itemIsGreen(itemKey) && palette.length && !paletteWantsGreen(palette)) {
    score -= 60;
  }
  // Direct overlap is required for strong pieces; neutrals get a smaller consolation
  if (score <= 0 && tags.some((t) => NEUTRAL_PALETTE.has(t))) {
    const wantsNeutral = palette.some((t) => NEUTRAL_PALETTE.has(t) || t === "Navy" || t === "Sand / Beige" || t === "Camel / Tan");
    score += wantsNeutral ? 8 : 1;
  }
  // Soft match: sand/camel pieces for warm palettes without green
  if (score <= 0 && tags.some((t) => t === "Sand / Beige" || t === "Camel / Tan")) {
    if (palette.some((t) => ["Sand / Beige", "Camel / Tan", "Ivory / Cream", "Rust / Terracotta", "Navy", "Burgundy"].includes(t))) {
      score += 10;
    }
  }
  return score;
}

function outfitPaletteScore(itemKeys, palette = [], avoid = []) {
  if (!palette.length) return 0;
  return itemKeys.reduce((sum, k) => sum + itemPaletteScore(k, palette, avoid), 0);
}

/** Prefer the alt/base variant that best matches the user's palette. */
function bestVariantForPalette(baseKey, palette = [], avoid = []) {
  const fam = familyOfKey(baseKey) || baseKey;
  return bestVariantInFamily(fam, palette, avoid);
}

function tuneItemsToPalette(itemKeys, palette = [], avoid = []) {
  return itemKeys.map((key) => {
    const fam = familyOfKey(key);
    if (!fam) return key;
    return bestVariantInFamily(fam, palette, avoid);
  });
}

/**
 * Per-style shopping/display targets for the men's catalog.
 * Photos stay as shared stubs; names & search nouns are men-only.
 */
const STYLE_GENRE_ITEMS = {
  streetwear: {
    blazer: { name: "Oversized Street Blazer", noun: "oversized streetwear blazer men" },
    shirt: { name: "Oversized Street Hoodie", noun: "oversized streetwear hoodie men" },
    trouser: { name: "Baggy Cargo Pants", noun: "baggy cargo pants streetwear men" },
    shoe: { name: "Chunky Street Sneakers", noun: "chunky sneakers men streetwear" },
    belt: { name: "Utility Belt", noun: "utility belt streetwear" },
    scarf: { name: "Street Bandana", noun: "streetwear bandana" },
    sunglasses: { name: "Chunky Street Shades", noun: "chunky black sunglasses streetwear" },
  },
  classy: {
    blazer: { name: "Tailored Wool Blazer", noun: "tailored wool blazer men elegant" },
    shirt: { name: "Crisp Dress Shirt", noun: "crisp cotton dress shirt men elegant" },
    trouser: { name: "Tailored Dress Trousers", noun: "tailored dress trousers men elegant" },
    shoe: { name: "Leather Oxford / Derby", noun: "leather oxford derby shoes men" },
    belt: { name: "Leather Dress Belt", noun: "leather dress belt elegant" },
    scarf: { name: "Fine Wool Scarf", noun: "fine wool scarf elegant" },
    sunglasses: { name: "Classic Acetate Sunglasses", noun: "classic acetate sunglasses" },
  },
  sexy: {
    blazer: { name: "Fitted Evening Blazer", noun: "fitted black evening blazer men" },
    shirt: { name: "Slim Black Turtleneck", noun: "slim fitted black turtleneck sexy" },
    trouser: { name: "Slim Black Trousers", noun: "slim black dress trousers men" },
    shoe: { name: "Sleek Black Dress Shoes", noun: "sleek black leather dress shoes" },
    belt: { name: "Slim Black Belt", noun: "slim black leather belt" },
    scarf: { name: "Silk Evening Scarf", noun: "silk scarf evening sexy" },
    sunglasses: { name: "Slim Black Shades", noun: "slim black sunglasses men" },
  },
  modern: {
    blazer: { name: "Sharp Modern Blazer", noun: "modern structured blazer men" },
    shirt: { name: "Clean Modern Shirt", noun: "modern minimal shirt men" },
    trouser: { name: "Straight Modern Trousers", noun: "modern straight trousers men" },
    shoe: { name: "Minimal Leather Derby", noun: "minimal leather derby men" },
    belt: { name: "Minimal Leather Belt", noun: "minimal leather belt modern" },
    scarf: { name: "Architectural Scarf", noun: "modern wool scarf minimal" },
    sunglasses: { name: "Geometric Sunglasses", noun: "geometric modern sunglasses" },
  },
  edgy: {
    blazer: { name: "Hard-Edge Black Blazer", noun: "black edgy blazer leather trim" },
    shirt: { name: "Dark Fitted Shirt", noun: "black fitted shirt men edgy" },
    trouser: { name: "Black Slim / Wide Contrast", noun: "black edgy trousers slim" },
    shoe: { name: "Black Chelsea Boots", noun: "black chelsea boots men edgy" },
    belt: { name: "Black Hardware Belt", noun: "black belt silver hardware edgy" },
    scarf: { name: "Dark Contrast Scarf", noun: "black scarf edgy" },
    sunglasses: { name: "Wrap / Narrow Black Shades", noun: "narrow black sunglasses edgy" },
  },
  romantic: {
    blazer: { name: "Soft Unstructured Blazer", noun: "soft linen blazer men" },
    shirt: { name: "Soft Knit Polo / Shirt", noun: "soft knit shirt men romantic" },
    trouser: { name: "Fluid Wide Trousers", noun: "fluid wide leg trousers men" },
    shoe: { name: "Soft Suede Boot", noun: "suede boots men" },
    belt: { name: "Soft Leather Belt", noun: "soft leather belt" },
    scarf: { name: "Soft Wool Scarf", noun: "soft wool scarf romantic" },
    sunglasses: { name: "Soft Round Sunglasses", noun: "round sunglasses soft" },
  },
  minimal: {
    blazer: { name: "Quiet Luxury Blazer", noun: "minimal tailored blazer quiet luxury" },
    shirt: { name: "Clean Essential Shirt", noun: "minimal essential shirt men" },
    trouser: { name: "Clean Straight Trousers", noun: "minimal straight trousers" },
    shoe: { name: "Minimal Leather Shoe", noun: "minimal leather shoes men" },
    belt: { name: "Thin Minimal Belt", noun: "thin minimal leather belt" },
    scarf: { name: "Quiet Scarf", noun: "minimal wool scarf" },
    sunglasses: { name: "Minimal Black Sunglasses", noun: "minimal black sunglasses" },
  },
  bold: {
    blazer: { name: "Statement Blazer", noun: "statement color blazer bold" },
    shirt: { name: "Bold Knit / Shirt", noun: "bold color sweater men" },
    trouser: { name: "Statement Trousers", noun: "bold wide trousers" },
    shoe: { name: "Statement Boots", noun: "statement boots men" },
    belt: { name: "Statement Belt", noun: "bold belt" },
    scarf: { name: "Statement Scarf", noun: "bold color scarf" },
    sunglasses: { name: "Statement Sunglasses", noun: "bold sunglasses" },
  },
  relaxed: {
    blazer: { name: "Easy Soft Blazer", noun: "unstructured soft blazer casual" },
    shirt: { name: "Easy Knit / Tee", noun: "relaxed knit sweater men casual" },
    trouser: { name: "Easy Wide Trousers", noun: "relaxed wide trousers casual" },
    shoe: { name: "Easy Suede Boot / Trainer", noun: "casual suede boots sneakers men" },
    belt: { name: "Casual Leather Belt", noun: "casual leather belt" },
    scarf: { name: "Easy Scarf", noun: "casual wool scarf" },
    sunglasses: { name: "Everyday Sunglasses", noun: "casual sunglasses" },
  },
};

/** Display names for plain catalog stubs (no styleFamily). */
const CATALOG_DISPLAY_LABELS = {
  blazer: "Tailored Blazer",
  shirt: "Crisp Cotton Shirt",
  trouser: "Tailored Trousers",
  shoe: "Leather Derby Shoe",
  scarf: "Fine Wool Scarf",
  belt: "Leather Belt",
  sunglasses: "Acetate Sunglasses",
};

function styleGenreEntry(styleFamily, garmentFamily) {
  const table = STYLE_GENRE_ITEMS[styleFamily];
  if (!table || !garmentFamily) return null;
  const entry = table[garmentFamily];
  if (!entry) return null;
  return { name: entry.name, noun: entry.noun };
}

/** Overlay genre labels onto a catalog stub for display and shopping. */
function styleAwareItem(item, styleFamily) {
  if (!item) return item;
  // Real Awin products keep their real names — never rewrite to "Baggy Cargo Pants"
  if (item.source === "awin" || item.shopUrl || /^(aw|ss)-/i.test(item.key)) {
    return { ...item, styleFamily };
  }
  const garmentFam = familyOfKey(item.key) || (item.type !== "accessory" ? item.type : null);
  const g = styleGenreEntry(styleFamily, garmentFam);
  if (!g) return { ...item, styleFamily };
  return {
    ...item,
    name: g.name || item.name,
    searchNoun: g.noun || item.searchNoun,
    searchQuery: g.noun || item.searchQuery,
    shopAsName: g.name || null,
    styleFamily,
  };
}

/** Resolve the item row the user sees for the current style (men's catalog). */
function displayCatalogItem(item, styleFamily = null) {
  if (!item) return item;
  if (item.source === "awin" || item.shopUrl) return { ...item, styleFamily: styleFamily || item.styleFamily };
  if (styleFamily) return styleAwareItem(item, styleFamily);
  const fam = familyOfKey(item.key) || (item.type !== "accessory" ? item.type : null);
  const label = fam && CATALOG_DISPLAY_LABELS[fam];
  if (!label || label === item.name) return item;
  return { ...item, name: label };
}

/** Replace catalog keys (shirtAlt, trouserAlt…) with human product names in stylist copy. */
function humanizeRationale(text, lang = "en") {
  if (!text) return "";
  let out = String(text);
  const keys = Object.keys(CATALOG).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const item = CATALOG[key];
    const name = (PRODUCT_NAMES_I18N[lang] && PRODUCT_NAMES_I18N[lang][item.id]) || item.name;
    out = out.replace(new RegExp(`\\b${key}\\b`, "g"), name);
  }
  return out;
}

/** Build a shopping query: palette color + style-genre garment (men's catalog). */
function buildItemSearchQuery(item, palette = [], avoid = [], styleFamily = null) {
  if (!item) return "";
  const styled = styleFamily ? styleAwareItem(item, styleFamily) : displayCatalogItem(item);
  const preferred = (palette || []).filter((p) => !(avoid || []).includes(p));
  const tags = item.paletteTags || [];
  let colorLabel = preferred.find((p) => tags.includes(p));
  if (!colorLabel && preferred.length) {
    if (item.type === "shirt") {
      colorLabel = preferred.find((p) => ["Ivory / Cream", "White", "Black", "Grey / Charcoal", "Navy"].includes(p)) || preferred[0];
    } else if (item.type === "shoe" || item.key?.includes("belt") || item.key?.includes("Belt")) {
      colorLabel = preferred.find((p) => ["Black", "Camel / Tan", "Rust / Terracotta", "Burgundy", "Navy"].includes(p)) || preferred[0];
    } else if (item.key?.includes("sunglasses")) {
      colorLabel = preferred.find((p) => ["Black", "Camel / Tan", "Ivory / Cream"].includes(p)) || preferred[0];
    } else {
      colorLabel = preferred.find((p) => !["Black", "Ivory / Cream", "White"].includes(p)) || preferred[0];
    }
  }
  if (!colorLabel && tags.length) colorLabel = tags[0];
  // Sexy / edgy / streetwear lean darker when palette allows
  if (styleFamily === "sexy" || styleFamily === "edgy") {
    colorLabel = preferred.find((p) => p === "Black" || p === "Burgundy" || p === "Navy") || colorLabel || "Black";
  }
  if (styleFamily === "streetwear") {
    colorLabel = preferred.find((p) => ["Black", "Grey / Charcoal", "Navy", "Olive", "Sand / Beige"].includes(p)) || colorLabel;
  }
  const colorPhrase = colorLabel ? (COLOR_SEARCH_TERMS[colorLabel] || [colorLabel.toLowerCase()])[0] : null;
  const noun = styled.searchNoun || styled.name;
  if (colorPhrase) return `${colorPhrase} ${noun}`.replace(/\s+/g, " ").trim();
  return styled.searchQuery || styled.name;
}

function productMatchesPalette(product, palette = [], avoid = []) {
  const title = `${product.title || ""} ${product.merchant || ""}`.toLowerCase();
  const avoidTerms = colorTermsForLabels(avoid);
  if (avoidTerms.some((t) => t.length > 2 && title.includes(t))) return false;
  if (!palette.length) return true;
  const want = colorTermsForLabels(palette);
  if (want.some((t) => t.length > 2 && title.includes(t))) return true;
  // Has a recognizable fashion color that is NOT in the palette → reject for precision
  const knownColors = ["white", "ivory", "cream", "off-white", "black", "navy", "grey", "gray", "charcoal", "beige", "sand", "khaki", "olive", "camel", "tan", "cognac", "brown", "burgundy", "wine", "rust", "terracotta", "blush", "pink", "forest", "green", "blue"];
  if (knownColors.some((c) => new RegExp(`\\b${c}\\b`).test(title))) return false;
  // No color word — keep as a soft candidate (ranked lower)
  return true;
}

function productPaletteRank(product, palette = []) {
  const title = (product.title || "").toLowerCase();
  const want = colorTermsForLabels(palette);
  let score = 0;
  for (const t of want) {
    if (t.length > 2 && title.includes(t)) score += 3;
  }
  return score;
}

function catalogKeyForItem(item) {
  if (item?.key && CATALOG[item.key]) return item.key;
  return Object.keys(CATALOG).find((k) => CATALOG[k].id === item?.id) || null;
}

// Real multi-store search — marketplaces, budget, high street, premium, luxury, outlet/resale
const qenc = (q) => encodeURIComponent(q);
/** Menswear-only store directory for favorites + shop-across links.
 *  Keep stable `id`s for existing favorites (zara, uniqlo, nordstrom, suitsupply).
 *  Catalog-tier entries mirror live Awin affiliate sources in menswear-catalog.json.
 */
const STORE_DIRECTORY = [
  // ---- Marketplaces & aggregators ----
  { id: "amazon", name: "Amazon", tier: "marketplace", url: (q) => `https://www.amazon.com/s?k=${qenc(q)}` },
  { id: "ebay", name: "eBay", tier: "marketplace", url: (q) => `https://www.ebay.com/sch/i.html?_nkw=${qenc(q)}` },
  { id: "walmart", name: "Walmart", tier: "marketplace", url: (q) => `https://www.walmart.com/search?q=${qenc(q)}` },
  { id: "target", name: "Target", tier: "marketplace", url: (q) => `https://www.target.com/s?searchTerm=${qenc(q)}` },
  { id: "google_shopping", name: "Google Shopping", tier: "marketplace", url: (q) => `https://www.google.com/search?tbm=shop&q=${qenc(q)}` },
  { id: "bing_shopping", name: "Bing Shopping", tier: "marketplace", url: (q) => `https://www.bing.com/shop?q=${qenc(q)}` },

  // ---- Live Awin catalog partners (menswear feed sources) ----
  { id: "emensuits", name: "Emensuits", tier: "catalog", url: (q) => `https://www.emensuits.com/search?q=${qenc(q)}` },
  { id: "albertonardoni", name: "Alberto Nardoni", tier: "catalog", url: (q) => `https://www.albertonardoni.com/search?q=${qenc(q)}` },
  { id: "viaduct", name: "Viaduct Clothing", tier: "catalog", url: (q) => `https://www.viaductclothing.co.uk/search?q=${qenc(q)}` },
  { id: "cerqular", name: "Cerqular", tier: "catalog", url: (q) => `https://www.cerqular.com/search?q=${qenc(q)}` },
  { id: "santoromilan", name: "Santoro Milan", tier: "catalog", url: (q) => `https://www.google.com/search?tbm=shop&q=${qenc(`Santoro Milan ${q}`)}` },
  { id: "fashiontamers", name: "Fashiontamers", tier: "catalog", url: (q) => `https://www.google.com/search?tbm=shop&q=${qenc(`Fashiontamers ${q}`)}` },

  // ---- Value / everyday menswear ----
  { id: "uniqlo", name: "Uniqlo", tier: "budget", url: (q) => `https://www.uniqlo.com/us/en/search?q=${qenc(q)}` },
  { id: "hm", name: "H&M Men", tier: "budget", url: (q) => `https://www2.hm.com/en_us/men/search-results.html?q=${qenc(q)}` },
  { id: "asos", name: "ASOS Men", tier: "budget", url: (q) => `https://www.asos.com/us/men/search/?q=${qenc(q)}` },
  { id: "gap", name: "Gap", tier: "budget", url: (q) => `https://www.gap.com/browse/search.do?searchText=${qenc(q)}` },
  { id: "oldnavy", name: "Old Navy", tier: "budget", url: (q) => `https://oldnavy.gap.com/browse/search.do?searchText=${qenc(q)}` },
  { id: "express", name: "Express Men", tier: "budget", url: (q) => `https://www.express.com/mens/search?q=${qenc(q)}` },
  { id: "pacsun", name: "PacSun", tier: "budget", url: (q) => `https://www.pacsun.com/search/?q=${qenc(q)}` },
  { id: "zumiez", name: "Zumiez", tier: "budget", url: (q) => `https://www.zumiez.com/catalogsearch/result/?q=${qenc(q)}` },
  { id: "hottopic", name: "Hot Topic", tier: "budget", url: (q) => `https://www.hottopic.com/search?q=${qenc(q)}` },
  { id: "cottonon", name: "Cotton On Men", tier: "budget", url: (q) => `https://cottonon.com/US/men/?q=${qenc(q)}` },

  // ---- High street / mainstream menswear ----
  { id: "zara", name: "Zara", tier: "highstreet", url: (q) => `https://www.zara.com/us/en/search?searchTerm=${qenc(q)}&section=MAN` },
  { id: "jcrew", name: "J.Crew", tier: "highstreet", url: (q) => `https://www.jcrew.com/search2/${qenc(q)}.jsp` },
  { id: "bananarepublic", name: "Banana Republic", tier: "highstreet", url: (q) => `https://bananarepublic.gap.com/browse/search.do?searchText=${qenc(q)}` },
  { id: "abercrombie", name: "Abercrombie", tier: "highstreet", url: (q) => `https://www.abercrombie.com/shop/us/search?searchTerm=${qenc(q)}` },
  { id: "hollister", name: "Hollister", tier: "highstreet", url: (q) => `https://www.hollisterco.com/shop/us/search?searchTerm=${qenc(q)}` },
  { id: "ae", name: "American Eagle", tier: "highstreet", url: (q) => `https://www.ae.com/us/en/search?searchTerm=${qenc(q)}` },
  { id: "urban", name: "Urban Outfitters", tier: "highstreet", url: (q) => `https://www.urbanoutfitters.com/search?q=${qenc(q)}` },
  { id: "mango", name: "Mango Man", tier: "highstreet", url: (q) => `https://shop.mango.com/us/en/search?kw=${qenc(q)}` },
  { id: "massimodutti", name: "Massimo Dutti", tier: "highstreet", url: (q) => `https://www.massimodutti.com/us/search?q=${qenc(q)}` },
  { id: "cos", name: "COS", tier: "highstreet", url: (q) => `https://www.cos.com/en-us/search?q=${qenc(q)}` },
  { id: "arket", name: "Arket", tier: "highstreet", url: (q) => `https://www.arket.com/en-us/search/?q=${qenc(q)}` },
  { id: "pullbear", name: "Pull&Bear", tier: "highstreet", url: (q) => `https://www.pullandbear.com/us/search?q=${qenc(q)}` },
  { id: "bershka", name: "Bershka", tier: "highstreet", url: (q) => `https://www.bershka.com/us/search?q=${qenc(q)}` },
  { id: "next", name: "Next", tier: "highstreet", url: (q) => `https://www.next.us/en/search?w=${qenc(q)}` },
  { id: "marksandspencer", name: "M&S", tier: "highstreet", url: (q) => `https://www.marksandspencer.com/us/search?q=${qenc(q)}` },
  { id: "levis", name: "Levi's", tier: "highstreet", url: (q) => `https://www.levi.com/US/en_US/search/${qenc(q)}` },
  { id: "nike", name: "Nike", tier: "highstreet", url: (q) => `https://www.nike.com/w?q=${qenc(q)}` },
  { id: "adidas", name: "Adidas", tier: "highstreet", url: (q) => `https://www.adidas.com/us/search?q=${qenc(q)}` },
  { id: "puma", name: "Puma", tier: "highstreet", url: (q) => `https://us.puma.com/us/en/search?q=${qenc(q)}` },
  { id: "vans", name: "Vans", tier: "highstreet", url: (q) => `https://www.vans.com/en-us/search?q=${qenc(q)}` },
  { id: "converse", name: "Converse", tier: "highstreet", url: (q) => `https://www.converse.com/shop/search?q=${qenc(q)}` },
  { id: "newbalance", name: "New Balance", tier: "highstreet", url: (q) => `https://www.newbalance.com/search?q=${qenc(q)}` },
  { id: "lululemon", name: "Lululemon", tier: "highstreet", url: (q) => `https://shop.lululemon.com/search?Ntt=${qenc(q)}` },
  { id: "vuori", name: "Vuori", tier: "highstreet", url: (q) => `https://vuoriclothing.com/search?q=${qenc(q)}` },
  { id: "everlane", name: "Everlane", tier: "highstreet", url: (q) => `https://www.everlane.com/search?q=${qenc(q)}` },
  { id: "quince", name: "Quince", tier: "highstreet", url: (q) => `https://www.onequince.com/search?q=${qenc(q)}` },
  { id: "footlocker", name: "Foot Locker", tier: "highstreet", url: (q) => `https://www.footlocker.com/search?query=${qenc(q)}` },
  { id: "jd_sports", name: "JD Sports", tier: "highstreet", url: (q) => `https://www.jdsports.com/search?q=${qenc(q)}` },
  { id: "zappos", name: "Zappos", tier: "highstreet", url: (q) => `https://www.zappos.com/search?term=${qenc(q)}` },
  { id: "dsw", name: "DSW", tier: "highstreet", url: (q) => `https://www.dsw.com/search?query=${qenc(q)}` },
  { id: "patagonia", name: "Patagonia", tier: "highstreet", url: (q) => `https://www.patagonia.com/search/?q=${qenc(q)}` },
  { id: "northface", name: "The North Face", tier: "highstreet", url: (q) => `https://www.thenorthface.com/en-us/search?q=${qenc(q)}` },
  { id: "columbia", name: "Columbia", tier: "highstreet", url: (q) => `https://www.columbia.com/search?q=${qenc(q)}` },
  { id: "rei", name: "REI", tier: "highstreet", url: (q) => `https://www.rei.com/search?q=${qenc(q)}` },
  { id: "llbean", name: "L.L.Bean", tier: "highstreet", url: (q) => `https://www.llbean.com/llb/search?freeText=${qenc(q)}` },
  { id: "dickies", name: "Dickies", tier: "highstreet", url: (q) => `https://www.dickies.com/search?q=${qenc(q)}` },
  { id: "carhartt", name: "Carhartt", tier: "highstreet", url: (q) => `https://www.carhartt.com/search?q=${qenc(q)}` },
  { id: "timberland", name: "Timberland", tier: "highstreet", url: (q) => `https://www.timberland.com/en-us/search?q=${qenc(q)}` },
  { id: "calvinklein", name: "Calvin Klein", tier: "highstreet", url: (q) => `https://www.calvinklein.us/en/search?q=${qenc(q)}` },
  { id: "tommy", name: "Tommy Hilfiger", tier: "highstreet", url: (q) => `https://usa.tommy.com/en/search?q=${qenc(q)}` },
  { id: "ralphlauren", name: "Ralph Lauren", tier: "highstreet", url: (q) => `https://www.ralphlauren.com/search?q=${qenc(q)}` },
  { id: "lacoste", name: "Lacoste", tier: "highstreet", url: (q) => `https://www.lacoste.com/us/lacoste/search/?q=${qenc(q)}` },
  { id: "guess", name: "Guess", tier: "highstreet", url: (q) => `https://www.guess.com/us/en/search?q=${qenc(q)}` },
  { id: "bensherman", name: "Ben Sherman", tier: "highstreet", url: (q) => `https://www.bensherman.com/search?q=${qenc(q)}` },

  // ---- Premium menswear ----
  { id: "nordstrom", name: "Nordstrom", tier: "premium", url: (q) => `https://www.nordstrom.com/sr?keyword=${qenc(q)}` },
  { id: "suitsupply", name: "SuitSupply", tier: "premium", url: (q) => `https://suitsupply.com/en-us/search?q=${qenc(q)}` },
  { id: "bonobos", name: "Bonobos", tier: "premium", url: (q) => `https://bonobos.com/search?q=${qenc(q)}` },
  { id: "toddsnyder", name: "Todd Snyder", tier: "premium", url: (q) => `https://www.toddsnyder.com/search?q=${qenc(q)}` },
  { id: "tedbaker", name: "Ted Baker", tier: "premium", url: (q) => `https://www.tedbaker.com/us/search?q=${qenc(q)}` },
  { id: "buckmason", name: "Buck Mason", tier: "premium", url: (q) => `https://www.buckmason.com/search?q=${qenc(q)}` },
  { id: "brooksbrothers", name: "Brooks Brothers", tier: "premium", url: (q) => `https://www.brooksbrothers.com/search?q=${qenc(q)}` },
  { id: "hugoboss", name: "Hugo Boss", tier: "premium", url: (q) => `https://www.hugoboss.com/us/search?q=${qenc(q)}` },
  { id: "bloomingdales", name: "Bloomingdale's", tier: "premium", url: (q) => `https://www.bloomingdales.com/shop/search?keyword=${qenc(q)}` },
  { id: "endclothing", name: "END.", tier: "premium", url: (q) => `https://www.endclothing.com/us/catalogsearch/result/?q=${qenc(q)}` },
  { id: "allsaints", name: "AllSaints", tier: "premium", url: (q) => `https://www.allsaints.com/search/?q=${qenc(q)}` },
  { id: "reiss", name: "Reiss", tier: "premium", url: (q) => `https://www.reiss.com/us/search/?q=${qenc(q)}` },
  { id: "theory", name: "Theory", tier: "premium", url: (q) => `https://www.theory.com/search?q=${qenc(q)}` },
  { id: "clubmonaco", name: "Club Monaco", tier: "premium", url: (q) => `https://www.clubmonaco.com/search?q=${qenc(q)}` },
  { id: "ragandbone", name: "rag & bone", tier: "premium", url: (q) => `https://www.rag-bone.com/search?q=${qenc(q)}` },
  { id: "vince", name: "Vince", tier: "premium", url: (q) => `https://www.vince.com/search?q=${qenc(q)}` },
  { id: "frame", name: "Frame", tier: "premium", url: (q) => `https://frame-store.com/search?q=${qenc(q)}` },
  { id: "citizens", name: "Citizens of Humanity", tier: "premium", url: (q) => `https://www.citizensofhumanity.com/search?q=${qenc(q)}` },
  { id: "agjeans", name: "AG Jeans", tier: "premium", url: (q) => `https://www.agjeans.com/search?q=${qenc(q)}` },
  { id: "apc", name: "A.P.C.", tier: "premium", url: (q) => `https://www.apc-us.com/search?q=${qenc(q)}` },
  { id: "acne", name: "Acne Studios", tier: "premium", url: (q) => `https://www.acnestudios.com/us/en/search?q=${qenc(q)}` },
  { id: "commonprojects", name: "Common Projects", tier: "premium", url: (q) => `https://www.commonprojects.com/search?q=${qenc(q)}` },
  { id: "veja", name: "Veja", tier: "premium", url: (q) => `https://www.veja-store.com/en-us/search?q=${qenc(q)}` },
  { id: "onrunning", name: "On", tier: "premium", url: (q) => `https://www.on.com/en-us/search?q=${qenc(q)}` },
  { id: "hoka", name: "HOKA", tier: "premium", url: (q) => `https://www.hoka.com/en/us/search?q=${qenc(q)}` },
  { id: "allbirds", name: "Allbirds", tier: "premium", url: (q) => `https://www.allbirds.com/search?q=${qenc(q)}` },
  { id: "selfridges", name: "Selfridges", tier: "premium", url: (q) => `https://www.selfridges.com/US/en/search/${qenc(q)}/` },

  // ---- Luxury menswear ----
  { id: "mrporter", name: "Mr Porter", tier: "luxury", url: (q) => `https://www.mrporter.com/en-us/mens/search?q=${qenc(q)}` },
  { id: "ssense", name: "SSENSE", tier: "luxury", url: (q) => `https://www.ssense.com/en-us/men/search?q=${qenc(q)}` },
  { id: "farfetch", name: "Farfetch", tier: "luxury", url: (q) => `https://www.farfetch.com/shopping/men/search/items.aspx?q=${qenc(q)}` },
  { id: "saks", name: "Saks", tier: "luxury", url: (q) => `https://www.saksfifthavenue.com/search?text=${qenc(q)}` },
  { id: "neimanmarcus", name: "Neiman Marcus", tier: "luxury", url: (q) => `https://www.neimanmarcus.com/search?q=${qenc(q)}` },
  { id: "bergdorf", name: "Bergdorf Goodman", tier: "luxury", url: (q) => `https://www.bergdorfgoodman.com/search?q=${qenc(q)}` },
  { id: "yoox", name: "YOOX", tier: "luxury", url: (q) => `https://www.yoox.com/us/searchResult?q=${qenc(q)}` },
  { id: "gucci", name: "Gucci", tier: "luxury", url: (q) => `https://www.gucci.com/us/en/search?q=${qenc(q)}` },
  { id: "prada", name: "Prada", tier: "luxury", url: (q) => `https://www.prada.com/us/en/search.html?q=${qenc(q)}` },
  { id: "burberry", name: "Burberry", tier: "luxury", url: (q) => `https://us.burberry.com/search/?searchTerm=${qenc(q)}` },
  { id: "louisvuitton", name: "Louis Vuitton", tier: "luxury", url: (q) => `https://us.louisvuitton.com/eng-us/search/${qenc(q)}` },
  { id: "balenciaga", name: "Balenciaga", tier: "luxury", url: (q) => `https://www.balenciaga.com/en-us/search?q=${qenc(q)}` },
  { id: "ysl", name: "Saint Laurent", tier: "luxury", url: (q) => `https://www.ysl.com/en-us/search?q=${qenc(q)}` },
  { id: "bottega", name: "Bottega Veneta", tier: "luxury", url: (q) => `https://www.bottegaveneta.com/en-us/search?q=${qenc(q)}` },
  { id: "dior", name: "Dior", tier: "luxury", url: (q) => `https://www.dior.com/en_us/fashion/search?query=${qenc(q)}` },
  { id: "versace", name: "Versace", tier: "luxury", url: (q) => `https://www.versace.com/us/en-us/search?q=${qenc(q)}` },
  { id: "givenchy", name: "Givenchy", tier: "luxury", url: (q) => `https://www.givenchy.com/us/en-us/search?q=${qenc(q)}` },
  { id: "valentino", name: "Valentino", tier: "luxury", url: (q) => `https://www.valentino.com/en-us/search?q=${qenc(q)}` },
  { id: "moncler", name: "Moncler", tier: "luxury", url: (q) => `https://www.moncler.com/en-us/search?q=${qenc(q)}` },
  { id: "canada_goose", name: "Canada Goose", tier: "luxury", url: (q) => `https://www.canadagoose.com/us/en/search?q=${qenc(q)}` },
  { id: "brunello", name: "Brunello Cucinelli", tier: "luxury", url: (q) => `https://shop.brunellocucinelli.com/en-us/search?q=${qenc(q)}` },
  { id: "loropiana", name: "Loro Piana", tier: "luxury", url: (q) => `https://us.loropiana.com/en/search?q=${qenc(q)}` },
  { id: "tomford", name: "Tom Ford", tier: "luxury", url: (q) => `https://www.tomford.com/search?q=${qenc(q)}` },
  { id: "offwhite", name: "Off-White", tier: "luxury", url: (q) => `https://www.off---white.com/en-us/search?q=${qenc(q)}` },
  { id: "ami", name: "AMI Paris", tier: "luxury", url: (q) => `https://www.amiparis.com/us/search?q=${qenc(q)}` },
  { id: "maisonmargiela", name: "Maison Margiela", tier: "luxury", url: (q) => `https://www.maisonmargiela.com/en-us/search?q=${qenc(q)}` },

  // ---- Outlet & menswear resale ----
  { id: "nordstromrack", name: "Nordstrom Rack", tier: "outlet", url: (q) => `https://www.nordstromrack.com/sr?keyword=${qenc(q)}` },
  { id: "saksoff5th", name: "Saks Off 5th", tier: "outlet", url: (q) => `https://www.saksoff5th.com/search?text=${qenc(q)}` },
  { id: "tjmaxx", name: "TJ Maxx", tier: "outlet", url: (q) => `https://tjmaxx.tjx.com/store/shop/?_dyncharset=UTF-8&q=${qenc(q)}` },
  { id: "marshalls", name: "Marshalls", tier: "outlet", url: (q) => `https://www.marshalls.com/us/store/shop/?_dyncharset=UTF-8&q=${qenc(q)}` },
  { id: "grailed", name: "Grailed", tier: "outlet", url: (q) => `https://www.grailed.com/shop?query=${qenc(q)}` },
  { id: "stockx", name: "StockX", tier: "outlet", url: (q) => `https://stockx.com/search?s=${qenc(q)}` },
  { id: "goat", name: "GOAT", tier: "outlet", url: (q) => `https://www.goat.com/search?query=${qenc(q)}` },
  { id: "therealreal", name: "The RealReal", tier: "outlet", url: (q) => `https://www.therealreal.com/products?keywords=${qenc(q)}` },
  { id: "vestiaire", name: "Vestiaire Collective", tier: "outlet", url: (q) => `https://us.vestiairecollective.com/search/?q=${qenc(q)}` },
  { id: "ebay_auth", name: "eBay Authenticity", tier: "outlet", url: (q) => `https://www.ebay.com/sch/i.html?_nkw=${qenc(q)}&rt=nc&LH_PrefLoc=1` },
  { id: "jcrewfactory", name: "J.Crew Factory", tier: "outlet", url: (q) => `https://factory.jcrew.com/search2/${qenc(q)}.jsp` },
  { id: "brfactory", name: "BR Factory", tier: "outlet", url: (q) => `https://bananarepublicfactory.gapfactory.com/browse/search.do?searchText=${qenc(q)}` },
  { id: "gapfactory", name: "Gap Factory", tier: "outlet", url: (q) => `https://www.gapfactory.com/browse/search.do?searchText=${qenc(q)}` },
];

const STORE_TIERS = [
  { id: "marketplace", labelKey: "shopTierMarketplace" },
  { id: "catalog", labelKey: "shopTierCatalog" },
  { id: "budget", labelKey: "shopTierBudget" },
  { id: "highstreet", labelKey: "shopTierHighStreet" },
  { id: "premium", labelKey: "shopTierPremium" },
  { id: "luxury", labelKey: "shopTierLuxury" },
  { id: "outlet", labelKey: "shopTierOutlet" },
];

function googleShoppingUrl(query) {
  return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(query)}`;
}

function storeLinksForItem(item, palette = [], avoid = [], styleFamily = null) {
  const q = buildItemSearchQuery(item, palette, avoid, styleFamily);
  return STORE_DIRECTORY.map((store) => ({
    ...store,
    href: store.url(q),
  }));
}
const ALT_MAP = {
  blazer: "blazerAlt",
  shirt: "shirtAlt",
  trouser: "trouserAlt",
  shoe: "shoeAlt",
  scarf: "scarfAlt",
  belt: "beltAlt",
  sunglasses: "sunglassesAlt",
};
const ALT_MAP_REV = Object.fromEntries(Object.entries(ALT_MAP).map(([k, v]) => [v, k]));

function familyOfKey(key) {
  if (!key) return null;
  const item = CATALOG[key];
  if (item?.family) return item.family;
  if (item?.type && item.type !== "accessory") return item.type;
  for (const [fam, keys] of Object.entries(ITEM_FAMILY_VARIANTS)) {
    if (keys.includes(key)) return fam;
  }
  if (ITEM_FAMILY_VARIANTS[key]) return key;
  // Live keys: ss-12345 — infer from prefix conventions when catalog row missing
  if (/^ss-/i.test(String(key))) return null;
  return null;
}

function variantsForKey(key) {
  const fam = familyOfKey(key);
  return fam ? (ITEM_FAMILY_VARIANTS[fam] || [key]) : [key];
}

/** Build Claude catalog payload — real product cards biased to occasion formality. */
function catalogPayloadForStylist(prompt = "", maxLive = 160) {
  return catalogPayloadForStylistShared(prompt, maxLive);
}

/** Best catalog variant for a family given the user's palette. */
function bestVariantInFamily(family, palette = [], avoid = [], structureHint = null) {
  const variants = ITEM_FAMILY_VARIANTS[family] || [];
  if (!variants.length) return family;
  let best = variants[0];
  let bestScore = -Infinity;
  for (const v of variants) {
    let s = itemPaletteScore(v, palette, avoid);
    // Prefer structured (non-Alt linen/wide) when tailored
    if (structureHint === "tailored" && !String(v).includes("Alt")) s += 4;
    if (structureHint === "relaxed" && String(v).includes("Alt")) s += 4;
    if (s > bestScore) {
      bestScore = s;
      best = v;
    }
  }
  return best;
}

function nextVariantInFamily(currentKey) {
  const variants = variantsForKey(currentKey);
  const idx = variants.indexOf(currentKey);
  if (idx < 0) return variants[0] || currentKey;
  return variants[(idx + 1) % variants.length];
}

const ACCESSORY_FAMILIES = ["belt", "scarf", "sunglasses"];
const ITEM_LABELS = {
  en: { blazer: "blazer", shirt: "shirt", trouser: "trousers", shoe: "shoes", belt: "belt", scarf: "scarf", sunglasses: "sunglasses" },
  es: { blazer: "blazer", shirt: "camisa", trouser: "pantalón", shoe: "zapatos", belt: "cinturón", scarf: "bufanda", sunglasses: "gafas" },
  fr: { blazer: "blazer", shirt: "chemise", trouser: "pantalon", shoe: "chaussures", belt: "ceinture", scarf: "écharpe", sunglasses: "lunettes" },
};
const ITEM_KEYWORDS = {
  blazer: ["blazer", "jacket", "coat", "chaqueta", "veste", "sacou"],
  shirt: ["shirt", "top", "turtleneck", "sweater", "knit", "camisa", "chemise", "col roulé", "pull"],
  trouser: ["trouser", "trousers", "pant", "pants", "bottom", "pantalon", "pantalones"],
  shoe: ["shoe", "shoes", "boot", "boots", "footwear", "zapato", "zapatos", "chaussure", "chaussures", "botas", "bottes"],
  belt: ["belt", "cinturón", "cinturon", "ceinture"],
  scarf: ["scarf", "pocket square", "bufanda", "écharpe", "echarpe", "foulard", "pañuelo"],
  sunglasses: ["sunglass", "sunglasses", "glasses", "gafas", "lunettes"],
};

/** Detect “change the belt / different shirt / everything but the shoes” style requests. */
function detectRevisionRequest(text) {
  const raw = (text || "").trim();
  const lower = raw.toLowerCase();
  if (!lower) return null;

  const revisionCue = /\b(different|another|change|swap|replace|instead|not the|don't like|dont like|hate|wrong|update|tweak|switch|new|other|remove|drop|lose|add|sin el|sin la|cambia|cambiar|otro|otra|diferente|no me gusta|quita|quitar|añade|anade|changer|autre|différent|different|remplace|remplacer|pas le|pas la|enlever|retire|ajouter)\b/i.test(lower)
    || /\b(everything|rest|else).{0,40}\b(but|except|aside|menos|sauf)\b/i.test(lower)
    || /\b(but|except|menos|sauf).{0,20}\b(the|el|la|le|les)?\s*(belt|shirt|blazer|trouser|pant|shoe|scarf|sunglass|cintur|ceinture|camisa|chemise)/i.test(lower);

  const targets = [];
  for (const [family, keys] of Object.entries(ITEM_KEYWORDS)) {
    if (keys.some((k) => lower.includes(k))) targets.push(family);
  }
  if (!targets.length) return null;
  if (!revisionCue && targets.length) {
    // Bare “belt?” isn’t a revision — need a cue unless it’s clearly “different X”
    return null;
  }

  const remove = /\b(remove|drop|lose|without|no belt|no scarf|quita|quitar|sin el|sin la|enlever|retire|sans)\b/i.test(lower);
  const lookMatch = lower.match(/\b(?:look|option|opción|option)\s*(\d)\b/i);
  const lookIndex = lookMatch ? Math.max(0, parseInt(lookMatch[1], 10) - 1) : null;

  return { targets: [...new Set(targets)], remove, lookIndex };
}

function otherAccessoryKey(currentFamily, items, palette, avoid, turn = 0) {
  const present = new Set(items.map(familyOfKey).filter(Boolean));
  const pool = ACCESSORY_FAMILIES.filter((f) => f !== currentFamily);
  // Prefer a family not already in the outfit
  const ordered = [...pool.filter((f) => !present.has(f)), ...pool.filter((f) => present.has(f))];
  if (!ordered.length) return null;
  const pick = ordered[turn % ordered.length];
  return bestVariantForPalette(pick, palette, avoid);
}

function reviseItemInList(items, family, { remove = false, turn = 0, palette = [], avoid = [] } = {}) {
  const variants = ITEM_FAMILY_VARIANTS[family] || [];
  const idx = items.findIndex((k) => variants.includes(k));
  const next = [...items];

  if (remove) {
    if (idx >= 0) {
      const replacement = ACCESSORY_FAMILIES.includes(family)
        ? otherAccessoryKey(family, items, palette, avoid, turn)
        : null;
      if (replacement) next[idx] = replacement;
      else next.splice(idx, 1);
    }
    return next;
  }

  if (idx >= 0) {
    // Cycle through color variants in the family
    next[idx] = nextVariantInFamily(next[idx]);
    // Every other ask on accessories: jump to a different accessory type
    if (ACCESSORY_FAMILIES.includes(family) && turn % 3 === 2) {
      const other = otherAccessoryKey(family, items, palette, avoid, turn);
      if (other) next[idx] = other;
    }
    return next;
  }

  // Target not in outfit — add best palette variant
  const addKey = bestVariantInFamily(family, palette, avoid);
  if (ACCESSORY_FAMILIES.includes(family)) {
    const accIdx = next.findIndex((k) => ACCESSORY_FAMILIES.includes(familyOfKey(k)));
    if (accIdx >= 0) next[accIdx] = addKey;
    else next.push(addKey);
  } else {
    next.push(addKey);
  }
  return next;
}

function reviseOutfits(baseOutfits, revision, profile, lang = "en") {
  const palette = profile?.palette || [];
  const avoid = profile?.avoid || [];
  const turn = stylistTurn;
  const labels = ITEM_LABELS[lang] || ITEM_LABELS.en;

  const outfits = baseOutfits.map((outfit, oi) => {
    if (revision.lookIndex != null && oi !== revision.lookIndex) return { ...outfit };
    let items = [...outfit.items];
    for (const family of revision.targets) {
      items = reviseItemInList(items, family, {
        remove: revision.remove,
        turn: turn + oi,
        palette,
        avoid,
      });
    }
    // Deduplicate families if accessory swap collided
    const seen = new Set();
    items = items.filter((k) => {
      const fam = familyOfKey(k) || k;
      if (seen.has(fam)) return false;
      seen.add(fam);
      return true;
    });
    const changed = revision.targets.map((f) => labels[f] || f).join(", ");
    const rationale = revision.remove
      ? (lang === "es"
        ? `Quité el ${changed} y cerré el look de otra forma — el resto se mantiene.`
        : lang === "fr"
          ? `J’ai retiré le ${changed} et fini autrement — le reste est inchangé.`
          : `I dropped the ${changed} and finished the look differently — everything else stays.`)
      : (lang === "es"
        ? `Cambié el ${changed}. El resto del look se mantiene.`
        : lang === "fr"
          ? `J’ai changé le ${changed}. Le reste de la tenue reste.`
          : `I changed the ${changed}. Everything else in the look stays.`);
    return {
      ...outfit,
      id: `${outfit.id || "look"}-rev-${turn}-${oi}`,
      items,
      rationale,
    };
  });

  return outfits;
}

function revisionIntroKey(revision) {
  if (revision.remove) return "stylistRevisionRemoved";
  if (revision.targets.length > 1) return "stylistRevisionMulti";
  return "stylistRevisionIntro";
}

/** Recipe library — scored against the user's prompt + profile to pick varied looks.
 *  styleFamily drives diversity so returned looks don't all feel the same. */
const OUTFIT_RECIPES = [
  {
    id: "quiet-tailored-work",
    outer: "blazer", top: "shirt", bottom: "trouser", shoe: "shoe", acc: "belt",
    occasions: ["work", "office", "meeting", "client", "formal", "wedding", "event"],
    vibe: ["quiet", "classic", "polished", "classy"],
    styleFamily: "classy",
    archetypes: ["Quiet Tailored", "Classic Polished"],
    lifestyles: ["Office / client-facing"],
    structure: "tailored",
  },
  {
    id: "classic-polished-event",
    outer: "blazer", top: "shirt", bottom: "trouser", shoe: "shoe", acc: "scarf",
    occasions: ["wedding", "formal", "event", "dinner"],
    vibe: ["classic", "polished", "quiet", "classy"],
    styleFamily: "classy",
    archetypes: ["Classic Polished", "Quiet Tailored"],
    lifestyles: ["Office / client-facing", "On the move — travel, events, varied"],
    structure: "tailored",
  },
  {
    id: "classy-black-tie-adjacent",
    outer: "blazerBlack", top: "shirt", bottom: "trouserBlack", shoe: "shoeBlack", acc: "beltAlt",
    occasions: ["wedding", "formal", "event", "dinner", "evening"],
    vibe: ["classy", "classic", "polished", "sexy"],
    styleFamily: "classy",
    archetypes: ["Classic Polished", "Quiet Tailored", "Sexy Evening"],
    lifestyles: ["Office / client-facing", "On the move — travel, events, varied"],
    structure: "tailored",
  },
  {
    id: "modern-sharp-work",
    outer: "blazer", top: "shirtAlt", bottom: "trouserAlt", shoe: "shoe", acc: "belt",
    occasions: ["work", "office", "meeting", "dinner", "evening"],
    vibe: ["modern", "minimal", "bold"],
    styleFamily: "modern",
    archetypes: ["Modern Sharp", "Minimal Directional", "Bold Expressive", "Edgy Contemporary"],
    lifestyles: ["Office / client-facing", "Creative or flexible workplace"],
    structure: "structured",
  },
  {
    id: "modern-navy-clean",
    outer: "blazerNavy", top: "shirt", bottom: "trouserNavy", shoe: "shoeBlack", acc: "sunglasses",
    occasions: ["work", "everyday", "dinner", "event"],
    vibe: ["modern", "minimal", "polished"],
    styleFamily: "modern",
    archetypes: ["Modern Sharp", "Minimal Directional", "Quiet Tailored"],
    lifestyles: ["Office / client-facing", "Creative or flexible workplace", "On the move — travel, events, varied"],
    structure: "structured",
  },
  {
    id: "modern-open-column",
    outer: null, top: "shirtAlt", bottom: "trouserNavy", shoe: "shoeBlack", acc: "beltAlt",
    occasions: ["everyday", "work", "dinner", "weekend"],
    vibe: ["modern", "minimal", "polished"],
    styleFamily: "modern",
    archetypes: ["Modern Sharp", "Minimal Directional", "Edgy Contemporary"],
    lifestyles: ["Creative or flexible workplace", "Remote, mostly at home", "Office / client-facing"],
    structure: "structured",
  },
  {
    id: "minimal-clean",
    outer: null, top: "shirt", bottom: "trouser", shoe: "shoe", acc: "sunglasses",
    occasions: ["everyday", "casual", "weekend", "work"],
    vibe: ["minimal", "quiet", "modern"],
    styleFamily: "minimal",
    archetypes: ["Minimal Directional", "Quiet Tailored", "Modern Sharp"],
    lifestyles: ["Remote, mostly at home", "Creative or flexible workplace", "Student life"],
    structure: "tailored",
  },
  {
    id: "relaxed-considered",
    outer: "blazerAlt", top: "shirt", bottom: "trouserAlt", shoe: "shoeAlt", acc: "sunglasses",
    occasions: ["weekend", "casual", "travel", "everyday", "dinner"],
    vibe: ["relaxed", "warm", "classic"],
    styleFamily: "relaxed",
    archetypes: ["Relaxed Considered", "Warm Layered", "Streetwear Cool"],
    lifestyles: ["Creative or flexible workplace", "Remote, mostly at home", "On the move — travel, events, varied"],
    structure: "relaxed",
  },
  {
    id: "warm-layered-knit",
    outer: null, top: "shirtAlt", bottom: "trouser", shoe: "shoeAlt", acc: "scarf",
    occasions: ["dinner", "date", "evening", "weekend", "everyday"],
    vibe: ["warm", "relaxed", "romantic"],
    styleFamily: "romantic",
    archetypes: ["Warm Layered", "Romantic Soft", "Relaxed Considered"],
    lifestyles: ["Remote, mostly at home", "Creative or flexible workplace"],
    structure: "relaxed",
  },
  {
    id: "romantic-soft-dinner",
    outer: null, top: "shirt", bottom: "trouserAlt", shoe: "shoe", acc: "scarf",
    occasions: ["dinner", "date", "evening", "event"],
    vibe: ["romantic", "warm", "soft", "sexy"],
    styleFamily: "romantic",
    archetypes: ["Romantic Soft", "Warm Layered", "Sexy Evening"],
    lifestyles: ["Creative or flexible workplace", "On the move — travel, events, varied"],
    structure: "relaxed",
  },
  {
    id: "bold-expressive",
    outer: "blazerAlt", top: "shirtAlt", bottom: "trouserAlt", shoe: "shoeAlt", acc: "sunglasses",
    occasions: ["weekend", "travel", "casual", "date", "event"],
    vibe: ["bold", "modern", "warm", "street"],
    styleFamily: "bold",
    archetypes: ["Bold Expressive", "Modern Sharp", "Streetwear Cool", "Edgy Contemporary"],
    lifestyles: ["Creative or flexible workplace", "Student life", "On the move — travel, events, varied"],
    structure: "relaxed",
  },
  {
    id: "travel-easy",
    outer: "blazerAlt", top: "shirt", bottom: "trouserAlt", shoe: "shoeAlt", acc: "sunglasses",
    occasions: ["travel", "weekend", "casual", "everyday"],
    vibe: ["relaxed", "warm", "modern"],
    styleFamily: "relaxed",
    archetypes: ["Relaxed Considered", "Warm Layered", "Minimal Directional", "Streetwear Cool"],
    lifestyles: ["On the move — travel, events, varied", "Student life"],
    structure: "relaxed",
  },
  {
    id: "office-no-fuss",
    outer: "blazer", top: "shirt", bottom: "trouser", shoe: "shoe", acc: null,
    occasions: ["work", "office", "meeting", "client"],
    vibe: ["quiet", "classic", "modern", "polished", "classy"],
    styleFamily: "classy",
    archetypes: ["Quiet Tailored", "Classic Polished", "Minimal Directional"],
    lifestyles: ["Office / client-facing"],
    structure: "tailored",
  },
  {
    id: "remote-elevated",
    outer: null, top: "shirtAlt", bottom: "trouser", shoe: "shoe", acc: "belt",
    occasions: ["everyday", "work", "weekend", "casual"],
    vibe: ["warm", "relaxed", "quiet", "minimal"],
    styleFamily: "minimal",
    archetypes: ["Relaxed Considered", "Warm Layered", "Minimal Directional"],
    lifestyles: ["Remote, mostly at home", "Student life"],
    structure: "relaxed",
  },
  {
    id: "student-sun",
    outer: null, top: "shirt", bottom: "trouserAlt", shoe: "shoeAlt", acc: "sunglasses",
    occasions: ["weekend", "casual", "everyday", "sunny", "travel"],
    vibe: ["relaxed", "minimal", "warm", "bold", "street"],
    styleFamily: "streetwear",
    archetypes: ["Relaxed Considered", "Bold Expressive", "Minimal Directional", "Streetwear Cool"],
    lifestyles: ["Student life", "Remote, mostly at home"],
    structure: "relaxed",
  },
  {
    id: "sharp-evening",
    outer: "blazer", top: "shirt", bottom: "trouserAlt", shoe: "shoe", acc: "scarf",
    occasions: ["dinner", "date", "evening", "event"],
    vibe: ["modern", "bold", "romantic", "polished", "sexy"],
    styleFamily: "sexy",
    archetypes: ["Modern Sharp", "Bold Expressive", "Romantic Soft", "Classic Polished", "Sexy Evening"],
    lifestyles: ["On the move — travel, events, varied", "Creative or flexible workplace"],
    structure: "structured",
  },
  {
    id: "formal-linen",
    outer: "blazerAlt", top: "shirt", bottom: "trouser", shoe: "shoe", acc: "belt",
    occasions: ["wedding", "formal", "event", "travel"],
    vibe: ["relaxed", "warm", "classic", "classy"],
    styleFamily: "classy",
    archetypes: ["Relaxed Considered", "Warm Layered", "Classic Polished"],
    lifestyles: ["On the move — travel, events, varied", "Creative or flexible workplace"],
    structure: "relaxed",
  },
  // --- Streetwear ---
  {
    id: "street-open-sun",
    outer: null, top: "shirtAlt", bottom: "trouserAlt", shoe: "shoeAlt", acc: "sunglassesAlt",
    occasions: ["weekend", "casual", "everyday", "travel", "street"],
    vibe: ["street", "bold", "relaxed", "modern"],
    styleFamily: "streetwear",
    archetypes: ["Streetwear Cool", "Bold Expressive", "Edgy Contemporary", "Relaxed Considered"],
    lifestyles: ["Student life", "Creative or flexible workplace", "Remote, mostly at home"],
    structure: "relaxed",
  },
  {
    id: "street-soft-blazer",
    outer: "blazerAlt", top: "shirtAlt", bottom: "trouserAlt", shoe: "shoeAlt", acc: "sunglasses",
    occasions: ["weekend", "casual", "everyday", "travel", "street", "event"],
    vibe: ["street", "modern", "bold", "relaxed"],
    styleFamily: "streetwear",
    archetypes: ["Streetwear Cool", "Modern Sharp", "Bold Expressive", "Edgy Contemporary"],
    lifestyles: ["Creative or flexible workplace", "Student life", "On the move — travel, events, varied"],
    structure: "relaxed",
  },
  {
    id: "street-black-utility",
    outer: null, top: "shirt", bottom: "trouserBlack", shoe: "shoeBlack", acc: "sunglassesAlt",
    occasions: ["weekend", "casual", "everyday", "street", "evening"],
    vibe: ["street", "edgy", "modern", "minimal"],
    styleFamily: "streetwear",
    archetypes: ["Streetwear Cool", "Edgy Contemporary", "Minimal Directional", "Bold Expressive"],
    lifestyles: ["Student life", "Creative or flexible workplace", "Remote, mostly at home"],
    structure: "relaxed",
  },
  // --- Sexy / evening ---
  {
    id: "sexy-black-column",
    outer: "blazerBlack", top: "shirtAlt", bottom: "trouserBlack", shoe: "shoeBlack", acc: "beltAlt",
    occasions: ["dinner", "date", "evening", "event", "sexy"],
    vibe: ["sexy", "bold", "modern", "polished"],
    styleFamily: "sexy",
    archetypes: ["Sexy Evening", "Bold Expressive", "Modern Sharp", "Edgy Contemporary"],
    lifestyles: ["On the move — travel, events, varied", "Creative or flexible workplace"],
    structure: "tailored",
  },
  {
    id: "sexy-open-knit",
    outer: null, top: "shirtAlt", bottom: "trouserBlack", shoe: "shoeBlack", acc: "scarfBurgundy",
    occasions: ["dinner", "date", "evening", "sexy"],
    vibe: ["sexy", "romantic", "warm", "bold"],
    styleFamily: "sexy",
    archetypes: ["Sexy Evening", "Romantic Soft", "Bold Expressive", "Warm Layered"],
    lifestyles: ["Creative or flexible workplace", "On the move — travel, events, varied"],
    structure: "relaxed",
  },
  {
    id: "sexy-navy-night",
    outer: "blazerNavy", top: "shirt", bottom: "trouserNavy", shoe: "shoeBlack", acc: "scarf",
    occasions: ["dinner", "date", "evening", "event", "sexy"],
    vibe: ["sexy", "classy", "polished", "modern"],
    styleFamily: "sexy",
    archetypes: ["Sexy Evening", "Classic Polished", "Modern Sharp", "Quiet Tailored"],
    lifestyles: ["Office / client-facing", "On the move — travel, events, varied", "Creative or flexible workplace"],
    structure: "tailored",
  },
  // --- Edgy ---
  {
    id: "edgy-black-stack",
    outer: "blazerBlack", top: "shirtAlt", bottom: "trouserAlt", shoe: "shoeBlack", acc: "sunglassesAlt",
    occasions: ["evening", "event", "date", "weekend", "street"],
    vibe: ["edgy", "modern", "bold", "street"],
    styleFamily: "edgy",
    archetypes: ["Edgy Contemporary", "Modern Sharp", "Bold Expressive", "Streetwear Cool"],
    lifestyles: ["Creative or flexible workplace", "Student life", "On the move — travel, events, varied"],
    structure: "structured",
  },
  {
    id: "edgy-bare-contrast",
    outer: null, top: "shirt", bottom: "trouserBlack", shoe: "shoeAlt", acc: "beltAlt",
    occasions: ["everyday", "weekend", "casual", "evening", "street"],
    vibe: ["edgy", "minimal", "modern", "bold"],
    styleFamily: "edgy",
    archetypes: ["Edgy Contemporary", "Minimal Directional", "Streetwear Cool", "Bold Expressive"],
    lifestyles: ["Creative or flexible workplace", "Student life", "Remote, mostly at home"],
    structure: "relaxed",
  },
  {
    id: "gym-adjacent-easy",
    outer: null, top: "shirtAlt", bottom: "trouserAlt", shoe: "shoeAlt", acc: "sunglassesAlt",
    occasions: ["active", "weekend", "casual", "everyday", "street"],
    vibe: ["street", "relaxed", "bold", "modern"],
    styleFamily: "streetwear",
    archetypes: ["Streetwear Cool", "Relaxed Considered", "Bold Expressive", "Minimal Directional"],
    lifestyles: ["Student life", "Remote, mostly at home", "Creative or flexible workplace"],
    structure: "relaxed",
  },
  {
    id: "wedding-guest-soft",
    outer: "blazerAlt", top: "shirt", bottom: "trouserNavy", shoe: "shoe", acc: "scarf",
    occasions: ["wedding", "event", "formal", "celebration"],
    vibe: ["romantic", "classy", "warm", "polished"],
    styleFamily: "romantic",
    archetypes: ["Romantic Soft", "Warm Layered", "Classic Polished", "Quiet Tailored"],
    lifestyles: ["On the move — travel, events, varied", "Office / client-facing", "Creative or flexible workplace"],
    structure: "relaxed",
  },
];

const OCCASION_KEYWORDS = [
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
  // Explicit sexy only — bare "hot"/"noche" false-positive on "photography" / "esta noche"
  { id: "sexy", keys: ["sexy", "seductive", "club", "night out", "noche sexy", "soirée sexy"] },
];

/** Style moods from free-text prompts — can override a quiet default profile. */
const STYLE_MOOD_KEYWORDS = [
  { id: "streetwear", keys: ["streetwear", "street", "urban", "hype", "skate", "cool casual", "urbano", "streetwear vibes"] },
  { id: "classy", keys: ["classy", "elegant", "polished", "refined", "sophisticated", "clásico", "elegante", "classique"] },
  // Require explicit sexy — "date night" is a dinner occasion, not a sexy mood lock
  { id: "sexy", keys: ["sexy", "seductive", "alluring", "night out", "sensual", "noche sexy", "soirée sexy"] },
  { id: "modern", keys: ["modern", "contemporary", "sharp", "sleek", "clean modern", "moderno", "moderne", "affûté"] },
  { id: "edgy", keys: ["edgy", "edge", "attitude", "rebel", "grunge soft"] },
  { id: "romantic", keys: ["romantic", "dreamy", "romántico", "romantique"] },
  { id: "minimal", keys: ["minimal", "quiet luxury", "minimalista", "minimaliste"] },
  { id: "bold", keys: ["bold", "statement", "loud", "expressive", "color pop", "audacieux"] },
  { id: "relaxed", keys: ["relaxed", "easy", "nothing fussy", "chill", "laid back", "relajado", "détendu"] },
];

function detectOccasions(text) {
  return detectOccasionsShared(text);
}

function detectStyleMoods(text) {
  const lower = (text || "").toLowerCase();
  const hits = [];
  for (const row of STYLE_MOOD_KEYWORDS) {
    if (row.keys.some((k) => {
      if (k.length <= 4) {
        return new RegExp(`(?:^|[^a-z])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^a-z]|$)`).test(lower);
      }
      return lower.includes(k);
    })) hits.push(row.id);
  }
  return hits;
}

/** Stock hero photo slugs in /public/heroes/{him|her}-{slug}.jpg */
const HERO_OCCASION_SLUGS = new Set(["date-night", "casual", "wedding", "default"]);

/**
 * Map look tags (occasion ids, styleFamily, free text) → hero filename slug.
 * Exact stock set: date-night | casual | wedding | default.
 */
function resolveHeroOccasionSlug({ occasion, styleFamily, occasions = [], prompt = "" } = {}) {
  const tokens = [
    occasion,
    styleFamily,
    ...(occasions || []),
    prompt,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!tokens.trim()) return "default";
  if (HERO_OCCASION_SLUGS.has(String(occasion || "").toLowerCase())) {
    return String(occasion).toLowerCase();
  }
  if (/\b(wedding|formal|gala|black\s*tie|ceremony|boda|mariage)\b/.test(tokens)
    || occasions.includes("wedding")
    || occasions.includes("event")) {
    return "wedding";
  }
  if (/\b(date[\s-]?night|dinner|sexy|evening|romantic|night\s*out|cena|dîner|rendez)\b/.test(tokens)
    || occasions.includes("dinner")
    || occasions.includes("sexy")
    || styleFamily === "sexy"
    || styleFamily === "romantic") {
    return "date-night";
  }
  if (/\b(casual|weekend|everyday|street|travel|work|office|modern|minimal|relaxed|edgy|bold|classy|trip|gym|workout)\b/.test(tokens)
    || ["weekend", "everyday", "street", "travel", "work", "active"].some((id) => occasions.includes(id))
    || ["streetwear", "modern", "minimal", "relaxed", "edgy", "bold", "classy"].includes(styleFamily)) {
    return "casual";
  }
  return "default";
}

function heroStockUrl(occasionSlug) {
  const slug = HERO_OCCASION_SLUGS.has(occasionSlug) ? occasionSlug : "default";
  return assetUrl(`/heroes/him-${slug}.jpg`);
}

function normalizeArchetype(archetype) {
  return String(archetype || "").replace(/\s*&\s*/g, " ").replace(/\s+/g, " ").trim();
}

function archetypeVibes(archetype) {
  const a = normalizeArchetype(archetype).toLowerCase();
  if (a.includes("street")) return ["street", "bold", "relaxed", "modern"];
  if (a.includes("sexy")) return ["sexy", "bold", "romantic", "polished"];
  if (a.includes("edgy")) return ["edgy", "modern", "bold", "street"];
  if (a.includes("quiet")) return ["quiet", "classic", "polished", "classy"];
  if (a.includes("relaxed")) return ["relaxed", "warm", "classic"];
  if (a.includes("modern")) return ["modern", "minimal", "bold"];
  if (a.includes("warm")) return ["warm", "relaxed", "romantic"];
  if (a.includes("classic")) return ["classic", "polished", "quiet", "classy"];
  if (a.includes("minimal")) return ["minimal", "modern", "quiet"];
  if (a.includes("romantic")) return ["romantic", "warm", "soft", "sexy"];
  if (a.includes("bold")) return ["bold", "modern", "warm", "street"];
  return ["modern", "relaxed", "classy"];
}

function archetypeStyleFamilies(archetype) {
  const a = normalizeArchetype(archetype).toLowerCase();
  if (a.includes("street")) return ["streetwear", "bold", "edgy", "relaxed"];
  if (a.includes("sexy")) return ["sexy", "romantic", "classy", "edgy"];
  if (a.includes("edgy")) return ["edgy", "streetwear", "modern", "bold"];
  if (a.includes("quiet")) return ["classy", "minimal", "modern"];
  if (a.includes("relaxed")) return ["relaxed", "streetwear", "romantic"];
  if (a.includes("modern")) return ["modern", "edgy", "minimal", "classy"];
  if (a.includes("warm")) return ["romantic", "relaxed", "sexy"];
  if (a.includes("classic")) return ["classy", "modern", "sexy"];
  if (a.includes("minimal")) return ["minimal", "modern", "streetwear"];
  if (a.includes("romantic")) return ["romantic", "sexy", "classy"];
  if (a.includes("bold")) return ["bold", "streetwear", "edgy", "modern"];
  return ["modern", "classy", "streetwear", "sexy"];
}

function profileOccasionIds(profile) {
  const map = {
    Work: "work",
    "Date nights": "dinner",
    Travel: "travel",
    "Events & celebrations": "event",
    "Everyday, just want to feel put together": "everyday",
  };
  return (profile?.occasions || []).map((o) => map[o]).filter(Boolean);
}

function lifestyleSignals(lifestyle) {
  const l = lifestyle || "";
  if (l.includes("Office")) return { occasions: ["work"], preferStructure: "tailored", preferOuter: true };
  if (l.includes("Creative")) return { occasions: ["work", "weekend", "dinner"], preferStructure: "relaxed", preferOuter: false };
  if (l.includes("Remote")) return { occasions: ["everyday", "weekend"], preferStructure: "relaxed", preferOuter: false };
  if (l.includes("On the move") || l.includes("travel")) return { occasions: ["travel", "event", "weekend"], preferStructure: "relaxed", preferOuter: true };
  if (l.includes("Student")) return { occasions: ["everyday", "weekend", "casual"], preferStructure: "relaxed", preferOuter: false };
  return { occasions: [], preferStructure: null, preferOuter: null };
}

function fitSignals(fit) {
  const f = (fit || "").toLowerCase();
  if (f.includes("fitted") || f.includes("tailored")) return { structure: "tailored", preferBase: true, preferOuter: true };
  if (f.includes("structured") || f.includes("true to size")) return { structure: "structured", preferBase: true, preferOuter: true };
  if (f.includes("oversized")) return { structure: "relaxed", preferBase: false, preferOuter: false };
  if (f.includes("relaxed")) return { structure: "relaxed", preferBase: false, preferOuter: null };
  return { structure: null, preferBase: null, preferOuter: null };
}

function recipeItems(recipe) {
  return [recipe.outer, recipe.top, recipe.bottom, recipe.shoe, recipe.acc].filter(Boolean);
}

function remapOutfitItemsToLive(itemKeys, prompt, occasions, profile = {}) {
  return remapOutfitItemsToLiveShared(itemKeys, prompt, occasions, profile);
}

function sanitizeOutfitForOccasion(outfit, prompt, occasions, profile = {}) {
  return sanitizeOutfitForOccasionShared(outfit, prompt, occasions, profile);
}

/** Pick the best color variant per family using palette first, then fit + style mood.
 *  Genre recipes pin intentional keys — do not collapse them back to the same tailored defaults. */
function tuneItemsToProfile(itemKeys, profile, styleMoods = [], styleFamily = null, { occasionDriven = false } = {}) {
  const palette = profile?.palette || [];
  const avoid = profile?.avoid || [];
  const fit = fitSignals(profile?.fit);
  const life = lifestyleSignals(profile?.lifestyle);
  const vibes = archetypeVibes(profile?.archetype);
  const moods = styleMoods || [];
  const family = styleFamily || moods[0] || null;
  const genreLocked = family && ["streetwear", "sexy", "edgy", "classy", "modern"].includes(family);

  // Keep the recipe's chosen silhouette/color keys for strong style genres or clear occasions
  if (genreLocked || occasionDriven) {
    return itemKeys.map((key) => (CATALOG[key] ? key : key));
  }

  const wantStreetOrEdgy = moods.some((m) => ["streetwear", "edgy", "bold"].includes(m))
    || vibes.some((v) => ["street", "edgy"].includes(v));
  const wantSexy = moods.includes("sexy") || vibes.includes("sexy");
  const wantTailored = !wantStreetOrEdgy && (
    fit.structure === "tailored" || fit.structure === "structured"
    || life.preferStructure === "tailored"
    || vibes.some((v) => ["quiet", "classic", "polished", "minimal", "classy", "sexy"].includes(v))
    || moods.some((m) => ["classy", "sexy", "modern"].includes(m))
  );
  const wantRelaxed = wantStreetOrEdgy
    || fit.structure === "relaxed"
    || life.preferStructure === "relaxed"
    || vibes.some((v) => ["relaxed", "warm", "romantic", "bold", "street"].includes(v))
    || moods.includes("relaxed");
  const structureHint = wantRelaxed && !wantTailored ? "relaxed" : wantTailored && !wantRelaxed ? "tailored" : fit.structure;

  return itemKeys.map((key) => {
    const fam = familyOfKey(key);
    if (!fam) return key;
    if ((wantSexy || wantStreetOrEdgy) && CATALOG[key] && (String(key).includes("Black") || String(key).includes("Navy") || String(key).includes("Alt"))) {
      return key;
    }
    return bestVariantInFamily(fam, palette, avoid, structureHint);
  });
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function buildRationale(recipe, occasionIds, lang, profile = {}) {
  const palette = profile?.palette || [];
  const hasBlazer = !!recipe.outer;
  const primary = occasionIds[0] || "everyday";
  const colorHint = palette.slice(0, 2).join(", ");
  const arch = normalizeArchetype(profile?.archetype) || "your style";
  const fit = profile?.fit || "";
  const fitBit = fit ? ` ${fit.toLowerCase()} fit,` : "";
  const family = recipe.styleFamily || (recipe.vibe || [])[0] || "";
  const en = {
    wedding: hasBlazer
      ? `Built for your ${arch} profile —${fitBit} a tailored outer layer in ${colorHint || "your palette"}, clean shirt, and trousers that hold the line.`
      : `For your ${arch} taste — polished pieces in ${colorHint || "your colors"} without going costume.`,
    dinner: `Dialed to your ${arch} DNA —${fitBit} evening-ready in ${colorHint || "your palette"}, finished so it feels intentional.`,
    work: hasBlazer
      ? `Client-ready for how you actually dress (${arch}) —${fitBit} structured layers in ${colorHint || "your palette"}.`
      : `Work-appropriate for your ${arch} style —${fitBit} elevated basics in ${colorHint || "your colors"}.`,
    travel: `Travel-smart for your ${arch} wardrobe — pieces in ${colorHint || "your palette"} that move and still look put together.`,
    weekend: `Weekend ease matched to your ${arch} answers —${fitBit} relaxed intention in ${colorHint || "your colors"}.`,
    event: `Celebration polish for a ${arch} dresser —${fitBit} clear silhouette in ${colorHint || "your palette"}.`,
    everyday: `An everyday edit from your profile (${arch}) —${fitBit} built around ${colorHint || "your palette"}, nothing shouting.`,
    formal: `Formal without stiffness — aligned to your ${arch} choices and ${colorHint || "chosen"} colors.`,
    evening: `Evening polish for your ${arch} style — ${colorHint || "your palette"}, wearable in low light.`,
    casual: `Casual with your point of view (${arch}) — easy pieces in ${colorHint || "your colors"}.`,
    street: `Streetwear energy for your ${arch} taste —${fitBit} looser attitude in ${colorHint || "your palette"}, sunglasses on.`,
    active: `Gym-adjacent casual — easy layers in ${colorHint || "neutrals"} you can actually move in.`,
    sexy: `Sexy, intentional evening read for ${arch} —${fitBit} darker lines in ${colorHint || "your colors"} that still feel wearable.`,
    classy: `Classy polish for your ${arch} profile —${fitBit} clean structure in ${colorHint || "your palette"}.`,
    modern: `Modern & sharp for your ${arch} DNA —${fitBit} crisp shapes in ${colorHint || "your palette"}.`,
    edgy: `Edgy contemporary for ${arch} —${fitBit} contrast and attitude in ${colorHint || "your colors"}.`,
  };
  const es = {
    wedding: `Según tu perfil ${arch} — capa sastre en ${colorHint || "tu paleta"}.`,
    dinner: `Ajustado a tu estilo ${arch} — listo para la noche en ${colorHint || "tu paleta"}.`,
    work: `Listo para el trabajo según tu perfil ${arch} — ${colorHint || "tu paleta"}.`,
    travel: `Viaje inteligente para tu estilo ${arch} — ${colorHint || "tu paleta"}.`,
    weekend: `Fin de semana según tus respuestas (${arch}) — ${colorHint || "tus colores"}.`,
    event: `Brillo de celebración para un estilo ${arch} — ${colorHint || "tu paleta"}.`,
    everyday: `Edit diario desde tu perfil (${arch}) — alrededor de ${colorHint || "tu paleta"}.`,
    formal: `Formal sin rigidez — alineado a tu ${arch} y ${colorHint || "tus colores"}.`,
    evening: `Noche según tu estilo ${arch} — ${colorHint || "tu paleta"}.`,
    casual: `Casual con tu criterio (${arch}) — ${colorHint || "tus colores"}.`,
    street: `Energía streetwear para tu estilo ${arch} — actitud más suelta en ${colorHint || "tu paleta"}.`,
    active: `Casual tipo gym — capas fáciles en ${colorHint || "neutros"} con las que puedes moverte.`,
    sexy: `Lectura sexy de noche para ${arch} — líneas más oscuras en ${colorHint || "tus colores"}.`,
    classy: `Elegancia clásica para tu perfil ${arch} — estructura limpia en ${colorHint || "tu paleta"}.`,
    modern: `Moderno y definido para tu ADN ${arch} — formas nítidas en ${colorHint || "tu paleta"}.`,
    edgy: `Edgy contemporáneo para ${arch} — contraste y actitud en ${colorHint || "tus colores"}.`,
  };
  const fr = {
    wedding: `Selon votre profil ${arch} — couche tailleur dans ${colorHint || "votre palette"}.`,
    dinner: `Calé sur votre style ${arch} — prêt pour le soir dans ${colorHint || "votre palette"}.`,
    work: `Prêt pour le bureau selon votre profil ${arch} — ${colorHint || "votre palette"}.`,
    travel: `Voyage malin pour votre style ${arch} — ${colorHint || "votre palette"}.`,
    weekend: `Week-end selon vos réponses (${arch}) — ${colorHint || "vos couleurs"}.`,
    event: `Éclat de célébration pour un style ${arch} — ${colorHint || "votre palette"}.`,
    everyday: `Edit quotidien depuis votre profil (${arch}) — autour de ${colorHint || "votre palette"}.`,
    formal: `Formel sans rigidité — aligné sur votre ${arch} et ${colorHint || "vos couleurs"}.`,
    evening: `Soir selon votre style ${arch} — ${colorHint || "votre palette"}.`,
    casual: `Casual avec votre point de vue (${arch}) — ${colorHint || "vos couleurs"}.`,
    street: `Énergie streetwear pour votre style ${arch} — attitude plus ample dans ${colorHint || "votre palette"}.`,
    active: `Casual type sport — couches faciles dans ${colorHint || "les neutres"} pour vraiment bouger.`,
    sexy: `Lecture sexy du soir pour ${arch} — lignes plus sombres dans ${colorHint || "vos couleurs"}.`,
    classy: `Élégance classique pour votre profil ${arch} — structure nette dans ${colorHint || "votre palette"}.`,
    modern: `Moderne et affûté pour votre ADN ${arch} — formes précises dans ${colorHint || "votre palette"}.`,
    edgy: `Edgy contemporain pour ${arch} — contraste et attitude dans ${colorHint || "vos couleurs"}.`,
  };
  const table = lang === "es" ? es : lang === "fr" ? fr : en;
  if (family && table[family] && ["streetwear", "sexy", "edgy", "classy", "modern"].includes(family)) {
    const key = family === "streetwear" ? "street" : family;
    return table[key] || table[primary] || table.everyday;
  }
  return table[primary] || table.everyday;
}

let stylistTurn = 0;

function composeOutfits(prompt, profile, lang = "en", count = 3) {
  stylistTurn += 1;
  const promptOccasions = detectOccasions(prompt);
  const styleMoods = detectStyleMoods(prompt);
  const profileOccasions = profileOccasionIds(profile);
  const life = lifestyleSignals(profile?.lifestyle);
  const fit = fitSignals(profile?.fit);
  const occasions = [...new Set([...promptOccasions, ...profileOccasions, ...life.occasions])];
  if (!occasions.length) occasions.push("everyday");
  const arch = normalizeArchetype(profile?.archetype);
  const vibes = archetypeVibes(arch);
  const preferredFamilies = archetypeStyleFamilies(arch);
  const palette = profile?.palette || [];
  const avoid = profile?.avoid || [];
  const budget = profile?.budget || "balanced";
  const moodDriven = styleMoods.length > 0;
  // Request text drives silhouette/formality first; Style DNA is a light nudge
  const occasionDriven = promptOccasions.length > 0 || moodDriven
    || /\b(look good|help me|dress me|tonight|no idea|ayúdame|habille|aide)\b/i.test(prompt || "");
  // Seed from full profile so different quiz answers shuffle differently
  const seed = hashSeed([
    prompt,
    arch,
    profile?.fit,
    profile?.lifestyle,
    budget,
    styleMoods.join(","),
    promptOccasions.join(","),
    (profileOccasions || []).join(","),
    palette.join(","),
    (avoid || []).join(","),
    stylistTurn,
  ].join("|"));

  const scored = OUTFIT_RECIPES.map((recipe, i) => {
    let items = recipeItems(recipe);
    items = tuneItemsToProfile(items, profile, styleMoods, recipe.styleFamily, { occasionDriven });
    let score = (seed + i * 31) % 11; // light shuffle only

    // --- REQUEST FIRST: prompt occasions beat Style DNA ---
    for (const o of recipe.occasions || []) {
      if (promptOccasions.includes(o)) score += 52;
      else if (profileOccasions.includes(o)) score += 6;
      else if (occasions.includes(o)) score += 4;
    }

    // --- Archetype (important, but not absolute — leave room for other styles) ---
    const recipeArch = (recipe.archetypes || []).map(normalizeArchetype);
    if (arch && recipeArch.includes(arch)) score += occasionDriven ? 12 : 28;
    else if (arch && recipeArch.some((a) => a.split(" ")[0] === arch.split(" ")[0])) score += occasionDriven ? 4 : 12;
    else score -= moodDriven || occasionDriven ? 0 : 2;
    for (const v of recipe.vibe || []) {
      if (vibes.includes(v)) score += occasionDriven ? 3 : 8;
    }
    if (preferredFamilies.includes(recipe.styleFamily)) score += occasionDriven ? 4 : 10;

    // --- Prompt style moods (beat a locked-in default DNA) ---
    if (styleMoods.length) {
      if (styleMoods.includes(recipe.styleFamily)) score += 48;
      for (const mood of styleMoods) {
        if ((recipe.vibe || []).includes(mood) || (recipe.vibe || []).includes(mood.replace("wear", ""))) score += 22;
        if (mood === "streetwear" && (recipe.vibe || []).includes("street")) score += 22;
        if (mood === "classy" && (recipe.vibe || []).some((v) => ["classy", "classic", "polished"].includes(v))) score += 18;
      }
      // Soft-penalize clashing families when the user asked for a mood
      if (!styleMoods.includes(recipe.styleFamily)
        && !(styleMoods.includes("classy") && recipe.styleFamily === "classy")
        && !(styleMoods.includes("modern") && recipe.styleFamily === "modern")) {
        const clash = {
          streetwear: ["classy"],
          classy: ["streetwear", "edgy"],
          sexy: ["streetwear", "minimal"],
          modern: ["romantic"],
          edgy: ["romantic", "classy"],
        };
        for (const mood of styleMoods) {
          if ((clash[mood] || []).includes(recipe.styleFamily)) score -= 16;
        }
      }
    }

    // --- Lifestyle ---
    const recipeLife = recipe.lifestyles || [];
    if (profile?.lifestyle && recipeLife.includes(profile.lifestyle)) score += occasionDriven ? 6 : 18;
    else if (profile?.lifestyle) score -= 2;
    for (const o of life.occasions) {
      if ((recipe.occasions || []).includes(o)) score += 8;
    }

    // --- Fit / structure ---
    if (fit.structure && recipe.structure === fit.structure) score += occasionDriven ? 6 : 16;
    else if (fit.structure === "tailored" && recipe.structure === "structured") score += 10;
    else if (fit.structure === "structured" && recipe.structure === "tailored") score += 10;
    else if (fit.structure && recipe.structure && fit.structure !== recipe.structure) score -= moodDriven || occasionDriven ? 4 : 10;

    const hasOuter = items.some((k) => familyOfKey(k) === "blazer");
    if (fit.preferOuter === true && hasOuter) score += 8;
    if (fit.preferOuter === false && !hasOuter) score += 8;
    if (fit.preferOuter === true && !hasOuter) score -= moodDriven || occasionDriven ? 2 : 5;
    if (life.preferOuter === true && hasOuter) score += 4;
    if (life.preferOuter === false && !hasOuter) score += 4;

    // Prefer base vs alt pieces per fit
    const altCount = items.filter((k) => ALT_MAP_REV[k]).length;
    if (fit.preferBase === true && !moodDriven && !occasionDriven) score += Math.max(0, 4 - altCount) * 2;
    if (fit.preferBase === false || styleMoods.includes("streetwear") || promptOccasions.includes("active")) score += altCount * 3;

    // Formality gates from the request
    if (promptOccasions.includes("weekend") || promptOccasions.includes("everyday") || promptOccasions.includes("street") || promptOccasions.includes("active") || styleMoods.includes("streetwear")) {
      if ((recipe.occasions || []).includes("wedding") || (recipe.occasions || []).includes("formal")) score -= 28;
    }
    if (promptOccasions.includes("wedding") || promptOccasions.includes("event") || promptOccasions.includes("funeral")) {
      if ((recipe.occasions || []).some((o) => ["wedding", "event", "formal", "celebration", "dinner"].includes(o))) score += 22;
      if (recipe.styleFamily === "classy" || recipe.styleFamily === "romantic") score += 12;
      if (!hasOuter && recipe.styleFamily !== "sexy") score -= 14;
      if (recipe.styleFamily === "streetwear" || recipe.structure === "relaxed" && promptOccasions.includes("funeral")) score -= 20;
    }
    if (promptOccasions.includes("active")) {
      if (recipe.styleFamily === "streetwear" || recipe.structure === "relaxed") score += 36;
      if (hasOuter || recipe.styleFamily === "classy") score -= 30;
      if ((recipe.occasions || []).includes("wedding") || (recipe.occasions || []).includes("formal")) score -= 40;
    }
    if (promptOccasions.includes("sexy") || styleMoods.includes("sexy")) {
      if ((recipe.vibe || []).includes("sexy") || recipe.styleFamily === "sexy") score += 24;
    }
    if (promptOccasions.includes("work") && !promptOccasions.includes("dinner")) {
      if ((recipe.occasions || []).includes("work") || recipe.styleFamily === "classy" || recipe.styleFamily === "modern") score += 20;
      if (recipe.styleFamily === "sexy" || recipe.styleFamily === "streetwear") score -= 16;
      if ((recipe.occasions || []).includes("active") || (recipe.occasions || []).includes("casual")) score -= 12;
    }
    if (promptOccasions.includes("dinner") || promptOccasions.includes("work")) {
      if ((recipe.occasions || []).includes("dinner") || (recipe.occasions || []).includes("work") || (recipe.occasions || []).includes("evening")) score += 14;
    }

    // --- Palette (hard constraint — green only when chosen) ---
    const paletteScore = outfitPaletteScore(items, palette, avoid);
    score += Math.min(36, paletteScore);
    if (palette.length && !paletteWantsGreen(palette)) {
      const greenCount = items.filter((k) => itemIsGreen(k)).length;
      score -= greenCount * 35;
    } else if (paletteWantsGreen(palette)) {
      const greenCount = items.filter((k) => itemIsGreen(k)).length;
      score += greenCount * 12;
    }

    // --- Budget / price cap from prompt ("under $200") ---
    if (budget === "elevated" && hasOuter) score += 8;
    if (budget === "elevated" && items.some((k) => familyOfKey(k) === "scarf")) score += 4;
    if (budget === "considered" && !hasOuter) score += 6;
    if (budget === "considered" && hasOuter) score -= 2;
    if (budget === "mixed") score += (seed + i) % 5;
    const priceCap = (prompt || "").match(/under\s*\$?\s*(\d+)/i) || (prompt || "").match(/menos\s*de\s*\$?\s*(\d+)/i) || (prompt || "").match(/moins\s*de\s*(\d+)/i);
    if (priceCap) {
      const cap = Number(priceCap[1]);
      const over = items.reduce((n, k) => n + ((CATALOG[k]?.price || 0) > cap ? 1 : 0), 0);
      score -= over * 18;
      const under = items.reduce((n, k) => n + ((CATALOG[k]?.price || 0) <= cap ? 1 : 0), 0);
      score += under * 4;
    }

    return { recipe, score, items, styleFamily: recipe.styleFamily || "modern" };
  }).sort((a, b) => b.score - a.score);

  // Diversity pass:
  // - mood chip (streetwear/sexy/…) → stay IN that genre, vary silhouettes
  // - open ask → span different style families
  const picked = [];
  const usedSigs = new Set();
  const usedRecipeIds = new Set();
  const usedFamilies = new Set();
  const primaryMood = styleMoods[0] || null;

  const tryTake = (row, mode) => {
    const fam = row.styleFamily || row.recipe.styleFamily || "modern";
    if (mode === "newFamily" && usedFamilies.has(fam) && usedFamilies.size < count) return false;
    if (mode === "sameMood" && primaryMood && fam !== primaryMood && !styleMoods.includes(fam)) return false;
    const remapped = remapOutfitItemsToLive(row.items, prompt, promptOccasions, profile);
    const sanitized = sanitizeOutfitForOccasion(
      {
        id: `${row.recipe.id}-${stylistTurn}-${picked.length}`,
        option: picked.length + 1,
        items: remapped.length ? remapped : row.items,
        rationale: buildRationale(row.recipe, occasions, lang, profile),
        recipeId: row.recipe.id,
        styleFamily: fam,
        occasion: resolveHeroOccasionSlug({
          styleFamily: fam,
          occasions: promptOccasions,
          prompt,
        }),
        score: row.score,
      },
      prompt,
      promptOccasions,
      profile,
    );
    if (!sanitized?.items?.length) return false;
    const sig = outfitSignature(sanitized.items);
    const core = sanitized.items.filter((k) => !ACCESSORY_KEYS.has(k)).join("+");
    if (usedSigs.has(sig) || usedSigs.has(`core:${core}`) || usedRecipeIds.has(row.recipe.id)) return false;
    usedSigs.add(sig);
    usedSigs.add(`core:${core}`);
    usedRecipeIds.add(row.recipe.id);
    usedFamilies.add(fam);
    const resolved = sanitized.items.map((k) => CATALOG[k]).filter(Boolean);
    const why = buildWhyThisWorks(resolved, prompt, promptOccasions);
    picked.push({ ...sanitized, rationale: why, whyThisWorks: why });
    return true;
  };

  if (moodDriven && primaryMood) {
    for (const row of scored) {
      if (picked.length >= count) break;
      tryTake(row, "sameMood");
    }
  } else {
    for (const row of scored) {
      if (picked.length >= count) break;
      tryTake(row, "newFamily");
    }
  }
  for (const row of scored) {
    if (picked.length >= count) break;
    tryTake(row, "any");
  }

  for (const row of scored) {
    if (picked.length >= count) break;
    const remapped = remapOutfitItemsToLive(row.items, prompt, promptOccasions, profile);
    const sanitized = sanitizeOutfitForOccasion(
      {
        id: `${row.recipe.id}-fill-${picked.length}`,
        option: picked.length + 1,
        items: remapped.length ? remapped : row.items,
        rationale: buildRationale(row.recipe, occasions, lang, profile),
        recipeId: row.recipe.id,
        styleFamily: row.styleFamily,
        occasion: resolveHeroOccasionSlug({
          styleFamily: row.styleFamily,
          occasions: promptOccasions,
          prompt,
        }),
      },
      prompt,
      promptOccasions,
      profile,
    );
    if (!sanitized?.items?.length) continue;
    const sig = outfitSignature(sanitized.items);
    if (usedSigs.has(sig)) continue;
    usedSigs.add(sig);
    const resolved = sanitized.items.map((k) => CATALOG[k]).filter(Boolean);
    const why = buildWhyThisWorks(resolved, prompt, promptOccasions);
    picked.push({ ...sanitized, rationale: why, whyThisWorks: why });
  }
  return picked;
}

const WEEK_DAY_KEYS = ["weekDayMon", "weekDayTue", "weekDayWed", "weekDayThu", "weekDayFri"];

/** Distinct silhouette fingerprint — outer presence, cut, accessory family. */
function silhouetteKey(items, recipe = null) {
  const families = (items || []).map(familyOfKey).filter(Boolean);
  const hasOuter = families.includes("blazer");
  const acc = families.find((f) => ACCESSORY_FAMILIES.includes(f)) || "none";
  const trouser = (items || []).find((k) => familyOfKey(k) === "trouser") || "";
  const shirt = (items || []).find((k) => familyOfKey(k) === "shirt") || "";
  const bottom = String(trouser).includes("Alt") ? "ease" : "straight";
  const top = String(shirt).includes("Alt") ? "soft" : "crisp";
  const structure = recipe?.structure || "neutral";
  return `${hasOuter ? "layered" : "open"}-${structure}-${top}-${bottom}-${acc}`;
}

function recipeSilhouette(recipe) {
  return silhouetteKey(recipeItems(recipe), recipe);
}

/** One consolidated shopping list of unique pieces across the week's looks. */
function buildShoppingList(outfits) {
  const seen = new Set();
  const list = [];
  const familyOrder = ["blazer", "shirt", "trouser", "shoe", "belt", "scarf", "sunglasses"];
  for (const outfit of outfits || []) {
    for (const key of outfit.items || []) {
      if (!CATALOG[key] || seen.has(key)) continue;
      seen.add(key);
      list.push({ key, reason: "" });
    }
  }
  list.sort((a, b) => {
    const fa = familyOfKey(a.key) || "";
    const fb = familyOfKey(b.key) || "";
    const ia = familyOrder.indexOf(fa);
    const ib = familyOrder.indexOf(fb);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.key.localeCompare(b.key);
  });
  return list;
}

/**
 * Mon–Fri weekwardrobe plan: 5 looks, no repeat silhouettes, one shopping list.
 * Biases toward workweek polish from the user's profile.
 */
function composeWeekPlan(prompt, profile, lang = "en") {
  const dayLabels = WEEK_DAY_KEYS.map((k) => (UI[lang] && UI[lang][k]) || UI.en[k]);
  // Score as a workweek request, then enforce unique silhouettes across 5 days
  const workPrompt = `${prompt} work office weekday meeting`;
  stylistTurn += 1;
  const promptOccasions = ["work", "everyday"];
  const profileOccasions = profileOccasionIds(profile);
  const life = lifestyleSignals(profile?.lifestyle);
  const fit = fitSignals(profile?.fit);
  const occasions = [...new Set([...promptOccasions, ...profileOccasions, ...life.occasions])];
  const arch = normalizeArchetype(profile?.archetype);
  const vibes = archetypeVibes(arch);
  const palette = profile?.palette || [];
  const avoid = profile?.avoid || [];
  const budget = profile?.budget || "balanced";
  const seed = hashSeed([
    workPrompt, arch, profile?.fit, profile?.lifestyle, budget,
    palette.join(","), (avoid || []).join(","), "weekplan", stylistTurn,
  ].join("|"));

  const scored = OUTFIT_RECIPES.map((recipe, i) => {
    let items = tuneItemsToProfile(recipeItems(recipe), profile, [], recipe.styleFamily);
    let score = (seed + i * 31) % 7;
    const recipeArch = (recipe.archetypes || []).map(normalizeArchetype);
    if (arch && recipeArch.includes(arch)) score += 28;
    else if (arch && recipeArch.some((a) => a.split(" ")[0] === arch.split(" ")[0])) score += 12;
    for (const v of recipe.vibe || []) {
      if (vibes.includes(v)) score += 8;
    }
    // Week plans still rotate style families so Mon–Fri doesn't feel identical
    if (["classy", "modern", "minimal", "relaxed", "sexy"].includes(recipe.styleFamily)) score += 6;
    if (profile?.lifestyle && (recipe.lifestyles || []).includes(profile.lifestyle)) score += 18;
    if (fit.structure && recipe.structure === fit.structure) score += 16;
    else if (fit.structure === "tailored" && recipe.structure === "structured") score += 10;
    for (const o of recipe.occasions || []) {
      if (o === "work" || o === "everyday") score += 18;
      else if (profileOccasions.includes(o)) score += 10;
    }
    const paletteScore = outfitPaletteScore(items, palette, avoid);
    score += Math.min(36, paletteScore);
    if (palette.length && !paletteWantsGreen(palette)) {
      score -= items.filter((k) => itemIsGreen(k)).length * 35;
    }
    if (budget === "elevated" && items.some((k) => familyOfKey(k) === "blazer")) score += 8;
    if (budget === "considered" && !items.some((k) => familyOfKey(k) === "blazer")) score += 6;
    return { recipe, score, items, silhouette: recipeSilhouette(recipe), styleFamily: recipe.styleFamily };
  }).sort((a, b) => b.score - a.score);

  const picked = [];
  const usedSilhouettes = new Set();
  const usedRecipeIds = new Set();
  const usedFamilies = new Set();
  for (const row of scored) {
    const sil = row.silhouette || silhouetteKey(row.items, row.recipe);
    const fam = row.styleFamily || row.recipe.styleFamily || "modern";
    if (usedSilhouettes.has(sil) || usedRecipeIds.has(row.recipe.id)) continue;
    // Also guard against identical family shapes after palette tuning
    const tunedSil = silhouetteKey(row.items, row.recipe);
    if (usedSilhouettes.has(tunedSil)) continue;
    // Prefer rotating style families across the week when possible
    if (usedFamilies.has(fam) && usedFamilies.size < 4 && picked.length < 4) continue;
    usedSilhouettes.add(sil);
    usedSilhouettes.add(tunedSil);
    usedRecipeIds.add(row.recipe.id);
    usedFamilies.add(fam);
    const dayIndex = picked.length;
    const remapped = remapOutfitItemsToLive(row.items, workPrompt, promptOccasions, profile);
    const sanitized = sanitizeOutfitForOccasion(
      {
        id: `week-${row.recipe.id}-${stylistTurn}-${dayIndex}`,
        option: dayIndex + 1,
        day: dayLabels[dayIndex] || `Day ${dayIndex + 1}`,
        items: remapped.length ? remapped : row.items,
        rationale: buildRationale(row.recipe, occasions, lang, profile),
        recipeId: row.recipe.id,
        silhouette: tunedSil,
        styleFamily: fam,
        occasion: resolveHeroOccasionSlug({
          styleFamily: fam,
          occasions: dayIndex === 4 ? ["dinner", "sexy"] : promptOccasions,
          prompt: workPrompt,
        }),
      },
      workPrompt,
      promptOccasions,
      profile,
    );
    if (!sanitized?.items?.length) continue;
    picked.push(sanitized);
    if (picked.length >= 5) break;
  }

  // Fill if the recipe library couldn't yield 5 unique silhouettes
  let fill = 0;
  while (picked.length < 5 && fill < scored.length) {
    const row = scored[fill++];
    const dayIndex = picked.length;
    const items = [...row.items];
    // Nudge accessory to force a fresh silhouette when needed
    const accIdx = items.findIndex((k) => ACCESSORY_FAMILIES.includes(familyOfKey(k)));
    const accPool = ACCESSORY_FAMILIES.filter((f) => !items.some((k) => familyOfKey(k) === f));
    if (accPool.length) {
      const nextAcc = bestVariantInFamily(accPool[dayIndex % accPool.length], palette, avoid, row.recipe.structure);
      if (accIdx >= 0) items[accIdx] = nextAcc;
      else items.push(nextAcc);
    } else if (dayIndex % 2 === 1) {
      // Toggle outer on/off for variety
      const blazerIdx = items.findIndex((k) => familyOfKey(k) === "blazer");
      if (blazerIdx >= 0) items.splice(blazerIdx, 1);
      else items.unshift(bestVariantInFamily("blazer", palette, avoid, row.recipe.structure));
    }
    const sil = silhouetteKey(items, row.recipe);
    if (usedSilhouettes.has(sil)) continue;
    usedSilhouettes.add(sil);
    const fam = row.styleFamily || row.recipe.styleFamily || "modern";
    picked.push({
      id: `week-fill-${stylistTurn}-${dayIndex}`,
      option: dayIndex + 1,
      day: dayLabels[dayIndex] || `Day ${dayIndex + 1}`,
      items,
      rationale: buildRationale(row.recipe, occasions, lang, profile),
      recipeId: row.recipe.id,
      silhouette: sil,
      styleFamily: fam,
      occasion: resolveHeroOccasionSlug({
        styleFamily: fam,
        occasions: dayIndex === 4 ? ["dinner", "sexy"] : promptOccasions,
        prompt: workPrompt,
      }),
    });
  }

  return { outfits: picked, shoppingList: buildShoppingList(picked) };
}

// Model photos for men's looks (legacy try-on / fuzzy match helpers)
const MODEL_KEY_ORDER = [
  "blazer", "blazerAlt", "blazerNavy", "blazerBlack",
  "shirt", "shirtAlt",
  "trouser", "trouserAlt", "trouserNavy", "trouserBlack",
  "shoe", "shoeAlt", "shoeBlack",
  "scarf", "scarfAlt", "scarfBurgundy",
  "belt", "beltAlt",
  "sunglasses", "sunglassesAlt",
];
const ACCESSORY_KEYS = new Set(["scarf", "scarfAlt", "scarfBurgundy", "belt", "beltAlt", "sunglasses", "sunglassesAlt"]);
function outfitSignature(itemKeys) {
  return [...itemKeys].sort((a, b) => MODEL_KEY_ORDER.indexOf(a) - MODEL_KEY_ORDER.indexOf(b)).join("+");
}

const MODEL_IMAGES = {
  "blazer+shirt+trouser+shoe": assetUrl("/models/model-man-wedding.jpg"),
  "blazerAlt+shirt+trouser+shoe": assetUrl("/models/model-man-wedding-alt.jpg"),
  "blazer+shirtAlt+trouser+shoe": assetUrl("/models/model-man-wedding-alt.jpg"),
  "blazerAlt+shirtAlt+trouser+shoe": assetUrl("/models/model-man-wedding-alt.jpg"),
  "shirt+trouser+shoe+scarf": assetUrl("/models/model-man-dinner.jpg"),
  "shirt+trouser+shoe": assetUrl("/models/model-man-everyday.jpg"),
};

function resolveModelImage(itemKeys) {
  const map = MODEL_IMAGES;
  const sig = outfitSignature(itemKeys);
  if (map[sig]) return map[sig];

  // Normalize keys to garment family for fuzzy match
  const family = (k) => familyOfKey(k) || ALT_MAP_REV[k] || k;
  // Ignore accessories when matching model photos (models don't always wear them)
  const coreWant = itemKeys.filter((k) => !ACCESSORY_KEYS.has(k)).map(family);
  const want = new Set(coreWant);
  let best = null;
  let bestScore = -1;
  for (const [key, src] of Object.entries(map)) {
    const parts = key.split("+").filter((k) => !ACCESSORY_KEYS.has(k));
    const have = new Set(parts.map(family));
    let score = 0;
    for (const w of want) if (have.has(w)) score += 2;
    for (const h of have) if (!want.has(h)) score -= 1;
    if (want.has("blazer") === have.has("blazer")) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = src;
    }
  }
  return best || map["shirt+trouser+shoe"] || Object.values(map)[0];
}

// ==================== ONBOARDING DATA ====================
/** Prefer men's photography for quiz cards. */
function resolveStepImage(meta) {
  if (!meta) return "";
  return meta.image || meta.man || "";
}

const LIFESTYLE_OPTIONS = ["Office / client-facing", "Creative or flexible workplace", "Remote, mostly at home", "On the move — travel, events, varied", "Student life"];
const LIFESTYLE_META = {
  "Office / client-facing": {
    image: assetUrl("/onboarding/life-office-man.jpg"),
    descKey: "lifeOfficeDesc",
  },
  "Creative or flexible workplace": {
    image: assetUrl("/onboarding/life-creative-man.jpg"),
    descKey: "lifeCreativeDesc",
  },
  "Remote, mostly at home": {
    image: assetUrl("/onboarding/life-remote-man.jpg"),
    descKey: "lifeRemoteDesc",
  },
  "On the move — travel, events, varied": {
    image: assetUrl("/onboarding/life-travel-man.jpg"),
    descKey: "lifeTravelDesc",
  },
  "Student life": {
    image: assetUrl("/onboarding/life-student-man.jpg"),
    descKey: "lifeStudentDesc",
  },
};
const ARCHETYPE_OPTIONS = [
  "Quiet & Tailored",
  "Relaxed & Considered",
  "Modern & Sharp",
  "Warm & Layered",
  "Classic & Polished",
  "Minimal & Directional",
  "Romantic & Soft",
  "Bold & Expressive",
  "Streetwear & Cool",
  "Sexy & Evening",
  "Edgy & Contemporary",
];

const ARCHETYPE_META = {
  "Quiet & Tailored": {
    image: assetUrl("/styles/style-quiet-tailored-man.jpg"),
    descKey: "archQuietDesc",
  },
  "Relaxed & Considered": {
    image: assetUrl("/styles/style-relaxed-considered-man.jpg"),
    descKey: "archRelaxedDesc",
  },
  "Modern & Sharp": {
    image: assetUrl("/styles/style-modern-sharp-man.jpg"),
    descKey: "archModernDesc",
  },
  "Warm & Layered": {
    image: assetUrl("/styles/style-warm-layered-man.jpg"),
    descKey: "archWarmDesc",
  },
  "Classic & Polished": {
    image: assetUrl("/styles/style-classic-polished-man.jpg"),
    descKey: "archClassicDesc",
  },
  "Minimal & Directional": {
    image: assetUrl("/styles/style-minimal-directional-man.jpg"),
    descKey: "archMinimalDesc",
  },
  "Romantic & Soft": {
    image: assetUrl("/styles/style-romantic-soft-man.jpg"),
    descKey: "archRomanticDesc",
  },
  "Bold & Expressive": {
    image: assetUrl("/styles/style-bold-expressive-man.jpg"),
    descKey: "archBoldDesc",
  },
  // Reuse closest existing photography until dedicated street/sexy/edgy shoots ship
  "Streetwear & Cool": {
    image: assetUrl("/styles/style-bold-expressive-man.jpg"),
    descKey: "archStreetDesc",
  },
  "Sexy & Evening": {
    image: assetUrl("/styles/style-romantic-soft-man.jpg"),
    descKey: "archSexyDesc",
  },
  "Edgy & Contemporary": {
    image: assetUrl("/styles/style-modern-sharp-man.jpg"),
    descKey: "archEdgyDesc",
  },
};
const FIT_OPTIONS = ["Fitted & tailored", "True to size, structured", "Relaxed, room to move", "Oversized, intentionally loose"];
const FIT_META = {
  "Fitted & tailored": {
    image: assetUrl("/onboarding/fit-fitted-man.jpg"),
  },
  "True to size, structured": {
    image: assetUrl("/onboarding/fit-structured-man.jpg"),
  },
  "Relaxed, room to move": {
    image: assetUrl("/onboarding/fit-relaxed-man.jpg"),
  },
  "Oversized, intentionally loose": {
    image: assetUrl("/onboarding/fit-oversized-man.jpg"),
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
const OCCASION_META = {
  Work: {
    image: assetUrl("/onboarding/occ-work-man.jpg"),
    descKey: "occWorkDesc",
  },
  "Date nights": {
    image: assetUrl("/onboarding/occ-date-man.jpg"),
    descKey: "occDateDesc",
  },
  Travel: {
    image: assetUrl("/onboarding/occ-travel-man.jpg"),
    descKey: "occTravelDesc",
  },
  "Events & celebrations": {
    image: assetUrl("/onboarding/occ-events-man.jpg"),
    descKey: "occEventsDesc",
  },
  "Everyday, just want to feel put together": {
    image: assetUrl("/onboarding/occ-everyday-man.jpg"),
    descKey: "occEverydayDesc",
  },
};

const STEPS = [
  { id: "lifestyle", titleKey: "step0Title", promptKey: "step0Prompt", type: "photoList", options: LIFESTYLE_OPTIONS, meta: LIFESTYLE_META },
  { id: "archetype", titleKey: "step1Title", promptKey: "step1Prompt", type: "archetype", options: ARCHETYPE_OPTIONS },
  { id: "fit", titleKey: "step2Title", promptKey: "step2Prompt", type: "visual", options: FIT_OPTIONS, meta: FIT_META },
  { id: "palette", titleKey: "step3Title", promptKey: "step3Prompt", type: "palette", options: COLOR_OPTIONS },
  { id: "budget", titleKey: "step4Title", promptKey: "step4Prompt", type: "budget", options: BUDGET_OPTIONS },
  { id: "occasions", titleKey: "step5Title", promptKey: "step5Prompt", type: "photoMulti", options: OCCASION_OPTIONS, meta: OCCASION_META },
  { id: "sizes", titleKey: "step6Title", promptKey: "step6Prompt", type: "sizes" },
];

const DEFAULT_PROFILE = {
  name: "Alex",
  archetype: "Quiet Tailored",
  fit: "Fitted & tailored",
  lifestyle: "Office / client-facing",
  palette: ["Navy", "Ivory / Cream", "Black", "Camel / Tan"],
  avoid: [],
  budget: "balanced",
  occasions: ["Work", "Events & celebrations"],
  favoriteStores: ["zara", "uniqlo", "nordstrom", "suitsupply"],
};

/** Empty shell for brand-new visitors — do NOT seed DEFAULT_PROFILE (named "Alex") into storage. */
const EMPTY_PROFILE = {
  name: "",
  archetype: null,
  fit: null,
  lifestyle: null,
  palette: [],
  avoid: [],
  budget: null,
  occasions: [],
  favoriteStores: [],
};

const APP_STAGES = new Set(["welcome", "signup", "onboarding", "reveal", "pro", "occasion", "app"]);
const STORAGE_KEY = "vestra.profile.v1";

/** Strip legacy gender/audience fields from profiles saved before men's-only. */
function sanitizeProfile(profile) {
  if (!profile || typeof profile !== "object") return { ...EMPTY_PROFILE };
  const {
    audience: _audience,
    modelGender: _modelGender,
    ...rest
  } = profile;
  return rest;
}

function sanitizeAnswers(answers) {
  if (!answers || typeof answers !== "object") {
    return {
      name: "", lifestyle: null, archetype: null, fit: null, palette: [], avoid: [], budget: null, occasions: [], sizes: {},
    };
  }
  const { audience: _audience, ...rest } = answers;
  return rest;
}

function loadStoredState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const hadAudienceStep = !!(parsed?.answers && "audience" in parsed.answers)
      || !!(parsed?.profile && ("audience" in (parsed.profile || {}) || "modelGender" in (parsed.profile || {})));
    if (hadAudienceStep && Number.isFinite(parsed?.step) && parsed.step > 0) {
      // Old quizzes started with audience at index 0 — shift down one step
      parsed.step = Math.max(0, parsed.step - 1);
    }
    if (parsed?.profile) parsed.profile = sanitizeProfile(parsed.profile);
    if (parsed?.answers) parsed.answers = sanitizeAnswers(parsed.answers);
    if (Number.isFinite(parsed?.step) && parsed.step >= STEPS.length) {
      parsed.step = Math.max(0, STEPS.length - 1);
    }
    // Rewrite storage immediately so stale "Ladies" / modelGender never linger
    if (hadAudienceStep) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      } catch {
        /* ignore */
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

function stageFromHash() {
  if (typeof window === "undefined") return null;
  const h = String(window.location.hash || "").replace(/^#/, "").toLowerCase();
  return APP_STAGES.has(h) ? h : null;
}

function setStageHash(stage) {
  if (typeof window === "undefined") return;
  try {
    const next = `#${stage}`;
    if (window.location.hash === next) return;
    // Prefer hash assignment so a mid-click reload can still recover the stage
    // even if localStorage write is delayed or blocked.
    window.location.hash = stage;
  } catch {
    try {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${stage}`);
    } catch {
      /* ignore */
    }
  }
}

function initialStageFromStorage(stored) {
  // Hash wins — CTA clicks write it synchronously so a remount can't lose the transition
  const fromHash = stageFromHash();
  if (fromHash) return fromHash;
  const stage = stored?.stage;
  if (!stage || !APP_STAGES.has(stage)) return "welcome";
  if (stage === "app") {
    return stored?.profile?.name ? "app" : "welcome";
  }
  return stage;
}

/** Write enough state for a cold boot before React setState (beats SW/remount races). */
function persistBootstrap({ stage, profile, lang = "en", tab = "home", step = 0, answers = null, messages = [] }) {
  try {
    const prev = loadStoredState() || {};
    const payload = {
      ...prev,
      lang: lang || prev.lang || "en",
      stage,
      step,
      tab,
      profile: sanitizeProfile(profile || prev.profile || EMPTY_PROFILE),
      answers: sanitizeAnswers(answers || prev.answers || {
        name: "", lifestyle: null, archetype: null, fit: null, palette: [], avoid: [], budget: null, occasions: [], sizes: {},
      }),
      savedOutfits: prev.savedOutfits || [],
      messages,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
  setStageHash(stage);
}

// ==================== APP DOWNLOAD / INSTALL ====================
/** Optional public store listings — set via Vite env when published. */
const APP_STORE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_APP_STORE_URL)
    ? String(import.meta.env.VITE_APP_STORE_URL)
    : "";
const PLAY_STORE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_PLAY_STORE_URL)
    ? String(import.meta.env.VITE_PLAY_STORE_URL)
    : "";

function detectMobilePlatform() {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

function AppleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M16.365 1.43c0 1.14-.42 2.2-1.24 3.02-.9.9-2.1 1.42-3.2 1.34-.1-1.2.46-2.42 1.28-3.24.9-.9 2.28-1.54 3.16-1.12zm3.5 16.94c-.64 1.48-.94 2.14-1.76 3.46-1.14 1.74-2.76 3.9-4.76 3.92-1.78.02-2.24-1.16-4.66-1.14-2.42.02-2.92 1.16-4.7 1.14-2-.02-3.52-1.98-4.66-3.72C-2.3 18.3-1.1 11.8 1.7 8.3c1.56-1.96 3.6-3.12 5.66-3.12 2.12 0 3.46 1.16 5.22 1.16 1.7 0 2.74-1.16 5.2-1.16 1.74 0 3.58.94 4.9 2.56-4.3 2.36-3.6 8.52.18 10.63z" />
    </svg>
  );
}

function PlayMark() {
  return (
    <svg width="16" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M3.6 2.3c-.4.2-.6.7-.6 1.3v16.8c0 .6.2 1.1.6 1.3l.1.1 9.4-9.5v-.2L3.7 2.2l-.1.1zm11.2 6.4L11.3 12l3.5 3.3 4.3-2.5c.7-.4.7-1.1 0-1.5l-4.3-2.6zM4.2 21.5l8.3-8.3-1.8-1.7L3.5 20c.1.6.4 1 .7 1.5zm8.3-10.7L4.2 2.5c-.3.4-.6.9-.7 1.5l7.2 7.1 1.8-1.7z" />
    </svg>
  );
}

function InstallSheet({ platform, onClose, deferredPrompt, onPromptInstall }) {
  const { t } = useLang();
  const isIos = platform === "ios";
  const storeUrl = isIos ? APP_STORE_URL : PLAY_STORE_URL;
  const canNativeInstall = !isIos && deferredPrompt;

  return (
    <div className="install-overlay" onClick={onClose} role="presentation">
      <div className="install-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button type="button" className="shop-close" onClick={onClose} aria-label={t("shopClose")}>
          <X size={16} />
        </button>
        <div className="install-sheet-icon">{isIos ? <AppleMark /> : <PlayMark />}</div>
        <h3 className="install-sheet-title">{isIos ? t("downloadIosTitle") : t("downloadAndroidTitle")}</h3>
        <p className="install-sheet-steps">
          {(isIos ? t("downloadIosSteps") : t("downloadAndroidSteps")).split("\n").map((line) => (
            <span key={line} className="install-step-line">{line}</span>
          ))}
        </p>
        {!storeUrl && <p className="install-sheet-note">{t("downloadUnavailable")}</p>}
        <div className="install-sheet-actions">
          {canNativeInstall && (
            <button type="button" className="onb-primary-btn" onClick={onPromptInstall}>
              {t("downloadInstallNow")}
            </button>
          )}
          {storeUrl ? (
            <a className="install-store-link" href={storeUrl} target="_blank" rel="noopener noreferrer">
              {t("downloadOpenStore")} <ExternalLink size={12} />
            </a>
          ) : null}
          <button type="button" className="onb-skip-link" onClick={onClose}>{t("downloadGotIt")}</button>
        </div>
      </div>
    </div>
  );
}

// ==================== ONBOARDING SCREENS ====================
function SiteFooter({ className = "" }) {
  const { t } = useLang();
  return (
    <footer className={`site-footer ${className}`.trim()}>
      <a href="/terms">{t("footerTerms")}</a>
      <span className="site-footer-sep" aria-hidden="true">·</span>
      <a href="/privacy">{t("footerPrivacy")}</a>
      <span className="site-footer-sep" aria-hidden="true">·</span>
      <a href="mailto:support@wearvestra.com">{t("footerSupport")}</a>
    </footer>
  );
}

function WelcomeScreen({ onStart, onSkip }) {
  const { t } = useLang();
  const [installPlatform, setInstallPlatform] = useState(null);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    const onBip = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  async function promptAndroidInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } catch {
      /* ignore */
    }
    setDeferredPrompt(null);
    setInstallPlatform(null);
  }

  function handleDownload(platform) {
    const detected = detectMobilePlatform();
    // Prefer native Chrome install when available on Android
    if (platform === "android" && deferredPrompt && (detected === "android" || detected === "other")) {
      promptAndroidInstall();
      return;
    }
    // Open published store listing when configured
    if (platform === "ios" && APP_STORE_URL) {
      window.open(APP_STORE_URL, "_blank", "noopener,noreferrer");
      return;
    }
    if (platform === "android" && PLAY_STORE_URL && !deferredPrompt) {
      // Still show install sheet so users on web get PWA steps + store link
      setInstallPlatform("android");
      return;
    }
    setInstallPlatform(platform);
  }

  return (
    <div className="onb-screen onb-center">
      <LanguageSwitcher corner />
      <div className="onb-eyebrow">{t("welcomeEyebrow")}</div>
      <h1 className="onb-hero-title">{t("welcomeTitleLine1")}<br />{t("welcomeTitleLine2")}</h1>
      <p className="onb-hero-sub">{t("welcomeSub")}</p>
      <button
        type="button"
        className="onb-primary-btn"
        data-testid="welcome-get-started"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onStart?.();
        }}
      >
        {t("getStarted")}
      </button>

      <div className="download-block">
        <div className="download-label">{t("downloadAppLabel")}</div>
        <div className="download-row">
          <button type="button" className="download-badge download-badge-ios" onClick={() => handleDownload("ios")}>
            <AppleMark />
            <span className="download-badge-text">
              <span className="download-badge-tiny">iPhone</span>
              <span className="download-badge-main">{t("downloadIos")}</span>
            </span>
          </button>
          <button type="button" className="download-badge download-badge-android" onClick={() => handleDownload("android")}>
            <PlayMark />
            <span className="download-badge-text">
              <span className="download-badge-tiny">Android</span>
              <span className="download-badge-main">{t("downloadAndroid")}</span>
            </span>
          </button>
        </div>
      </div>

      <button
        type="button"
        className="onb-skip-link"
        data-testid="welcome-skip"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onSkip?.();
        }}
      >
        {t("skipTesting")}
      </button>

      <SiteFooter className="site-footer-onboarding" />

      {installPlatform && (
        <InstallSheet
          platform={installPlatform}
          onClose={() => setInstallPlatform(null)}
          deferredPrompt={deferredPrompt}
          onPromptInstall={promptAndroidInstall}
        />
      )}
    </div>
  );
}

function SignupScreen({ onContinue, onBack, onAuthSuccess }) {
  const { t } = useLang();
  const cloudOn = supabaseConfigured;
  const [mode, setMode] = useState("signup"); // signup | login
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(""); // "" | "check-email" | "ok"

  function showError(err) {
    const msg = String(err?.message || err?.error_description || err || "").trim();
    setHint(msg || t("authErrorGeneric"));
    setStatus("");
  }

  async function handleAuth(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    if (mode === "signup" && !trimmedName) {
      setHint(t("nameRequired"));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setHint(t("emailRequired"));
      return;
    }
    if (String(password).length < 6) {
      setHint(t("passwordRequired"));
      return;
    }
    setBusy(true);
    setHint("");
    setStatus("");
    try {
      if (mode === "signup") {
        const data = await signUpWithEmail({
          email: trimmedEmail,
          password,
          name: trimmedName,
          emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/#signup` : undefined,
        });
        const identities = data?.user?.identities;
        if (Array.isArray(identities) && identities.length === 0) {
          showError(t("authAccountExists"));
          setMode("login");
          return;
        }
        // Email confirmation ON → no session yet (this is the common “nothing happened” case)
        if (!data?.session) {
          setEmail(trimmedEmail);
          setStatus("check-email");
          setHint("");
          return;
        }
        if (!data?.user) {
          showError(t("authErrorGeneric"));
          return;
        }
        setStatus("ok");
        await onAuthSuccess?.({
          user: data.user,
          session: data.session,
          mode: "signup",
          name: trimmedName,
          email: trimmedEmail,
        });
      } else {
        const data = await signInWithEmail({ email: trimmedEmail, password });
        if (!data?.user) {
          showError(t("authErrorGeneric"));
          return;
        }
        setStatus("ok");
        await onAuthSuccess?.({
          user: data.user,
          session: data.session,
          mode: "login",
          name: data.user?.user_metadata?.name || trimmedEmail.split("@")[0],
          email: trimmedEmail,
        });
      }
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  function handleGuestContinue(e) {
    e?.preventDefault?.();
    const trimmed = name.trim();
    if (!trimmed) {
      setHint(t("nameRequired"));
      return;
    }
    onContinue({ name: trimmed, email: email.trim().toLowerCase() });
  }

  return (
    <div className="onb-screen auth-screen">
      <button type="button" className="onb-back" onClick={onBack}><ArrowLeft size={16} /></button>
      <div className="onb-center auth-center">
        <div className="onb-eyebrow auth-eyebrow">{t("createAccountEyebrow")}</div>
        <h2 className="onb-title">{t("whereReachYouLine1")}<br />{t("whereReachYouLine2")}</h2>

        {status === "check-email" && (
          <div className="auth-status-banner" role="status">
            <div className="auth-status-title">{t("authCheckEmailTitle")}</div>
            <p className="auth-status-body">
              {t("authCheckEmailBody").replace("{email}", email.trim().toLowerCase())}
            </p>
            <p className="auth-status-body">{t("authCheckEmailHint")}</p>
            <button
              type="button"
              className="onb-primary-btn"
              style={{ marginTop: 12 }}
              onClick={() => { setStatus(""); setMode("login"); setPassword(""); setHint(""); }}
            >
              {t("authModeLogin")}
            </button>
          </div>
        )}

        {status !== "check-email" && (
          <>
            {cloudOn && (
              <div className="auth-mode-toggle" role="tablist" aria-label="Account mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "signup"}
                  className={`auth-mode-btn ${mode === "signup" ? "active" : ""}`}
                  onClick={() => { setMode("signup"); setHint(""); setStatus(""); }}
                >
                  {t("authModeSignup")}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "login"}
                  className={`auth-mode-btn ${mode === "login" ? "active" : ""}`}
                  onClick={() => { setMode("login"); setHint(""); setStatus(""); }}
                >
                  {t("authModeLogin")}
                </button>
              </div>
            )}

            <form className="auth-form" onSubmit={cloudOn ? handleAuth : handleGuestContinue}>
              {(!cloudOn || mode === "signup") && (
                <>
                  <div className="onb-mini-label auth-field-label">{t("nameLabel")}</div>
                  <input
                    className="onb-input"
                    type="text"
                    autoComplete="given-name"
                    autoFocus={mode === "signup" || !cloudOn}
                    placeholder={t("namePlaceholder")}
                    value={name}
                    onChange={(e) => { setName(e.target.value); setHint(""); }}
                  />
                </>
              )}

              {cloudOn ? (
                <>
                  <div className="onb-mini-label auth-field-label">{t("signupEmailLabel")}</div>
                  <input
                    className="onb-input"
                    type="email"
                    autoComplete="email"
                    autoFocus={mode === "login"}
                    placeholder={t("emailPlaceholder")}
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setHint(""); }}
                  />
                  <div className="onb-mini-label auth-field-label">{t("signupPasswordLabel")}</div>
                  <input
                    className="onb-input"
                    type="password"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    placeholder={t("passwordPlaceholder")}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setHint(""); }}
                  />
                  {hint ? <p className="auth-error-box" role="alert">{hint}</p> : null}
                  <button className="onb-primary-btn" type="submit" disabled={busy} style={{ marginTop: 20 }}>
                    {busy ? t("authBusy") : (mode === "signup" ? t("authSubmitSignup") : t("authSubmitLogin"))}
                  </button>
                  {mode === "signup" ? (
                    <p className="auth-legal-agree">
                      {t("signupLegalAgree")
                        .split(/(\{terms\}|\{privacy\})/)
                        .map((part, i) => {
                          if (part === "{terms}") return <a key={i} href="/terms">{t("footerTerms")}</a>;
                          if (part === "{privacy}") return <a key={i} href="/privacy">{t("footerPrivacy")}</a>;
                          return <span key={i}>{part}</span>;
                        })}
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="onb-mini-label auth-field-label">{t("signupEmailLabel")}</div>
                  <input
                    className="onb-input"
                    type="email"
                    autoComplete="email"
                    placeholder={t("emailPlaceholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  {hint ? <p className="auth-error-box" role="alert">{hint}</p> : null}
                  <button className="onb-primary-btn" type="submit" style={{ marginTop: 20 }}>{t("continueBtn")}</button>
                  <p className="auth-legal-agree">
                    {t("signupLegalAgree")
                      .split(/(\{terms\}|\{privacy\})/)
                      .map((part, i) => {
                        if (part === "{terms}") return <a key={i} href="/terms">{t("footerTerms")}</a>;
                        if (part === "{privacy}") return <a key={i} href="/privacy">{t("footerPrivacy")}</a>;
                        return <span key={i}>{part}</span>;
                      })}
                  </p>
                  <p className="onb-fine-print">{t("authCloudOff")}</p>
                </>
              )}
            </form>
            {(!cloudOn || mode === "signup") && status !== "check-email" ? (
              <p className="signup-pro-note">{t("signupProNote")}</p>
            ) : null}
            <p className="onb-fine-print">{t("signupNote")}</p>
            <SiteFooter className="site-footer-onboarding" />
          </>
        )}
      </div>
    </div>
  );
}

function ImportLocalModal({ onYes, onNo }) {
  const { t } = useLang();
  return (
    <div className="install-overlay" role="presentation">
      <div className="install-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3 className="install-sheet-title">{t("importLocalTitle")}</h3>
        <p className="install-sheet-steps">{t("importLocalBody")}</p>
        <div className="install-sheet-actions">
          <button type="button" className="onb-primary-btn" onClick={onYes}>{t("importLocalYes")}</button>
          <button type="button" className="profile-reset-cancel" onClick={onNo}>{t("importLocalNo")}</button>
        </div>
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
      : question.type === "single" || question.type === "budget" || question.type === "archetype" || question.type === "visual" || question.type === "photoList"
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
            {question.options.map((opt) => {
              const meta = ARCHETYPE_META[opt] || {};
              const image = resolveStepImage(meta);
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

        {question.type === "photoList" && (
          <div className="onb-style-grid">
            {question.options.map((opt) => {
              const meta = (question.meta && question.meta[opt]) || {};
              const image = resolveStepImage(meta);
              return (
                <button
                  key={opt}
                  type="button"
                  className={`onb-style-card ${answers[question.id] === opt ? "selected" : ""}`}
                  onClick={() => selectSingle(opt)}
                >
                  <img className="onb-style-image onb-lifestyle-image" src={image} alt={tOpt(opt)} loading="lazy" decoding="async" />
                  <div className="onb-style-copy">
                    <div className="onb-style-title">{tOpt(opt)}</div>
                    {meta.descKey && <div className="onb-style-desc">{t(meta.descKey)}</div>}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {question.type === "photoMulti" && (
          <div className="onb-style-grid">
            {question.options.map((opt) => {
              const meta = (question.meta && question.meta[opt]) || {};
              const image = resolveStepImage(meta);
              const selected = (answers[question.id] || []).includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  className={`onb-style-card ${selected ? "selected" : ""}`}
                  onClick={() => toggleMulti(opt)}
                >
                  <img className="onb-style-image onb-lifestyle-image" src={image} alt={tOpt(opt)} loading="lazy" />
                  <div className="onb-style-copy">
                    <div className="onb-style-title">{tOpt(opt)}</div>
                    {meta.descKey && <div className="onb-style-desc">{t(meta.descKey)}</div>}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {question.type === "visual" && (
          <div className={`onb-visual-grid ${question.options.length === 3 ? "onb-visual-grid-3" : ""}`}>
            {question.options.map((opt) => {
              const meta = (question.meta && question.meta[opt]) || {};
              const image = resolveStepImage(meta);
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

function ProValueScreen({ onContinue }) {
  const { t } = useLang();
  return (
    <div className="onb-screen onb-center onb-pro-screen" data-testid="onboarding-pro-screen">
      <div className="onb-eyebrow">{t("onbProEyebrow")}</div>
      <h2 className="onb-title onb-pro-title">{t("onbProTitle")}</h2>
      <p className="onb-hero-sub onb-pro-body">{t("onbProBody")}</p>
      <ul className="onb-pro-list" aria-label="Pro benefits">
        <li>{t("onbProBullet1")}</li>
        <li>{t("onbProBullet2")}</li>
        <li>{t("onbProBullet3")}</li>
      </ul>
      <button type="button" className="onb-primary-btn" onClick={onContinue} data-testid="onboarding-pro-continue">
        {t("onbProContinue")}
      </button>
      <p className="onb-pro-note">{t("onbProSkipNote")}</p>
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

// ==================== OUTFIT HERO ====================
// Stock mood photo matched to this look's garment colors + formality.
const OutfitHero = memo(function OutfitHero({
  occasion = "default",
  styleFamily = null,
  promptHint = "",
  itemKeys = [],
  seed = "",
  palette = [],
}) {
  const { t } = useLang();
  const itemKeySig = Array.isArray(itemKeys) ? itemKeys.join("|") : "";
  const picked = useMemo(
    () => pickOutfitHeroPhoto({
      items: itemKeys,
      catalog: CATALOG,
      occasion,
      styleFamily,
      prompt: promptHint,
      seed,
    }),
    // itemKeySig captures items contents; CATALOG is module-stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemKeySig, occasion, styleFamily, promptHint, seed],
  );
  const fallback = assetUrl("/heroes/home/00-default-A.jpg");
  const swatches = (palette || [])
    .map((label) => (COLOR_OPTIONS.find((c) => c.label === label) || {}).hex)
    .filter(Boolean)
    .slice(0, 4);

  return (
    <div className="model-wrap outfit-hero-wrap outfit-hero-stock" data-testid="outfit-hero" data-hero-file={picked.file}>
      {swatches.length > 0 && (
        <div className="outfit-hero-swatches outfit-hero-swatches-overlay" aria-hidden="true">
          {swatches.map((hex) => <span key={hex} style={{ background: hex }} />)}
        </div>
      )}
      <img
        className="model-photo"
        src={picked.src}
        alt=""
        loading="lazy"
        decoding="async"
        fetchPriority="low"
        onError={(e) => {
          if (e.currentTarget.dataset.fallback === "1") return;
          e.currentTarget.dataset.fallback = "1";
          e.currentTarget.src = fallback;
        }}
      />
      <div className="hero-inspiration-caption">{t("heroInspiration")}</div>
    </div>
  );
});

function styleFamilyLabel(styleFamily, t) {
  if (!styleFamily) return "";
  const key = `styleFamily${styleFamily.charAt(0).toUpperCase()}${styleFamily.slice(1)}`;
  return t(key) !== key ? t(key) : styleFamily;
}

// ==================== SHOP ACROSS STORES ====================
function ShopSheet({ item, onClose, favoriteStores = [], palette = [], avoid = [], styleFamily = null }) {
  const { t, tOpt, tName } = useLang();
  const [stock, setStock] = useState({ status: "loading", products: [], scannedAt: null });
  // Genre shops skip catalog stock stubs — open the full store directory immediately
  const genreShop = styleFamily && ["streetwear", "sexy", "edgy", "modern", "classy"].includes(styleFamily);
  const [showStores, setShowStores] = useState(true);

  const searchQuery = buildItemSearchQuery(item, palette, avoid, styleFamily);
  const paletteLabels = (palette || []).filter((p) => !(avoid || []).includes(p));
  const affiliateUrl = item.shopUrl || item.clickUrl || null;

  useEffect(() => {
    if (!item) return undefined;
    if (genreShop) {
      setStock({ status: "empty", products: [], scannedAt: null });
      return undefined;
    }
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
        const raw = Array.isArray(data.products) ? data.products : [];
        const filtered = raw
          .filter((p) => productMatchesPalette(p, palette, avoid))
          .sort((a, b) => productPaletteRank(b, palette) - productPaletteRank(a, palette));
        const hasPalette = (palette || []).some((p) => !(avoid || []).includes(p));
        const precise = hasPalette
          ? filtered.filter((p) => productPaletteRank(p, palette) > 0)
          : filtered;
        const products = precise.length ? precise : [];
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
  }, [item, palette, avoid, genreShop]);

  if (!item) return null;
  const links = storeLinksForItem(item, palette, avoid, styleFamily);
  const shoppingUrl = affiliateUrl || googleShoppingUrl(searchQuery);
  const favSet = new Set(favoriteStores);
  const favoriteLinks = links.filter((s) => favSet.has(s.id));
  const paletteHint = paletteLabels.slice(0, 4).map((l) => tOpt(l)).join(", ");
  const genreLabel = styleFamilyLabel(styleFamily, t);

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
          <CatalogImage className="shop-hero-image" src={item.image} alt={tName(item)} />
          <div className="shop-hero-copy">
            <div className="shop-hero-brand">{genreLabel || item.retailer}</div>
            <div className="shop-hero-name">{tName(item)}</div>
            <div className="shop-hero-sub">{t("shopInStockSub")}</div>
            {paletteHint ? (
              <div className="shop-palette-hint">{t("shopPaletteFilter").replace("{colors}", paletteHint)}</div>
            ) : null}
            <div className="shop-search-hint">{t("shopSearchingAs").replace("{query}", searchQuery)}</div>
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
                  <CatalogImage className="shop-stock-image" src={productThumb(product)} alt="" loading="lazy" />
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

        {affiliateUrl ? (
          <a className="shop-google" href={affiliateUrl} target="_blank" rel="noopener noreferrer">
            {t("viewProduct")} <ExternalLink size={13} />
          </a>
        ) : (
          <a className="shop-google" href={shoppingUrl} target="_blank" rel="noopener noreferrer">
            {t("shopOpenAll")} <ExternalLink size={13} />
          </a>
        )}

        <button type="button" className="shop-more-toggle" onClick={() => setShowStores((v) => !v)}>
          {t("shopMoreStores")} ({t("shopStoreCount").replace("{count}", String(links.length))}) {showStores ? "−" : "+"}
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
const OutfitCard = memo(function OutfitCard({
  outfit,
  msgIndex = 0,
  outfitIndex = 0,
  onSwap,
  onSave,
  saved,
  favoriteStores,
  optionLabel,
  palette = [],
  avoid = [],
  promptHint = "",
}) {
  const { lang, t, tName } = useLang();
  const [shopItem, setShopItem] = useState(null);
  const styleFamily = outfit.styleFamily || null;
  const genreLabel = styleFamilyLabel(styleFamily, t);
  const header = [optionLabel, genreLabel].filter(Boolean).join(" · ") || t("stylistSuggests");
  const rationale = humanizeRationale(outfit.rationale, lang);
  const heroOccasion = resolveHeroOccasionSlug({
    occasion: outfit.occasion,
    styleFamily,
    prompt: promptHint,
  });
  const itemKeys = Array.isArray(outfit.items) ? outfit.items : [];

  return (
    <div className="card outfit-card" data-testid="outfit-card">
      <div className="eyebrow gold">{header}</div>
      <div className="outfit-visual">
        <OutfitHero
          occasion={heroOccasion}
          styleFamily={styleFamily}
          promptHint={promptHint}
          itemKeys={itemKeys}
          seed={`${msgIndex}:${outfitIndex}:${itemKeys.join("|")}`}
          palette={palette}
        />
        <div className="item-list" data-testid="item-list">
          {outfit.items.map((key) => {
            const base = CATALOG[key];
            if (!base) return null;
            const item = displayCatalogItem(base, styleFamily);
            return (
              <div key={item.id} className="item-row" data-item-name={item.name}>
                <button
                  type="button"
                  className="item-row-shop"
                  onClick={() => setShopItem(item)}
                  title={t("viewProduct")}
                >
                  <CatalogImage className="item-row-image" src={item.image} alt={item.name || tName(base)} loading="lazy" decoding="async" />
                  <div className="item-row-info">
                    <div className="item-row-brand">{genreLabel || item.retailer}</div>
                    <div className="item-row-name">{item.name || tName(base)}</div>
                    <div className="item-row-meta">${item.price} · {t("shopInStock")}</div>
                  </div>
                  <span className="link-btn-sm" aria-hidden="true">
                    <ExternalLink size={11} />
                  </span>
                </button>
                <button
                  type="button"
                  className="swap-btn-sm"
                  onClick={() => onSwap(msgIndex, outfitIndex, key)}
                  title={t("swapItem")}
                >
                  <RefreshCw size={11} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <p className="rationale">{rationale}</p>
      <button className="save-btn" type="button" onClick={() => onSave(msgIndex, outfitIndex)} disabled={saved}>
        {saved ? <><Check size={12} /> {t("savedLabel")}</> : t("saveOutfit")}
      </button>
      {shopItem && (
        <ShopSheet
          item={shopItem}
          onClose={() => setShopItem(null)}
          favoriteStores={favoriteStores}
          palette={palette}
          avoid={avoid}
          styleFamily={styleFamily}
        />
      )}
    </div>
  );
});

// ==================== APP SCREENS ====================
function HomeScreen({
  profile,
  onPrompt,
  homeInput,
  setHomeInput,
  billing,
  authUser,
  onUpgrade,
  onOpenBilling,
}) {
  const { lang, t, tOpt } = useLang();
  const chipKeys = [
    "chipStreetwear", "chipClassy", "chipSexyNight", "chipModernLook",
    "chipDressWedding", "chipWorkDinner", "chipWeekendCasual", "chipWeekPlan",
  ];
  const fitLabel = (FIT_SHORT[lang] && FIT_SHORT[lang][profile.fit]) || FIT_SHORT.en[profile.fit] || profile.fit;
  const budgetLabel = tOpt((BUDGET_OPTIONS.find((b) => b.key === profile.budget) || {}).label || "Balanced");
  const swatchHexes = (profile.palette || []).map((label) => (COLOR_OPTIONS.find((c) => c.label === label) || {}).hex).filter(Boolean).slice(0, 5);
  const isPro = Boolean(billing?.pro);
  const showProPrompt = !isPro;
  const used = billing?.stylist?.used ?? 0;
  const limit = billing?.stylist?.limit ?? FREE_STYLIST_LIMIT;
  const remaining = billing?.stylist?.remaining ?? Math.max(0, limit - used);
  const promptCopy = authUser && billing
    ? t("homeProUsed").replace("{remaining}", String(remaining)).replace("{limit}", String(limit))
    : t("homeProTeaser");
  const homeHero = useMemo(
    () => pickHomeHeroPhoto({
      archetype: profile.archetype,
      userId: authUser?.id || null,
      profileName: profile.name || null,
    }),
    [profile.archetype, profile.name, authUser?.id],
  );

  return (
    <div className="screen home-screen">
      <div className="eyebrow muted">{t("goodEvening")}</div>
      <h1 className="home-name">{profile.name || DEFAULT_PROFILE.name}</h1>
      <div className="dna-card">
        <div className="eyebrow gold-on-dark">{t("styleDnaLabel")}</div>
        <div className="dna-title">{tOpt(profile.archetype)}</div>
        <div className="dna-sub">{fitLabel} {t("silhouettesWord")} · {budgetLabel} {t("budgetWord")}</div>
        <div className="dna-swatches">
          {swatchHexes.map((hex, i) => <span key={i} className="swatch" style={{ background: hex }} />)}
        </div>
      </div>
      <div className="section-label">{t("askYourStylist")}</div>
      {showProPrompt ? (
        <div className="home-pro-prompt" data-testid="home-pro-prompt">
          <p className="home-pro-prompt-text">{promptCopy}</p>
          <button
            type="button"
            className="home-pro-prompt-cta"
            onClick={() => {
              if (authUser) onUpgrade?.("monthly");
              else onOpenBilling?.();
            }}
          >
            {t("homeProUpgradeCta")}
          </button>
        </div>
      ) : null}
      <form className="home-ask-row" onSubmit={(e) => { e.preventDefault(); if (homeInput.trim()) onPrompt(homeInput); }}>
        <input value={homeInput} onChange={(e) => setHomeInput(e.target.value)} placeholder={t("askPlaceholder")} className="home-ask-input" />
        <button type="submit" className="send-btn home-ask-send" aria-label={t("askYourStylist")}>
          <Send size={15} />
        </button>
      </form>
      <div className="chip-row home-chip-row">
        {chipKeys.map((k) => <button key={k} type="button" className="chip home-chip" onClick={() => onPrompt(t(k))}>{t(k)}</button>)}
      </div>
      <div className="home-dna-hero" data-testid="home-dna-hero">
        <img
          className="home-dna-hero-image"
          src={homeHero.src}
          alt=""
          loading="lazy"
          decoding="async"
        />
      </div>
    </div>
  );
}

function WeekShoppingList({ shoppingList, favoriteStores, palette = [], avoid = [] }) {
  const { lang, t, tName } = useLang();
  const [shopItem, setShopItem] = useState(null);
  if (!shoppingList?.length) return null;
  return (
    <div className="week-shop-list">
      <div className="eyebrow gold">{t("weekShoppingList")}</div>
      <div className="week-shop-rows">
        {shoppingList.map((row) => {
          const item = CATALOG[row.key];
          if (!item) return null;
          const reason = humanizeRationale(row.reason || "", lang);
          return (
            <button
              key={row.key}
              type="button"
              className="week-shop-row"
              onClick={() => setShopItem(item)}
            >
              <CatalogImage className="week-shop-image" src={item.image} alt={tName(item)} loading="lazy" />
              <div className="week-shop-info">
                <div className="week-shop-brand">{item.retailer}</div>
                <div className="week-shop-name">{tName(item)}</div>
                <div className="week-shop-meta">${item.price}{reason ? ` · ${reason}` : ""}</div>
              </div>
              <ExternalLink size={12} />
            </button>
          );
        })}
      </div>
      {shopItem && (
        <ShopSheet
          item={shopItem}
          onClose={() => setShopItem(null)}
          favoriteStores={favoriteStores}
          palette={palette}
          avoid={avoid}
        />
      )}
    </div>
  );
}

function ChatScreen({ messages, onSend, input, setInput, onSwap, onSave, savedIds, pending, favoriteStores, palette = [], avoid = [], onUpgrade, onOpenBilling }) {
  const { t } = useLang();
  const endRef = useRef(null);
  useEffect(() => {
    // Instant scroll — smooth scrolling on every keystroke/pending flip feels laggy
    endRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages.length, pending]);
  const refineKeys = [
    "chipMoreStreet", "chipMakeSexy", "chipMoreClassy", "chipMoreModern",
    "chipMoreCasual", "chipAddBlazer", "chipUnder200", "chipDifferentBelt",
  ];
  const hasLooks = messages.some((m) => m.outfits?.length || m.outfit);

  return (
    <div className="chat-wrap stylist-screen">
      <div className="chat-header"><Sparkles size={14} color="#C6A567" /><span>{t("yourStylist")}</span></div>
      <div className="chat-body">
        {messages.length === 0 && <div className="chat-empty">{t("chatEmpty")}</div>}
        {messages.map((m, i) => {
          if (m.role === "user") return <div key={i} className="bubble-user">{m.text}</div>;
          if (m.outfits?.length) {
            const moodSet = new Set(m.outfits.map((o) => o.styleFamily).filter(Boolean));
            const moodIntro = m.styleMood || (moodSet.size === 1 ? t("stylistMoodIntro") : null);
            const priorUser = [...messages.slice(0, i)].reverse().find((x) => x.role === "user");
            const promptHint = priorUser?.text || m.styleMood || "";
            return (
              <div key={i} className="bubble-assistant bubble-assistant-stack">
                <div className="stylist-picks-intro">{m.text || (m.weekPlan ? t("weekPlanIntro") : (moodIntro || t("stylistPicksIntro")))}</div>
                {m.outfits.map((outfit, oi) => (
                  <OutfitCard
                    key={outfit.id || oi}
                    outfit={outfit}
                    msgIndex={i}
                    outfitIndex={oi}
                    optionLabel={outfit.day || `${t("stylistLook")} ${outfit.option || oi + 1}`}
                    onSwap={onSwap}
                    onSave={onSave}
                    saved={savedIds.has(`${i}:${oi}`)}
                    favoriteStores={favoriteStores}
                    palette={palette}
                    avoid={avoid}
                    promptHint={promptHint}
                  />
                ))}
                {m.weekPlan && (
                  <WeekShoppingList
                    shoppingList={m.shoppingList}
                    favoriteStores={favoriteStores}
                    palette={palette}
                    avoid={avoid}
                  />
                )}
              </div>
            );
          }
          if (m.outfit) {
            return (
              <div key={i} className="bubble-assistant">
                <OutfitCard
                  outfit={m.outfit}
                  msgIndex={i}
                  outfitIndex={0}
                  onSwap={onSwap}
                  onSave={onSave}
                  saved={savedIds.has(`${i}:0`) || savedIds.has(i)}
                  favoriteStores={favoriteStores}
                  palette={palette}
                  avoid={avoid}
                />
              </div>
            );
          }
          if (m.billingGate) {
            return (
              <div key={i} className="bubble-assistant-text billing-gate-bubble" data-testid="billing-gate">
                <div className="billing-gate-text">{m.text}</div>
                <button
                  type="button"
                  className="billing-gate-cta"
                  onClick={() => {
                    if (onUpgrade) onUpgrade("monthly");
                    else onOpenBilling?.();
                  }}
                >
                  {t("billingQuotaUpgradeCta")}
                </button>
              </div>
            );
          }
          return <div key={i} className="bubble-assistant-text">{m.text}</div>;
        })}
        {pending && <div className="typing"><span className="dot" />{t("composing")}</div>}
        {hasLooks && !pending && (
          <div className="refine-block">
            <div className="refine-label">{t("refineLooks")}</div>
            <div className="chip-row">
              {refineKeys.map((k) => (
                <button key={k} type="button" className="chip" onClick={() => onSend(t(k))}>{t(k)}</button>
              ))}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form className="chat-input-row" onSubmit={(e) => { e.preventDefault(); onSend(); }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t("chatInputPlaceholder")} className="chat-input" />
        <button type="submit" className="send-btn"><Send size={15} /></button>
      </form>
    </div>
  );
}

const noopSwap = () => {};
const noopSave = () => {};

function WardrobeScreen({ savedOutfits, favoriteStores, palette = [], avoid = [] }) {
  const { t } = useLang();
  return (
    <div className="screen wardrobe-screen">
      <h2 className="screen-title">{t("wardrobeTitle")}</h2>
      {savedOutfits.length === 0 ? (
        <p className="empty-note">{t("wardrobeEmpty")}</p>
      ) : (
        <div className="stack">
          {savedOutfits.map((o, i) => (
            <OutfitCard
              key={o.id || i}
              outfit={o}
              msgIndex={i}
              outfitIndex={0}
              onSwap={noopSwap}
              onSave={noopSave}
              saved
              favoriteStores={favoriteStores}
              palette={palette}
              avoid={avoid}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BagScreen({ savedOutfits, favoriteStores, palette = [], avoid = [] }) {
  const { t, tName } = useLang();
  const [shopItem, setShopItem] = useState(null);
  const allItems = savedOutfits.flatMap((o) => o.items.map((k) => CATALOG[k]).filter(Boolean));
  const byRetailer = allItems.reduce((acc, item) => {
    acc[item.retailer] = acc[item.retailer] || [];
    acc[item.retailer].push(item);
    return acc;
  }, {});
  return (
    <div className="screen bag-screen">
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
                <CatalogImage className="bag-image" src={item.image} alt={tName(item)} loading="lazy" />
                <div className="bag-info">
                  <div className="bag-brand">{item.retailer}</div>
                  <div className="bag-name">{tName(item)}</div>
                  <div className="bag-price">${item.price} · {t("shopInStock")}</div>
                </div>
                <ExternalLink size={13} color="#A8895C" />
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
          palette={palette}
          avoid={avoid}
        />
      )}
    </div>
  );
}

function ProfileScreen({
  profile,
  onToggleFavoriteStore,
  onDeleteProfile,
  authUser,
  onLogOut,
  billing,
  onRefreshBilling,
  onUpgrade,
  onManageBilling,
  onCancelPro,
  onDeleteAccount,
}) {
  const { t, tOpt } = useLang();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [billingBusy, setBillingBusy] = useState(null);
  const [billingErr, setBillingErr] = useState("");
  const [billingOk, setBillingOk] = useState("");
  const [confirmCancelPro, setConfirmCancelPro] = useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [deleteAccountTyped, setDeleteAccountTyped] = useState("");
  const [deleteAccountErr, setDeleteAccountErr] = useState("");
  const [deleteAccountBusy, setDeleteAccountBusy] = useState(false);
  const favorites = profile.favoriteStores || [];
  const favSet = new Set(favorites);
  const budgetLabel = tOpt((BUDGET_OPTIONS.find((b) => b.key === profile.budget) || {}).label || "Balanced");
  const rows = [
    [t("nameLabel"), profile.name || DEFAULT_PROFILE.name],
    [t("styleArchetypeLabel"), tOpt(profile.archetype)],
    [t("fitPreferenceLabel"), tOpt(profile.fit)],
    [t("lifestyleLabel"), tOpt(profile.lifestyle || DEFAULT_PROFILE.lifestyle)],
    [t("paletteLabel"), (profile.palette || []).map(tOpt).join(", ")],
    [t("colorsToAvoidLabel"), (profile.avoid || []).map(tOpt).join(", ") || "—"],
    [t("budgetLabel"), budgetLabel],
    [t("dressesForLabel"), (profile.occasions || []).map(tOpt).join(", ") || "—"],
  ];
  const favoriteNames = STORE_DIRECTORY.filter((s) => favSet.has(s.id)).map((s) => s.name);
  const isPro = Boolean(billing?.pro);
  const canCancelPro = String(billing?.status || "").toLowerCase() === "active";
  const used = billing?.stylist?.used ?? 0;
  const limit = billing?.stylist?.limit ?? FREE_STYLIST_LIMIT;
  const deleteConfirmReady = deleteAccountTyped.trim().toUpperCase() === "DELETE";

  async function runBilling(kind, fn) {
    setBillingErr("");
    setBillingOk("");
    setBillingBusy(kind);
    try {
      const result = await fn();
      await onRefreshBilling?.();
      return result;
    } catch (e) {
      setBillingErr(e?.message || t("billingError"));
      throw e;
    } finally {
      setBillingBusy(null);
    }
  }

  async function handleDeleteAccountConfirm() {
    if (!deleteConfirmReady || deleteAccountBusy) return;
    setDeleteAccountErr("");
    setDeleteAccountBusy(true);
    try {
      await onDeleteAccount?.();
    } catch (e) {
      setDeleteAccountErr(e?.message || t("deleteAccountError"));
      setDeleteAccountBusy(false);
    }
  }

  return (
    <div className="screen profile-screen">
      <h2 className="screen-title">{t("profileTitle")}</h2>
      <div className="profile-card">
        {rows.map(([label, val]) => (
          <div key={label} className="profile-row"><span className="muted">{label}</span><span>{val}</span></div>
        ))}
      </div>

      <div className="billing-card">
        <div className="section-label">{t("billingTitle")}</div>
        {!authUser?.email ? (
          <p className="empty-note">{t("billingSignInHint")}</p>
        ) : (
          <>
            <div className="billing-plan-row">
              <span className={`billing-badge ${isPro ? "pro" : "free"}`}>
                {isPro ? t("billingProPlan") : t("billingFreePlan")}
              </span>
            </div>
            <p className="billing-blurb">
              {isPro
                ? t("billingProBlurb")
                : t("billingFreeBlurb").replace("{used}", String(used)).replace("{limit}", String(limit))}
            </p>
            {billingOk ? <p className="billing-success" role="status">{billingOk}</p> : null}
            {billingErr ? <p className="billing-error">{billingErr}</p> : null}
            {!isPro ? (
              <div className="billing-actions">
                <button
                  type="button"
                  className="billing-btn primary"
                  disabled={!!billingBusy}
                  onClick={() => runBilling("monthly", () => onUpgrade?.("monthly"))}
                >
                  {billingBusy === "monthly" ? t("billingBusy") : t("billingUpgradeMonthly")}
                </button>
                <button
                  type="button"
                  className="billing-btn"
                  disabled={!!billingBusy}
                  onClick={() => runBilling("yearly", () => onUpgrade?.("yearly"))}
                >
                  {billingBusy === "yearly" ? t("billingBusy") : t("billingUpgradeYearly")}
                </button>
              </div>
            ) : (
              <div className="billing-actions">
                <button
                  type="button"
                  className="billing-btn"
                  disabled={!!billingBusy || deleteAccountBusy}
                  onClick={() => runBilling("portal", () => onManageBilling?.())}
                >
                  {billingBusy === "portal" ? t("billingBusy") : t("billingManage")}
                </button>
                {canCancelPro ? (
                  confirmCancelPro ? (
                    <div className="billing-cancel-confirm" role="group" aria-label={t("billingCancelConfirmTitle")}>
                      <p className="billing-cancel-confirm-title">{t("billingCancelConfirmTitle")}</p>
                      <p className="billing-cancel-confirm-body">{t("billingCancelConfirmBody")}</p>
                      <div className="billing-cancel-confirm-actions">
                        <button
                          type="button"
                          className="billing-btn danger"
                          disabled={!!billingBusy}
                          onClick={() => {
                            runBilling("cancel", async () => {
                              await onCancelPro?.();
                              setConfirmCancelPro(false);
                              setBillingOk(t("billingCancelSuccess"));
                            }).catch(() => {});
                          }}
                        >
                          {billingBusy === "cancel" ? t("billingCancelBusy") : t("billingCancelConfirmYes")}
                        </button>
                        <button
                          type="button"
                          className="billing-btn"
                          disabled={!!billingBusy}
                          onClick={() => setConfirmCancelPro(false)}
                        >
                          {t("billingCancelConfirmNo")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="billing-btn danger-outline"
                      disabled={!!billingBusy || deleteAccountBusy}
                      onClick={() => {
                        setBillingErr("");
                        setBillingOk("");
                        setConfirmCancelPro(true);
                      }}
                    >
                      {t("billingCancelPro")}
                    </button>
                  )
                ) : null}
              </div>
            )}

            <div className="account-delete-block">
              {!confirmDeleteAccount ? (
                <button
                  type="button"
                  className="account-delete-link"
                  disabled={!!billingBusy || deleteAccountBusy}
                  onClick={() => {
                    setConfirmDeleteAccount(true);
                    setDeleteAccountTyped("");
                    setDeleteAccountErr("");
                  }}
                >
                  {t("deleteAccountLabel")}
                </button>
              ) : (
                <div className="account-delete-confirm" role="group" aria-label={t("deleteAccountTitle")}>
                  <p className="account-delete-title">{t("deleteAccountTitle")}</p>
                  <p className="account-delete-body">{t("deleteAccountBody")}</p>
                  <label className="account-delete-type-label" htmlFor="delete-account-confirm-input">
                    {t("deleteAccountTypePrompt")}
                  </label>
                  <input
                    id="delete-account-confirm-input"
                    className="account-delete-input"
                    type="text"
                    autoComplete="off"
                    value={deleteAccountTyped}
                    onChange={(e) => setDeleteAccountTyped(e.target.value)}
                    placeholder="DELETE"
                    disabled={deleteAccountBusy}
                  />
                  {deleteAccountErr ? <p className="billing-error">{deleteAccountErr}</p> : null}
                  <button
                    type="button"
                    className="billing-btn danger"
                    disabled={!deleteConfirmReady || deleteAccountBusy}
                    onClick={handleDeleteAccountConfirm}
                  >
                    {deleteAccountBusy ? t("deleteAccountBusy") : t("deleteAccountConfirm")}
                  </button>
                  <button
                    type="button"
                    className="profile-reset-cancel"
                    disabled={deleteAccountBusy}
                    onClick={() => {
                      setConfirmDeleteAccount(false);
                      setDeleteAccountTyped("");
                      setDeleteAccountErr("");
                    }}
                  >
                    {t("deleteAccountCancel")}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="auth-account-row">
        {authUser?.email ? (
          <>
            <p className="empty-note">{t("authSignedInAs").replace("{email}", authUser.email)}</p>
            <button type="button" className="profile-reset-btn" onClick={() => onLogOut?.()}>{t("authLogOut")}</button>
          </>
        ) : (
          <p className="empty-note">{t("authLocalOnly")}</p>
        )}
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

      <div className="profile-reset-block">
        <p className="empty-note">{t("prototypeNote")}</p>
        {!confirmDelete ? (
          <button type="button" className="profile-reset-btn" onClick={() => setConfirmDelete(true)}>
            {t("deleteProfileLabel")}
          </button>
        ) : (
          <div className="profile-reset-confirm">
            <div className="profile-reset-title">{t("deleteProfileTitle")}</div>
            <p className="profile-reset-body">{t("deleteProfileBody")}</p>
            <button
              type="button"
              className="profile-reset-btn profile-reset-btn-danger"
              onClick={() => {
                setConfirmDelete(false);
                onDeleteProfile?.();
              }}
            >
              {t("deleteProfileConfirm")}
            </button>
            <button type="button" className="profile-reset-cancel" onClick={() => setConfirmDelete(false)}>
              {t("deleteProfileCancel")}
            </button>
          </div>
        )}
      </div>

      <SiteFooter className="site-footer-profile" />
    </div>
  );
}

// ==================== ROOT APP ====================
export default function VestraPrototype() {
  const stored = typeof window !== "undefined" ? loadStoredState() : null;
  const [lang, setLang] = useState(stored?.lang || "en");
  const [stage, setStage] = useState(() => initialStageFromStorage(stored));
  const [step, setStep] = useState(() => (Number.isFinite(stored?.step) ? stored.step : 0));
  const [answers, setAnswers] = useState(() => sanitizeAnswers(stored?.answers || {
    name: "", lifestyle: null, archetype: null, fit: null, palette: [], avoid: [], budget: null, occasions: [], sizes: {},
  }));
  // Fresh visitors start empty — DEFAULT_PROFILE is only for "Skip for testing"
  const [profile, setProfile] = useState(() => sanitizeProfile(stored?.profile || EMPTY_PROFILE));

  const [tab, setTab] = useState(stored?.tab || "home");
  const [messages, setMessages] = useState(stored?.messages || []);
  const [input, setInput] = useState("");
  const [homeInput, setHomeInput] = useState("");
  const [pending, setPending] = useState(false);
  const [savedIds, setSavedIds] = useState(new Set());
  const [savedOutfits, setSavedOutfits] = useState(stored?.savedOutfits || []);
  const [authUser, setAuthUser] = useState(null);
  const [showImportLocal, setShowImportLocal] = useState(false);
  const [billing, setBilling] = useState(null);
  const [billingToast, setBillingToast] = useState("");
  const cloudReadyRef = useRef(false);

  const refreshBilling = useCallback(async () => {
    if (!authUser?.id || !supabaseConfigured) {
      setBilling(null);
      return null;
    }
    try {
      const data = await fetchBillingStatus();
      setBilling(data);
      return data;
    } catch {
      setBilling(null);
      return null;
    }
  }, [authUser?.id]);

  // Pull live Awin feed (session-cached); falls back to backup catalog on failure
  useEffect(() => {
    ensureProductCatalog().catch(() => {});
  }, []);

  // Stripe Checkout return (?billing=success|cancel)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("billing");
    if (!flag) return;
    if (flag === "success") {
      setBillingToast("success");
      setTab("profile");
      refreshBilling();
    }
    params.delete("billing");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash || ""}`;
    window.history.replaceState({}, "", next);
  }, [refreshBilling]);

  useEffect(() => {
    if (authUser?.id) refreshBilling();
    else setBilling(null);
  }, [authUser?.id, refreshBilling]);

  // Restore Supabase session (if configured) and hydrate Style DNA from the cloud.
  useEffect(() => {
    if (!supabaseConfigured || !supabase) return undefined;
    let cancelled = false;

    async function hydrateFromUser(user) {
      if (!user || cancelled) return;
      setAuthUser(user);
      try {
        const row = await fetchCloudProfile(user.id);
        const cloudProfile = rowToProfile(row);
        const cloudOutfits = await fetchCloudSavedOutfits(user.id);
        if (cloudProfile && (cloudProfile.name || cloudProfile.archetype)) {
          setProfile(sanitizeProfile(cloudProfile));
          if (row?.answers && typeof row.answers === "object") {
            setAnswers((a) => sanitizeAnswers({ ...a, ...row.answers }));
          }
          if (row?.lang) setLang(row.lang);
        }
        if (cloudOutfits.length) setSavedOutfits(cloudOutfits);
        if (cloudProfile?.name || cloudOutfits.length) {
          setStage((s) => (s === "welcome" || s === "signup" ? "app" : s));
        }
      } catch (err) {
        console.warn("cloud hydrate failed", err?.message || err);
      } finally {
        cloudReadyRef.current = true;
      }
    }

    getSessionUser().then((user) => {
      if (user) hydrateFromUser(user);
      else cloudReadyRef.current = true;
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user || null;
      setAuthUser(user);
      if (user) hydrateFromUser(user);
      else cloudReadyRef.current = true;
    });
    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const t = useCallback((key) => (UI[lang] && UI[lang][key]) || UI.en[key] || key, [lang]);
  const tOpt = useCallback((value) => (OPTIONS_I18N[lang] && OPTIONS_I18N[lang][value]) || value, [lang]);
  const tName = useCallback((item) => (PRODUCT_NAMES_I18N[lang] && PRODUCT_NAMES_I18N[lang][item.id]) || item.name, [lang]);

  // Debounce persistence: always mirror to localStorage; when signed in, also sync Style DNA + outfits to Supabase.
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const payload = {
          lang,
          stage,
          step,
          tab,
          profile: sanitizeProfile(profile),
          answers: sanitizeAnswers(answers),
          savedOutfits: savedOutfits.slice(-20),
          messages: messages.slice(-30),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        /* ignore quota */
      }
      if (authUser?.id && cloudReadyRef.current && supabaseConfigured) {
        upsertCloudProfile(authUser.id, sanitizeProfile(profile), {
          lang,
          answers: sanitizeAnswers(answers),
        }).catch((err) => console.warn("cloud profile sync", err?.message || err));
        // Saved outfits are a Pro feature
        if (billing?.pro) {
          syncCloudSavedOutfits(authUser.id, savedOutfits.slice(-40))
            .catch((err) => console.warn("cloud outfits sync", err?.message || err));
        }
      }
    }, 400);
    return () => clearTimeout(id);
  }, [lang, stage, step, tab, profile, answers, savedOutfits, messages, authUser, billing?.pro]);

  // Hash is a reload-safe stage backup (see goToSignup / skipToApp).
  useEffect(() => {
    const onHash = () => {
      const h = stageFromHash();
      if (!h || h === stage) return;
      if (h === "app") {
        const s = loadStoredState();
        if (s?.profile?.name) setStage("app");
        return;
      }
      setStage(h);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [stage]);

  async function sendMessage(text, profileOverride) {
    const finalText = text ?? input;
    if (!finalText.trim()) return;
    const activeProfile = profileOverride || profile;
    const priorOutfits = [...messages].reverse().find((m) => m.outfits?.length || m.outfit);
    const revision = detectRevisionRequest(finalText);
    setMessages((m) => [...m, { role: "user", text: finalText }]);
    setInput("");
    setPending(true);

    // Piece revisions stay local and instant
    if (revision && priorOutfits) {
      const base = priorOutfits.outfits?.length
        ? priorOutfits.outfits
        : priorOutfits.outfit
          ? [priorOutfits.outfit]
          : [];
      if (base.length) {
        stylistTurn += 1;
        const outfits = reviseOutfits(base, revision, activeProfile, lang);
        const labels = ITEM_LABELS[lang] || ITEM_LABELS.en;
        const itemLabel = revision.targets.map((f) => labels[f] || f).join(", ");
        const introKey = revisionIntroKey(revision);
        const intro = ((UI[lang] && UI[lang][introKey]) || UI.en[introKey] || "").replace("{item}", itemLabel);
        setMessages((m) => [...m, { role: "assistant", text: intro, outfits, revision: true }]);
        setPending(false);
        return;
      }
    }

    const weekPlan = isWeekPlanPrompt(finalText);
    const styleMoods = detectStyleMoods(finalText);
    const primaryMood = styleMoods[0] || null;

    // Refresh live catalog if needed (uses session cache — cheap after first load)
    await ensureProductCatalog();

    // Try live Claude stylist (Netlify function / custom endpoint), else local composer
    const promptOccasions = detectOccasions(finalText);
    const { catalogKeys, catalogItems, formalityTarget } = catalogPayloadForStylist(finalText);
    const accessToken = await getAccessToken();
    const live = await fetchStylistLooks({
      prompt: finalText,
      profile: activeProfile,
      lang,
      catalogKeys,
      catalogItems,
      formalityTarget,
      mode: weekPlan ? "week" : "looks",
      accessToken,
    });
    if (live?.code === "quota_exceeded") {
      setMessages((m) => [...m, {
        role: "assistant",
        text: `${t("billingQuotaTitle")}\n\n${t("billingQuotaBody")}`,
        billingGate: true,
      }]);
      refreshBilling();
      setPending(false);
      return;
    }
    // auth_required → fall through to local composer (guests / skip-for-testing)
    if (live?.usage) {
      setBilling((prev) => (prev ? {
        ...prev,
        stylist: {
          used: live.usage.used,
          limit: live.usage.limit,
          remaining: live.usage.remaining,
        },
        pro: live.usage.pro ?? prev.pro,
      } : prev));
    }
    if (live?.outfits?.length) {
      const dayLabels = WEEK_DAY_KEYS.map((k) => (UI[lang] && UI[lang][k]) || UI.en[k]);
      const isWeek = weekPlan || live.mode === "week";
      const outfits = live.outfits.map((o, i) => {
        // Prefer Claude's styleFamily; only fall back to prompt mood when model omitted it
        const styleFamily = o.styleFamily || primaryMood || undefined;
        const raw = {
          ...o,
          option: o.option || i + 1,
          day: isWeek ? (o.day || dayLabels[i]) : o.day,
          styleFamily,
          items: (o.items || []).filter((k) => CATALOG[k]),
          rationale: humanizeRationale(o.rationale, lang),
          occasion: resolveHeroOccasionSlug({
            occasion: o.occasion,
            styleFamily,
            occasions: isWeek && i === 4 ? ["dinner"] : promptOccasions,
            prompt: finalText,
          }),
        };
        const cleaned = sanitizeOutfitForOccasion(raw, finalText, promptOccasions, activeProfile);
        if (!cleaned?.items?.length) return null;
        const resolved = (cleaned.items || []).map((k) => CATALOG[k]).filter(Boolean);
        // Always describe the FINAL pieces — never keep a stale Claude why after remaps
        const why = buildWhyThisWorks(resolved, finalText, promptOccasions);
        return { ...cleaned, rationale: why, whyThisWorks: why };
      }).filter((o) => o && o.items.length >= 4 && o.whyThisWorks);
      if (outfits.length) {
        const shoppingList = isWeek
          ? (Array.isArray(live.shoppingList) && live.shoppingList.length
            ? live.shoppingList.filter((row) => CATALOG[row.key || row])
              .map((row) => (typeof row === "string"
                ? { key: row, reason: "" }
                : { key: row.key, reason: humanizeRationale(row.reason || "", lang) }))
            : buildShoppingList(outfits))
          : undefined;
        setMessages((m) => [...m, {
          role: "assistant",
          text: live.source === "claude"
            ? (isWeek ? `${t("weekPlanIntro")} ${t("stylistLive")}` : (primaryMood ? `${t("stylistMoodIntro")} ${t("stylistLive")}` : t("stylistLive")))
            : (isWeek ? t("weekPlanIntro") : undefined),
          outfits,
          shoppingList,
          weekPlan: isWeek,
          styleMood: primaryMood,
        }]);
        setPending(false);
        return;
      }
    }

    if (weekPlan) {
      const plan = composeWeekPlan(finalText, activeProfile, lang);
      setMessages((m) => [...m, {
        role: "assistant",
        text: t("weekPlanIntro"),
        outfits: plan.outfits,
        shoppingList: plan.shoppingList,
        weekPlan: true,
      }]);
    } else {
      // Prefer coordinated live outfits (formality + color + cut + whyThisWorks)
      const liveLooks = catalogSource === "awin"
        ? composeLiveOccasionOutfits(finalText, activeProfile, 3)
        : [];
      const outfits = liveLooks.length
        ? liveLooks.map((o, i) => ({
          ...o,
          option: o.option || i + 1,
          occasion: resolveHeroOccasionSlug({
            styleFamily: o.styleFamily,
            occasions: promptOccasions,
            prompt: finalText,
          }),
        }))
        : composeOutfits(finalText, activeProfile, lang, 3);
      setMessages((m) => [...m, {
        role: "assistant",
        text: primaryMood ? t("stylistMoodIntro") : undefined,
        outfits,
        styleMood: primaryMood,
      }]);
    }
    setPending(false);
  }

  function handlePrompt(p) {
    setTab("chat");
    setHomeInput("");
    sendMessage(p);
  }

  const handleSwap = useCallback((msgIndex, outfitIndex, key) => {
    const nextKey = nextVariantInFamily(key);
    if (!nextKey || nextKey === key) {
      const fallback = ALT_MAP[key] || ALT_MAP_REV[key];
      if (!fallback) return;
      applyItemSwap(msgIndex, outfitIndex, key, fallback);
      return;
    }
    applyItemSwap(msgIndex, outfitIndex, key, nextKey);
  }, []);

  function applyItemSwap(msgIndex, outfitIndex, key, nextKey) {
    setMessages((m) =>
      m.map((msg, i) => {
        if (i !== msgIndex || msg.role !== "assistant") return msg;
        if (msg.outfits?.length) {
          const outfits = msg.outfits.map((outfit, oi) => {
            if (oi !== outfitIndex) return outfit;
            return { ...outfit, items: outfit.items.map((k) => (k === key ? nextKey : k)) };
          });
          return { ...msg, outfits };
        }
        if (msg.outfit) {
          const newItems = msg.outfit.items.map((k) => (k === key ? nextKey : k));
          return { ...msg, outfit: { ...msg.outfit, items: newItems } };
        }
        return msg;
      })
    );
  }

  const handleSave = useCallback((msgIndex, outfitIndex = 0) => {
    // Saved outfits are Pro-only once billing is configured / user is signed in as free
    if (authUser && billing && !billing.pro) {
      setMessages((msgs) => [...msgs, {
        role: "assistant",
        text: t("billingSaveProOnly"),
        billingGate: true,
      }]);
      setTab("profile");
      return;
    }
    setMessages((msgs) => {
      const msg = msgs[msgIndex];
      const outfit = msg?.outfits?.[outfitIndex] || msg?.outfit;
      if (outfit) {
        setSavedIds((s) => new Set(s).add(`${msgIndex}:${outfitIndex}`));
        setSavedOutfits((prev) => [...prev, outfit]);
      }
      return msgs;
    });
  }, [authUser, billing, t]);

  function finishOnboarding(occasionText) {
    const archetypeShortEn = answers.archetype.replace(" & ", " ");
    const built = {
      name: answers.name || profile.name || DEFAULT_PROFILE.name,
      archetype: archetypeShortEn,
      fit: answers.fit,
      lifestyle: answers.lifestyle || DEFAULT_PROFILE.lifestyle,
      palette: answers.palette.length ? answers.palette : DEFAULT_PROFILE.palette,
      avoid: answers.avoid || [],
      budget: answers.budget,
      occasions: answers.occasions,
      favoriteStores: profile.favoriteStores || DEFAULT_PROFILE.favoriteStores,
    };
    setProfile(built);
    const translatedArchetype = tOpt(archetypeShortEn);
    const greetFns = GREETINGS[lang] || GREETINGS.en;
    const greeting = occasionText ? greetFns.withOccasion(translatedArchetype) : greetFns.without(translatedArchetype);
    setMessages([{ role: "assistant", text: greeting }]);
    if (occasionText) {
      setTab("chat");
      sendMessage(occasionText, built);
    } else {
      setTab("home");
    }
    setStage("app");
  }

  const goToSignup = useCallback(() => {
    // Sync persist + hash BEFORE setState. A SW controllerchange reload used to
    // land before the 250ms debounce wrote "signup", snapping first-time visitors
    // back to welcome — buttons looked dead.
    const safeProfile = profile || { ...EMPTY_PROFILE };
    persistBootstrap({
      stage: "signup",
      profile: safeProfile,
      lang: lang || "en",
      tab: tab || "home",
      step: Number.isFinite(step) ? step : 0,
      answers: answers || {
        name: "", lifestyle: null, archetype: null, fit: null, palette: [], avoid: [], budget: null, occasions: [], sizes: {},
      },
      messages: messages || [],
    });
    setStage("signup");
  }, [profile, lang, tab, step, answers, messages]);

  const handleAuthSuccess = useCallback(async ({ user, mode, name }) => {
    if (!user) return;
    setAuthUser(user);
    cloudReadyRef.current = false;
    const local = loadStoredState();
    const shouldOfferImport = mode === "signup" && localHasImportableData(local);

    if (mode === "login") {
      try {
        const row = await fetchCloudProfile(user.id);
        const cloudProfile = rowToProfile(row);
        const cloudOutfits = await fetchCloudSavedOutfits(user.id);
        if (cloudProfile && (cloudProfile.name || cloudProfile.archetype)) {
          setProfile(sanitizeProfile(cloudProfile));
          if (row?.answers) setAnswers(sanitizeAnswers(row.answers));
          if (row?.lang) setLang(row.lang);
          setSavedOutfits(cloudOutfits);
          setStage("app");
          setTab("home");
        } else {
          setProfile((p) => sanitizeProfile({ ...p, name: name || p.name }));
          setStage(local?.profile?.archetype ? "app" : "onboarding");
        }
      } catch (err) {
        console.warn("login hydrate", err?.message || err);
        setStage("onboarding");
      } finally {
        cloudReadyRef.current = true;
      }
      return;
    }

    // signup
    setAnswers((a) => ({ ...a, name, email: user.email || a.email }));
    setProfile((p) => sanitizeProfile({ ...p, name: name || p.name }));
    if (shouldOfferImport) {
      setShowImportLocal(true);
      cloudReadyRef.current = true;
      return;
    }
    try {
      await upsertCloudProfile(user.id, sanitizeProfile({ ...EMPTY_PROFILE, name }), {
        lang,
        answers: sanitizeAnswers({ ...answers, name }),
      });
    } catch (err) {
      console.warn("signup profile seed", err?.message || err);
    }
    cloudReadyRef.current = true;
    setStage("onboarding");
  }, [answers, lang]);

  const importLocalToAccount = useCallback(async (doImport) => {
    setShowImportLocal(false);
    const user = authUser || await getSessionUser();
    if (!user) {
      setStage("onboarding");
      return;
    }
    const local = loadStoredState();
    if (doImport && local) {
      const nextProfile = sanitizeProfile(local.profile || profile);
      const nextAnswers = sanitizeAnswers(local.answers || answers);
      const nextOutfits = local.savedOutfits || savedOutfits;
      setProfile(nextProfile);
      setAnswers(nextAnswers);
      setSavedOutfits(nextOutfits);
      try {
        await upsertCloudProfile(user.id, nextProfile, { lang, answers: nextAnswers });
        // Cloud saved outfits stay Pro-only; local list remains until they upgrade
      } catch (err) {
        console.warn("import local", err?.message || err);
      }
      setStage(nextProfile.archetype ? "app" : "onboarding");
      if (nextProfile.archetype) setTab("home");
      return;
    }
    try {
      await upsertCloudProfile(user.id, sanitizeProfile({ ...EMPTY_PROFILE, name: profile.name || answers.name }), {
        lang,
        answers: sanitizeAnswers(answers),
      });
    } catch (err) {
      console.warn("fresh account seed", err?.message || err);
    }
    setStage("onboarding");
  }, [authUser, profile, answers, savedOutfits, lang]);

  const handleLogOut = useCallback(async () => {
    try {
      await signOut();
    } catch (err) {
      console.warn("signOut", err?.message || err);
    }
    setAuthUser(null);
    setBilling(null);
    cloudReadyRef.current = true;
  }, []);

  const skipToApp = useCallback(() => {
    const nextProfile = { ...DEFAULT_PROFILE };
    persistBootstrap({
      stage: "app",
      profile: nextProfile,
      lang: lang || "en",
      tab: "home",
      step: 0,
      answers: answers || {
        name: "", lifestyle: null, archetype: null, fit: null, palette: [], avoid: [], budget: null, occasions: [], sizes: {},
      },
      messages: [],
    });
    setProfile(nextProfile);
    setTab("home");
    setMessages([]);
    setStage("app");
  }, [lang, answers]);

  function deleteProfileAndRestart() {
    const keepLang = lang;
    try {
      localStorage.removeItem(STORAGE_KEY);
      clearHeroCache();
    } catch {
      /* ignore */
    }
    setLang(keepLang);
    setStage("welcome");
    setStageHash("welcome");
    setStep(0);
    setAnswers({ name: "", lifestyle: null, archetype: null, fit: null, palette: [], avoid: [], budget: null, occasions: [], sizes: {} });
    setProfile({ ...EMPTY_PROFILE });
    setTab("home");
    setMessages([]);
    setInput("");
    setHomeInput("");
    setPending(false);
    setSavedIds(new Set());
    setSavedOutfits([]);
  }

  const tabs = [
    { id: "home", labelKey: "navHome", icon: Home },
    { id: "chat", labelKey: "navStylist", icon: MessageCircle },
    { id: "wardrobe", labelKey: "navWardrobe", icon: Bookmark },
    { id: "bag", labelKey: "navBag", icon: ShoppingBag },
    { id: "profile", labelKey: "navProfile", icon: User },
  ];

  const langCtxValue = useMemo(
    () => ({ lang, setLang, t, tOpt, tName }),
    [lang, t, tOpt, tName],
  );

  return (
    <LangContext.Provider value={langCtxValue}>
    <div className="app-outer">


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
            <SiteFooter className="site-footer-desktop" />
          </aside>
        )}
        <div className="phone-body">
          {billingToast === "success" ? (
            <div className="billing-toast" role="status">
              <span>{t("billingSuccessNote")}</span>
              <button type="button" className="billing-toast-close" onClick={() => setBillingToast("")} aria-label="Close">×</button>
            </div>
          ) : null}
          {stage === "welcome" && <WelcomeScreen onStart={goToSignup} onSkip={skipToApp} />}
          {stage === "signup" && (
            <SignupScreen
              onContinue={({ name, email }) => {
                setAnswers((a) => ({ ...a, name, email }));
                setProfile((p) => ({ ...p, name }));
                setStage("onboarding");
              }}
              onAuthSuccess={handleAuthSuccess}
              onBack={() => setStage("welcome")}
            />
          )}
          {showImportLocal && (
            <ImportLocalModal
              onYes={() => importLocalToAccount(true)}
              onNo={() => importLocalToAccount(false)}
            />
          )}
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
          {stage === "reveal" && <RevealScreen answers={answers} onContinue={() => setStage("pro")} />}
          {stage === "pro" && <ProValueScreen onContinue={() => setStage("occasion")} />}
          {stage === "occasion" && <OccasionScreen onSubmit={finishOnboarding} onSkip={() => finishOnboarding(null)} />}
          {stage === "app" && (
            <>
              {tab === "home" && (
                <HomeScreen
                  profile={profile}
                  onPrompt={handlePrompt}
                  homeInput={homeInput}
                  setHomeInput={setHomeInput}
                  billing={billing}
                  authUser={authUser}
                  onUpgrade={(price) => startCheckout(price)}
                  onOpenBilling={() => setTab("profile")}
                />
              )}
              {tab === "chat" && (
                <ChatScreen
                  messages={messages}
                  input={input}
                  setInput={setInput}
                  onSend={(text) => sendMessage(text)}
                  onSwap={handleSwap}
                  onSave={handleSave}
                  savedIds={savedIds}
                  pending={pending}
                  favoriteStores={profile.favoriteStores || []}
                  palette={profile.palette || []}
                  avoid={profile.avoid || []}
                  onUpgrade={(price) => startCheckout(price)}
                  onOpenBilling={() => setTab("profile")}
                />
              )}
              {tab === "wardrobe" && (
                <WardrobeScreen
                  savedOutfits={savedOutfits}
                  favoriteStores={profile.favoriteStores || []}
                  palette={profile.palette || []}
                  avoid={profile.avoid || []}
                />
              )}
              {tab === "bag" && (
                <BagScreen
                  savedOutfits={savedOutfits}
                  favoriteStores={profile.favoriteStores || []}
                  palette={profile.palette || []}
                  avoid={profile.avoid || []}
                />
              )}
              {tab === "profile" && (
                <ProfileScreen
                  profile={profile}
                  authUser={authUser}
                  billing={billing}
                  onRefreshBilling={refreshBilling}
                  onUpgrade={(price) => startCheckout(price)}
                  onManageBilling={() => openCustomerPortal()}
                  onCancelPro={async () => {
                    await cancelProSubscription();
                  }}
                  onDeleteAccount={async () => {
                    await requestAccountDeletion();
                    await handleLogOut();
                  }}
                  onLogOut={handleLogOut}
                  onToggleFavoriteStore={(storeId) => {
                    setProfile((p) => {
                      const current = p.favoriteStores || [];
                      const next = current.includes(storeId)
                        ? current.filter((id) => id !== storeId)
                        : [...current, storeId];
                      return { ...p, favoriteStores: next };
                    });
                  }}
                  onDeleteProfile={deleteProfileAndRestart}
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

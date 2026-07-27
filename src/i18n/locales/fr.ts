// Fichier de langue française. Les clés sont vérifiées par rapport au dictionnaire source zh-CN.
import type { Dict, VidstackDict } from "./zh-CN";

export const dict: Dict = {
  // ── Commun ──
  "common.channelPos": "Canal {pos}",
  "common.live": "DIRECT",
  "common.liveNow": "À L'ANTENNE",
  "common.favAdd": "Ajouter aux favoris",
  "common.favRemove": "Retirer des favoris",
  "common.fav": "Favori",
  "common.faved": "En favori",
  "common.independent": "Indépendant",
  "common.retry": "Réessayer",
  "common.close": "Fermer",
  "common.clear": "Effacer",
  "common.channel": "Chaîne",

  // ── En-tête ──
  "header.menuClose": "Fermer le menu",
  "header.menuOpen": "Ouvrir le menu",
  "header.sidebarExpand": "Déployer la barre latérale",
  "header.sidebarCollapse": "Replier la barre latérale",
  "header.searchPlaceholder": "Rechercher chaînes, diffuseurs, pays…",
  "header.searchAria": "Rechercher des chaînes",
  "header.searchClear": "Effacer la recherche",
  "header.search": "Rechercher",
  "header.liveCountSuffix": "signaux à l'antenne",

  // ── Barre latérale ──
  "sidebar.home": "Accueil",
  "sidebar.favorites": "Favoris",
  "sidebar.history": "Historique",
  "sidebar.categories": "Catégories",
  "sidebar.countries": "Pays",
  "sidebar.all": "Tout",
  "sidebar.allCategoriesAria": "Voir toutes les catégories",
  "sidebar.allCountriesAria": "Voir tous les pays",
  "sidebar.status": "État",
  "sidebar.settings": "Réglages",

  // ── Toasts ──
  "toast.backHome": "Retour à l'accueil",
  "toast.gotoFavorites": "Favoris affichés",
  "toast.gotoHistory": "Historique de lecture affiché",
  "toast.gotoStatus": "Page d'état affichée",
  "toast.gotoSettings": "Réglages affichés",
  "toast.switchedChannel": "Chaînes {name} affichées",
  "toast.favAdded": "Ajouté aux favoris",
  "toast.favRemoved": "Retiré des favoris",
  "toast.categoryCleared": "Filtre de catégorie effacé",
  "toast.categorySet": "Catégorie : {name}",
  "toast.countryCleared": "Filtre de pays effacé",
  "toast.countrySet": "Pays : {name}",
  "toast.sortSet": "Tri : {name}",
  "toast.nsfwOn": "Contenu adulte affiché",
  "toast.nsfwOff": "Contenu adulte masqué",
  "toast.historyCleared": "Historique de lecture effacé",
  "toast.themeSwitched": "Mode « {name} » activé",
  "toast.langSwitched": "Langue changée : {name}",
  "toast.streamFailover": "Flux indisponible, signal de secours activé",
  "toast.welcome": "Bienvenue sur SignalTV",
  "toast.loading": "Chargement",

  // ── Hero ──
  "hero.title1": "Le monde,",
  "hero.title2": "en direct.",
  "hero.lede1": "Regroupe",
  "hero.lede2":
    "chaînes de télévision gratuites du monde entier — actualités, cinéma, sport, musique, documentaires et plus. Sans inscription, regardez tout de suite.",
  "hero.tuneIn": "Voir la sélection",
  "hero.featured": "SÉLECTION",
  "hero.rec": "● ENR",
  "hero.nowPlaying": "EN LECTURE",

  // ── Barre de filtres ──
  "filter.eyebrow": "Guide des programmes",
  "filter.searchResults": "Résultats pour « {q} »",
  "filter.allChannels": "Toutes les chaînes",
  "filter.categoryFallback": "Catégorie",
  "filter.countryFallback": "Pays",
  "filter.favorites": "Favoris",
  "filter.countFavorites": { one: "{count} favori", other: "{count} favoris" },
  "filter.countSignals": { one: "{count} signal", other: "{count} signaux" },
  "filter.categoryAria": "Filtrer par catégorie",
  "filter.countryAria": "Filtrer par pays",
  "filter.sortAria": "Ordre de tri",
  "filter.allCategories": "Toutes les catégories",
  "filter.allCountries": "Tous les pays",
  "filter.nsfwTitle": "Inclure le contenu adulte",
  "filter.nsfwShown": "Contenu adulte affiché",
  "filter.nsfwHidden": "Contenu adulte masqué",

  // ── Options de tri ──
  "sort.default": "Par défaut",
  "sort.country": "Pays",
  "sort.recent": "Vus récemment",
  "sort.latencyAsc": "Latence : basse → haute",
  "sort.latencyDesc": "Latence : haute → basse",
  "sort.nsfwFirst": "Contenu adulte d'abord",

  // ── Grille de chaînes ──
  "grid.emptyTitle": "Pas de signal.",
  "grid.emptyDesc": "Aucune chaîne ne correspond aux filtres actuels. Élargissez la recherche.",
  "grid.loadingMore": {
    one: "Chargement de {count} signal supplémentaire…",
    other: "Chargement de {count} signaux supplémentaires…",
  },
  "grid.footer": "{shown} signaux affichés sur {total}",

  // ── Carte de chaîne ──
  "card.nsfw": "18+",

  // ── Historique ──
  "history.eyebrow": "Journal de lecture",
  "history.title": "Historique de lecture",
  "history.countRecords": { one: "{count} entrée", other: "{count} entrées" },
  "history.clear": "Effacer l'historique",
  "history.emptyTitle": "Aucun historique pour le moment.",
  "history.emptyDesc":
    "Lancez une chaîne et chaque visionnage sera consigné ici sous forme de chronologie.",
  "history.noMatchTitle": "Aucune entrée correspondante.",
  "history.noMatchDesc":
    "Aucune entrée ne correspond aux filtres actuels. Essayez une autre catégorie ou un autre pays.",
  "history.replay": "Rejouer {name}",
  "history.gone": "Chaîne hors ligne",

  // ── Page d'état ──
  "status.eyebrow": "Source de signal",
  "status.title": "État",
  "status.connError": "Anomalie de liaison montante",
  "status.connLoading": "Établissement de la liaison montante",
  "status.connOk": "Liaison montante établie",
  "status.connIdle": "En attente",
  "status.connection": "Connexion",
  "status.connectionDesc": "État de chargement actuel des sources de signal.",
  "status.connSub": "Sources TV publiques · iptv-org",
  "status.data": "Données",
  "status.dataDesc": "Chaînes, catégories et pays chargés.",
  "status.statChannels": "chaînes",
  "status.statCategories": "catégories",
  "status.statCountries": "pays",
  "status.probe": "Sonde de latence",
  "status.probeDesc": "Mesure la latence des chaînes visibles pour le tri par latence.",
  "status.probeStatus": "État",
  "status.probeReady": "Prête",
  "status.probeIdle": "Non démarrée",
  "status.probed": "Sondées",
  "status.probedCount": { one: "{count} chaîne", other: "{count} chaînes" },
  "status.reachable": "Joignables",
  "status.reachableValue": { one: "{count} chaîne ({pct}%)", other: "{count} chaînes ({pct}%)" },

  // ── Réglages ──
  "settings.eyebrow": "Console",
  "settings.title": "Réglages",
  "settings.appearance": "Apparence",
  "settings.appearanceDesc": "Choisissez le mode de thème : palette et ambiance générales.",
  "settings.language": "Langue",
  "settings.languageDesc":
    "Choisissez la langue de l'interface. Détection automatique du navigateur par défaut.",
  "settings.langAuto": "Détection auto",
  "settings.langAutoDesc": "Suivre la langue du navigateur (actuellement {name})",
  "settings.about": "À propos",
  "settings.githubAria": "Dépôt GitHub",
  "settings.tagline": "Signaux TV publics · Diffusion gratuite en direct",
  "settings.channelsCount": { one: "{count} chaîne", other: "{count} chaînes" },
  "settings.noSignup": "Sans inscription · Sans publicité · Sans pistage",
  "settings.dataSource":
    "Les données des chaînes proviennent du projet open source public iptv-org. Ce site ne stocke ni ne relaie aucun flux vidéo.",

  // ── Options de thème ──
  "theme.system": "Système",
  "theme.systemDesc": "Suivre le système d'exploitation",
  "theme.light": "Jour",
  "theme.lightDesc": "Fond crème chaleureux, clair et confortable",
  "theme.dark": "Nuit",
  "theme.darkDesc": "Noir broadcast, ambiance immersive",

  // ── Noms de langues ──
  "lang.zh-CN": "Chinois (simplifié)",
  "lang.en": "Anglais",
  "lang.de": "Allemand",
  "lang.fr": "Français",
  "lang.ja": "Japonais",
  "lang.ru": "Russe",
  "lang.es": "Espagnol",
  "lang.ko": "Coréen",

  // ── Fenêtre du lecteur ──
  "player.dialogAria": "Lecture de {name}",
  "player.signalLocked": "Signal verrouillé",
  "player.closeAria": "Fermer le lecteur",
  "player.website": "Site officiel",
  "player.factChannel": "N° de canal",
  "player.factCountry": "Pays",
  "player.factStreams": "Flux",
  "player.factLaunched": "Lancée en",
  "player.related": "Signaux associés",
  "player.loadFailed": "Échec du chargement du lecteur. Fermez puis réessayez.",

  // ── Surcouches du lecteur ──
  "tv.acquiring": "Acquisition du signal…",
  "tv.tapToPlayAria": "Appuyer pour lancer la lecture",
  "tv.tapToPlay": "Appuyer pour lire",
  "tv.tapToPlayHint": "La politique du navigateur exige un démarrage manuel",
  "tv.signalLost": "Signal perdu",
  "tv.mixedContent":
    "Le navigateur a bloqué cette source non chiffrée (http) pour raisons de sécurité ; lecture impossible sur cette page.",
  "tv.unavailable": "Ce flux en direct est indisponible.",
  "tv.triedStreams": "{tried}/{total} flux essayés, aucun n'a pu être lu.",
  "tv.regionHint":
    "De nombreux signaux gratuits sont géo-restreints ou hors ligne par intermittence. Essayez une autre chaîne du même diffuseur.",
  "tv.startFailed": "Impossible de démarrer la lecture. Réessayez ou changez de chaîne.",

  // ── Notifications ──
  "toaster.region": "Notifications",
  "toaster.closeAria": "Fermer la notification",

  // ── Écran de chargement ──
  "loader.sub": "Établissement de la liaison montante · Sources TV publiques",
  "loader.logConnect": "Connexion aux sources de signal",
  "loader.logChannels": "Récupération de la table des chaînes",
  "loader.logStreams": "Récupération de la table des flux",
  "loader.logSync": "Synchronisation de la grille de diffusion",
  "loader.failTitle1": "Liaison montante ",
  "loader.failTitle2": "échouée",
  "loader.retryConnection": "Retenter la connexion",

  // ── Étapes de chargement ──
  "stage.connecting": "Connexion aux sources de signal…",
  "stage.ready": "{label} prête ({done}/4)",
  "stage.pulling": "Récupération : {label} · {size}",
  "stage.merging": "Fusion des tables de signaux…",

  // ── Noms des jeux de données ──
  "data.channels": "table des chaînes",
  "data.streams": "table des flux",
  "data.categories": "table des catégories",
  "data.countries": "table des pays",

  // ── ErrorBoundary ──
  "errb.title1": "Signal ",
  "errb.title2": "interrompu",
  "errb.unknown": "Erreur de rendu inconnue",

  // ── Fenêtres de sélection ──
  "picker.recent": "Récemment utilisés",
  "picker.searchCategories": "Rechercher des catégories…",
  "picker.searchCategoriesAria": "Rechercher des catégories",
  "picker.noCategories": "Aucune catégorie correspondante",
  "picker.searchCountries": "Rechercher pays ou codes de région…",
  "picker.searchCountriesAria": "Rechercher des pays",
  "picker.noCountries": "Aucun pays correspondant",

  // ── Erreurs API ──
  "api.requestFailed": "Échec de la requête {url} : {status}",
  "api.timeout": "Délai de requête dépassé {url}",
  "api.cancelled": "Requête annulée",
  "api.readFailed": "Échec de lecture de la réponse {url}",
  "api.parseFailed": "Échec d'analyse de la réponse {url} (pas du JSON)",
  "api.loadFailed": "Échec du chargement des données de diffusion.",

  // ── Format de date ──
  "format.today": "Aujourd'hui",
  "format.yesterday": "Hier",

  // ── SEO ──
  "seo.homeTitle": "SignalTV - TV en direct gratuite en ligne",
  "seo.homeDesc":
    "SignalTV est un site gratuit pour regarder la télévision en direct en ligne, regroupant des milliers de chaînes du monde entier : actualités, cinéma, sport, musique, documentaires et plus. Sans inscription.",
  "seo.categoryTitle": "SignalTV | Chaînes {name}",
  "seo.categoryDescCount":
    "Regardez gratuitement {count} chaînes TV {name} en direct — lecture immédiate, contenus {name} du monde entier.",
  "seo.categoryDesc":
    "Regardez gratuitement des chaînes TV {name} en direct — lecture immédiate, contenus {name} du monde entier.",
  "seo.countryTitle": "SignalTV | Chaînes TV de {name}",
  "seo.countryDescCount":
    "Regardez gratuitement {count} chaînes TV en direct de {name}, lecture immédiate.",
  "seo.countryDesc": "Regardez gratuitement des chaînes TV en direct de {name}, lecture immédiate.",
  "seo.favoritesTitle": "SignalTV | Mes chaînes favorites",
  "seo.favoritesDesc": "Vos chaînes TV favorites sur SignalTV — reprenez le visionnage en un clic.",
  "seo.historyTitle": "SignalTV | Historique de lecture",
  "seo.historyDesc":
    "Votre chronologie de lecture sur SignalTV — revoyez et rejouez les chaînes regardées (stockage local uniquement).",
  "seo.statusTitle": "SignalTV | État des sources de signal",
  "seo.statusDesc":
    "État des sources SignalTV : connexion, statistiques des chaînes, progression de la sonde de latence et notes sur les données.",
  "seo.settingsTitle": "SignalTV | Réglages",
  "seo.settingsDesc": "Réglages SignalTV : mode de thème, langue de l'interface et infos sur l'application.",
  "seo.searchTitle": "SignalTV | Chaînes TV pour « {q} »",
  "seo.searchDesc": "Chaînes TV en direct correspondant à « {q} » sur SignalTV — regardez gratuitement en ligne.",
};

// Traduction française du DefaultVideoLayout de vidstack
export const vidstack: VidstackDict = {
  "Announcements": "Annonces",
  "Accessibility": "Accessibilité",
  "AirPlay": "AirPlay",
  "Audio": "Audio",
  "Auto": "Auto",
  "Boost": "Amplification",
  "Captions": "Sous-titres",
  "Caption Styles": "Styles de sous-titres",
  "Captions look like this": "Les sous-titres ressemblent à ceci",
  "Chapters": "Chapitres",
  "Closed-Captions Off": "Sous-titres désactivés",
  "Closed-Captions On": "Sous-titres activés",
  "Connected": "Connecté",
  "Continue": "Continuer",
  "Connecting": "Connexion en cours",
  "Default": "Par défaut",
  "Disabled": "Désactivé",
  "Disconnected": "Déconnecté",
  "Display Background": "Arrière-plan d'affichage",
  "Download": "Télécharger",
  "Enter Fullscreen": "Passer en plein écran",
  "Enter PiP": "Activer le PiP",
  "Exit Fullscreen": "Quitter le plein écran",
  "Exit PiP": "Quitter le PiP",
  "Font": "Police",
  "Family": "Famille de police",
  "Fullscreen": "Plein écran",
  "Google Cast": "Google Cast",
  "Keyboard Animations": "Animations clavier",
  "LIVE": "DIRECT",
  "Loop": "Boucle",
  "Mute": "Couper le son",
  "Normal": "Normal",
  "Off": "Désactivé",
  "Pause": "Pause",
  "Play": "Lecture",
  "Playback": "Lecture",
  "PiP": "PiP",
  "Quality": "Qualité",
  "Replay": "Revoir",
  "Reset": "Réinitialiser",
  "Seek Backward": "Reculer",
  "Seek Forward": "Avancer",
  "Seek": "Naviguer",
  "Settings": "Réglages",
  "Skip To Live": "Revenir au direct",
  "Speed": "Vitesse",
  "Size": "Taille",
  "Color": "Couleur",
  "Opacity": "Opacité",
  "Shadow": "Ombre",
  "Text": "Texte",
  "Text Background": "Arrière-plan du texte",
  "Track": "Piste",
  "Unmute": "Rétablir le son",
  "Volume": "Volume",
};

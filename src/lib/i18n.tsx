import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Language = "it" | "en";

/** Add a language here, in the dictionaries and in the DB translations table. */
export const LANGUAGES: { code: Language; label: string }[] = [
  { code: "it", label: "Italiano" },
  { code: "en", label: "English" },
];

export const LANGUAGE_STORAGE_KEY = "infraorgit-language";

const it = {
  // App shell
  "app.sessionLoading": "Caricamento sessione…",
  "app.sessionError": "Errore: {message}",
  "app.redirecting": "Reindirizzamento al login…",
  "app.pageLoading": "Caricamento pagina…",
  "app.sessionUnavailable": "Sessione non disponibile",
  "app.logoutError":
    "Logout non riuscito. La sessione è ancora attiva: riprova.",
  "app.mainMenu": "Menu principale",
  "app.menuLoading": "Caricamento menu…",
  "app.back": "Indietro",
  "app.themeLight": "Tema chiaro",
  "app.themeDark": "Tema scuro",
  "app.switchLight": "Passa al tema chiaro",
  "app.switchDark": "Passa al tema scuro",
  "app.logout": "Logout",
  "app.welcome": "Benvenuto, {name}.",
  "app.homeLoading": "Caricamento sezioni…",
  "app.placeholder": "Pagina",
  "app.comingSoon": "Sezione in arrivo nella prossima fase.",
  "app.loginErrorTitle": "Accesso non riuscito",
  "app.loginErrorBody":
    "Il login non è stato completato. Riprova o contatta un amministratore.",
  "app.retry": "Riprova",

  // Shared terms
  "common.actions": "Azioni",
  "common.save": "Salva",
  "common.edit": "Modifica",
  "common.delete": "Elimina",
  "common.cancel": "Annulla",
  "common.close": "Chiudi",
  "common.open": "Apri",
  "common.search": "Cerca",
  "common.searchEllipsis": "Cerca…",
  "common.new": "Nuovo",
  "common.loading": "Caricamento…",
  "common.noItems": "Nessun elemento.",
  "common.selectAll": "Seleziona tutti",
  "common.selectRow": "Seleziona {name}",
  "common.requiredField": "Il campo {field} è obbligatorio.",
  "common.saveError": "Errore di salvataggio",
  "common.deleteError": "Errore di eliminazione",
  "common.deleteConfirm": 'Eliminare "{name}"?',
  "common.operationError": "Operazione non riuscita",
  "common.name": "Nome",
  "common.description": "Descrizione",
  "common.environment": "Ambiente",
  "common.environments": "Ambienti",
  "common.provider": "Provider",
  "common.server": "Server",
  "common.servers": "Server",
  "common.application": "Applicazione",
  "common.applications": "Applicazioni",
  "common.project": "Progetto",
  "common.projects": "Progetti",
  "common.role": "Ruolo",
  "common.roles": "Ruoli",
  "common.group": "Gruppo",
  "common.groups": "Gruppi",
  "common.user": "Utente",
  "common.users": "Utenti",
  "common.username": "Username",
  "common.surname": "Cognome",
  "common.label": "Etichetta",
  "common.version": "Versione",
  "common.versions": "Versioni",
  "common.type": "Tipo",
  "common.status": "Stato",
  "common.port": "Porta",
  "common.hostname": "Hostname",
  "common.ip": "IP",
  "common.sshPort": "Porta SSH",
  "common.order": "Ordine",
  "common.path": "Path",
  "common.scope": "Scope",
  "common.dateTime": "Data/ora",
  "common.method": "Metodo",
  "common.durationMs": "Durata ms",
  "common.size": "Dimensione",
  "common.record": "Anagrafica",
  "common.basePath": "Base path",
  "common.address": "Indirizzo IP",
  "common.yes": "sì",
  "common.no": "no",
  "common.none": "— nessuno —",
  "common.noCredential": "— nessuna —",
  "common.emptyValue": "—",
  "common.host": "Host",

  // Pagination
  "pagination.item": "elemento",
  "pagination.items": "elementi",
  "pagination.pageInfo": "Pagina {page} di {pageCount}",
  "pagination.itemsPerPage": "Elementi per pagina",
  "pagination.previous": "Precedente",
  "pagination.next": "Successiva",

  // Providers
  "providers.title": "Providers",
  "providers.description": "Provider che espongono ambienti di esecuzione.",
  "providers.create": "Nuovo provider",
  "providers.detail": "Provider",
  "providers.environments": "Ambienti del provider",

  // Environments
  "environments.title": "Ambienti",
  "environments.description":
    "Anagrafica degli ambienti (produzione, staging, …).",
  "environments.create": "Nuovo ambiente",
  "environments.detail": "Ambiente",
  "environments.linkedProviders": "Provider collegati",
  "environments.linkProvider": "Collega provider",
  "environments.roles": "Ruoli per ambiente",
  "environments.assignRole": "Assegna ruolo",

  // Servers
  "servers.title": "Server",
  "servers.description": "Server gestiti per ambiente provider.",
  "servers.create": "Nuovo server",
  "servers.proxy": "Proxy",
  "servers.providerEnvironment": "Ambiente provider",
  "servers.jumpServer": "Server proxy (jump)",
  "servers.sshCredential": "Credenziale SSH",
  "servers.updated": "Server aggiornato.",
  "servers.saveFailed": "Salvataggio non riuscito",
  "servers.sshSaved": "Configurazione SSH salvata.",
  "servers.sshSaveFailed": "Salvataggio SSH non riuscito",
  "servers.clearHostKeyConfirm":
    "Azzerare la host key salvata? Verrà riappresa alla prossima connessione.",
  "servers.hostKeyCleared": "Host key azzerata.",
  "servers.hostKeyResetFailed": "Reset host key non riuscito",
  "servers.hostKey": "Host key",
  "servers.hostKeyRegistered": "registrata",
  "servers.hostKeyMissing": "non registrata",
  "servers.details": "Dati server",
  "servers.credential": "Credenziale",
  "servers.saveSsh": "Salva SSH",
  "servers.clearHostKey": "Azzera host key",
  "servers.testFailed": "Test non riuscito",
  "servers.reachability": "Test di raggiungibilità",
  "servers.scopeGlobal": "Globale",
  "servers.selectedCount": "{count} selezionati",
  "servers.testing": "Test in corso…",
  "servers.runSelected": "Effettua selezionati",
  "servers.runAll": "Effettua tutti i test",
  "servers.connection": "connessione",
  "servers.newTest": "Nuovo test",
  "servers.deployedApplications": "Applicazioni deployate",
  "servers.applicationVersion": "Versione applicazione",
  "servers.exposedPort": "Porta esposta",
  "servers.deployApplication": "Deploy applicazione",
  "servers.actionsTitle": "Azioni",
  "servers.runConfirm": 'Eseguire "{label}" su {server}?',
  "servers.executionFailed": "Esecuzione non riuscita",
  "servers.noOutput": "(nessun output)",

  // Catalog: applications
  "applications.title": "Applicazioni",
  "applications.description":
    "Catalogo applicazioni con versioni, API e query param.",
  "applications.create": "Nuova applicazione",
  "applications.detail": "Applicazione",
  "applications.listeningPort": "Porta in ascolto",
  "applications.isFrontend": "Applicazione frontend (senza API)",
  "applications.versionNumber": "Numero versione",
  "applications.createVersion": "Nuova versione",
  "applications.versionApis": "API della versione {version}",
  "applications.serverHint": "Server (nome, IP o ambiente)",
  "applications.addServer": "Aggiungi server",
  "applications.sslIgnored": "ignorato",
  "applications.sslVerified": "verificato",
  "applications.hostnameHint": "Hostname (URL per le chiamate)",
  "applications.ignoreSsl": "Ignora errori certificato SSL",
  "applications.apiKey": "API key",
  "applications.location": "Posizione",
  "applications.value": "Valore",
  "applications.configured": "configurato",
  "applications.missing": "mancante",
  "applications.nameHint": "Nome (header o query)",
  "applications.allEnvironments": "Tutti gli ambienti",
  "applications.allEnvironmentsShort": "Tutti",
  "applications.valueHint": "Valore (vuoto = mantieni)",
  "applications.createApiKey": "Nuova API key",
  "applications.calls": "Chiamate",
  "applications.callsLimited":
    "Mostrate le ultime {shown} di {total} chiamate.",
  "applications.linkedProjects": "Progetti collegati",
  "applications.linkProject": "Collega progetto",
  "applications.actionsTitle": "Azioni applicazione",
  "applications.command": "Comando",
  "applications.customScript": "script custom",
  "applications.confirmation": "Conferma",
  "applications.order": "Ordine",
  "applications.baseCommand": "Comando base",
  "applications.customScriptLabel": "Script custom",
  "applications.parameterValues": "Valori parametri (JSON)",
  "applications.requiresConfirmation": "Richiede conferma",
  "applications.createAction": "Nuova azione",
  "applications.invalidParameterValues":
    "ParameterValues deve essere un oggetto JSON valido.",
  "applications.searchApiLabel": "Cerca API della versione {version}",
  "applications.searchApiPlaceholder": "Cerca API: metodo, URL o descrizione…",
  "applications.call": "Chiama",
  "applications.newApi": "Nuova API",
  "applications.queryParamsOf": "Query param di {method} {url}",
  "applications.newQueryParam": "Nuovo query param",
  "applications.failed": "Chiamata non riuscita",

  // Catalog: API calls
  "apiCall.selectEnvironment": "Seleziona un ambiente.",
  "apiCall.dialogLabel": "Chiamata {method} {url}",
  "apiCall.title": "Chiama API",
  "apiCall.queryParam": "Query param",
  "apiCall.body": "Body JSON",
  "apiCall.saveCall": "Salva la chiamata",
  "apiCall.calling": "Chiamata…",
  "apiCall.copyFailed": "Copia non riuscita: clipboard non disponibile.",
  "apiCall.truncated": "Risposta troncata: il body supera 10 MiB.",
  "apiCall.binary": "Risposta binaria: usa Scarica per il file originale.",
  "apiCall.copy": "Copia",
  "apiCall.download": "Scarica",
  "apiCall.copied": "Copiato",
  "apiCall.newFile": "nuova",

  // Catalog: saved calls
  "savedCall.dialogLabel": "Chiamata salvata",
  "savedCall.title": "Chiamata salvata",
  "savedCall.unavailable": "Chiamata non disponibile",
  "savedCall.apiUnavailable": "API non disponibile",
  "savedCall.requestBody": "Body richiesta",
  "savedCall.response": "Risposta",
  "savedCall.binary": "Risposta binaria, salvata come base64.",
  "savedCall.repeatHint": "Ripeti con gli stessi parametri",
  "savedCall.noLongerAvailable": "API non più disponibile",
  "savedCall.repeat": "Ripeti",
  "savedCall.truncated": "Risposta salvata troncata: il body supera 1 MiB.",

  // Catalog: spec import
  "specImport.invalid": "Documento non valido.",
  "specImport.imported": "Importate {apis} API e {keys} API key.",
  "specImport.partialError": "{count} API importate, poi errore: {error}",
  "specImport.interrupted": "importazione interrotta",
  "specImport.title": "Importa specifica",
  "specImport.formats": "OpenAPI 3.x o Swagger 2.0 in JSON o YAML.",
  "specImport.hint":
    "Incolla il testo nel riquadro oppure trascina un file JSON/YAML sul riquadro.",
  "specImport.documentLabel": "Documento OpenAPI o Swagger",
  "specImport.placeholder": '{"openapi":"3.0.3", ...} oppure yaml',
  "specImport.upload": "Carica file",
  "specImport.fileName": "File: {name}",
  "specImport.analyze": "Analizza",
  "specImport.importing": "Importazione…",
  "specImport.import": "Importa {apis} API e {keys} API key",
  "specImport.queryParamCount": "{count} query param",

  // Catalog: projects
  "projects.title": "Progetti",
  "projects.description": "Raggruppamenti di applicazioni.",
  "projects.create": "Nuovo progetto",
  "projects.detail": "Progetto",
  "projects.linkedApplications": "Applicazioni collegate",
  "projects.linkApplication": "Collega applicazione",

  // Admin
  "menus.title": "Menu",
  "menus.description": "Voci della sidebar e ruoli che possono vederle.",
  "menus.create": "Nuovo menu",
  "menus.edit": "Modifica menu",
  "menus.parent": "Padre",
  "menus.active": "Attivo",
  "menus.visible": "Visibile",
  "menus.deleteConfirm": 'Eliminare il menu "{name}"?',
  "menus.hideBack": "Nasconde il pulsante Indietro",
  "menus.visibleRoles": "Ruoli che vedono la voce",
  "menus.noRoleHint":
    "Nessun ruolo selezionato: la voce è visibile a tutti gli autenticati.",

  "users.title": "Utenti",
  "users.description": "Utenti provisionati da Keycloak e ruoli assegnati.",
  "users.create": "Nuovo utente",
  "users.edit": "Modifica utente",
  "users.deleteConfirm": "Eliminare l'utente {username}?",

  "groups.title": "Gruppi",
  "groups.description": "Gruppi per le assegnazioni di ruolo sugli ambienti.",
  "groups.create": "Nuovo gruppo",

  "roles.title": "Ruoli",
  "roles.description":
    "I ruoli di sistema non si eliminano e non cambiano nome o scope.",
  "roles.create": "Nuovo ruolo",

  // Remote
  "commands.title": "Comandi",
  "commands.description":
    "Template con placeholder {{Nome}}. I valori sono quotati prima dell'esecuzione.",
  "commands.create": "Nuovo comando",

  "credentials.title": "Credenziali",
  "credentials.description":
    "Segreti SSH cifrati: non vengono mai restituiti al client.",
  "credentials.create": "Nuova credenziale",
  "credentials.user": "Utente",
  "credentials.secret": "Segreto",
  "credentials.set": "impostato",
  "credentials.missing": "assente",
  "credentials.sshUser": "Utente SSH",
  "credentials.privateKey": "Chiave privata",
  "credentials.secretHint": "Password o chiave privata (vuoto = invariato)",
  "credentials.passphrase": "Passphrase della chiave (opzionale)",
  "credentials.manageServers": "Gestisci server della credenziale",
  "credentials.serversTitle": "Server della credenziale",
  "credentials.added": "{count} server aggiunti.",
  "credentials.error": "errore",
  "credentials.notAdded": "Non aggiunti: {failures}",
  "credentials.assigned": "Associati ({count})",
  "credentials.noneAssigned": "Nessun server usa questa credenziale.",
  "credentials.remove": "Rimuovi",
  "credentials.addServers": "Aggiungi server senza credenziale",
  "credentials.noneAvailable": "Nessun server senza credenziale disponibile.",
  "credentials.searchServers": "Cerca server",
  "credentials.searchServersPlaceholder": "Cerca server…",
  "credentials.selectAllVisible": "Seleziona tutti visibili",
  "credentials.selectedCount": "{count} selezionati",
  "credentials.noMatch": "Nessun server corrisponde.",
  "credentials.addSelected": "Aggiungi selezionati ({count})",

  "executions.title": "Registro esecuzioni",
  "executions.description":
    "Audit delle esecuzioni remote: script e output sono redatti.",
  "executions.date": "Data",
  "executions.output": "Output",
  "executions.detail": "Dettaglio",
  "executions.empty": "(vuoto)",
  "executions.none": "Nessuna esecuzione.",

  "reachability.title": "Test di rete",
  "reachability.description":
    "Test globali: vengono eseguiti su ogni server dalla pagina del server.",
  "reachability.create": "Nuovo test",

  // Console
  "console.connecting": "Connessione…",
  "console.connected": "Connesso",
  "console.connectionError": "Errore di connessione",
  "console.sessionClosed": "{status} · sessione chiusa",
  "console.title": "Console SSH",
  "console.reconnect": "Riconnetti",
  "console.minimizeHint": "Chiudi il pannello e lascia la sessione nella barra",
  "console.minimize": "Riduci",
  "console.terminal": "Terminale SSH",
  "console.storageError": "Impossibile salvare le console nel browser.",
  "console.label": "Console",
  "console.count": "Console ({count})",
  "console.newOutput": "{count} {label}",
  "console.new": "nuovo",
  "console.newPlural": "nuovi",
  "console.openSession": "Apri la console di {name}",
  "console.closeSession": "Chiudi la console di {name}",
  "console.merge": "Unisci le console",
  "console.split": "Dividi le console",
  "console.minimizeBar": "Riduci la barra delle console",
  "console.receiving": "In ricezione",
  "console.unread": "Output non visto",

  // Diagrams
  "diagrams.title": "Diagrammi",
  "diagrams.detail": "Diagramma",
  "diagrams.description": "Vista globale e diagrammi salvati.",
  "diagrams.globalView": "Vista globale",
  "diagrams.create": "Nuovo diagramma",
  "diagrams.edit": "Modifica diagramma",
  "diagrams.none": "Nessun diagramma.",
  "diagrams.default": "Predefinito",
  "diagrams.defaultGlobalView": "Vista globale predefinita",
  "diagrams.useAsDefault": "Usa come vista globale predefinita",
  "diagrams.providerOptional": "Provider (opzionale)",
  "diagrams.environmentOptional": "Ambiente (opzionale)",
  "diagrams.projectOptional": "Progetto (opzionale)",
  "diagrams.scopeEnvironment": "Ambiente {name}",
  "diagrams.scopeProvider": "Provider {name}",
  "diagrams.scopeProject": "Progetto {name}",
  "diagrams.nodeWithoutData": "Nodo senza dati",
  "diagrams.notLoaded": "Diagramma non caricato",
  "diagrams.edgeWithoutData": "Collegamento senza dati",
  "diagrams.layoutSaved": "Layout salvato.",
  "diagrams.newNamePrompt": "Nome del nuovo diagramma",
  "diagrams.copyName": "{name} copia",
  "diagrams.deleteConfirm": 'Eliminare il diagramma "{name}"?',
  "diagrams.environmentCount": "{count} ambienti",
  "diagrams.serverCount": "{count} server",
  "diagrams.applicationCount": "{count} applicazioni",
  "diagrams.proxyConnectionCount": "{count} connessioni proxy",
  "diagrams.routeCount": "{count} route",
  "diagrams.deleteNodeConfirm": "Eliminare il nodo {type} #{id}?",
  "diagrams.noDefault":
    "Nessun diagramma predefinito. Creane uno per usare la vista globale.",
  "diagrams.createGlobal": "Crea vista globale",
  "diagrams.notFound": "Diagramma non trovato. Torna all'elenco.",
  "diagrams.list": "Elenco",
  "diagrams.saveAs": "Salva come…",
  "diagrams.exitFullscreen": "Esci",
  "diagrams.fullscreen": "Schermo intero",
  "diagrams.hideDetails": "Nascondi dettagli",
  "diagrams.details": "Dettagli",
  "diagrams.dismissAdded": "Chiudi l'avviso dei nodi aggiunti",
  "diagrams.loading": "Caricamento diagramma…",
  "diagrams.deleteNodeDependencies": "Elimina nodo e dipendenze",
  "diagrams.added": "Aggiunti {parts} al diagramma.",
  "diagrams.addedNodes": "Aggiunti {count} {nodes} al diagramma.",
  "diagrams.node": "nodo",
  "diagrams.nodes": "nodi",
  "diagrams.newServer": "nuovo server",
  "diagrams.newServers": "nuovi server",
  "diagrams.newApplication": "nuova applicazione",
  "diagrams.newApplications": "nuove applicazioni",
  "diagrams.partsJoin": " e ",

  // OpenAPI parsing
  "openapi.empty": "Incolla un documento OpenAPI o Swagger.",
  "openapi.unreadable": "Documento non leggibile: {reason}.",
  "openapi.invalidSyntax": "sintassi non valida",
  "openapi.noRoot": "Il documento non contiene un oggetto radice.",
  "openapi.unknownFormat":
    "Formato non riconosciuto: serve un documento OpenAPI 3.x o Swagger 2.0.",
  "openapi.noPaths": "Il documento non contiene paths.",
  "openapi.noOperations": "Nessuna operazione trovata nel documento.",
} as const;

export type TranslationKey = keyof typeof it;

const en: Record<TranslationKey, string> = {
  // App shell
  "app.sessionLoading": "Loading session…",
  "app.sessionError": "Error: {message}",
  "app.redirecting": "Redirecting to login…",
  "app.pageLoading": "Loading page…",
  "app.sessionUnavailable": "Session unavailable",
  "app.logoutError": "Logout failed. The session is still active: try again.",
  "app.mainMenu": "Main menu",
  "app.menuLoading": "Loading menu…",
  "app.back": "Back",
  "app.themeLight": "Light theme",
  "app.themeDark": "Dark theme",
  "app.switchLight": "Switch to light theme",
  "app.switchDark": "Switch to dark theme",
  "app.logout": "Logout",
  "app.welcome": "Welcome, {name}.",
  "app.homeLoading": "Loading sections…",
  "app.placeholder": "Page",
  "app.comingSoon": "This section is coming in the next phase.",
  "app.loginErrorTitle": "Sign-in failed",
  "app.loginErrorBody":
    "Sign-in did not complete. Try again or contact an administrator.",
  "app.retry": "Try again",

  // Shared terms
  "common.actions": "Actions",
  "common.save": "Save",
  "common.edit": "Edit",
  "common.delete": "Delete",
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.open": "Open",
  "common.search": "Search",
  "common.searchEllipsis": "Search…",
  "common.new": "New",
  "common.loading": "Loading…",
  "common.noItems": "No items.",
  "common.selectAll": "Select all",
  "common.selectRow": "Select {name}",
  "common.requiredField": "The {field} field is required.",
  "common.saveError": "Save failed",
  "common.deleteError": "Delete failed",
  "common.deleteConfirm": 'Delete "{name}"?',
  "common.operationError": "Operation failed",
  "common.name": "Name",
  "common.description": "Description",
  "common.environment": "Environment",
  "common.environments": "Environments",
  "common.provider": "Provider",
  "common.server": "Server",
  "common.servers": "Servers",
  "common.application": "Application",
  "common.applications": "Applications",
  "common.project": "Project",
  "common.projects": "Projects",
  "common.role": "Role",
  "common.roles": "Roles",
  "common.group": "Group",
  "common.groups": "Groups",
  "common.user": "User",
  "common.users": "Users",
  "common.username": "Username",
  "common.surname": "Surname",
  "common.label": "Label",
  "common.version": "Version",
  "common.versions": "Versions",
  "common.type": "Type",
  "common.status": "Status",
  "common.port": "Port",
  "common.hostname": "Hostname",
  "common.ip": "IP",
  "common.sshPort": "SSH port",
  "common.order": "Order",
  "common.path": "Path",
  "common.scope": "Scope",
  "common.dateTime": "Date/time",
  "common.method": "Method",
  "common.durationMs": "Duration ms",
  "common.size": "Size",
  "common.record": "Details",
  "common.basePath": "Base path",
  "common.address": "IP address",
  "common.yes": "yes",
  "common.no": "no",
  "common.none": "— none —",
  "common.noCredential": "— none —",
  "common.emptyValue": "—",
  "common.host": "Host",

  // Pagination
  "pagination.item": "item",
  "pagination.items": "items",
  "pagination.pageInfo": "Page {page} of {pageCount}",
  "pagination.itemsPerPage": "Items per page",
  "pagination.previous": "Previous",
  "pagination.next": "Next",

  // Providers
  "providers.title": "Providers",
  "providers.description": "Providers that expose execution environments.",
  "providers.create": "New provider",
  "providers.detail": "Provider",
  "providers.environments": "Provider environments",

  // Environments
  "environments.title": "Environments",
  "environments.description": "Environment registry (production, staging, …).",
  "environments.create": "New environment",
  "environments.detail": "Environment",
  "environments.linkedProviders": "Linked providers",
  "environments.linkProvider": "Link provider",
  "environments.roles": "Environment roles",
  "environments.assignRole": "Assign role",

  // Servers
  "servers.title": "Servers",
  "servers.description": "Servers in each provider environment.",
  "servers.create": "New server",
  "servers.proxy": "Proxy",
  "servers.providerEnvironment": "Provider environment",
  "servers.jumpServer": "Jump server (proxy)",
  "servers.sshCredential": "SSH credential",
  "servers.updated": "Server updated.",
  "servers.saveFailed": "Save failed",
  "servers.sshSaved": "SSH configuration saved.",
  "servers.sshSaveFailed": "SSH save failed",
  "servers.clearHostKeyConfirm":
    "Clear the saved host key? It will be learned again on the next connection.",
  "servers.hostKeyCleared": "Host key cleared.",
  "servers.hostKeyResetFailed": "Host key reset failed",
  "servers.hostKey": "Host key",
  "servers.hostKeyRegistered": "recorded",
  "servers.hostKeyMissing": "not recorded",
  "servers.details": "Server details",
  "servers.credential": "Credential",
  "servers.saveSsh": "Save SSH",
  "servers.clearHostKey": "Clear host key",
  "servers.testFailed": "Test failed",
  "servers.reachability": "Reachability tests",
  "servers.scopeGlobal": "Global",
  "servers.selectedCount": "{count} selected",
  "servers.testing": "Testing…",
  "servers.runSelected": "Run selected",
  "servers.runAll": "Run all tests",
  "servers.connection": "connection",
  "servers.newTest": "New test",
  "servers.deployedApplications": "Deployed applications",
  "servers.applicationVersion": "Application version",
  "servers.exposedPort": "Exposed port",
  "servers.deployApplication": "Deploy application",
  "servers.actionsTitle": "Actions",
  "servers.runConfirm": 'Run "{label}" on {server}?',
  "servers.executionFailed": "Execution failed",
  "servers.noOutput": "(no output)",

  // Catalog: applications
  "applications.title": "Applications",
  "applications.description":
    "Application catalog with versions, APIs and query params.",
  "applications.create": "New application",
  "applications.detail": "Application",
  "applications.listeningPort": "Listening port",
  "applications.isFrontend": "Frontend application (no API)",
  "applications.versionNumber": "Version number",
  "applications.createVersion": "New version",
  "applications.versionApis": "APIs of version {version}",
  "applications.serverHint": "Server (name, IP or environment)",
  "applications.addServer": "Add server",
  "applications.sslIgnored": "ignored",
  "applications.sslVerified": "verified",
  "applications.hostnameHint": "Hostname (URL for calls)",
  "applications.ignoreSsl": "Ignore SSL certificate errors",
  "applications.apiKey": "API key",
  "applications.location": "Location",
  "applications.value": "Value",
  "applications.configured": "configured",
  "applications.missing": "missing",
  "applications.nameHint": "Name (header or query)",
  "applications.allEnvironments": "All environments",
  "applications.allEnvironmentsShort": "All",
  "applications.valueHint": "Value (empty = keep)",
  "applications.createApiKey": "New API key",
  "applications.calls": "Calls",
  "applications.callsLimited": "Showing the latest {shown} of {total} calls.",
  "applications.linkedProjects": "Linked projects",
  "applications.linkProject": "Link project",
  "applications.actionsTitle": "Application actions",
  "applications.command": "Command",
  "applications.customScript": "custom script",
  "applications.confirmation": "Confirmation",
  "applications.order": "Order",
  "applications.baseCommand": "Base command",
  "applications.customScriptLabel": "Custom script",
  "applications.parameterValues": "Parameter values (JSON)",
  "applications.requiresConfirmation": "Requires confirmation",
  "applications.createAction": "New action",
  "applications.invalidParameterValues":
    "ParameterValues must be a valid JSON object.",
  "applications.searchApiLabel": "Search APIs in version {version}",
  "applications.searchApiPlaceholder":
    "Search APIs: method, URL or description…",
  "applications.call": "Call",
  "applications.newApi": "New API",
  "applications.queryParamsOf": "Query params of {method} {url}",
  "applications.newQueryParam": "New query param",
  "applications.failed": "Call failed",

  // Catalog: API calls
  "apiCall.selectEnvironment": "Select an environment.",
  "apiCall.dialogLabel": "Call {method} {url}",
  "apiCall.title": "Call API",
  "apiCall.queryParam": "Query param",
  "apiCall.body": "Body JSON",
  "apiCall.saveCall": "Save the call",
  "apiCall.calling": "Calling…",
  "apiCall.copyFailed": "Copy failed: clipboard unavailable.",
  "apiCall.truncated": "Response truncated: body exceeds 10 MiB.",
  "apiCall.binary": "Binary response: use Download for the original file.",
  "apiCall.copy": "Copy",
  "apiCall.download": "Download",
  "apiCall.copied": "Copied",
  "apiCall.newFile": "new",

  // Catalog: saved calls
  "savedCall.dialogLabel": "Saved call",
  "savedCall.title": "Saved call",
  "savedCall.unavailable": "Call unavailable",
  "savedCall.apiUnavailable": "API unavailable",
  "savedCall.requestBody": "Request body",
  "savedCall.response": "Response",
  "savedCall.binary": "Binary response, saved as base64.",
  "savedCall.repeatHint": "Repeat with the same parameters",
  "savedCall.noLongerAvailable": "API no longer available",
  "savedCall.repeat": "Repeat",
  "savedCall.truncated": "Saved response truncated: body exceeds 1 MiB.",

  // Catalog: spec import
  "specImport.invalid": "Invalid document.",
  "specImport.imported": "Imported {apis} APIs and {keys} API keys.",
  "specImport.partialError": "Imported {count} APIs, then error: {error}",
  "specImport.interrupted": "import interrupted",
  "specImport.title": "Import specification",
  "specImport.formats": "OpenAPI 3.x or Swagger 2.0 in JSON or YAML.",
  "specImport.hint":
    "Paste the text into the box or drag a JSON/YAML file onto it.",
  "specImport.documentLabel": "OpenAPI or Swagger document",
  "specImport.placeholder": '{"openapi":"3.0.3", ...} or yaml',
  "specImport.upload": "Upload file",
  "specImport.fileName": "File: {name}",
  "specImport.analyze": "Analyze",
  "specImport.importing": "Importing…",
  "specImport.import": "Import {apis} APIs and {keys} API keys",
  "specImport.queryParamCount": "{count} query params",

  // Catalog: projects
  "projects.title": "Projects",
  "projects.description": "Application groupings.",
  "projects.create": "New project",
  "projects.detail": "Project",
  "projects.linkedApplications": "Linked applications",
  "projects.linkApplication": "Link application",

  // Admin
  "menus.title": "Menu",
  "menus.description": "Sidebar entries and the roles that can see them.",
  "menus.create": "New menu",
  "menus.edit": "Edit menu",
  "menus.parent": "Parent",
  "menus.active": "Active",
  "menus.visible": "Visible",
  "menus.deleteConfirm": 'Delete the menu "{name}"?',
  "menus.hideBack": "Hides the Back button",
  "menus.visibleRoles": "Roles that can see this entry",
  "menus.noRoleHint":
    "No role selected: the entry is visible to all authenticated users.",

  "users.title": "Users",
  "users.description": "Users provisioned by Keycloak and assigned roles.",
  "users.create": "New user",
  "users.edit": "Edit user",
  "users.deleteConfirm": "Delete user {username}?",

  "groups.title": "Groups",
  "groups.description": "Groups for role assignments on environments.",
  "groups.create": "New group",

  "roles.title": "Roles",
  "roles.description":
    "System roles cannot be deleted and cannot change name or scope.",
  "roles.create": "New role",

  // Remote
  "commands.title": "Commands",
  "commands.description":
    "Templates with {{Name}} placeholders. Values are quoted before execution.",
  "commands.create": "New command",

  "credentials.title": "Credentials",
  "credentials.description":
    "Encrypted SSH secrets: they are never returned to the client.",
  "credentials.create": "New credential",
  "credentials.user": "User",
  "credentials.secret": "Secret",
  "credentials.set": "set",
  "credentials.missing": "missing",
  "credentials.sshUser": "SSH user",
  "credentials.privateKey": "Private key",
  "credentials.secretHint": "Password or private key (empty = unchanged)",
  "credentials.passphrase": "Key passphrase (optional)",
  "credentials.manageServers": "Manage credential servers",
  "credentials.serversTitle": "Credential servers",
  "credentials.added": "{count} servers added.",
  "credentials.error": "error",
  "credentials.notAdded": "Not added: {failures}",
  "credentials.assigned": "Assigned ({count})",
  "credentials.noneAssigned": "No server uses this credential.",
  "credentials.remove": "Remove",
  "credentials.addServers": "Add servers without a credential",
  "credentials.noneAvailable": "No server without a credential available.",
  "credentials.searchServers": "Search servers",
  "credentials.searchServersPlaceholder": "Search servers…",
  "credentials.selectAllVisible": "Select all visible",
  "credentials.selectedCount": "{count} selected",
  "credentials.noMatch": "No server matches.",
  "credentials.addSelected": "Add selected ({count})",

  "executions.title": "Execution log",
  "executions.description":
    "Audit of remote executions: scripts and output are redacted.",
  "executions.date": "Date",
  "executions.output": "Output",
  "executions.detail": "Details",
  "executions.empty": "(empty)",
  "executions.none": "No executions.",

  "reachability.title": "Network tests",
  "reachability.description":
    "Global tests: they run on every server from the server page.",
  "reachability.create": "New test",

  // Console
  "console.connecting": "Connecting…",
  "console.connected": "Connected",
  "console.connectionError": "Connection error",
  "console.sessionClosed": "{status} · session closed",
  "console.title": "SSH console",
  "console.reconnect": "Reconnect",
  "console.minimizeHint": "Close the panel and leave the session in the bar",
  "console.minimize": "Minimize",
  "console.terminal": "SSH terminal",
  "console.storageError": "Cannot save consoles in the browser.",
  "console.label": "Console",
  "console.count": "Console ({count})",
  "console.newOutput": "{count} {label}",
  "console.new": "new",
  "console.newPlural": "new",
  "console.openSession": "Open the console for {name}",
  "console.closeSession": "Close the console for {name}",
  "console.merge": "Merge consoles",
  "console.split": "Split consoles",
  "console.minimizeBar": "Minimize the console bar",
  "console.receiving": "Receiving",
  "console.unread": "Unread output",

  // Diagrams
  "diagrams.title": "Diagrams",
  "diagrams.detail": "Diagram",
  "diagrams.description": "Global view and saved diagrams.",
  "diagrams.globalView": "Global view",
  "diagrams.create": "New diagram",
  "diagrams.edit": "Edit diagram",
  "diagrams.none": "No diagrams.",
  "diagrams.default": "Default",
  "diagrams.defaultGlobalView": "Default global view",
  "diagrams.useAsDefault": "Use as default global view",
  "diagrams.providerOptional": "Provider (optional)",
  "diagrams.environmentOptional": "Environment (optional)",
  "diagrams.projectOptional": "Project (optional)",
  "diagrams.scopeEnvironment": "Environment {name}",
  "diagrams.scopeProvider": "Provider {name}",
  "diagrams.scopeProject": "Project {name}",
  "diagrams.nodeWithoutData": "Node without data",
  "diagrams.notLoaded": "Diagram not loaded",
  "diagrams.edgeWithoutData": "Edge without data",
  "diagrams.layoutSaved": "Layout saved.",
  "diagrams.newNamePrompt": "Name of the new diagram",
  "diagrams.copyName": "{name} copy",
  "diagrams.deleteConfirm": 'Delete the diagram "{name}"?',
  "diagrams.environmentCount": "{count} environments",
  "diagrams.serverCount": "{count} servers",
  "diagrams.applicationCount": "{count} applications",
  "diagrams.proxyConnectionCount": "{count} proxy connections",
  "diagrams.routeCount": "{count} routes",
  "diagrams.deleteNodeConfirm": "Delete node {type} #{id}?",
  "diagrams.noDefault":
    "No default diagram. Create one to use the global view.",
  "diagrams.createGlobal": "Create global view",
  "diagrams.notFound": "Diagram not found. Back to the list.",
  "diagrams.list": "List",
  "diagrams.saveAs": "Save as…",
  "diagrams.exitFullscreen": "Exit",
  "diagrams.fullscreen": "Fullscreen",
  "diagrams.hideDetails": "Hide details",
  "diagrams.details": "Details",
  "diagrams.dismissAdded": "Dismiss the added-nodes notice",
  "diagrams.loading": "Loading diagram…",
  "diagrams.deleteNodeDependencies": "Delete node and dependencies",
  "diagrams.added": "Added {parts} to the diagram.",
  "diagrams.addedNodes": "Added {count} {nodes} to the diagram.",
  "diagrams.node": "node",
  "diagrams.nodes": "nodes",
  "diagrams.newServer": "new server",
  "diagrams.newServers": "new servers",
  "diagrams.newApplication": "new application",
  "diagrams.newApplications": "new applications",
  "diagrams.partsJoin": " and ",

  // OpenAPI parsing
  "openapi.empty": "Paste an OpenAPI or Swagger document.",
  "openapi.unreadable": "Document not readable: {reason}.",
  "openapi.invalidSyntax": "invalid syntax",
  "openapi.noRoot": "The document does not contain a root object.",
  "openapi.unknownFormat":
    "Unrecognized format: expected an OpenAPI 3.x or Swagger 2.0 document.",
  "openapi.noPaths": "The document does not contain paths.",
  "openapi.noOperations": "No operations found in the document.",
};

const dictionaries: Record<Language, Record<TranslationKey, string>> = {
  it,
  en,
};

const locales: Record<Language, string> = {
  it: "it-IT",
  en: "en-GB",
};

let currentLanguage: Language = "it";

export function getLanguage(): Language {
  return currentLanguage;
}

export function localeFor(language: Language = currentLanguage): string {
  return locales[language];
}

/** Translate a key with `{name}` placeholders. */
export function translate(
  language: Language,
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  const template = dictionaries[language][key] ?? it[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Translation outside React, using the currently selected language. */
export function tGlobal(
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  return translate(currentLanguage, key, params);
}

function storedLanguage(): Language {
  try {
    const value = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (value === "en" || value === "it") return value;
  } catch {
    // storage non disponibile: resta l'italiano
  }
  return "it";
}

export interface I18nValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

const fallback: I18nValue = {
  language: "it",
  setLanguage: () => {},
  t: (key, params) => translate("it", key, params),
};

export function LanguageProvider({
  children,
  initialLanguage,
}: {
  children: ReactNode;
  initialLanguage?: Language;
}) {
  const [language, setLanguageState] = useState<Language>(
    () => initialLanguage ?? storedLanguage(),
  );
  // The module-level language keeps format helpers and non-React code in sync
  // with the provider during the same render, before effects run.
  currentLanguage = language;

  useEffect(() => {
    currentLanguage = language;
    document.documentElement.lang = language;
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // storage non disponibile: la lingua resta valida per la sessione
    }
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      language,
      setLanguage,
      t: (key, params) => translate(language, key, params),
    }),
    [language, setLanguage],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Outside a provider (tests, isolated components) Italian is the default. */
export function useI18n(): I18nValue {
  return useContext(I18nContext) ?? fallback;
}

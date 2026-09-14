// ==========================================
// FUNZIONE DISCLAIMER (Da mettere in cima)
// ==========================================
function checkFirstVisitDisclaimer() {
    if (!localStorage.getItem('biliardino_disclaimer_accepted')) {
        const modalContainer = document.getElementById('modal-container');
        const modalContent = document.getElementById('modal-content');
        
        modalContent.innerHTML = `
            <div class="modal-header">
                <h3 class="modal-title text-amber-600 flex items-center gap-2">
                    <i data-lucide="alert-triangle" class="w-6 h-6"></i> Avviso Importante
                </h3>
            </div>
            <div class="modal-body text-slate-700 space-y-4">
                <p>Benvenuto in <strong>Biliardino Tornei</strong>!</p>
                <p>Questo software è fornito "così com'è", gratuitamente. I dati dei tornei e dei giocatori vengono salvati <strong>esclusivamente nella memoria di questo browser</strong>.</p>
                <div class="bg-red-50 text-red-800 p-3 rounded border border-red-200 text-sm">
                    <strong>Attenzione:</strong> L'autore del software non si assume alcuna responsabilità per l'eventuale perdita di dati, malfunzionamenti o cancellazioni accidentali.
                </div>
                <p class="text-sm">Ti raccomandiamo vivamente di utilizzare i tasti <strong>Esporta JSON</strong> per creare copie di sicurezza frequenti dei tuoi tornei.</p>
            </div>
            <div class="modal-footer">
                <button id="accept-disclaimer-btn" class="btn btn-primary w-full">Ho capito e accetto</button>
            </div>
        `;
        
        modalContainer.classList.add('active');
        if (typeof lucide !== 'undefined') lucide.createIcons();
        
        document.getElementById('accept-disclaimer-btn').addEventListener('click', () => {
            localStorage.setItem('biliardino_disclaimer_accepted', 'true');
            modalContainer.classList.remove('active');
        });
    }
}

// ==========================================
// AVVIO DELL'APP
// ==========================================
window.onload = () => {
    lucide.createIcons();
};

document.addEventListener('DOMContentLoaded', () => {
    
    // FA PARTIRE IL CONTROLLO APPENA SI CARICA LA PAGINA!
    checkFirstVisitDisclaimer();
    
    // ==========================================
    // 1. STATO DEL DATABASE (DB)
    // ==========================================
    let db = {
        players: [],
        schedule: [],
        history: [],
        historyIndex: -1,
        settings: {
            pointsWin: 3,
            pointsWinNarrow: 2,   // Punti Vittoria di Misura
            pointsDraw: 1,
            pointsLossNarrow: 1,  // Punti Sconfitta di Misura
            pointsLoss: 0,
            scoreTarget: 7,
            playoffScoreTarget: 9,
            rounds: 6,
            tablesCount: 2,       // Numero di Biliardini
            
            // NUOVE IMPOSTAZIONI PLAYOFF
            teamFormationMode: 'balanced-random',
            playoffSize: 8,       // Quante squadre vanno al tabellone principale (4, 8, 16)
            playoffThirdPlaceEnabled: true,   // Finalina 3/4 posto
            playoffFifthPlaceEnabled: false,  // Tabellone 5/8 posto (perdenti dei quarti)
            playoffSilverEnabled: false,      // Tabellone Silver (dal 9° posto in poi)
            playoffPlayoutEnabled: true       // Playout per gli ultimi
        },
        playoffs: {
            mainBracket: null,
            thirdPlaceBracket: null,
            fifthPlaceBracket: null,
            silverBracket: null,  // NUOVO TABELLONE SILVER
            playoutBracket: null,
            teams: {},
            matchResults: {},
            tiebreak: null,
            excludedPlayoutTeam: null
        }
    };

    let roundCollapseOverrides = {};

    // Riferimenti DOM
    const contentView = document.getElementById('content-view');
    const viewTitle = document.getElementById('view-title');
    const alertContainer = document.getElementById('alert-container');
    const saveStatus = document.getElementById('save-status');
    const modalContainer = document.getElementById('modal-container');
    const modalContent = document.getElementById('modal-content');
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    const printSectionBtn = document.getElementById('print-section-btn');
    const importJsonFile = document.getElementById('import-json-file');

    // ==========================================
    // 2. GESTIONE STORIA (UNDO/REDO)
    // ==========================================
    const MAX_HISTORY_STEPS = 25;

    const saveHistory = () => {
        db.history = db.history.slice(0, db.historyIndex + 1);
        db.history.push(JSON.stringify({
            players: db.players,
            schedule: db.schedule,
            settings: db.settings,
            playoffs: db.playoffs
        }));
        if (db.history.length > MAX_HISTORY_STEPS) {
            db.history.shift();
        }
        db.historyIndex = db.history.length - 1;
        updateHistoryButtons();
    };

    const loadState = (stateJson) => {
        const state = JSON.parse(stateJson);
        db.players = state.players;
        db.schedule = state.schedule;
        db.settings = state.settings;
        db.playoffs = state.playoffs || { qualificationBracket: null, directTeam: null, directTeams: [], mainBracket: null, thirdPlaceBracket: null, fifthPlaceBracket: null, playoutBracket: null, teams: {}, matchResults: {}, tiebreak: null };
        reloadFullUI();
    };

    const updateHistoryButtons = () => {
        if (undoBtn) undoBtn.disabled = db.historyIndex <= 0;
        if (redoBtn) redoBtn.disabled = db.historyIndex >= db.history.length - 1;
    };

    undoBtn?.addEventListener('click', () => {
        if (db.historyIndex > 0) {
            db.historyIndex--;
            loadState(db.history[db.historyIndex]);
            ui.showAlert('Azione annullata.', 'info');
        }
    });

    redoBtn?.addEventListener('click', () => {
        if (db.historyIndex < db.history.length - 1) {
            db.historyIndex++;
            loadState(db.history[db.historyIndex]);
            ui.showAlert('Azione ripristinata.', 'info');
        }
    });

    // ==========================================
    // 3. UTILITY (MATEMATICA, CLASSIFICA E SICUREZZA)
    // ==========================================
    const utils = {
        // SICUREZZA: Previene attacchi XSS base e limita la lunghezza
        sanitizeString: (str) => {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/[<>]/g, '') // Rimuove tag HTML
                .trim()
                .substring(0, 50); // Previene stringhe maligne troppo lunghe
        },
        escapeHtml: (str) => {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        },
        generateId: () => '_' + Math.random().toString(36).substr(2, 9),
        getPlayersByRole: (role) => db.players.filter(p => p.role === role),
        getPlayerById: (id) => db.players.find(p => p.id === id),
        shuffleArray: (array) => {
            let currentIndex = array.length, randomIndex;
            while (currentIndex !== 0) {
                randomIndex = Math.floor(Math.random() * currentIndex);
                currentIndex--;
                [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
            }
            return array;
        },
        getStandings: () => {
            const standings = db.players.map(p => ({
                ...p, G: 0, V: 0, N: 0, P: 0, GF: 0, GS: 0, Pts: 0, Diff: 0
            }));

            db.schedule.filter(m => m.played).forEach(m => {
                const updateStats = (pId, stats) => {
                    const s = standings.find(x => x.id === pId);
                    if (s) {
                        s.G++; s.V += stats.V; s.N += stats.N; s.P += stats.P;
                        s.GF += stats.GF; s.GS += stats.GS; s.Pts += stats.Pts;
                        s.Diff = s.GF - s.GS;
                    }
                };

                const score1 = m.score1;
                const score2 = m.score2;
                const diff = Math.abs(score1 - score2);
                let pts1 = 0, pts2 = 0;
                
                if (score1 > score2) {
                    pts1 = (diff === 1) ? (db.settings.pointsWinNarrow ?? 2) : db.settings.pointsWin;
                    pts2 = (diff === 1) ? (db.settings.pointsLossNarrow ?? 1) : db.settings.pointsLoss;
                } else if (score2 > score1) {
                    pts2 = (diff === 1) ? (db.settings.pointsWinNarrow ?? 2) : db.settings.pointsWin;
                    pts1 = (diff === 1) ? (db.settings.pointsLossNarrow ?? 1) : db.settings.pointsLoss;
                } else {
                    pts1 = pts2 = db.settings.pointsDraw;
                }

                const team1Stats = { V: score1>score2?1:0, N: score1===score2?1:0, P: score1<score2?1:0, GF: score1, GS: score2, Pts: pts1 };
                const team2Stats = { V: score2>score1?1:0, N: score1===score2?1:0, P: score2<score1?1:0, GF: score2, GS: score1, Pts: pts2 };

                updateStats(m.team1.p, team1Stats); 
                updateStats(m.team1.a, team1Stats);
                updateStats(m.team2.p, team2Stats); 
                updateStats(m.team2.a, team2Stats);
            });

            return standings.sort((a, b) => b.Pts - a.Pts || b.Diff - a.Diff || b.GF - a.GF);
        },
        getPlayerStrengths: () => Object.fromEntries(utils.getStandings().map(player => [player.id, player.Pts])),
        getPlayerGameCounts: () => {
            let counts = {};
            db.players.forEach(p => counts[p.id] = 0);
            db.schedule.forEach(m => {
                if (m.team1) { counts[m.team1.p]++; counts[m.team1.a]++; }
                if (m.team2) { counts[m.team2.p]++; counts[m.team2.a]++; }
            });
            return counts;
        },
        getOccupiedPlayerIds: () => {
            const occupied = new Set();
            db.schedule.forEach(m => {
                if (m.inProgress && !m.played) {
                    occupied.add(m.team1.p); occupied.add(m.team1.a);
                    occupied.add(m.team2.p); occupied.add(m.team2.a);
                }
            });
            return occupied;
        },
        getAvailableMatches: () => {
            const occupied = utils.getOccupiedPlayerIds();
            return db.schedule
                .filter(m => !m.played && !m.inProgress)
                .filter(m => ![m.team1.p, m.team1.a, m.team2.p, m.team2.a].some(id => occupied.has(id)))
                .sort((a, b) => a.round - b.round);
        }
    };

    // ==========================================
    // 4. INTERFACCIA UTENTE (UI & MODALI)
    // ==========================================
    const ui = {
        currentView: 'dashboard',
        viewLabels: { 
            dashboard: 'Dashboard', 
            players: 'Giocatori', 
            schedule: 'Calendario', 
            standings: 'Classifica', 
            playoffs: 'Playoffs', 
            settings: 'Impostazioni' 
        },
        showAlert: (message, type = 'info') => {
            const alert = document.createElement('div');
            alert.className = `alert alert-${type} mb-3 flex items-center justify-between`;
            const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'x-circle' : type === 'warning' ? 'alert-triangle' : 'info';
            alert.innerHTML = `
                <div class="flex items-center">
                    <i data-lucide="${icon}" class="w-5 h-5 mr-3 flex-shrink-0"></i>
                    <span>${message}</span>
                </div>
                <button class="text-current opacity-70 hover:opacity-100" onclick="this.parentElement.remove()">
                     <i data-lucide="x" class="w-4 h-4"></i>
                </button>`;
            alertContainer.appendChild(alert);
            lucide.createIcons();
            setTimeout(() => { if (alert.parentNode) alert.remove(); }, 5000);
        },
        showModal: (title, body, footer = '') => {
            modalContent.innerHTML = `
                <div class="modal-header">
                    <h3 class="modal-title font-bold text-lg">${title}</h3>
                    <button id="modal-close-btn" class="text-slate-400 hover:text-slate-600"><i data-lucide="x"></i></button>
                </div>
                <div class="modal-body">${body}</div>
                ${footer ? `<div class="modal-footer">${footer}</div>` : ''}`;
            lucide.createIcons();
            modalContainer.classList.add('active');
            document.getElementById('modal-close-btn').addEventListener('click', ui.hideModal);
        },
        hideModal: () => {
            modalContainer.classList.remove('active');
            modalContent.innerHTML = '';
        },
        showConfirmModal: (title, body) => {
            return new Promise((resolve) => {
                const footer = `
                    <button class="btn btn-secondary" id="modal-cancel-confirm">Annulla</button>
                    <button class="btn btn-primary" id="modal-confirm-action">Continua</button>
                `;
                ui.showModal(title, body, footer);
                
                const cleanup = (val) => { ui.hideModal(); resolve(val); };
                document.getElementById('modal-close-btn').addEventListener('click', () => cleanup(false));
                document.getElementById('modal-cancel-confirm').addEventListener('click', () => cleanup(false));
                document.getElementById('modal-confirm-action').addEventListener('click', () => cleanup(true));
            });
        },
        navigateTo: (view) => {
            ui.currentView = view;
            viewTitle.textContent = ui.viewLabels[view] || view;
            document.querySelectorAll('.nav-link').forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('data-view') === view) link.classList.add('active');
            });
            contentView.innerHTML = '';
            switch (view) {
                case 'dashboard': views.renderDashboard(); break;
                case 'players': views.renderPlayers(); break;
                case 'schedule': views.renderSchedule(); break;
                case 'standings': views.renderStandings(); break;
                case 'playoffs': views.renderPlayoffs(); break;
                case 'settings': views.renderSettings(); break;
            }
        }
    };

    // ==========================================
    // 5. MOTORE LOGICO (LOGIC)
    // ==========================================
    const logic = {
        player: {
            add: (name, role) => {
                const safeName = utils.sanitizeString(name); // Sanitizzazione ingresso
                if (!safeName || !role) { ui.showAlert('Nome e Ruolo sono obbligatori.', 'error'); return; }
                if (db.players.some(p => p.name.toLowerCase() === safeName.toLowerCase())) { ui.showAlert('Giocatore già esistente.', 'error'); return; }
                saveHistory();
                db.players.push({ id: utils.generateId(), name: safeName, role: role });
                ui.showAlert(`Giocatore aggiunto.`, 'success');
                views.renderPlayers();
            },
            addBulk: (rawNames, role) => {
                if (!role) { ui.showAlert('Seleziona un ruolo', 'error'); return; }
                const names = rawNames.split('\n')
                                      .map(n => utils.sanitizeString(n)) // Sanitizzazione lista
                                      .filter(n => n.length > 0);
                if (names.length === 0) { ui.showAlert('Nessun nome valido inserito.', 'error'); return; }
                
                saveHistory();
                let added = 0, skipped = 0;
                names.forEach(n => {
                    if (db.players.some(p => p.name.toLowerCase() === n.toLowerCase())) skipped++;
                    else { db.players.push({ id: utils.generateId(), name: n, role: role }); added++; }
                });
                views.renderPlayers();
                ui.showAlert(`Aggiunti: ${added}. Saltati (già esistenti): ${skipped}`, added > 0 ? 'success' : 'warning');
            },
            remove: (id) => {
                saveHistory();
                db.players = db.players.filter(p => p.id !== id);
                db.schedule = db.schedule.filter(m => !( (m.team1 && (m.team1.p === id || m.team1.a === id)) || (m.team2 && (m.team2.p === id || m.team2.a === id)) ));
                reloadFullUI();
                ui.showAlert('Giocatore rimosso e calendario aggiornato.', 'warning');
            },
            updateName: (id, newName) => {
                const safeName = utils.sanitizeString(newName); // Sanitizzazione
                if (!safeName) { ui.showAlert('Il nome non può essere vuoto o non valido.', 'error'); return false; }
                if (db.players.filter(p => p.id !== id).some(p => p.name.toLowerCase() === safeName.toLowerCase())) { ui.showAlert('Nome già in uso.', 'error'); return false; }
                saveHistory();
                const player = utils.getPlayerById(id);
                if (player) { player.name = safeName; ui.showAlert(`Nome aggiornato in ${safeName}.`, 'success'); reloadFullUI(); return true; }
                return false;
            }
        },

        schedule: {
            generate: async () => {
                const hasExistingSavedProgress = db.schedule.some(match => match.played || match.inProgress || match.score1 !== null || match.score2 !== null);
                if (hasExistingSavedProgress) {
                    ui.showAlert('Il calendario contiene già risultati o partite in corso. Premi "Resetta" prima di generare un nuovo calendario per non perdere i dati esistenti.', 'warning');
                    return;
                }

                const P = utils.getPlayersByRole('Portiere');
                const A = utils.getPlayersByRole('Attaccante');
                
                if (P.length < 2 || A.length < 2) {
                    ui.showAlert('Servono almeno 2 Portieri e 2 Attaccanti.', 'error');
                    return;
                }
                
                if (P.length !== A.length) {
                    const message = `
                        <p>Attenzione! Il numero di giocatori non è bilanciato.</p>
                        <p class="mt-4 font-semibold text-red-600">Per far giocare tutti al meglio, il gruppo più numeroso riposerà a rotazione.</p>
                        <p class="mt-2">Vuoi continuare la generazione?</p>
                    `;
                    const confirmed = await ui.showConfirmModal('Squilibrio Giocatori', message);
                    if (!confirmed) return;
                }

                ui.showAlert('Calcolo in corso (ricerca combinazioni + ottimizzazione)...', 'info');
                
                setTimeout(() => logic.schedule.runZeroTolerance(P, A), 50);
            },

            runZeroTolerance: (P, A) => {
                const targetGames = db.settings.rounds;
                const MAX_RETRIES = 2000; 
                
                let bestSchedule = null;
                let bestScore = Infinity;
                let bestReds = Infinity;

                for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
                    const result = logic.schedule.generateCandidate(P, A, targetGames);
                    const reds = result.redConflicts;
                    const yellows = result.yellowConflicts; 
                    
                    const score = (reds * 10000) + yellows;

                    if (score < bestScore) {
                        bestScore = score;
                        bestReds = reds;
                        bestSchedule = result.schedule;
                        
                        if (score === 0) break; 
                    }
                }

                if (bestSchedule) {
                    bestSchedule = logic.schedule.optimizeYellows(bestSchedule);
                    
                    saveHistory();
                    db.schedule = bestSchedule;
                    views.renderSchedule();
                    
                    const finalYellows = logic.schedule.calculateYellows(bestSchedule);
                    
                    if (bestReds === 0 && finalYellows === 0) {
                        ui.showAlert(`Perfezione Assoluta! 0 Coppie, 0 Avversari ripetuti.`, 'success');
                    } else if (bestReds === 0) {
                        ui.showAlert(`Ottimo! 0 Coppie. Avversari ripetuti ridotti a ${finalYellows}.`, 'success');
                    } else {
                        ui.showAlert(`Miglior compromesso trovato: ${bestReds} Coppie e ${finalYellows} Avversari ripetuti.`, 'warning');
                    }
                }
            },

            generateCandidate: (P, A, targetGames) => {
                let schedule = [];
                let pairHistory = new Set();
                let opponentHistory = new Set(); 
                const playerStrengths = utils.getPlayerStrengths();
                const formationMode = db.settings.teamFormationMode || 'balanced-random';
                let reds = 0;
                let yellows = 0;
                let matchCounts = {};
                
                [...P, ...A].forEach(p => matchCounts[p.id] = 0);

                for (let round = 1; round <= targetGames; round++) {
                    
                    const getShuffledByCount = (players) => {
                        let groups = {};
                        players.forEach(p => {
                            let c = matchCounts[p.id];
                            if(!groups[c]) groups[c] = [];
                            groups[c].push(p);
                        });
                        let sortedKeys = Object.keys(groups).sort((a,b) => a - b);
                        let result = [];
                        sortedKeys.forEach(k => {
                            result.push(...utils.shuffleArray(groups[k]));
                        });
                        return result;
                    };

                    let availableP = getShuffledByCount(P);
                    let availableA = getShuffledByCount(A);

                    let maxTeams = Math.min(availableP.length, availableA.length);
                    if (maxTeams % 2 !== 0) maxTeams--; 
                    if (maxTeams < 2) break;

                    let roundP = availableP.slice(0, maxTeams);
                    let roundA = availableA.slice(0, maxTeams);
                    
                    let bestPermutation = null;
                    let minRoundReds = Infinity;
                    let bestPermutationScore = Infinity;

                    for(let i = 0; i < 200; i++) {
                        utils.shuffleArray(roundA); 
                        let currentReds = 0;
                        let balanceScore = 0;
                        for(let j = 0; j < maxTeams; j++) {
                            if(pairHistory.has(`${roundP[j].id}_${roundA[j].id}`)) currentReds++;
                            if (formationMode !== 'random') {
                                balanceScore += Math.abs((playerStrengths[roundP[j].id] || 0) - (playerStrengths[roundA[j].id] || 0));
                            }
                        }
                        const permutationScore = currentReds * 10000 + (formationMode !== 'random' ? balanceScore * (formationMode === 'max-balance' ? 10 : 1) : 0);
                        const currentBestScore = minRoundReds * 10000 + (formationMode !== 'random' ? bestPermutationScore : 0);
                        if (permutationScore < currentBestScore || bestPermutation === null) {
                            minRoundReds = currentReds;
                            bestPermutationScore = balanceScore * (formationMode === 'max-balance' ? 10 : 1);
                            bestPermutation = [...roundA];
                            if (minRoundReds === 0 && (formationMode === 'random' || formationMode !== 'max-balance')) break;
                        }
                    }

                    reds += minRoundReds;
                    roundA = bestPermutation;

                    let roundPairs = [];
                    for(let j = 0; j < maxTeams; j++) {
                        roundPairs.push({ p: roundP[j].id, a: roundA[j].id });
                        pairHistory.add(`${roundP[j].id}_${roundA[j].id}`);
                        matchCounts[roundP[j].id]++;
                        matchCounts[roundA[j].id]++;
                    }

                    let availablePairs = [...roundPairs];
                    while (availablePairs.length >= 2) {
                        const t1 = availablePairs.shift(); 
                        let bestT2Index = 0;
                        let minOppRepeats = Infinity;

                        for(let j = 0; j < availablePairs.length; j++) {
                            const t2 = availablePairs[j];
                            let repeats = 0;
                            const p1 = [t1.p, t1.a];
                            const p2 = [t2.p, t2.a];
                            
                            for(let id1 of p1) {
                                for(let id2 of p2) {
                                    const k = [id1, id2].sort().join('_');
                                    if (opponentHistory.has(k)) repeats++;
                                }
                            }
                            
                            if (repeats < minOppRepeats) {
                                minOppRepeats = repeats;
                                bestT2Index = j;
                                if (minOppRepeats === 0) break; 
                            }
                        }

                        const t2 = availablePairs.splice(bestT2Index, 1)[0];
                        yellows += minOppRepeats;

                        const p1 = [t1.p, t1.a];
                        const p2 = [t2.p, t2.a];
                        for(let id1 of p1) {
                            for(let id2 of p2) {
                                const k = [id1, id2].sort().join('_');
                                opponentHistory.add(k);
                            }
                        }

                        schedule.push({ 
                            id: utils.generateId(), 
                            round: round, 
                            team1: t1, 
                            team2: t2, 
                            score1: null, 
                            score2: null, 
                            played: false,
                            inProgress: false
                        });
                    }
                }
                
                return { schedule, redConflicts: reds, yellowConflicts: yellows };
            },

            calculateYellows: (schedule) => {
                let c = 0;
                const hist = new Set();
                for(let m of schedule) {
                    const ids = [[m.team1.p, m.team2.p], [m.team1.p, m.team2.a], [m.team1.a, m.team2.p], [m.team1.a, m.team2.a]];
                    for(let pair of ids) {
                        const k = pair.sort().join('_');
                        if(hist.has(k)) c++; else hist.add(k);
                    }
                }
                return c;
            },

            optimizeYellows: (schedule) => {
                let current = JSON.parse(JSON.stringify(schedule));
                let currentY = logic.schedule.calculateYellows(current);
                const rounds = [...new Set(current.map(m=>m.round))];
                
                for(let i=0; i<20000; i++) { 
                    if(currentY === 0) break;
                    const r = rounds[Math.floor(Math.random()*rounds.length)];
                    const matches = current.filter(m=>m.round===r);
                    if(matches.length < 2) continue;
                    
                    const idx1 = Math.floor(Math.random()*matches.length);
                    let idx2 = Math.floor(Math.random()*matches.length);
                    while(idx1===idx2) idx2 = Math.floor(Math.random()*matches.length);
                    
                    const m1 = matches[idx1];
                    const m2 = matches[idx2];
                    
                    const t2_1 = m1.team2;
                    const t2_2 = m2.team2;
                    
                    m1.team2 = t2_2;
                    m2.team2 = t2_1;
                    
                    const newY = logic.schedule.calculateYellows(current);
                    
                    if(newY < currentY) {
                        currentY = newY; 
                    } else if (newY === currentY && Math.random() < 0.1) {
                        currentY = newY;
                    } else { 
                        m1.team2 = t2_1; 
                        m2.team2 = t2_2; 
                    }
                }
                return current;
            },

            autoSaveResult: (id, score1, score2) => {
                if (score1 === '' && score2 === '') return;
                
                const s1 = score1 !== '' ? parseInt(score1) : null;
                const s2 = score2 !== '' ? parseInt(score2) : null;

                if ((s1 !== null && s1 < 0) || (s2 !== null && s2 < 0)) {
                    ui.showAlert('Il punteggio non può essere negativo.', 'error');
                    return;
                }
                
                const match = db.schedule.find(m => m.id === id);
                if (match && (match.score1 !== s1 || match.score2 !== s2)) {
                    saveHistory();
                    match.score1 = s1;
                    match.score2 = s2;
                    match.played = (s1 !== null && s2 !== null);
                    if (match.played) match.inProgress = false;

                    if (match.played) {
                        const target = db.settings.scoreTarget;
                        if (s1 !== target && s2 !== target) {
                            ui.showAlert(`Attenzione: nessuna squadra ha raggiunto il gol target (${target}). Risultato salvato comunque.`, 'warning');
                        }
                    }

                    flushStateToStorage();
                }
            },

            setInProgress: (id, value) => {
                const match = db.schedule.find(m => m.id === id);
                if (!match) return;
                if (match.played) { ui.showAlert('Questa partita è già stata giocata.', 'warning'); return; }
                match.inProgress = value;
                reloadFullUI();
                ui.showAlert(value ? 'Partita segnata come "in gioco".' : 'Partita rimossa da "in gioco".', 'info');
            },

            reset: () => {
                saveHistory();
                db.schedule = [];
                reloadFullUI();
                ui.showAlert('Calendario resettato.', 'warning');
            }
        },

        playoffs: {
            participantName: (participant) => {
                if (!participant || participant === 'TBD' || participant === 'BYE') return participant;
                if (typeof participant === 'object') return utils.escapeHtml(participant.name);
                const player = utils.getPlayerById(participant);
                return player ? utils.escapeHtml(player.name) : utils.escapeHtml(participant);
            },
            participantKey: (participant) => participant && typeof participant === 'object' ? participant.id : participant,
            sameParticipant: (first, second) => logic.playoffs.participantKey(first) === logic.playoffs.participantKey(second),
            getMatchWinner: (match) => {
                const savedWinner = db.playoffs.matchResults[match.id];
                if (savedWinner) return savedWinner;
                const score1 = Number(match.score1);
                const score2 = Number(match.score2);
                if (Number.isFinite(score1) && Number.isFinite(score2) && score1 !== score2) {
                    return score1 > score2 ? match.team1 : match.team2;
                }
                return null;
            },
            remixWinnersForNextRound: (bracket, completedRound) => {
                if (!bracket || !completedRound || !completedRound.nextRound) return;
                const winners = completedRound.matches.map(match => logic.playoffs.getMatchWinner(match));
                if (winners.some(winner => !winner)) return;

                const players = winners.flatMap(team => {
                    const storedTeam = typeof team === 'object' ? team : db.playoffs.teams[team];
                    return storedTeam?.players || [];
                });
                const goalkeepers = players.map(id => utils.getPlayerById(id)).filter(player => player?.role === 'Portiere');
                const attackers = players.map(id => utils.getPlayerById(id)).filter(player => player?.role === 'Attaccante');
                if (goalkeepers.length !== attackers.length || goalkeepers.length < 2) return;

                const forbiddenPairs = new Set();
                completedRound.matches.forEach(match => {
                    [match.team1, match.team2].forEach(teamRef => {
                        const team = typeof teamRef === 'object' ? teamRef : db.playoffs.teams[teamRef];
                        if (team?.players && team.players.length === 2) {
                            forbiddenPairs.add(`${team.players[0]}_${team.players[1]}`);
                            forbiddenPairs.add(`${team.players[1]}_${team.players[0]}`);
                        }
                    });
                });

                const remixedTeams = logic.playoffs.createBalancedTeams(goalkeepers, attackers, forbiddenPairs);
                completedRound.nextRound.matches.forEach((match, index) => {
                    match.team1 = remixedTeams[index * 2] || 'TBD';
                    match.team2 = remixedTeams[index * 2 + 1] || 'TBD';
                    match.score1 = null;
                    match.score2 = null;
                });
            },
            syncBracketProgress: (bracket) => {
                let currentRound = bracket;
                while (currentRound?.nextRound) {
                    const nextRound = currentRound.nextRound;
                    const allCompleted = currentRound.matches.every(match => logic.playoffs.getMatchWinner(match));
                    if (allCompleted) {
                        const needsSync = nextRound.matches.some(match => match.team1 === 'TBD' || match.team2 === 'TBD');
                        const isUnplayed = nextRound.matches.every(match => match.score1 === null && match.score2 === null);
                        let hasForbiddenRepeat = false;
                        
                        if (isUnplayed) {
                            const prevPairs = new Set();
                            currentRound.matches.forEach(m => {
                                const w = logic.playoffs.getMatchWinner(m);
                                const t = typeof w === 'object' ? w : db.playoffs.teams[w];
                                if (t?.players && t.players.length === 2) {
                                    prevPairs.add(`${t.players[0]}_${t.players[1]}`);
                                    prevPairs.add(`${t.players[1]}_${t.players[0]}`);
                                }
                            });
                            nextRound.matches.forEach(m => {
                                [m.team1, m.team2].forEach(tr => {
                                    const t = typeof tr === 'object' ? tr : db.playoffs.teams[tr];
                                    if (t?.players && t.players.length === 2) {
                                        if (prevPairs.has(`${t.players[0]}_${t.players[1]}`)) hasForbiddenRepeat = true;
                                    }
                                });
                            });
                        }

                        if (needsSync || hasForbiddenRepeat) {
                            logic.playoffs.remixWinnersForNextRound(bracket, currentRound);
                        }
                    }
                    currentRound = nextRound;
                }
            },
            remixTeams: (teams) => {
                const forbiddenPairs = new Set();
                teams.forEach(teamRef => {
                    const team = typeof teamRef === 'object' ? teamRef : db.playoffs.teams[teamRef];
                    if (team?.players && team.players.length === 2) {
                        forbiddenPairs.add(`${team.players[0]}_${team.players[1]}`);
                        forbiddenPairs.add(`${team.players[1]}_${team.players[0]}`);
                    }
                });
                const players = teams.flatMap(team => {
                    const storedTeam = typeof team === 'object' ? team : db.playoffs.teams[team];
                    return storedTeam?.players || [];
                });
                const goalkeepers = players.map(id => utils.getPlayerById(id)).filter(player => player?.role === 'Portiere');
                const attackers = players.map(id => utils.getPlayerById(id)).filter(player => player?.role === 'Attaccante');
                return goalkeepers.length === attackers.length && goalkeepers.length >= 2
                    ? logic.playoffs.createBalancedTeams(goalkeepers, attackers, forbiddenPairs)
                    : teams;
            },
            createBalancedTeams: (goalkeepers, attackers, forbiddenPairs = new Set()) => {
                db.playoffs.teams = db.playoffs.teams || {};
                const count = Math.min(goalkeepers.length, attackers.length);
                if (count === 0) return [];

                const mode = db.settings.teamFormationMode || 'balanced-random';
                const playerStrengths = utils.getPlayerStrengths();
                const candidates = [];
                const attempts = mode === 'max-balance' ? 1000 : 250;

                for (let attempt = 0; attempt < attempts; attempt++) {
                    const shuffledGoalkeepers = utils.shuffleArray([...goalkeepers]);
                    const shuffledAttackers = utils.shuffleArray([...attackers]);
                    const candidate = [];
                    let forbiddenCount = 0;

                    for (let index = 0; index < count; index++) {
                        const goalkeeper = shuffledGoalkeepers[index];
                        const attacker = shuffledAttackers[index];
                        if (forbiddenPairs.has(`${goalkeeper.id}_${attacker.id}`) || forbiddenPairs.has(`${attacker.id}_${goalkeeper.id}`)) {
                            forbiddenCount++;
                        }
                        const gPts = Number.isFinite(goalkeeper?.Pts) ? goalkeeper.Pts : (playerStrengths[goalkeeper?.id] || 0);
                        const aPts = Number.isFinite(attacker?.Pts) ? attacker.Pts : (playerStrengths[attacker?.id] || 0);
                        const strength = gPts + aPts;
                        candidate.push({ goalkeeper, attacker, strength });
                    }

                    const strengths = candidate.map(team => team.strength);
                    const average = strengths.length > 0 ? (strengths.reduce((sum, strength) => sum + strength, 0) / strengths.length) : 0;
                    const balanceScore = strengths.reduce((sum, strength) => sum + Math.abs(strength - average), 0);
                    candidates.push({ candidate, balanceScore, forbiddenCount });
                }

                candidates.sort((a, b) => a.forbiddenCount - b.forbiddenCount || a.balanceScore - b.balanceScore);
                const minForbidden = candidates[0]?.forbiddenCount || 0;
                const eligible = candidates.filter(item => item.forbiddenCount === minForbidden);

                let selectedCandidate;
                if (mode === 'random') {
                    selectedCandidate = eligible[Math.floor(Math.random() * eligible.length)]?.candidate;
                } else {
                    const bestScore = eligible[0]?.balanceScore || 0;
                    const tolerance = Math.max(4, bestScore * 0.5);
                    const acceptable = eligible.filter(item => item.balanceScore <= bestScore + tolerance);
                    const pool = acceptable.length > 1 ? acceptable : eligible.slice(0, Math.min(10, eligible.length));
                    selectedCandidate = pool[Math.floor(Math.random() * pool.length)]?.candidate;
                }

                const selected = selectedCandidate || eligible[0]?.candidate || candidates[0]?.candidate || [];
                const teams = selected.map(({ goalkeeper, attacker, strength }) => {
                    const team = {
                        id: `team-${goalkeeper.id}-${attacker.id}`,
                        name: `${goalkeeper.name} + ${attacker.name}`,
                        players: [goalkeeper.id, attacker.id],
                        strength: Number.isFinite(strength) ? strength : 0
                    };
                    db.playoffs.teams[team.id] = team;
                    return team;
                });
                return teams;
            },
            checkTiebreakNeeded: () => {
                const standings = utils.getStandings();
                const pSize = db.settings.playoffSize;
                let topN = 8;
                
                if (pSize === 'auto') {
                    const maxP = utils.getPlayersByRole('Portiere').length;
                    const maxA = utils.getPlayersByRole('Attaccante').length;
                    const pairs = Math.min(maxP, maxA);
                    
                    // Intelligenza Artificiale per il taglio automatico
                    if (pairs >= 16) topN = 16;
                    else if (pairs >= 12) topN = 12;
                    else if (pairs >= 10) topN = 10;
                    else if (pairs >= 8) topN = 8;
                    else if (pairs >= 7) topN = 7;
                    else if (pairs >= 6) topN = 6;
                    else topN = 4;
                } else {
                    topN = parseInt(pSize) || 8;
                }
                
                if (standings.length <= topN) return null;

                const cutoffPlayer = standings[topN - 1];
                const nextPlayer = standings[topN];
                if (cutoffPlayer && nextPlayer && cutoffPlayer.Pts === nextPlayer.Pts && cutoffPlayer.Diff === nextPlayer.Diff) {
                    return standings.filter(p => p.Pts === cutoffPlayer.Pts && p.Diff === cutoffPlayer.Diff);
                }
                return null;
            },
            setTiebreakResult: (p1Id, p2Id, score1, score2) => {
                const s1 = parseInt(score1);
                const s2 = parseInt(score2);
                if (isNaN(s1) || isNaN(s2) || s1 < 0 || s2 < 0) {
                    ui.showAlert('Inserisci due punteggi validi.', 'error');
                    return;
                }
                if (s1 === s2) {
                    ui.showAlert('Lo spareggio non può terminare in parità: inserisci punteggi diversi.', 'error');
                    return;
                }
                saveHistory();
                db.playoffs.tiebreak = {
                    p1Id, p2Id, score1: s1, score2: s2,
                    winnerId: s1 > s2 ? p1Id : p2Id
                };
                reloadFullUI();
                ui.showAlert('Risultato spareggio registrato.', 'success');
            },
            generateBracket: () => {
                logic.playoffs.generateRoleBalancedBrackets();
            },
            generateRoleBalancedBrackets: () => {
                const unfinishedMatches = db.schedule.filter(match => !match.played);
                if (unfinishedMatches.length > 0) {
                    ui.showAlert(`Termina prima tutte le partite del calendario (${unfinishedMatches.length} rimanenti).`, 'warning');
                    return;
                }

                db.playoffs.teams = {};
                const standings = utils.getStandings();
                const goalkeepers = standings.filter(player => player.role === 'Portiere');
                const attackers = standings.filter(player => player.role === 'Attaccante');
                const totalPairs = Math.min(goalkeepers.length, attackers.length);

                // Calcolo dimensione taglio intelligente
                let pSize = db.settings.playoffSize;
                let mainSize = 8;
                if (pSize === 'auto') {
                    if (totalPairs >= 16) mainSize = 16;
                    else if (totalPairs >= 12) mainSize = 12;
                    else if (totalPairs >= 10) mainSize = 10;
                    else if (totalPairs >= 8) mainSize = 8;
                    else if (totalPairs >= 7) mainSize = 7;
                    else if (totalPairs >= 6) mainSize = 6;
                    else mainSize = 4;
                } else {
                    mainSize = parseInt(pSize) || 8;
                }

                if (goalkeepers.length < mainSize || attackers.length < mainSize) {
                    ui.showAlert(`Servono almeno ${mainSize} portieri e ${mainSize} attaccanti per creare questo tabellone. Cambia le impostazioni.`, 'error');
                    return;
                }

                saveHistory();
                
                // --- TABELLONE PRINCIPALE ---
                const mainP = goalkeepers.slice(0, mainSize);
                const mainA = attackers.slice(0, mainSize);
                const mainTeams = mainP.map((goalkeeper, index) => {
                    const attacker = mainA[index];
                    const team = {
                        id: `team-${goalkeeper.id}-${attacker.id}`,
                        name: `${goalkeeper.name} + ${attacker.name}`,
                        players: [goalkeeper.id, attacker.id],
                        strength: (Number.isFinite(goalkeeper?.Pts) ? goalkeeper.Pts : 0) + (Number.isFinite(attacker?.Pts) ? attacker.Pts : 0)
                    };
                    db.playoffs.teams[team.id] = team;
                    return team;
                });

                db.playoffs.matchResults = {};
                db.playoffs.qualificationBracket = null;
                
                // MAGIA: Incroci Sportivi (Seeding) con calcolo dei Riposi (BYE)
                const T = mainTeams; // Scorciatoia per leggibilità
                let seededTeams = T;

                if (mainSize === 4) {
                    seededTeams = [T[0], T[3], T[1], T[2]];
                } else if (mainSize === 6) {
                    seededTeams = [T[0], 'BYE', T[3], T[4], T[1], 'BYE', T[2], T[5]];
                } else if (mainSize === 7) {
                    seededTeams = [T[0], 'BYE', T[3], T[4], T[1], T[6], T[2], T[5]];
                } else if (mainSize === 8) {
                    seededTeams = [T[0], T[7], T[3], T[4], T[1], T[6], T[2], T[5]];
                } else if (mainSize === 10) {
                    seededTeams = [T[0], 'BYE', T[7], T[8], T[3], 'BYE', T[4], 'BYE', T[1], 'BYE', T[6], T[9], T[2], 'BYE', T[5], 'BYE'];
                } else if (mainSize === 12) {
                    seededTeams = [T[0], 'BYE', T[7], T[8], T[3], 'BYE', T[4], T[11], T[1], 'BYE', T[6], T[9], T[2], 'BYE', T[5], T[10]];
                } else if (mainSize === 16) {
                    seededTeams = [T[0], T[15], T[7], T[8], T[3], T[12], T[4], T[11], T[1], T[14], T[6], T[9], T[2], T[13], T[5], T[10]];
                }

                db.playoffs.mainBracket = logic.playoffs.buildKnockout(seededTeams);
                
                // --- TABELLONE SILVER ---
                db.playoffs.silverBracket = null;
                const remainP = goalkeepers.slice(mainSize);
                const remainA = attackers.slice(mainSize);
                if (db.settings.playoffSilverEnabled && remainP.length >= 4) {
                    // Prendi i successivi 4, 8 o 16 per il Silver
                    let silverSize = remainP.length >= 16 ? 16 : (remainP.length >= 8 ? 8 : 4);
                    const silverTeams = logic.playoffs.createBalancedTeams(remainP.slice(0, silverSize), remainA.slice(0, silverSize));
                    db.playoffs.silverBracket = logic.playoffs.buildKnockout(silverTeams);
                }

                // --- PLAYOUT (Cucchiaio di Legno) ---
                db.playoffs.playoutBracket = null;
                db.playoffs.excludedPlayoutTeam = null;
                if (db.settings.playoffPlayoutEnabled) {
                    // Prendi gli ultimi rimasti fuori sia dal Main che dal Silver
                    const startIndex = mainSize + (db.playoffs.silverBracket ? (remainP.length >= 16 ? 16 : (remainP.length >= 8 ? 8 : 4)) : 0);
                    let playoutP = goalkeepers.slice(startIndex);
                    let playoutA = attackers.slice(startIndex);
                    
                    // Se non c'è il Silver attivato e ci sono squadre, usale per il Playout
                    if (playoutP.length >= 2) {
                        let playoutTeams = logic.playoffs.createBalancedTeams(playoutP, playoutA);
                        // Se sono dispari, escludi la migliore dal playout
                        if (playoutTeams.length % 2 !== 0 && playoutTeams.length > 2) {
                            playoutTeams.sort((a, b) => a.strength - b.strength);
                            db.playoffs.excludedPlayoutTeam = playoutTeams.pop(); // La più forte si salva
                        }
                        
                        // Per il playout cerchiamo una potenza di 2. Se abbiamo es. 6 squadre, usiamo solo le ultime 4 per il "cucchiaio di legno" vero e proprio.
                        let pSize = playoutTeams.length >= 8 ? 8 : (playoutTeams.length >= 4 ? 4 : 2);
                        // Prendiamo le PEGGIORE
                        playoutTeams.sort((a, b) => a.strength - b.strength);
                        db.playoffs.playoutBracket = logic.playoffs.buildKnockout(playoutTeams.slice(0, pSize));
                    }
                }

                db.playoffs.thirdPlaceBracket = null;
                db.playoffs.fifthPlaceBracket = null;
                
                reloadFullUI();
                ui.showAlert(`Tabelloni Playoff generati con successo!`, 'success');
            },
            buildKnockout: (playerIds) => {
                let currentRoundMatches = [];
                for (let i = 0; i < playerIds.length; i += 2) {
                    currentRoundMatches.push({
                        id: utils.generateId(),
                        team1: playerIds[i],
                        team2: playerIds[i+1] || 'BYE',
                        score1: null,
                        score2: null
                    });
                }
                
                const bracket = { round: 1, matches: currentRoundMatches, nextRound: null };
                let currentLayer = bracket;
                let roundNum = 2;
                let matchCount = currentRoundMatches.length;
                
                while (matchCount > 1) {
                    let nextMatches = [];
                    for (let i = 0; i < Math.ceil(matchCount / 2); i++) {
                        nextMatches.push({ id: utils.generateId(), team1: 'TBD', team2: 'TBD', score1: null, score2: null });
                    }
                    currentLayer.nextRound = { round: roundNum, matches: nextMatches, nextRound: null };
                    currentLayer = currentLayer.nextRound;
                    matchCount = nextMatches.length;
                    roundNum++;
                }

                logic.playoffs.autoAdvanceByes(bracket);
                return bracket;
            },
            autoAdvanceByes: (bracket) => {
                if (!bracket) return;
                bracket.matches.forEach(m => {
                    if (m.team2 === 'BYE' && m.team1 !== 'BYE') {
                        db.playoffs.matchResults[m.id] = m.team1;
                        logic.playoffs.propagateResult(bracket, m.id, m.team1);
                    } else if (m.team1 === 'BYE' && m.team2 !== 'BYE') {
                        db.playoffs.matchResults[m.id] = m.team2;
                        logic.playoffs.propagateResult(bracket, m.id, m.team2);
                    }
                });
            },
            propagateResult: (rootBracket, matchId, winnerId) => {
                const propagate = (b) => {
                    if (!b || !b.nextRound) return;
                    b.matches.forEach((m, index) => {
                        if (m.id === matchId) {
                            const nextMatchIndex = Math.floor(index / 2);
                            const isTeam1 = index % 2 === 0;
                            const nextMatch = b.nextRound.matches[nextMatchIndex];
                            if (isTeam1) nextMatch.team1 = winnerId;
                            else nextMatch.team2 = winnerId;
                        }
                    });
                    propagate(b.nextRound);
                };
                propagate(rootBracket);
            },
            tryBuildThirdPlaceBracket: () => {
                if (db.playoffs.thirdPlaceBracket || db.settings.playoffThirdPlaceEnabled === false) return;
                const mainBracket = db.playoffs.mainBracket;
                
                // Trova il turno delle semifinali
                let node = mainBracket;
                let semifinals = null;
                while (node) {
                    if (node.matches.length === 2) semifinals = node;
                    node = node.nextRound;
                }
                
                if (!semifinals || !semifinals.matches.every(match => logic.playoffs.getMatchWinner(match))) return;

                const losers = semifinals.matches.map(match => {
                    const winner = logic.playoffs.getMatchWinner(match);
                    return logic.playoffs.sameParticipant(winner, match.team1) ? match.team2 : match.team1;
                });
                db.playoffs.thirdPlaceBracket = logic.playoffs.buildKnockout(logic.playoffs.remixTeams(losers));
            },
            tryBuildFifthPlaceBracket: () => {
                if (db.playoffs.fifthPlaceBracket || !db.settings.playoffFifthPlaceEnabled) return;
                const mainBracket = db.playoffs.mainBracket;
                
                // Trova il turno dei quarti
                let node = mainBracket;
                let quarterfinals = null;
                while (node) {
                    if (node.matches.length === 4) quarterfinals = node;
                    node = node.nextRound;
                }
                
                if (!quarterfinals || !quarterfinals.matches.every(match => logic.playoffs.getMatchWinner(match))) return;

                const losers = quarterfinals.matches.map(match => {
                    const winner = logic.playoffs.getMatchWinner(match);
                    return logic.playoffs.sameParticipant(winner, match.team1) ? match.team2 : match.team1;
                });
                db.playoffs.fifthPlaceBracket = logic.playoffs.buildKnockout(logic.playoffs.remixTeams(losers));
            },
            findMatchWithLevel: (bracket, matchId) => {
                if (!bracket) return null;
                const found = bracket.matches.find(m => m.id === matchId);
                if (found) return { match: found, level: bracket };
                return logic.playoffs.findMatchWithLevel(bracket.nextRound, matchId);
            },
            findMatchInAnyBracket: (matchId) => {
                for (const key of ['mainBracket', 'silverBracket', 'thirdPlaceBracket', 'fifthPlaceBracket', 'playoutBracket']) {
                    const root = db.playoffs[key];
                    const found = logic.playoffs.findMatchWithLevel(root, matchId);
                    if (found) return { bracketKey: key, root, match: found.match, level: found.level };
                }
                return null;
            },
            updateMatchResult: (bracketKey, rootBracket, matchId, winnerId) => {
                saveHistory();
                db.playoffs.matchResults[matchId] = winnerId;
                logic.playoffs.propagateResult(rootBracket, matchId, winnerId);

                const currentRound = logic.playoffs.findMatchWithLevel(rootBracket, matchId)?.level;
                logic.playoffs.remixWinnersForNextRound(rootBracket, currentRound);
                
                if (bracketKey === 'mainBracket') {
                    logic.playoffs.tryBuildThirdPlaceBracket();
                    logic.playoffs.tryBuildFifthPlaceBracket();
                }

                reloadFullUI();
            },
            getBracketChampion: (bracket) => {
                if (!bracket) return null;
                let node = bracket;
                while (node.nextRound) node = node.nextRound;
                if (node.matches.length !== 1) return null;
                return db.playoffs.matchResults[node.matches[0].id] || null;
            },
            getFinalLoser: (bracket) => {
                if (!bracket) return null;
                let node = bracket;
                while (node.nextRound) node = node.nextRound;
                if (node.matches.length !== 1) return null;
                const m = node.matches[0];
                const winner = db.playoffs.matchResults[m.id];
                if (!winner || m.team1 === 'BYE' || m.team2 === 'BYE') return null;
                return logic.playoffs.sameParticipant(winner, m.team1) ? m.team2 : m.team1;
            },
            autoSaveScore: (matchId, score1, score2) => {
                if (score1 === '' || score2 === '') return;
                const s1 = parseInt(score1);
                const s2 = parseInt(score2);

                if (s1 < 0 || s2 < 0) {
                    ui.showAlert('Il punteggio non può essere negativo.', 'error');
                    return;
                }
                if (s1 === s2) {
                    ui.showAlert('Nelle eliminazioni dirette inserisci punteggi diversi.', 'error');
                    return;
                }

                const info = logic.playoffs.findMatchInAnyBracket(matchId);
                if (!info) return;

                info.match.score1 = s1;
                info.match.score2 = s2;
                const winnerId = s1 > s2 ? info.match.team1 : info.match.team2;
                logic.playoffs.updateMatchResult(info.bracketKey, info.root, matchId, winnerId);
            }
        },

        data: {
            resetPlayersAndTournament: () => {
                saveHistory();
                db.players = [];
                db.schedule = [];
                db.playoffs = { qualificationBracket: null, directTeam: null, directTeams: [], mainBracket: null, thirdPlaceBracket: null, fifthPlaceBracket: null, playoutBracket: null, teams: {}, matchResults: {}, tiebreak: null };
                reloadFullUI();
                ui.showAlert('Giocatori, calendario e playoff azzerati. Le impostazioni sono state mantenute.', 'warning');
            },
            resetPlayoffsOnly: () => {
                saveHistory();
                db.playoffs = {
                    qualificationBracket: null,
                    directTeam: null,
                    directTeams: [],
                    mainBracket: null,
                    thirdPlaceBracket: null,
                    fifthPlaceBracket: null,
                    playoutBracket: null,
                    teams: {},
                    matchResults: {},
                    tiebreak: null,
                    excludedPlayoutTeam: null
                };
                reloadFullUI();
                ui.showAlert('Playoff azzerati. Giocatori e calendario sono stati mantenuti.', 'warning');
            },
            saveToJSON: () => {
                const stateToExport = {
                    players: db.players,
                    schedule: db.schedule,
                    settings: db.settings,
                    playoffs: db.playoffs
                };
                const dataStr = JSON.stringify(stateToExport, null, 2);
                logic.data.downloadFile(dataStr, 'torneo_giallo_backup.json', 'application/json');
            },
            loadFromJSON: (event) => {
                const file = event.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const importedDB = JSON.parse(e.target.result);
                        if (!importedDB || typeof importedDB !== 'object' || !Array.isArray(importedDB.players) || !importedDB.settings) {
                            ui.showAlert('File JSON non valido: assicurati che sia un backup generato da questa app.', 'error');
                            return;
                        }
                        
                        // Validazione di sicurezza della lista giocatori: Assicuriamoci che i nomi siano sanitizzati all'import
                        importedDB.players = importedDB.players.map(p => ({
                            ...p,
                            name: utils.sanitizeString(p.name)
                        })).filter(p => p.name !== '');

                        const hasInvalidPlayer = importedDB.players.length === 0 && e.target.result.includes('players');
                        if (hasInvalidPlayer) {
                            ui.showAlert('Il file contiene record giocatori incompleti o danneggiati.', 'error');
                            return;
                        }

                        db = {
                            ...db,
                            ...importedDB,
                            history: [],
                            historyIndex: -1,
                            settings: { ...db.settings, ...(importedDB.settings || {}) },
                            playoffs: { ...db.playoffs, ...(importedDB.playoffs || {}) }
                        };
                        saveHistory();
                        reloadFullUI(); 
                        ui.showAlert('Dati importati con successo!', 'success');
                    } catch (err) {
                        ui.showAlert(`Errore durante la lettura del file: ${err.message}`, 'error');
                    }
                };
                reader.readAsText(file);
                event.target.value = null;
            },
            downloadFile: (content, fileName, contentType) => {
                const a = document.createElement('a');
                const file = new Blob([content], { type: contentType });
                a.href = URL.createObjectURL(file);
                a.download = fileName;
                a.click();
                URL.revokeObjectURL(a.href);
            },
            exportStandingsPDF: () => {
                if (typeof window.jspdf === 'undefined') {
                    ui.showAlert('Libreria PDF non disponibile (verifica la connessione internet).', 'error');
                    return;
                }
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF();
                const standings = utils.getStandings();

                doc.setFontSize(16);
                doc.text('Classifica - Torneo Giallo', 14, 15);
                doc.setFontSize(10);
                doc.setTextColor(120);
                doc.text(new Date().toLocaleDateString('it-IT'), 14, 21);

                doc.autoTable({
                    startY: 26,
                    head: [['#', 'Giocatore', 'Ruolo', 'Pts', 'G', 'V', 'N', 'P', 'GF', 'GS', 'Diff']],
                    body: standings.map((s, i) => [
                        i + 1, s.name, s.role, s.Pts, s.G, s.V, s.N, s.P, s.GF, s.GS, (s.Diff > 0 ? '+' : '') + s.Diff
                    ]),
                    theme: 'striped',
                    headStyles: { fillColor: [212, 160, 23], textColor: [28, 25, 23] },
                    styles: { fontSize: 9 }
                });

                doc.save('classifica_torneo_giallo.pdf');
                ui.showAlert('PDF esportato con successo.', 'success');
            }
        }
    };

    // ==========================================
    // 6. VISTE (RENDERING HTML)
    // ==========================================
    const views = {

        renderDashboard: () => {
            const standings = utils.getStandings();
            const totalPlayed = db.schedule.filter(m => m.played).length;

            let html = `
                <div class="max-w-6xl mx-auto pb-8">
                    <!-- AZIONI AVANZATE -->
                    <div class="card no-print bg-slate-50 border-slate-200">
                        <h3 class="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-700">
                            <i data-lucide="hard-drive" class="w-5 h-5 text-slate-500"></i> Dati e Backup
                        </h3>
                        <div class="flex flex-wrap gap-3">
                            <button id="export-json-btn" class="btn btn-secondary bg-white">
                                <i data-lucide="download" class="w-4 h-4 text-blue-600"></i> Esporta JSON
                            </button>
                            <button id="import-json-btn" class="btn btn-secondary bg-white">
                                <i data-lucide="upload" class="w-4 h-4 text-emerald-600"></i> Importa JSON
                            </button>
                            <button id="export-pdf-btn" class="btn btn-secondary bg-white">
                                <i data-lucide="file-text" class="w-4 h-4 text-red-600"></i> Esporta PDF Classifica
                            </button>
                            <!-- Avviso Salvataggio Dati -->
                            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex gap-3">
                                <i data-lucide="info" class="w-6 h-6 text-blue-500 flex-shrink-0 mt-0.5"></i>
                                <div class="text-sm text-blue-800">
                                    <h4 class="font-bold mb-1">Come vengono salvati i dati?</h4>
                                    <p class="mb-2">
                                        Questa applicazione funziona interamente sul tuo dispositivo. I tornei e i punteggi vengono salvati in automatico nella memoria di <strong>questo browser</strong>.
                                    </p>
                                    <ul class="list-disc pl-4 space-y-1 text-blue-700">
                                        <li>Non usare la <strong>navigazione in incognito</strong>, altrimenti perderai tutto chiudendo la pagina.</li>
                                        <li>Se elimini la cronologia o svuoti la cache del browser, i dati del torneo verranno cancellati.</li>
                                        <li>Usa i tasti <strong>Esporta / Importa JSON</strong> per fare un backup o per spostare il torneo su un altro dispositivo (es. dal telefono al PC).</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- STATISTICHE RAPIDE -->
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                        <div class="card p-5 flex items-center bg-white border-l-4 border-sky-500 shadow-sm">
                            <div class="p-3 bg-sky-50 rounded-lg mr-4"><i data-lucide="users" class="w-6 h-6 text-sky-600"></i></div>
                            <div>
                                <p class="text-xs uppercase tracking-wider font-bold text-slate-400">Giocatori</p>
                                <p class="text-2xl font-black text-slate-800">${db.players.length}</p>
                            </div>
                        </div>
                        <div class="card p-5 flex items-center bg-white border-l-4 border-amber-500 shadow-sm">
                            <div class="p-3 bg-amber-50 rounded-lg mr-4"><i data-lucide="calendar" class="w-6 h-6 text-amber-600"></i></div>
                            <div>
                                <p class="text-xs uppercase tracking-wider font-bold text-slate-400">Partite Totali</p>
                                <p class="text-2xl font-black text-slate-800">${db.schedule.length}</p>
                            </div>
                        </div>
                        <div class="card p-5 flex items-center bg-white border-l-4 border-emerald-500 shadow-sm">
                            <div class="p-3 bg-emerald-50 rounded-lg mr-4"><i data-lucide="check-circle" class="w-6 h-6 text-emerald-600"></i></div>
                            <div>
                                <p class="text-xs uppercase tracking-wider font-bold text-slate-400">Giocate</p>
                                <p class="text-2xl font-black text-slate-800">${totalPlayed}</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                        <div class="card">
                            <h3 class="text-lg font-semibold mb-4 border-b pb-2 flex items-center gap-2">
                                <i data-lucide="medal" class="w-5 h-5 text-amber-500"></i> Top 5 Classifica
                            </h3>
                            ${standings.length > 0 ? `
                                <table class="w-full text-sm">
                                    <thead>
                                        <tr class="text-slate-500 border-b border-slate-100">
                                            <th class="font-semibold text-left py-2 px-1">#</th>
                                            <th class="font-semibold text-left py-2 px-1">Nome</th>
                                            <th class="font-semibold text-left py-2 px-1">Pts</th>
                                            <th class="font-semibold text-left py-2 px-1">G</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${standings.slice(0, 5).map((s, index) => `
                                            <tr class="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition">
                                                <td class="py-2 px-1 font-mono text-slate-400">${index + 1}</td>
                                                <td class="py-2 px-1 font-bold text-slate-700">${s.name}</td>
                                                <td class="py-2 px-1 font-black text-amber-600">${s.Pts}</td>
                                                <td class="py-2 px-1 text-slate-500">${s.G}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            ` : '<p class="text-slate-400 text-sm">Nessun dato in classifica.</p>'}
                        </div>
                        
                        <div class="card">
                            <h3 class="text-lg font-semibold mb-4 border-b pb-2 flex items-center gap-2">
                                <i data-lucide="bar-chart-2" class="w-5 h-5 text-sky-500"></i> Statistiche Giocate
                            </h3>
                            <div class="h-64"><canvas id="statisticheChart"></canvas></div>
                        </div>
                    </div>
                </div>
            `;
            
            contentView.innerHTML = html;
            lucide.createIcons();
            
            document.getElementById('export-json-btn').addEventListener('click', logic.data.saveToJSON);
            document.getElementById('import-json-btn').addEventListener('click', () => importJsonFile.click());
            document.getElementById('export-pdf-btn').addEventListener('click', logic.data.exportStandingsPDF);

            views.initChart(standings);
        },

        initChart: (standings) => {
            const ctx = document.getElementById('statisticheChart');
            if (!ctx || standings.length === 0) return;

            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: standings.map(s => s.name),
                    datasets: [{
                        label: 'Partite Giocate',
                        data: standings.map(s => s.G),
                        backgroundColor: '#0ea5e9',
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: { y: { beginAtZero: true } },
                    plugins: { legend: { display: false } }
                }
            });
        },

        renderPlayers: () => {
            const P = utils.getPlayersByRole('Portiere');
            const A = utils.getPlayersByRole('Attaccante');
            
            let sortMode = document.getElementById('player-sort-mode')?.value || 'P_first';
            let searchQuery = document.getElementById('player-search')?.value.toLowerCase() || '';
            
            const getPlayerListToRender = (mode) => {
                const portieri_sorted = utils.getPlayersByRole('Portiere').sort((a, b) => a.name.localeCompare(b.name));
                const attaccanti_sorted = utils.getPlayersByRole('Attaccante').sort((a, b) => a.name.localeCompare(b.name));

                let list = [];
                if (mode === 'P_first') list = [...portieri_sorted, ...attaccanti_sorted];
                else if (mode === 'A_first') list = [...attaccanti_sorted, ...portieri_sorted];
                else if (mode === 'alternate') {
                     let p_idx = 0; let a_idx = 0;
                     while(p_idx < portieri_sorted.length || a_idx < attaccanti_sorted.length) {
                         if (p_idx < portieri_sorted.length) list.push(portieri_sorted[p_idx++]);
                         if (a_idx < attaccanti_sorted.length) list.push(attaccanti_sorted[a_idx++]);
                     }
                } else {
                    list = [...db.players].sort((a, b) => a.name.localeCompare(b.name));
                }

                if (searchQuery) {
                    list = list.filter(p => p.name.toLowerCase().includes(searchQuery));
                }
                
                return list;
            };

            let html = `
                <div class="max-w-6xl mx-auto pb-8">
                    
                    <div class="card no-print bg-slate-50 border-slate-200 mb-6">
                        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                            <h3 class="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <i data-lucide="user-plus" class="w-5 h-5 text-slate-500"></i> Aggiungi Nuovo Giocatore
                            </h3>
                            <button id="bulk-btn" class="btn btn-secondary bg-white border-emerald-300 text-emerald-800 hover:bg-emerald-50 flex items-center gap-2 py-1.5 px-3 shadow-sm text-xs font-bold uppercase tracking-wide">
                                <i data-lucide="message-square" class="w-4 h-4 text-emerald-600"></i> 
                                Importa Lista
                            </button>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                            <div class="md:col-span-5">
                                <label for="new-player-name" class="block text-[10px] uppercase tracking-wide font-bold text-slate-500 mb-1">Nome</label>
                                <input type="text" id="new-player-name" placeholder="Es. Mario Rossi" maxlength="50" class="bg-white">
                            </div>
                            <div class="md:col-span-4">
                                <label for="new-player-role" class="block text-[10px] uppercase tracking-wide font-bold text-slate-500 mb-1">Ruolo</label>
                                <select id="new-player-role" class="bg-white">
                                    <option value="">Seleziona...</option>
                                    <option value="Portiere">Portiere</option>
                                    <option value="Attaccante">Attaccante</option>
                                </select>
                            </div>
                            <div class="md:col-span-3">
                                <button id="add-player-btn" class="btn btn-primary w-full">Aggiungi</button>
                            </div>
                        </div>
                    </div>

                    <div class="card">
                        <div class="flex flex-col lg:flex-row justify-between lg:items-center mb-6 border-b pb-4 gap-4">
                            <h3 class="text-lg font-semibold flex items-center gap-2">
                                <i data-lucide="users" class="w-5 h-5 text-slate-500"></i> Lista Giocatori (${db.players.length})
                            </h3>
                            <div class="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                                <div class="relative flex-grow sm:w-64">
                                    <i data-lucide="search" class="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"></i>
                                    <input type="search" id="player-search" placeholder="Cerca giocatore..." class="w-full pl-9 p-2 border rounded text-sm bg-slate-50 focus:bg-white">
                                </div>
                                <select id="player-sort-mode" class="w-full sm:w-auto p-2 border rounded text-sm bg-slate-50 focus:bg-white">
                                    <option value="name" ${sortMode==='name'?'selected':''}>A-Z</option>
                                    <option value="P_first" ${sortMode==='P_first'?'selected':''}>Portieri prima</option>
                                    <option value="A_first" ${sortMode==='A_first'?'selected':''}>Attaccanti prima</option>
                                    <option value="alternate" ${sortMode==='alternate'?'selected':''}>Alternati</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="grid grid-cols-3 gap-4 mb-6">
                             <div class="p-3 bg-sky-50 rounded-lg border border-sky-100 text-center">
                                <div class="text-[10px] uppercase font-bold text-sky-600 mb-1">Portieri</div>
                                <div class="text-xl font-black text-sky-800">${P.length}</div>
                             </div>
                             <div class="p-3 bg-orange-50 rounded-lg border border-orange-100 text-center">
                                <div class="text-[10px] uppercase font-bold text-orange-600 mb-1">Attaccanti</div>
                                <div class="text-xl font-black text-orange-800">${A.length}</div>
                             </div>
                             <div class="p-3 bg-slate-50 rounded-lg border border-slate-200 text-center">
                                <div class="text-[10px] uppercase font-bold text-slate-500 mb-1">Target Partite</div>
                                <div class="text-xl font-black text-slate-700">${db.settings.rounds}</div>
                             </div>
                        </div>

                        <div id="player-list-table-container">
                            ${views.renderPlayerTable(getPlayerListToRender(sortMode))}
                        </div>
                    </div>
                </div>
            `;
            
            contentView.innerHTML = html;
            // XSS Fix: Imposta il valore di ricerca dopo aver renderizzato l'HTML
            document.getElementById('player-search').value = searchQuery;
            lucide.createIcons();
            
            document.getElementById('add-player-btn').addEventListener('click', () => {
                logic.player.add(document.getElementById('new-player-name').value, document.getElementById('new-player-role').value);
            });
            
            document.getElementById('bulk-btn').addEventListener('click', () => {
                ui.showModal('Importazione Intelligente', 
                    `<p class="text-sm text-slate-600 mb-2">Incolla la lista. Il sistema riconoscerà automaticamente i ruoli se usi le emoji (🧤/🥅 per i portieri, ⚽/⚡ per gli attaccanti) e ripulirà i numeri e i simboli.</p>
                    <textarea id="bulk-in" rows="8" class="mb-3 w-full border p-2 rounded text-sm font-mono" placeholder="1. 🧤 Mario Rossi&#10;2. ⚽ Luca Verdi"></textarea>
                    <div class="p-3 bg-slate-50 rounded border border-slate-200">
                        <label for="bulk-role" class="block text-xs font-bold text-slate-700 mb-1">Ruolo predefinito (se non ci sono emoji):</label>
                        <select id="bulk-role" class="w-full border p-2 rounded bg-white text-sm">
                            <option value="Attaccante">Attaccante</option>
                            <option value="Portiere">Portiere</option>
                        </select>
                    </div>`, 
                    `<button class="btn btn-primary" id="do-bulk">Elabora e Importa</button>`
                );

                document.getElementById('do-bulk').onclick = () => { 
                    const rawText = document.getElementById('bulk-in').value;
                    const defaultRole = document.getElementById('bulk-role').value;
                    const lines = rawText.split('\n');
                    
                    let importedCount = 0;
                    saveHistory();

                    lines.forEach(line => {
                        let cleanLine = line.trim();
                        if (!cleanLine) return;

                        let role = defaultRole;
                        const lower = cleanLine.toLowerCase();
                        if (cleanLine.includes('🧤') || cleanLine.includes('🥅') || lower.includes('[p]') || lower.includes('(p)')) {
                            role = 'Portiere';
                        } else if (cleanLine.includes('⚽') || cleanLine.includes('⚡') || lower.includes('[a]') || lower.includes('(a)')) {
                            role = 'Attaccante';
                        }

                        // Regex ottimizzata per ignorare caratteri strani e punteggiatura
                        cleanLine = cleanLine
                            .replace(/^[\d\.\)\-\*\•]+\s*/g, '') 
                            .replace(/[🧤🥅⚽⚡\uFE0F]/g, '')       
                            .trim();

                        if (cleanLine.length > 0) {
                            const newPlayer = {
                                id: utils.generateId(),
                                name: cleanLine,
                                role: role
                            };
                            db.players.push(newPlayer);
                            importedCount++;
                        }
                    });

                    reloadFullUI();
                    ui.hideModal();
                    ui.showAlert(`Importati con successo ${importedCount} giocatori!`, 'success');
                };
            });
            
            const updatePlayerList = () => {
                sortMode = document.getElementById('player-sort-mode').value;
                searchQuery = document.getElementById('player-search').value.toLowerCase();
                document.getElementById('player-list-table-container').innerHTML = views.renderPlayerTable(getPlayerListToRender(sortMode));
                views.attachPlayerTableListeners();
                lucide.createIcons(); // Ottimizzato: ricarica le icone solo nella tabella
            };

            document.getElementById('player-sort-mode').addEventListener('change', updatePlayerList);
            document.getElementById('player-search').addEventListener('input', updatePlayerList);
            
            views.attachPlayerTableListeners();
        },

        renderPlayerTable: (players) => {
            if (players.length === 0) return '<div class="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">Nessun giocatore trovato.</div>';
            
            const portieri = players.filter(p => p.role === 'Portiere');
            const attaccanti = players.filter(p => p.role === 'Attaccante');

            // XSS Fix: Usiamo utils.escapeHtml(p.name)
            const renderRow = (p) => `
                <div class="flex justify-between items-center py-1.5 px-3 border-b border-slate-100 hover:bg-slate-50 transition">
                    <div class="font-medium text-sm text-slate-800 truncate" title="${utils.escapeHtml(p.name)}">${utils.escapeHtml(p.name)}</div>
                    <div class="no-print flex gap-1">
                        <button class="btn btn-ghost btn-sm info-player-btn text-sky-600 p-1 hover:bg-sky-100 rounded" data-id="${p.id}" title="Vedi Storia e Statistiche">
                            <i data-lucide="line-chart" class="w-4 h-4"></i>
                        </button>
                        <button class="btn btn-ghost btn-sm edit-player-btn text-slate-400 p-1 hover:text-slate-600 hover:bg-slate-200 rounded" data-id="${p.id}" title="Modifica Nome">
                            <i data-lucide="pencil" class="w-4 h-4"></i>
                        </button>
                        <button class="btn btn-ghost btn-sm remove-player-btn text-red-400 p-1 hover:text-red-600 hover:bg-red-100 rounded" data-id="${p.id}" title="Rimuovi Giocatore">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </div>
                </div>
            `;

            return `
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="bg-white rounded-lg border border-sky-200 overflow-hidden shadow-sm">
                        <div class="bg-sky-50 py-2 px-3 border-b border-sky-200 text-[10px] font-bold text-sky-800 uppercase tracking-wider flex justify-between items-center">
                            <span>Portieri in lista (${portieri.length})</span>
                            <span class="no-print">Azioni</span>
                        </div>
                        <div class="max-h-[500px] overflow-y-auto">
                            ${portieri.length === 0 ? '<div class="p-4 text-center text-xs text-slate-400 italic">Nessun portiere trovato.</div>' : portieri.map(renderRow).join('')}
                        </div>
                    </div>

                    <div class="bg-white rounded-lg border border-orange-200 overflow-hidden shadow-sm">
                        <div class="bg-orange-50 py-2 px-3 border-b border-orange-200 text-[10px] font-bold text-orange-800 uppercase tracking-wider flex justify-between items-center">
                            <span>Attaccanti in lista (${attaccanti.length})</span>
                            <span class="no-print">Azioni</span>
                        </div>
                        <div class="max-h-[500px] overflow-y-auto">
                            ${attaccanti.length === 0 ? '<div class="p-4 text-center text-xs text-slate-400 italic">Nessun attaccante trovato.</div>' : attaccanti.map(renderRow).join('')}
                        </div>
                    </div>
                </div>
            `;
        },

        attachPlayerTableListeners: () => {
            lucide.createIcons();
            
            // Storia
            document.querySelectorAll('.info-player-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = e.currentTarget.getAttribute('data-id');
                    const player = utils.getPlayerById(id);
                    if (!player) return;

                    const standings = utils.getStandings();
                    const stats = standings.find(s => s.id === id) || { G: 0, V: 0, N: 0, P: 0, Pts: 0, GF: 0, GS: 0, Diff: 0 };

                    const matches = db.schedule.filter(m => 
                        (m.team1 && (m.team1.p === id || m.team1.a === id)) ||
                        (m.team2 && (m.team2.p === id || m.team2.a === id))
                    );

                    let historyHtml = '<div class="p-4 text-center text-slate-400 bg-slate-50 rounded-lg text-sm">Nessuna partita in calendario.</div>';
                    if (matches.length > 0) {
                        historyHtml = `<ul class="text-sm space-y-2 max-h-72 overflow-y-auto pr-2">`;
                        matches.forEach(m => {
                            const isTeam1 = m.team1.p === id || m.team1.a === id;
                            const compagnoId = isTeam1 ? (m.team1.p === id ? m.team1.a : m.team1.p) : (m.team2.p === id ? m.team2.a : m.team2.p);
                            const compagno = utils.getPlayerById(compagnoId)?.name || 'Sconosciuto';
                            
                            const avversari = isTeam1 
                                ? `${utils.getPlayerById(m.team2.p)?.name} + ${utils.getPlayerById(m.team2.a)?.name}`
                                : `${utils.getPlayerById(m.team1.p)?.name} + ${utils.getPlayerById(m.team1.a)?.name}`;

                            const statusStr = m.played ? `${m.score1} - ${m.score2}` : (m.inProgress ? 'In Corso' : 'Da Giocare');
                            
                            let resClass = 'text-slate-500';
                            let badgeIcon = 'clock';
                            if (m.played) {
                                const myScore = isTeam1 ? m.score1 : m.score2;
                                const oppScore = isTeam1 ? m.score2 : m.score1;
                                if (myScore > oppScore) { resClass = 'text-green-700 font-bold bg-green-100'; badgeIcon = 'check-circle'; }
                                else if (myScore < oppScore) { resClass = 'text-red-700 font-bold bg-red-100'; badgeIcon = 'x-circle'; }
                                else { resClass = 'text-amber-700 font-bold bg-amber-100'; badgeIcon = 'minus-circle'; }
                            }

                            historyHtml += `
                                <li class="p-3 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col gap-1">
                                    <div class="flex justify-between items-center border-b border-slate-100 pb-2 mb-1">
                                        <span class="font-mono text-xs text-slate-400 font-semibold uppercase">Round ${m.round}</span>
                                        <span class="text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wide ${resClass} flex items-center gap-1">
                                            <i data-lucide="${badgeIcon}" class="w-3 h-3"></i> ${statusStr}
                                        </span>
                                    </div>
                                    <div class="text-xs text-slate-700"><span class="text-slate-400 uppercase tracking-wide text-[10px] mr-1">Con:</span> <span class="font-bold">${compagno}</span></div>
                                    <div class="text-xs text-slate-700"><span class="text-slate-400 uppercase tracking-wide text-[10px] mr-1">Vs:</span> <span>${avversari}</span></div>
                                </li>`;
                        });
                        historyHtml += `</ul>`;
                    }

                    const body = `
                        <div class="grid grid-cols-4 gap-2 mb-5 text-center">
                            <div class="p-2 bg-amber-50 rounded-lg border border-amber-100"><div class="text-[10px] text-amber-600 font-bold uppercase tracking-wider">Punti</div><div class="font-black text-xl text-amber-700">${stats.Pts}</div></div>
                            <div class="p-2 bg-slate-50 rounded-lg border border-slate-200"><div class="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Giocate</div><div class="font-black text-xl text-slate-700">${stats.G}</div></div>
                            <div class="p-2 bg-emerald-50 rounded-lg border border-emerald-200"><div class="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Vinte</div><div class="font-black text-xl text-emerald-700">${stats.V}</div></div>
                            <div class="p-2 bg-red-50 rounded-lg border border-red-200"><div class="text-[10px] text-red-600 font-bold uppercase tracking-wider">Perse</div><div class="font-black text-xl text-red-700">${stats.P}</div></div>
                        </div>
                        <h4 class="text-sm font-semibold mb-3 text-slate-700 flex items-center gap-2 border-b pb-2"><i data-lucide="history" class="w-4 h-4 text-slate-400"></i> Cronologia Partite</h4>
                        ${historyHtml}
                    `;
                    ui.showModal(`Scheda: ${player.name}`, body);
                });
            });

            document.querySelectorAll('.remove-player-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    if (confirm('Sicuro di voler rimuovere questo giocatore? Tutte le partite verranno aggiornate.')) {
                        logic.player.remove(e.currentTarget.getAttribute('data-id'));
                    }
                });
            });
            
            document.querySelectorAll('.edit-player-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = e.currentTarget.getAttribute('data-id');
                    const player = utils.getPlayerById(id);
                    if (!player) return;
                    
                    const body = `<input type="text" id="edit-player-name-input" value="${player.name}" maxlength="50" class="w-full border p-2 rounded" placeholder="Nuovo Nome" autofocus>`;
                    const footer = `
                        <button class="btn btn-secondary" onclick="document.getElementById('modal-close-btn').click()">Annulla</button>
                        <button class="btn btn-primary" id="save-player-name">Salva</button>
                    `;
                    ui.showModal(`Modifica: ${player.name}`, body, footer);
                    
                    document.getElementById('save-player-name').addEventListener('click', () => {
                        const newName = document.getElementById('edit-player-name-input').value;
                        if (logic.player.updateName(id, newName)) {
                            ui.hideModal();
                        }
                    });
                });
            });
        },
        
        renderStandings: () => {
            const standings = utils.getStandings();
            const targetGames = db.settings.rounds;
            const playerGameCounts = utils.getPlayerGameCounts();

            // Creiamo una memoria che parte sempre da "Portieri prima"
            if (!window.savedSortMode) window.savedSortMode = 'P_first';
            // Se la tendina esiste, salviamo la scelta attuale dell'utente
            if (document.getElementById('standings-sort-mode')) {
                window.savedSortMode = document.getElementById('standings-sort-mode').value;
            }
            let sortMode = window.savedSortMode;

            let displayList = standings.map((s, idx) => ({ ...s, rank: idx + 1 }));

            if (sortMode === 'P_first') {
                displayList = [...displayList.filter(s => s.role === 'Portiere'), ...displayList.filter(s => s.role === 'Attaccante')];
            } else if (sortMode === 'A_first') {
                displayList = [...displayList.filter(s => s.role === 'Attaccante'), ...displayList.filter(s => s.role === 'Portiere')];
            } else if (sortMode === 'alternate') {
                const p = displayList.filter(s => s.role === 'Portiere');
                const a = displayList.filter(s => s.role === 'Attaccante');
                const merged = [];
                const max = Math.max(p.length, a.length);
                for (let i = 0; i < max; i++) { if (p[i]) merged.push(p[i]); if (a[i]) merged.push(a[i]); }
                displayList = merged;
            }

            let html = `
                <div class="max-w-6xl mx-auto pb-8 relative">
                    <div class="card shadow-sm">
                        <div class="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6 border-b pb-4">
                            <h3 class="text-xl font-bold flex items-center gap-2 text-slate-800">
                                <i data-lucide="trophy" class="w-6 h-6 text-amber-500"></i> Classifica Generale
                            </h3>
                            <div class="no-print flex flex-col sm:flex-row gap-3 items-center w-full md:w-auto">
                                <button id="tv-mode-btn-inpage" class="btn btn-secondary w-full sm:w-auto border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700" title="Mostra a schermo intero">
                                    <i data-lucide="tv" class="w-4 h-4"></i> Modalità TV
                                </button>
                                <div class="flex items-center w-full sm:w-auto bg-slate-50 p-1 rounded border border-slate-200">
                                    <i data-lucide="filter" class="w-4 h-4 text-slate-400 mx-2"></i>
                                    <select id="standings-sort-mode" autocomplete="off" class="border-none bg-transparent focus:ring-0 text-sm py-1 font-medium text-slate-700 w-full">
                                        <option value="rank" ${sortMode === 'rank' ? 'selected' : ''}>Posizione (#)</option>
                                        <option value="P_first" ${sortMode === 'P_first' ? 'selected' : ''}>Portieri prima</option>
                                        <option value="A_first" ${sortMode === 'A_first' ? 'selected' : ''}>Attaccanti prima</option>
                                        <option value="alternate" ${sortMode === 'alternate' ? 'selected' : ''}>Alternati (P/A)</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        ${standings.length > 0 ? `
                            <div class="overflow-x-auto rounded-lg border border-slate-200">
                                <table class="w-full table-striped min-w-[800px] text-sm">
                                    <thead class="bg-slate-50 border-b border-slate-200">
                                        <tr>
                                            <th title="Posizione in classifica" class="text-center w-12">#</th>
                                            <th title="Giocatore">Giocatore</th>
                                            <th class="th-truncate w-24" title="Ruolo">Ruolo</th>
                                            <th class="th-truncate text-center bg-amber-50/50" title="Punti">PTS</th>
                                            <th class="th-truncate text-center" title="Partite Giocate">G</th>
                                            <th class="th-truncate text-center" title="Vittorie">V</th>
                                            <th class="th-truncate text-center" title="Pareggi">N</th>
                                            <th class="th-truncate text-center" title="Sconfitte">P</th>
                                            <th class="th-truncate text-center text-slate-400" title="Gol Fatti">GF</th>
                                            <th class="th-truncate text-center text-slate-400" title="Gol Subiti">GS</th>
                                            <th class="th-truncate text-center" title="Differenza Reti">Diff</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${displayList.map((s) => {
                                            const games = playerGameCounts[s.id] || 0;
                                            const gamesClass = games < targetGames ? 'text-red-500 font-bold' : games > targetGames ? 'text-amber-500 font-bold' : 'text-slate-500';
                                            const rankClass = s.rank <= 3 ? 'font-bold text-amber-600' : 'text-slate-400 font-mono';
                                            return `
                                                <tr class="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                                                    <td class="text-center ${rankClass}">${s.rank}</td>
                                                    <td class="font-bold text-slate-700">${s.name}</td>
                                                    <td><span class="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${s.role === 'Portiere' ? 'bg-sky-100 text-sky-700' : 'bg-orange-100 text-orange-700'}">${s.role}</span></td>
                                                    <td class="text-center font-black text-amber-600 text-base bg-amber-50/30">${s.Pts}</td>
                                                    <td class="text-center ${gamesClass}">${games}</td>
                                                    <td class="text-center font-medium">${s.V}</td>
                                                    <td class="text-center text-slate-500">${s.N}</td>
                                                    <td class="text-center text-slate-500">${s.P}</td>
                                                    <td class="text-center text-slate-400">${s.GF}</td>
                                                    <td class="text-center text-slate-400">${s.GS}</td>
                                                    <td class="text-center font-medium ${s.Diff > 0 ? 'text-emerald-600' : s.Diff < 0 ? 'text-red-500' : 'text-slate-400'}">${s.Diff > 0 ? '+' : ''}${s.Diff}</td>
                                                </tr>
                                            `;
                                        }).join('')}
                                    </tbody>
                                </table>
                            </div>
                        ` : '<div class="p-12 text-center text-slate-400 border border-dashed border-slate-200 rounded-lg">Nessun giocatore registrato o partita giocata.</div>'}
                    </div>
                </div>
            `;
            
            contentView.innerHTML = html;
            lucide.createIcons();

            document.getElementById('standings-sort-mode')?.addEventListener('change', views.renderStandings);

            // GESTIONE MODALITA' TV (bottone in pagina)
            document.getElementById('tv-mode-btn-inpage')?.addEventListener('click', () => {
                document.getElementById('tv-mode-btn').click(); // Simula click sul menu laterale
            });
        },

        renderPlayoffs: () => {
            logic.playoffs.syncBracketProgress(db.playoffs.mainBracket);
            logic.playoffs.syncBracketProgress(db.playoffs.playoutBracket);
            logic.playoffs.syncBracketProgress(db.playoffs.thirdPlaceBracket);
            logic.playoffs.tryBuildFifthPlaceBracket();
            logic.playoffs.syncBracketProgress(db.playoffs.fifthPlaceBracket);
            logic.playoffs.syncBracketProgress(db.playoffs.silverBracket); 

            const standings = utils.getStandings();
            
            // 1. Calcolo dinamico della dimensione per i testi
            const maxP = utils.getPlayersByRole('Portiere').length;
            const maxA = utils.getPlayersByRole('Attaccante').length;
            const totalPairs = Math.min(maxP, maxA);
            
            let actualSize = 8;
            if (db.settings.playoffSize === 'auto' || !db.settings.playoffSize) {
                if (totalPairs >= 16) actualSize = 16;
                else if (totalPairs >= 12) actualSize = 12;
                else if (totalPairs >= 10) actualSize = 10;
                else if (totalPairs >= 8) actualSize = 8;
                else if (totalPairs >= 7) actualSize = 7;
                else if (totalPairs >= 6) actualSize = 6;
                else actualSize = 4;
            } else {
                actualSize = parseInt(db.settings.playoffSize);
            }

            // 2. Descrizione Formato dinamica
            let formatDescription = "";
            if (actualSize === 4) formatDescription = "Le prime 4 coppie giocano le Semifinali.";
            else if (actualSize === 6) formatDescription = "1° e 2° classificato diretti in Semifinale. Dal 3° al 6° posto giocano i Quarti.";
            else if (actualSize === 7) formatDescription = "Il 1° classificato diretto in Semifinale. Dal 2° al 7° posto giocano i Quarti.";
            else if (actualSize === 8) formatDescription = "Le prime 8 coppie giocano i Quarti di Finale.";
            else if (actualSize === 10) formatDescription = "Le prime 6 passano ai Quarti. Dal 7° al 10° posto giocano gli Ottavi (Turno Preliminare).";
            else if (actualSize === 12) formatDescription = "Le prime 4 passano ai Quarti. Dal 5° al 12° posto giocano gli Ottavi (Turno Preliminare).";
            else if (actualSize === 16) formatDescription = "Le prime 16 coppie giocano gli Ottavi di Finale.";

            const formationModeLabels = { random: 'Casuale puro', 'balanced-random': 'Casuale equilibrato', 'max-balance': 'Massimo equilibrio' };
            const formationModeLabel = formationModeLabels[db.settings.teamFormationMode] || 'Casuale equilibrato';
            
            const incompleteScheduleCount = db.schedule.filter(match => !match.played).length;
            const hasIncompleteSchedule = incompleteScheduleCount > 0;
            const hasExistingPlayoffs = Boolean(
                db.playoffs.mainBracket || db.playoffs.playoutBracket || db.playoffs.thirdPlaceBracket || db.playoffs.fifthPlaceBracket || db.playoffs.qualificationBracket || db.playoffs.silverBracket
            );
            
            const tied = logic.playoffs.checkTiebreakNeeded();
            const tb = db.playoffs.tiebreak;
            const tiedIds = tied ? tied.map(p => p.id) : [];
            const tbMatchesTiedPair = tb && tied && tied.length === 2 && tiedIds.includes(tb.p1Id) && tiedIds.includes(tb.p2Id);
            
            const hasBracketContent = (bracket) => {
                if (!bracket || !Array.isArray(bracket.matches) || bracket.matches.length === 0) return false;
                const isRealParticipant = (team) => team && team !== 'TBD' && team !== 'BYE';
                const hasContentInRound = bracket.matches.some(match => isRealParticipant(match.team1) && isRealParticipant(match.team2));
                return hasContentInRound || (bracket.nextRound ? hasBracketContent(bracket.nextRound) : false);
            };

            let html = `
                <div class="max-w-6xl mx-auto pb-8">
                    <!-- INTESTAZIONE PLAYOFF -->
                    <div class="card no-print shadow-sm bg-slate-50 border-slate-200">
                        <h3 class="text-xl font-bold mb-4 flex items-center gap-2 text-slate-800">
                            <i data-lucide="git-fork" class="w-6 h-6 text-slate-500"></i> Gestione Tabelloni Playoff
                        </h3>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            <div class="bg-white p-4 rounded-lg border border-slate-200">
                                <h4 class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Formato & Regole</h4>
                                <p class="text-sm text-slate-700 leading-relaxed mb-2"><b>Formato Top ${actualSize}:</b> ${formatDescription} Le coppie vengono rimescolate tra i turni (sempre 1P + 1A).</p>
                                <p class="text-sm text-slate-700"><b>Vittoria:</b> ${db.settings.playoffScoreTarget} gol. <span class="text-slate-400 mx-1">|</span> <b>Formazione:</b> ${formationModeLabel}</p>
                            </div>
                            <div class="bg-white p-4 rounded-lg border border-slate-200">
                                <h4 class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Stato Generazione</h4>
                                ${hasIncompleteSchedule 
                                    ? `<div class="flex gap-2 items-start text-red-600 bg-red-50 p-2 rounded text-sm font-medium"><i data-lucide="alert-circle" class="w-4 h-4 mt-0.5 flex-shrink-0"></i> <span>Mancano ${incompleteScheduleCount} partite nel calendario. I playoff richiedono classifiche definitive.</span></div>` 
                                    : `<div class="flex gap-2 items-start text-emerald-600 bg-emerald-50 p-2 rounded text-sm font-medium"><i data-lucide="check-circle" class="w-4 h-4 mt-0.5 flex-shrink-0"></i> <span>Calendario completo. Generazione sbloccata.</span></div>`
                                }
                            </div>
                        </div>

                        <div class="flex gap-3 items-center flex-wrap">
                             <button id="share-playoffs-btn" class="btn btn-secondary bg-white border-green-500 text-green-700 hover:bg-green-50 shadow-sm font-bold" ${hasExistingPlayoffs ? '' : 'disabled'} type="button">
                                <i data-lucide="share-2" class="w-4 h-4 text-green-600"></i> Copia Incontri
                            </button>
                             <button id="generate-playoffs-btn" class="btn btn-primary" ${standings.length < 2 || hasIncompleteSchedule ? 'disabled' : ''}>
                                <i data-lucide="git-branch" class="w-4 h-4"></i> Genera Nuovi Tabelloni
                            </button>
                             <button id="reset-playoffs-btn" class="btn btn-danger btn-sm" ${hasExistingPlayoffs ? '' : 'disabled'} type="button">
                                <i data-lucide="rotate-ccw" class="w-4 h-4"></i> Elimina Tabelloni
                            </button>
                        </div>
                    </div>
            `;

            if (tied && tied.length === 2) {
                const [p1, p2] = tied;
                html += `
                    <div class="card border-amber-300 bg-amber-50 no-print shadow-sm">
                        <h3 class="text-lg font-bold mb-2 flex items-center gap-2 text-amber-800">
                            <i data-lucide="alert-triangle" class="w-5 h-5"></i> Spareggio: Parità al taglio Top ${actualSize}
                        </h3>
                        <p class="text-sm text-amber-700 mb-4">
                            <b>${p1.name}</b> e <b>${p2.name}</b> sono pari per punti (${p1.Pts}) e differenza reti (${p1.Diff > 0 ? '+' : ''}${p1.Diff}). Inserisci l'esito dello spareggio per sbloccare i Playoff.
                        </p>
                        ${tbMatchesTiedPair ? `
                            <div class="inline-flex items-center gap-2 bg-emerald-100 text-emerald-800 px-3 py-1.5 rounded font-medium text-sm border border-emerald-200"><i data-lucide="check" class="w-4 h-4"></i> Spareggio registrato: ${utils.getPlayerById(tb.winnerId).name} passa (${tb.score1}-${tb.score2})</div>
                        ` : `
                            <div class="flex items-center gap-3 bg-white p-3 rounded border border-amber-200 max-w-lg shadow-sm">
                                <span class="text-sm font-bold flex-1 text-right text-slate-700">${p1.name}</span>
                                <input type="number" min="0" id="tiebreak-score1" class="w-12 p-1 text-center font-bold border rounded bg-slate-50">
                                <span class="text-slate-300">-</span>
                                <input type="number" min="0" id="tiebreak-score2" class="w-12 p-1 text-center font-bold border rounded bg-slate-50">
                                <span class="text-sm font-bold flex-1 text-slate-700">${p2.name}</span>
                                <button id="save-tiebreak-btn" class="btn btn-primary btn-sm ml-2 px-4" data-p1="${p1.id}" data-p2="${p2.id}">Salva</button>
                            </div>
                        `}
                    </div>
                `;
            } else if (tied && tied.length > 2) {
                html += `
                    <div class="card border-red-300 bg-red-50 no-print shadow-sm">
                        <h3 class="text-lg font-bold mb-2 text-red-800 flex items-center gap-2"><i data-lucide="alert-octagon" class="w-5 h-5"></i> Parità Multipla</h3>
                        <p class="text-sm text-red-700"><b>${tied.map(p=>p.name).join(', ')}</b> sono in parità perfetta al limite della qualificazione. Essendo 3 o più giocatori, devi organizzare e risolvere spareggi manuali (usando amichevoli) e poi aggiornare i punteggi prima di poter generare i tabelloni automatici.</p>
                    </div>
                `;
            }

            if (db.playoffs.mainBracket) {
                const champion = logic.playoffs.getBracketChampion(db.playoffs.mainBracket);
                const runnerUp = logic.playoffs.getFinalLoser(db.playoffs.mainBracket);
                const thirdPlace = logic.playoffs.getBracketChampion(db.playoffs.thirdPlaceBracket);
                const fourthPlace = logic.playoffs.getFinalLoser(db.playoffs.thirdPlaceBracket);
                const fifthPlace = logic.playoffs.getBracketChampion(db.playoffs.fifthPlaceBracket);
                const playoutWinner = logic.playoffs.getBracketChampion(db.playoffs.playoutBracket);
                const silverWinner = logic.playoffs.getBracketChampion(db.playoffs.silverBracket);

                const rankRow = (label, val, note, isGold = false) => `
                    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2.5 border-b border-slate-100 last:border-0">
                        <span class="font-bold ${isGold ? 'text-amber-600' : 'text-slate-600'} w-32">${label}</span>
                        <span class="text-base ${val ? 'font-black text-slate-800' : 'text-slate-400 italic'} flex-1">${val ? logic.playoffs.participantName(val) : 'In corso...'}</span>
                        ${note ? `<span class="text-xs font-medium text-slate-400 uppercase tracking-wide hidden sm:block">${note}</span>` : ''}
                    </div>`;

                html += `
                    <div class="card shadow-sm border-amber-200">
                        <h3 class="text-xl font-bold mb-4 border-b pb-3 flex items-center gap-2 text-slate-800"><i data-lucide="award" class="w-6 h-6 text-amber-500"></i> Podio e Classifica Finale Playoff</h3>
                        <div class="bg-amber-50/30 p-2 rounded-lg border border-amber-100 mb-2">
                            ${rankRow('1° Posto', champion, 'Campioni Assoluti', true)}
                        </div>
                        <div class="px-2">
                            ${rankRow('2° Posto', runnerUp, 'Finalisti')}
                            ${db.playoffs.thirdPlaceBracket ? rankRow('3° Posto', thirdPlace, 'Vincitori Finalina') : rankRow('3° Posto', null, 'Finalina')}
                            ${db.playoffs.thirdPlaceBracket ? rankRow('4° Posto', fourthPlace, '') : rankRow('4° Posto', null, '')}
                            ${db.playoffs.fifthPlaceBracket ? rankRow('5° Posto', fifthPlace, 'Tabellone 5°/6°') : ''}
                            ${db.playoffs.silverBracket ? rankRow('Vincitori Silver', silverWinner, 'Torneo Ripescati') : ''}
                            ${db.playoffs.playoutBracket ? rankRow('Vincitori Playout', playoutWinner, 'Cucchiaio di Legno') : ''}
                        </div>
                    </div>
                `;
            }

            const renderSection = (title, icon, subtitle, bracketContent) => `
                <details class="card shadow-sm overflow-x-auto group" open>
                    <summary class="text-lg font-bold mb-2 border-b pb-3 cursor-pointer flex items-center gap-2 text-slate-700 group-hover:text-sky-700 transition">
                        <i data-lucide="${icon}" class="w-5 h-5 text-sky-500"></i> ${title}
                    </summary>
                    <p class="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-4">${subtitle}</p>
                    <div class="flex space-x-12 p-4 min-h-[200px] bg-slate-50/50 rounded-lg border border-slate-100 overflow-x-auto">
                        ${bracketContent}
                    </div>
                </details>
            `;

            if (db.playoffs.mainBracket && hasBracketContent(db.playoffs.mainBracket)) {
                html += renderSection('Tabellone Principale', 'layout-template', 'Sfide a eliminazione diretta per il titolo', views.renderBracketRound(db.playoffs.mainBracket));
            }

            if (db.playoffs.thirdPlaceBracket && hasBracketContent(db.playoffs.thirdPlaceBracket)) {
                html += renderSection('Finalina 3°/4° posto', 'medal', 'Le perdenti delle semifinali', views.renderBracketRound(db.playoffs.thirdPlaceBracket));
            } else if (db.playoffs.mainBracket && hasBracketContent(db.playoffs.mainBracket) && db.settings.playoffThirdPlaceEnabled) {
                html += `<div class="card no-print shadow-sm text-center py-6 text-sm font-medium text-slate-400 bg-slate-50 border-dashed">La finalina 3°/4° posto sarà sbloccata al termine delle semifinali.</div>`;
            }

            if (db.playoffs.qualificationBracket && hasBracketContent(db.playoffs.qualificationBracket)) {
                html += renderSection('Turno Preliminare', 'filter', 'Qualificazione per il tabellone principale', views.renderBracketRound(db.playoffs.qualificationBracket));
            }

            if (db.playoffs.fifthPlaceBracket && hasBracketContent(db.playoffs.fifthPlaceBracket)) {
                html += renderSection('Tabellone 5°/6° posto', 'list-ordered', 'Semifinali e finale per le perdenti dei Quarti', views.renderBracketRound(db.playoffs.fifthPlaceBracket));
            }

            if (db.playoffs.silverBracket && hasBracketContent(db.playoffs.silverBracket)) {
                html += renderSection('Torneo Silver (Ripescati)', 'shield', 'Tabellone parallelo per i giocatori non qualificati al Tabellone Principale', views.renderBracketRound(db.playoffs.silverBracket));
            }

            if (db.playoffs.playoutBracket && hasBracketContent(db.playoffs.playoutBracket)) {
                html += renderSection(`Cucchiaio di Legno (Playout)`, 'shield-alert', 'Sfida per non arrivare ultimi', views.renderBracketRound(db.playoffs.playoutBracket));
            } 
            
            if (db.playoffs.excludedPlayoutTeam) {
                html += `<div class="card no-print shadow-sm bg-amber-50 border-amber-200"><p class="text-sm font-medium text-amber-800"><i data-lucide="info" class="w-4 h-4 inline mr-1"></i> Squadra esclusa dai playout (numero dispari): <b class="font-black text-amber-900">${logic.playoffs.participantName(db.playoffs.excludedPlayoutTeam)}</b>.</p></div>`;
            }

            html += `</div>`; // Fine max-w-6xl

            contentView.innerHTML = html;
            lucide.createIcons();

            // EVENTO TASTO WHATSAPP (COPIA INCONTRI PLAYOFF)
            document.getElementById('share-playoffs-btn')?.addEventListener('click', () => {
                let textToCopy = `🏆 *AGGIORNAMENTO PLAYOFF* 🏆\n\n`;
                let foundMatches = false;

                const appendPendingMatches = (bracket, title) => {
                    if (!bracket) return;
                    
                    const getMatches = (b) => {
                        if (!b) return [];
                        let m = [];
                        if (b.matches) m.push(...b.matches);
                        if (b.nextRound) m.push(...getMatches(b.nextRound));
                        return m;
                    };
                    
                    const allMatches = getMatches(bracket);
                    const pendingMatches = allMatches.filter(m => 
                        m.team1 && m.team1 !== 'TBD' && m.team1 !== 'BYE' &&
                        m.team2 && m.team2 !== 'TBD' && m.team2 !== 'BYE' &&
                        !m.winner
                    );

                    if (pendingMatches.length > 0) {
                        foundMatches = true;
                        textToCopy += `🔥 *${title}*\n`;
                        pendingMatches.forEach(m => {
                            const t1 = logic.playoffs.participantName(m.team1).replace(/<[^>]*>?/gm, '').replace(/&bull;/g, '-');
                            const t2 = logic.playoffs.participantName(m.team2).replace(/<[^>]*>?/gm, '').replace(/&bull;/g, '-');
                            textToCopy += `⚽ ${t1} 🆚 ${t2}\n`;
                        });
                        textToCopy += `\n`;
                    }
                };

                appendPendingMatches(db.playoffs.mainBracket, 'Tabellone Principale');
                appendPendingMatches(db.playoffs.thirdPlaceBracket, 'Finalina 3°/4° Posto');
                appendPendingMatches(db.playoffs.qualificationBracket, 'Turno Preliminare');
                appendPendingMatches(db.playoffs.fifthPlaceBracket, 'Tabellone 5°/6° Posto');
                appendPendingMatches(db.playoffs.silverBracket, 'Torneo Silver');
                appendPendingMatches(db.playoffs.playoutBracket, 'Playout');

                if (!foundMatches) {
                    ui.showAlert('Non ci sono incontri pronti da giocare in questo momento. Aspetta i risultati!', 'error');
                    return;
                }

                navigator.clipboard.writeText(textToCopy.trim()).then(() => {
                    ui.showAlert('Incontri copiati! Incolla il messaggio su WhatsApp.', 'success');
                }).catch(() => {
                    ui.showAlert('Errore nella copia. Riprova.', 'error');
                });
            });

            document.getElementById('generate-playoffs-btn').addEventListener('click', logic.playoffs.generateBracket);
            document.getElementById('reset-playoffs-btn')?.addEventListener('click', () => {
                if (confirm('Sei sicuro di voler azzerare i tabelloni playoff? I giocatori e il calendario rimarranno invariati.')) {
                    logic.data.resetPlayoffsOnly();
                }
            });

            document.getElementById('save-tiebreak-btn')?.addEventListener('click', (e) => {
                const p1 = e.currentTarget.getAttribute('data-p1');
                const p2 = e.currentTarget.getAttribute('data-p2');
                const s1 = document.getElementById('tiebreak-score1').value;
                const s2 = document.getElementById('tiebreak-score2').value;
                logic.playoffs.setTiebreakResult(p1, p2, s1, s2);
            });
            
            document.querySelectorAll('.playoff-score-input').forEach(inp => {
                inp.addEventListener('change', (e) => {
                    const matchId = e.currentTarget.getAttribute('data-match-id');
                    const inputs = document.querySelectorAll(`.playoff-score-input[data-match-id="${matchId}"]`);
                    logic.playoffs.autoSaveScore(matchId, inputs[0].value, inputs[1].value);
                });
            });
        },
        
        renderBracketRound: (bracket) => {
            if (!bracket) return '';

            const resolveName = (val) => {
                return logic.playoffs.participantName(val);
            };

            const getRoundLabel = (b) => {
                let count = 0;
                let node = b;
                while (node) { count++; node = node.nextRound; }
                if (count === 1) return 'Finale';
                if (count === 2) return 'Semifinale';
                if (count === 3) return 'Quarti di Finale';
                if (count === 4) return 'Ottavi di Finale';
                return `Round ${b.round}`;
            };

            let html = `<div class="flex flex-col space-y-6 w-64 min-w-[240px] justify-center">
                <h4 class="text-xs font-black uppercase tracking-widest text-center text-slate-400 mb-2">${getRoundLabel(bracket)}</h4>`;

            bracket.matches.forEach(match => {
                const winner = db.playoffs.matchResults[match.id];
                const isBye = match.team1 === 'BYE' || match.team2 === 'BYE';
                const isPending = match.team1 === 'TBD' || match.team2 === 'TBD';
                const team1Class = logic.playoffs.sameParticipant(winner, match.team1) ? 'font-bold bg-emerald-100/50 text-emerald-800' : 'text-slate-700';
                const team2Class = logic.playoffs.sameParticipant(winner, match.team2) ? 'font-bold bg-emerald-100/50 text-emerald-800' : 'text-slate-700';

                let body;
                if (isBye) {
                    body = `<div class="bg-amber-50 text-[10px] uppercase font-bold tracking-wider text-amber-600 p-2 text-center rounded-b-lg border-t border-amber-100">Passaggio Turno Automatico</div>`;
                } else if (isPending) {
                    body = `<div class="bg-slate-100 text-[10px] uppercase font-bold tracking-wider text-slate-400 p-2 text-center rounded-b-lg border-t border-slate-200">In attesa</div>`;
                } else {
                    body = `
                        <div class="flex items-center justify-center gap-1 p-2 bg-slate-100/50 rounded-b-lg border-t border-slate-200">
                            <input type="number" min="0" value="${match.score1 !== null ? match.score1 : ''}" class="w-12 p-1 text-center text-sm font-bold border-slate-300 rounded playoff-score-input" data-match-id="${match.id}" data-team="1">
                            <span class="text-slate-400 text-xs font-black mx-1">-</span>
                            <input type="number" min="0" value="${match.score2 !== null ? match.score2 : ''}" class="w-12 p-1 text-center text-sm font-bold border-slate-300 rounded playoff-score-input" data-match-id="${match.id}" data-team="2">
                        </div>
                    `;
                }

                html += `
                    <div class="bg-white border border-slate-200 rounded-lg shadow-sm relative overflow-hidden flex flex-col hover:border-slate-300 transition">
                        <div class="absolute top-0 right-0 bg-slate-100 text-[9px] font-mono text-slate-400 px-1.5 py-0.5 rounded-bl">ID:${match.id.slice(-4)}</div>
                        <div class="text-sm truncate p-3 pb-2 ${team1Class}">${resolveName(match.team1)}</div>
                        <div class="h-[1px] bg-slate-100 w-11/12 mx-auto"></div>
                        <div class="text-sm truncate p-3 pt-2 ${team2Class}">${resolveName(match.team2)}</div>
                        ${body}
                    </div>
                `;
            });
            
            html += `</div>`;
            
            if (bracket.nextRound) {
                // Aggiunta di un div "connettore" grafico invisibile per stanziare le colonne
                html += `<div class="w-8 flex-shrink-0 flex items-center justify-center relative">
                            <div class="w-full h-[2px] bg-slate-200 absolute top-1/2"></div>
                         </div>` + views.renderBracketRound(bracket.nextRound);
            }

            return html;
        },

        renderSettings: () => {
            let html = `
                <div class="max-w-5xl mx-auto pb-8">
                    
                    <!-- REGOLE DI PUNTEGGIO -->
                    <div class="card no-print">
                        <h3 class="text-xl font-semibold mb-6 border-b pb-2 flex items-center gap-2">
                            <i data-lucide="calculator" class="w-5 h-5 text-slate-500"></i> Regole di Punteggio
                        </h3>
                        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                            <div class="bg-slate-50 p-3 rounded-lg border border-slate-200">
                                <label class="block text-[10px] uppercase tracking-wide font-bold text-slate-500 mb-1">Vittoria Netta (>1 gol)</label>
                                <input type="number" id="points-win" value="${db.settings.pointsWin}" min="0" class="font-bold text-lg text-slate-800 bg-white">
                            </div>
                            <div class="bg-slate-50 p-3 rounded-lg border border-slate-200">
                                <label class="block text-[10px] uppercase tracking-wide font-bold text-slate-500 mb-1">Vittoria Misura (1 gol)</label>
                                <input type="number" id="points-win-narrow" value="${db.settings.pointsWinNarrow ?? 2}" min="0" class="font-bold text-lg text-slate-800 bg-white">
                            </div>
                            <div class="bg-slate-50 p-3 rounded-lg border border-slate-200">
                                <label class="block text-[10px] uppercase tracking-wide font-bold text-slate-500 mb-1">Pareggio</label>
                                <input type="number" id="points-draw" value="${db.settings.pointsDraw}" min="0" class="font-bold text-lg text-slate-800 bg-white">
                            </div>
                            <div class="bg-slate-50 p-3 rounded-lg border border-slate-200">
                                <label class="block text-[10px] uppercase tracking-wide font-bold text-slate-500 mb-1">Sconfitta Misura (1 gol)</label>
                                <input type="number" id="points-loss-narrow" value="${db.settings.pointsLossNarrow ?? 1}" min="0" class="font-bold text-lg text-slate-800 bg-white">
                            </div>
                            <div class="bg-slate-50 p-3 rounded-lg border border-slate-200">
                                <label class="block text-[10px] uppercase tracking-wide font-bold text-slate-500 mb-1">Sconfitta Netta</label>
                                <input type="number" id="points-loss" value="${db.settings.pointsLoss}" min="0" class="font-bold text-lg text-slate-800 bg-white">
                            </div>
                            <div class="bg-slate-50 p-3 rounded-lg border border-slate-200">
                                <label class="block text-[10px] uppercase tracking-wide font-bold text-slate-500 mb-1">Gol Target Gironi</label>
                                <input type="number" id="score-target" value="${db.settings.scoreTarget}" min="1" max="20" class="font-bold text-lg text-slate-800 bg-white">
                            </div>
                            <div class="bg-slate-50 p-3 rounded-lg border border-slate-200">
                                <label class="block text-[10px] uppercase tracking-wide font-bold text-slate-500 mb-1">Gol Target Playoff</label>
                                <input type="number" id="playoff-score-target" value="${db.settings.playoffScoreTarget}" min="1" max="20" class="font-bold text-lg text-slate-800 bg-white">
                            </div>
                        </div>
                    </div>

                    <!-- CALENDARIO E PLAYOFF SCALABILI -->
                    <div class="card no-print">
                        <h3 class="text-xl font-semibold mb-6 border-b pb-2 flex items-center gap-2">
                            <i data-lucide="settings-2" class="w-5 h-5 text-slate-500"></i> Generazione Torneo
                        </h3>
                        
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                            <div class="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                <label class="block text-xs uppercase tracking-wide font-bold text-slate-500 mb-2">Partite per Giocatore</label>
                                <input type="number" id="rounds-target" value="${db.settings.rounds}" min="1" class="mb-2 bg-white w-full">
                                <p class="text-xs text-slate-500">Durata della fase a gironi.</p>
                            </div>
                            <div class="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                <label class="block text-xs uppercase tracking-wide font-bold text-slate-500 mb-2">Numero Biliardini</label>
                                <input type="number" id="tables-count" value="${db.settings.tablesCount || 2}" min="1" max="20" class="mb-2 bg-white w-full">
                                <p class="text-xs text-slate-500">Quanti tavoli hai a disposizione.</p>
                            </div>
                            <div class="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                <label class="block text-xs uppercase tracking-wide font-bold text-slate-500 mb-2">Formazione Coppie</label>
                                <select id="team-formation-mode" class="mb-2 bg-white w-full">
                                    <option value="balanced-random" ${db.settings.teamFormationMode === 'balanced-random' || !db.settings.teamFormationMode ? 'selected' : ''}>Equilibrato (Punteggio)</option>
                                    <option value="random" ${db.settings.teamFormationMode === 'random' ? 'selected' : ''}>Casuale Puro</option>
                                </select>
                                <p class="text-xs text-slate-500">Come combinare Portieri e Attaccanti.</p>
                            </div>
                        </div>

                        <h4 class="font-bold text-slate-700 mb-3 uppercase tracking-wider text-sm border-b border-slate-100 pb-2">Struttura della Fase Finale</h4>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            <div class="bg-sky-50 p-4 rounded-lg border border-sky-200">
                                <label class="block text-xs uppercase tracking-wide font-bold text-sky-800 mb-2">Tabellone Principale (Scudetto)</label>
                                <select id="playoff-size" class="w-full bg-white font-bold text-sky-900 border-sky-300">
                                    <option value="auto" ${db.settings.playoffSize === 'auto' || !db.settings.playoffSize ? 'selected' : ''}>Automatico (Consigliato)</option>
                                    <option value="4" ${db.settings.playoffSize === 4 ? 'selected' : ''}>Top 4 (Solo Semifinali)</option>
                                    <option value="6" ${db.settings.playoffSize === 6 ? 'selected' : ''}>Top 6 (1° e 2° in Semifinale)</option>
                                    <option value="7" ${db.settings.playoffSize === 7 ? 'selected' : ''}>Top 7 (1° in Semifinale)</option>
                                    <option value="8" ${db.settings.playoffSize === 8 ? 'selected' : ''}>Top 8 (Quarti di finale)</option>
                                    <option value="10" ${db.settings.playoffSize === 10 ? 'selected' : ''}>Top 10 (1°-6° ai Quarti)</option>
                                    <option value="12" ${db.settings.playoffSize === 12 ? 'selected' : ''}>Top 12 (1°-4° ai Quarti)</option>
                                    <option value="16" ${db.settings.playoffSize === 16 ? 'selected' : ''}>Top 16 (Ottavi di finale)</option>
                                </select>
                                <p class="text-xs text-sky-700 mt-2">Scegli la grandezza del torneo principale in base agli iscritti.</p>
                            </div>

                            <div class="flex flex-col gap-3">
                                <label class="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition shadow-sm">
                                    <input type="checkbox" id="playoff-third-place" class="w-4 h-4 text-sky-600 rounded" ${db.settings.playoffThirdPlaceEnabled !== false ? 'checked' : ''}>
                                    <span class="text-sm font-bold text-slate-700">Finalina 3°/4° posto</span>
                                </label>
                                
                                <label class="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition shadow-sm">
                                    <input type="checkbox" id="playoff-fifth-place" class="w-4 h-4 text-sky-600 rounded" ${db.settings.playoffFifthPlaceEnabled ? 'checked' : ''}>
                                    <div class="flex flex-col">
                                        <span class="text-sm font-bold text-slate-700">Tabellone 5° - 8° posto</span>
                                        <span class="text-[10px] text-slate-400">Torneo tra le perdenti dei Quarti di finale</span>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <h4 class="font-bold text-slate-700 mb-3 uppercase tracking-wider text-sm border-b border-slate-100 pb-2">Tornei di Consolazione</h4>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            <label class="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100 transition">
                                <input type="checkbox" id="playoff-silver" class="w-4 h-4 text-amber-500 rounded mt-1" ${db.settings.playoffSilverEnabled ? 'checked' : ''}>
                                <div>
                                    <span class="block text-sm font-bold text-slate-800">Torneo Silver (Ripescati)</span>
                                    <span class="block text-xs text-slate-500 mt-1">Crea un tabellone parallelo a eliminazione diretta per chi non rientra nella fascia del tabellone principale.</span>
                                </div>
                            </label>

                            <label class="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100 transition">
                                <input type="checkbox" id="playoff-playout" class="w-4 h-4 text-red-500 rounded mt-1" ${db.settings.playoffPlayoutEnabled !== false ? 'checked' : ''}>
                                <div>
                                    <span class="block text-sm font-bold text-slate-800">Cucchiaio di Legno (Playout)</span>
                                    <span class="block text-xs text-slate-500 mt-1">Gli ultimissimi della classifica si sfidano per evitare l'ultimo posto assoluto.</span>
                                </div>
                            </label>
                        </div>
                        
                        <button id="save-settings-btn" class="btn btn-success shadow-sm">
                            <i data-lucide="save" class="w-4 h-4"></i> Salva Impostazioni
                        </button>
                    </div>

                    <!-- ZONA PERICOLOSA (Invariata) -->
                    <div class="card no-print border-red-200 bg-red-50">
                        <h3 class="text-xl font-semibold mb-2 text-red-700 flex items-center gap-2"><i data-lucide="alert-triangle" class="w-5 h-5"></i> Zona Pericolosa</h3>
                        <p class="text-sm text-slate-600 mb-4"><b>Reset Giocatori:</b> Azzera torneo mantenendo le regole.<br><b>Reset Totale:</b> Cancella tutto dal browser.</p>
                        <div class="flex gap-2">
                            <button id="reset-players-btn" class="btn btn-danger"><i data-lucide="users" class="w-4 h-4"></i> Reset Torneo</button>
                            <button id="reset-all-btn" class="btn btn-danger"><i data-lucide="alert-triangle" class="w-4 h-4"></i> Cancella Tutto</button>
                        </div>
                    </div>
                </div>
            `;
            
            contentView.innerHTML = html;
            lucide.createIcons();

            document.getElementById('save-settings-btn').addEventListener('click', () => {
                saveHistory();
                
                db.settings.pointsWin = parseInt(document.getElementById('points-win').value);
                db.settings.pointsWinNarrow = parseInt(document.getElementById('points-win-narrow').value);
                db.settings.pointsDraw = parseInt(document.getElementById('points-draw').value);
                db.settings.pointsLossNarrow = parseInt(document.getElementById('points-loss-narrow').value);
                db.settings.pointsLoss = parseInt(document.getElementById('points-loss').value);
                db.settings.scoreTarget = parseInt(document.getElementById('score-target').value);
                db.settings.playoffScoreTarget = parseInt(document.getElementById('playoff-score-target').value);
                db.settings.rounds = parseInt(document.getElementById('rounds-target').value);
                db.settings.tablesCount = parseInt(document.getElementById('tables-count').value) || 2;
                db.settings.teamFormationMode = document.getElementById('team-formation-mode').value;
                
                // SALVATAGGIO DELLE NUOVE IMPOSTAZIONI PLAYOFF (con la logica corretta per 'auto')
                const sizeVal = document.getElementById('playoff-size').value;
                db.settings.playoffSize = sizeVal === 'auto' ? 'auto' : parseInt(sizeVal);
                
                db.settings.playoffThirdPlaceEnabled = document.getElementById('playoff-third-place').checked;
                db.settings.playoffFifthPlaceEnabled = document.getElementById('playoff-fifth-place').checked;
                db.settings.playoffSilverEnabled = document.getElementById('playoff-silver').checked;
                db.settings.playoffPlayoutEnabled = document.getElementById('playoff-playout').checked;

                reloadFullUI();
                ui.showAlert('Impostazioni salvate! Ora puoi generare i Playoff con il nuovo formato.', 'success');
            });

            document.getElementById('reset-players-btn').addEventListener('click', () => {
                if (confirm('Sei sicuro di voler cancellare giocatori, calendario e playoff? Le impostazioni resteranno invariate. L\'azione non può essere annullata.')) {
                    logic.data.resetPlayersAndTournament();
                }
            });

            document.getElementById('reset-all-btn').addEventListener('click', () => {
                if (confirm('ATTENZIONE! Sei sicuro di voler resettare tutti i dati del torneo? Questa azione non può essere annullata.')) {
                    localStorage.removeItem('torneoGialloDB');
                    location.reload(); 
                }
            });
        },

        renderSchedule: () => {
            const opponentCounts = {};
            const pairCounts = {};
            db.schedule.forEach(m => {
                const t1 = [m.team1.p, m.team1.a]; const t2 = [m.team2.p, m.team2.a];
                t1.forEach(id1 => t2.forEach(id2 => { const k = [id1, id2].sort().join('_'); opponentCounts[k] = (opponentCounts[k] || 0) + 1; }));
                pairCounts[`${m.team1.p}_${m.team1.a}`] = (pairCounts[`${m.team1.p}_${m.team1.a}`] || 0) + 1;
                pairCounts[`${m.team2.p}_${m.team2.a}`] = (pairCounts[`${m.team2.p}_${m.team2.a}`] || 0) + 1;
            });
            
            let totalReds = 0;
            let totalYellows = 0;
            for(let k in pairCounts) if(pairCounts[k]>1) totalReds += (pairCounts[k]-1);
            for(let k in opponentCounts) if(opponentCounts[k]>1) totalYellows += (opponentCounts[k]-1);

            const matchesByRound = db.schedule.reduce((acc, match) => {
                const round = match.round;
                if (!acc[round]) acc[round] = [];
                acc[round].push(match);
                return acc;
            }, {});

            let html = `
                <div class="max-w-6xl mx-auto pb-8">
                    <!-- INTESTAZIONE CALENDARIO CON TASTO WHATSAPP -->
                    <div class="card no-print flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50 border-slate-200">
                        <div>
                            <h3 class="text-lg font-semibold mb-2 flex items-center gap-2">
                                <i data-lucide="calendar-days" class="w-5 h-5 text-slate-500"></i> Gestione Calendario
                            </h3>
                            <div class="flex gap-2 text-xs flex-wrap">
                                <div class="px-2 py-1 rounded-full ${totalReds>0 ? 'bg-red-100 text-red-700 border-red-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'} font-bold border tracking-wide uppercase">Coppie Ripetute: ${totalReds}</div>
                                <div class="px-2 py-1 rounded-full ${totalYellows>0 ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'} font-bold border tracking-wide uppercase">Avversari Ripetuti: ${totalYellows}</div>
                            </div>
                        </div>
                        <div class="flex flex-wrap gap-2">
                             <button id="share-whatsapp-btn" class="btn btn-secondary bg-white border-green-500 text-green-700 hover:bg-green-50 shadow-sm font-bold">
                                <i data-lucide="share-2" class="w-4 h-4"></i> Copia Turno
                            </button>
                             <button id="generate-schedule-btn" class="btn btn-primary shadow-sm">
                                <i data-lucide="plus" class="w-4 h-4"></i> Genera Nuovi Turni
                            </button>
                             <button id="reset-schedule-btn" class="btn btn-danger shadow-sm">
                                <i data-lucide="trash-2" class="w-4 h-4"></i> Svuota
                            </button>
                        </div>
                    </div>
            `;

            if (db.schedule.length > 0) {
                const availableAll = utils.getAvailableMatches();
                const occupiedCount = utils.getOccupiedPlayerIds().size;
                const inProgressMatches = db.schedule.filter(m => m.inProgress && !m.played);
                
                // GESTIONE DEI TAVOLI (BILIARDINI)
                const tablesCount = db.settings.tablesCount || 2;
                const freeTables = Math.max(0, tablesCount - inProgressMatches.length);
                const matchesToShow = availableAll.slice(0, freeTables); // Mostra solo quante i tavoli liberi
                
                html += `
                    <!-- PARTITE PRONTE -->
                    <div class="card no-print border-sky-200 shadow-sm">
                        <div class="flex flex-col md:flex-row justify-between md:items-center mb-4 border-b pb-3 gap-2">
                            <h3 class="text-lg font-semibold flex items-center gap-2 text-sky-800">
                                <i data-lucide="zap" class="w-5 h-5 text-sky-500"></i> Partite ai Tavoli
                            </h3>
                            <div class="flex gap-2 text-[10px] font-bold uppercase tracking-wider">
                                <span class="px-2 py-1 rounded bg-sky-100 text-sky-700">Tavoli Occupati: ${inProgressMatches.length}/${tablesCount}</span>
                            </div>
                        </div>
                        
                        ${inProgressMatches.length > 0 ? `
                            <div class="mb-5">
                                <p class="text-[10px] font-bold uppercase tracking-widest text-sky-600 mb-3 ml-1">Attualmente in corso</p>
                                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    ${inProgressMatches.map((m, index) => `
                                        <div class="flex flex-col gap-2 p-3 rounded-lg border border-sky-200 bg-sky-50 shadow-sm relative overflow-hidden" data-match-container="true">
                                            <div class="absolute top-0 left-0 w-1 h-full bg-sky-400"></div>
                                            <div class="flex items-center justify-between gap-3 pl-2">
                                                <div class="text-sm min-w-0">
                                                    <span class="text-[10px] text-sky-600 font-mono font-bold uppercase tracking-wide">Tavolo ${index + 1} &bull; Round ${m.round}</span><br>
                                                    <span class="font-bold truncate text-slate-800">${utils.getPlayerById(m.team1.p).name} + ${utils.getPlayerById(m.team1.a).name}</span>
                                                    <span class="text-slate-400 text-xs mx-1">vs</span>
                                                    <span class="font-bold truncate text-slate-800">${utils.getPlayerById(m.team2.p).name} + ${utils.getPlayerById(m.team2.a).name}</span>
                                                </div>
                                                <button class="btn btn-ghost btn-sm toggle-inprogress-btn text-sky-600 hover:bg-sky-100" data-id="${m.id}" data-value="false" title="Ferma/Metti in pausa">
                                                    <i data-lucide="pause" class="w-4 h-4"></i>
                                                </button>
                                            </div>
                                            <div class="flex items-center justify-between gap-2 pt-2 mt-1 border-t border-sky-200/50 pl-2">
                                                <label class="text-[10px] uppercase font-bold text-sky-700">Salva Risultato:</label>
                                                <div class="flex items-center gap-2">
                                                    <input type="number" min="0" value="${m.score1 !== null ? m.score1 : ''}" class="w-12 p-1 text-center text-sm font-bold border-sky-200 rounded autosave-input" data-id="${m.id}" data-team="1">
                                                    <span class="text-sky-300">-</span>
                                                    <input type="number" min="0" value="${m.score2 !== null ? m.score2 : ''}" class="w-12 p-1 text-center text-sm font-bold border-sky-200 rounded autosave-input" data-id="${m.id}" data-team="2">
                                                </div>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                        
                        ${matchesToShow.length === 0 ? `
                            <div class="p-4 text-center text-slate-400 border border-dashed border-slate-200 rounded-lg text-sm bg-slate-50">
                                ${freeTables === 0 ? 'Tutti i tavoli sono occupati!' : 'Nessuna partita giocabile al momento.<br><span class="text-xs">(I giocatori necessari sono impegnati in altre sfide, oppure il calendario è completo).</span>'}
                            </div>
                        ` : `
                            <div>
                                <!-- COLORE GIALLO/AMBER RIPRISTINATO QUI -->
                                <p class="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-3 ml-1">Partite Pronte per i Tavoli Liberi (${freeTables})</p>
                                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    ${matchesToShow.map(m => `
                                        <div class="flex items-center justify-between gap-3 p-3 rounded-lg border border-amber-300 bg-amber-50 shadow-sm hover:border-amber-400 transition" data-match-container="true">
                                            <div class="text-sm min-w-0">
                                                <span class="text-[10px] text-amber-700/60 font-mono uppercase font-bold">Round ${m.round}</span><br>
                                                <span class="font-bold truncate text-slate-800">${utils.getPlayerById(m.team1.p).name} + ${utils.getPlayerById(m.team1.a).name}</span>
                                                <span class="text-amber-500/50 font-bold text-xs mx-0.5">VS</span>
                                                <span class="font-bold truncate text-slate-800">${utils.getPlayerById(m.team2.p).name} + ${utils.getPlayerById(m.team2.a).name}</span>
                                            </div>
                                            <button class="btn btn-sm bg-amber-200 text-amber-900 font-bold hover:bg-amber-300 shadow-sm start-match-btn flex-shrink-0" data-id="${m.id}">
                                                <i data-lucide="play" class="w-4 h-4 text-amber-700"></i> Assegna
                                            </button>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        `}
                    </div>
                `;
            }

            if (db.schedule.length === 0) {
                html += '<div class="p-12 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-white">Il calendario non è stato ancora generato. Usa il pulsante in alto.</div>';
            } else {
                Object.keys(matchesByRound).sort((a, b) => a - b).forEach(round => {
                    const roundMatches = matchesByRound[round].filter(m => !m.inProgress);
                    const playedCount = roundMatches.filter(m => m.played).length;
                    const isComplete = roundMatches.length > 0 && playedCount === roundMatches.length;
                    const collapsed = roundCollapseOverrides.hasOwnProperty(round) ? roundCollapseOverrides[round] : isComplete;

                    html += `
                        <div class="card shadow-sm mb-4">
                            <div class="flex justify-between items-center mb-2 border-b pb-3 cursor-pointer round-header group" data-round="${round}">
                                <h3 class="text-lg font-bold flex items-center gap-3 text-slate-700 group-hover:text-slate-900 transition">
                                    Round ${round} <span class="text-xs font-normal text-slate-400">(${roundMatches.length} Partite)</span>
                                    ${isComplete ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700"><i data-lucide="check" class="w-3 h-3 inline mr-1"></i>Completato</span>' : `<span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500">${playedCount}/${roundMatches.length} completate</span>`}
                                </h3>
                                <button class="btn btn-ghost btn-sm round-toggle-btn no-print text-slate-400 group-hover:bg-slate-100" data-round="${round}">
                                    <i data-lucide="${collapsed ? 'chevron-down' : 'chevron-up'}" class="w-5 h-5"></i>
                                </button>
                            </div>
                            <div class="${collapsed ? 'hidden' : 'mt-4'}" id="round-body-${round}">
                                <div class="overflow-x-auto rounded-lg border border-slate-200">
                                    <table class="w-full table-striped min-w-[600px] text-sm">
                                        <thead class="bg-slate-50 border-b border-slate-200">
                                            <tr>
                                                <th class="text-slate-500 font-semibold py-2">Partita</th>
                                                <th class="text-slate-500 font-semibold py-2">Squadra 1</th>
                                                <th class="text-slate-500 font-semibold py-2">Squadra 2</th>
                                                <th class="no-print text-slate-500 font-semibold py-2">Risultato</th>
                                                <th class="no-print text-slate-500 font-semibold py-2">Stato</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${roundMatches.map(match => {
                                                const team1Name = `${utils.getPlayerById(match.team1.p).name} &bull; ${utils.getPlayerById(match.team1.a).name}`;
                                                const team2Name = `${utils.getPlayerById(match.team2.p).name} &bull; ${utils.getPlayerById(match.team2.a).name}`;
                                                
                                                const k1 = `${match.team1.p}_${match.team1.a}`; 
                                                const k2 = `${match.team2.p}_${match.team2.a}`;
                                                const partnerRepeat = pairCounts[k1] > 1 || pairCounts[k2] > 1;
                                                
                                                let oppRepetition = false;
                                                const t1 = [match.team1.p, match.team1.a]; const t2 = [match.team2.p, match.team2.a];
                                                t1.forEach(id1 => { t2.forEach(id2 => { const key = [id1, id2].sort().join('_'); if (opponentCounts[key] > 1) oppRepetition = true; }); });
                                                
                                                let rowClass = ""; let warnIcon = "";
                                                if (match.played) {
                                                    rowClass = "bg-emerald-50/30";
                                                    warnIcon = `<i data-lucide="check" class="w-4 h-4 text-emerald-500 inline mr-1"></i>`;
                                                } else if (match.inProgress) { rowClass = "bg-sky-50"; warnIcon = `<i data-lucide="play-circle" class="w-4 h-4 text-sky-500 inline mr-1"></i>`; }
                                                else if (partnerRepeat) { rowClass = "bg-red-50"; warnIcon = `<i data-lucide="users" class="w-4 h-4 text-red-500 inline mr-1" title="Coppia ripetuta"></i>`; } 
                                                else if (oppRepetition) { rowClass = "bg-amber-50/50"; warnIcon = `<i data-lucide="users" class="w-4 h-4 text-amber-500 inline mr-1" title="Avversario ripetuto"></i>`; }
                                                
                                                const status = match.played ? 
                                                    `<span class="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700">Giocata</span>` : 
                                                    match.inProgress ?
                                                    `<span class="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-sky-100 text-sky-700">In corso</span>` :
                                                    `<span class="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500">Da giocare</span>`;
                                                
                                                const printBoxes = `
                                                    <div class="only-print flex items-center mt-1">
                                                        <span class="score-input-print-small"></span> <span class="score-input-print-small"></span> - <span class="score-input-print-small"></span> <span class="score-input-print-small"></span>
                                                    </div>`;

                                                return `
                                                    <tr class="${rowClass} border-b border-slate-100 last:border-0 hover:bg-slate-50 transition" data-match-container="true">
                                                        <td class="text-xs text-slate-400 font-mono flex items-center gap-1 py-3">${warnIcon} #${match.round}.${match.id.slice(-4)}</td>
                                                        <td class="font-medium ${pairCounts[k1]>1?'text-red-600 font-bold':''} text-slate-700">${team1Name}</td>
                                                        <td class="font-medium ${pairCounts[k2]>1?'text-red-600 font-bold':''} text-slate-700">${team2Name}</td>
                                                        <td class="no-print">
                                                            <div class="flex gap-1.5 items-center">
                                                                <input type="number" min="0" value="${match.score1 !== null ? match.score1 : ''}" class="w-12 p-1 text-center font-bold text-sm border-slate-200 rounded autosave-input" data-id="${match.id}" data-team="1">
                                                                <span class="text-slate-300">-</span>
                                                                <input type="number" min="0" value="${match.score2 !== null ? match.score2 : ''}" class="w-12 p-1 text-center font-bold text-sm border-slate-200 rounded autosave-input" data-id="${match.id}" data-team="2">
                                                            </div>
                                                            ${printBoxes}
                                                        </td>
                                                        <td class="no-print">${status}</td>
                                                    </tr>
                                                `;
                                            }).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    `;
                });
                
                html += `</div>`; 
            }

            contentView.innerHTML = html;
            lucide.createIcons();

            // EVENTO TASTO WHATSAPP (COPIA NEGLI APPUNTI)
            document.getElementById('share-whatsapp-btn')?.addEventListener('click', () => {
                const inProgress = db.schedule.filter(m => m.inProgress && !m.played);
                if (inProgress.length === 0) {
                    ui.showAlert('Non ci sono partite attualmente ai tavoli da condividere!', 'error');
                    return;
                }
                
                let textToCopy = `🏆 *AGGIORNAMENTO TORNEO* 🏆\n\n🔜 *Partite in corso:*\n`;
                inProgress.forEach((m, index) => {
                    const t1p = utils.getPlayerById(m.team1.p).name;
                    const t1a = utils.getPlayerById(m.team1.a).name;
                    const t2p = utils.getPlayerById(m.team2.p).name;
                    const t2a = utils.getPlayerById(m.team2.a).name;
                    textToCopy += `⚽ *Tavolo ${index + 1}:* ${t1p} e ${t1a} 🆚 ${t2p} e ${t2a}\n`;
                });
                
                navigator.clipboard.writeText(textToCopy).then(() => {
                    ui.showAlert('Partite copiate! Incolla il messaggio su WhatsApp.', 'success');
                }).catch(() => {
                    ui.showAlert('Errore nella copia. Riprova.', 'error');
                });
            });

            document.getElementById('generate-schedule-btn')?.addEventListener('click', logic.schedule.generate);
            document.getElementById('reset-schedule-btn')?.addEventListener('click', () => {
                 if (confirm('Sei sicuro di voler resettare l\'intero calendario? I punteggi andranno persi.')) {
                    logic.schedule.reset();
                }
            });

            document.querySelectorAll('.round-header, .round-toggle-btn').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const round = e.currentTarget.getAttribute('data-round');
                    const roundMatches = matchesByRound[round];
                    const isComplete = roundMatches.length > 0 && roundMatches.every(m => m.played);
                    const currentlyCollapsed = roundCollapseOverrides.hasOwnProperty(round) ? roundCollapseOverrides[round] : isComplete;
                    roundCollapseOverrides[round] = !currentlyCollapsed;
                    views.renderSchedule();
                });
            });

            document.querySelectorAll('.start-match-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    logic.schedule.setInProgress(e.currentTarget.getAttribute('data-id'), true);
                });
            });

            document.querySelectorAll('.toggle-inprogress-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = e.currentTarget.getAttribute('data-id');
                    const value = e.currentTarget.getAttribute('data-value') === 'true';
                    logic.schedule.setInProgress(id, value);
                });
            });

            document.querySelectorAll('.autosave-input').forEach(input => {
                const saveScore = (e) => {
                    const id = e.target.getAttribute('data-id');
                    const container = e.target.closest('[data-match-container="true"]');
                    if (!container) return;

                    const score1Input = container.querySelector('[data-team="1"]');
                    const score2Input = container.querySelector('[data-team="2"]');
                    const score1 = score1Input ? score1Input.value : '';
                    const score2 = score2Input ? score2Input.value : '';

                    const match = db.schedule.find(m => m.id === id);
                    const wasPlayed = match ? match.played : false;

                    logic.schedule.autoSaveResult(id, score1, score2);
                    
                    const isPlayedNow = match ? match.played : false;
                    if (wasPlayed !== isPlayedNow) {
                        views.renderSchedule();
                    }
                };

                // Rimuoviamo l'evento 'change' per evitare che la partita si chiuda mentre usi le freccette
                input.addEventListener('blur', saveScore);
                
                // Salviamo comodamente anche se l'utente preme il tasto "Invio" sulla tastiera
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.target.blur(); // Togliendo il focus, fa scattare in automatico il salvataggio
                    }
                });
            });
        },

        renderTvMode: () => {
            const tvContent = document.getElementById('tv-content');
            if (!tvContent) return;

            // 1. IL MOTORE SEGRETO: Legge i dati aggiornati dal disco in background!
            try {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    const val = localStorage.getItem(key);
                    if (val && val.includes('"players"') && val.includes('"schedule"')) {
                        const freshData = JSON.parse(val);
                        // Aggiorna il "cervello" della TV con i dati freschi dell'altra scheda
                        db.players = freshData.players || db.players;
                        db.schedule = freshData.schedule || db.schedule;
                        db.settings = freshData.settings || db.settings;
                        break; // Dati trovati e caricati, esce dal ciclo
                    }
                }
            } catch (e) {
                console.error("Errore lettura dati TV:", e);
            }

            // 2. PREPARAZIONE DATI
            const liveMatches = db.schedule.filter(m => m.inProgress && !m.played);
            const standings = utils.getStandings(); // Prende tutta la classifica intera

            // 3. GRAFICA
            let html = `
                <!-- Colonna Sinistra: Partite Live -->
                <div>
                    <h2 class="tv-section-title"><i data-lucide="zap" class="w-6 h-6 text-amber-500"></i> Partite in Corso</h2>
                    ${liveMatches.length === 0 ? '<p class="text-slate-400">Nessuna partita in corso al momento.</p>' : ''}
                    ${liveMatches.map(m => `
                        <div class="tv-match-card is-live">
                            <div class="flex justify-between items-center mb-3 border-b border-slate-700/50 pb-2">
                                <span class="tv-pill tv-pill-gold">Round ${m.round}</span>
                                <span class="tv-pill tv-pill-green animate-pulse">In Corso</span>
                            </div>
                            <div class="tv-team-row text-blue-100">
                                <div><span class="tv-role-badge tv-role-p mr-1">P</span>${utils.getPlayerById(m.team1.p).name} &bull; <span class="tv-role-badge tv-role-a mr-1 text-xs">A</span>${utils.getPlayerById(m.team1.a).name}</div>
                                <div class="tv-score-box">${m.score1 !== null ? m.score1 : '0'}</div>
                            </div>
                            <div class="tv-team-row text-red-100 mt-2">
                                <div><span class="tv-role-badge tv-role-p mr-1">P</span>${utils.getPlayerById(m.team2.p).name} &bull; <span class="tv-role-badge tv-role-a mr-1 text-xs">A</span>${utils.getPlayerById(m.team2.a).name}</div>
                                <div class="tv-score-box">${m.score2 !== null ? m.score2 : '0'}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <!-- Colonna Destra: Classifica Completa -->
                <div class="tv-card">
                    <h2 class="tv-section-title"><i data-lucide="trophy" class="w-6 h-6 text-amber-500"></i> Classifica Completa</h2>
                    <table class="tv-standings-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Giocatore</th>
                                <th>Punti</th>
                                <th>Giocate</th>
                                <th>Diff</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${standings.map((s, index) => `
                                <tr class="${index < 3 ? 'tv-top-rank' : ''}">
                                    <td>${index + 1}</td>
                                    <td>${s.name} <span class="text-[0.65rem] ml-2 px-1.5 py-0.5 rounded ${s.role === 'Portiere' ? 'bg-sky-500/20 text-sky-300' : 'bg-orange-500/20 text-orange-300'}">${s.role[0]}</span></td>
                                    <td class="font-bold text-amber-400 text-lg">${s.Pts}</td>
                                    <td>${s.G}</td>
                                    <td>${s.Diff > 0 ? '+'+s.Diff : s.Diff}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;

            tvContent.innerHTML = html;
            lucide.createIcons();

            // 4. TIMER DI AUTO-AGGIORNAMENTO
            if (!views.tvInterval) {
                views.tvInterval = setInterval(() => {
                    const modal = document.getElementById('tv-modal');
                    // Se la modale è aperta, aggiorna tutto (pescando i nuovi dati)
                    if (modal && !modal.classList.contains('hidden')) {
                        views.renderTvMode();
                    } else {
                        // Se chiudi la TV, spegne il timer per non affaticare il PC
                        clearInterval(views.tvInterval);
                        views.tvInterval = null;
                    }
                }, 5000); // Aggiorna ogni 5 secondi!
            }
        },
    };


    // ==========================================
    // 7. INIZIALIZZAZIONE E BOOT
    // ==========================================
    const setSaveStatus = (message, tone = 'neutral') => {
        if (!saveStatus) return;

        saveStatus.textContent = message;
        saveStatus.dataset.tone = tone;
        if (tone === 'success') {
            clearTimeout(setSaveStatus.timeoutId);
            setSaveStatus.timeoutId = setTimeout(() => {
                saveStatus.textContent = 'Salvataggio automatico attivo';
                saveStatus.dataset.tone = 'neutral';
            }, 1600);
        }
    };

    const flushStateToStorage = () => {
        try {
            const stateToSave = {
                players: db.players,
                schedule: db.schedule,
                settings: db.settings,
                playoffs: db.playoffs
            };
            localStorage.setItem('torneoGialloDB', JSON.stringify(stateToSave));
            setSaveStatus('Dati salvati sul dispositivo.', 'success');
        } catch (error) {
            console.error('Errore salvataggio localStorage:', error);
            setSaveStatus('Errore salvataggio locale.', 'error');
        }
    };

    const reloadFullUI = () => {
        ui.navigateTo(ui.currentView);
        updateHistoryButtons();
        flushStateToStorage();
    };

    // === FIX SCHERMATA BIANCA E NAVIGAZIONE ===
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            const view = e.currentTarget.getAttribute('data-view');
            if (view) { 
                ui.navigateTo(view); 
            }
        });
    });

    // === GESTIONE MODALITÀ TV (Nuovo HTML) ===
    document.getElementById('tv-mode-btn')?.addEventListener('click', () => {
        const tvModal = document.getElementById('tv-modal');
        if (tvModal) {
            tvModal.classList.remove('hidden');
            views.renderTvMode(); // Genera i contenuti live
        }
    });

    document.getElementById('tv-close-btn')?.addEventListener('click', () => {
        document.getElementById('tv-modal')?.classList.add('hidden');
    });

    // Funzione per il Fullscreen del browser in modalità TV
    document.getElementById('tv-fullscreen-btn')?.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => console.error(err));
        } else {
            document.exitFullscreen();
        }
    });

    if (printSectionBtn) {
        printSectionBtn.addEventListener('click', () => window.print());
    }

    importJsonFile?.addEventListener('change', logic.data.loadFromJSON);

    // Carica dati da localStorage se presenti
    const savedData = localStorage.getItem('torneoGialloDB');
    if (savedData) {
        try {
            const loadedDb = JSON.parse(savedData);
            db = {
                ...db, 
                ...loadedDb, 
                history: [],
                historyIndex: -1,
                settings: { ...db.settings, ...(loadedDb.settings || {}) },
                playoffs: { ...db.playoffs, ...(loadedDb.playoffs || {}) }
            };
            saveHistory();
            ui.showAlert('Dati precedenti caricati.', 'info');
        } catch (e) {
            console.error("Errore nel caricamento da localStorage", e);
            saveHistory();
        }
    } else {
        saveHistory();
    }
    
    // Autosave globale ogni 10 secondi
    setInterval(() => {
        flushStateToStorage();
    }, 10000);

    window.addEventListener('beforeunload', flushStateToStorage);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            flushStateToStorage();
        }
    });

    // Boot finale
    setTimeout(() => { reloadFullUI(); }, 100);

});
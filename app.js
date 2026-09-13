window.onload = () => {
    lucide.createIcons();
};

document.addEventListener('DOMContentLoaded', () => {

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
            playoffsTop: 8,
            playoffFormat: 'role-balanced',
            playoffRoleSize: 8,
            playoffDirectTeams: 0,
            playoffFifthPlaceEnabled: true,
            teamFormationMode: 'balanced-random'
        },
        playoffs: {
            qualificationBracket: null,
            directTeam: null,
            directTeams: [],
            mainBracket: null,
            thirdPlaceBracket: null,
            fifthPlaceBracket: null,
            teams: {},
            playoutBracket: null,
            matchResults: {},
            tiebreak: null
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
                if (goalkeepers.length !== attackers.length || goalkeepers.length < 2) {
                    return;
                }

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
                                        if (prevPairs.has(`${t.players[0]}_${t.players[1]}`)) {
                                            hasForbiddenRepeat = true;
                                        }
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
                const topN = db.settings.playoffsTop;
                if (standings.length <= topN) return null;

                const cutoffPlayer = standings[topN - 1];
                const nextPlayer = standings[topN];
                if (cutoffPlayer.Pts === nextPlayer.Pts && cutoffPlayer.Diff === nextPlayer.Diff) {
                    const tied = standings.filter(p => p.Pts === cutoffPlayer.Pts && p.Diff === cutoffPlayer.Diff);
                    return tied;
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
                    ui.showAlert(`Non puoi creare i playoff finché non sono terminate tutte le partite del calendario (${unfinishedMatches.length} partite ancora non concluse).`, 'warning');
                    return;
                }

                db.playoffs.teams = {};
                const configuredRoleSize = Number(db.settings.playoffRoleSize);
                const roleSize = [6, 7, 8].includes(configuredRoleSize) ? configuredRoleSize : 8;
                db.settings.playoffRoleSize = roleSize;
                const format = {
                    6: { direct: 2 },
                    7: { direct: 1 },
                    8: { direct: 0 }
                }[roleSize];
                db.settings.playoffDirectTeams = format.direct;
                const standings = utils.getStandings();
                const directCount = format.direct;
                const goalkeepers = standings.filter(player => player.role === 'Portiere');
                const attackers = standings.filter(player => player.role === 'Attaccante');
                if (goalkeepers.length < roleSize || attackers.length < roleSize) {
                    ui.showAlert(`Servono almeno ${roleSize} portieri e ${roleSize} attaccanti per questo formato.`, 'error');
                    return;
                }

                saveHistory();
                const qualifiedGoalkeepers = goalkeepers.slice(0, roleSize);
                const qualifiedAttackers = attackers.slice(0, roleSize);
                const directTeams = qualifiedGoalkeepers.slice(0, directCount).map((goalkeeper, index) => {
                    const attacker = qualifiedAttackers[index];
                    const team = {
                        id: `team-${goalkeeper.id}-${attacker.id}`,
                        name: `${goalkeeper.name} + ${attacker.name}`,
                        players: [goalkeeper.id, attacker.id],
                        strength: (Number.isFinite(goalkeeper?.Pts) ? goalkeeper.Pts : 0) + (Number.isFinite(attacker?.Pts) ? attacker.Pts : 0)
                    };
                    db.playoffs.teams[team.id] = team;
                    return team;
                });
                const preliminaryTeams = logic.playoffs.createBalancedTeams(
                    qualifiedGoalkeepers.slice(directCount),
                    qualifiedAttackers.slice(directCount)
                );
                const selectedTeams = [...directTeams, ...preliminaryTeams];
                let playoutTeams = logic.playoffs.createBalancedTeams(goalkeepers.slice(roleSize), attackers.slice(roleSize));
                let excludedPlayoutTeam = null;
                if (playoutTeams.length % 2 !== 0) {
                    playoutTeams.sort((a, b) => a.strength - b.strength);
                    excludedPlayoutTeam = playoutTeams.shift();
                }

                db.playoffs.matchResults = {};
                db.playoffs.qualificationBracket = null;
                db.playoffs.directTeam = directTeams[0] || null;
                db.playoffs.directTeams = directTeams;
                db.playoffs.fifthPlaceBracket = null;
                db.playoffs.mainBracket = roleSize === 8 ? logic.playoffs.buildKnockout(selectedTeams) : null;
                if (roleSize !== 8) {
                    db.playoffs.qualificationBracket = {
                        round: 1,
                        matches: preliminaryTeams.reduce((matches, team, index) => {
                            if (index % 2 === 0) matches.push({ id: utils.generateId(), team1: team, team2: preliminaryTeams[index + 1], score1: null, score2: null });
                            return matches;
                        }, []),
                        nextRound: null
                    };
                }
                db.playoffs.thirdPlaceBracket = null;
                db.playoffs.playoutBracket = playoutTeams.length >= 2 ? logic.playoffs.buildKnockout(playoutTeams) : null;
                db.playoffs.excludedPlayoutTeam = excludedPlayoutTeam;
                reloadFullUI();
                ui.showAlert(`Preliminari (${preliminaryTeams.length / 2} partite) e playout generati.`, 'success');
            },
            tryBuildMainFromQualifications: () => {
                const qualification = db.playoffs.qualificationBracket;
                if (!qualification || !qualification.matches.every(match => db.playoffs.matchResults[match.id])) return;
                const directTeams = db.playoffs.directTeams || (db.playoffs.directTeam ? [db.playoffs.directTeam] : []);
                const winners = qualification.matches.map(match => db.playoffs.matchResults[match.id]);
                if (directTeams.length + winners.length !== 4) return;
                db.playoffs.mainBracket = logic.playoffs.buildKnockout([...directTeams, ...winners]);
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
                if (db.playoffs.thirdPlaceBracket) return;
                const mainBracket = db.playoffs.mainBracket;
                const semifinals = mainBracket?.nextRound;
                if (!semifinals || semifinals.matches.length !== 2) return;
                if (!semifinals.matches.every(match => logic.playoffs.getMatchWinner(match))) return;

                const losers = semifinals.matches.map(match => {
                    const winner = logic.playoffs.getMatchWinner(match);
                    return logic.playoffs.sameParticipant(winner, match.team1) ? match.team2 : match.team1;
                });
                db.playoffs.thirdPlaceBracket = logic.playoffs.buildKnockout(logic.playoffs.remixTeams(losers));
            },
            tryBuildFifthPlaceBracket: () => {
                if (db.playoffs.fifthPlaceBracket || !db.settings.playoffFifthPlaceEnabled) return;
                const mainBracket = db.playoffs.mainBracket;
                if (!mainBracket || mainBracket.matches.length !== 4) return;
                if (!mainBracket.matches.every(match => logic.playoffs.getMatchWinner(match))) return;

                const losers = mainBracket.matches.map(match => {
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
                for (const key of ['qualificationBracket', 'mainBracket', 'thirdPlaceBracket', 'fifthPlaceBracket', 'playoutBracket']) {
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

                if (bracketKey === 'qualificationBracket') {
                    logic.playoffs.tryBuildMainFromQualifications();
                }
                if (bracketKey === 'mainBracket' || bracketKey === 'playoutBracket') {
                    const currentRound = logic.playoffs.findMatchWithLevel(rootBracket, matchId)?.level;
                    logic.playoffs.remixWinnersForNextRound(rootBracket, currentRound);
                }
                if (bracketKey === 'mainBracket') {
                    logic.playoffs.tryBuildThirdPlaceBracket();
                    logic.playoffs.tryBuildFifthPlaceBracket();
                }

                reloadFullUI();
            },
            findMatch: (bracket, matchId) => {
                if (!bracket) return null;
                const found = bracket.matches.find(m => m.id === matchId);
                if (found) return found;
                return logic.playoffs.findMatch(bracket.nextRound, matchId);
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
            getPenultimateRoundLosers: (bracket) => {
                if (!bracket) return [];
                let node = bracket;
                let prev = null;
                while (node.nextRound) { prev = node; node = node.nextRound; }
                if (!prev) return [];
                return prev.matches.map(m => {
                    const winner = db.playoffs.matchResults[m.id];
                    if (!winner || m.team1 === 'BYE' || m.team2 === 'BYE') return null;
                    return logic.playoffs.sameParticipant(winner, m.team1) ? m.team2 : m.team1;
                }).filter(Boolean);
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
                    ui.showAlert('In un turno ad eliminazione diretta non può esserci pareggio: inserisci punteggi diversi.', 'error');
                    return;
                }

                const target = db.settings.playoffScoreTarget;
                if (s1 !== target && s2 !== target) {
                    ui.showAlert(`Attenzione: nessuna squadra ha raggiunto il gol target playoff (${target}). Risultato salvato comunque.`, 'warning');
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
                <div class="card no-print">
                    <h3 class="text-xl font-semibold mb-4 border-b pb-2">Azioni Avanzate e Backup</h3>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <button id="export-json-btn" class="btn btn-secondary">
                            <i data-lucide="download" class="w-4 h-4"></i> Esporta Dati JSON
                        </button>
                        <button id="import-json-btn" class="btn btn-secondary">
                            <i data-lucide="upload" class="w-4 h-4"></i> Importa Dati JSON
                        </button>
                        <button id="export-pdf-btn" class="btn btn-secondary">
                            <i data-lucide="file-text" class="w-4 h-4"></i> Esporta PDF Classifica
                        </button>
                    </div>
                </div>
                
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
                    <div class="card p-4 flex items-center bg-sky-50 shadow-md">
                        <i data-lucide="users" class="w-8 h-8 mr-4 text-sky-600"></i>
                        <div>
                            <p class="text-sm text-slate-500">Giocatori Totali</p>
                            <p class="text-2xl font-bold text-slate-800">${db.players.length}</p>
                        </div>
                    </div>
                    <div class="card p-4 flex items-center bg-sky-50 shadow-md">
                        <i data-lucide="calendar" class="w-8 h-8 mr-4 text-sky-600"></i>
                        <div>
                            <p class="text-sm text-slate-500">Partite Calendario</p>
                            <p class="text-2xl font-bold text-slate-800">${db.schedule.length}</p>
                        </div>
                    </div>
                    <div class="card p-4 flex items-center bg-sky-50 shadow-md">
                        <i data-lucide="check-circle" class="w-8 h-8 mr-4 text-sky-600"></i>
                        <div>
                            <p class="text-sm text-slate-500">Partite Giocate</p>
                            <p class="text-2xl font-bold text-slate-800">${totalPlayed}</p>
                        </div>
                    </div>
                </div>
                
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                    <div class="card">
                        <h3 class="text-xl font-semibold mb-4 border-b pb-2">Top 5 Classifica</h3>
                        ${standings.length > 0 ? `
                            <table class="w-full">
                                <thead>
                                    <tr>
                                        <th class="text-sm font-semibold text-left p-2">#</th>
                                        <th class="text-sm font-semibold text-left p-2">Nome</th>
                                        <th class="text-sm font-semibold text-left p-2">Pts</th>
                                        <th class="text-sm font-semibold text-left p-2">G</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${standings.slice(0, 5).map((s, index) => `
                                        <tr class="border-b last:border-b-0">
                                            <td class="p-2">${index + 1}</td>
                                            <td class="p-2 font-medium">${s.name}</td>
                                            <td class="p-2 font-bold text-gold-strong">${s.Pts}</td>
                                            <td class="p-2">${s.G}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        ` : '<p class="text-slate-500">Nessun dato in classifica.</p>'}
                    </div>
                    
                    <div class="card">
                        <h3 class="text-xl font-semibold mb-4 border-b pb-2">Statistiche Giocate</h3>
                        <div class="h-64"><canvas id="statisticheChart"></canvas></div>
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

                // NUOVO: Filtro Ricerca
                if (searchQuery) {
                    list = list.filter(p => p.name.toLowerCase().includes(searchQuery));
                }
                
                return list;
            };

            let html = `
                <div class="card no-print">
                    <h3 class="text-xl font-semibold mb-4">Aggiungi Nuovo Giocatore</h3>
                    <div class="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                        <div class="md:col-span-4">
                            <input type="text" id="new-player-name" placeholder="Nome Giocatore" maxlength="50">
                        </div>
                        <div class="md:col-span-4">
                            <select id="new-player-role">
                                <option value="">Seleziona Ruolo...</option>
                                <option value="Portiere">Portiere</option>
                                <option value="Attaccante">Attaccante</option>
                            </select>
                        </div>
                        <div class="md:col-span-4 flex gap-2">
                            <button id="add-player-btn" class="btn btn-primary flex-1">
                                <i data-lucide="user-plus" class="w-4 h-4"></i> Aggiungi
                            </button>
                            <button id="bulk-btn" class="btn btn-secondary flex-1" title="Importa lista">
                                <i data-lucide="list" class="w-4 h-4"></i> Multiplo
                            </button>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="flex flex-col md:flex-row justify-between md:items-center mb-4 border-b pb-2 gap-4">
                        <h3 class="text-xl font-semibold whitespace-nowrap">Lista Giocatori (${db.players.length})</h3>
                        <div class="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                            <!-- NUOVO: Barra di Ricerca -->
                            <div class="relative flex-grow max-w-sm">
                                <i data-lucide="search" class="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"></i>
                                <input type="search" id="player-search" value="${searchQuery}" placeholder="Cerca giocatore..." class="w-full pl-9 p-2 border rounded text-sm">
                            </div>
                            <select id="player-sort-mode" class="w-auto p-2 border rounded text-sm bg-white">
                                <option value="name" ${sortMode==='name'?'selected':''}>Ordina per Nome</option>
                                <option value="alternate" ${sortMode==='alternate'?'selected':''}>Alterna P/A</option>
                                <option value="P_first" ${sortMode==='P_first'?'selected':''}>Portieri, poi Attaccanti</option>
                                <option value="A_first" ${sortMode==='A_first'?'selected':''}>Attaccanti, poi Portieri</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="stat-grid mb-4">
                         <div class="p-4 bg-slate-50 rounded-md shadow-sm border border-slate-100 text-slate-700">Portieri: <b class="text-indigo-700">${P.length}</b></div>
                         <div class="p-4 bg-slate-50 rounded-md shadow-sm border border-slate-100 text-slate-700">Attaccanti: <b class="text-orange-700">${A.length}</b></div>
                         <div class="p-4 bg-slate-50 rounded-md shadow-sm border border-slate-100 text-slate-700">Partite Target: <b>${db.settings.rounds}</b></div>
                    </div>

                    <div id="player-list-table-container">
                        ${views.renderPlayerTable(getPlayerListToRender(sortMode))}
                    </div>
                </div>
            `;
            
            contentView.innerHTML = html;
            lucide.createIcons();
            
            document.getElementById('add-player-btn').addEventListener('click', () => {
                logic.player.add(document.getElementById('new-player-name').value, document.getElementById('new-player-role').value);
            });
            
            document.getElementById('bulk-btn').addEventListener('click', () => {
                ui.showModal('Inserimento Multiplo', 
                    `<p class="text-sm text-slate-500 mb-2">Incolla i nomi (uno per riga).</p>
                    <textarea id="bulk-in" rows="8" class="mb-3 w-full border p-2 rounded" placeholder="Mario Rossi\nLuigi Verdi"></textarea>
                    <select id="bulk-role" class="w-full border p-2 rounded">
                        <option value="Attaccante">Attaccante</option>
                        <option value="Portiere">Portiere</option>
                    </select>`, 
                    `<button class="btn btn-primary" id="do-bulk">Importa</button>`
                );
                document.getElementById('do-bulk').onclick = () => { 
                    logic.player.addBulk(document.getElementById('bulk-in').value, document.getElementById('bulk-role').value); 
                    ui.hideModal(); 
                };
            });
            
            // Re-render dinamico per ordinamento e ricerca
            const updatePlayerList = () => {
                sortMode = document.getElementById('player-sort-mode').value;
                searchQuery = document.getElementById('player-search').value.toLowerCase();
                document.getElementById('player-list-table-container').innerHTML = views.renderPlayerTable(getPlayerListToRender(sortMode));
                views.attachPlayerTableListeners();
            };

            document.getElementById('player-sort-mode').addEventListener('change', updatePlayerList);
            document.getElementById('player-search').addEventListener('input', updatePlayerList);
            
            views.attachPlayerTableListeners();
        },

        renderPlayerTable: (players) => {
            if (players.length === 0) return '<p class="text-slate-500 text-center py-4">Nessun giocatore trovato.</p>';
            
            return `
                <table class="w-full table-striped">
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>Ruolo</th>
                            <th class="no-print text-right pr-4">Azioni</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${players.map(p => `
                            <tr>
                                <td class="font-medium text-slate-800">${p.name}</td>
                                <td>
                                    <span class="px-2 py-1 rounded-full text-xs font-semibold ${p.role === 'Portiere' ? 'bg-indigo-100 text-indigo-700' : 'bg-orange-100 text-orange-700'}">
                                        ${p.role}
                                    </span>
                                </td>
                                <td class="no-print text-right">
                                    <button class="btn btn-ghost btn-sm info-player-btn text-blue-500 hover:bg-blue-50" data-id="${p.id}" title="Vedi Storia e Statistiche">
                                        <i data-lucide="line-chart" class="w-4 h-4"></i>
                                    </button>
                                    <button class="btn btn-ghost btn-sm edit-player-btn" data-id="${p.id}" title="Modifica Nome">
                                        <i data-lucide="pencil" class="w-4 h-4 text-slate-400"></i>
                                    </button>
                                    <button class="btn btn-ghost btn-sm remove-player-btn hover:bg-red-50" data-id="${p.id}" title="Rimuovi Giocatore">
                                        <i data-lucide="trash-2" class="w-4 h-4 text-red-500"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        },

        attachPlayerTableListeners: () => {
            lucide.createIcons();
            
            // Nuova logica: Mostra la storia del giocatore
            document.querySelectorAll('.info-player-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = e.currentTarget.getAttribute('data-id');
                    const player = utils.getPlayerById(id);
                    if (!player) return;

                    // Recupera le statistiche dalla classifica generale
                    const standings = utils.getStandings();
                    const stats = standings.find(s => s.id === id) || { G: 0, V: 0, N: 0, P: 0, Pts: 0, GF: 0, GS: 0, Diff: 0 };

                    // Recupera tutte le partite in cui il giocatore è coinvolto
                    const matches = db.schedule.filter(m => 
                        (m.team1 && (m.team1.p === id || m.team1.a === id)) ||
                        (m.team2 && (m.team2.p === id || m.team2.a === id))
                    );

                    // Costruisce la cronologia HTML
                    let historyHtml = '<p class="text-sm text-slate-500 mb-4">Nessuna partita registrata a calendario.</p>';
                    if (matches.length > 0) {
                        historyHtml = `<ul class="text-sm space-y-2 max-h-64 overflow-y-auto pr-2">`;
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
                                if (myScore > oppScore) { resClass = 'text-green-600 font-bold bg-green-50'; badgeIcon = 'check-circle'; }
                                else if (myScore < oppScore) { resClass = 'text-red-600 font-bold bg-red-50'; badgeIcon = 'x-circle'; }
                                else { resClass = 'text-amber-600 font-bold bg-amber-50'; badgeIcon = 'minus-circle'; }
                            }

                            historyHtml += `
                                <li class="p-3 bg-white rounded border border-slate-200 shadow-sm flex flex-col gap-1">
                                    <div class="flex justify-between items-center border-b border-slate-100 pb-1 mb-1">
                                        <span class="font-mono text-xs text-slate-500">Round ${m.round}</span>
                                        <span class="text-xs px-2 py-0.5 rounded ${resClass} flex items-center gap-1">
                                            <i data-lucide="${badgeIcon}" class="w-3 h-3"></i> ${statusStr}
                                        </span>
                                    </div>
                                    <div class="text-xs">
                                        <span class="text-slate-500">Insieme a:</span> <span class="font-medium">${compagno}</span>
                                    </div>
                                    <div class="text-xs">
                                        <span class="text-slate-500">Contro:</span> <span>${avversari}</span>
                                    </div>
                                </li>`;
                        });
                        historyHtml += `</ul>`;
                    }

                    // Assembla il corpo della modale
                    const body = `
                        <div class="grid grid-cols-4 gap-2 mb-6 text-center">
                            <div class="p-2 bg-amber-50 rounded border border-amber-100"><div class="text-xs text-amber-600 font-semibold">Punti</div><div class="font-bold text-lg text-amber-800">${stats.Pts}</div></div>
                            <div class="p-2 bg-slate-50 rounded border border-slate-200"><div class="text-[10px] text-slate-500 font-semibold uppercase">Giocate</div><div class="font-bold text-slate-700">${stats.G}</div></div>
                            <div class="p-2 bg-green-50 rounded border border-green-200"><div class="text-[10px] text-green-600 font-semibold uppercase">Vittorie</div><div class="font-bold text-green-700">${stats.V}</div></div>
                            <div class="p-2 bg-red-50 rounded border border-red-200"><div class="text-[10px] text-red-600 font-semibold uppercase">Sconfitte</div><div class="font-bold text-red-700">${stats.P}</div></div>
                        </div>
                        <h4 class="text-sm font-semibold mb-3 text-slate-700 border-b pb-1 flex items-center gap-2"><i data-lucide="calendar-days" class="w-4 h-4"></i> Cronologia Partite</h4>
                        ${historyHtml}
                    `;
                    ui.showModal(`Storia: ${player.name}`, body);
                });
            });

            // Logica esistente per la rimozione
            document.querySelectorAll('.remove-player-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    if (confirm('Sicuro di voler rimuovere questo giocatore? Tutte le partite verranno aggiornate.')) {
                        logic.player.remove(e.currentTarget.getAttribute('data-id'));
                    }
                });
            });
            
            // Logica esistente per la modifica nome
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
                <div class="card no-print flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h3 class="text-xl font-semibold mb-2">Gestione Calendario</h3>
                        <div class="flex gap-2 text-sm flex-wrap">
                            <div class="px-2 py-1 rounded ${totalReds>0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'} font-bold border border-slate-200">Coppie Ripetute: ${totalReds}</div>
                            <div class="px-2 py-1 rounded ${totalYellows>0 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'} font-bold border border-slate-200">Avversari Ripetuti: ${totalYellows}</div>
                        </div>
                        <p class="mt-2 text-xs text-slate-600">Nota: <b>In gioco</b> indica che la partita è stata avviata, mentre <b>Giocata</b> significa che il risultato è già stato registrato e la classifica è aggiornata.</p>
                    </div>
                    <div class="flex gap-2">
                         <button id="generate-schedule-btn" class="btn btn-success">
                            <i data-lucide="plus" class="w-4 h-4"></i> Genera Calendario
                        </button>
                         <button id="reset-schedule-btn" class="btn btn-danger">
                            <i data-lucide="calendar-x" class="w-4 h-4"></i> Resetta
                        </button>
                    </div>
                </div>
            `;

            if (db.schedule.length > 0) {
                const available = utils.getAvailableMatches();
                const availableMatchIds = new Set(available.map(match => match.id));
                const occupiedCount = utils.getOccupiedPlayerIds().size;
                const inProgressMatches = db.schedule.filter(m => m.inProgress && !m.played);
                html += `
                    <div class="card no-print border-blue-200 ready-match-panel">
                        <h3 class="text-xl font-semibold mb-1 border-b pb-2 flex items-center gap-2">
                            <i data-lucide="zap" class="w-5 h-5 text-blue-500"></i> Partite Pronte da Iniziare
                        </h3>
                        <div class="flex flex-wrap gap-2 mt-2 mb-3 schedule-quick-stats">
                            <span class="px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">In gioco: ${inProgressMatches.length}</span>
                            <span class="px-2 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">Pronte: ${available.length}</span>
                        </div>
                        <p class="text-sm text-slate-500 mb-3 mt-2">
                            Partite non ancora giocate i cui giocatori sono liberi adesso
                            ${occupiedCount > 0 ? `(${occupiedCount} giocatori attualmente impegnati in altre partite "in gioco").` : '(nessuna partita è ancora segnata "in gioco").'}
                        </p>
                        ${inProgressMatches.length > 0 ? `
                            <div class="mb-4">
                                <p class="text-xs font-semibold uppercase tracking-wide text-blue-700 mb-2">In gioco</p>
                                <div class="ready-match-grid grid grid-cols-1 md:grid-cols-2 gap-3">
                                    ${inProgressMatches.map(m => `
                                        <div class="flex flex-col gap-2 p-3 rounded-lg border border-blue-200 ready-match-card in-progress">
                                            <div class="flex items-center justify-between gap-3">
                                                <div class="text-sm min-w-0">
                                                    <span class="text-xs text-slate-400 font-mono">Round ${m.round}</span><br>
                                                    <span class="font-medium truncate">${utils.getPlayerById(m.team1.p).name} + ${utils.getPlayerById(m.team1.a).name}</span>
                                                    <span class="text-slate-400 mx-1">vs</span>
                                                    <span class="font-medium truncate">${utils.getPlayerById(m.team2.p).name} + ${utils.getPlayerById(m.team2.a).name}</span>
                                                </div>
                                                <button class="btn btn-ghost btn-sm toggle-inprogress-btn flex-shrink-0" data-id="${m.id}" data-value="false">
                                                    <i data-lucide="pause-circle" class="w-4 h-4 text-blue-600"></i>
                                                    <span class="text-xs">Ferma</span>
                                                </button>
                                            </div>
                                            <div class="flex items-center justify-between gap-2 pt-1 border-t border-blue-200/80">
                                                <label class="text-xs font-semibold text-slate-600">Risultato</label>
                                                <div class="flex items-center gap-2">
                                                    <input type="number" min="0" value="${m.score1 !== null ? m.score1 : ''}" class="w-14 p-1 text-center text-sm border rounded autosave-input" data-id="${m.id}" data-team="1">
                                                    <span class="text-slate-400">-</span>
                                                    <input type="number" min="0" value="${m.score2 !== null ? m.score2 : ''}" class="w-14 p-1 text-center text-sm border rounded autosave-input" data-id="${m.id}" data-team="2">
                                                </div>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                        ${available.length === 0 ? `
                            <p class="text-slate-400 text-sm">Nessuna partita disponibile al momento: tutte le rimanenti coinvolgono giocatori già impegnati, oppure il calendario è completo.</p>
                        ` : `
                            <div class="mb-2">
                                <p class="text-xs font-semibold uppercase tracking-wide text-emerald-700 mb-2">Pronte</p>
                                <div class="ready-match-grid grid grid-cols-1 md:grid-cols-2 gap-3">
                                    ${available.slice(0, 12).map(m => `
                                        <div class="flex items-center justify-between gap-3 p-3 rounded-lg border border-amber-200 ready-match-card ready">
                                            <div class="text-sm min-w-0">
                                                <span class="text-xs text-slate-400 font-mono">Round ${m.round}</span><br>
                                                <span class="font-medium truncate">${utils.getPlayerById(m.team1.p).name} + ${utils.getPlayerById(m.team1.a).name}</span>
                                                <span class="text-slate-400 mx-1">vs</span>
                                                <span class="font-medium truncate">${utils.getPlayerById(m.team2.p).name} + ${utils.getPlayerById(m.team2.a).name}</span>
                                            </div>
                                            <button class="btn btn-primary btn-sm start-match-btn flex-shrink-0" data-id="${m.id}">
                                                <i data-lucide="play" class="w-4 h-4"></i> Avvia
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
                html += '<p class="text-slate-500 card text-center py-8">Il calendario non è stato ancora generato.</p>';
            } else {
                Object.keys(matchesByRound).sort((a, b) => a - b).forEach(round => {
                    const roundMatches = matchesByRound[round].filter(m => !m.inProgress);
                    const playedCount = roundMatches.filter(m => m.played).length;
                    const isComplete = roundMatches.length > 0 && playedCount === roundMatches.length;
                    const collapsed = roundCollapseOverrides.hasOwnProperty(round) ? roundCollapseOverrides[round] : isComplete;

                    html += `
                        <div class="card">
                            <div class="flex justify-between items-center mb-2 border-b pb-2 cursor-pointer round-header" data-round="${round}">
                                <h3 class="text-xl font-semibold flex items-center gap-2">
                                    Round ${round} (${roundMatches.length} Partite)
                                    ${isComplete ? '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Completato</span>' : `<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">${playedCount}/${roundMatches.length} giocate</span>`}
                                </h3>
                                <button class="btn btn-ghost btn-sm round-toggle-btn no-print" data-round="${round}" title="${collapsed ? 'Apri round' : 'Chiudi round'}">
                                    <i data-lucide="${collapsed ? 'chevron-down' : 'chevron-up'}" class="w-5 h-5"></i>
                                </button>
                            </div>
                            <div class="${collapsed ? 'hidden' : ''}" id="round-body-${round}">
                            <div class="overflow-x-auto">
                                <table class="w-full table-striped min-w-[600px]">
                                    <thead>
                                        <tr>
                                            <th>Partita</th>
                                            <th>Squadra 1</th>
                                            <th>Squadra 2</th>
                                            <th class="no-print">Risultato (${db.settings.scoreTarget} gol)</th>
                                            <th class="no-print">Stato</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${roundMatches.map(match => {
                                            const team1Name = `${utils.getPlayerById(match.team1.p).name} + ${utils.getPlayerById(match.team1.a).name}`;
                                            const team2Name = `${utils.getPlayerById(match.team2.p).name} + ${utils.getPlayerById(match.team2.a).name}`;
                                            
                                            const k1 = `${match.team1.p}_${match.team1.a}`; 
                                            const k2 = `${match.team2.p}_${match.team2.a}`;
                                            const partnerRepeat = pairCounts[k1] > 1 || pairCounts[k2] > 1;
                                            
                                            let oppRepetition = false;
                                            const t1 = [match.team1.p, match.team1.a]; const t2 = [match.team2.p, match.team2.a];
                                            t1.forEach(id1 => { t2.forEach(id2 => { const key = [id1, id2].sort().join('_'); if (opponentCounts[key] > 1) oppRepetition = true; }); });
                                            
                                            let rowClass = ""; let warnIcon = "";
                                            if (match.played) {
                                                rowClass = "bg-green-50 border-l-4 border-green-500";
                                                warnIcon = `<i data-lucide="check" class="w-4 h-4 text-green-600 inline mr-1" title="Giocata"></i>`;
                                            } else if (match.inProgress) { rowClass = "bg-blue-50 border-l-4 border-blue-500"; warnIcon = `<i data-lucide="play-circle" class="w-4 h-4 text-blue-600 inline mr-1" title="In gioco"></i>`; }
                                            else if (partnerRepeat) { rowClass = "bg-red-50 border-l-4 border-red-500"; warnIcon = `<i data-lucide="users" class="w-4 h-4 text-red-600 inline mr-1" title="Coppia ripetuta"></i>`; } 
                                            else if (oppRepetition) { rowClass = "border-l-4 border-amber-400 bg-transparent"; warnIcon = `<i data-lucide="users" class="w-4 h-4 text-amber-600 inline mr-1" title="Avversario ripetuto"></i>`; }
                                            
                                            const status = match.played ? 
                                                `<span class="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700" title="Giocata: risultato già registrato e classifica aggiornata (${match.score1}-${match.score2})"><i data-lucide="check" class="w-3 h-3 inline"></i> Giocata (${match.score1}-${match.score2})</span>` : 
                                                match.inProgress ?
                                                `<span class="px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700" title="In gioco: partita avviata ma ancora non conclusa"><i data-lucide="play-circle" class="w-3 h-3 inline"></i> In gioco</span>` :
                                                `<span class="px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700" title="Da giocare: risultato non ancora registrato">Da giocare</span>`;
                                            const inProgressBadge = match.inProgress ? '<span class="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide" title="Partita in corso">IN CORSO</span>' : '';
                                            
                                            const printBoxes = `
                                                <div class="only-print flex items-center mt-1">
                                                    <span class="score-input-print-small"></span> <span class="score-input-print-small"></span> - <span class="score-input-print-small"></span> <span class="score-input-print-small"></span>
                                                </div>`;

                                            return `
                                                <tr class="${rowClass}">
                                                    <td class="text-xs text-slate-500 font-mono flex items-center gap-1">${warnIcon} #${match.round}.${match.id.slice(-4)}${inProgressBadge ? ` <span class="hidden sm:inline">${inProgressBadge}</span>` : ''}</td>
                                                    <td class="font-medium ${pairCounts[k1]>1?'text-red-700':''}">${team1Name}</td>
                                                    <td class="font-medium ${pairCounts[k2]>1?'text-red-700':''}">${team2Name}</td>
                                                    <td class="no-print">
                                                        <div class="flex gap-2 items-center">
                                                            <input type="number" min="0" value="${match.score1 !== null ? match.score1 : ''}" class="w-16 p-1 text-center text-sm border rounded autosave-input" data-id="${match.id}" data-team="1">
                                                            <span class="text-slate-400">-</span>
                                                            <input type="number" min="0" value="${match.score2 !== null ? match.score2 : ''}" class="w-16 p-1 text-center text-sm border rounded autosave-input" data-id="${match.id}" data-team="2">
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
            }

            contentView.innerHTML = html;
            lucide.createIcons();

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
                    const container = e.target.closest('td') || e.target.closest('.ready-match-card');
                    if (!container) return;

                    const score1Input = container.querySelector('[data-team="1"]');
                    const score2Input = container.querySelector('[data-team="2"]');
                    const score1 = score1Input ? score1Input.value : '';
                    const score2 = score2Input ? score2Input.value : '';

                    logic.schedule.autoSaveResult(id, score1, score2);
                    views.renderSchedule();
                };

                input.addEventListener('blur', saveScore);
                input.addEventListener('change', saveScore);
            });
        },

        renderStandings: () => {
            const standings = utils.getStandings();
            const targetGames = db.settings.rounds;
            const playerGameCounts = utils.getPlayerGameCounts();

            let sortMode = document.getElementById('standings-sort-mode')?.value || 'rank';

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
                <div class="card relative">
                    <div class="flex flex-col md:flex-row justify-between md:items-center gap-3 mb-4 border-b pb-2">
                        <h3 class="text-xl font-semibold">Classifica Generale</h3>
                        <div class="no-print flex gap-3 items-center">
                            <!-- NUOVO: Pulsante Modalità TV -->
                            <button id="tv-mode-btn" class="btn btn-secondary btn-sm" title="Mostra a schermo intero">
                                <i data-lucide="tv" class="w-4 h-4"></i> TV
                            </button>
                            <div>
                                <label class="text-sm font-medium text-slate-600 mr-2">Ordina per:</label>
                                <select id="standings-sort-mode">
                                    <option value="rank" ${sortMode === 'rank' ? 'selected' : ''}>Classifica (default)</option>
                                    <option value="P_first" ${sortMode === 'P_first' ? 'selected' : ''}>Portieri, poi Attaccanti</option>
                                    <option value="A_first" ${sortMode === 'A_first' ? 'selected' : ''}>Attaccanti, poi Portieri</option>
                                    <option value="alternate" ${sortMode === 'alternate' ? 'selected' : ''}>Alterna Portiere/Attaccante</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    ${standings.length > 0 ? `
                        <div class="overflow-x-auto">
                            <table class="w-full table-striped min-w-[800px]">
                                <thead>
                                    <tr>
                                        <th title="Posizione in classifica">#</th>
                                        <th title="Giocatore">Giocatore</th>
                                        <th class="th-truncate" title="Ruolo">Ruolo</th>
                                        <th class="th-truncate" title="Punti">Punti</th>
                                        <th class="th-truncate" title="Partite Giocate">Giocate</th>
                                        <th class="th-truncate" title="Vittorie">Vittorie</th>
                                        <th class="th-truncate" title="Pareggi">Pareggi</th>
                                        <th class="th-truncate" title="Sconfitte">Sconfitte</th>
                                        <th class="th-truncate" title="Gol Fatti">Gol Fatti</th>
                                        <th class="th-truncate" title="Gol Subiti">Gol Subiti</th>
                                        <th class="th-truncate" title="Differenza Reti">Differenza Reti</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${displayList.map((s) => {
                                        const games = playerGameCounts[s.id] || 0;
                                        const gamesClass = games < targetGames ? 'text-red-600 font-semibold' : games > targetGames ? 'text-orange-600 font-semibold' : '';
                                        return `
                                            <tr class="border-b last:border-b-0 hover:bg-slate-50 transition-colors">
                                                <td>${s.rank}</td>
                                                <td class="font-medium text-slate-800">${s.name}</td>
                                                <td class="text-slate-400 text-sm" title="${s.role}">${s.role[0]}</td>
                                                <td class="font-bold text-gold-strong text-lg">${s.Pts}</td>
                                                <td class="${gamesClass}">${games}</td>
                                                <td>${s.V}</td>
                                                <td>${s.N}</td>
                                                <td>${s.P}</td>
                                                <td>${s.GF}</td>
                                                <td>${s.GS}</td>
                                                <td>${s.Diff > 0 ? '+' : ''}${s.Diff}</td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    ` : '<p class="text-slate-500">Nessun giocatore registrato o partita giocata.</p>'}
                </div>
            `;
            
            contentView.innerHTML = html;
            lucide.createIcons();

            document.getElementById('standings-sort-mode')?.addEventListener('change', views.renderStandings);

            // GESTIONE MODALITA' TV
            document.getElementById('tv-mode-btn')?.addEventListener('click', () => {
                document.body.classList.add('tv-mode-active');
                
                // Iniettiamo gli stili per la TV se non ci sono
                if (!document.getElementById('tv-mode-styles')) {
                    const style = document.createElement('style');
                    style.id = 'tv-mode-styles';
                    style.innerHTML = `
                        body.tv-mode-active { overflow: hidden; background: white; }
                        body.tv-mode-active #content-view { 
                            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; 
                            background: white; z-index: 9999; padding: 3rem; overflow-y: auto; 
                        }
                        body.tv-mode-active .no-print, body.tv-mode-active .sidebar, body.tv-mode-active header { display: none !important; }
                        body.tv-mode-active table { font-size: 1.8rem; line-height: 2.2rem; margin-top: 1rem; }
                        body.tv-mode-active th, body.tv-mode-active td { padding: 1.2rem; }
                        body.tv-mode-active h3 { font-size: 2.5rem; text-align: center; margin-bottom: 2rem; }
                        .tv-exit-hint { display: none; }
                        body.tv-mode-active .tv-exit-hint { 
                            display: block; position: fixed; bottom: 2rem; right: 2rem; 
                            background: rgba(0,0,0,0.8); color: white; padding: 0.75rem 1.5rem; 
                            border-radius: 99px; z-index: 10000; font-size: 1.2rem; cursor: pointer; 
                            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
                        }
                    `;
                    document.head.appendChild(style);
                }
                
                // Bottone/Hint per uscire dalla modalità
                let exitHint = document.querySelector('.tv-exit-hint');
                if(!exitHint) {
                    exitHint = document.createElement('div');
                    exitHint.className = 'tv-exit-hint';
                    exitHint.innerHTML = '<i data-lucide="x" class="w-5 h-5 inline-block mr-2 align-middle"></i> Esci (ESC)';
                    exitHint.onclick = () => exitTvMode();
                    document.body.appendChild(exitHint);
                    lucide.createIcons();
                } else {
                    exitHint.style.display = 'block';
                }

                // Event listener per ESC
                const escHandler = (e) => {
                    if (e.key === 'Escape') exitTvMode(escHandler);
                };
                
                const exitTvMode = (handlerRef = null) => {
                    document.body.classList.remove('tv-mode-active');
                    if(handlerRef) document.removeEventListener('keydown', handlerRef);
                };

                document.addEventListener('keydown', escHandler);
            });
        },

        renderPlayoffs: () => {
            logic.playoffs.syncBracketProgress(db.playoffs.mainBracket);
            logic.playoffs.syncBracketProgress(db.playoffs.playoutBracket);
            logic.playoffs.syncBracketProgress(db.playoffs.thirdPlaceBracket);
            logic.playoffs.tryBuildFifthPlaceBracket();
            logic.playoffs.syncBracketProgress(db.playoffs.fifthPlaceBracket);
            const roleSize = [6, 7, 8].includes(db.settings.playoffRoleSize) ? db.settings.playoffRoleSize : 8;
            const directTeams = ({ 6: 2, 7: 1, 8: 0 })[roleSize];
            const formationModeLabels = {
                random: 'Casuale puro',
                'balanced-random': 'Casuale equilibrato',
                'max-balance': 'Massimo equilibrio'
            };
            const formationModeLabel = formationModeLabels[db.settings.teamFormationMode] || 'Casuale equilibrato';
            const directTeamList = db.playoffs.directTeams?.length
                ? db.playoffs.directTeams
                : db.playoffs.directTeam ? [db.playoffs.directTeam] : [];
            const standings = utils.getStandings();
            const topPlayers = standings.slice(0, db.settings.playoffsTop);
            const incompleteScheduleCount = db.schedule.filter(match => !match.played).length;
            const hasIncompleteSchedule = incompleteScheduleCount > 0;
            const hasExistingPlayoffs = Boolean(
                db.playoffs.mainBracket ||
                db.playoffs.playoutBracket ||
                db.playoffs.thirdPlaceBracket ||
                db.playoffs.fifthPlaceBracket ||
                db.playoffs.qualificationBracket ||
                db.playoffs.directTeam ||
                db.playoffs.directTeams?.length
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
                <div class="card no-print">
                    <h3 class="text-xl font-semibold mb-4">Gestione Tabelloni Playoff</h3>
                    <p class="mb-3 inline-flex items-center gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800"><i data-lucide="shuffle" class="w-4 h-4"></i> Formazione squadre: ${formationModeLabel}</p>
                    <p class="mb-4 text-slate-600">Formato ${roleSize}+${roleSize}: ${roleSize === 8 ? 'le 8 squadre giocano i quarti di finale' : `${directTeams} squadre sono qualificate direttamente e le altre disputano il turno preliminare`}. Le coppie vengono rimescolate tra i turni, sempre con 1 portiere e 1 attaccante. Vittoria a <b>${db.settings.playoffScoreTarget}</b> gol.</p>
                    <p class="mb-3 text-sm text-slate-700"><b>Regola:</b> per creare i playoff servono le classifiche definitive, cioè tutte le partite del calendario devono essere terminate. Le coppie con meno punti vengono escluse dai playoff; se il numero di coppie è dispari, una squadra viene lasciata fuori dal playout.</p>
                    ${hasIncompleteSchedule ? `<p class="mb-4 text-sm font-semibold text-amber-700"><i data-lucide="alert-triangle" class="w-4 h-4 inline"></i> Non puoi generare i playoff: ci sono ${incompleteScheduleCount} partite del calendario ancora non concluse.</p>` : `<p class="mb-4 text-sm text-green-700 font-semibold"><i data-lucide="check" class="w-4 h-4 inline"></i> Tutte le partite del calendario sono terminate: i playoff possono essere generati.</p>`}
                    <p class="mb-4 text-slate-700"><b>Squadre qualificate direttamente:</b> ${directTeamList.length ? directTeamList.map(team => logic.playoffs.participantName(team)).join('; ') : 'da definire dopo la generazione dei tabelloni'}.</p>
                    <div class="flex gap-2 items-center flex-wrap">
                         <button id="generate-playoffs-btn" class="btn btn-primary" ${topPlayers.length < 2 || hasIncompleteSchedule ? 'disabled' : ''}>
                            <i data-lucide="git-branch" class="w-4 h-4"></i> Genera Tabelloni
                        </button>
                         <button id="reset-playoffs-btn" class="btn btn-danger btn-sm" ${hasExistingPlayoffs ? '' : 'disabled'} type="button">
                            <i data-lucide="rotate-ccw" class="w-4 h-4"></i> Reset Playoff
                        </button>
                         <button id="playoff-help-btn" class="btn btn-ghost btn-sm" type="button" title="Aiuto playoff: i tabelloni usano le coppie con più punti; se il numero delle coppie è dispari, una squadra resta fuori dal playout; non è possibile generarli finché tutte le partite del calendario non sono concluse.">
                            <i data-lucide="help-circle" class="w-4 h-4"></i>
                         </button>
                    </div>
                </div>
            `;

            if (tied && tied.length === 2) {
                const [p1, p2] = tied;
                html += `
                    <div class="card border-amber-300 bg-amber-50 no-print">
                        <h3 class="text-lg font-semibold mb-2 flex items-center gap-2 text-amber-800">
                            <i data-lucide="alert-triangle" class="w-5 h-5"></i> Parità al taglio Top ${db.settings.playoffsTop}
                        </h3>
                        <p class="text-sm text-amber-700 mb-3">
                            <b>${p1.name}</b> e <b>${p2.name}</b> sono pari per punti (${p1.Pts}) e differenza reti (${p1.Diff > 0 ? '+' : ''}${p1.Diff}).
                            Registra il risultato di uno spareggio per determinare chi accede ai playoff.
                        </p>
                        ${tbMatchesTiedPair ? `
                            <p class="text-sm text-green-700 font-semibold"><i data-lucide="check" class="w-4 h-4 inline"></i> Spareggio registrato: ${utils.getPlayerById(tb.winnerId).name} vince ${tb.score1}-${tb.score2} e passa il turno.</p>
                        ` : `
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="text-sm font-medium">${p1.name}</span>
                                <input type="number" min="0" id="tiebreak-score1" class="w-16 p-1 text-center text-sm border rounded">
                                <span class="text-slate-400">-</span>
                                <input type="number" min="0" id="tiebreak-score2" class="w-16 p-1 text-center text-sm border rounded">
                                <span class="text-sm font-medium">${p2.name}</span>
                                <button id="save-tiebreak-btn" class="btn btn-secondary btn-sm ml-2" data-p1="${p1.id}" data-p2="${p2.id}">Salva Spareggio</button>
                            </div>
                        `}
                    </div>
                `;
            } else if (tied && tied.length > 2) {
                html += `
                    <div class="card border-red-300 bg-red-50 no-print">
                        <h3 class="text-lg font-semibold mb-2 text-red-800"><i data-lucide="alert-triangle" class="w-5 h-5 inline"></i> Parità multipla al taglio</h3>
                        <p class="text-sm text-red-700">${tied.map(p=>p.name).join(', ')} sono pari per punti e differenza reti: con 3 o più giocatori in parità, risolvi manualmente (partite aggiuntive) prima di generare i playoff.</p>
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

                const rankRow = (label, val, note) => `
                    <div class="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                        <span class="font-semibold text-slate-600">${label}</span>
                        <span class="${val ? 'font-bold text-slate-800' : 'text-slate-400 text-sm italic'}">${val ? logic.playoffs.participantName(val) : 'In corso...'}</span>
                        ${note ? `<span class="text-xs text-slate-400">${note}</span>` : ''}
                    </div>`;

                html += `
                    <div class="card">
                        <h3 class="text-xl font-semibold mb-2 border-b pb-2 flex items-center gap-2"><i data-lucide="award" class="w-5 h-5 text-amber-500"></i> Classifica Finale Playoff</h3>
                        ${rankRow('1° Posto', champion)}
                        ${rankRow('2° Posto', runnerUp)}
                        ${db.playoffs.thirdPlaceBracket ? rankRow('3° Posto', thirdPlace, 'Vincitore finalina') : rankRow('3° Posto', null, 'In attesa della finalina')}
                        ${db.playoffs.thirdPlaceBracket ? rankRow('4° Posto', fourthPlace, 'Perdente finalina') : rankRow('4° Posto', null, 'In attesa della finalina')}
                        ${db.playoffs.fifthPlaceBracket ? rankRow('5° Posto', fifthPlace, 'Vincitore Tabellone 5°/6° posto') : ''}
                        ${db.playoffs.playoutBracket ? rankRow(db.playoffs.fifthPlaceBracket ? '6° Posto' : '5° Posto', playoutWinner, 'Vincitore Playout / 5°-6° posto') : ''}
                    </div>
                `;
            }

            if (db.playoffs.mainBracket && hasBracketContent(db.playoffs.mainBracket)) {
                html += `
                    <details class="card overflow-x-auto" open>
                        <summary class="text-xl font-semibold mb-4 border-b pb-2 cursor-pointer">Playoff — Tabellone Principale (1°-2° posto)</summary>
                        <p class="text-sm text-slate-500 mb-2">Tabellone a eliminazione diretta per l'assegnazione del 1° e 2° posto (la finalina 3°/4° posto è consultabile nella sezione successiva).</p>
                        <div class="flex space-x-8 p-4">
                            ${views.renderBracketRound(db.playoffs.mainBracket)}
                        </div>
                    </details>
                `;
            }

            if (db.playoffs.thirdPlaceBracket && hasBracketContent(db.playoffs.thirdPlaceBracket)) {
                html += `
                    <details class="card overflow-x-auto" open>
                        <summary class="text-xl font-semibold mb-4 border-b pb-2 cursor-pointer">Finalina 3°/4° posto</summary>
                        <p class="text-sm text-slate-500 mb-2">Le due perdenti delle semifinali disputano questa partita per assegnare il 3° e il 4° posto.</p>
                        <div class="flex space-x-8 p-4">${views.renderBracketRound(db.playoffs.thirdPlaceBracket)}</div>
                    </details>
                `;
            } else if (db.playoffs.mainBracket && hasBracketContent(db.playoffs.mainBracket)) {
                html += `<div class="card no-print"><p class="text-slate-400 text-sm">La finalina 3°/4° posto verrà generata al termine delle semifinali.</p></div>`;
            }

            if (db.playoffs.qualificationBracket && hasBracketContent(db.playoffs.qualificationBracket)) {
                html += `
                    <details class="card overflow-x-auto" open>
                        <summary class="text-xl font-semibold mb-4 border-b pb-2 cursor-pointer">Turno preliminare</summary>
                        <p class="text-sm text-slate-500 mb-2">Le squadre qualificate direttamente attendono le vincitrici del preliminare per completare il tabellone principale.</p>
                        <div class="flex space-x-8 p-4">${views.renderBracketRound(db.playoffs.qualificationBracket)}</div>
                    </details>
                `;
            }

            if (db.playoffs.fifthPlaceBracket && hasBracketContent(db.playoffs.fifthPlaceBracket)) {
                html += `
                    <details class="card overflow-x-auto" open>
                        <summary class="text-xl font-semibold mb-4 border-b pb-2 cursor-pointer">Tabellone 5°/6° posto</summary>
                        <p class="text-sm text-slate-500 mb-2">Le quattro squadre perdenti dei quarti disputano due semifinali e una finale. Le altre vengono escluse.</p>
                        <div class="flex space-x-8 p-4">${views.renderBracketRound(db.playoffs.fifthPlaceBracket)}</div>
                    </details>
                `;
            }

            if (db.playoffs.playoutBracket && hasBracketContent(db.playoffs.playoutBracket)) {
                html += `
                    <details class="card overflow-x-auto" open>
                        <summary class="text-xl font-semibold mb-4 border-b pb-2 cursor-pointer">Playout (${db.playoffs.fifthPlaceBracket ? '6° posto' : '5° posto'})</summary>
                        <p class="text-sm text-slate-500 mb-2">Riservato alle squadre formate dai giocatori oltre il ${db.settings.playoffRoleSize || 8}° posto della classifica del proprio ruolo.</p>
                        ${db.playoffs.excludedPlayoutTeam ? `<p class="text-sm text-amber-700 mb-2">Squadra esclusa per numero dispari: <b>${logic.playoffs.participantName(db.playoffs.excludedPlayoutTeam)}</b>.</p>` : ''}
                        <div class="flex space-x-8 p-4">
                            ${views.renderBracketRound(db.playoffs.playoutBracket)}
                        </div>
                    </details>
                `;
            } else if (db.playoffs.excludedPlayoutTeam) {
                html += `<div class="card no-print"><p class="text-sm text-amber-700">Squadra esclusa dai playout per numero dispari: <b>${logic.playoffs.participantName(db.playoffs.excludedPlayoutTeam)}</b>.</p></div>`;
            }

            contentView.innerHTML = html;
            lucide.createIcons();

            document.getElementById('generate-playoffs-btn').addEventListener('click', logic.playoffs.generateBracket);
            document.getElementById('reset-playoffs-btn')?.addEventListener('click', () => {
                if (confirm('Sei sicuro di voler azzerare i tabelloni playoff? I giocatori e il calendario rimarranno invariati.')) {
                    logic.data.resetPlayoffsOnly();
                }
            });
            document.getElementById('playoff-help-btn')?.addEventListener('click', () => {
                ui.showAlert('Aiuto playoff: i tabelloni usano le coppie con più punti; se il numero delle coppie è dispari, una squadra resta fuori dal playout. Inoltre, i playoff si possono creare solo dopo che tutte le partite del calendario sono concluse.', 'info');
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

            let html = `<div class="flex flex-col space-y-8 w-64 min-w-[200px]">
                <h4 class="font-bold text-center border-b pb-1 text-slate-700">${getRoundLabel(bracket)}</h4>`;

            bracket.matches.forEach(match => {
                const winner = db.playoffs.matchResults[match.id];
                const isBye = match.team1 === 'BYE' || match.team2 === 'BYE';
                const isPending = match.team1 === 'TBD' || match.team2 === 'TBD';
                const team1Class = logic.playoffs.sameParticipant(winner, match.team1) ? 'font-bold bg-green-100 text-green-800' : '';
                const team2Class = logic.playoffs.sameParticipant(winner, match.team2) ? 'font-bold bg-green-100 text-green-800' : '';

                let body;
                if (isBye) {
                    body = `<p class="text-[10px] text-amber-600 mt-1 text-center">Turno libero — passaggio automatico</p>`;
                } else if (isPending) {
                    body = `<p class="text-xs text-slate-400 text-center py-2">In attesa dei vincitori del turno precedente...</p>`;
                } else {
                    body = `
                        <div class="flex items-center justify-center gap-1 mt-2">
                            <input type="number" min="0" value="${match.score1 !== null ? match.score1 : ''}" class="w-12 p-1 text-center text-xs border rounded playoff-score-input" data-match-id="${match.id}" data-team="1">
                            <span class="text-slate-400 text-xs">-</span>
                            <input type="number" min="0" value="${match.score2 !== null ? match.score2 : ''}" class="w-12 p-1 text-center text-xs border rounded playoff-score-input" data-match-id="${match.id}" data-team="2">
                        </div>
                    `;
                }

                html += `
                    <div class="border border-slate-300 rounded-lg p-2 relative bg-slate-50 shadow-sm">
                        <div class="text-[10px] text-slate-400 mb-1 font-mono uppercase">ID: ${match.id.slice(-4)}</div>
                        <div class="text-sm truncate p-1 rounded ${team1Class}">${resolveName(match.team1)}</div>
                        <div class="text-sm truncate p-1 rounded border-t border-slate-200 ${team2Class}">${resolveName(match.team2)}</div>
                        ${body}
                    </div>
                `;
            });
            
            html += `</div>`;
            
            if (bracket.nextRound) {
                html += views.renderBracketRound(bracket.nextRound);
            }

            return html;
        },

        renderSettings: () => {
            let html = `
                <!-- Aggiunto max-w-5xl mx-auto per limitare la larghezza su schermi grandi -->
                <div class="max-w-5xl mx-auto pb-8">
                    
                    <!-- REGOLE DI PUNTEGGIO -->
                    <div class="card no-print">
                        <h3 class="text-xl font-semibold mb-6 border-b pb-2 flex items-center gap-2">
                            <i data-lucide="calculator" class="w-5 h-5 text-slate-500"></i> 
                            Regole di Punteggio (Vittorie di Misura)
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
                                <label class="block text-[10px] uppercase tracking-wide font-bold text-slate-500 mb-1">Gol Target Vittoria</label>
                                <input type="number" id="score-target" value="${db.settings.scoreTarget}" min="1" max="20" class="font-bold text-lg text-slate-800 bg-white">
                            </div>
                        </div>
                    </div>

                    <!-- GENERAZIONE CALENDARIO -->
                    <div class="card no-print">
                        <h3 class="text-xl font-semibold mb-6 border-b pb-2 flex items-center gap-2">
                            <i data-lucide="settings-2" class="w-5 h-5 text-slate-500"></i> 
                            Generazione Calendario & Playoff
                        </h3>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                            <div class="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                <label class="block text-xs uppercase tracking-wide font-bold text-slate-500 mb-2">Partite Target per Giocatore</label>
                                <input type="number" id="rounds-target" value="${db.settings.rounds}" min="1" class="mb-2">
                                <p class="text-xs text-slate-500">L'algoritmo Zero Tolerance calcolerà le rotazioni su questa base.</p>
                            </div>
                            <div class="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                <label class="block text-xs uppercase tracking-wide font-bold text-slate-500 mb-2">Formazione squadre</label>
                                <select id="team-formation-mode" class="mb-2">
                                    <option value="balanced-random" ${db.settings.teamFormationMode === 'balanced-random' || !db.settings.teamFormationMode ? 'selected' : ''}>Casuale equilibrato</option>
                                    <option value="random" ${db.settings.teamFormationMode === 'random' ? 'selected' : ''}>Casuale puro</option>
                                    <option value="max-balance" ${db.settings.teamFormationMode === 'max-balance' ? 'selected' : ''}>Massimo equilibrio</option>
                                </select>
                                <p class="text-xs text-slate-500">Influisce sul sorteggio e sul rimescolamento delle coppie tra i turni.</p>
                            </div>
                            <div class="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                <label class="block text-xs uppercase tracking-wide font-bold text-slate-500 mb-2">Finalisti per ruolo</label>
                                <select id="playoff-role-size" class="mb-2">
                                    <option value="6" ${db.settings.playoffRoleSize === 6 ? 'selected' : ''}>6+6: 2 dirette, 2 preliminari</option>
                                    <option value="7" ${db.settings.playoffRoleSize === 7 ? 'selected' : ''}>7+7: 1 diretta, 3 preliminari</option>
                                    <option value="8" ${db.settings.playoffRoleSize === 8 || ![6, 7].includes(db.settings.playoffRoleSize) ? 'selected' : ''}>8+8: 0 dirette, 4 preliminari</option>
                                </select>
                                <p class="text-xs text-slate-500">Sono disponibili solo combinazioni che producono 4 semifinaliste.</p>
                            </div>
                            <div class="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                <label class="block text-xs uppercase tracking-wide font-bold text-slate-500 mb-2">Gol Target Playoff</label>
                                <input type="number" id="playoff-score-target" value="${db.settings.playoffScoreTarget}" min="1" max="20" class="mb-2">
                                <p class="text-xs text-slate-500">Punteggio per vincere una partita playoff (di solito diverso da quello dei gironi).</p>
                            </div>
                        </div>

                        <!-- Checkbox stilizzata -->
                        <label class="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100 transition mb-6">
                            <div class="mt-0.5">
                                <input type="checkbox" id="playoff-fifth-place" class="w-4 h-4 text-blue-600 rounded" ${db.settings.playoffFifthPlaceEnabled ? 'checked' : ''}>
                            </div>
                            <div>
                                <span class="block text-sm font-bold text-slate-800">Abilita Tabellone 5°/6° posto</span>
                                <span class="block text-xs text-slate-500 mt-1">Disponibile per 8+8. Genera 2 semifinali e finale per le perdenti dei quarti. Il playout diventa la finalina per 6° posto.</span>
                            </div>
                        </label>
                        
                        <button id="save-settings-btn" class="btn btn-success">
                            <i data-lucide="save" class="w-4 h-4"></i> Salva Impostazioni
                        </button>
                    </div>

                    <!-- ZONA PERICOLOSA -->
                    <div class="card no-print border-red-200 bg-red-50">
                        <h3 class="text-xl font-semibold mb-2 text-red-700 flex items-center gap-2">
                            <i data-lucide="alert-triangle" class="w-5 h-5"></i> Zona Pericolosa
                        </h3>
                        <p class="text-sm text-slate-600 mb-1"><b>Reset Giocatori</b>: cancella giocatori, calendario e playoff. Le impostazioni (punteggi, regole) restano invariate. Utile per iniziare un nuovo torneo.</p>
                        <p class="text-sm text-slate-600 mb-4"><b>Reset Totale Database</b>: cancella tutto, incluse le impostazioni. L'azione è irreversibile.</p>
                        <div class="flex gap-2 flex-wrap">
                            <button id="reset-players-btn" class="btn btn-danger">
                                <i data-lucide="users" class="w-4 h-4"></i> Reset Giocatori
                            </button>
                            <button id="reset-all-btn" class="btn btn-danger">
                                <i data-lucide="alert-triangle" class="w-4 h-4"></i> Reset Totale
                            </button>
                        </div>
                    </div>

                </div> <!-- Fine max-w-5xl -->
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
                db.settings.playoffFormat = 'role-balanced';
                db.settings.playoffRoleSize = parseInt(document.getElementById('playoff-role-size').value);
                db.settings.playoffDirectTeams = ({ 6: 2, 7: 1, 8: 0 })[db.settings.playoffRoleSize] ?? 0;
                db.settings.teamFormationMode = document.getElementById('team-formation-mode').value;
                db.settings.playoffFifthPlaceEnabled = document.getElementById('playoff-fifth-place').checked;
                
                if (db.settings.rounds < 1) db.settings.rounds = 1;
                if (db.settings.scoreTarget < 1) db.settings.scoreTarget = 1;
                if (db.settings.playoffScoreTarget < 1) db.settings.playoffScoreTarget = 1;
                if (db.settings.playoffsTop < 2) db.settings.playoffsTop = 2;
                if (![6, 7, 8].includes(db.settings.playoffRoleSize)) db.settings.playoffRoleSize = 8;

                reloadFullUI();
                ui.showAlert('Impostazioni salvate con successo.', 'success');
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

           renderTvMode: () => {
            const tvContent = document.getElementById('tv-content');
            if (!tvContent) return;

            const liveMatches = db.schedule.filter(m => m.inProgress && !m.played);
            const standings = utils.getStandings().slice(0, 10); // Mostra solo la Top 10

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

                <!-- Colonna Destra: Classifica -->
                <div class="tv-card">
                    <h2 class="tv-section-title"><i data-lucide="trophy" class="w-6 h-6 text-amber-500"></i> Top 10 Classifica</h2>
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

            // Aggiorna automaticamente la TV ogni 10 secondi
            if (!views.tvInterval) {
                views.tvInterval = setInterval(() => {
                    if (!document.getElementById('tv-modal').classList.contains('hidden')) {
                        views.renderTvMode();
                    }
                }, 10000);
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
/**
 * GYM-VIEW.JS (V8.0 - FINAL RECEIPT RENDERER)
 * Camada de Visualização.
 * Responsável por: Renderização de Treinos, Seletor de Fase,
 * Interface Híbrida de Corrida e Auditoria Detalhada (Nota Fiscal).
 */

window.GymView = {

    containerId: null,
    activeGymTab: 'gym-routines-section', // Aba padrão (Treinos)
    runTimerInterval: null, // Intervalo local para atualização visual do timer de corrida

    /**
     * Inicializa a View, vincula ao container e configura navegação interna.
     */
    init: function(containerId) {
        this.containerId = containerId;
        this._setupInternalNav();
        this._injectOathModal(); // V5.9: Garante que o modal de juramento exista
        console.log("[GymView] Interface V8.0 (Receipt Renderer) inicializada.");
    },

    /**
     * V5.9: Injeção do Modal de Juramento (caso não exista no HTML base)
     */
    _injectOathModal: function() {
        if (document.getElementById('modal-gym-oath')) return;
        const div = document.createElement('div');
        div.id = 'modal-gym-oath';
        div.className = 'modal-overlay hidden';
        div.style.zIndex = '2500'; // Garante topo
        div.innerHTML = `
            <div class="modal-content oath-content">
                <span class="oath-icon">🛡️</span>
                <div class="oath-question">
                    Você jura solenemente que deu <strong>100% de si</strong> e nenhuma grama a menos nesta série final?
                </div>
                <div class="oath-buttons">
                    <button id="btn-oath-yes" class="btn-oath-yes">SIM, EU JURO!</button>
                    <button id="btn-oath-no" class="btn-oath-no">Não foi 100%</button>
                </div>
            </div>
        `;
        document.body.appendChild(div);
    },

    /**
     * Configura os botões da barra de navegação interna (Treinos vs Histórico).
     */
    _setupInternalNav: function() {
        const btns = document.querySelectorAll('.gym-nav-btn');
        if (btns.length > 0) {
            btns.forEach(btn => {
                btn.onclick = () => {
                    const target = btn.getAttribute('data-gym-target');
                    this.switchTab(target);
                };
            });
        }
    },

    /**
     * Alterna entre abas e renderiza o conteúdo apropriado.
     */
    switchTab: function(tabId) {
        this.activeGymTab = tabId;
        
        // Atualiza estado visual dos botões
        document.querySelectorAll('.gym-nav-btn').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-gym-target') === tabId);
        });

        // Alterna visibilidade das seções
        const sections = document.querySelectorAll('.gym-tab-content');
        if (sections.length > 0) {
            sections.forEach(s => {
                s.classList.toggle('active', s.id === tabId);
            });
        }

        this.render();
    },

    /**
     * Função Mestre de Renderização.
     * Decide o que mostrar com base no estado atual (Treino Ativo, Home ou Histórico).
     */
    render: function() {
        // Limpa intervalo anterior de corrida para não duplicar
        if (this.runTimerInterval) clearInterval(this.runTimerInterval);

        const container = document.getElementById(this.containerId);
        if (!container) return;

        container.innerHTML = '';
        const activeSession = window.GymModel.getActiveSession();

        // Prioridade: Se há treino ativo, mostra a sessão.
        if (activeSession) {
            this._renderSession(container, activeSession);
        } else if (this.activeGymTab === 'gym-routines-section') {
            this._renderHome(container);
        } else {
            this._renderHistory(container);
        }
        
        // Sincroniza o Widget do Auditor em MODO SILENCIOSO (autoShow = false)
        this.updateAuditorWithGym(false);
    },

    // =========================================
    // 1. HOME (LISTA DE ROTINAS)
    // =========================================

    _renderHome: function(container) {
        // V5.9: Seletor de Fase (Biological Justice)
        const currentPhase = (window.GlobalApp.data.gym.settings && window.GlobalApp.data.gym.settings.currentPhase) || 'main';
        
        const phaseContainer = document.createElement('div');
        phaseContainer.className = 'phase-selector-container';
        phaseContainer.innerHTML = `
            <button class="phase-btn phase-cut ${currentPhase === 'cut' ? 'active' : ''}" onclick="window.GymController.setGymPhase('cut')">✂️ Cut (1.5x)</button>
            <button class="phase-btn phase-main ${currentPhase === 'main' ? 'active' : ''}" onclick="window.GymController.setGymPhase('main')">⚖️ Main (1.2x)</button>
            <button class="phase-btn phase-bulk ${currentPhase === 'bulk' ? 'active' : ''}" onclick="window.GymController.setGymPhase('bulk')">🦍 Bulk (1.0x)</button>
        `;
        container.appendChild(phaseContainer);

        // Cabeçalho com botão de Criar Nova Rotina
        const header = document.createElement('div');
        header.className = 'gym-screen-header';
        header.innerHTML = `
            <span class="gym-title">Meus Treinos</span>
            <button class="btn-new-routine" onclick="window.GymController.openCreateRoutineModal()">
                + Nova Rotina
            </button>
        `;
        container.appendChild(header);

        const list = document.createElement('div');
        list.className = 'routines-list';
        
        const routines = window.GymModel.getAllRoutines();

        if (routines.length === 0) {
            list.innerHTML = `
                <div style="text-align:center; padding:60px 20px; opacity:0.3;">
                    <div style="font-size:3rem; margin-bottom:15px;">🏋️‍♂️</div>
                    <p>Você ainda não criou nenhuma rotina.</p>
                </div>
            `;
        } else {
            routines.forEach(routine => {
                const card = document.createElement('div');
                card.className = 'routine-card';
                
                // Monta preview dos exercícios
                const names = (routine.exercises || []).map(id => {
                    const ex = window.GymModel.getExerciseById(id);
                    return ex ? ex.name : "Ex. Removido";
                });

                card.innerHTML = `
                    <div class="routine-header">
                        <div class="routine-info">
                            <h3>${routine.name}</h3>
                            <div class="routine-exercises-preview">${names.join(', ') || 'Rotina Vazia'}</div>
                        </div>
                        <div class="routine-actions">
                            <button class="routine-menu-btn" title="Adicionar Exercício" onclick="window.GymController.addExerciseToRoutine('${routine.id}')">➕</button>
                            <button class="routine-menu-btn routine-config-btn" title="Configurar Rotina" onclick="window.GymController.openEditRoutineModal('${routine.id}')">⚙️</button>
                            <button class="routine-menu-btn routine-delete-btn" title="Apagar Rotina" onclick="window.GymController.deleteRoutine('${routine.id}')">🗑️</button>
                        </div>
                    </div>
                    <button class="btn-start-routine" onclick="window.GymController.startSession('${routine.id}')">
                        Iniciar Treino
                    </button>
                `;
                list.appendChild(card);
            });
        }
        container.appendChild(list);
    },

    // =========================================
    // 2. MODAL DE EDIÇÃO DE ROTINA (Lista Reordenável)
    // =========================================

    renderEditRoutineList: function(routineId) {
        const container = document.getElementById('edit-routine-exercises-list');
        const nameInput = document.getElementById('edit-routine-name');
        if (!container || !nameInput) return;

        container.innerHTML = '';
        const routine = window.GymModel.getRoutineById(routineId);
        if (!routine) return;

        nameInput.value = routine.name;

        if (routine.exercises.length === 0) {
            container.innerHTML = '<p style="text-align:center; opacity:0.5; padding:20px;">Nenhum exercício nesta rotina.</p>';
            return;
        }

        routine.exercises.forEach((exId, index) => {
            const ex = window.GymModel.getExerciseById(exId);
            const exName = ex ? ex.name : "Exercício Desconhecido";
            
            const item = document.createElement('div');
            item.className = 'edit-routine-item';
            item.innerHTML = `
                <span class="edit-routine-name">${index + 1}. ${exName}</span>
                <div class="reorder-controls">
                    <button class="btn-reorder" onclick="window.GymController.moveExerciseUp('${routineId}', ${index})">⬆️</button>
                    <button class="btn-reorder" onclick="window.GymController.moveExerciseDown('${routineId}', ${index})">⬇️</button>
                    <button class="btn-delete-item" onclick="window.GymController.removeExerciseFromRoutine('${routineId}', ${index})">✖</button>
                </div>
            `;
            container.appendChild(item);
        });
    },

    // =========================================
    // 3. SESSÃO ATIVA (LAYOUT V57 - 6 COLUNAS)
    // =========================================

    _renderSession: function(container, session) {
        // Sticky Header (Fixo no topo)
        const stickyHeader = document.createElement('div');
        stickyHeader.className = 'workout-sticky-header';
        stickyHeader.innerHTML = `
            <div style="display:flex; flex-direction:column;">
                <span style="font-size:0.65rem; color:var(--gym-text-sub); text-transform:uppercase; font-weight:700;">Treino em Andamento</span>
                <strong style="color:var(--gym-accent); font-size:1.1rem;">${session.routineName}</strong>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
                <div id="session-timer-display" class="session-timer">00:00</div>
                <button class="btn-finish-workout" onclick="window.GymController.finishSession()">Finalizar</button>
            </div>
        `;
        container.appendChild(stickyHeader);

        // Renderiza cada exercício
        session.exercises.forEach((ex, exIndex) => {
            
            // --- INTERFACE HÍBRIDA PARA CORRIDA (V6.0: DASHBOARD + HIT) ---
            if (ex.name === 'Corrida') {
                const card = document.createElement('div');
                card.className = 'session-exercise-card';
                
                // Header Normal
                card.innerHTML = `
                    <div class="session-exercise-header">
                        <span class="session-exercise-name">🏃 ${ex.name} (Híbrido)</span>
                        <button class="btn-ex-stats" onclick="window.GymView.showExerciseChart('${ex.id}')">📊</button>
                    </div>
                `;

                // 1. DASHBOARD DE CORRIDA (Parte Superior)
                const dashboard = document.createElement('div');
                dashboard.className = 'run-dashboard-container';

                // Dados
                const pr = window.GymModel.getRunningPR();
                const dist = ex.runDistance || 0;
                
                // Timer Logic Calculation
                let initialTimeMs = ex.runElapsedTime || 0;
                if (ex.isRunning && ex.runStartTime) {
                    initialTimeMs += (Date.now() - ex.runStartTime);
                }
                const timeStr = this._formatTime(Math.floor(initialTimeMs / 1000));

                // Botão de definir PR se for 0
                const prBtnHTML = (pr === 0) 
                    ? `<button class="btn-set-pr" onclick="window.GymController.promptSetPR()">Definir PR Inicial</button>` 
                    : `<span class="run-stat-value pr">${pr.toFixed(2)}km</span>`;

                const toggleIcon = ex.isRunning ? '⏸️' : '▶️';
                const toggleClass = ex.isRunning ? 'btn-run-pause' : 'btn-run-play';

                dashboard.innerHTML = `
                    <div class="run-dashboard-top">
                        <span class="run-stat-label">RECORD PESSOAL (PR)</span>
                        ${pr === 0 ? prBtnHTML : `<div style="text-align:right">${prBtnHTML}</div>`}
                    </div>

                    <div id="run-timer-${exIndex}" class="run-timer-display">${timeStr}</div>

                    <div class="run-timer-controls">
                        <button class="${toggleClass}" onclick="window.GymController.toggleRunTimer(${exIndex})">${toggleIcon}</button>
                    </div>

                    <div class="run-stats-grid">
                        <div class="run-stat-box">
                            <span class="run-stat-label">DISTÂNCIA ATUAL</span>
                            <span class="run-stat-value">${dist.toFixed(2)}km</span>
                        </div>
                        <div class="run-stat-box">
                            <span class="run-stat-label">META XP</span>
                            <span class="run-stat-value" style="color:var(--gym-accent)">Exponencial</span>
                        </div>
                    </div>

                    <div class="run-controls-grid">
                        <button class="btn-dist-shortcut" onclick="window.GymController.addRunShortcut(${exIndex}, 0.01)">+10m</button>
                        <button class="btn-dist-shortcut" onclick="window.GymController.addRunShortcut(${exIndex}, 0.1)">+100m</button>
                        <button class="btn-dist-shortcut" onclick="window.GymController.addRunShortcut(${exIndex}, 0.5)">+500m</button>
                        <button class="btn-dist-shortcut" onclick="window.GymController.addRunShortcut(${exIndex}, 1.0)">+1km</button>
                    </div>

                    <div class="run-manual-input-container">
                        <input type="number" id="run-manual-km-${exIndex}" class="run-manual-km-input" placeholder="KM Manual (Total)">
                        <button class="btn-add-km-manual" onclick="window.GymController.addRunManual(${exIndex})">DEFINIR</button>
                    </div>
                `;

                card.appendChild(dashboard);

                // 2. INTERFACE HIT (Parte Inferior - Restaurada)
                const runContainer = document.createElement('div');
                runContainer.className = 'run-interface-container';

                // Botão Mestre HIT
                const hitBtn = document.createElement('button');
                hitBtn.className = 'hit-master-btn';
                hitBtn.innerHTML = '⚡ INTERVALOS DE HIT';
                hitBtn.onclick = () => window.GymController.addHitInterval(exIndex);
                runContainer.appendChild(hitBtn);

                // Renderiza intervalos (Sets de corrida HIT)
                if (ex.sets && ex.sets.length > 0) {
                    ex.sets.forEach((set, setIndex) => {
                        const row = document.createElement('div');
                        row.className = 'hit-time-row';

                        // Input Manual (Time em segundos)
                        const input = document.createElement('input');
                        input.type = 'number';
                        input.id = `hit-input-${exIndex}-${setIndex}`;
                        input.className = 'hit-manual-input';
                        input.value = set.val1 || 0; 
                        input.placeholder = '0s';
                        input.onchange = () => window.GymController.updateHitTime(exIndex, setIndex, 0);

                        // Grid de Atalhos
                        const shortcutsDiv = document.createElement('div');
                        shortcutsDiv.className = 'hit-shortcuts-grid';
                        
                        const times = [10, 30, 60, 300];
                        const labels = ['+10s', '+30s', '+1m', '+5m'];

                        times.forEach((t, i) => {
                            const btn = document.createElement('button');
                            btn.className = 'hit-shortcut-btn';
                            btn.textContent = labels[i];
                            btn.onclick = () => window.GymController.updateHitTime(exIndex, setIndex, t);
                            shortcutsDiv.appendChild(btn);
                        });

                        // Botão Remover Linha
                        const delBtn = document.createElement('button');
                        delBtn.className = 'btn-remove-hit';
                        delBtn.innerHTML = '×';
                        delBtn.onclick = () => window.GymController.removeHitInterval(exIndex, setIndex);

                        row.appendChild(input);
                        row.appendChild(shortcutsDiv);
                        row.appendChild(delBtn);
                        runContainer.appendChild(row);
                    });
                }

                card.appendChild(runContainer);
                container.appendChild(card);

                // Lógica de Atualização Visual do Timer Específico
                if (ex.isRunning) {
                    this._activateRunTimerVisual(exIndex, ex.runStartTime, ex.runElapsedTime);
                }

                return; // Pula renderização padrão
            }
            // --- FIM INTERFACE HÍBRIDA CORRIDA ---

            const card = document.createElement('div');
            card.className = 'session-exercise-card';
            
            // Definição de Labels (KG/REPS ou TEMPO)
            let label1 = "KG", label2 = "REPS";
            if (ex.type && ex.type.includes('dur')) label2 = "TEMPO";
            if (ex.type && ex.type.includes('no_weight')) label1 = "PESO";

            let setsHTML = '';
            
            // Loop de Séries
            ex.sets.forEach((set, setIndex) => {
                const checkedClass = set.done ? 'checked' : '';

                // LÓGICA V57: Ícone e Cor baseados no estado (Aquecimento vs Válida)
                // Se isWarmup == true, mostra Fogo Laranja. Se false, mostra Braço Azul.
                const typeIcon = set.isWarmup ? '🔥' : '💪';
                const typeClass = set.isWarmup ? 'is-warmup' : 'is-valid';

                /* GRID V57 (6 Colunas): 
                   1. Botão Tipo (Substitui número da série)
                   2. Histórico Anterior (Last)
                   3. Input 1 (Carga - Largo)
                   4. Input 2 (Reps - Largo)
                   5. Input Rest (Descanso)
                   6. Check Button
                */
                setsHTML += `
                    <div class="set-row">
                        <div>
                            <button class="btn-set-type ${typeClass}" 
                                    onclick="window.GymController.openSetTypeSelector(${exIndex}, ${setIndex})"
                                    title="Alterar tipo de série">
                                ${typeIcon}
                            </button>
                        </div>
                        
                        <div class="set-prev" style="font-size:0.7rem; opacity:0.6;">Hist.</div> 
                        
                        <div>
                            <input type="number" id="v1-${exIndex}-${setIndex}" class="gym-input" 
                                   value="${set.val1}" placeholder="0" inputmode="decimal"
                                   onchange="window.GymController.updateSetData(${exIndex}, ${setIndex})">
                        </div>
                        
                        <div>
                            <input type="number" id="v2-${exIndex}-${setIndex}" class="gym-input" 
                                   value="${set.val2}" placeholder="0" inputmode="numeric"
                                   onchange="window.GymController.updateSetData(${exIndex}, ${setIndex})">
                        </div>
                        
                        <div>
                            <input type="number" id="r-${exIndex}-${setIndex}" class="gym-input" 
                                   value="${set.rest}" placeholder="60" inputmode="numeric"
                                   onchange="window.GymController.updateSetData(${exIndex}, ${setIndex})"
                                   style="color:var(--gym-gold); border-bottom: 1px solid rgba(255,214,10,0.2);">
                        </div>
                        
                        <div>
                            <button id="btn-check-${exIndex}-${setIndex}" class="btn-check-set ${checkedClass}" 
                                    onclick="window.GymController.toggleCheck(${exIndex}, ${setIndex})"></button>
                        </div>
                    </div>
                `;
            });

            // Montagem do Card do Exercício
            card.innerHTML = `
                <div class="session-exercise-header">
                    <span class="session-exercise-name">${ex.name}</span>
                    <button class="btn-ex-stats" onclick="window.GymView.showExerciseChart('${ex.id}')">📊</button>
                </div>
                <div class="sets-grid">
                    <div class="sets-header">TIPO</div>
                    <div class="sets-header align-left">LAST</div>
                    <div class="sets-header">${label1}</div>
                    <div class="sets-header">${label2}</div>
                    <div class="sets-header" style="color:var(--gym-gold)">REST</div>
                    <div class="sets-header">✓</div>
                    ${setsHTML}
                    <button class="btn-add-set" onclick="window.GymController.addSetToExercise(${exIndex})">+ Adicionar Série</button>
                </div>
            `;
            container.appendChild(card);
        });

        // Botão de Cancelamento no final
        const cancelDiv = document.createElement('div');
        cancelDiv.style.cssText = "text-align:center; padding:30px 0;";
        cancelDiv.innerHTML = `
            <button onclick="window.GymController.cancelSession()" 
                    style="background:none; border:none; color:var(--gym-danger); text-decoration:underline; cursor:pointer;">
                CANCELAR TREINO
            </button>
        `;
        container.appendChild(cancelDiv);
    },

    // =========================================
    // AUXILIARES DE CORRIDA (V6.0)
    // =========================================

    _formatTime: function(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        
        // Se tiver hora, mostra HH:MM:SS, senão MM:SS
        if (h > 0) {
            return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
        }
        return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    },

    _activateRunTimerVisual: function(exIndex, startTime, elapsedBefore) {
        // Se já existe um intervalo rodando, limpa
        if (this.runTimerInterval) clearInterval(this.runTimerInterval);

        const el = document.getElementById(`run-timer-${exIndex}`);
        if (!el) return;

        this.runTimerInterval = setInterval(() => {
            const now = Date.now();
            const totalSeconds = Math.floor((elapsedBefore + (now - startTime)) / 1000);
            el.textContent = this._formatTime(totalSeconds);
        }, 1000);
    },

    // =========================================
    // 4. HISTÓRICO & AUDITORIA
    // =========================================

    _renderHistory: function(container) {
        const header = document.createElement('div');
        header.className = 'section-header';
        header.innerHTML = `<h2>Histórico de Atividade</h2>`;
        container.appendChild(header);

        const logs = window.GlobalApp.data.gym.xpLogs || [];
        
        let rowsHTML = '';
        if (logs.length === 0) {
            rowsHTML = '<tr><td colspan="5" style="text-align:center; padding:40px; opacity:0.5;">Sem logs registrados.</td></tr>';
        } else {
            logs.forEach(log => {
                // Se tiver math (receipt), pode mostrar ícone ou tooltip
                const mathTip = log.math ? 'title="Ver Nota Fiscal"' : '';
                const mathIcon = log.math ? ' 🧾' : '';
                
                rowsHTML += `
                    <tr>
                        <td style="font-size:0.75rem; color:var(--gym-text-sub);">${log.date}<br>${new Date(log.timestamp).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</td>
                        <td><strong>${log.exerciseName}</strong></td>
                        <td style="font-size:0.8rem;">${log.detail}</td>
                        <td class="gym-log-xp" ${mathTip}>+${log.xp} XP${mathIcon}</td>
                        <td><button class="btn-undo-gym" onclick="window.GymController.undoLog('${log.id}')">Desfazer</button></td>
                    </tr>
                `;
            });
        }

        const table = document.createElement('div');
        table.className = 'logs-container';
        table.innerHTML = `
            <table id="gym-log-table">
                <thead><tr><th>Hora</th><th>Origem</th><th>Detalhe</th><th>XP</th><th>Ação</th></tr></thead>
                <tbody>${rowsHTML}</tbody>
            </table>
        `;
        container.appendChild(table);
    },

    /**
     * Atualiza o Widget Flutuante do Auditor com o total de XP de hoje e o RECEIPT do último ganho.
     */
    updateAuditorWithGym: function(autoShow = true) {
        const auditWidget = document.getElementById('xp-audit-widget');
        if (!auditWidget) return;

        const logs = window.GlobalApp.data.gym.xpLogs || [];
        const todayStr = window.GlobalApp.formatDate(new Date());

        // Soma todo o XP gerado pela academia hoje
        const todayLogs = logs.filter(l => l.date === todayStr);
        const totalXP = todayLogs.reduce((acc, curr) => acc + (curr.xp || 0), 0);

        // Pega o último log para mostrar a Nota Fiscal
        const latestLog = todayLogs.length > 0 ? todayLogs[0] : null;

        let gymRow = auditWidget.querySelector('.audit-row.gym-info');
        if (!gymRow) {
            gymRow = document.createElement('div');
            gymRow.className = 'audit-row gym-info';
            // Permite crescimento vertical para a nota fiscal
            gymRow.style.flexDirection = 'column'; 
            auditWidget.appendChild(gymRow);
        }
        
        if (totalXP > 0) {
            gymRow.style.display = 'flex';
            
            // Header do Total Diário (Fica acima da nota)
            let html = `<div style="display:flex; justify-content:space-between; width:100%; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:5px; margin-bottom:5px;"><span>🏋️ Total Hoje:</span> <span style="color:var(--gym-gold)">+${totalXP.toFixed(1)} XP</span></div>`;
            
            // Renderização da Nota Fiscal (Receipt Object) - V8.0
            if (latestLog && typeof latestLog.math === 'object' && latestLog.math !== null) {
                const r = latestLog.math;
                
                html += `<div style="font-family:monospace; font-size:0.75rem; color:#ccc; background:rgba(0,0,0,0.3); padding:5px; border-radius:4px;">`;
                html += `<div style="text-align:center; font-weight:bold; margin-bottom:5px; border-bottom:1px dashed #555; padding-bottom:3px;">🧾 NOTA FISCAL DE XP: ${r.title}</div>`;
                
                if (r.sections) {
                    r.sections.forEach(sec => {
                        html += `<div style="margin-top:4px; color:#888; font-size:0.65rem; border-bottom:1px dotted #444;">${sec.title}</div>`;
                        if (sec.rows) {
                            sec.rows.forEach(row => {
                                if (row.isSub) {
                                    html += `<div style="padding-left:10px; color:#666; font-style:italic;">↳ ${row.label} ${row.value}</div>`;
                                } else {
                                    html += `<div style="display:flex; justify-content:space-between;"><span>• ${row.label}</span> <span>${row.value}</span></div>`;
                                }
                            });
                        }
                    });
                }
                
                html += `<div style="margin-top:5px; border-top:1px dashed #555; padding-top:3px; display:flex; justify-content:space-between; font-weight:bold; color:var(--gym-success);"><span>TOTAL LÍQUIDO:</span> <span>${r.total} XP</span></div>`;
                html += `</div>`;
            } else if (latestLog && typeof latestLog.math === 'string') {
                // Fallback para logs antigos (String)
                html += `<div style="font-size:0.7rem; color:#aaa; margin-top:2px; text-align:right;">${latestLog.math} = <strong>${latestLog.xp}</strong></div>`;
            }

            gymRow.innerHTML = html;
        } else {
            gymRow.style.display = 'none';
        }
    },

    // =========================================
    // 5. GRÁFICOS (Renderização Segura)
    // =========================================

    showExerciseChart: function(exerciseId) {
        try {
            const ex = window.GymModel.getExerciseById(exerciseId);
            if (!ex) return;

            document.getElementById('gym-chart-title').textContent = `Evolução: ${ex.name}`;
            const container = document.getElementById('gym-chart-container');
            container.innerHTML = '';

            const progress = window.GymModel.getExerciseProgress(exerciseId);

            // Verifica se há dados válidos antes de tentar desenhar
            if (!progress || progress.length === 0) {
                container.innerHTML = '<p style="margin:auto; color:var(--gym-text-sub);">Sem dados históricos para exibir.</p>';
            } else {
                const values = progress.map(p => p.value);
                let maxVal = Math.max(...values);
                // Evita divisão por zero ou infinito
                if (!isFinite(maxVal) || maxVal === 0) maxVal = 1;

                progress.forEach(p => {
                    const h = (p.value / maxVal) * 100;
                    const bar = document.createElement('div');
                    bar.className = 'chart-bar';
                    bar.style.height = `${h}%`;
                    bar.setAttribute('data-value', p.value);
                    container.appendChild(bar);
                });
            }

            this.toggleModal('modal-gym-chart', true);

        } catch (error) {
            console.error("[GymView] Erro crítico ao gerar gráfico:", error);
            alert("Não foi possível gerar o gráfico neste momento.");
        }
    },

    // =========================================
    // UTILITÁRIOS
    // =========================================

    updateTimer: function(str) {
        const el = document.getElementById('session-timer-display');
        if (el) el.textContent = str;
    },

    toggleCheckVisual: function(exIndex, setIndex, isDone) {
        const btn = document.getElementById(`btn-check-${exIndex}-${setIndex}`);
        if (btn) btn.classList.toggle('checked', isDone);
        
        // Interação ativa: Força atualização E exibição do widget
        this.updateAuditorWithGym(true);
    },

    toggleModal: function(id, show) {
        const modal = document.getElementById(id);
        if (modal) modal.classList.toggle('hidden', !show);
    },

    /**
     * Renderiza a lista de seleção de exercícios (usada nos modais de adicionar).
     */
    renderExerciseSelectionList: function(list, onSelect) {
        const container = document.getElementById('gym-exercises-list');
        if (!container) return;
        container.innerHTML = '';
        list.forEach(ex => {
            const item = document.createElement('div');
            item.className = 'gym-select-item';
            item.innerHTML = `
                <div><h4>${ex.name}</h4><small>${ex.type}</small></div>
                <span>+</span>
            `;
            item.onclick = () => onSelect(ex.id);
            container.appendChild(item);
        });
    }
};

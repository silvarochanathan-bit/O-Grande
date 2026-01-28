/**
 * GYM-VIEW.JS
 * A Interface Visual do Módulo Iron Forge.
 * Responsável por: Cards de Exercício, UI de Cardio Exponencial, Timer Visual e Modais.
 */

window.GymView = {

    containerId: null,
    activeTimerInterval: null,

    init: function(containerId) {
        this.containerId = containerId;
    },

    render: function() {
        const container = document.getElementById(this.containerId);
        if (!container) return;
        container.innerHTML = '';

        // 1. Header de Contexto (Fase & Streak)
        container.appendChild(this._renderHeader());

        // 2. Lista de Exercícios (Working Sets)
        const workoutContainer = document.createElement('div');
        workoutContainer.className = 'gym-workout-container';
        
        // Pega exercícios ativos (Exemplo: filtrados por dia ou treino A/B - lógica do controller)
        // Aqui assumimos que o Controller já preparou a lista em GlobalApp.data.gym.activeWorkout
        const exercises = window.GlobalApp.data.gym.activeWorkout || [];
        
        if (exercises.length === 0) {
            workoutContainer.innerHTML = `<div class="gym-empty-state">Selecione um treino para começar a forjar.</div>`;
        } else {
            exercises.forEach(ex => {
                workoutContainer.appendChild(this._renderExerciseCard(ex));
            });
        }
        container.appendChild(workoutContainer);

        // 3. Módulo Cardio (A Isca)
        container.appendChild(this._renderCardioSection());

        // 4. Botão Finalizar Treino
        const finishBtn = document.createElement('button');
        finishBtn.className = 'gym-finish-btn';
        finishBtn.innerHTML = `🏁 FINALIZAR SESSÃO`;
        finishBtn.onclick = () => window.GymController.finishWorkout();
        container.appendChild(finishBtn);
    },

    // --- 1. HEADER CONTEXTUAL ---
    _renderHeader: function() {
        const header = document.createElement('div');
        header.className = 'gym-header';
        
        const phase = window.GlobalApp.data.gym.currentPhase || 'maintenance';
        const streak = window.GlobalApp.data.gym.streak || 0;
        
        // Ícones e Textos baseados na fase
        const phaseMeta = {
            cutting: { icon: '🔪', label: 'Déficit (XP x1.5)', color: '#ff5252' },
            maintenance: { icon: '⚖️', label: 'Manutenção (XP x1.2)', color: '#448aff' },
            bulking: { icon: '🦍', label: 'Superávit (XP x1.0)', color: '#69f0ae' }
        };
        const meta = phaseMeta[phase];

        header.innerHTML = `
            <div class="gym-stat-box" style="border-color: ${meta.color}">
                <span class="gym-label">Fase Atual</span>
                <span class="gym-value" style="color:${meta.color}">${meta.icon} ${meta.label}</span>
            </div>
            <div class="gym-stat-box streak">
                <span class="gym-label">Consistência</span>
                <span class="gym-value">🔥 ${streak} Dias</span>
            </div>
            <div class="gym-actions">
                <button onclick="window.GymController.toggleRestDay()" class="gym-rest-btn">💤 Registrar Descanso</button>
            </div>
        `;
        return header;
    },

    // --- 2. CARD DE EXERCÍCIO (CORE) ---
    _renderExerciseCard: function(exercise) {
        const card = document.createElement('div');
        card.className = 'gym-card';
        card.id = `gym-card-${exercise.id}`;

        // Busca PR Global para comparação visual
        const pr = window.GymModel.getExercisePR(exercise.id);
        const prLabel = pr.load > 0 ? `${pr.load}kg (${pr.reps}x)` : 'Sem Registro';

        card.innerHTML = `
            <div class="gym-card-header">
                <div class="gym-ex-info">
                    <h4>${exercise.name}</h4>
                    <span class="gym-pr-badge">🏆 PR: ${prLabel}</span>
                </div>
                <div class="gym-timer-display" id="timer-display-${exercise.id}">--:--</div>
            </div>

            <div class="gym-inputs-row">
                <div class="gym-input-group">
                    <label>Carga (kg)</label>
                    <input type="number" id="load-${exercise.id}" value="${pr.load}" step="0.5" placeholder="Kg">
                </div>
                <div class="gym-input-group">
                    <label>Reps</label>
                    <input type="number" id="reps-${exercise.id}" value="${pr.reps}" placeholder="Qtd">
                </div>
                <button class="gym-check-btn" onclick="window.GymController.checkSet('${exercise.id}')">
                    CHECK SET ✔
                </button>
            </div>

            <div class="gym-sets-track" id="sets-track-${exercise.id}">
                ${this._renderSetBubbles(exercise)}
            </div>

            <div class="gym-card-footer">
                <button class="gym-opt-btn" onclick="window.GymController.toggleAdapt('${exercise.id}')">
                    🧬 Adapt (${exercise.isAdapt ? 'ON' : 'OFF'})
                </button>
                <button class="gym-opt-btn finish" onclick="window.GymController.finishExercise('${exercise.id}')">
                    Encerrar Exercício
                </button>
            </div>
        `;
        return card;
    },

    _renderSetBubbles: function(exercise) {
        let html = '';
        const doneSets = exercise.setsDone || 0;
        // Desenha até 5 slots ou baseado na meta
        for (let i = 0; i < 5; i++) {
            const statusClass = i < doneSets ? 'done' : 'pending';
            html += `<div class="set-bubble ${statusClass}"></div>`;
        }
        return html;
    },

    // --- 3. MÓDULO CARDIO (A ISCA) ---
    _renderCardioSection: function() {
        const section = document.createElement('div');
        section.className = 'gym-cardio-section';
        
        // Dados simulados (O Controller deve passar isso real)
        const currentDist = window.GlobalApp.data.gym.cardioSession || 0;
        const cardioPR = window.GlobalApp.data.gym.cardioPR || 5000; // Exemplo 5km
        
        // Cálculo de Proporção para UI
        const ratio = currentDist / (cardioPR > 0 ? cardioPR : 1);
        const percent = Math.min(100, Math.floor(ratio * 100));
        
        // Botões Dinâmicos (Iscas)
        let buttonsHTML = '';
        
        // Lógica de "Iscas" baseada na proximidade do PR
        if (percent < 70) {
            buttonsHTML = `<button class="bait-btn big" onclick="window.GymController.addCardio(1000)">+1.000m</button>`;
        } else if (percent < 90) {
            buttonsHTML = `
                <button class="bait-btn medium" onclick="window.GymController.addCardio(500)">+500m</button>
                <button class="bait-btn medium" onclick="window.GymController.addCardio(250)">+250m</button>
            `;
        } else {
            // Reta Final / God Mode
            buttonsHTML = `
                <button class="bait-btn small" onclick="window.GymController.addCardio(100)">+100m</button>
                <button class="bait-btn small god-mode" onclick="window.GymController.addCardio(10)">+10m</button>
            `;
        }

        section.innerHTML = `
            <h4>🏃 Cardio Exponencial</h4>
            <div class="cardio-progress-bar">
                <div class="cardio-fill" style="width: ${percent}%"></div>
                <span class="cardio-text">${currentDist}m / ${cardioPR}m (PR)</span>
            </div>
            <div class="cardio-controls">
                ${buttonsHTML}
            </div>
            <div class="cardio-info">
                ${percent >= 100 ? '🔥 GOD MODE ATIVO: XP EXPLOSIVO!' : 'Continue... o bônus cresce a cada metro.'}
            </div>
        `;
        return section;
    },

    // --- 4. MODAL DO JURAMENTO ---
    openOathModal: function(exerciseName, totalXP, onConfirm) {
        const { overlay, content } = window.SysModal._createContainer();
        
        content.innerHTML = `
            <div class="gym-oath-modal">
                <h3>🗡️ O JURAMENTO DE FERRO</h3>
                <p>Você acabou de finalizar <strong>${exerciseName}</strong>.</p>
                <p class="oath-text">"Juro solenemente que dei 100% de esforço, mantive a técnica e não deixei nenhuma repetição no tanque por preguiça."</p>
                
                <div class="gym-xp-preview">
                    XP Acumulado: <strong>${totalXP}</strong>
                    <br>
                    <span style="color:var(--habit-success)">Bônus de Intensidade: +20%</span>
                </div>

                <div class="sys-modal-actions">
                    <button class="secondary-btn" id="btn-oath-deny">Fui Humano (Sem Bônus)</button>
                    <button class="primary-btn oath-confirm" id="btn-oath-confirm">EU JURO (Aplicar Bônus)</button>
                </div>
            </div>
        `;

        content.querySelector('#btn-oath-deny').onclick = () => {
            window.SysModal._close(overlay);
            onConfirm(false);
        };
        
        content.querySelector('#btn-oath-confirm').onclick = () => {
            if (window.SoundManager) window.SoundManager.play('chest'); // Som épico
            window.SysModal._close(overlay);
            onConfirm(true);
        };
    },

    // --- 5. TIMER VISUAL ---
    updateTimerUI: function(exerciseId, secondsRemaining, totalTime) {
        const display = document.getElementById(`timer-display-${exerciseId}`);
        if (!display) return;

        if (secondsRemaining <= 0) {
            display.textContent = "PRONTO!";
            display.classList.add('ready');
            if (window.SoundManager) window.SoundManager.play('notification');
        } else {
            display.textContent = window.GymModel.formatTime(secondsRemaining);
            display.classList.remove('ready');
            
            // Efeito visual de barra diminuindo (opcional, via CSS background)
            const pct = (secondsRemaining / totalTime) * 100;
            display.style.background = `linear-gradient(90deg, var(--habit-bg-input) ${pct}%, var(--habit-accent) ${pct}%)`;
        }
    }
};
/**
 * HABITS-VIEW.JS
 * Camada de Apresentação.
 * VERSÃO: V21 - PISO DE ESFORÇO (UI)
 * Alterações: Remoção da opção "Manutenção". Padronização para Crítico vs Normal.
 */

window.HabitView = {

    container: null,
    activeWidget: null, 
    auditWidget: null, 

    init: function(containerId) {
        this.container = document.getElementById(containerId);
        
        // Injeções Iniciais
        this.injectInfiniteOption();
        this.renderAuditWidget(); 
        
        // Listener para alternar configs de Contador no Modal
        const typeSelect = document.getElementById('habit-type');
        if(typeSelect) {
            typeSelect.addEventListener('change', (e) => {
                const configDiv = document.getElementById('habit-counter-config');
                if(configDiv) {
                    if (e.target.value === 'counter') configDiv.classList.remove('hidden');
                    else configDiv.classList.add('hidden');
                }
            });
        }
    },

    injectInfiniteOption: function() {
        const select = document.getElementById('habit-type');
        if (select && !select.querySelector('option[value="infinite"]')) {
            const opt = document.createElement('option');
            opt.value = 'infinite';
            opt.textContent = 'Infinito (XP por ação)';
            select.appendChild(opt);
        }
    },

    // =========================================================================
    // WIDGET AUDITOR (ALT+A) - NOTA FISCAL DE XP
    // =========================================================================

    renderAuditWidget: function() {
        if (document.getElementById('xp-audit-widget')) return;

        const el = document.createElement('div');
        el.id = 'xp-audit-widget';
        el.style.display = 'none'; // Começa oculto
        el.innerHTML = `
            <h4>🧮 NOTA FISCAL DE XP</h4>
            <div id="audit-content">
                <div style="opacity:0.6; text-align:center; padding:15px; font-size:0.8rem;">
                    Realize uma ação para<br>gerar o recibo detalhado.
                </div>
            </div>
        `;
        document.body.appendChild(el);
        this.auditWidget = el;
    },

    updateAuditWidget: function(habitName, finalXP, data) {
        try {
            const content = document.getElementById('audit-content');
            if (!content || !data) return;

            // Tratamento de segurança para valores (fallback)
            const level = data.level || 1;
            const baseRaw = data.baseRaw || 100;
            const k = data.k || 0.5;
            const v = data.v || 0;
            const actionValue = data.actionValue || 0;
            
            const drag = data.drag || 1.0;
            const streak = data.streak || 1.0;
            const adapt = data.adapt || 1.0;
            const adaptDay = data.adaptDay || 1;
            
            const synergy = data.synergy || 1.0;
            const synergyCount = data.synergyCount || 0; 
            
            const fatigue = data.fatigue || 1.0;
            const resilience = data.resilience || 1.0;
            const time = data.time || 1.0;

            // Formata Rótulo de Importância (ATUALIZADO)
            let impLabel = "Normal (0.5)";
            if (Math.abs(parseFloat(k) - 1.0) < 0.01) impLabel = "Crítico (1.0)";

            // Monta o HTML da Nota Fiscal (Expandido)
            content.innerHTML = `
                <div style="color:var(--habit-text-main); margin-bottom:10px; font-weight:bold; border-bottom:1px solid #444; padding-bottom:5px;">
                    ${habitName}
                </div>
                
                <div class="audit-row" style="color:#00e5ff;">
                    <span>[1] CÁLCULO BASE</span>
                </div>
                <div class="audit-row">
                    <span>• Nível (${level}) x 100</span>
                    <span>${baseRaw}</span>
                </div>
                <div class="audit-row">
                    <span>• Importância (${impLabel})</span>
                    <span>x ${k}</span>
                </div>
                <div class="audit-row">
                    <span>• Volume (Horas)</span>
                    <span>x ${v}</span>
                </div>
                <div class="audit-sub" style="border-top:1px dashed #444; margin-top:2px; padding-top:2px; margin-bottom:10px;">
                    = Valor da Ação: ${actionValue}
                </div>

                <div class="audit-row" style="color:#ffea00;">
                    <span>[2] MULTIPLICADORES</span>
                </div>
                <div class="audit-row">
                    <span>• Arrastre (Foco)</span>
                    <span>x ${drag}</span>
                </div>
                <div class="audit-row">
                    <span>• Consistência</span>
                    <span>x ${streak}</span>
                </div>
                <div class="audit-row">
                    <span>• Adaptação (Dia ${adaptDay})</span>
                    <span>${adapt > 1 ? 'x ' + adapt : 'Inativo'}</span>
                </div>
                <div class="audit-row">
                    <span>• Sinergia (${synergyCount} hábitos)</span>
                    <span>x ${synergy}</span>
                </div>
                <div class="audit-row">
                    <span>• Fadiga Cognitiva</span>
                    <span>x ${fatigue}</span>
                </div>
                <div class="audit-row">
                    <span>• Resiliência</span>
                    <span>x ${resilience}</span>
                </div>
                <div class="audit-row">
                    <span>• Horário (Bio-ritmo)</span>
                    <span>x ${time}</span>
                </div>
                
                <div class="audit-row total">
                    <span>TOTAL LÍQUIDO:</span>
                    <span>${finalXP} XP</span>
                </div>
            `;
            
            // Efeito visual de atualização
            const widget = document.getElementById('xp-audit-widget');
            if(widget) {
                widget.style.borderColor = '#fff';
                setTimeout(() => widget.style.borderColor = '', 300);
            }

        } catch (err) {
            console.error("Erro ao atualizar Auditor:", err);
        }
    },

    toggleAuditWidget: function() {
        const el = document.getElementById('xp-audit-widget');
        if (el) {
            const isHidden = (el.style.display === 'none' || getComputedStyle(el).display === 'none');
            el.style.display = isHidden ? 'block' : 'none';
        }
    },

    // =========================================================================
    // RENDERIZAÇÃO PRINCIPAL (LISTAS E ABAS)
    // =========================================================================

    render: function(habits, groups, activeTabId, activeTimeFilter) {
        if (!this.container) return;
        this.container.innerHTML = '';
        
        // 1. Barra de Filtros
        const filterBar = document.createElement('div');
        filterBar.className = 'filter-bar';
        const filters = [
            { id: 'today', label: 'Hoje' },
            { id: 'week', label: 'Semana' },
            { id: 'month', label: 'Mês' },
            { id: 'all', label: 'Todos' }
        ];

        filters.forEach(f => {
            const btn = document.createElement('button');
            btn.className = `filter-btn ${activeTimeFilter === f.id ? 'active' : ''}`;
            btn.textContent = f.label;
            btn.onclick = () => window.HabitManager.setTimeFilter(f.id);
            filterBar.appendChild(btn);
        });
        this.container.appendChild(filterBar);

        // 2. Navegação de Abas
        const navEl = document.createElement('div');
        navEl.className = 'habit-tabs-nav';
        
        const contentContainer = document.createElement('div');
        contentContainer.className = 'habit-contents-wrapper';

        const allTabs = [{ id: 'general', name: 'Geral' }, ...groups];

        allTabs.forEach(tab => {
            const isActive = (tab.id === activeTabId);
            const groupHabits = habits.filter(h => {
                return (tab.id === 'general') ? !h.groupId : h.groupId === tab.id;
            });

            // Filtra visibilidade e separa Dependentes
            const normalHabits = groupHabits.filter(h => !h.isDependent && window.HabitModel.checkHabitVisibility(h, activeTimeFilter));
            const standByHabits = groupHabits.filter(h => h.isDependent); 

            const totalVisible = normalHabits.length + standByHabits.length;

            // Botão da Aba
            const btn = document.createElement('button');
            btn.className = `habit-tab-btn ${isActive ? 'active' : ''}`;
            const badgeClass = totalVisible === 0 ? 'tab-badge zero' : 'tab-badge';
            btn.innerHTML = `${tab.name} <span class="${badgeClass}">${totalVisible}</span>`;
            btn.onclick = () => {
                if (window.SoundManager) window.SoundManager.play('click');
                window.HabitManager.setActiveTab(tab.id); 
            };
            navEl.appendChild(btn);

            // Container de Conteúdo da Aba
            const contentDiv = document.createElement('div');
            contentDiv.className = `habit-tab-content ${isActive ? 'active' : ''}`;
            contentDiv.id = `tab-content-${tab.id}`;

            if (tab.id !== 'general') {
                const optionsHeader = document.createElement('div');
                optionsHeader.className = 'tab-options-header';
                optionsHeader.innerHTML = `<button class="btn-delete-group" onclick="window.HabitManager.deleteGroup('${tab.id}')">🗑️ Apagar Grupo</button>`;
                contentDiv.appendChild(optionsHeader);
            }

            // Renderiza Hábitos Normais
            normalHabits.forEach(habit => contentDiv.appendChild(this.createHabitElement(habit)));

            // Renderiza Hábitos em Stand By (Se houver)
            if (standByHabits.length > 0) {
                const separator = document.createElement('div');
                separator.className = 'stand-by-separator';
                separator.textContent = 'Stand By (Oportunidade)';
                contentDiv.appendChild(separator);
                standByHabits.forEach(habit => contentDiv.appendChild(this.createHabitElement(habit)));
            }

            // Mensagem de Vazio
            if (totalVisible === 0) {
                const msg = activeTimeFilter === 'all' ? 'Nenhum hábito neste grupo.' : 'Nada planejado para este período.';
                contentDiv.innerHTML += `<div style="text-align:center; opacity:0.5; padding:30px; font-size:0.9rem;">${msg}</div>`;
            }

            contentContainer.appendChild(contentDiv);
        });

        this.container.appendChild(navEl);
        this.container.appendChild(contentContainer);
    },

    createHabitElement: function(habit) {
        const el = document.createElement('div');
        
        let classes = 'habit-card';
        if (habit.type === 'infinite') {
            classes += ' infinite';
            if (habit.currentOfDay > 0) classes += ' active-today';
        } else if (habit.completedToday) {
            classes += ' completed';
        }
        el.className = classes;
        
        // Status Text (Pattern/Dependency)
        let statusMsg = "";
        if (habit.frequencyType === 'pattern' && habit.pattern) {
            const step = window.HabitModel.getPatternStep(habit);
            const type = habit.pattern.split('')[step];
            const humanStep = step + 1;
            const total = habit.pattern.length;
            
            if (type === '0') statusMsg = `<span style="color:#81c784; font-size:0.75em; font-weight:bold;">💤 Descanso (${humanStep}/${total})</span>`;
            else statusMsg = `<span style="color:#ffb74d; font-size:0.75em; font-weight:bold;">⚔️ Ação (${humanStep}/${total})</span>`;
        }
        
        if (habit.isDependent) {
            if (!habit.opportunityToday) statusMsg = `<span style="color:#2196f3; font-size:0.75em; font-weight:bold;">⏳ Aguardando...</span>`;
            else statusMsg = `<span style="color:#ffb74d; font-size:0.75em; font-weight:bold;">🎯 Oportunidade!</span>`;
        }

        // --- Botões de Ação ---
        let actionHTML = '';

        if (habit.conduct) {
            // CONDUTA: 3 Caixinhas
            let boxes = '';
            const allDone = (habit.conductCompleted && habit.conductCompleted[0] && habit.conductCompleted[1] && habit.conductCompleted[2]);
            const bonusClass = allDone ? 'bonus-active' : '';

            for(let i=0; i<3; i++) {
                const isDone = habit.conductCompleted && habit.conductCompleted[i];
                const activeClass = isDone ? 'completed' : '';
                const finalClass = (isDone && allDone) ? `${activeClass} ${bonusClass}` : activeClass;
                boxes += `<button class="btn-conduct-box ${finalClass}" onclick="window.HabitManager.toggleConductBox('${habit.id}', ${i})">✓</button>`;
            }
            actionHTML = `<div class="habit-conduct-track">${boxes}</div>`;

        } else if (habit.isDependent && !habit.opportunityToday) {
            actionHTML = `<button class="btn-opportunity" onclick="window.HabitManager.markOpportunity('${habit.id}')">🎯 Tive a Oportunidade</button>`;
        } else {
            if (habit.type === 'infinite') {
                actionHTML = `
                    <div class="counter-widget infinite">
                        <span class="counter-value">${habit.currentOfDay}</span>
                        <button class="counter-btn infinite-add" onclick="window.HabitManager.updateCounter('${habit.id}', 1)">+</button>
                    </div>`;
            } else if (habit.type === 'counter') {
                actionHTML = `
                    <div class="counter-widget">
                        <button class="counter-btn" onclick="window.HabitManager.updateCounter('${habit.id}', -1)">-</button>
                        <span class="counter-value">${habit.currentOfDay}/${habit.target}</span>
                        <button class="counter-btn" onclick="window.HabitManager.updateCounter('${habit.id}', 1)">+</button>
                    </div>`;
            } else {
                actionHTML = `<button class="habit-check-btn" onclick="window.HabitManager.checkSimple('${habit.id}')">${habit.completedToday ? '✔' : ''}</button>`;
            }
        }

        // --- Controles de Tempo (Ocultar se FATOR EMOCIONAL estiver ativo) ---
        let timeControlsHTML = '';
        if (!habit.emotionalFactor) {
            const formattedTime = window.HabitModel.formatSeconds(habit.accumulatedTime || 0);
            const isTimerRunning = window.HabitManager.timerState && window.HabitManager.timerState.habitId === habit.id;
            const runningClass = isTimerRunning ? 'active' : '';

            timeControlsHTML = `
                <div class="habit-time-controls">
                    <span id="time-badge-${habit.id}" class="time-badge ${runningClass}">${formattedTime}</span>
                    <button class="btn-time-action ${isTimerRunning ? 'running' : ''}" onclick="window.HabitManager.toggleStopwatch('${habit.id}')" title="Cronômetro">⏱️</button>
                    <button class="btn-time-action" onclick="window.HabitManager.openManualTime('${habit.id}')" title="Ajuste Manual">✏️</button>
                </div>
            `;
        }

        // --- Horário Delimitado (Abstinência) ---
        let abstinenceHTML = '';
        if (habit.abstinence && habit.abstinenceStages && habit.abstinenceStages.length > 0) {
            let buttons = '';
            habit.abstinenceStages.forEach((duration, index) => {
                const stageNum = index + 1;
                const isCompleted = habit.abstinenceCompleted && habit.abstinenceCompleted[index];
                const completedClass = isCompleted ? 'completed' : '';
                const title = `Duração: ${duration} min`;
                
                buttons += `
                    <button class="btn-abstinence-stage ${completedClass}" 
                            title="${title}"
                            onclick="window.HabitManager.toggleAbstinenceStage('${habit.id}', ${index})">
                        ${stageNum}
                    </button>
                `;
            });
            abstinenceHTML = `<div class="habit-abstinence-track">${buttons}</div>`;
        }

        // --- Foco (Blocos) ---
        let focusHTML = '';
        if (habit.focus && habit.focusStages && habit.focusStages.length > 0) {
            let buttons = '';
            habit.focusStages.forEach((duration, index) => {
                const isCompleted = habit.focusCompleted && habit.focusCompleted[index];
                const completedClass = isCompleted ? 'completed' : '';
                const title = `Foco: ${duration} min`;
                
                buttons += `
                    <button class="btn-abstinence-stage ${completedClass}" 
                            style="border-color: var(--habit-accent); color: var(--habit-accent);"
                            title="${title}"
                            onclick="window.HabitManager.toggleFocusStage('${habit.id}', ${index})">
                        ${duration}m
                    </button>
                `;
            });
            focusHTML = `<div class="habit-abstinence-track" style="margin-top:5px;">${buttons}</div>`;
        }

        let xpLabel = 'XP Auto'; 
        if (habit.type === 'infinite') xpLabel += '/ação';
        if (habit.conduct) xpLabel = 'XP/Bloco';
        
        const streakLabel = habit.streak > 1 ? `🔥 ${habit.streak}` : '';
        let milestoneIcon = (habit.milestoneType === 'streak') ? '⚡' : (habit.milestoneType === 'quantity' ? '📊' : '');

        el.innerHTML = `
            <div class="habit-main-info">
                ${actionHTML}
                ${timeControlsHTML}
                <div class="habit-details">
                    <h4>${habit.name} <span style="font-size:0.7em; opacity:0.6">${milestoneIcon}</span></h4>
                    <div class="habit-meta">
                        <span class="habit-xp-badge">${xpLabel}</span>
                        ${habit.streak > 1 ? `<span class="habit-streak-badge">${streakLabel}</span>` : ''}
                    </div>
                    ${abstinenceHTML}
                    ${focusHTML}
                    ${statusMsg ? `<div style="margin-top:4px;">${statusMsg}</div>` : ''}
                </div>
            </div>
            <div class="habit-controls habit-actions">
                <button class="icon-btn" onclick="window.HabitView.openEditModal('${habit.id}')">✏️</button>
                <button class="icon-btn delete" onclick="window.HabitManager.deleteHabit('${habit.id}')">🗑️</button>
            </div>
        `;

        return el;
    },

    // =========================================================================
    // WIDGET DO CRONÔMETRO FLUTUANTE
    // =========================================================================

    renderStopwatchWidget: function(habitName, currentTime, isPaused) {
        const old = document.getElementById('active-stopwatch-widget');
        if (old) old.remove();

        const widget = document.createElement('div');
        widget.id = 'active-stopwatch-widget';
        widget.className = 'stopwatch-widget';
        
        const btnPauseLabel = isPaused ? "RETOMAR ▶" : "PAUSAR ⏸";
        const pauseClass = isPaused ? "paused-state" : "";

        widget.innerHTML = `
            <div class="stopwatch-header">
                <span>⏱️ Cronômetro</span>
                <span style="color:var(--habit-accent); font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100px;">${habitName}</span>
            </div>
            <div class="stopwatch-display" id="widget-display">${window.HabitModel.formatSeconds(currentTime)}</div>
            <div class="stopwatch-controls">
                <button class="sw-btn cancel" onclick="window.HabitManager.cancelTimer()">Cancelar</button>
                <button class="sw-btn pause ${pauseClass}" onclick="window.HabitManager.pauseTimer()">${btnPauseLabel}</button>
                <button class="sw-btn stop" onclick="window.HabitManager.stopTimer()">FINALIZAR</button>
            </div>
        `;

        document.body.appendChild(widget);
        this.activeWidget = widget;
    },

    removeStopwatchWidget: function() {
        const w = document.getElementById('active-stopwatch-widget');
        if (w) w.remove();
        this.activeWidget = null;
    },

    // =========================================================================
    // MODAL DE AJUSTE MANUAL
    // =========================================================================

    openManualTimeModal: function(habitId, currentSeconds, onSave) {
        const { overlay, content } = window.SysModal._createContainer();
        
        const h = Math.floor(currentSeconds / 3600);
        const m = Math.floor((currentSeconds % 3600) / 60);
        const s = currentSeconds % 60;

        content.innerHTML = `
            <h3 style="color:var(--habit-text-main); margin-bottom:15px; text-align:center;">Ajuste de Tempo</h3>
            <div class="manual-time-inputs">
                <div class="time-input-group">
                    <input type="number" id="manual-h" min="0" value="${h}">
                    <label>HORAS</label>
                </div>
                <div class="time-input-group">
                    <input type="number" id="manual-m" min="0" max="59" value="${m}">
                    <label>MIN</label>
                </div>
                <div class="time-input-group">
                    <input type="number" id="manual-s" min="0" max="59" value="${s}">
                    <label>SEG</label>
                </div>
            </div>
            <div class="sys-modal-actions">
                <button class="secondary-btn" id="btn-manual-cancel">Cancelar</button>
                <button class="primary-btn" id="btn-manual-save">Salvar</button>
            </div>
        `;

        content.querySelector('#btn-manual-cancel').onclick = () => window.SysModal._close(overlay);
        
        content.querySelector('#btn-manual-save').onclick = () => {
            if (window.SoundManager) window.SoundManager.play('click');
            const hVal = parseInt(content.querySelector('#manual-h').value) || 0;
            const mVal = parseInt(content.querySelector('#manual-m').value) || 0;
            const sVal = parseInt(content.querySelector('#manual-s').value) || 0;
            
            const total = (hVal * 3600) + (mVal * 60) + sVal;
            onSave(total);
            window.SysModal._close(overlay);
        };
    },

    // =========================================================================
    // MODAL DE EDIÇÃO DE HÁBITO
    // =========================================================================

    openEditModal: function(habitId = null) {
        if (window.SoundManager) window.SoundManager.play('click');
        const modal = document.getElementById('modal-habit-edit');
        if (!modal) return;
        const form = document.getElementById('form-habit');
        if (!form) return;

        form.reset();
        const idInput = document.getElementById('habit-id');
        if(idInput) idInput.value = '';
        const counterConfig = document.getElementById('habit-counter-config');
        if(counterConfig) counterConfig.classList.add('hidden');

        // FIX XP Required
        const xpField = document.getElementById('habit-xp');
        if (xpField) {
            xpField.style.display = 'none';
            xpField.removeAttribute('required'); 
            xpField.value = 0; 
            const labels = form.getElementsByTagName('label');
            for(let l of labels) {
                if(l.htmlFor === 'habit-xp') l.style.display = 'none';
            }
        }

        // Limpeza de campos injetados
        const dynamicIds = [
            'btn-reset-streak', 'milestone-config-div', 'freq-type-div', 'dependent-option-div', 
            'importance-selector-div', 'emotional-config-div', 'cognitive-fatigue-div', 
            'start-end-config-div', 'abstinence-config-div', 'conduct-config-div', 'focus-config-div',
            'adaptation-config-div'
        ];
        dynamicIds.forEach(id => {
            const el = document.getElementById(id); if(el) el.remove();
        });

        // Configurações padrão
        let currentMilestoneType = 'none';
        let currentFreqType = 'weekly';
        let currentPattern = '1110';
        let currentOffset = 0;
        let isDependent = false;
        let currentImportance = 'development';
        let currentEmotionalFactor = false;
        let currentEmotionalValue = 0.1;
        let currentCognitiveFatigue = false;
        let currentStartEnd = false;
        let currentStartEndIndices = [];
        let currentAbstinence = false;
        let currentAbstinenceStages = []; 
        let currentConduct = false;
        let currentFocus = false;
        let currentFocusStages = [];
        let currentAdaptationActive = false;

        // Preenche dados se for edição
        if (habitId) {
            const habit = window.GlobalApp.data.habits.find(h => h.id === habitId);
            if (habit) {
                if(idInput) idInput.value = habit.id;
                document.getElementById('habit-name').value = habit.name;
                document.getElementById('habit-type').value = habit.type || 'simple';
                currentMilestoneType = habit.milestoneType || 'none';
                currentFreqType = habit.frequencyType || 'weekly';
                currentPattern = habit.pattern || '1110';
                currentOffset = habit.patternOffset || 0;
                isDependent = !!habit.isDependent;
                currentImportance = habit.importance || 'development';
                
                // MIGRACAO VISUAL: Se for maintenance, vira development
                if (currentImportance === 'maintenance') currentImportance = 'development';

                currentEmotionalFactor = !!habit.emotionalFactor;
                currentEmotionalValue = habit.emotionalValue || 0.1;
                currentCognitiveFatigue = !!habit.cognitiveFatigue;
                currentStartEnd = !!habit.startEndEffect;
                currentStartEndIndices = habit.startEndIndices || [];
                currentAbstinence = !!habit.abstinence;
                currentAbstinenceStages = habit.abstinenceStages || [];
                currentConduct = !!habit.conduct;
                currentFocus = !!habit.focus;
                currentFocusStages = habit.focusStages || [];
                currentAdaptationActive = !!habit.adaptationActive;
                
                if(habit.frequency) {
                    const checkboxes = document.querySelectorAll('.days-selector input');
                    checkboxes.forEach(cb => { cb.checked = habit.frequency.includes(cb.value); });
                }
                if (habit.type === 'counter' && counterConfig) {
                    counterConfig.classList.remove('hidden');
                    document.getElementById('habit-target-count').value = habit.target;
                }
                if (habit.streak > 0) {
                    const btnReset = document.createElement('button');
                    btnReset.id = 'btn-reset-streak';
                    btnReset.className = 'btn-delete-group';
                    btnReset.style.width = '100%';
                    btnReset.style.marginTop = '10px';
                    btnReset.innerHTML = `🔥 Zerar Sequência (${habit.streak})`;
                    btnReset.onclick = (e) => { e.preventDefault(); window.HabitManager.resetStreak(habit.id); };
                    const actionsDiv = document.querySelector('#form-habit .modal-actions');
                    if(actionsDiv) form.insertBefore(btnReset, actionsDiv);
                }
            }
        } else {
            const checkboxes = document.querySelectorAll('.days-selector input');
            checkboxes.forEach(cb => cb.checked = true);
        }
        
        const actionsDiv = document.querySelector('#form-habit .modal-actions');
        const originalDaysSelector = document.querySelector('.days-selector');

        // --- INJEÇÃO DOS CAMPOS DE EDIÇÃO (DINÂMICOS) ---

        if (originalDaysSelector) {
            // Dependente
            const depDiv = document.createElement('div');
            depDiv.id = 'dependent-option-div';
            depDiv.className = 'checkbox-label';
            depDiv.style.marginBottom = '15px';
            depDiv.innerHTML = `<label class="checkbox-label"><input type="checkbox" id="habit-is-dependent" ${isDependent ? 'checked' : ''}> Hábito Dependente / Ocasional</label>`;
            form.insertBefore(depDiv, originalDaysSelector);

            // Frequência
            const freqDiv = document.createElement('div');
            freqDiv.id = 'freq-type-div';
            freqDiv.style.marginBottom = '15px';
            freqDiv.innerHTML = `
                <div style="display:flex; gap:15px; margin-bottom:10px;">
                    <label class="checkbox-label"><input type="radio" name="freqType" value="weekly" ${currentFreqType === 'weekly' ? 'checked' : ''}> Semanal</label>
                    <label class="checkbox-label"><input type="radio" name="freqType" value="pattern" ${currentFreqType === 'pattern' ? 'checked' : ''}> Padrão</label>
                </div>
                <div id="pattern-input-area" class="${currentFreqType === 'pattern' ? '' : 'hidden'}">
                    <input type="text" id="habit-pattern" value="${currentPattern}" placeholder="Ex: 1110" style="width:100%; padding:8px; font-family:monospace; background:var(--habit-bg-input); border:1px solid var(--habit-border); color:var(--habit-text-main);">
                    <div style="margin-top:5px; font-size:0.8rem; color:var(--habit-text-sub);">Offset: <input type="number" id="habit-pattern-offset" value="${currentOffset + 1}" min="1" style="width:50px; background:var(--habit-bg-input); border:1px solid var(--habit-border); color:var(--habit-text-main);"></div>
                </div>`;
            form.insertBefore(freqDiv, originalDaysSelector);
            
            const radios = freqDiv.querySelectorAll('input[name="freqType"]');
            radios.forEach(r => r.addEventListener('change', (e) => {
                const area = freqDiv.querySelector('#pattern-input-area');
                if(e.target.value === 'weekly') { originalDaysSelector.classList.remove('hidden'); area.classList.add('hidden'); }
                else { originalDaysSelector.classList.add('hidden'); area.classList.remove('hidden'); }
            }));
            if(currentFreqType === 'weekly') originalDaysSelector.classList.remove('hidden');
            else originalDaysSelector.classList.add('hidden');
        }

        // Milestone
        const milestoneDiv = document.createElement('div');
        milestoneDiv.id = 'milestone-config-div';
        milestoneDiv.style.marginBottom = '15px';
        milestoneDiv.innerHTML = `
            <label style="display:block; margin-bottom:5px; color:var(--habit-text-sub); font-size:0.9rem;">Tipo de Meta (Milestone)</label>
            <select id="habit-milestone-type" style="width:100%; padding:8px; border-radius:4px; border:1px solid var(--habit-border); background:var(--habit-bg-input); color:var(--habit-text-main);">
                <option value="none">Nenhuma</option>
                <option value="streak">Sequência (7, 21, 30, 90 dias)</option>
                <option value="quantity">Quantidade Total (10, 50, 100...)</option>
            </select>
        `;
        if(actionsDiv) form.insertBefore(milestoneDiv, actionsDiv);
        document.getElementById('habit-milestone-type').value = currentMilestoneType;

        // --- ADAPTAÇÃO NEURAL (NOVO: CAMPO OPCIONAL) ---
        const adaptDiv = document.createElement('div');
        adaptDiv.id = 'adaptation-config-div';
        adaptDiv.style.marginBottom = '15px';
        adaptDiv.innerHTML = `
            <label class="checkbox-label" title="Aplica bônus de XP para novos hábitos em fase de adaptação neural.">
                <input type="checkbox" id="habit-adaptation-active" ${currentAdaptationActive ? 'checked' : ''}> 🧬 Hábito em Adaptação (Bônus XP)
            </label>
        `;
        if(actionsDiv) form.insertBefore(adaptDiv, actionsDiv);

        // Importância (ATUALIZADO: SEM MANUTENÇÃO)
        const impDiv = document.createElement('div');
        impDiv.id = 'importance-selector-div';
        impDiv.style.marginBottom = '15px';
        impDiv.innerHTML = `
            <label style="display:block; margin-bottom:5px; color:var(--habit-text-sub); font-size:0.9rem;">Importância</label>
            <div class="importance-selector">
                <label><input type="radio" name="importance" value="critical" ${currentImportance === 'critical' ? 'checked' : ''}> 🔴 Crítico (1.0)</label>
                <label><input type="radio" name="importance" value="development" ${currentImportance === 'development' ? 'checked' : ''}> 🟡 Normal (0.5)</label>
            </div>
        `;
        if(actionsDiv) form.insertBefore(impDiv, actionsDiv);

        // Fator Emocional
        const emoDiv = document.createElement('div');
        emoDiv.id = 'emotional-config-div';
        emoDiv.className = 'emotional-factor-wrapper';
        const sliderActive = currentEmotionalFactor ? 'active' : '';
        
        emoDiv.innerHTML = `
            <label class="checkbox-label">
                <input type="checkbox" id="habit-emotional-factor" ${currentEmotionalFactor ? 'checked' : ''}> Fator Emocional
            </label>
            <div class="emotional-slider-container ${sliderActive}" id="emotional-slider-container">
                <input type="range" id="habit-emotional-value" min="0.1" max="0.7" step="0.1" value="${currentEmotionalValue}">
                <span class="emotional-value-display" id="emotional-value-display">${currentEmotionalValue}</span>
            </div>
        `;
        if(actionsDiv) form.insertBefore(emoDiv, actionsDiv);

        const emoCheck = emoDiv.querySelector('#habit-emotional-factor');
        const emoContainer = emoDiv.querySelector('#emotional-slider-container');
        const emoSlider = emoDiv.querySelector('#habit-emotional-value');
        const emoDisplay = emoDiv.querySelector('#emotional-value-display');

        emoCheck.addEventListener('change', (e) => {
            if (e.target.checked) emoContainer.classList.add('active');
            else emoContainer.classList.remove('active');
        });
        emoSlider.addEventListener('input', (e) => { emoDisplay.textContent = e.target.value; });

        // Fadiga
        const cogDiv = document.createElement('div');
        cogDiv.id = 'cognitive-fatigue-div';
        cogDiv.className = 'cognitive-fatigue-wrapper';
        cogDiv.innerHTML = `
            <label class="checkbox-label">
                <input type="checkbox" id="habit-cognitive-fatigue" ${currentCognitiveFatigue ? 'checked' : ''}>
                🧠 Fadiga Cognitiva
            </label>
        `;
        if(actionsDiv) form.insertBefore(cogDiv, actionsDiv);

        // Conduta
        const conductDiv = document.createElement('div');
        conductDiv.id = 'conduct-config-div';
        conductDiv.className = 'conduct-wrapper';
        conductDiv.innerHTML = `
            <label class="checkbox-label">
                <input type="checkbox" id="habit-conduct" ${currentConduct ? 'checked' : ''}>
                👔 Conduta (Blocos)
            </label>
        `;
        if(actionsDiv) form.insertBefore(conductDiv, actionsDiv);

        // Início/Fim do Dia
        const startEndDiv = document.createElement('div');
        startEndDiv.id = 'start-end-config-div';
        startEndDiv.className = 'start-end-wrapper';
        startEndDiv.innerHTML = `
            <label class="checkbox-label">
                <input type="checkbox" id="habit-start-end" ${currentStartEnd ? 'checked' : ''}>
                ☀️/🌙 Início/Fim do Dia
            </label>
            <div id="start-end-indices-container" class="start-end-indices ${currentStartEnd ? 'active' : ''}"></div>
        `;
        if(actionsDiv) form.insertBefore(startEndDiv, actionsDiv);

        const startEndCheck = startEndDiv.querySelector('#habit-start-end');
        const indicesContainer = startEndDiv.querySelector('#start-end-indices-container');
        const habitTypeSelect = document.getElementById('habit-type');
        const targetInput = document.getElementById('habit-target-count');

        const updateIndices = () => {
            indicesContainer.innerHTML = '';
            const type = habitTypeSelect.value;
            const target = parseInt(targetInput.value) || 1;

            if (type === 'counter') {
                for (let i = 1; i <= target; i++) {
                    const label = document.createElement('label');
                    label.className = 'index-checkbox-label';
                    label.textContent = i;
                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.value = i;
                    if (currentStartEndIndices.includes(i)) cb.checked = true;
                    label.appendChild(cb);
                    indicesContainer.appendChild(label);
                }
            } else {
                indicesContainer.textContent = '';
            }
        };

        startEndCheck.addEventListener('change', (e) => {
            if (e.target.checked) indicesContainer.classList.add('active');
            else indicesContainer.classList.remove('active');
        });
        habitTypeSelect.addEventListener('change', updateIndices);
        targetInput.addEventListener('input', updateIndices);
        updateIndices();

        // Abstinência (Horário Delimitado)
        const absDiv = document.createElement('div');
        absDiv.id = 'abstinence-config-div';
        absDiv.className = 'abstinence-wrapper';
        const absActive = currentAbstinence ? 'active' : '';
        const initialCount = currentAbstinenceStages.length > 0 ? currentAbstinenceStages.length : 1;

        absDiv.innerHTML = `
            <div class="abstinence-header">
                <label class="checkbox-label">
                    <input type="checkbox" id="habit-abstinence" ${currentAbstinence ? 'checked' : ''}>
                    ⏳ Horário delimitado
                </label>
                <div class="abstinence-count-input ${absActive}" id="abstinence-count-wrapper">
                    <span>Qtd.</span>
                    <input type="number" id="habit-abstinence-count" min="1" max="10" value="${initialCount}">
                </div>
            </div>
            <div id="abstinence-durations-container" class="abstinence-durations-list"></div>
        `;
        if(actionsDiv) form.insertBefore(absDiv, actionsDiv);

        const absCheck = absDiv.querySelector('#habit-abstinence');
        const absCountWrapper = absDiv.querySelector('#abstinence-count-wrapper');
        const absCountInput = absDiv.querySelector('#habit-abstinence-count');
        const absDurationsContainer = absDiv.querySelector('#abstinence-durations-container');

        const updateDurationsInputs = () => {
            if (!absCheck.checked) {
                absDurationsContainer.innerHTML = '';
                return;
            }
            const count = parseInt(absCountInput.value) || 1;
            absDurationsContainer.innerHTML = '';
            
            for (let i = 0; i < count; i++) {
                const savedVal = currentAbstinenceStages[i] || '';
                const row = document.createElement('div');
                row.className = 'abstinence-stage-input';
                row.innerHTML = `
                    <span>${i + 1}.</span>
                    <input type="number" class="abs-duration-val" placeholder="Minutos" value="${savedVal}">
                    <span>min</span>
                `;
                absDurationsContainer.appendChild(row);
            }
        };

        absCheck.addEventListener('change', (e) => {
            if (e.target.checked) {
                absCountWrapper.classList.add('active');
                updateDurationsInputs();
            } else {
                absCountWrapper.classList.remove('active');
                absDurationsContainer.innerHTML = '';
            }
        });

        absCountInput.addEventListener('input', updateDurationsInputs);
        if (currentAbstinence) updateDurationsInputs();

        // Foco (NOVO) - Configuração de Sessões
        const focusDiv = document.createElement('div');
        focusDiv.id = 'focus-config-div';
        focusDiv.className = 'focus-wrapper';
        const focusActive = currentFocus ? 'active' : '';
        const initialFocusCount = currentFocusStages.length > 0 ? currentFocusStages.length : 1;

        focusDiv.innerHTML = `
            <div class="abstinence-header">
                <label class="checkbox-label">
                    <input type="checkbox" id="habit-focus" ${currentFocus ? 'checked' : ''}>
                    🧠 Foco (Sessões)
                </label>
                <div class="abstinence-count-input ${focusActive}" id="focus-count-wrapper">
                    <span>Qtd.</span>
                    <input type="number" id="habit-focus-count" min="1" max="10" value="${initialFocusCount}">
                </div>
            </div>
            <div id="focus-durations-container" class="abstinence-durations-list"></div>
        `;
        if(actionsDiv) form.insertBefore(focusDiv, actionsDiv);

        const focusCheck = focusDiv.querySelector('#habit-focus');
        const focusCountWrapper = focusDiv.querySelector('#focus-count-wrapper');
        const focusCountInput = focusDiv.querySelector('#habit-focus-count');
        const focusDurationsContainer = focusDiv.querySelector('#focus-durations-container');

        const updateFocusInputs = () => {
            if (!focusCheck.checked) {
                focusDurationsContainer.innerHTML = '';
                return;
            }
            const count = parseInt(focusCountInput.value) || 1;
            focusDurationsContainer.innerHTML = '';
            
            for (let i = 0; i < count; i++) {
                const savedVal = currentFocusStages[i] || '';
                const row = document.createElement('div');
                row.className = 'abstinence-stage-input';
                row.innerHTML = `
                    <span>${i + 1}.</span>
                    <input type="number" class="focus-duration-val" placeholder="Minutos" value="${savedVal}">
                    <span>min</span>
                `;
                focusDurationsContainer.appendChild(row);
            }
        };

        focusCheck.addEventListener('change', (e) => {
            if (e.target.checked) {
                focusCountWrapper.classList.add('active');
                updateFocusInputs();
            } else {
                focusCountWrapper.classList.remove('active');
                focusDurationsContainer.innerHTML = '';
            }
        });

        focusCountInput.addEventListener('input', updateFocusInputs);
        if (currentFocus) updateFocusInputs();

        // Grupo (Select)
        let groupSelect = document.getElementById('habit-group-select');
        if (!groupSelect && actionsDiv) {
            const label = document.createElement('label'); label.textContent = "Grupo";
            label.style.color = "var(--habit-text-sub)";
            label.style.fontSize = "0.9rem";
            groupSelect = document.createElement('select'); groupSelect.id = 'habit-group-select';
            groupSelect.style.width = "100%";
            groupSelect.style.padding = "8px";
            groupSelect.style.marginBottom = "15px";
            groupSelect.style.background = "var(--habit-bg-input)";
            groupSelect.style.border = "1px solid var(--habit-border)";
            groupSelect.style.color = "var(--habit-text-main)";
            groupSelect.style.borderRadius = "4px";
            
            form.insertBefore(label, actionsDiv); form.insertBefore(groupSelect, actionsDiv);
        }
        if (groupSelect) {
            groupSelect.innerHTML = '<option value="">Sem Grupo (Geral)</option>';
            window.GlobalApp.data.habitGroups.forEach(g => {
                const opt = document.createElement('option'); opt.value = g.id; opt.textContent = g.name;
                if (habitId) {
                    const h = window.GlobalApp.data.habits.find(i => i.id === habitId);
                    if (h && h.groupId === g.id) opt.selected = true;
                }
                groupSelect.appendChild(opt);
            });
        }
        
        modal.classList.remove('hidden');
    }
};
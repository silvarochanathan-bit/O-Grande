/**
 * HABITS-VIEW.JS
 * Camada de Apresentação.
 * VERSÃO: V6.0 - LEAN EDITION (SEM XP)
 * Alterações: Removido o Widget Auditor ("Nota Fiscal de XP") e todos os campos
 * do modal de edição que só existiam para alimentar a fórmula de XP (Importância,
 * Fator Emocional, Fadiga Cognitiva, Foco, Adaptação, Início/Fim do Dia, Milestone).
 * Mantidos: tipos de hábito, frequência/padrão, hábito dependente, conduta (blocos),
 * grupo, cronômetro e reset de sequência.
 */

window.HabitView = {

    container: null,
    activeWidget: null, 

    init: function(containerId) {
        this.container = document.getElementById(containerId);
    },

    // =========================================================================
    // RENDERIZAÇÃO PRINCIPAL
    // =========================================================================

    render: function(habits, groups, activeTabId, activeTimeFilter) {
        if (!this.container) return;
        this.container.innerHTML = '';
        
        // Barra de Filtros
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

        // Abas
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

            const normalHabits = groupHabits.filter(h => !h.isDependent && window.HabitModel.checkHabitVisibility(h, activeTimeFilter));
            const standByHabits = groupHabits.filter(h => h.isDependent); 
            const totalVisible = normalHabits.length + standByHabits.length;

            const btn = document.createElement('button');
            btn.className = `habit-tab-btn ${isActive ? 'active' : ''}`;
            const badgeClass = totalVisible === 0 ? 'tab-badge zero' : 'tab-badge';
            btn.innerHTML = `${tab.name} <span class="${badgeClass}">${totalVisible}</span>`;
            btn.onclick = () => {
                if (window.SoundManager) window.SoundManager.play('click');
                window.HabitManager.setActiveTab(tab.id); 
            };
            navEl.appendChild(btn);

            const contentDiv = document.createElement('div');
            contentDiv.className = `habit-tab-content ${isActive ? 'active' : ''}`;
            contentDiv.id = `tab-content-${tab.id}`;

            if (tab.id !== 'general') {
                const optionsHeader = document.createElement('div');
                optionsHeader.className = 'tab-options-header';
                optionsHeader.innerHTML = `<button class="btn-delete-group" onclick="window.HabitManager.deleteGroup('${tab.id}')">🗑️ Apagar Grupo</button>`;
                contentDiv.appendChild(optionsHeader);
            }

            normalHabits.forEach(habit => contentDiv.appendChild(this.createHabitElement(habit)));

            if (standByHabits.length > 0) {
                const separator = document.createElement('div');
                separator.className = 'stand-by-separator';
                separator.textContent = 'Stand By (Oportunidade)';
                contentDiv.appendChild(separator);
                standByHabits.forEach(habit => contentDiv.appendChild(this.createHabitElement(habit)));
            }

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

        // --- AÇÕES ---
        let actionHTML = '';

        if (habit.conduct) {
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

        // --- TIMER ---
        const formattedTime = window.HabitModel.formatSeconds(habit.accumulatedTime || 0);
        const isTimerRunning = window.HabitManager.timerState && window.HabitManager.timerState.habitId === habit.id;
        const runningClass = isTimerRunning ? 'active' : '';

        const timeControlsHTML = `
            <div class="habit-time-controls">
                <span id="time-badge-${habit.id}" class="time-badge ${runningClass}">${formattedTime}</span>
                <button class="btn-time-action ${isTimerRunning ? 'running' : ''}" onclick="window.HabitManager.toggleStopwatch('${habit.id}')" title="Cronômetro">⏱️</button>
                <button class="btn-time-action" onclick="window.HabitManager.openManualTime('${habit.id}')" title="Ajuste Manual">✏️</button>
            </div>
        `;

        const streakLabel = habit.streak > 1 ? `🔥 ${habit.streak}` : '';

        el.innerHTML = `
            <div class="habit-main-info">
                ${actionHTML}
                ${timeControlsHTML}
                <div class="habit-details">
                    <h4>${habit.name}</h4>
                    <div class="habit-meta">
                        ${habit.streak > 1 ? `<span class="habit-streak-badge">${streakLabel}</span>` : ''}
                    </div>
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
    // WIDGET & MODAIS
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

    openManualTimeModal: function(habitId, currentSeconds, onSave) {
        const { overlay, content } = window.SysModal._createContainer();
        const h = Math.floor(currentSeconds / 3600);
        const m = Math.floor((currentSeconds % 3600) / 60);
        const s = currentSeconds % 60;

        content.innerHTML = `
            <h3 style="color:var(--habit-text-main); margin-bottom:15px; text-align:center;">Ajuste de Tempo</h3>
            <div class="manual-time-inputs">
                <div class="time-input-group"><input type="number" id="manual-h" min="0" value="${h}"><label>HORAS</label></div>
                <div class="time-input-group"><input type="number" id="manual-m" min="0" max="59" value="${m}"><label>MIN</label></div>
                <div class="time-input-group"><input type="number" id="manual-s" min="0" max="59" value="${s}"><label>SEG</label></div>
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
            onSave((hVal * 3600) + (mVal * 60) + sVal);
            window.SysModal._close(overlay);
        };
    },

    // =========================================================================
    // MODAL DE EDIÇÃO
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

        // --- 1. LIMPEZA DE CAMPOS ESTÁTICOS E DINÂMICOS ANTIGOS ---
        const staticSelectors = [
            '.importance-selector',
            '.emotional-factor-wrapper',
            '.cognitive-fatigue-wrapper',
            '.conduct-wrapper',
            '.abstinence-wrapper',
            '.focus-wrapper',
            '.start-end-wrapper'
        ];
        
        staticSelectors.forEach(sel => {
            const els = form.querySelectorAll(sel);
            els.forEach(el => el.remove());
        });

        // Remove labels órfãos que possam ter sobrado do HTML estático
        const labels = form.querySelectorAll('label');
        labels.forEach(lbl => {
            const txt = lbl.textContent.toLowerCase();
            if (txt.includes('importância') || txt.includes('fator emocional') || 
                txt.includes('abstinência') || txt.includes('conduta') || 
                txt.includes('foco') || txt.includes('fadiga') || txt.includes('horário')) {
                if (!lbl.closest('#conduct-config-div')) {
                    lbl.remove();
                }
            }
        });

        // Limpeza de IDs dinâmicos antigos para reinjeção limpa
        const dynamicIds = [
            'btn-reset-streak', 'freq-type-div', 'dependent-option-div', 
            'conduct-config-div', 'habit-group-select'
        ];
        dynamicIds.forEach(id => {
            const el = document.getElementById(id); if(el) el.remove();
        });

        // --- 2. CONFIGURAÇÃO DE TIPOS (LIMITADO A 3) ---
        let typeSelect = document.getElementById('habit-type');
        if (typeSelect) {
            typeSelect.innerHTML = ''; 
            const options = [
                {val: 'simple', text: 'Check Simples'},
                {val: 'counter', text: 'Contador Delimitado'},
                {val: 'infinite', text: 'Contador Infinito'}
            ];
            options.forEach(opt => {
                const o = document.createElement('option');
                o.value = opt.val; o.textContent = opt.text;
                typeSelect.appendChild(o);
            });
            typeSelect.onchange = (e) => {
                const configDiv = document.getElementById('habit-counter-config');
                if(configDiv) {
                    if (e.target.value === 'counter') configDiv.classList.remove('hidden');
                    else configDiv.classList.add('hidden');
                }
            };
        }

        // Variáveis de Estado
        let currentFreqType = 'weekly';
        let currentPattern = '1110';
        let currentOffset = 0;
        let isDependent = false;
        let currentConduct = false;

        if (habitId) {
            const habit = window.GlobalApp.data.habits.find(h => h.id === habitId);
            if (habit) {
                if(idInput) idInput.value = habit.id;
                document.getElementById('habit-name').value = habit.name;
                if(typeSelect) typeSelect.value = habit.type || 'simple';
                if(typeSelect) typeSelect.dispatchEvent(new Event('change'));

                currentFreqType = habit.frequencyType || 'weekly';
                currentPattern = habit.pattern || '1110';
                currentOffset = habit.patternOffset || 0;
                isDependent = !!habit.isDependent;
                currentConduct = !!habit.conduct;
                
                if(habit.frequency) {
                    const checkboxes = document.querySelectorAll('.days-selector input');
                    checkboxes.forEach(cb => { cb.checked = habit.frequency.includes(cb.value); });
                }
                if (habit.type === 'counter') {
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
            if(typeSelect) typeSelect.dispatchEvent(new Event('change'));
        }
        
        const actionsDiv = document.querySelector('#form-habit .modal-actions');
        const originalDaysSelector = document.querySelector('.days-selector');

        // --- INJEÇÃO DE CAMPOS ---

        if (originalDaysSelector) {
            const depDiv = document.createElement('div');
            depDiv.id = 'dependent-option-div';
            depDiv.className = 'checkbox-label';
            depDiv.style.marginBottom = '15px';
            depDiv.innerHTML = `<label class="checkbox-label"><input type="checkbox" id="habit-is-dependent" ${isDependent ? 'checked' : ''}> Hábito Dependente / Ocasional</label>`;
            form.insertBefore(depDiv, originalDaysSelector);

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

        const conductDiv = document.createElement('div');
        conductDiv.id = 'conduct-config-div';
        conductDiv.className = 'conduct-wrapper';
        conductDiv.innerHTML = `<label class="checkbox-label"><input type="checkbox" id="habit-conduct" ${currentConduct ? 'checked' : ''}> 👔 Conduta (Blocos: Manhã/Tarde/Noite)</label>`;
        if(actionsDiv) form.insertBefore(conductDiv, actionsDiv);

        let groupSelect = document.getElementById('habit-group-select');
        if (!groupSelect && actionsDiv) {
            const label = document.createElement('label'); label.textContent = "Grupo";
            label.style.color = "var(--habit-text-sub)"; label.style.fontSize = "0.9rem";
            groupSelect = document.createElement('select'); groupSelect.id = 'habit-group-select';
            groupSelect.style.width = "100%"; groupSelect.style.padding = "8px";
            groupSelect.style.marginBottom = "15px"; groupSelect.style.background = "var(--habit-bg-input)";
            groupSelect.style.border = "1px solid var(--habit-border)"; groupSelect.style.color = "var(--habit-text-main)";
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

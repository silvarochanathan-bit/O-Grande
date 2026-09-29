/**
 * HABITS-CONTROLLER.JS
 * Controlador de Interações da Tela de Hábitos.
 * VERSÃO: V7.1 - CALENDÁRIO DE 3 ESTADOS (VERDE/VERMELHO)
 * Alterações: A conclusão de hábitos (check simples, contador, conduta,
 * contador infinito) grava no completionLog do hábito via
 * HabitModel.toggleCompletionOnDate, em vez de mexer em streak/lastDone
 * diretamente — isso mantém a sequência atual e o recorde sempre derivados do
 * histórico real. Na aba "Calendários", toggleCalendarDay() agora cicla os 3
 * estados de um dia (vazio -> verde/feito -> vermelho/não feito -> vazio) via
 * HabitModel.cycleCalendarDay, em vez de só alternar feito/não-feito.
 */

window.HabitManager = {

    activeTabId: 'general',
    activeTimeFilter: 'today',
    isSystemReady: false,

    timerState: {
        habitId: null, startTime: null, accumulatedBefore: 0,
        intervalId: null, isPaused: false
    },

    // Guarda, por hábito, qual mês/ano está sendo exibido no calendário
    // (mantém o cursor de navegação entre re-renders).
    calendarMonthState: {},

    init: function() {
        console.log("[HabitManager] Inicializando...");

        if (window.HabitView && window.HabitView.init) {
            window.HabitView.init('habits-container');
        }

        if (window.GlobalApp && window.GlobalApp.data) {
            this.onSystemReady();
        } else {
            document.addEventListener('SiteC_DataReady', () => {
                this.onSystemReady();
            });
        }

        document.addEventListener('SiteC_NavigationChanged', (e) => {
            this.handleNavigationChange(e.detail.app);
        });

        this.setupUIBinds();
    },

    onSystemReady: function() {
        if (this.isSystemReady) return;
        this.isSystemReady = true;

        this.ensureIntegrity();
        this.enforceStrictStreak();
        this.render();
        this.renderCalendars();
        this.restoreActiveTimer();
    },

    setupUIBinds: function() {
        const safeBind = (id, action) => {
            const el = document.getElementById(id);
            if(el) el.addEventListener('click', action);
        };

        safeBind('btn-create-habit', () => this.openCreateModal());
        safeBind('btn-create-group', () => this.createGroup());
        safeBind('btn-cancel-habit', () => {
            if (window.SoundManager) window.SoundManager.play('click');
            const modal = document.getElementById('modal-habit-edit');
            if(modal) modal.classList.add('hidden');
        });

        const form = document.getElementById('form-habit');
        if (form) form.addEventListener('submit', (e) => this.handleSaveHabit(e));

        // Aba "Calendários": re-renderiza ao entrar nela (a lista principal já
        // renderiza sozinha via render(), mas o calendário só precisa existir
        // quando visível)
        const calendarsNavBtn = document.querySelector('.nav-btn[data-target="section-calendars"]');
        if (calendarsNavBtn) {
            calendarsNavBtn.addEventListener('click', () => this.renderCalendars());
        }

        // Seletor de estilo visual do calendário (Quadrados / Rostos / Polegares)
        document.querySelectorAll('.calendar-style-picker button').forEach(btn => {
            btn.addEventListener('click', () => {
                if (window.SoundManager) window.SoundManager.play('click');
                if (!window.GlobalApp.data.settings) window.GlobalApp.data.settings = {};
                window.GlobalApp.data.settings.calendarStyle = btn.dataset.style;
                window.GlobalApp.saveData();
                this.renderCalendars();
            });
        });
    },

    ensureIntegrity: function() {
        if (!window.GlobalApp.data.habitGroups) window.GlobalApp.data.habitGroups = [];
        if (!window.GlobalApp.data.habits) window.GlobalApp.data.habits = [];

        // Migração: garante completionLog/bestStreak em hábitos salvos antes
        // desta versão, preservando a sequência que já estava visível.
        window.GlobalApp.data.habits.forEach(h => {
            window.HabitModel.migrateLegacyStreak(h);
        });
    },

    render: function() {
        if (!this.isSystemReady) return;
        if (window.HabitView) {
            window.HabitView.render(
                window.GlobalApp.data.habits || [],
                window.GlobalApp.data.habitGroups || [],
                this.activeTabId,
                this.activeTimeFilter
            );
        }
    },

    switchTab: function(tabId) { this.activeTabId = tabId; this.render(); },
    setFilter: function(filter) { this.activeTimeFilter = filter; this.render(); },
    setActiveTab: function(tabId) { this.switchTab(tabId); },
    setTimeFilter: function(filter) { this.setFilter(filter); },

    // --- CRUD ---

    openCreateModal: function() {
        if (window.SoundManager) window.SoundManager.play('click');
        window.HabitView.openEditModal();
    },

    handleSaveHabit: function(e) {
        e.preventDefault();

        const id = document.getElementById('habit-id').value;
        const name = document.getElementById('habit-name').value;
        const type = document.getElementById('habit-type').value;
        const target = parseInt(document.getElementById('habit-target-count').value) || 1;
        const groupId = document.getElementById('habit-group-select').value || null;

        const freqTypeRadio = document.querySelector('input[name="freqType"]:checked');
        const freqType = freqTypeRadio ? freqTypeRadio.value : 'weekly';
        const patternVal = document.getElementById('habit-pattern').value.trim();
        const offsetInput = parseInt(document.getElementById('habit-pattern-offset').value) || 1;
        const finalOffset = Math.max(0, offsetInput - 1);
        const isDependent = document.getElementById('habit-is-dependent') ? document.getElementById('habit-is-dependent').checked : false;

        const conductCheck = document.getElementById('habit-conduct');
        const conduct = conductCheck ? conductCheck.checked : false;

        let freq = [];
        document.querySelectorAll('.days-selector input:checked').forEach(cb => freq.push(cb.value));

        if (!name || name.trim() === "") { alert("Nome obrigatório."); return; }
        if (freqType === 'weekly' && freq.length === 0 && !isDependent) { alert("Selecione os dias."); return; }

        this.saveHabit(
            id, name, type, target, groupId, freqType, freq, patternVal, finalOffset, isDependent, conduct
        );
    },

    saveHabit: function(id, name, type, target, groupId, frequencyType, frequencyDays, patternVal, patternOffset, isDependent, conduct) {

        const habitData = {
            name, type, target, groupId,
            frequencyType, frequency: frequencyDays,
            pattern: patternVal, patternOffset, isDependent: !!isDependent,
            conduct
        };

        if (id) {
            const habit = window.GlobalApp.data.habits.find(h => h.id === id);
            if (habit) {
                Object.assign(habit, habitData);
                // Mudou a frequência/padrão: a sequência precisa refletir a nova agenda
                window.HabitModel.recalculateStreaks(habit);
            }
        } else {
            const newHabit = {
                id: window.GlobalApp.generateUUID(),
                currentOfDay: 0, completedToday: false, streak: 0, bestStreak: 0, lastDone: null,
                totalCount: 0, accumulatedTime: 0,
                completionLog: {},
                opportunityToday: false, dailySessionCount: 0,
                createdAt: new Date().toISOString(),
                ...habitData
            };
            window.GlobalApp.data.habits.push(newHabit);
        }

        window.GlobalApp.saveData();
        const modal = document.getElementById('modal-habit-edit');
        if (modal) modal.classList.add('hidden');
        if (groupId) this.activeTabId = groupId;
        else if (!this.activeTabId) this.activeTabId = 'general';
        this.render();
        this.renderCalendars();
    },

    // --- ACTIONS ---

    toggleCheck: async function(id) {
        const habit = window.GlobalApp.data.habits.find(h => h.id === id);
        if (!habit) return;

        if (habit.completedToday) {
            if (window.SoundManager) window.SoundManager.play('click');
            if (await confirm("Desmarcar hábito?")) {
                this._undoCompletion(habit);
            }
            return;
        }

        if (habit.frequencyType === 'pattern' && habit.pattern) {
            const step = window.HabitModel.getPatternStep(habit);
            if (habit.pattern[step] === '0') {
                if (window.SoundManager) window.SoundManager.play('click');
                alert(`🚫 Hoje é dia de DESCANSO neste padrão!`);
                return;
            }
        }

        if (habit.accumulatedTime && habit.accumulatedTime > 0) {
            habit.accumulatedTime = 0;
        }

        habit.dailySessionCount = (habit.dailySessionCount || 0) + 1;

        this._completeHabit(habit);
    },

    checkSimple: function(id) { this.toggleCheck(id); },

    updateCounter: function(id, delta) {
        const habit = window.GlobalApp.data.habits.find(h => h.id === id);
        if (!habit) return;

        if (window.SoundManager) window.SoundManager.play('click');

        if (delta > 0 && habit.frequencyType === 'pattern' && habit.pattern) {
            const step = window.HabitModel.getPatternStep(habit);
            if (habit.pattern[step] === '0') {
                alert(`🚫 Hoje é dia de DESCANSO!`);
                return;
            }
        }

        if (habit.type === 'counter' && habit.completedToday && delta > 0) return;

        let newVal = (habit.currentOfDay || 0) + delta;
        if (newVal < 0) newVal = 0;
        if (habit.type === 'counter' && newVal > habit.target) newVal = habit.target;

        if (delta > 0 && newVal > (habit.currentOfDay || 0)) {
            if (habit.accumulatedTime && habit.accumulatedTime > 0) {
                habit.accumulatedTime = 0;
            }

            habit.dailySessionCount = (habit.dailySessionCount || 0) + 1;

            if (habit.type === 'infinite' && habit.currentOfDay === 0) {
                const today = window.GlobalApp.getGameDate();
                if (!habit.completionLog) habit.completionLog = {};
                if (!habit.completionLog[today]) {
                    window.HabitModel.toggleCompletionOnDate(habit, today);
                }
            }
        }

        habit.currentOfDay = newVal;

        if (habit.type === 'counter' && habit.currentOfDay >= habit.target) {
            this._completeHabit(habit);
        } else {
            window.GlobalApp.saveData();
            this.render();
        }
    },

    toggleConductBox: function(habitId, index) {
        if (window.SoundManager) window.SoundManager.play('click');
        const habit = window.GlobalApp.data.habits.find(h => h.id === habitId);
        if (!habit) return;

        if (!habit.conductCompleted) habit.conductCompleted = [false, false, false];
        const wasChecked = habit.conductCompleted[index];
        habit.conductCompleted[index] = !wasChecked;

        if (!wasChecked) {
            habit.dailySessionCount = (habit.dailySessionCount || 0) + 1;

            const allCompleted = habit.conductCompleted[0] && habit.conductCompleted[1] && habit.conductCompleted[2];
            if (allCompleted && !habit.completedToday) this._completeHabit(habit);
        }
        window.GlobalApp.saveData();
        this.render();
    },

    _completeHabit: function(habit) {
        habit.completedToday = true;
        const today = window.GlobalApp.getGameDate();

        // Registra a conclusão de hoje no histórico e recalcula sequência/recorde
        if (!habit.completionLog) habit.completionLog = {};
        if (!habit.completionLog[today]) {
            window.HabitModel.toggleCompletionOnDate(habit, today);
        } else {
            window.HabitModel.recalculateStreaks(habit);
        }

        if (window.SoundManager) window.SoundManager.play('click');

        window.GlobalApp.saveData();
        this.render();
        this.renderCalendars();
    },

    _undoCompletion: function(habit) {
        habit.completedToday = false;
        const today = window.GlobalApp.getGameDate();

        if (habit.completionLog && habit.completionLog[today]) {
            window.HabitModel.toggleCompletionOnDate(habit, today);
        } else {
            window.HabitModel.recalculateStreaks(habit);
        }

        window.GlobalApp.saveData();
        this.render();
        this.renderCalendars();
    },

    // =========================================================================
    // CALENDÁRIO DE HÁBITOS
    // =========================================================================

    renderCalendars: function() {
        if (!this.isSystemReady) return;
        if (!this.calendarMonthState) this.calendarMonthState = {};
        const habits = window.GlobalApp.data.habits || [];
        if (window.HabitView && window.HabitView.renderCalendarsTab) {
            window.HabitView.renderCalendarsTab(habits, this.calendarMonthState);
        }
    },

    navigateCalendarMonth: function(habitId, delta) {
        if (window.SoundManager) window.SoundManager.play('click');
        if (!this.calendarMonthState) this.calendarMonthState = {};

        const gameDateStr = window.GlobalApp.getGameDate();
        const gameParts = gameDateStr.split('-');
        const state = this.calendarMonthState[habitId] || {
            year: parseInt(gameParts[0]), month: parseInt(gameParts[1]) - 1
        };

        let newMonth = state.month + delta;
        let newYear = state.year;
        if (newMonth < 0) { newMonth = 11; newYear--; }
        if (newMonth > 11) { newMonth = 0; newYear++; }

        this.calendarMonthState[habitId] = { year: newYear, month: newMonth };
        this.renderCalendars();
    },

    toggleCalendarDay: function(habitId, dateStr) {
        if (window.SoundManager) window.SoundManager.play('click');
        const habit = window.GlobalApp.data.habits.find(h => h.id === habitId);
        if (!habit) return;

        // Não permite marcar dias futuros
        const todayStr = window.GlobalApp.getGameDate();
        if (dateStr > todayStr) return;

        // Cicla: vazio -> verde (feito) -> vermelho (não feito) -> vazio
        window.HabitModel.cycleCalendarDay(habit, dateStr);
        window.GlobalApp.saveData();
        this.renderCalendars();
        this.render();
    },

    // --- TIMER ---
    toggleStopwatch: async function(habitId) {
        if (window.SoundManager) window.SoundManager.play('click');

        if (this.timerState.habitId) {
            if (this.timerState.habitId === habitId) { alert("Cronômetro já ativo!"); return; }
            if (!await confirm("Parar atual e iniciar este?")) return;
            this.stopTimer();
        }

        const habit = window.GlobalApp.data.habits.find(h => h.id === habitId);
        if (!habit) return;
        if (!habit.accumulatedTime) habit.accumulatedTime = 0;

        this.timerState = {
            habitId: habitId, startTime: Date.now(),
            accumulatedBefore: habit.accumulatedTime,
            intervalId: setInterval(() => this.tick(), 1000), isPaused: false
        };

        window.GlobalApp.data.activeTimer = {
            habitId: habitId, startTime: this.timerState.startTime
        };
        window.GlobalApp.saveData();

        const currentApp = window.GlobalApp.data.navigation.currentApp;
        if (currentApp === 'productivity') {
            window.HabitView.renderStopwatchWidget(habit.name, habit.accumulatedTime, false);
        }
        this.render();
    },

    tick: function() {
        if (this.timerState.isPaused) return;
        const currentApp = window.GlobalApp.data.navigation.currentApp;
        if (currentApp !== 'productivity') return;

        const now = Date.now();
        const total = this.timerState.accumulatedBefore + Math.floor((now - this.timerState.startTime)/1000);

        const display = document.getElementById('widget-display');
        if (display) display.textContent = window.HabitModel.formatSeconds(total);
        const badge = document.getElementById(`time-badge-${this.timerState.habitId}`);
        if (badge) badge.textContent = window.HabitModel.formatSeconds(total);
    },

    pauseTimer: function() {
        if (window.SoundManager) window.SoundManager.play('click');
        if (!this.timerState.habitId) return;

        const habit = window.GlobalApp.data.habits.find(h => h.id === this.timerState.habitId);

        if (this.timerState.isPaused) {
            this.timerState.startTime = Date.now();
            this.timerState.isPaused = false;
            window.GlobalApp.data.activeTimer = { habitId: this.timerState.habitId, startTime: this.timerState.startTime };
        } else {
            const sessionSeconds = Math.floor((Date.now() - this.timerState.startTime)/1000);
            this.timerState.accumulatedBefore += sessionSeconds;
            this.timerState.isPaused = true;
            window.GlobalApp.data.activeTimer = null;
            if (habit) habit.accumulatedTime = this.timerState.accumulatedBefore;
        }

        window.GlobalApp.saveData();
        if (habit) {
            const currentApp = window.GlobalApp.data.navigation.currentApp;
            if (currentApp === 'productivity') {
                window.HabitView.renderStopwatchWidget(habit.name, this.timerState.accumulatedBefore, this.timerState.isPaused);
            }
        }
    },

    stopTimer: function() {
        if (window.SoundManager) window.SoundManager.play('click');
        if (!this.timerState.habitId) return;

        if (!this.timerState.isPaused) {
            const now = Date.now();
            const sessionSeconds = Math.floor((now - this.timerState.startTime) / 1000);
            this.timerState.accumulatedBefore += sessionSeconds;
        }

        const habit = window.GlobalApp.data.habits.find(h => h.id === this.timerState.habitId);
        if (habit) {
            const totalSeconds = this.timerState.accumulatedBefore;
            if (totalSeconds > 10) {
                habit.dailySessionCount = (habit.dailySessionCount || 0) + 1;
                habit.accumulatedTime = 0;
            } else {
                habit.accumulatedTime = totalSeconds;
            }
            window.GlobalApp.data.activeTimer = null;
            window.GlobalApp.saveData();
        }
        this.clearTimerState();
        this.render();
    },

    cancelTimer: function() {
        if (window.SoundManager) window.SoundManager.play('click');
        window.GlobalApp.data.activeTimer = null;
        window.GlobalApp.saveData();
        this.clearTimerState();
        this.render();
    },

    clearTimerState: function() {
        if (this.timerState.intervalId) clearInterval(this.timerState.intervalId);
        if (window.HabitView.removeStopwatchWidget) window.HabitView.removeStopwatchWidget();
        this.timerState = { habitId: null, startTime: null, accumulatedBefore: 0, intervalId: null, isPaused: false };
    },

    openManualTime: function(habitId) {
        if (window.SoundManager) window.SoundManager.play('click');
        const habit = window.GlobalApp.data.habits.find(h => h.id === habitId);
        if (!habit) return;

        window.HabitView.openManualTimeModal(habitId, habit.accumulatedTime || 0, (newTotalSeconds) => {
            habit.accumulatedTime = newTotalSeconds;
            window.GlobalApp.saveData();
            this.render();
        });
    },

    markOpportunity: function(id) {
        if (window.SoundManager) window.SoundManager.play('click');
        const habit = window.GlobalApp.data.habits.find(h => h.id === id);
        if (habit) {
            habit.opportunityToday = true;
            window.GlobalApp.saveData();
            this.render();
        }
    },

    deleteHabit: async function(id) {
        if (window.SoundManager) window.SoundManager.play('click');
        if (await confirm("Tem certeza que deseja excluir este hábito permanentemente?")) {
            const idx = window.GlobalApp.data.habits.findIndex(h => h.id === id);
            if (idx !== -1) {
                window.GlobalApp.data.habits.splice(idx, 1);
                window.GlobalApp.saveData();
                this.render();
                this.renderCalendars();
            }
        }
    },

    createGroup: async function() {
        if (window.SoundManager) window.SoundManager.play('click');
        const name = await prompt("Nome do grupo:");
        if (name) {
            window.GlobalApp.data.habitGroups.push({ id: window.GlobalApp.generateUUID(), name });
            window.GlobalApp.saveData();
            this.render();
        }
    },

    deleteGroup: async function(id) {
        if (window.SoundManager) window.SoundManager.play('click');
        if (await confirm("Apagar grupo? Os hábitos voltarão para 'Geral'.")) {
            window.GlobalApp.data.habits.forEach(h => { if(h.groupId === id) h.groupId = null; });
            window.GlobalApp.data.habitGroups = window.GlobalApp.data.habitGroups.filter(g => g.id !== id);
            this.activeTabId = 'general';
            window.GlobalApp.saveData();
            this.render();
        }
    },

    resetStreak: async function(id) {
        if (window.SoundManager) window.SoundManager.play('click');
        if (await confirm("Isso voltará a sequência atual para zero (o recorde é mantido). Continuar?")) {
            const habit = window.GlobalApp.data.habits.find(h => h.id === id);
            if (habit) {
                // Remove do histórico os dias que compõem a sequência atual, para
                // que o recálculo automático não a traga de volta no próximo reset.
                const todayStr = window.GlobalApp.getGameDate();
                let cursor = window.HabitModel._parseDate(todayStr);
                let remaining = habit.streak || 0;
                let safety = 0;

                while (remaining > 0 && safety < 3650) {
                    const dStr = window.GlobalApp.formatDate(cursor);
                    const counts = habit.isDependent ? true : window.HabitModel.isDateScheduled(habit, dStr);
                    if (counts) {
                        if (habit.completionLog) delete habit.completionLog[dStr];
                        remaining--;
                    }
                    cursor.setDate(cursor.getDate() - 1);
                    safety++;
                }

                habit.completedToday = false;
                habit.lastDone = null;
                window.HabitModel.recalculateStreaks(habit);
                window.GlobalApp.saveData();
                this.render();
                this.renderCalendars();
            }
        }
    },

    handleNavigationChange: function(currentApp) {
        if (this.timerState.habitId) {
            if (currentApp === 'productivity') {
                const habit = window.GlobalApp.data.habits.find(h => h.id === this.timerState.habitId);
                if (habit && window.HabitView.renderStopwatchWidget) {
                    const now = Date.now();
                    let currentTotal = this.timerState.accumulatedBefore;
                    if (!this.timerState.isPaused) {
                        currentTotal += Math.floor((now - this.timerState.startTime)/1000);
                    }
                    window.HabitView.renderStopwatchWidget(habit.name, currentTotal, this.timerState.isPaused);
                }
            } else {
                if (window.HabitView.removeStopwatchWidget) {
                    window.HabitView.removeStopwatchWidget();
                }
            }
        }
    },

    enforceStrictStreak: function() {
        if (!window.GlobalApp.data.habits) return;
        window.GlobalApp.data.habits.forEach(h => {
            window.HabitModel.recalculateStreaks(h);
        });
        window.GlobalApp.saveData();
    },

    restoreActiveTimer: function() {
        const savedTimer = window.GlobalApp.data.activeTimer;
        if (savedTimer && savedTimer.habitId && savedTimer.startTime) {
            const habit = window.GlobalApp.data.habits.find(h => h.id === savedTimer.habitId);
            if (habit) {
                this.timerState = {
                    habitId: savedTimer.habitId, startTime: savedTimer.startTime,
                    accumulatedBefore: habit.accumulatedTime || 0,
                    intervalId: setInterval(() => this.tick(), 1000), isPaused: false
                };
                const currentApp = window.GlobalApp.data.navigation.currentApp;
                if (currentApp === 'productivity') {
                    const now = Date.now();
                    const currentTotal = this.timerState.accumulatedBefore + Math.floor((now - this.timerState.startTime)/1000);
                    window.HabitView.renderStopwatchWidget(habit.name, currentTotal, false);
                }
                this.tick();
            } else {
                window.GlobalApp.data.activeTimer = null; window.GlobalApp.saveData();
            }
        }
    }
};

window.HabitManager.init();

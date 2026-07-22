/**
 * HABITS-CONTROLLER.JS
 * Controlador de Interações da Tela de Hábitos.
 * VERSÃO: V6.0 - LEAN EDITION (SEM XP)
 * Alterações: Removida toda a matemática de XP (calculateMasterXP), o widget de
 * "Nota Fiscal" (Auditor), o buff de Resiliência e o Bônus de Sinergia — todos
 * eram mecanismos exclusivos de recompensa. Mantidos: CRUD de hábitos, streak,
 * contadores, cronômetro (timer) e agendamento por frequência/padrão.
 */

window.HabitManager = {
    
    activeTabId: 'general',
    activeTimeFilter: 'today',
    isSystemReady: false,

    timerState: {
        habitId: null, startTime: null, accumulatedBefore: 0, 
        intervalId: null, isPaused: false
    },

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
    },

    ensureIntegrity: function() {
        if (!window.GlobalApp.data.habitGroups) window.GlobalApp.data.habitGroups = [];
        if (!window.GlobalApp.data.habits) window.GlobalApp.data.habits = [];
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
            if (habit) Object.assign(habit, habitData);
        } else {
            const newHabit = {
                id: window.GlobalApp.generateUUID(),
                currentOfDay: 0, completedToday: false, streak: 0, lastDone: null,
                totalCount: 0, accumulatedTime: 0,
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
    },

    // --- ACTIONS ---

    toggleCheck: function(id) {
        const habit = window.GlobalApp.data.habits.find(h => h.id === id);
        if (!habit) return;

        if (habit.completedToday) {
            if (window.SoundManager) window.SoundManager.play('click');
            if (confirm("Desmarcar hábito?")) {
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
                 habit.streak = (habit.streak || 0) + 1;
                 habit.lastDone = window.GlobalApp.formatDate(new Date());
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
        const today = window.GlobalApp.formatDate(new Date());
        
        if (habit.lastDone !== today) {
            habit.streak = (habit.streak || 0) + 1;
            habit.lastDone = today;
        }
        
        if (!habit.totalCount) habit.totalCount = 0;
        habit.totalCount += 1;

        if (window.SoundManager) window.SoundManager.play('click');
        
        window.GlobalApp.saveData();
        this.render();
    },

    _undoCompletion: function(habit) {
        habit.completedToday = false;
        
        if (habit.streak > 0) habit.streak--;
        if (habit.totalCount > 0) habit.totalCount--;

        window.GlobalApp.saveData();
        this.render();
    },

    // --- TIMER ---
    toggleStopwatch: function(habitId) {
        if (window.SoundManager) window.SoundManager.play('click');
        
        if (this.timerState.habitId) {
            if (this.timerState.habitId === habitId) { alert("Cronômetro já ativo!"); return; }
            if (!confirm("Parar atual e iniciar este?")) return;
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
        if (await confirm("Isso voltará a sequência para zero. Continuar?")) {
            const habit = window.GlobalApp.data.habits.find(h => h.id === id);
            if (habit) {
                habit.streak = 0;
                window.GlobalApp.saveData();
                this.render();
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
        const today = window.GlobalApp.formatDate(new Date());
        const d = new Date(); d.setDate(d.getDate() - 1);
        const yesterday = window.GlobalApp.formatDate(d);
        let resetCount = 0;

        window.GlobalApp.data.habits.forEach(h => {
            if (h.type === 'infinite') return;
            if (!h.streak || h.streak <= 0) return;
            if (h.lastDone !== today && h.lastDone !== yesterday) {
                h.streak = 0; resetCount++;
            }
        });
        if (resetCount > 0) window.GlobalApp.saveData();
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

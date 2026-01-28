/**
 * HABITS-CONTROLLER.JS
 * Controlador de Interações da Tela de Hábitos.
 * VERSÃO: V5.9.11 - MATH CORRECTION
 * Alterações: Ajuste fino nas fórmulas matemáticas de Foco (Tabela de Fluxo)
 * e Início/Fim do Dia (Fator Fixo 1.2x).
 */

window.HabitManager = {
    
    activeTabId: 'general',
    activeTimeFilter: 'today',
    isSystemReady: false,

    timerState: {
        habitId: null, startTime: null, accumulatedBefore: 0, 
        intervalId: null, isPaused: false
    },

    resilienceState: {
        activeUntil: 0, value: 1.0      
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

        document.addEventListener('keydown', (e) => {
            if (e.altKey && e.key.toLowerCase() === 'a') {
                if (window.HabitView && window.HabitView.toggleAuditWidget) {
                    window.HabitView.toggleAuditWidget();
                    if (window.SoundManager) window.SoundManager.play('click');
                }
            }
        });

        this.setupUIBinds();
    },

    onSystemReady: function() {
        if (this.isSystemReady) return;
        this.isSystemReady = true;

        this.ensureIntegrity();
        this.enforceStrictStreak();
        this.checkResilience(); 
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
        const milestoneType = document.getElementById('habit-milestone-type').value;

        const freqTypeRadio = document.querySelector('input[name="freqType"]:checked');
        const freqType = freqTypeRadio ? freqTypeRadio.value : 'weekly';
        const patternVal = document.getElementById('habit-pattern').value.trim();
        const offsetInput = parseInt(document.getElementById('habit-pattern-offset').value) || 1;
        const finalOffset = Math.max(0, offsetInput - 1);
        const isDependent = document.getElementById('habit-is-dependent') ? document.getElementById('habit-is-dependent').checked : false;

        const importanceRadio = document.querySelector('input[name="importance"]:checked');
        const importance = importanceRadio ? importanceRadio.value : 'development';

        const emotionalCheck = document.getElementById('habit-emotional-factor');
        const emotionalFactor = emotionalCheck ? emotionalCheck.checked : false;
        const emotionalValueEl = document.getElementById('habit-emotional-value');
        const emotionalValue = emotionalValueEl ? parseFloat(emotionalValueEl.value) : 0.1;

        const cognitiveCheck = document.getElementById('habit-cognitive-fatigue');
        const cognitiveFatigue = cognitiveCheck ? cognitiveCheck.checked : false;

        const startEndCheck = document.getElementById('habit-start-end');
        const startEndEffect = startEndCheck ? startEndCheck.checked : false;
        // Indices removidos da lógica, mas mantemos leitura para limpar se existir algo
        const startEndIndices = []; 

        const conductCheck = document.getElementById('habit-conduct');
        const conduct = conductCheck ? conductCheck.checked : false;

        const focusCheck = document.getElementById('habit-focus');
        const focus = focusCheck ? focusCheck.checked : false;

        const adaptCheck = document.getElementById('habit-adaptation-active');
        const adaptationActive = adaptCheck ? adaptCheck.checked : false;

        let freq = [];
        document.querySelectorAll('.days-selector input:checked').forEach(cb => freq.push(cb.value));

        if (!name || name.trim() === "") { alert("Nome obrigatório."); return; }
        if (freqType === 'weekly' && freq.length === 0 && !isDependent) { alert("Selecione os dias."); return; }
        
        this.saveHabit(
            id, name, type, target, groupId, freqType, freq, patternVal, finalOffset, isDependent,
            importance, emotionalFactor, emotionalValue, cognitiveFatigue,
            startEndEffect, startEndIndices, conduct,
            focus, adaptationActive, milestoneType
        );
    },

    saveHabit: function(id, name, type, target, groupId, frequencyType, frequencyDays, patternVal, patternOffset, isDependent, importance, emotionalFactor, emotionalValue, cognitiveFatigue, startEndEffect, startEndIndices, conduct, focus, adaptationActive, milestoneType) {
        
        const habitData = {
            name, type, target, groupId, milestoneType,
            frequencyType, frequency: frequencyDays,
            pattern: patternVal, patternOffset, isDependent: !!isDependent,
            importance, emotionalFactor, emotionalValue, cognitiveFatigue,
            startEndEffect, startEndIndices, conduct,
            focus, 
            adaptationActive: !!adaptationActive,
            abstinence: false, abstinenceStages: [], focusStages: [] 
        };

        if (id) {
            const habit = window.GlobalApp.data.habits.find(h => h.id === id);
            if (habit) Object.assign(habit, habitData);
        } else {
            const newHabit = {
                id: window.GlobalApp.generateUUID(),
                currentOfDay: 0, completedToday: false, streak: 0, lastDone: null,
                milestonesClaimed: [], totalCount: 0, accumulatedTime: 0, xp: 0, 
                opportunityToday: false, dailySessionCount: 0, adaptationProgress: 1, 
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

    // --- CÁLCULO DE XP (MATEMÁTICA CORRIGIDA) ---
    calculateMasterXP: function(habit, context = {}) {
        const xpData = window.GlobalApp.data.xp;
        const userLevel = (xpData && xpData.level) ? xpData.level : 1;
        const BaseValue = userLevel * 100;
        
        let K = 0.5; 
        if (habit.importance === 'critical') K = 1.0;

        let V = 0; 
        let M_foc = 1.0; 
        let vReason = "Padrão";
        let minutes = 0;

        // 1. Duração Base
        if (context.durationSeconds) minutes = context.durationSeconds / 60;
        else if (context.durationMinutes) minutes = context.durationMinutes;
        else minutes = 5; 

        // 2. Volume (Horas)
        V = minutes / 60;
        vReason = `${Math.floor(minutes)}m`;
        
        // 3. Lógica de Foco (TABELA DE FLUXO)
        if (habit.focus) {
            // Tabela:
            // 00-09 min: 1.0x
            // 10-19 min: 1.1x
            // ...
            // 90+ min: 1.9x (Cap Máximo)
            
            if (minutes < 10) {
                M_foc = 1.0;
            } else {
                // Math.floor(minutes / 10) retorna quantas dezenas completas existem.
                // Ex: 15min -> 1 dezena -> 1 * 0.1 = +0.1
                const tenMinBlocks = Math.floor(minutes / 10);
                M_foc = 1.0 + (tenMinBlocks * 0.1);
                
                // Teto de 1.9x (Deep Work/Cap Máximo)
                if (M_foc > 1.9) M_foc = 1.9;
            }
            vReason += ` (Foco ${M_foc.toFixed(1)}x)`;
        }

        // Overrides
        if (habit.conduct) {
            const index = context.conductIndex || 0;
            const weights = [0.30, 0.25, 0.45]; 
            V = weights[index] || 0.25;
            vReason = ["Manhã", "Tarde", "Noite"][index];
        } 
        else if (habit.emotionalFactor) {
            V = habit.emotionalValue || 0.1;
            vReason = "Impulso";
        }

        const ActionValue = BaseValue * K * V;
        
        // Multiplicadores Padrão
        const streakBonus = Math.min((habit.streak || 0), 30) * 0.01666;
        const M_con = 1.0 + streakBonus;

        let M_fat = 1.0;
        let fatBonusMsg = "";
        if (habit.cognitiveFatigue) {
            const session = (habit.dailySessionCount || 0) + 1;
            if (session === 2) M_fat = 1.1;
            else if (session === 3) M_fat = 1.25;
            else if (session >= 4) {
                M_fat = 1.45;
                if (session === 4) fatBonusMsg = "+"; 
            }
        }

        let M_res = 1.0;
        this.checkResilience();
        if (Date.now() < this.resilienceState.activeUntil) {
            M_res = this.resilienceState.value;
        }

        // 4. Lógica de Início/Fim do Dia (SIMPLIFICADA)
        // Se a caixa estiver marcada, ganha 1.2x (20% fixo)
        let M_hor = 1.0;
        if (habit.startEndEffect) {
            M_hor = 1.2;
        }

        let M_ada = 1.0;
        const currentDay = habit.adaptationProgress || 1;
        if (habit.adaptationActive && currentDay <= 21) {
            M_ada = 1.5 - (0.5 * (currentDay / 21));
            if (M_ada < 1.0) M_ada = 1.0;
        }

        let FinalXP = ActionValue * M_foc * M_con * M_fat * M_res * M_hor * M_ada;
        if (fatBonusMsg) FinalXP = FinalXP * 1.2;

        if (habit.emotionalFactor) {
            const buffVal = 1 + (habit.emotionalValue || 0.1);
            this.resilienceState = { activeUntil: Date.now() + (4 * 3600 * 1000), value: buffVal };
        }

        const RoundedXP = parseFloat(FinalXP.toFixed(1));

        const auditData = {
            level: userLevel, baseRaw: BaseValue, k: K, v: V.toFixed(3),
            drag: M_foc.toFixed(2), streak: M_con.toFixed(2), fatigue: M_fat,
            resilience: M_res, time: M_hor, adapt: M_ada.toFixed(2), adaptDay: currentDay,
            actionValue: ActionValue.toFixed(1)
        };

        if (window.HabitView && window.HabitView.updateAuditWidget) {
            window.HabitView.updateAuditWidget(habit.name, RoundedXP, auditData);
        }

        return {
            xp: Math.max(0.1, RoundedXP),
            log: `${habit.name} ${vReason}`,
            auditData: auditData
        };
    },

    // --- ACTIONS ---

    toggleCheck: function(id) {
        const habit = window.GlobalApp.data.habits.find(h => h.id === id);
        if (!habit) return;

        if (habit.completedToday) {
            if (window.SoundManager) window.SoundManager.play('click');
            if (confirm("Desmarcar hábito e estornar XP ganho?")) {
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

        let calculationContext = { currentStep: 1 };
        if (habit.accumulatedTime && habit.accumulatedTime > 0) {
            calculationContext.durationSeconds = habit.accumulatedTime;
            habit.accumulatedTime = 0; 
        }

        const mathResult = this.calculateMasterXP(habit, calculationContext);
        habit.dailySessionCount = (habit.dailySessionCount || 0) + 1;
        
        if (window.XPManager) {
            window.XPManager.gainXP(mathResult.xp, mathResult.log, { streak: habit.streak, habitId: habit.id });
        }

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
            let xpContext = { currentStep: newVal };
            
            if (habit.accumulatedTime && habit.accumulatedTime > 0) {
                xpContext.durationSeconds = habit.accumulatedTime;
                habit.accumulatedTime = 0; 
            }

            const mathResult = this.calculateMasterXP(habit, xpContext);
            habit.dailySessionCount = (habit.dailySessionCount || 0) + 1;
            
            if (habit.type === 'infinite' && habit.currentOfDay === 0) {
                 habit.streak = (habit.streak || 0) + 1;
                 habit.lastDone = window.GlobalApp.formatDate(new Date());
            }

            let logSuffix = `(${newVal}/${habit.target})`;
            if (habit.type === 'infinite') logSuffix = `(+1)`;
            
            if(window.XPManager) {
                window.XPManager.gainXP(mathResult.xp, `${habit.name} ${logSuffix}`, { streak: habit.streak, habitId: habit.id });
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
            const mathResult = this.calculateMasterXP(habit, { conductIndex: index, currentStep: index + 1 });
            habit.dailySessionCount = (habit.dailySessionCount || 0) + 1;
            if(window.XPManager) {
                window.XPManager.gainXP(mathResult.xp, mathResult.log, { streak: habit.streak, habitId: habit.id });
            }
            
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
            
            if (habit.adaptationActive) {
                if (typeof habit.adaptationProgress === 'undefined') habit.adaptationProgress = 1;
                habit.adaptationProgress++;
            }
        }
        
        if (!habit.totalCount) habit.totalCount = 0;
        habit.totalCount += 1;

        if (window.SoundManager) window.SoundManager.play('xp');

        if (window.HabitModel && window.HabitModel.checkAndGetMilestoneXP) {
            const milestoneData = window.HabitModel.checkAndGetMilestoneXP(habit);
            if (milestoneData) {
                const msg = `🏆 MARCO: ${milestoneData.targets.join(', ')} ${milestoneData.type === 'streak' ? 'Dias' : 'Ações'}!`;
                if(window.XPManager) {
                    window.XPManager.gainXP(milestoneData.xp, `${habit.name} - ${msg}`, { isMilestone: true, habitId: habit.id });
                }
            }
        }
        
        window.GlobalApp.saveData();
        this.render();
        this.checkSynergyBonus();
    },

    _undoCompletion: function(habit) {
        habit.completedToday = false;
        
        if (habit.streak > 0) habit.streak--;
        if (habit.totalCount > 0) habit.totalCount--;

        const estimate = this.calculateMasterXP(habit, {});
        if(window.XPManager) {
            window.XPManager.gainXP(-estimate.xp, `Desfeito: ${habit.name}`, { forceFlat: true });
        }

        window.GlobalApp.saveData();
        this.render();
    },

    checkSynergyBonus: function() {
        const today = window.GlobalApp.formatDate(new Date());
        const dayOfWeekStr = new Date().getDay().toString();
        
        const activeHabitsToday = window.GlobalApp.data.habits.filter(h => {
            if (h.frequencyType === 'weekly' || !h.frequencyType) {
                return h.frequency && h.frequency.includes(dayOfWeekStr);
            }
            if (h.frequencyType === 'pattern' && h.pattern && window.HabitModel && window.HabitModel.getPatternStep) {
                const step = window.HabitModel.getPatternStep(h);
                return h.pattern[step] !== '0'; 
            }
            return false;
        });

        const allDone = activeHabitsToday.length > 0 && activeHabitsToday.every(h => h.completedToday);

        if (allDone) {
            const history = window.GlobalApp.data.xp.history || [];
            const todayXP = history
                .filter(log => log.date === today)
                .reduce((sum, log) => sum + (log.amount || 0), 0);
            
            const habitCount = activeHabitsToday.length;
            const synergyFactor = habitCount * 0.01; 
            const bonusXP = parseFloat((todayXP * synergyFactor).toFixed(1));

            if (bonusXP > 0) {
                setTimeout(() => {
                    if (window.SoundManager) window.SoundManager.play('chest'); 
                    if(window.XPManager) {
                        window.XPManager.gainXP(bonusXP, "Sinergia Completa", { isMilestone: true });
                    }
                    if (window.SysModal && window.SysModal.alert) {
                        window.SysModal.alert(`⚡ SINERGIA! Todos os ${habitCount} hábitos feitos. Bônus: +${bonusXP} XP`);
                    }
                }, 1200);
            }
        }
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
                const mathResult = this.calculateMasterXP(habit, { durationSeconds: totalSeconds });
                if(window.XPManager) {
                    window.XPManager.gainXP(mathResult.xp, `${mathResult.log} (Timer)`, { streak: habit.streak, habitId: habit.id });
                }
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

    activateResilienceBuff: function(durationMinutes, multiplier) {
        this.resilienceState.activeUntil = Date.now() + (durationMinutes * 60 * 1000);
        this.resilienceState.value = multiplier;
        console.log(`Buff ativado! Multiplicador ${multiplier}x por ${durationMinutes}min.`);
    },

    checkResilience: function() {
        if (Date.now() > this.resilienceState.activeUntil) {
            this.resilienceState.value = 1.0; 
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

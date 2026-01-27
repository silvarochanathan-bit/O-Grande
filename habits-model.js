/**
 * HABITS-MODEL.JS
 * Camada de Dados e Regras de Negócio.
 * ADIÇÃO: Helpers de Tempo e Reset de Tempo Acumulado.
 */

window.HabitModel = {

    milestoneConfig: {
        quantity: [10, 50, 100, 500, 1000, 5000, 10000],
        streak: [7, 21, 30, 90, 365]
    },

    // --- FORMATAÇÃO DE TEMPO (NOVO) ---
    formatSeconds: function(totalSeconds) {
        if (!totalSeconds) return "00:00:00";
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        
        const pad = (num) => String(num).padStart(2, '0');
        return `${pad(h)}:${pad(m)}:${pad(s)}`;
    },

    // --- LÓGICA DE PADRÕES ---
    getPatternStep: function(habit) {
        if (!habit.pattern) return 0;
        const offset = habit.patternOffset || 0;
        const totalSteps = (habit.streak || 0) + offset;
        return totalSteps % habit.pattern.length;
    },

    // --- RESET DIÁRIO INTELIGENTE ---
    dailyResetCheck: function() {
        const data = window.GlobalApp.data;
        if (!data) return;
        
        const now = new Date();
        const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayStr = window.GlobalApp.formatDate(now);

        let lastLoginDate = new Date(todayDate);
        
        if (data.lastLogin) {
            const parts = data.lastLogin.split('-');
            lastLoginDate = new Date(parts[0], parts[1]-1, parts[2]);
        } else {
            data.lastLogin = todayStr;
            window.GlobalApp.saveData();
            return;
        }

        if (lastLoginDate < todayDate) {
            console.log("Site C: Novo dia detectado. Processando reset...");
            let checkDate = new Date(lastLoginDate);
            checkDate.setDate(checkDate.getDate() + 1);

            while (checkDate <= todayDate) {
                const isProcessingToday = checkDate.getTime() === todayDate.getTime();
                const dayCode = checkDate.getDay().toString();

                data.habits.forEach(habit => {
                    const wasCompletedYesterday = habit.completedToday;
                    const wasOpportunity = habit.opportunityToday;

                    if (isProcessingToday) {
                        habit.completedToday = false;
                        habit.currentOfDay = 0;
                        habit.opportunityToday = false;
                        // NOVO: Zera o tempo acumulado do dia anterior
                        habit.accumulatedTime = 0; 
                    }

                    if (!isProcessingToday) {
                        if (habit.isDependent) {
                            // Só quebra streak se teve oportunidade E não completou
                            if (wasOpportunity && !wasCompletedYesterday) {
                                habit.streak = 0;
                            }
                        } 
                        else if (habit.frequencyType === 'pattern' && habit.pattern) {
                            this.processPatternDailyReset(habit, wasCompletedYesterday);
                        } 
                        else {
                            if (habit.frequency && habit.frequency.includes(dayCode)) {
                                habit.streak = 0; // Quebrou
                            }
                        }
                    }
                });
                checkDate.setDate(checkDate.getDate() + 1);
            }

            data.lastLogin = todayStr;
            window.GlobalApp.saveData();
        }
    },

    processPatternDailyReset: function(habit, wasCompletedYesterday) {
        const stepIndex = this.getPatternStep(habit);
        const patternArr = habit.pattern.split('');
        const typeExpected = patternArr[stepIndex]; 

        if (typeExpected === '0') {
            habit.streak = (habit.streak || 0) + 1;
        } else if (!wasCompletedYesterday) {
            habit.streak = 0;
        }
    },

    // --- LÓGICA DE VISIBILIDADE (FILTROS) ---
    checkHabitVisibility: function(habit, activeTimeFilter) {
        if (habit.isDependent) return true;
        if (activeTimeFilter === 'all') return true;

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        let endDate = new Date(today);
        
        if (activeTimeFilter === 'today') {
            endDate = new Date(today);
        } else if (activeTimeFilter === 'week') {
            const day = today.getDay(); 
            endDate.setDate(today.getDate() + (day === 0 ? 0 : (7 - day))); 
        } else if (activeTimeFilter === 'month') {
            endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        }

        let checkDate = new Date(today);
        let daysChecked = 0;

        while (checkDate <= endDate) {
            const dayCode = checkDate.getDay().toString();
            
            if (!habit.frequencyType || habit.frequencyType === 'weekly') {
                if (habit.frequency && habit.frequency.includes(dayCode)) return true;
            }
            else if (habit.frequencyType === 'pattern' && habit.pattern) {
                const offset = habit.patternOffset || 0;
                const projectedTotal = (habit.streak || 0) + offset + daysChecked;
                const patternArr = habit.pattern.split('');
                const step = projectedTotal % patternArr.length;
                if (patternArr[step] === '1') return true;
            }

            checkDate.setDate(checkDate.getDate() + 1);
            daysChecked++;
            if (daysChecked > 365) break; 
        }

        return false;
    },

    // --- CÁLCULO DE MILESTONES ---
    checkAndGetMilestoneXP: function(habit) {
        if (!habit.milestoneType || habit.milestoneType === 'none') return null;
        if (!habit.milestonesClaimed) habit.milestonesClaimed = [];

        let currentValue = 0;
        let targets = [];

        if (habit.milestoneType === 'streak') {
            currentValue = habit.streak;
            targets = this.milestoneConfig.streak;
        } else if (habit.milestoneType === 'quantity') {
            currentValue = habit.totalCount || 0;
            targets = this.milestoneConfig.quantity;
        }

        let totalBonusXP = 0;
        let earnedTargets = [];

        targets.forEach(target => {
            if (currentValue >= target && !habit.milestonesClaimed.includes(target)) {
                totalBonusXP += habit.xp * target;
                habit.milestonesClaimed.push(target);
                earnedTargets.push(target);
            }
        });

        if (totalBonusXP > 0) return { xp: totalBonusXP, targets: earnedTargets, type: habit.milestoneType };
        return null;
    }
};
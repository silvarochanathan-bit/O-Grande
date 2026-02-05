/**
 * HABITS-MODEL.JS
 * Lógica de Dados e Regras de Negócio para Hábitos.
 * VERSÃO: V5.9 - PASSIVE RESET MODEL
 * Alterações: O reset diário agora é um método passivo chamado pelo GlobalApp.
 * Removeu-se a verificação interna de data para evitar conflitos (Single Source of Truth).
 */

window.HabitModel = {

    // --- 1. FILTRAGEM E VISIBILIDADE ---

    filterHabits: function(habits, timeFilter) {
        if (!habits) return [];
        return habits.filter(h => this.checkHabitVisibility(h, timeFilter));
    },

    checkHabitVisibility: function(habit, timeFilter) {
        // Se filtro for 'all', mostra tudo
        if (timeFilter === 'all') return true;

        // Se filtro for 'pending', mostra só o que não completou hoje (considerando dia da semana)
        if (timeFilter === 'pending') {
            const isToday = this.isHabitScheduledForToday(habit);
            return isToday && !habit.completedToday;
        }

        // Se filtro for 'today', mostra tudo agendado para hoje (feito ou não)
        if (timeFilter === 'today') {
            return this.isHabitScheduledForToday(habit);
        }

        return true;
    },

    isHabitScheduledForToday: function(habit) {
        // 1. Hábitos Dependentes (só aparecem se marcados como oportunidade)
        if (habit.isDependent) {
            return !!habit.opportunityToday; // Só exibe se foi desbloqueado
        }

        const today = new Date();
        const dayOfWeek = today.getDay(); // 0=Dom, 1=Seg...
        
        // 2. Frequência Semanal (Array de dias)
        if (habit.frequencyType === 'weekly') {
            // Se frequency for vazio e não for dependente, assume todos os dias (segurança)
            if (!habit.frequency || habit.frequency.length === 0) return true;
            // Verifica se o dia de hoje está no array de frequência (strings ou ints)
            return habit.frequency.some(d => parseInt(d) === dayOfWeek);
        }

        // 3. Padrão (X dias sim, Y dias não)
        if (habit.frequencyType === 'pattern') {
            const step = this.getPatternStep(habit);
            // Se o caractere no passo atual for '1', é dia de fazer. Se '0', folga.
            return habit.pattern && habit.pattern[step] === '1';
        }

        // Default (diário)
        return true;
    },

    // Auxiliar para calcular em qual passo do padrão estamos
    getPatternStep: function(habit) {
        if (!habit.createdAt) return 0;
        if (!habit.pattern) return 0;

        const created = new Date(habit.createdAt);
        created.setHours(0,0,0,0);
        const today = new Date();
        today.setHours(0,0,0,0);
        
        const diffTime = Math.abs(today - created);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        
        const offset = habit.patternOffset || 0;
        const totalIndex = diffDays + offset;
        
        return totalIndex % habit.pattern.length;
    },

    // --- 2. CÁLCULO DE XP (ESTIMATIVA VISUAL) ---
    // Nota: O cálculo real final é feito no Controller (Master Formula), 
    // mas este método é usado para mostrar a estimativa "+XX XP" no card.

    calculateXP: function(habit) {
        // Base baseada na importância
        const baseValues = { 'low': 10, 'medium': 20, 'high': 35, 'critical': 50, 'development': 20 };
        let xp = baseValues[habit.importance] || 15;

        // Fator Emocional (Multiplicador 0.5x a 1.5x)
        const emoMult = 0.5 + ((habit.emotionalValue || 0.5)); 
        xp = xp * emoMult;

        // Fadiga Cognitiva (Bônus para alta fadiga)
        if (habit.cognitiveFatigue) xp = xp * 1.2;

        // Bônus de Streak (Max +50%)
        const streakBonus = Math.min(habit.streak || 0, 50) / 100;
        xp = xp * (1 + streakBonus);

        return Math.floor(xp);
    },

    // --- 3. RESET DIÁRIO (PASSIVO - V5.9) ---
    // Chamado EXCLUSIVAMENTE pelo GlobalApp.processDailyRollover()
    resetDailyState: function() {
        console.log("[HabitModel] Executando reset passivo de estados...");
        
        const habits = window.GlobalApp.data.habits || [];
        // A data de referência é "Ontem" (pois o reset roda na manhã seguinte)
        // Precisamos saber se o hábito estava agendado para ontem para cobrar o streak.
        
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = window.GlobalApp.formatDate(yesterday);

        habits.forEach(h => {
            // Salva estado de conclusão de ontem antes de limpar
            const completedYesterday = h.completedToday;
            
            // Reseta contadores do dia (prepara para Hoje)
            h.completedToday = false;
            h.currentOfDay = 0;
            h.accumulatedTime = 0;
            h.opportunityToday = false; // Reseta flag de oportunidade (dependentes)
            h.dailySessionCount = 0;    // Reseta sessões de foco
            h.conductCompleted = [false, false, false];
            h.abstinenceCompleted = []; 
            if (h.abstinenceStages) {
                h.abstinenceCompleted = new Array(h.abstinenceStages.length).fill(false);
            }

            // Lógica de Falha de Streak (Hard Reset)
            // Se não completou ontem...
            if (!completedYesterday) {
                // ...e não é um hábito infinito (que não tem obrigação diária)...
                if (h.type !== 'infinite') {
                    // Verificação simplificada: Se lastDone não for ontem, quebra.
                    // (Poderíamos verificar se era dia agendado, mas o GlobalApp já faz reset genérico.
                    // A lógica fina de "era dia de fazer?" é complexa de rodar retroativamente sem histórico detalhado.
                    // Assumimos: Se tem streak > 0 e não fez ontem, perdeu).
                    
                    const lastDoneDate = h.lastDone ? h.lastDone.split('T')[0] : null;
                    
                    // Se a última vez que fez não foi ontem (e nem hoje, claro), e tinha streak...
                    if (lastDoneDate !== yesterdayStr && h.streak > 0) {
                        // Verifica se ontem era dia de folga no padrão (Salvamento de Streak)
                        // TODO: Implementar check retroativo de agendamento se necessário.
                        // Por padrão, mantemos a rigidez: Não fez = Zero.
                        console.log(`[HabitModel] Streak perdido para: ${h.name}`);
                        h.streak = 0;
                    }
                }
            }
        });

        window.GlobalApp.saveData();
    },

    // --- 4. MILESTONES (CONQUISTAS) ---
    checkMilestones: function(habit) {
        // Alias para compatibilidade com Controller
        return this.checkAndGetMilestoneXP(habit);
    },

    checkAndGetMilestoneXP: function(habit) {
        if (!habit.milestoneType || habit.milestoneType === 'none') return null;

        // Valores alvo para milestones
        const targets = [1, 3, 7, 14, 21, 30, 60, 90, 180, 365, 1000];
        
        let currentVal = 0;
        if (habit.milestoneType === 'streak') currentVal = habit.streak;
        if (habit.milestoneType === 'total_reps') currentVal = habit.totalCount;

        if (targets.includes(currentVal)) {
            // Gera ID único para essa conquista: habitID_type_value
            const milestoneId = `${habit.id}_${habit.milestoneType}_${currentVal}`;
            
            if (!habit.milestonesClaimed) habit.milestonesClaimed = [];
            
            if (!habit.milestonesClaimed.includes(milestoneId)) {
                habit.milestonesClaimed.push(milestoneId);
                
                // Cálculo de XP do Prêmio
                const bonusXP = Math.floor(50 * Math.sqrt(currentVal));
                
                return {
                    xp: bonusXP,
                    type: habit.milestoneType,
                    targets: [currentVal]
                };
            }
        }
        return null;
    },

    // --- 5. UTILS ---
    formatSeconds: function(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }
};
/**
 * HABITS-MODEL.JS
 * Lógica de Dados e Regras de Negócio para Hábitos.
 * VERSÃO: V6.0 - LEAN EDITION (SEM XP)
 * Alterações: Removido todo o cálculo de XP e Marcos (Milestones) de recompensa.
 * Mantida a lógica de agendamento (frequência semanal / padrão) e streak.
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

        // Usa a Data do Jogo (Game Date) para respeitar a regra das 12h
        const gameDateStr = window.GlobalApp.getGameDate(); 
        const parts = gameDateStr.split('-');
        const gameDateObj = new Date(parts[0], parts[1] - 1, parts[2]);
        
        const dayOfWeek = gameDateObj.getDay(); // 0=Dom, 1=Seg...
        
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
        
        // Usa a Data do Jogo (Game Date)
        const gameDateStr = window.GlobalApp.getGameDate();
        const parts = gameDateStr.split('-');
        const currentGameDate = new Date(parts[0], parts[1] - 1, parts[2]);
        currentGameDate.setHours(0,0,0,0);
        
        const diffTime = Math.abs(currentGameDate - created);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        
        const offset = habit.patternOffset || 0;
        const totalIndex = diffDays + offset;
        
        return totalIndex % habit.pattern.length;
    },

    // --- 2. RESET DIÁRIO (PASSIVO) ---
    // Chamado EXCLUSIVAMENTE pelo GlobalApp.checkForDailyReset()
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
                    const lastDoneDate = h.lastDone ? h.lastDone.split('T')[0] : null;
                    
                    // Se a última vez que fez não foi ontem (e nem hoje, claro), e tinha streak...
                    if (lastDoneDate !== yesterdayStr && h.streak > 0) {
                        console.log(`[HabitModel] Streak perdido para: ${h.name}`);
                        h.streak = 0;
                    }
                }
            }
        });

        window.GlobalApp.saveData();
    },

    // --- 3. UTILS ---
    formatSeconds: function(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }
};

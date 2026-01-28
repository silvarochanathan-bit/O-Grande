/**
 * HABITS-MODEL.JS
 * Lógica de Dados e Regras de Negócio para Hábitos.
 * VERSÃO: V23 - RESET DIÁRIO ROBUSTO
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
            return !!habit.opportunityToday; // Só exibe se a oportunidade surgiu
        }

        // 2. Frequência por Pattern (ex: "1101")
        if (habit.frequencyType === 'pattern' && habit.pattern) {
            // Pattern mostra sempre, mas UI indica descanso. 
            // Para simplificar "Hoje", consideramos que faz parte do dia, 
            // mesmo que seja descanso (para o usuário ver que tem descanso).
            return true; 
        }

        // 3. Frequência Semanal (0=Dom, 1=Seg...)
        if (habit.frequency) {
            const todayStr = new Date().getDay().toString();
            return habit.frequency.includes(todayStr);
        }

        // Fallback
        return false; 
    },

    // --- 2. RESET DIÁRIO (CORREÇÃO CRÍTICA) ---

    dailyResetCheck: function() {
        if (!window.GlobalApp || !window.GlobalApp.data) return false;

        const today = window.GlobalApp.formatDate(new Date());
        
        // Garante que existe o objeto meta para controle
        if (!window.GlobalApp.data.meta) window.GlobalApp.data.meta = {};
        
        const lastDate = window.GlobalApp.data.meta.lastActiveDate;

        // SE A DATA MUDOU (ou é a primeira vez rodando)
        if (lastDate !== today) {
            console.log(`[HabitModel] 🌅 Novo dia detectado: ${today}. Executando Reset Diário...`);

            if (window.GlobalApp.data.habits) {
                window.GlobalApp.data.habits.forEach(h => {
                    // RESETA TODOS OS ESTADOS DIÁRIOS
                    h.completedToday = false;
                    h.currentOfDay = 0;       // Zera contador
                    h.dailySessionCount = 0;  // Zera sessões de fadiga
                    h.accumulatedTime = 0;    // Zera cronômetro não salvo
                    h.opportunityToday = false; // Zera oportunidade de dependentes
                    
                    // Zera Tracks Visuais
                    h.focusCompleted = [];
                    h.abstinenceCompleted = [];
                    h.conductCompleted = [false, false, false];

                    // OBS: Streak NÃO zera aqui. 
                    // O Streak zera no Controller ao detectar que falhou ontem.
                });
            }

            // Atualiza a data de controle e salva imediatamente
            window.GlobalApp.data.meta.lastActiveDate = today;
            window.GlobalApp.saveData();
            return true; // Retorna true para avisar que houve reset
        }
        
        return false; // Nada mudou
    },

    // --- 3. LÓGICA DE PADRÕES (PATTERN) ---

    getPatternStep: function(habit) {
        if (!habit.pattern) return 0;
        
        // Calcula dias desde a criação (ou uma data base)
        const created = new Date(habit.createdAt || new Date());
        const now = new Date();
        // Diferença em dias inteiros
        const diffTime = Math.abs(now - created);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        
        // Aplica offset
        const totalIndex = diffDays + (habit.patternOffset || 0);
        
        // Modulo pelo tamanho do padrão
        return totalIndex % habit.pattern.length;
    },

    // --- 4. UTILITÁRIOS ---

    formatSeconds: function(seconds) {
        if (!seconds && seconds !== 0) return "00:00";
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        const h = Math.floor(seconds / 3600);
        
        if (h > 0) {
            const mRem = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
            return `${h}:${mRem}:${s}`;
        }
        return `${m}:${s}`;
    },

    checkAndGetMilestoneXP: function(habit) {
        if (!habit.milestoneType || habit.milestoneType === 'none') return null;

        // Definição das Metas
        const milestones = [7, 21, 30, 66, 90, 100, 365, 1000]; 
        
        let currentVal = 0;
        if (habit.milestoneType === 'streak') currentVal = habit.streak;
        if (habit.milestoneType === 'quantity') currentVal = habit.totalCount;

        // Verifica se atingiu uma meta EXATA hoje e se ainda não reivindicou
        if (milestones.includes(currentVal)) {
            const milestoneId = `${habit.id}_${habit.milestoneType}_${currentVal}`;
            
            if (!habit.milestonesClaimed) habit.milestonesClaimed = [];
            
            if (!habit.milestonesClaimed.includes(milestoneId)) {
                habit.milestonesClaimed.push(milestoneId);
                
                // Cálculo de XP do Prêmio (Ex: 50 * raiz do valor)
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

    // --- 5. SETUP VISUAL (OPTIONS) ---
    // Funções auxiliares para mostrar/esconder campos no modal (usado pelo View se necessário)
    toggleFreqOptions: function() {
        const weekly = document.querySelector('input[name="freqType"][value="weekly"]');
        const area = document.getElementById('pattern-input-area');
        const days = document.querySelector('.days-selector');
        
        if (weekly && weekly.checked) {
            if(days) days.classList.remove('hidden');
            if(area) area.classList.add('hidden');
        } else {
            if(days) days.classList.add('hidden');
            if(area) area.classList.remove('hidden');
        }
    },

    toggleAdvancedOptions: function() {
        // Lógica de toggle visual se necessário
    }
};
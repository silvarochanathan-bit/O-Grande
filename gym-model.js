/**
 * GYM-MODEL.JS
 * O Cérebro Matemático do Módulo Iron Forge.
 * VERSÃO: V3.1 (Null Safe)
 * Responsável por: Cálculos de XP, Lógica de PR Global, Timers e Regras de Negócio.
 */

window.GymModel = {

    // Configurações Base
    config: {
        phases: {
            cutting: 1.5,
            maintenance: 1.2,
            bulking: 1.0
        },
        streaks: [
            { limit: 3, mult: 1.0, title: "Iniciante" },
            { limit: 14, mult: 1.1, title: "Consistente" },
            { limit: 29, mult: 1.25, title: "Veterano" },
            { limit: 9999, mult: 1.5, title: "Mestre" }
        ]
    },

    init: function() {
        // --- CORREÇÃO DO ERRO ---
        // Se os dados globais ainda não carregaram, aborta para não quebrar o site.
        if (!window.GlobalApp || !window.GlobalApp.data) return;

        // Garante estrutura de dados
        if (!window.GlobalApp.data.gym) window.GlobalApp.data.gym = {};
        if (!window.GlobalApp.data.gym.prs) window.GlobalApp.data.gym.prs = {}; 
        if (!window.GlobalApp.data.gym.history) window.GlobalApp.data.gym.history = [];
        if (!window.GlobalApp.data.gym.streak) window.GlobalApp.data.gym.streak = 0;
        if (!window.GlobalApp.data.gym.currentPhase) window.GlobalApp.data.gym.currentPhase = 'maintenance';
    },

    // --- 1. GERENCIAMENTO DE PR GLOBAL (RECORDES PESSOAIS) ---

    getExercisePR: function(exerciseId) {
        if (!window.GlobalApp.data || !window.GlobalApp.data.gym.prs) return { load: 0, reps: 0 };
        return window.GlobalApp.data.gym.prs[exerciseId] || { load: 0, reps: 0 };
    },

    updatePR: function(exerciseId, load, reps) {
        const currentPR = this.getExercisePR(exerciseId);
        let improved = false;

        if (load > currentPR.load) {
            improved = true;
        } else if (load === currentPR.load && reps > currentPR.reps) {
            improved = true;
        }

        if (improved) {
            console.log(`[IronForge] Novo PR detectado para ${exerciseId}: ${load}kg x ${reps}`);
            window.GlobalApp.data.gym.prs[exerciseId] = { load: parseFloat(load), reps: parseInt(reps) };
            window.GlobalApp.saveData(); 
            return true; 
        }
        return false;
    },

    // --- 2. LÓGICA DE DOUBLE PROGRESSION ---

    checkDoubleProgression: function(exerciseId, inputLoad, inputReps) {
        const pr = this.getExercisePR(exerciseId);
        const floorReps = 6; 
        
        let baseXP = 10;
        let status = "fail"; 
        let isPR = false;

        if (inputLoad > pr.load && inputReps >= floorReps) {
            baseXP = 25;
            status = "load_pr";
            isPR = true;
        }
        else if (inputLoad === pr.load && inputReps > pr.reps) {
            baseXP = 25;
            status = "reps_pr";
            isPR = true;
        }
        else if (inputLoad === pr.load && inputReps === pr.reps) {
            baseXP = 15;
            status = "maintain";
        }
        else {
            baseXP = 10;
            status = "fail";
        }

        if (isPR) {
            this.updatePR(exerciseId, inputLoad, inputReps);
        }

        return { baseXP, status, isPR };
    },

    // --- 3. CÁLCULO DE XP ---

    calculateSetXP: function(setIndex, basePerfXP, adaptActive) {
        const userLevel = window.GlobalApp.data.xp.level || 1;
        const phase = window.GlobalApp.data.gym.currentPhase || 'maintenance';
        
        const M_fase = this.config.phases[phase] || 1.0;
        const M_ordem = 1 + (0.1 * (setIndex)); 
        const M_adapt = adaptActive ? 1.5 : 1.0;

        let rawXP = (userLevel * basePerfXP) * M_fase * M_ordem * M_adapt;
        return Math.floor(rawXP);
    },

    calculateStartXP: function() {
        const userLevel = window.GlobalApp.data.xp.level || 1;
        const currentStreak = window.GlobalApp.data.gym.streak || 0;
        
        let M_streak = 1.0;
        for (const tier of this.config.streaks) {
            if (currentStreak <= tier.limit) {
                M_streak = tier.mult;
                break;
            }
        }
        return Math.floor((userLevel * 10) * M_streak);
    },

    calculateCardioXP: function(currentDist, prDist) {
        const userLevel = window.GlobalApp.data.xp.level || 1;
        const safePR = prDist > 0 ? prDist : 1; 
        
        const ratio = currentDist / safePR;
        const growthFactor = Math.pow((1 + ratio), 3);
        
        return Math.floor((userLevel * 10) * growthFactor);
    },

    calculateGodModeBonus: function() {
        const userLevel = window.GlobalApp.data.xp.level || 1;
        return userLevel * 50;
    },

    // --- 4. UTILITÁRIOS ---

    getTimerForSet: function(exercise, setIndex) {
        if (!exercise.timers || !Array.isArray(exercise.timers)) return 90;
        return exercise.timers[setIndex] || exercise.timers[exercise.timers.length - 1];
    },

    formatTime: function(seconds) {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    },

    getStatusMeta: function(status) {
        switch(status) {
            case 'load_pr': return { color: '#ffd700', icon: '🏆', label: 'NOVA CARGA MÁXIMA' };
            case 'reps_pr': return { color: '#00e676', icon: '⚡', label: 'MAIS REPETIÇÕES' };
            case 'maintain': return { color: '#29b6f6', icon: '🛡️', label: 'MANUTENÇÃO SÓLIDA' };
            default: return { color: '#ef5350', icon: '⚠️', label: 'REGRESSÃO / RECUPERAÇÃO' };
        }
    }
};
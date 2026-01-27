/**
 * GYM.JS
 * Gerenciamento de Treinos e Evolução de Cargas.
 * Módulo do Super App: Academia.
 */

window.GymManager = {
    
    container: null,

    init: function() {
        console.log("Site C: GymManager Iniciado");
        this.container = document.getElementById('gym-container');

        // Escuta o evento de dados prontos para renderizar
        document.addEventListener('SiteC_DataReady', () => {
            this.render();
        });

        // Botão de Nova Rotina
        const btnCreate = document.getElementById('btn-create-routine');
        if (btnCreate) {
            btnCreate.onclick = () => this.createRoutine();
        }
    },

    // =========================================================================
    // RENDERIZAÇÃO
    // =========================================================================
    render: function() {
        if (!this.container) return;
        const data = window.GlobalApp.data.gym;

        // Se não houver rotinas, mostra o estado vazio (Placeholder do HTML original ou customizado)
        if (!data.routines || data.routines.length === 0) {
            this.container.innerHTML = `
                <div style="text-align:center; padding:40px; color:#666; border:1px dashed #444; border-radius:8px;">
                    <h3>Nenhuma rotina criada</h3>
                    <p>Crie seus treinos (Ex: A, B, C) para começar a registrar.</p>
                </div>
            `;
            return;
        }

        // Se houver rotinas, lista elas
        let html = '<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:15px;">';
        
        data.routines.forEach((routine, index) => {
            html += `
                <div class="task-card" style="border-left-color: #ff5252; flex-direction:column; align-items:flex-start; gap:10px;">
                    <div style="width:100%; display:flex; justify-content:space-between; align-items:center;">
                        <h4 style="color:#fff; margin:0;">${routine.name}</h4>
                        <button class="icon-btn delete" onclick="window.GymManager.deleteRoutine(${index})">🗑️</button>
                    </div>
                    <div style="font-size:0.85rem; color:#888;">
                        ${routine.exercises ? routine.exercises.length : 0} exercícios configurados
                    </div>
                    <button class="action-btn" style="width:100%; margin-top:10px; background-color:#ff5252;" onclick="window.GymManager.startSession('${routine.id}')">
                        ▶️ Iniciar Treino
                    </button>
                </div>
            `;
        });

        html += '</div>';
        
        // Área de Histórico Recente (Exemplo)
        if (data.history && data.history.length > 0) {
            html += `
                <div style="margin-top:30px; border-top:1px solid #333; padding-top:15px;">
                    <h3 style="font-size:1rem; color:#aaa; margin-bottom:10px;">Histórico Recente</h3>
                    <ul style="list-style:none; font-size:0.9rem; color:#888;">
                        ${data.history.slice(-3).reverse().map(log => `
                            <li style="padding:5px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
                                ✅ <strong>${log.routineName}</strong> - ${log.date} 
                                <span style="color:var(--success-color); float:right;">+${log.xp} XP</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            `;
        }

        this.container.innerHTML = html;
    },

    // =========================================================================
    // AÇÕES
    // =========================================================================
    
    createRoutine: async function() {
        if (window.SoundManager) window.SoundManager.play('click');
        
        const name = await prompt("Nome da Rotina (ex: Treino A - Peito):");
        if (!name) return;

        if (!window.GlobalApp.data.gym.routines) window.GlobalApp.data.gym.routines = [];
        
        const newRoutine = {
            id: window.GlobalApp.generateUUID(),
            name: name,
            exercises: [], // Futuro: Lista de exercícios
            createdAt: new Date().toISOString()
        };

        window.GlobalApp.data.gym.routines.push(newRoutine);
        window.GlobalApp.saveData();
        this.render();
    },

    deleteRoutine: async function(index) {
        if (window.SoundManager) window.SoundManager.play('click');
        if (await confirm("Apagar esta rotina e seu histórico de cargas?")) {
            window.GlobalApp.data.gym.routines.splice(index, 1);
            window.GlobalApp.saveData();
            this.render();
        }
    },

    // Simulação de Início de Treino (Para testar o XP)
    startSession: async function(routineId) {
        if (window.SoundManager) window.SoundManager.play('click');
        
        const routine = window.GlobalApp.data.gym.routines.find(r => r.id === routineId);
        if (!routine) return;

        // Aqui futuramente abrirá um modal de execução de treino
        // Por enquanto, vamos simular a finalização para testar a integração global
        if (await confirm(`Iniciar sessão de "${routine.name}"?\n(Simulação: Ao confirmar, o treino será finalizado e XP gerado)`)) {
            
            // Lógica de Ganho (Exemplo)
            const xpGained = 150; 
            
            // Log no Módulo Gym
            if (!window.GlobalApp.data.gym.history) window.GlobalApp.data.gym.history = [];
            window.GlobalApp.data.gym.history.push({
                routineName: routine.name,
                date: new Date().toLocaleString(),
                xp: xpGained
            });

            // INTEGRAÇÃO GLOBAL DE XP
            if (window.XPManager) {
                window.XPManager.gainXP(xpGained, `Treino: ${routine.name}`, { type: 'gym' });
            }

            window.GlobalApp.saveData();
            this.render();
        }
    }
};

window.GymManager.init();
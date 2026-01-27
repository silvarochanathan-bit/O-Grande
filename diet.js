/**
 * DIET.JS
 * Gerenciamento de Nutrição e Hidratação.
 * Módulo do Super App: Dieta.
 */

window.DietManager = {
    
    container: null,
    headerWaterDisplay: null,

    init: function() {
        console.log("Site C: DietManager Iniciado");
        this.container = document.getElementById('diet-container');
        this.headerWaterDisplay = document.getElementById('diet-water-display');

        // Escuta o evento de dados prontos para renderizar
        document.addEventListener('SiteC_DataReady', () => {
            this.render();
        });
    },

    // =========================================================================
    // RENDERIZAÇÃO
    // =========================================================================
    render: function() {
        if (!this.container) return;
        const data = window.GlobalApp.data.diet;
        
        // Garante estrutura mínima
        if (!data.water) data.water = { current: 0, target: 3000 };
        if (!data.history) data.history = [];

        // Atualiza o display no Header do Módulo
        if (this.headerWaterDisplay) {
            const pct = Math.min(100, Math.round((data.water.current / data.water.target) * 100));
            this.headerWaterDisplay.innerHTML = `${data.water.current}ml <small style="opacity:0.7">/ ${data.water.target}ml (${pct}%)</small>`;
            
            // Muda cor se atingiu a meta
            if (data.water.current >= data.water.target) {
                this.headerWaterDisplay.style.color = '#00e676'; // Verde
            } else {
                this.headerWaterDisplay.style.color = '#fff';
            }
        }

        // Renderiza o Corpo do Módulo
        let html = `
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:20px;">
                
                <div class="task-card" style="border-left-color: #29b6f6; flex-direction:column; align-items:flex-start; gap:15px;">
                    <h3 style="margin:0; color:#29b6f6;">💧 Hidratação</h3>
                    
                    <div style="width:100%; background:rgba(0,0,0,0.3); height:15px; border-radius:10px; overflow:hidden;">
                        <div style="width:${Math.min(100, (data.water.current / data.water.target) * 100)}%; height:100%; background:#29b6f6; transition:width 0.3s;"></div>
                    </div>
                    
                    <div style="display:flex; gap:10px; width:100%;">
                        <button class="secondary-btn" style="flex:1; border-color:#29b6f6; color:#29b6f6;" onclick="window.DietManager.addWater(250)">
                            +250ml
                        </button>
                        <button class="secondary-btn" style="flex:1; border-color:#29b6f6; color:#29b6f6;" onclick="window.DietManager.addWater(500)">
                            +500ml
                        </button>
                    </div>
                </div>

                <div class="task-card" style="border-left-color: #00e676; flex-direction:column; align-items:flex-start; gap:15px;">
                    <h3 style="margin:0; color:#00e676;">🥗 Registro de Refeições</h3>
                    <p style="font-size:0.9rem; color:#888;">Mantenha o foco na dieta para gerar XP constante.</p>
                    
                    <button class="action-btn" style="width:100%; background-color:#00e676; color:#000;" onclick="window.DietManager.logMeal()">
                        🍽️ Registrar Refeição
                    </button>
                </div>

            </div>

            <div style="margin-top:30px; border-top:1px solid #333; padding-top:15px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <h3 style="font-size:1rem; color:#aaa;">Diário Alimentar (Hoje)</h3>
                    <button class="secondary-btn" style="padding:2px 8px; font-size:0.7rem;" onclick="window.DietManager.clearHistory()">Limpar</button>
                </div>
                
                <ul style="list-style:none; font-size:0.9rem; color:#888;">
                    ${data.history.length === 0 ? '<li style="font-style:italic; opacity:0.5;">Nenhuma refeição registrada hoje.</li>' : ''}
                    ${data.history.slice().reverse().map((log, idx) => `
                        <li style="padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-between;">
                            <span>${log.icon || '🍎'} <strong>${log.name}</strong> <small>(${log.time})</small></span>
                            <span style="color:var(--success-color);">+${log.xp} XP</span>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;

        this.container.innerHTML = html;
    },

    // =========================================================================
    // AÇÕES
    // =========================================================================

    addWater: function(amount) {
        if (window.SoundManager) window.SoundManager.play('click');
        
        const data = window.GlobalApp.data.diet;
        if (!data.water) data.water = { current: 0, target: 3000 };

        data.water.current += amount;
        
        // XP por beber água (pequeno incentivo)
        const xpAmount = Math.floor(amount / 50); // ex: 500ml = 10xp
        if (window.XPManager) {
            window.XPManager.gainXP(xpAmount, `Hidratação: +${amount}ml`, { type: 'diet' });
        }

        // Verifica meta diária (bônus único - lógica simplificada por enquanto)
        if (data.water.current >= data.water.target && (data.water.current - amount) < data.water.target) {
            if (window.SoundManager) window.SoundManager.play('levelup'); // Som de conquista
            alert("💧 Meta de hidratação atingida!");
            if (window.XPManager) window.XPManager.gainXP(100, "Meta de Hidratação Diária!", { type: 'diet' });
        }

        window.GlobalApp.saveData();
        this.render();
    },

    logMeal: async function() {
        if (window.SoundManager) window.SoundManager.play('click');

        const mealName = await prompt("O que você comeu? (Ex: Almoço Saudável)");
        if (!mealName) return;

        // Simulação de ganho
        const xpGained = 50;
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

        const newLog = {
            name: mealName,
            time: timeStr,
            xp: xpGained,
            icon: '🍽️'
        };

        window.GlobalApp.data.diet.history.push(newLog);
        
        if (window.XPManager) {
            window.XPManager.gainXP(xpGained, `Refeição: ${mealName}`, { type: 'diet' });
        }

        window.GlobalApp.saveData();
        this.render();
    },

    clearHistory: async function() {
        if (await confirm("Limpar histórico de refeições?")) {
            window.GlobalApp.data.diet.history = [];
            window.GlobalApp.saveData();
            this.render();
        }
    }
};

window.DietManager.init();